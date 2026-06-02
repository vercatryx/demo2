// Demo build — Client Food Service at scn.demo.poel.ai
const DEFAULT_BASE = 'https://scn.demo.poel.ai';

/** Set to `true` to always use Unite “Brooklyn” and the light blue theme (hides the Unite dropdown). */
const BROOKLYN_ONLY = false;

/** Explains the exact Unite Us pattern when the pasted URL does not match `isValidCaseUrl`. */
const CASE_URL_INCORRECT_HINT =
    'case URL — paste the full link from the address bar while you have the client\'s open case loaded in Unite Us. It must match this shape: https://app.uniteus.io/dashboard/cases/open/<case-uuid>/contact/<contact-uuid> (not a short link or a different Unite page).';

let config = { baseUrl: DEFAULT_BASE, apiKey: '' };
let statuses = [];
let navigators = [];
let currentMode = 'add-clients';
let lastLoadedSourceKey = '';
let selectedClientId = '';
let ordersLoadInFlight = false;
let addClientsInitialized = false;
let clientSearchTimeout = null;
let clientSearchSeq = 0;
let lastAutoDetectedPageKey = '';

const MODE_STORAGE_KEY = 'extensionMode';

function getConfig() {
    return {
        baseUrl: (config.baseUrl || '').replace(/\/$/, ''),
        apiKey: config.apiKey || ''
    };
}

function isBrooklynOnlyMode() {
    return BROOKLYN_ONLY;
}

function getUniteAccountQueryParam() {
    const v = getUniteAccountValue();
    if (v === 'Brooklyn' || v === 'Regular') return v;
    return null;
}

function buildUniteAccountQueryString() {
    const ua = getUniteAccountQueryParam();
    return ua ? `&uniteAccount=${encodeURIComponent(ua)}` : '';
}

function getUniteAccountValue() {
    if (isBrooklynOnlyMode()) return 'Brooklyn';
    const sel = document.getElementById('unite-account');
    return sel ? sel.value : 'Regular';
}

function updateOrdersContextUi(tabUrl) {
    const urlEl = document.getElementById('orders-case-url');
    const trimmed = (tabUrl || '').trim();
    if (!urlEl) return;

    if (isValidCaseUrl(trimmed)) {
        urlEl.textContent = `Unite Us link detected: ${trimmed}`;
    } else if (trimmed && trimmed.includes('uniteus.io')) {
        urlEl.textContent = 'Unite Us page detected — client name will auto-fill from Client Details when available.';
    } else if (trimmed) {
        urlEl.textContent = 'Not on a Unite Us case page — search for a client below.';
    } else {
        urlEl.textContent = isBrooklynOnlyMode()
            ? 'Search for a Brooklyn client below, or open their Unite Us case page.'
            : 'Search for a client below, or open a Unite Us case page.';
    }
}

function hideSearchResults() {
    const resultsEl = document.getElementById('orders-search-results');
    if (resultsEl) {
        resultsEl.style.display = 'none';
        resultsEl.innerHTML = '';
    }
}

async function searchClientsApi({ q = '', externalId = '' } = {}) {
    const { baseUrl, apiKey } = getConfig();
    if (!apiKey || !baseUrl) {
        throw new Error('Configure Base URL and API key in Settings.');
    }

    const params = new URLSearchParams({ limit: '30' });
    if (q) params.set('q', q);
    if (externalId) params.set('externalId', externalId);
    const ua = getUniteAccountQueryParam();
    if (ua) params.set('uniteAccount', ua);

    const response = await fetch(`${baseUrl}/api/extension/client-search?${params.toString()}`, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Invalid search response.');
    }

    const data = await response.json();
    if (!response.ok || !data.success) {
        throw new Error(data.error || 'Search failed.');
    }

    return data.clients || [];
}

function pickBestClientMatch(clients, preferredName) {
    if (!clients?.length) return null;
    if (clients.length === 1) return clients[0];

    const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const target = norm(preferredName);
    if (target) {
        const exact = clients.find((c) => norm(c.fullName) === target);
        if (exact) return exact;
        const starts = clients.find((c) => norm(c.fullName).startsWith(target));
        if (starts) return starts;
    }

    return null;
}

async function extractPageClientHintsFromTab() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return null;

        const response = await chrome.runtime.sendMessage({
            action: 'extractPageClientHints',
            tabId: tab.id,
        });

        if (!response?.success || !response.data) return null;
        const clientName = (response.data.clientName || '').trim();
        const clientExternalId = (response.data.clientExternalId || '').trim();
        if (!clientName && !clientExternalId) return null;
        return { clientName, clientExternalId };
    } catch (_) {
        return null;
    }
}

async function tryPrepopulateFromPage(force) {
    const hints = await extractPageClientHintsFromTab();
    if (!hints) return false;

    const { clientName, clientExternalId } = hints;
    const pageKey = `${clientExternalId}|${clientName}`;
    if (!force && pageKey === lastAutoDetectedPageKey && selectedClientId) {
        return true;
    }

    const searchInput = document.getElementById('orders-client-search');
    let clients = [];

    try {
        if (clientExternalId) {
            clients = await searchClientsApi({ externalId: clientExternalId });
        }
        if (!clients.length && clientName.length >= 2) {
            clients = await searchClientsApi({ q: clientName });
        }
    } catch (error) {
        if (searchInput && clientName) searchInput.value = clientName;
        showOrdersStatus(error.message || 'Search failed.', 'error');
        lastAutoDetectedPageKey = pageKey;
        return true;
    }

    if (searchInput && clientName) {
        searchInput.value = clientName;
    }

    lastAutoDetectedPageKey = pageKey;

    if (!clients.length) {
        showOrdersSearchPrompt();
        showOrdersStatus(
            clientName
                ? `No matching client found for "${clientName}".`
                : `No matching client found for ID ${clientExternalId}.`,
            'error'
        );
        return true;
    }

    const best = pickBestClientMatch(clients, clientName);
    if (best) {
        if (searchInput) searchInput.value = best.fullName;
        hideSearchResults();
        selectedClientId = best.id;
        await loadOrdersFromApi({ clientId: best.id, force: true });
        return true;
    }

    renderSearchResults(clients);
    showOrdersStatus(
        `${clients.length} matches for "${clientName || clientExternalId}" — select one.`,
        'info'
    );
    return true;
}

function renderSearchResults(clients) {
    const resultsEl = document.getElementById('orders-search-results');
    if (!resultsEl) return;

    if (!clients || clients.length === 0) {
        resultsEl.innerHTML = '<div class="orders-search-empty">No matching clients found.</div>';
        resultsEl.style.display = 'block';
        return;
    }

    resultsEl.innerHTML = clients.map((client) => {
        const meta = [client.serviceType, client.phoneNumber].filter(Boolean).join(' · ');
        return `
            <button type="button" class="orders-search-result" data-client-id="${escapeHtml(client.id)}">
                <div class="orders-search-result-name">${escapeHtml(client.fullName)}</div>
                ${meta ? `<div class="orders-search-result-meta">${escapeHtml(meta)}</div>` : ''}
            </button>
        `;
    }).join('');

    resultsEl.style.display = 'block';
    resultsEl.querySelectorAll('.orders-search-result').forEach((btn) => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-client-id');
            const name = btn.querySelector('.orders-search-result-name')?.textContent || '';
            if (!id) return;
            selectedClientId = id;
            const input = document.getElementById('orders-client-search');
            if (input) input.value = name;
            hideSearchResults();
            loadOrdersFromApi({ clientId: id, force: true });
        });
    });
}

async function handleClientSearchInput() {
    const input = document.getElementById('orders-client-search');
    const resultsEl = document.getElementById('orders-search-results');
    if (!input || !resultsEl) return;

    const q = input.value.trim();
    clearTimeout(clientSearchTimeout);

    if (q.length < 2) {
        hideSearchResults();
        return;
    }

    clientSearchTimeout = setTimeout(async () => {
        const seq = ++clientSearchSeq;
        resultsEl.innerHTML = '<div class="orders-search-empty">Searching…</div>';
        resultsEl.style.display = 'block';

        try {
            const clients = await searchClientsApi({ q });
            if (seq !== clientSearchSeq) return;
            renderSearchResults(clients);
        } catch (error) {
            if (seq !== clientSearchSeq) return;
            resultsEl.innerHTML = `<div class="orders-search-empty">${escapeHtml(error.message || 'Search failed.')}</div>`;
            resultsEl.style.display = 'block';
        }
    }, 300);
}

function showOrdersSearchPrompt() {
    const clientCard = document.getElementById('orders-client-card');
    const list = document.getElementById('orders-list');
    if (clientCard) clientCard.style.display = 'none';
    if (list) {
        list.innerHTML = '<div class="orders-empty">Search for a client by name to view their orders and delivery proof.</div>';
    }
    const statusEl = document.getElementById('orders-status');
    if (statusEl) statusEl.style.display = 'none';
}

/** Brooklyn-only: blue theme, Unite fixed to Brooklyn (no dropdown). */
function applyBrooklynOnlyUi() {
    const body = document.getElementById('panel-body');
    const brooklyn = isBrooklynOnlyMode();
    if (body) {
        body.classList.remove('theme-main', 'theme-brooklyn-only');
        body.classList.add(brooklyn ? 'theme-brooklyn-only' : 'theme-main');
    }
    const sel = document.getElementById('unite-account');
    const fixed = document.getElementById('unite-account-brooklyn-label');
    if (sel && fixed) {
        if (brooklyn) {
            sel.style.display = 'none';
            sel.removeAttribute('required');
            sel.disabled = true;
            sel.value = 'Brooklyn';
            fixed.style.display = 'block';
            fixed.setAttribute('aria-hidden', 'false');
        } else {
            sel.style.display = '';
            sel.disabled = false;
            fixed.style.display = 'none';
            fixed.setAttribute('aria-hidden', 'true');
            if (sel.value === 'Brooklyn') sel.value = 'Regular';
        }
    }
    const form = document.getElementById('client-form');
    if (form && form._validateForm) form._validateForm();
}

/** Labels for required-field gaps shown next to the submit buttons. */
function getSubmitMissingReasons() {
    const missing = [];
    const fullName = document.getElementById('full-name')?.value.trim() ?? '';
    const street = document.getElementById('address')?.value.trim() ?? '';
    const caseUrl = document.getElementById('case-url')?.value.trim() ?? '';
    const unite = getUniteAccountValue();

    if (!fullName) missing.push('full name');
    if (!street) missing.push('street address');
    if (unite !== 'Regular' && unite !== 'Brooklyn') missing.push('Unite account');
    if (!caseUrl) missing.push('case link');
    else if (!isValidCaseUrl(caseUrl)) missing.push(CASE_URL_INCORRECT_HINT);

    return missing;
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadConfig();
    await loadSavedMode();
    await validateAndInitialize();
    setupEventListeners();
    setupTabUrlListener();
});

// Load configuration from storage (with migration from old multi-connection keys)
async function loadConfig() {
    const result = await chrome.storage.sync.get([
        'config', 'configMain', 'configBrooklyn', 'activeConnection',
        'apiKey', 'baseUrl'
    ]);
    if (result.config && typeof result.config === 'object') {
        config = {
            baseUrl: result.config.baseUrl || DEFAULT_BASE,
            apiKey: result.config.apiKey || ''
        };
    } else if (result.configMain && typeof result.configMain === 'object') {
        config = {
            baseUrl: result.configMain.baseUrl || DEFAULT_BASE,
            apiKey: result.configMain.apiKey || ''
        };
        await chrome.storage.sync.set({ config });
    }
    if (result.apiKey || result.baseUrl) {
        const hasNew = config.apiKey && config.baseUrl;
        if (!hasNew) {
            config = {
                baseUrl: (result.baseUrl || '').trim() || DEFAULT_BASE,
                apiKey: (result.apiKey || '').trim()
            };
            await chrome.storage.sync.set({ config });
        }
    }
    applyBrooklynOnlyUi();
}

async function loadSavedMode() {
    try {
        const result = await chrome.storage.sync.get([MODE_STORAGE_KEY]);
        if (result[MODE_STORAGE_KEY] === 'review-orders' || result[MODE_STORAGE_KEY] === 'add-clients') {
            currentMode = result[MODE_STORAGE_KEY];
        }
    } catch (_) {
        // ignore
    }
}

function applyModeUi() {
    const formSection = document.getElementById('form-section');
    const ordersSection = document.getElementById('orders-section');
    const addBtn = document.getElementById('mode-add-clients');
    const reviewBtn = document.getElementById('mode-review-orders');
    const title = document.getElementById('panel-title');
    const isReview = currentMode === 'review-orders';

    if (formSection) formSection.style.display = isReview ? 'none' : 'block';
    if (ordersSection) ordersSection.style.display = isReview ? 'flex' : 'none';
    if (title) title.textContent = isReview ? 'Review Orders' : 'Add New Client';

    if (addBtn) {
        addBtn.classList.toggle('mode-btn-active', !isReview);
        addBtn.setAttribute('aria-selected', !isReview ? 'true' : 'false');
    }
    if (reviewBtn) {
        reviewBtn.classList.toggle('mode-btn-active', isReview);
        reviewBtn.setAttribute('aria-selected', isReview ? 'true' : 'false');
    }
}

async function ensureAddClientsReady() {
    if (addClientsInitialized) return;
    addClientsInitialized = true;
    await loadStatuses();
    await loadNavigators();
    await loadProduceVendorOptions();
    setupFormValidation();
    setupAutoGeocode();
    setupManualGeocode();
}

async function setMode(mode) {
    if (mode !== 'add-clients' && mode !== 'review-orders') return;
    currentMode = mode;
    applyModeUi();
    try {
        await chrome.storage.sync.set({ [MODE_STORAGE_KEY]: mode });
    } catch (_) {
        // ignore
    }

    if (mode === 'review-orders') {
        await loadOrdersForCurrentTab(true);
    } else {
        await ensureAddClientsReady();
    }
}

function setupTabUrlListener() {
    chrome.runtime.onMessage.addListener((message) => {
        if (message?.action === 'tabUrlChanged' && currentMode === 'review-orders') {
            handleReviewOrdersTabChange(message.url);
        }
    });
}

async function handleReviewOrdersTabChange(tabUrl) {
    updateOrdersContextUi(tabUrl);
    if (isValidCaseUrl(tabUrl)) {
        selectedClientId = '';
        lastAutoDetectedPageKey = '';
        const searchInput = document.getElementById('orders-client-search');
        if (searchInput) searchInput.value = '';
        hideSearchResults();
        await loadOrdersFromApi({ caseUrl: tabUrl, force: false });
        return;
    }

    selectedClientId = '';
    lastLoadedSourceKey = '';
    await tryPrepopulateFromPage(false);
}

function formatOrderDate(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (_) {
        return iso;
    }
}

function formatStatusLabel(status) {
    if (!status) return 'Unknown';
    return String(status).replace(/_/g, ' ');
}

function statusClassName(status) {
    const s = String(status || '').toLowerCase();
    if (s === 'completed' || s === 'billing_pending') return 'order-status-completed';
    if (s === 'pending' || s === 'scheduled') return 'order-status-pending';
    if (s === 'cancelled' || s === 'canceled') return 'order-status-cancelled';
    return 'order-status-other';
}

function isImageProofUrl(url) {
    if (!url) return false;
    return /\.(jpe?g|png|gif|webp|bmp)(\?|$)/i.test(url) || url.includes('/storage/v1/object/');
}

function renderProofSection(order) {
    const urls = (order.proofUrls && order.proofUrls.length)
        ? order.proofUrls
        : (order.proofUrl ? [order.proofUrl] : []);

    if (!urls.length) {
        return '<div class="order-proof"><div class="order-proof-label">Proof of delivery</div><div class="order-proof-missing">No proof attached</div></div>';
    }

    const parts = urls.map((url, idx) => {
        const safeUrl = escapeHtml(url);
        const label = urls.length > 1 ? `Proof ${idx + 1}` : 'Proof of delivery';
        if (isImageProofUrl(url)) {
            return `<div class="order-proof"><div class="order-proof-label">${label}</div><a href="${safeUrl}" target="_blank" rel="noopener noreferrer"><img class="order-proof-thumb" src="${safeUrl}" alt="Delivery proof"></a></div>`;
        }
        return `<div class="order-proof"><div class="order-proof-label">${label}</div><a class="order-proof-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer">Open proof</a></div>`;
    });

    return parts.join('');
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function renderClientCard(client, dependentCount) {
    const card = document.getElementById('orders-client-card');
    if (!card) return;

    const flags = [];
    if (client.paused) flags.push('Paused');
    if (client.bill === false) flags.push('No bill');
    if (client.delivery === false) flags.push('No delivery');

    card.innerHTML = `
        <h2>${escapeHtml(client.fullName || 'Unknown client')}</h2>
        <div class="orders-client-meta">
            <span>Service: ${escapeHtml(client.serviceType || '—')}</span>
            ${client.phoneNumber ? `<span>Phone: ${escapeHtml(client.phoneNumber)}</span>` : ''}
            ${dependentCount > 0 ? `<span>Dependents: ${dependentCount}</span>` : ''}
            ${flags.length ? `<span>${escapeHtml(flags.join(' · '))}</span>` : ''}
        </div>
    `;
    card.style.display = 'block';
}

function renderOrdersList(orders) {
    const list = document.getElementById('orders-list');
    if (!list) return;

    if (!orders || orders.length === 0) {
        list.innerHTML = '<div class="orders-empty">No orders found for this client.</div>';
        return;
    }

    list.innerHTML = orders.map((order) => {
        const dateLabel = formatOrderDate(order.actualDeliveryDate || order.scheduledDeliveryDate || order.createdAt);
        const orderLabel = order.orderNumber != null ? `#${order.orderNumber}` : 'Order';
        const clientLine = order.clientName ? `<span>${escapeHtml(order.clientName)}</span>` : '';

        return `
            <article class="order-card">
                <div class="order-card-header">
                    <div class="order-card-title">${escapeHtml(orderLabel)} · ${escapeHtml(order.serviceType || '—')}</div>
                    <div class="order-card-date">${escapeHtml(dateLabel)}</div>
                </div>
                <div class="order-card-details">
                    <span class="order-status ${statusClassName(order.status)}">${escapeHtml(formatStatusLabel(order.status))}</span>
                    ${clientLine}
                </div>
                ${renderProofSection(order)}
            </article>
        `;
    }).join('');
}

function showOrdersStatus(message, type) {
    showStatus('orders-status', message, type);
}

async function getActiveTabUrl() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.url || '';
}

async function loadOrdersForCurrentTab(force) {
    const tabUrl = await getActiveTabUrl();
    updateOrdersContextUi(tabUrl);

    if (isValidCaseUrl(tabUrl)) {
        selectedClientId = '';
        lastAutoDetectedPageKey = '';
        const searchInput = document.getElementById('orders-client-search');
        if (searchInput) searchInput.value = '';
        hideSearchResults();
        await loadOrdersFromApi({ caseUrl: tabUrl, force });
        return;
    }

    if (await tryPrepopulateFromPage(force)) {
        return;
    }

    if (selectedClientId) {
        await loadOrdersFromApi({ clientId: selectedClientId, force });
        return;
    }

    showOrdersSearchPrompt();
}

async function loadOrdersFromApi({ caseUrl = '', clientId = '', force = false } = {}) {
    const refreshBtn = document.getElementById('orders-refresh-btn');
    const clientCard = document.getElementById('orders-client-card');
    const list = document.getElementById('orders-list');

    if (currentMode !== 'review-orders') return;

    const sourceKey = clientId ? `id:${clientId}` : `url:${(caseUrl || '').trim()}`;
    if (!sourceKey || sourceKey === 'url:') {
        showOrdersSearchPrompt();
        return;
    }

    if (!force && sourceKey === lastLoadedSourceKey) return;
    if (ordersLoadInFlight) return;

    const { baseUrl, apiKey } = getConfig();
    if (!apiKey || !baseUrl) {
        showOrdersStatus('Configure Base URL and API key in Settings.', 'error');
        return;
    }

    ordersLoadInFlight = true;
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Loading…';
    }
    showOrdersStatus('Loading client and orders…', 'info');

    try {
        let apiUrl = `${baseUrl}/api/extension/client-orders?limit=25${buildUniteAccountQueryString()}`;
        if (clientId) {
            apiUrl += `&clientId=${encodeURIComponent(clientId)}`;
        } else {
            apiUrl += `&caseUrl=${encodeURIComponent(caseUrl.trim())}`;
        }

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Invalid response from server. Check your Base URL.');
        }

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401) throw new Error('Invalid API key. Check Settings.');
            if (response.status === 404) {
                if (clientCard) clientCard.style.display = 'none';
                if (list) {
                    list.innerHTML = clientId
                        ? '<div class="orders-empty">Client not found. Try searching again.</div>'
                        : '<div class="orders-empty">No client found for this Unite Us link.</div>';
                }
                showOrdersStatus(data.error || 'Client not found.', 'error');
                lastLoadedSourceKey = sourceKey;
                return;
            }
            throw new Error(data.error || `Request failed (${response.status})`);
        }

        if (!data.success) throw new Error(data.error || 'Failed to load orders');

        lastLoadedSourceKey = sourceKey;
        if (clientId) selectedClientId = clientId;
        renderClientCard(data.client, data.dependentCount || 0);
        renderOrdersList(data.orders || []);
        const count = (data.orders || []).length;
        showOrdersStatus(`${count} order${count === 1 ? '' : 's'} loaded.`, 'success');
    } catch (error) {
        console.error('Review orders error:', error);
        if (clientCard) clientCard.style.display = 'none';
        if (list) list.innerHTML = '';
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showOrdersStatus('No internet connection.', 'error');
        } else {
            showOrdersStatus(error.message || 'Failed to load orders.', 'error');
        }
    } finally {
        ordersLoadInFlight = false;
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.textContent = 'Refresh';
        }
    }
}

// Validate API key and initialize
async function validateAndInitialize() {
    const validationSection = document.getElementById('validation-section');
    const errorSection = document.getElementById('error-section');
    const formSection = document.getElementById('form-section');
    const ordersSection = document.getElementById('orders-section');

    // Show validation spinner
    validationSection.style.display = 'flex';
    errorSection.style.display = 'none';
    formSection.style.display = 'none';
    if (ordersSection) ordersSection.style.display = 'none';

    const { baseUrl, apiKey } = getConfig();

    if (!apiKey || !baseUrl) {
        validationSection.style.display = 'none';
        errorSection.style.display = 'flex';
        document.getElementById('error-text').textContent =
            'Connection is not configured. Please open Settings to set Base URL and API Key.';
        return;
    }

    // Validate API key by trying to fetch statuses
    try {
        const url = `${baseUrl}/api/extension/statuses`;
        console.log('Attempting to connect to:', url);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('Response status:', response.status);
        console.log('Response headers:', Object.fromEntries(response.headers.entries()));

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            // Try to get the response text to see what we got
            const text = await response.text();
            console.error('Non-JSON response received:', text.substring(0, 200));
            
            // Got HTML instead of JSON - likely wrong URL or server error
            if (response.status === 404) {
                throw new Error('API endpoint not found. Please check your Base URL is correct.');
            }
            throw new Error('Server returned an error page. Please check your Base URL and ensure the server is running.');
        }

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Invalid API key. Please check your API key in Settings.');
            }
            if (response.status === 500) {
                try {
                    const data = await response.json();
                    if (data.error && data.error.includes('not configured')) {
                        throw new Error('API key is not configured on the server. Please contact the administrator.');
                    }
                } catch (e) {
                    // If we can't parse JSON, it's a server error
                    throw new Error('Server error. Please check your Base URL and ensure the server is running.');
                }
            }
            throw new Error(`Failed to validate connection: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Failed to validate API key');
        }

        // API key is valid, show active mode and load data
        validationSection.style.display = 'none';
        errorSection.style.display = 'none';
        applyModeUi();

        const uniteAccountSelect = document.getElementById('unite-account');
        if (uniteAccountSelect) {
            uniteAccountSelect.value = isBrooklynOnlyMode() ? 'Brooklyn' : 'Regular';
        }
        applyBrooklynOnlyUi();

        if (currentMode === 'add-clients') {
            await ensureAddClientsReady();
        } else {
            await loadOrdersForCurrentTab(true);
        }
    } catch (error) {
        console.error('Validation error:', error);
        validationSection.style.display = 'none';
        errorSection.style.display = 'flex';
        
        // Handle network errors (no internet)
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            document.getElementById('error-text').textContent = 
                'No internet connection. Please check your network connection and try again.';
        } else if (error.message.includes('JSON')) {
            // HTML response instead of JSON
            document.getElementById('error-text').textContent = 
                'Invalid response from server. Please check your Base URL is correct and points to the right server.';
        } else {
            document.getElementById('error-text').textContent = error.message;
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    document.getElementById('mode-add-clients')?.addEventListener('click', () => {
        setMode('add-clients');
    });

    document.getElementById('mode-review-orders')?.addEventListener('click', () => {
        setMode('review-orders');
    });

    document.getElementById('orders-refresh-btn')?.addEventListener('click', () => {
        lastLoadedSourceKey = '';
        loadOrdersForCurrentTab(true);
    });

    document.getElementById('orders-client-search')?.addEventListener('input', handleClientSearchInput);
    document.getElementById('orders-client-search')?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') hideSearchResults();
    });

    // Settings button
    document.getElementById('settings-btn').addEventListener('click', () => {
        openSettings();
    });

    // Open settings from error section
    document.getElementById('open-settings-btn').addEventListener('click', () => {
        openSettings();
    });

    // Close settings modal
    document.getElementById('close-settings').addEventListener('click', () => {
        closeSettings();
    });

    // Save settings
    document.getElementById('save-settings').addEventListener('click', async () => {
        await saveSettings();
    });

    // Test Main connection
    document.getElementById('test-main').addEventListener('click', async () => {
        await testConnection();
    });

    // Form submission
    document.getElementById('client-form').addEventListener('submit', handleSubmit);

    // Geocode button
    document.getElementById('geocode-btn').addEventListener('click', () => {
        autoGeocode(true);
    });

    // Auto fill button
    document.getElementById('auto-fill-btn').addEventListener('click', handleAutoFill);

    // Show/hide auth units field based on service type (Food only)
    const serviceTypeSelect = document.getElementById('service-type');
    if (serviceTypeSelect) {
        serviceTypeSelect.addEventListener('change', function() {
            const authUnitsGroup = document.getElementById('auth-units-group');
            const authUnitsInput = document.getElementById('auth-units');
            if (authUnitsGroup) {
                if (this.value === 'Food') {
                    authUnitsGroup.style.display = 'block';
                } else {
                    authUnitsGroup.style.display = 'none';
                    if (authUnitsInput) authUnitsInput.value = '';
                }
            }
            // Food → produce vendor: default Delivery off (user can re-check)
            const prev = this.dataset.prevServiceType || 'Food';
            if (prev === 'Food' && this.value.startsWith('produce:')) {
                const deliveryFlag = document.getElementById('flag-delivery');
                if (deliveryFlag) deliveryFlag.checked = false;
            }
            this.dataset.prevServiceType = this.value;
            const form = document.getElementById('client-form');
            if (form && form._validateForm) form._validateForm();
        });
    }

    // Close modal when clicking outside
    document.getElementById('settings-modal').addEventListener('click', (e) => {
        if (e.target.id === 'settings-modal') {
            closeSettings();
        }
    });
}

// Open settings modal
function openSettings() {
    const modal = document.getElementById('settings-modal');
    document.getElementById('settings-main-base-url').value = config.baseUrl || '';
    document.getElementById('settings-main-api-key').value = config.apiKey || '';
    document.getElementById('settings-status').style.display = 'none';
    document.getElementById('settings-main-status').style.display = 'none';
    document.getElementById('settings-main-status').textContent = '';
    modal.style.display = 'flex';
}

// Close settings modal
function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

// Save settings
async function saveSettings() {
    const baseUrl = document.getElementById('settings-main-base-url').value.trim().replace(/\/$/, '') || DEFAULT_BASE;
    const apiKey = document.getElementById('settings-main-api-key').value.trim();

    config = { baseUrl, apiKey };

    await chrome.storage.sync.set({ config });
    showStatus('settings-status', 'Settings saved! Validating...', 'success');

    setTimeout(async () => {
        closeSettings();
        await validateAndInitialize();
    }, 1000);
}

// Test connection
async function testConnection() {
    const baseId = 'settings-main';
    const testApiKey = document.getElementById(`${baseId}-api-key`).value.trim();
    const testBaseUrl = document.getElementById(`${baseId}-base-url`).value.trim().replace(/\/$/, '');

    if (!testApiKey || !testBaseUrl) {
        showStatus(`${baseId}-status`, 'Please enter both API key and Base URL', 'error');
        document.getElementById(`${baseId}-status`).style.display = 'block';
        return;
    }

    const statusEl = document.getElementById(`${baseId}-status`);
    statusEl.textContent = 'Testing connection...';
    statusEl.className = 'status-message info';
    statusEl.style.display = 'block';

    try {
        const response = await fetch(`${testBaseUrl}/api/extension/statuses`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${testApiKey}`,
                'Content-Type': 'application/json'
            }
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            if (response.status === 404) {
                throw new Error('API endpoint not found. Check Base URL.');
            }
            throw new Error('Server returned an error page. Check Base URL and server.');
        }

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Invalid API key');
            }
            if (response.status === 500) {
                try {
                    const data = await response.json();
                    if (data.error && data.error.includes('not configured')) {
                        throw new Error('API key is not configured on the server');
                    }
                } catch (e) {
                    if (e.message && e.message.includes('not configured')) throw e;
                    throw new Error('Server error. Check Base URL and server.');
                }
            }
            throw new Error(`Connection failed: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.error || 'Connection test failed');
        }

        statusEl.textContent = '✓ Connection successful!';
        statusEl.className = 'status-message success';
    } catch (error) {
        console.error('Connection test error:', error);
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            statusEl.textContent = 'No internet connection.';
        } else if (error.message.includes('JSON') || error.message.includes('DOCTYPE')) {
            statusEl.textContent = 'Invalid response. Check Base URL.';
        } else {
            statusEl.textContent = `Failed: ${error.message}`;
        }
        statusEl.className = 'status-message error';
    }
}

// Load statuses from API
async function loadStatuses() {
    const { baseUrl, apiKey } = getConfig();
    try {
        const response = await fetch(`${baseUrl}/api/extension/statuses`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Invalid response from server. Please check your Base URL.');
        }

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Invalid API key. Please check your configuration.');
            }
            throw new Error(`Failed to load statuses: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.success && data.statuses) {
            statuses = data.statuses;
            const statusSelect = document.getElementById('status');
            statusSelect.innerHTML = '<option value="">Select a status</option>';
            statuses.forEach(status => {
                const option = document.createElement('option');
                option.value = status.id;
                option.textContent = status.name;
                statusSelect.appendChild(option);
            });
            
            // Set default to "Active" if available
            const activeStatus = statuses.find(s => s.name.toLowerCase() === 'active');
            if (activeStatus) {
                statusSelect.value = activeStatus.id;
                // Trigger validation update
                if (typeof setupFormValidation === 'function') {
                    statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        } else {
            throw new Error(data.error || 'Failed to load statuses');
        }
    } catch (error) {
        console.error('Error loading statuses:', error);
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showStatus('form-status', 'No internet connection. Please check your network.', 'error');
        } else {
            showStatus('form-status', error.message, 'error');
        }
        const statusSelect = document.getElementById('status');
        statusSelect.innerHTML = '<option value="">Error loading statuses</option>';
    }
}

/** Fill service dropdown: Food + active produce vendors from API */
async function loadProduceVendorOptions() {
    const sel = document.getElementById('service-type');
    if (!sel) return;

    const { baseUrl, apiKey } = getConfig();
    try {
        const response = await fetch(`${baseUrl}/api/extension/produce-vendors`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Invalid response when loading produce vendors');
        }

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to load produce vendors');
        }

        const vendors = data.produceVendors || [];
        sel.innerHTML = '';

        const foodOpt = document.createElement('option');
        foodOpt.value = 'Food';
        foodOpt.textContent = 'Food';
        sel.appendChild(foodOpt);

        vendors.forEach((v) => {
            const o = document.createElement('option');
            o.value = `produce:${v.id}`;
            o.textContent = v.name;
            sel.appendChild(o);
        });

        sel.value = 'Food';
        sel.dataset.prevServiceType = 'Food';
        const authUnitsGroup = document.getElementById('auth-units-group');
        if (authUnitsGroup) authUnitsGroup.style.display = 'block';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (err) {
        console.error('loadProduceVendorOptions:', err);
        sel.innerHTML = '';
        const foodOpt = document.createElement('option');
        foodOpt.value = 'Food';
        foodOpt.textContent = 'Food';
        sel.appendChild(foodOpt);
        sel.value = 'Food';
        sel.dataset.prevServiceType = 'Food';
        const authUnitsGroup = document.getElementById('auth-units-group');
        if (authUnitsGroup) authUnitsGroup.style.display = 'block';
        showStatus(
            'form-status',
            (err && err.message) || 'Could not load produce vendors. You can still add Food clients.',
            'error'
        );
    }
}

// Load navigators from API
async function loadNavigators() {
    const { baseUrl, apiKey } = getConfig();
    try {
        const response = await fetch(`${baseUrl}/api/extension/navigators`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Invalid response from server. Please check your Base URL.');
        }

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Invalid API key. Please check your configuration.');
            }
            throw new Error(`Failed to load navigators: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.success && data.navigators) {
            navigators = data.navigators;
            const navigatorSelect = document.getElementById('navigator');
            navigatorSelect.innerHTML = '<option value="">Select a navigator</option>';
            navigators.forEach(navigator => {
                const option = document.createElement('option');
                option.value = navigator.id;
                option.textContent = navigator.name;
                navigatorSelect.appendChild(option);
            });
            
            // Set default to "Orit Fried" if available
            const oritNavigator = navigators.find(n => n.name.toLowerCase().includes('orit fried'));
            if (oritNavigator) {
                navigatorSelect.value = oritNavigator.id;
                // Trigger validation update
                if (typeof setupFormValidation === 'function') {
                    navigatorSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        } else {
            throw new Error(data.error || 'Failed to load navigators');
        }
    } catch (error) {
        console.error('Error loading navigators:', error);
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showStatus('form-status', 'No internet connection. Please check your network.', 'error');
        } else {
            showStatus('form-status', error.message, 'error');
        }
        const navigatorSelect = document.getElementById('navigator');
        navigatorSelect.innerHTML = '<option value="">Error loading navigators</option>';
        // Re-validate form after error
        setupFormValidation();
    }
}

// Handle form submission
async function handleSubmit(e) {
    e.preventDefault();

    const formEl = document.getElementById('client-form');
    if (!formEl._validateForm || !formEl._validateForm()) {
        return;
    }

    const submitBtn = document.getElementById('submit-btn');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
    }

    try {
        const serviceRaw = document.getElementById('service-type').value;
        let serviceType = 'Food';
        let produceVendorIdForApi = null;
        if (serviceRaw.startsWith('produce:')) {
            serviceType = 'Produce';
            produceVendorIdForApi = serviceRaw.slice('produce:'.length);
        }

        const depRaw = (document.getElementById('dependents-count') && document.getElementById('dependents-count').value) || '0';
        const dependentCount = Math.min(50, Math.max(0, parseInt(String(depRaw).trim(), 10) || 0));
        
        // Get address components
        const streetAddress = document.getElementById('address').value.trim();
        const apt = document.getElementById('apt').value.trim() || null;
        const city = document.getElementById('city').value.trim();
        const state = document.getElementById('state').value.trim().toUpperCase();
        const zip = document.getElementById('zip').value.trim();
        const county = document.getElementById('county').value.trim() || null;
        
        // Combine address for API (legacy format)
        let fullAddress = streetAddress;
        if (apt) {
            fullAddress += `, ${apt}`;
        }
        if (city) {
            fullAddress += `, ${city}`;
        }
        if (state) {
            fullAddress += `, ${state}`;
        }
        if (zip) {
            fullAddress += ` ${zip}`;
        }
        
        const authorizedAmountValue = document.getElementById('authorized-amount').value.trim();
        const expirationDateValue = document.getElementById('expiration-date').value.trim();
        const dobValue = document.getElementById('dob') && document.getElementById('dob').value
            ? document.getElementById('dob').value.trim()
            : '';

        const formData = {
            fullName: document.getElementById('full-name').value.trim(),
            statusId: document.getElementById('status').value,
            navigatorId: document.getElementById('navigator').value,
            uniteAccount: getUniteAccountValue(),
            address: fullAddress,
            apt: apt,
            city: city,
            state: state,
            zip: zip,
            county: county,
            phone: document.getElementById('phone').value.trim(),
            secondaryPhone: document.getElementById('secondary-phone').value.trim() || null,
            email: document.getElementById('email').value.trim() || null,
            dislikes: document.getElementById('notes').value.trim() || null,
            serviceType: serviceType,
            caseId: document.getElementById('case-url').value.trim(),
            approvedMealsPerWeek: serviceType === 'Food' ? 21 : 0,
            authorizedAmount: authorizedAmountValue ? parseFloat(authorizedAmountValue) : null,
            expirationDate: expirationDateValue || null,
            dob: dobValue || null,
            // Include geocoding coordinates if available
            latitude: window.geocodeLat || null,
            longitude: window.geocodeLng || null,
            lat: window.geocodeLat || null,
            lng: window.geocodeLng || null,
            // Client flags (defaults: paused false, complex false, bill true, delivery true)
            paused: document.getElementById('flag-paused').checked,
            complex: document.getElementById('flag-complex').checked,
            bill: document.getElementById('flag-bill').checked,
            delivery: document.getElementById('flag-delivery').checked,
            dependentCount,
            produceVendorId: produceVendorIdForApi
        };

        const uniteVal = getUniteAccountValue();
        if (uniteVal !== 'Regular' && uniteVal !== 'Brooklyn') {
            throw new Error('Unite account is required.');
        }

        if (!formData.caseId) {
            throw new Error('Case URL is required.');
        }
        if (!isValidCaseUrl(formData.caseId)) {
            throw new Error(CASE_URL_INCORRECT_HINT);
        }

        if (!formData.fullName || !streetAddress) {
            throw new Error('Full name and street address are required.');
        }

        const { baseUrl, apiKey } = getConfig();
        const response = await fetch(`${baseUrl}/api/extension/create-client`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        // Check if response is JSON
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            if (response.status === 401) {
                throw new Error('Invalid API key. Please check your API key in Settings.');
            }
            throw new Error('Invalid response from server. Please check your Base URL and ensure the server is running.');
        }

        const data = await response.json();

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error('Invalid API key. Please check your API key in Settings.');
            }
            throw new Error(data.error || 'Failed to create client');
        }

        if (data.success) {
            const depN = typeof data.dependentsCreated === 'number' ? data.dependentsCreated : 0;
            const depMsg = depN > 0 ? ` and ${depN} placeholder dependent${depN === 1 ? '' : 's'}` : '';
            showStatus('form-status', `Client "${formData.fullName}" created successfully${depMsg}!`, 'success');
            // Reset form
            document.getElementById('client-form').reset();
            // Clear geocode coordinates and reset geocode UI
            window.geocodeLat = null;
            window.geocodeLng = null;
            hideManualGeocodeFields();
            const manualSection = document.getElementById('manual-geocode-section');
            if (manualSection) manualSection.style.display = 'none';
            updateGeocodeUI('idle', '');
            // Reset status and navigator dropdowns to defaults
            const statusSelect = document.getElementById('status');
            const navigatorSelect = document.getElementById('navigator');
            
            // Set default status to "Active" if available
            const activeStatus = statuses.find(s => s.name.toLowerCase() === 'active');
            if (activeStatus) {
                statusSelect.value = activeStatus.id;
            } else {
                statusSelect.selectedIndex = 0;
            }
            
            // Set default navigator to "Orit Fried" if available
            const oritNavigator = navigators.find(n => n.name.toLowerCase().includes('orit fried'));
            if (oritNavigator) {
                navigatorSelect.value = oritNavigator.id;
            } else {
                navigatorSelect.selectedIndex = 0;
            }
            // Reset Unite Account to default
            const uniteAccountSelect = document.getElementById('unite-account');
            if (uniteAccountSelect) {
                uniteAccountSelect.value = isBrooklynOnlyMode() ? 'Brooklyn' : 'Regular';
            }
            applyBrooklynOnlyUi();
            // Reset service type + dependents; show auth units when Food
            const serviceTypeEl = document.getElementById('service-type');
            if (serviceTypeEl && serviceTypeEl.querySelector('option[value="Food"]')) {
                serviceTypeEl.value = 'Food';
                serviceTypeEl.dataset.prevServiceType = 'Food';
            }
            const depInput = document.getElementById('dependents-count');
            if (depInput) depInput.value = '0';
            const authUnitsGroup = document.getElementById('auth-units-group');
            if (authUnitsGroup) authUnitsGroup.style.display = 'block';
            // Reset flags to defaults (Paused off, Complex off, Bill on, Delivery on)
            document.getElementById('flag-paused').checked = false;
            document.getElementById('flag-complex').checked = false;
            document.getElementById('flag-bill').checked = true;
            document.getElementById('flag-delivery').checked = true;
            // Re-validate form (will disable submit button)
            setupFormValidation();
        } else {
            throw new Error(data.error || 'Failed to create client');
        }
    } catch (error) {
        console.error('Error creating client:', error);
        
        // Handle network errors (no internet)
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showStatus('form-status', 'No internet connection. Please check your network connection and try again.', 'error');
        } else if (error.message.includes('JSON') || error.message.includes('DOCTYPE')) {
            // HTML response instead of JSON
            showStatus('form-status', 'Invalid response from server. Please check your Base URL is correct.', 'error');
        } else {
            showStatus('form-status', error.message, 'error');
        }
    } finally {
        if (submitBtn) submitBtn.textContent = 'Submit';
        if (formEl && formEl._validateForm) formEl._validateForm();
    }
}

// Show status message
function showStatus(elementId, message, type) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.className = `status-message ${type}`;
    element.style.display = 'block';

    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            element.style.display = 'none';
        }, 5000);
    }
}

// Handle auto fill from current page
async function handleAutoFill() {
    const autoFillBtn = document.getElementById('auto-fill-btn');
    autoFillBtn.disabled = true;
    autoFillBtn.textContent = 'Extracting data...';

    try {
        // Get current active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab || !tab.url) {
            throw new Error('Could not access current tab. Please make sure you are on the correct page.');
        }

        // Extract case ID from URL
        const caseId = tab.url;

        // Use background script to inject and extract data
        const response = await chrome.runtime.sendMessage({
            action: 'extractContactData',
            tabId: tab.id
        });

        if (!response || !response.success) {
            throw new Error(response?.error || 'Could not extract data from the page. Please make sure you are on a page with contact information.');
        }

        const data = response.data;
        
        if (!data) {
            throw new Error('Could not extract data from the page. Please make sure you are on a page with contact information.');
        }

        // Fill in the form fields
        if (data.fullName) {
            document.getElementById('full-name').value = data.fullName;
        }
        
        // Fill address fields
        if (data.address) {
            document.getElementById('address').value = data.address;
        }
        if (data.apt) {
            document.getElementById('apt').value = data.apt;
        }
        if (data.city) {
            document.getElementById('city').value = data.city;
        }
        if (data.state) {
            document.getElementById('state').value = data.state;
        }
        if (data.zip) {
            document.getElementById('zip').value = data.zip;
        }
        if (data.county) {
            document.getElementById('county').value = data.county;
        }
        
        if (data.phone) {
            document.getElementById('phone').value = data.phone;
        }
        if (data.authorizedAmount !== undefined && data.authorizedAmount !== null) {
            document.getElementById('authorized-amount').value = data.authorizedAmount;
        }
        if (data.expirationDate) {
            document.getElementById('expiration-date').value = data.expirationDate;
        }
        if (data.dob) {
            const dobInput = document.getElementById('dob');
            if (dobInput) dobInput.value = data.dob;
        }
        if (caseId) {
            document.getElementById('case-url').value = caseId;
        }

        // Trigger input events to update validation and auto-geocode
        const addressFields = ['full-name', 'address', 'apt', 'city', 'state', 'zip', 'county', 'phone', 'authorized-amount', 'expiration-date', 'dob', 'case-url'];
        addressFields.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        
        // Auto-geocode after a short delay to allow all fields to be filled
        setTimeout(() => {
            autoGeocode();
        }, 500);

        showStatus('auto-fill-status', 'Data extracted successfully!', 'success');
    } catch (error) {
        console.error('Auto fill error:', error);
        showStatus('auto-fill-status', error.message || 'Failed to extract data from page', 'error');
    } finally {
        autoFillBtn.disabled = false;
        autoFillBtn.innerHTML = 'Auto Fill from Page';
    }
}


// Validate case URL format
function isValidCaseUrl(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    
    // Expected format: https://app.uniteus.io/dashboard/cases/open/{uuid}/contact/{uuid}
    const pattern = /^https:\/\/app\.uniteus\.io\/dashboard\/cases\/open\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/contact\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return pattern.test(url.trim());
}

function setupFormValidation() {
    const form = document.getElementById('client-form');
    const submitBtn = document.getElementById('submit-btn');
    const readiness = document.getElementById('submit-readiness');

    function validateForm() {
        const missing = getSubmitMissingReasons();
        const ready = missing.length === 0;
        if (submitBtn) submitBtn.disabled = !ready;
        if (readiness) {
            readiness.textContent = ready
                ? ''
                : 'Still needed: ' + missing.join('; ') + '.';
            readiness.className = 'submit-readiness ' + (ready ? 'submit-readiness-ready' : 'submit-readiness-pending');
        }
        return ready;
    }

    form._validateForm = validateForm;

    if (!form._submitValidationBound) {
        form._submitValidationBound = true;
        const revalidateIds = ['full-name', 'address', 'case-url', 'unite-account'];
        revalidateIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                const run = () => {
                    const f = document.getElementById('client-form');
                    if (f && f._validateForm) f._validateForm();
                };
                el.addEventListener('input', run);
                el.addEventListener('change', run);
            }
        });
    }

    validateForm();
}

// Update geocode status UI (idle | loading | success | error)
function updateGeocodeUI(state, message) {
    const el = document.getElementById('geocode-status');
    const btn = document.getElementById('geocode-btn');
    const manualSection = document.getElementById('manual-geocode-section');
    if (!el) return;
    el.textContent = message || '';
    el.className = 'geocode-status ' + (state || 'idle');
    const hasStreet = !!document.getElementById('address').value.trim();
    if (btn) btn.disabled = !hasStreet;

    if (manualSection) {
        if (state === 'error') {
            manualSection.style.display = 'block';
        } else if (state === 'success') {
            manualSection.style.display = 'none';
            hideManualGeocodeFields();
        }
    }
}

function hideManualGeocodeFields() {
    const fields = document.getElementById('manual-geocode-fields');
    const toggle = document.getElementById('manual-geocode-toggle');
    if (fields) fields.style.display = 'none';
    if (toggle) toggle.textContent = 'Enter coordinates manually';
    const latInput = document.getElementById('manual-lat');
    const lngInput = document.getElementById('manual-lng');
    if (latInput) latInput.value = '';
    if (lngInput) lngInput.value = '';
}

function isValidCoordinate(val, type) {
    const num = parseFloat(val);
    if (isNaN(num)) return false;
    if (type === 'lat') return num >= -90 && num <= 90;
    if (type === 'lng') return num >= -180 && num <= 180;
    return false;
}

function setupManualGeocode() {
    const toggle = document.getElementById('manual-geocode-toggle');
    const fields = document.getElementById('manual-geocode-fields');
    const latInput = document.getElementById('manual-lat');
    const lngInput = document.getElementById('manual-lng');
    const applyBtn = document.getElementById('manual-geocode-apply');

    if (!toggle || !fields) return;

    toggle.addEventListener('click', () => {
        const isVisible = fields.style.display !== 'none';
        fields.style.display = isVisible ? 'none' : 'block';
        toggle.textContent = isVisible ? 'Enter coordinates manually' : 'Hide manual entry';
    });

    function validateManualInputs() {
        const latValid = isValidCoordinate(latInput.value.trim(), 'lat');
        const lngValid = isValidCoordinate(lngInput.value.trim(), 'lng');
        applyBtn.disabled = !(latValid && lngValid);
    }

    latInput.addEventListener('input', validateManualInputs);
    lngInput.addEventListener('input', validateManualInputs);

    applyBtn.addEventListener('click', () => {
        const lat = parseFloat(latInput.value.trim());
        const lng = parseFloat(lngInput.value.trim());
        if (!isValidCoordinate(latInput.value.trim(), 'lat') || !isValidCoordinate(lngInput.value.trim(), 'lng')) return;

        window.geocodeLat = lat;
        window.geocodeLng = lng;
        updateGeocodeUI('success', '');
        const form = document.getElementById('client-form');
        if (form._validateForm) form._validateForm();
    });
}

function clearGeocodeOnAddressChange() {
    window.geocodeLat = null;
    window.geocodeLng = null;
    hideManualGeocodeFields();
    const manualSection = document.getElementById('manual-geocode-section');
    if (manualSection) manualSection.style.display = 'none';
    updateGeocodeUI('idle', '');
    const form = document.getElementById('client-form');
    if (form._validateForm) form._validateForm();
}

// manualCall = true when user clicks "Geocode Address"
async function autoGeocode(manualCall) {
    const address = document.getElementById('address').value.trim();
    const city = document.getElementById('city').value.trim();
    const state = document.getElementById('state').value.trim();
    const zip = document.getElementById('zip').value.trim();

    if (!address) {
        updateGeocodeUI('idle', '');
        return;
    }

    updateGeocodeUI('loading', '');
    const geocodeBtn = document.getElementById('geocode-btn');
    if (geocodeBtn) geocodeBtn.disabled = true;

    const { baseUrl } = getConfig();
    try {
        const addressQuery = [address, city, state, zip].filter(Boolean).join(', ');
        const response = await fetch(`${baseUrl}/api/geocode?q=${encodeURIComponent(addressQuery)}&provider=auto`, {
            method: 'GET'
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.lat != null && data.lng != null) {
            window.geocodeLat = data.lat;
            window.geocodeLng = data.lng;
            updateGeocodeUI('success', '');
            const form = document.getElementById('client-form');
            if (form._validateForm) form._validateForm();
        } else {
            updateGeocodeUI('error', '');
            window.geocodeLat = null;
            window.geocodeLng = null;
        }
    } catch (error) {
        console.error('Geocoding failed:', error);
        updateGeocodeUI('error', '');
        window.geocodeLat = null;
        window.geocodeLng = null;
    } finally {
        const hasStreet = !!document.getElementById('address').value.trim();
        const btn = document.getElementById('geocode-btn');
        if (btn) btn.disabled = !hasStreet;
    }
}

// Setup auto-geocoding on address field changes; clear coords when address changes
function setupAutoGeocode() {
    const addressFields = ['address', 'city', 'state', 'zip'];
    let geocodeTimeout;

    addressFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('input', () => {
                clearGeocodeOnAddressChange();
                clearTimeout(geocodeTimeout);
                geocodeTimeout = setTimeout(() => {
                    autoGeocode(false);
                }, 1000);
            });
        }
    });

    updateGeocodeUI('idle', '');
}
