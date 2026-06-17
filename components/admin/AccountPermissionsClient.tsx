'use client';

import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
    Building2,
    Copy,
    KeyRound,
    MapPin,
    Plus,
    RotateCcw,
    Save,
    Search,
    Shield,
    Store,
    UserCheck,
    Users,
    X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Badge, PageHeader, SectionCard, Switch } from '@/components/ui';
import styles from './AccountPermissions.module.css';

type AccountRole = 'admin' | 'brooklyn_admin' | 'navigator' | 'vendor';

type MockAccount = {
    id: string;
    name: string;
    username: string;
    role: AccountRole;
    subtitle: string;
};

type ModuleKey =
    | 'clients'
    | 'orders'
    | 'billing'
    | 'routes'
    | 'vendors'
    | 'produce'
    | 'screenings'
    | 'mealPlans'
    | 'messaging'
    | 'adminPanel'
    | 'aiTools'
    | 'drivers';

type ModulePermission = {
    enabled: boolean;
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
};

type AccountPermissions = {
    modules: Record<ModuleKey, ModulePermission>;
    locations: string[];
    vendors: string[];
    navigators: string[];
    clientStatuses: string[];
    accountTypes: string[];
};

const INITIAL_ACCOUNTS: MockAccount[] = [
    { id: '1', name: 'Sarah Chen', username: 'schen', role: 'admin', subtitle: 'Full admin' },
    { id: '2', name: 'Marcus Rivera', username: 'mrivera', role: 'brooklyn_admin', subtitle: 'Brooklyn ops' },
    { id: '3', name: 'Jennifer Walsh', username: 'jwalsh', role: 'navigator', subtitle: 'Manhattan caseload' },
    { id: '4', name: 'Lisa Nguyen', username: 'lnguyen', role: 'navigator', subtitle: 'Queens caseload' },
    { id: '5', name: 'Kosher Kitchen LLC', username: 'kosher-kitchen', role: 'vendor', subtitle: 'Meal vendor portal' },
    { id: '6', name: 'Downtown Produce Co', username: 'downtown-produce', role: 'vendor', subtitle: 'Produce vendor portal' },
    { id: '7', name: "Mike O'Brien", username: 'mobrien', role: 'admin', subtitle: 'Billing & reporting' },
];

const SCOPE_OPTIONS = {
    locations: ['Brooklyn', 'Manhattan', 'Queens', 'Bronx', 'Staten Island', 'New Jersey'],
    vendors: ['Kosher Kitchen', 'Downtown Produce', 'Meal Prep Co', 'Farm Fresh', 'Sunrise Catering', 'Green Valley'],
    navigators: ['Jennifer Walsh', 'Lisa Nguyen', 'James Park', 'Aisha Rahman', 'Tom Bradley'],
    clientStatuses: ['Active', 'Pending screening', 'On hold', 'Discharged', 'Awaiting approval'],
    accountTypes: ['Regular', 'Brooklyn', 'DF'],
};

const MODULE_LABELS: Record<ModuleKey, string> = {
    clients: 'Clients',
    orders: 'Orders',
    billing: 'Billing',
    routes: 'Routes',
    vendors: 'Vendors',
    produce: 'Produce',
    screenings: 'Screenings',
    mealPlans: 'Meal plans',
    messaging: 'Messaging',
    adminPanel: 'Admin panel',
    aiTools: 'AI tools',
    drivers: 'Drivers',
};

const ROLE_LABELS: Record<AccountRole, string> = {
    admin: 'Admin',
    brooklyn_admin: 'Brooklyn admin',
    navigator: 'Navigator',
    vendor: 'Vendor',
};

const ROLE_BADGE_TONE: Record<AccountRole, 'brand' | 'warning' | 'info' | 'success'> = {
    admin: 'brand',
    brooklyn_admin: 'warning',
    navigator: 'info',
    vendor: 'success',
};

const PERMISSION_TEMPLATES: Record<AccountRole, AccountPermissions> = {
    admin: createDefaultPermissions({
        moduleOverrides: {
            adminPanel: fullModule(true),
            aiTools: fullModule(true),
            messaging: fullModule(true),
        },
    }),
    brooklyn_admin: createDefaultPermissions({
        locations: ['Brooklyn'],
        accountTypes: ['Brooklyn'],
        moduleOverrides: {
            clients: { enabled: true, view: true, create: true, edit: true, delete: false },
            orders: { enabled: true, view: true, create: true, edit: true, delete: false },
            routes: { enabled: true, view: true, create: false, edit: false, delete: false },
            mealPlans: { enabled: true, view: true, create: true, edit: true, delete: false },
            adminPanel: { enabled: false, view: false, create: false, edit: false, delete: false },
            aiTools: { enabled: false, view: false, create: false, edit: false, delete: false },
            messaging: { enabled: false, view: false, create: false, edit: false, delete: false },
            billing: { enabled: false, view: false, create: false, edit: false, delete: false },
        },
    }),
    navigator: createDefaultPermissions({
        moduleOverrides: {
            clients: { enabled: true, view: true, create: false, edit: true, delete: false },
            orders: { enabled: true, view: true, create: true, edit: true, delete: false },
            screenings: { enabled: true, view: true, create: true, edit: true, delete: false },
            mealPlans: { enabled: true, view: true, create: true, edit: true, delete: false },
            adminPanel: offModule(),
            aiTools: offModule(),
            messaging: { enabled: true, view: true, create: true, edit: false, delete: false },
            billing: offModule(),
            routes: { enabled: true, view: true, create: false, edit: false, delete: false },
            vendors: { enabled: true, view: true, create: false, edit: false, delete: false },
            produce: offModule(),
            drivers: offModule(),
        },
    }),
    vendor: createDefaultPermissions({
        moduleOverrides: {
            clients: { enabled: true, view: true, create: false, edit: false, delete: false },
            orders: { enabled: true, view: true, create: false, edit: true, delete: false },
            vendors: { enabled: true, view: true, create: false, edit: true, delete: false },
            produce: { enabled: true, view: true, create: false, edit: true, delete: false },
            routes: { enabled: true, view: true, create: false, edit: false, delete: false },
            adminPanel: offModule(),
            aiTools: offModule(),
            messaging: offModule(),
            billing: offModule(),
            screenings: offModule(),
            mealPlans: offModule(),
            drivers: offModule(),
        },
    }),
};

function fullModule(enabled = true): ModulePermission {
    return { enabled, view: enabled, create: enabled, edit: enabled, delete: enabled };
}

function offModule(): ModulePermission {
    return { enabled: false, view: false, create: false, edit: false, delete: false };
}

function createDefaultPermissions({
    locations = [],
    accountTypes = [],
    moduleOverrides = {},
}: {
    locations?: string[];
    accountTypes?: string[];
    moduleOverrides?: Partial<Record<ModuleKey, ModulePermission>>;
}): AccountPermissions {
    const baseModules = Object.keys(MODULE_LABELS).reduce(
        (acc, key) => {
            acc[key as ModuleKey] = fullModule(false);
            return acc;
        },
        {} as Record<ModuleKey, ModulePermission>,
    );

    return {
        modules: { ...baseModules, ...moduleOverrides },
        locations,
        vendors: [],
        navigators: [],
        clientStatuses: [],
        accountTypes,
    };
}

function buildInitialPermissions(accounts: MockAccount[]): Record<string, AccountPermissions> {
    return Object.fromEntries(
        accounts.map((account) => [
            account.id,
            structuredClone(PERMISSION_TEMPLATES[account.role]),
        ]),
    );
}

function toggleChip(list: string[], value: string): string[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function slugifyUsername(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function AccountPermissionsClient() {
    const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS);
    const [accountSearch, setAccountSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<AccountRole | 'all'>('all');
    const [selectedAccountId, setSelectedAccountId] = useState(INITIAL_ACCOUNTS[0].id);
    const [permissionsByAccount, setPermissionsByAccount] = useState(() => buildInitialPermissions(INITIAL_ACCOUNTS));
    const [dirty, setDirty] = useState(false);
    const [showNewAccountModal, setShowNewAccountModal] = useState(false);

    const filteredAccounts = useMemo(() => {
        const query = accountSearch.trim().toLowerCase();
        return accounts.filter((account) => {
            if (roleFilter !== 'all' && account.role !== roleFilter) return false;
            if (!query) return true;
            return (
                account.name.toLowerCase().includes(query) ||
                account.username.toLowerCase().includes(query) ||
                account.subtitle.toLowerCase().includes(query)
            );
        });
    }, [accountSearch, roleFilter, accounts]);

    const selectedAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0];
    const permissions = permissionsByAccount[selectedAccount?.id ?? ''] ?? createDefaultPermissions({});

    function updatePermissions(updater: (current: AccountPermissions) => AccountPermissions) {
        setPermissionsByAccount((prev) => ({
            ...prev,
            [selectedAccount.id]: updater(prev[selectedAccount.id]),
        }));
        setDirty(true);
    }

    function handleModuleToggle(module: ModuleKey, field: keyof ModulePermission, value: boolean) {
        updatePermissions((current) => {
            const nextModule = { ...current.modules[module], [field]: value };
            if (field === 'enabled' && !value) {
                nextModule.view = false;
                nextModule.create = false;
                nextModule.edit = false;
                nextModule.delete = false;
            }
            if (field === 'enabled' && value) {
                nextModule.view = true;
            }
            return {
                ...current,
                modules: { ...current.modules, [module]: nextModule },
            };
        });
    }

    function handleScopeToggle(
        field: 'locations' | 'vendors' | 'navigators' | 'clientStatuses' | 'accountTypes',
        value: string,
    ) {
        updatePermissions((current) => ({
            ...current,
            [field]: toggleChip(current[field], value),
        }));
    }

    function applyRoleTemplate() {
        updatePermissions(() => structuredClone(PERMISSION_TEMPLATES[selectedAccount.role]));
        toast.message('Template applied', {
            description: `Reset to default ${ROLE_LABELS[selectedAccount.role]} permissions.`,
        });
    }

    function handleSave() {
        setDirty(false);
        toast.success('Permissions saved', {
            description: `${selectedAccount.name}'s access rules have been updated.`,
        });
    }

    function handleReset() {
        if (!selectedAccount) return;
        updatePermissions(() => structuredClone(PERMISSION_TEMPLATES[selectedAccount.role]));
        setDirty(false);
        toast.message('Changes discarded');
    }

    function handleCreateAccount(account: MockAccount) {
        setAccounts((prev) => [...prev, account]);
        setPermissionsByAccount((prev) => ({
            ...prev,
            [account.id]: structuredClone(PERMISSION_TEMPLATES[account.role]),
        }));
        setSelectedAccountId(account.id);
        setRoleFilter('all');
        setAccountSearch('');
        setDirty(false);
        setShowNewAccountModal(false);
        toast.success('Account created', {
            description: `${account.name} was added. Configure their permissions below.`,
        });
    }

    const enabledModuleCount = Object.values(permissions.modules).filter((m) => m.enabled).length;

    if (!selectedAccount) {
        return null;
    }

    return (
        <div className={styles.container}>
            <PageHeader
                title="Account Permissions"
                subtitle="Configure fine-grained access per account — which clients, locations, vendors, and modules they can reach."
            />

            <div className={styles.layout}>
                <aside className={styles.accountPanel}>
                    <div className={styles.panelHeader}>
                        <div className={styles.panelTitleRow}>
                            <div className={styles.panelTitleMain}>
                                <Users size={16} />
                                <span>Accounts</span>
                            </div>
                            <button
                                type="button"
                                className={`btn btn-primary ${styles.newAccountBtn}`}
                                onClick={() => setShowNewAccountModal(true)}
                            >
                                <Plus size={14} />
                                New account
                            </button>
                        </div>
                        <div className={styles.searchWrap}>
                            <Search size={14} className={styles.searchIcon} />
                            <input
                                className={styles.searchInput}
                                placeholder="Search accounts…"
                                value={accountSearch}
                                onChange={(e) => setAccountSearch(e.target.value)}
                            />
                        </div>
                        <div className={styles.roleFilters}>
                            {(['all', 'admin', 'brooklyn_admin', 'navigator', 'vendor'] as const).map((role) => (
                                <button
                                    key={role}
                                    type="button"
                                    className={`${styles.roleChip} ${roleFilter === role ? styles.roleChipActive : ''}`}
                                    onClick={() => setRoleFilter(role)}
                                >
                                    {role === 'all' ? 'All' : ROLE_LABELS[role]}
                                </button>
                            ))}
                        </div>
                    </div>
                    <ul className={styles.accountList}>
                        {filteredAccounts.map((account) => (
                            <li key={account.id}>
                                <button
                                    type="button"
                                    className={`${styles.accountItem} ${
                                        selectedAccountId === account.id ? styles.accountItemActive : ''
                                    }`}
                                    onClick={() => setSelectedAccountId(account.id)}
                                >
                                    <div className={styles.accountItemMain}>
                                        <span className={styles.accountName}>{account.name}</span>
                                        <span className={styles.accountMeta}>@{account.username}</span>
                                    </div>
                                    <Badge tone={ROLE_BADGE_TONE[account.role]}>{ROLE_LABELS[account.role]}</Badge>
                                </button>
                            </li>
                        ))}
                        {filteredAccounts.length === 0 && (
                            <li className={styles.emptyAccounts}>No accounts match your filters.</li>
                        )}
                    </ul>
                </aside>

                <div className={styles.editor}>
                    <div className={styles.editorHeader}>
                        <div>
                            <div className={styles.editorTitleRow}>
                                <Shield size={18} />
                                <h2 className={styles.editorTitle}>{selectedAccount.name}</h2>
                                <Badge tone={ROLE_BADGE_TONE[selectedAccount.role]}>
                                    {ROLE_LABELS[selectedAccount.role]}
                                </Badge>
                            </div>
                            <p className={styles.editorSubtitle}>
                                {selectedAccount.subtitle} · {enabledModuleCount} modules enabled
                                {dirty ? ' · Unsaved changes' : ''}
                            </p>
                        </div>
                        <div className={styles.editorActions}>
                            <button type="button" className="btn btn-ghost" onClick={applyRoleTemplate}>
                                <Copy size={14} />
                                Apply role template
                            </button>
                        </div>
                    </div>

                    <SectionCard
                        title="Module access"
                        subtitle="Turn entire areas on or off, then set view / create / edit / delete within each."
                    >
                        <div className={styles.moduleGrid}>
                            {(Object.keys(MODULE_LABELS) as ModuleKey[]).map((module) => {
                                const mod = permissions.modules[module];
                                return (
                                    <div key={module} className={styles.moduleCard}>
                                        <div className={styles.moduleCardHeader}>
                                            <span className={styles.moduleName}>{MODULE_LABELS[module]}</span>
                                            <Switch
                                                checked={mod.enabled}
                                                onChange={(checked) => handleModuleToggle(module, 'enabled', checked)}
                                                label="Enabled"
                                            />
                                        </div>
                                        <div className={styles.crudRow}>
                                            {(['view', 'create', 'edit', 'delete'] as const).map((action) => (
                                                <label key={action} className={styles.crudCheck}>
                                                    <input
                                                        type="checkbox"
                                                        checked={mod[action]}
                                                        disabled={!mod.enabled}
                                                        onChange={(e) =>
                                                            handleModuleToggle(module, action, e.target.checked)
                                                        }
                                                    />
                                                    <span>{action}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </SectionCard>

                    <SectionCard
                        title="Data scope"
                        subtitle="Limit which records appear in lists, searches, and exports."
                    >
                        <ScopeGroup
                            icon={<MapPin size={14} />}
                            label="Locations"
                            options={SCOPE_OPTIONS.locations}
                            selected={permissions.locations}
                            onToggle={(value) => handleScopeToggle('locations', value)}
                            emptyHint="No location filter — all boroughs visible"
                        />
                        <ScopeGroup
                            icon={<Store size={14} />}
                            label="Vendors"
                            options={SCOPE_OPTIONS.vendors}
                            selected={permissions.vendors}
                            onToggle={(value) => handleScopeToggle('vendors', value)}
                            emptyHint="No vendor filter — all vendors visible"
                        />
                        <ScopeGroup
                            icon={<UserCheck size={14} />}
                            label="Navigators"
                            options={SCOPE_OPTIONS.navigators}
                            selected={permissions.navigators}
                            onToggle={(value) => handleScopeToggle('navigators', value)}
                            emptyHint="No navigator filter"
                        />
                        <ScopeGroup
                            icon={<Building2 size={14} />}
                            label="Client statuses"
                            options={SCOPE_OPTIONS.clientStatuses}
                            selected={permissions.clientStatuses}
                            onToggle={(value) => handleScopeToggle('clientStatuses', value)}
                            emptyHint="All statuses visible"
                        />
                        <ScopeGroup
                            icon={<KeyRound size={14} />}
                            label="Account types"
                            options={SCOPE_OPTIONS.accountTypes}
                            selected={permissions.accountTypes}
                            onToggle={(value) => handleScopeToggle('accountTypes', value)}
                            emptyHint="All account types visible"
                        />
                    </SectionCard>

                    <div className={styles.footer}>
                        <button type="button" className="btn btn-ghost" onClick={handleReset} disabled={!dirty}>
                            <RotateCcw size={14} />
                            Discard changes
                        </button>
                        <button type="button" className="btn btn-primary" onClick={handleSave}>
                            <Save size={14} />
                            Save permissions
                        </button>
                    </div>
                </div>
            </div>

            {showNewAccountModal && (
                <NewAccountModal
                    existingUsernames={accounts.map((a) => a.username)}
                    onClose={() => setShowNewAccountModal(false)}
                    onCreate={handleCreateAccount}
                />
            )}
        </div>
    );
}

function NewAccountModal({
    existingUsernames,
    onClose,
    onCreate,
}: {
    existingUsernames: string[];
    onClose: () => void;
    onCreate: (account: MockAccount) => void;
}) {
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [role, setRole] = useState<AccountRole>('navigator');
    const [subtitle, setSubtitle] = useState('');
    const [error, setError] = useState<string | null>(null);

    function handleNameChange(value: string) {
        setName(value);
        if (!username || username === slugifyUsername(name)) {
            setUsername(slugifyUsername(value));
        }
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        const trimmedName = name.trim();
        const trimmedUsername = slugifyUsername(username);

        if (!trimmedName) {
            setError('Name is required.');
            return;
        }
        if (!trimmedUsername) {
            setError('Username is required.');
            return;
        }
        if (existingUsernames.includes(trimmedUsername)) {
            setError('That username is already in use.');
            return;
        }

        onCreate({
            id: `account-${Date.now()}`,
            name: trimmedName,
            username: trimmedUsername,
            role,
            subtitle: subtitle.trim() || ROLE_LABELS[role],
        });
    }

    return (
        <div className={styles.modalOverlay} onClick={onClose} role="presentation">
            <div
                className={styles.modal}
                role="dialog"
                aria-modal="true"
                aria-labelledby="new-account-title"
                onClick={(e) => e.stopPropagation()}
            >
                <div className={styles.modalHeader}>
                    <h3 id="new-account-title" className={styles.modalTitle}>
                        New account
                    </h3>
                    <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>

                <form className={styles.modalForm} onSubmit={handleSubmit}>
                    <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel} htmlFor="new-account-name">
                            Name
                        </label>
                        <input
                            id="new-account-name"
                            className={styles.fieldInput}
                            value={name}
                            onChange={(e) => handleNameChange(e.target.value)}
                            placeholder="Jane Smith"
                            autoFocus
                        />
                    </div>

                    <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel} htmlFor="new-account-username">
                            Username
                        </label>
                        <input
                            id="new-account-username"
                            className={styles.fieldInput}
                            value={username}
                            onChange={(e) => setUsername(slugifyUsername(e.target.value))}
                            placeholder="jsmith"
                        />
                    </div>

                    <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel} htmlFor="new-account-role">
                            Role
                        </label>
                        <select
                            id="new-account-role"
                            className={styles.fieldSelect}
                            value={role}
                            onChange={(e) => setRole(e.target.value as AccountRole)}
                        >
                            {(Object.keys(ROLE_LABELS) as AccountRole[]).map((r) => (
                                <option key={r} value={r}>
                                    {ROLE_LABELS[r]}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel} htmlFor="new-account-subtitle">
                            Description <span className={styles.optional}>(optional)</span>
                        </label>
                        <input
                            id="new-account-subtitle"
                            className={styles.fieldInput}
                            value={subtitle}
                            onChange={(e) => setSubtitle(e.target.value)}
                            placeholder="e.g. Queens caseload"
                        />
                    </div>

                    {error && <p className={styles.formError}>{error}</p>}

                    <div className={styles.modalFooter}>
                        <button type="button" className="btn btn-ghost" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn btn-primary">
                            <Plus size={14} />
                            Create account
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

function ScopeGroup({
    icon,
    label,
    options,
    selected,
    onToggle,
    emptyHint,
}: {
    icon: ReactNode;
    label: string;
    options: string[];
    selected: string[];
    onToggle: (value: string) => void;
    emptyHint: string;
}) {
    return (
        <div className={styles.scopeGroup}>
            <div className={styles.scopeLabel}>
                {icon}
                <span>{label}</span>
                {selected.length > 0 && <Badge tone="brand">{selected.length} selected</Badge>}
            </div>
            <div className={styles.chipRow}>
                {options.map((option) => (
                    <button
                        key={option}
                        type="button"
                        className={`${styles.chip} ${selected.includes(option) ? styles.chipActive : ''}`}
                        onClick={() => onToggle(option)}
                    >
                        {option}
                    </button>
                ))}
            </div>
            {selected.length === 0 && <p className={styles.scopeHint}>{emptyHint}</p>}
        </div>
    );
}
