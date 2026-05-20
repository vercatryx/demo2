'use client';

import Link from 'next/link';
import { FileText, Folder, GripVertical } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ItemCategory, MenuItem } from '@/lib/types';
import { getBoxMenuLayoutConfig, upsertBoxMenuLayoutConfig } from '@/lib/merge-triangle-actions';
import type { DemoBoxLayoutConfig, DemoSubMenuNode } from './constants';
import styles from './box-selector-demo.module.css';
import { defaultLayoutConfig, UNASSIGNED_SUBMENU_ID } from './layoutStorage';
import {
    addChild,
    addRootSibling,
    addSiblingAfter,
    collectSubtreeIdsForId,
    findNode,
    findParentId,
    moveFolder,
    removeSubtree,
    updateNodeName,
} from './subMenuTree';

type Props = {
    categories: ItemCategory[];
    menuItems: MenuItem[];
    /** Admin tab: tighter shell, no hero, columns before category order, dock below page chrome */
    embedded?: boolean;
    initialLayout?: DemoBoxLayoutConfig | null;
};

const DND_PAYLOAD = 'application/x-triangle-menu-layout';

type DndPayload =
    | { kind: 'item'; itemId: string }
    | { kind: 'folder'; folderId: string; categoryId: string };

/** During dragover, getData() is empty — only types[] is populated (HTML5 DnD spec). */
function dragHasMillerPayload(e: React.DragEvent): boolean {
    const types = e.dataTransfer.types;
    if (!types || types.length === 0) return false;
    const list = Array.from(types as unknown as ArrayLike<string>);
    return list.includes(DND_PAYLOAD) || list.includes('text/plain');
}

function allowMillerDragOver(e: React.DragEvent, effect: 'copy' | 'move' | 'copyMove') {
    if (!dragHasMillerPayload(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (effect === 'copyMove') e.dataTransfer.dropEffect = e.ctrlKey ? 'copy' : 'move';
    else e.dataTransfer.dropEffect = effect;
}

type ContextMenuState =
    | null
    | {
          x: number;
          y: number;
          categoryId: string;
          folderId: string | null;
          parentId: string | null;
          /** Empty-column “New folder”: null = top level; string = inside this folder */
          newFolderParentId?: string | null;
      };

function parseDndPayload(e: React.DragEvent): DndPayload | null {
    try {
        const raw = e.dataTransfer.getData(DND_PAYLOAD);
        if (raw) {
            const o = JSON.parse(raw) as DndPayload;
            if (o.kind === 'item' && typeof o.itemId === 'string') return o;
            if (o.kind === 'folder' && typeof o.folderId === 'string' && typeof o.categoryId === 'string') return o;
        }
        const plain = e.dataTransfer.getData('text/plain');
        if (plain?.startsWith('item:')) return { kind: 'item', itemId: plain.slice(5) };
        if (plain?.startsWith('triangle-folder|')) {
            const rest = plain.slice('triangle-folder|'.length);
            const i = rest.indexOf('|');
            if (i === -1) return null;
            const categoryId = rest.slice(0, i);
            const folderId = rest.slice(i + 1);
            if (categoryId && folderId) return { kind: 'folder', categoryId, folderId };
        }
        return null;
    } catch {
        return null;
    }
}

function setItemDragData(e: React.DragEvent, itemId: string, label: string) {
    const p: DndPayload = { kind: 'item', itemId };
    e.dataTransfer.setData(DND_PAYLOAD, JSON.stringify(p));
    e.dataTransfer.setData('text/plain', `item:${itemId}`);
    e.dataTransfer.effectAllowed = 'copyMove';
    attachFinderDragImage(e, label, 'item');
}

function setFolderDragData(e: React.DragEvent, categoryId: string, folderId: string, label: string) {
    const p: DndPayload = { kind: 'folder', folderId, categoryId };
    e.dataTransfer.setData(DND_PAYLOAD, JSON.stringify(p));
    e.dataTransfer.setData('text/plain', `triangle-folder|${categoryId}|${folderId}`);
    e.dataTransfer.effectAllowed = 'move';
    attachFinderDragImage(e, label, 'folder');
}

function attachFinderDragImage(e: React.DragEvent, label: string, kind: 'item' | 'folder') {
    if (typeof document === 'undefined') return;
    const ghost = document.createElement('div');
    Object.assign(ghost.style, {
        position: 'absolute',
        left: '0',
        top: '-9999px',
        padding: '10px 14px',
        background: 'var(--bg-surface, #fff)',
        border: '1px solid var(--border-color, #ccc)',
        borderRadius: '10px',
        boxShadow: '0 14px 36px rgba(0,0,0,0.18)',
        font: '600 13px system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
        color: 'var(--text-primary, #111)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        maxWidth: '300px',
        pointerEvents: 'none',
    });
    ghost.textContent = `${kind === 'folder' ? '📁 ' : ''}${label}`;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 22, 18);
    requestAnimationFrame(() => ghost.remove());
}

function ContextMenu({
    menu,
    onClose,
    onNewFolderFromChrome,
    onRenameFolder,
    onNewFolderInside,
    onNewFolderBelow,
    onDeleteFolder,
}: {
    menu: Exclude<ContextMenuState, null>;
    onClose: () => void;
    onNewFolderFromChrome: () => void;
    onRenameFolder: () => void;
    onNewFolderInside: () => void;
    onNewFolderBelow: () => void;
    onDeleteFolder: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onDoc = (ev: MouseEvent) => {
            if (ref.current?.contains(ev.target as Node)) return;
            onClose();
        };
        const onKey = (ev: KeyboardEvent) => {
            if (ev.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [onClose]);

    return (
        <div ref={ref} className={styles.contextMenu} style={{ left: menu.x, top: menu.y }} role="menu">
            {menu.folderId === null ? (
                <button type="button" className={styles.contextMenuItem} role="menuitem" onClick={() => { onNewFolderFromChrome(); onClose(); }}>
                    {menu.newFolderParentId ? 'New folder here' : 'New folder'}
                </button>
            ) : (
                <>
                    <button type="button" className={styles.contextMenuItem} role="menuitem" onClick={() => { onRenameFolder(); onClose(); }}>
                        Rename…
                    </button>
                    <div className={styles.contextMenuSep} />
                    <button type="button" className={styles.contextMenuItem} role="menuitem" onClick={() => { onNewFolderInside(); onClose(); }}>
                        New folder inside
                    </button>
                    <button type="button" className={styles.contextMenuItem} role="menuitem" onClick={() => { onNewFolderBelow(); onClose(); }}>
                        New folder below
                    </button>
                    <div className={styles.contextMenuSep} />
                    <button type="button" className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`} role="menuitem" onClick={() => { onDeleteFolder(); onClose(); }}>
                        Delete folder…
                    </button>
                </>
            )}
        </div>
    );
}

export function MenuLayoutDemoClient({ categories, menuItems, embedded = false, initialLayout = null }: Props) {
    const activeCategories = useMemo(
        () => [...categories].filter((c) => c.isActive !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
        [categories],
    );

    const [layout, setLayout] = useState<DemoBoxLayoutConfig>(() => defaultLayoutConfig());
    const [hydrated, setHydrated] = useState(false);
    const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
    const [finderPath, setFinderPath] = useState<string[]>([]);
    const [itemFilter, setItemFilter] = useState<'all' | 'unassigned'>('all');
    const [dropFlash, setDropFlash] = useState<string | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    /** Inline rename only after right-click → Rename… */
    const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
    const millerScrollRef = useRef<HTMLDivElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const [dockCss, setDockCss] = useState<CSSProperties | undefined>(undefined);
    const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useLayoutEffect(() => {
        if (!embedded) {
            setDockCss(undefined);
            return;
        }
        const el = wrapRef.current;
        if (!el) return;
        const update = () => {
            const r = el.getBoundingClientRect();
            const top = Math.max(0, r.top);
            const h = window.innerHeight - top;
            setDockCss({
                ['--palette-dock-top']: `${top}px`,
                ['--palette-dock-height']: `${h}px`,
            } as CSSProperties);
        };
        update();
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [embedded]);

    const mergeLayout = useCallback((base: DemoBoxLayoutConfig): DemoBoxLayoutConfig => {
        const ids = new Set(activeCategories.map((c) => c.id));
        const orderedCategoryIds = base.orderedCategoryIds.filter((id) => ids.has(id));
        for (const c of activeCategories) {
            if (!orderedCategoryIds.includes(c.id)) orderedCategoryIds.push(c.id);
        }
        const subMenusByCategory = { ...base.subMenusByCategory };
        for (const id of Object.keys(subMenusByCategory)) {
            if (!ids.has(id)) delete subMenusByCategory[id];
        }
        const itemSubMenuByItemId = { ...base.itemSubMenuByItemId };
        for (const itemId of Object.keys(itemSubMenuByItemId)) {
            const item = menuItems.find((m) => m.id === itemId);
            if (!item?.categoryId || !ids.has(item.categoryId)) delete itemSubMenuByItemId[itemId];
        }
        return { orderedCategoryIds, subMenusByCategory, itemSubMenuByItemId };
    }, [activeCategories, menuItems]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const loaded = initialLayout ?? (await getBoxMenuLayoutConfig());
            if (cancelled) return;
            if (loaded) {
                setLayout(mergeLayout(loaded));
            } else {
                setLayout(
                    mergeLayout({
                        ...defaultLayoutConfig(),
                        orderedCategoryIds: activeCategories.map((c) => c.id),
                    }),
                );
            }
            setHydrated(true);
        })();
        return () => {
            cancelled = true;
        };
    }, [activeCategories, mergeLayout, initialLayout]);

    const persist = useCallback(
        (next: DemoBoxLayoutConfig) => {
            const merged = mergeLayout(next);
            setLayout(merged);
            setSaveStatus('saving');
            void upsertBoxMenuLayoutConfig(merged)
                .then(() => {
                    setSaveStatus('saved');
                    if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
                    saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1400);
                })
                .catch((error) => {
                    console.error('[MenuLayoutDemoClient] Failed to save box menu layout config:', error);
                    setSaveStatus('error');
                });
        },
        [mergeLayout],
    );

    const orderedCategories = layout.orderedCategoryIds
        .map((id) => activeCategories.find((c) => c.id === id))
        .filter((c): c is ItemCategory => Boolean(c));

    useEffect(() => {
        if (!hydrated) return;
        const ordered = layout.orderedCategoryIds
            .map((id) => activeCategories.find((c) => c.id === id))
            .filter((c): c is ItemCategory => Boolean(c));
        if (ordered.length === 0) {
            setActiveCategoryId(null);
            return;
        }
        setActiveCategoryId((prev) => (prev && ordered.some((c) => c.id === prev) ? prev : ordered[0].id));
    }, [hydrated, layout.orderedCategoryIds, activeCategories]);

    useEffect(() => {
        setFinderPath([]);
    }, [activeCategoryId]);

    useEffect(() => {
        requestAnimationFrame(() => {
            const el = millerScrollRef.current;
            if (el) el.scrollLeft = el.scrollWidth;
        });
    }, [finderPath]);

    const moveCategory = (index: number, dir: -1 | 1) => {
        const next = [...layout.orderedCategoryIds];
        const j = index + dir;
        if (j < 0 || j >= next.length) return;
        [next[index], next[j]] = [next[j], next[index]];
        persist({ ...layout, orderedCategoryIds: next });
    };

    const resetOrder = () => {
        persist({
            ...layout,
            orderedCategoryIds: activeCategories.map((c) => c.id),
        });
    };

    const itemsInCategory = (categoryId: string) =>
        menuItems.filter((m) => m.categoryId === categoryId && m.isActive !== false);

    const assignItemToFolder = useCallback(
        (itemId: string, folderId: string | null) => {
            setLayout((prev) => {
                const itemSubMenuByItemId = { ...prev.itemSubMenuByItemId };
                if (!folderId) delete itemSubMenuByItemId[itemId];
                else itemSubMenuByItemId[itemId] = folderId;
                const merged = mergeLayout({ ...prev, itemSubMenuByItemId });
                setSaveStatus('saving');
                void upsertBoxMenuLayoutConfig(merged)
                    .then(() => {
                        setSaveStatus('saved');
                        if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
                        saveStatusTimerRef.current = setTimeout(() => setSaveStatus('idle'), 1400);
                    })
                    .catch((error) => {
                        console.error('[MenuLayoutDemoClient] Failed to save box menu layout config:', error);
                        setSaveStatus('error');
                    });
                return merged;
            });
        },
        [mergeLayout],
    );

    useEffect(() => () => {
        if (saveStatusTimerRef.current) clearTimeout(saveStatusTimerRef.current);
    }, []);

    const activeCat = orderedCategories.find((c) => c.id === activeCategoryId);
    const roots = activeCat ? layout.subMenusByCategory[activeCat.id] ?? [] : [];
    const catItems = activeCat ? itemsInCategory(activeCat.id) : [];

    const validFolderIds = useMemo(() => {
        const s = new Set<string>();
        function walk(nodes: DemoSubMenuNode[]) {
            for (const n of nodes) {
                s.add(n.id);
                walk(n.children ?? []);
            }
        }
        walk(roots);
        return s;
    }, [roots]);

    const unassignedItems = useMemo(
        () => catItems.filter((m) => !layout.itemSubMenuByItemId[m.id] || !validFolderIds.has(layout.itemSubMenuByItemId[m.id]!)),
        [catItems, layout.itemSubMenuByItemId, validFolderIds],
    );

    const unassignedCount = unassignedItems.length;

    const filteredPaletteItems = useMemo(() => {
        if (itemFilter === 'unassigned') return unassignedItems;
        return catItems;
    }, [catItems, itemFilter, unassignedItems]);

    const flash = (id: string) => {
        setDropFlash(id);
        window.setTimeout(() => setDropFlash(null), 420);
    };

    const rootsPatch = (categoryId: string, nextRoots: DemoSubMenuNode[]) => {
        persist({
            ...layout,
            subMenusByCategory: { ...layout.subMenusByCategory, [categoryId]: nextRoots },
        });
    };

    const addFolderInside = (categoryId: string, parentFolderId: string) => {
        const r = layout.subMenusByCategory[categoryId] ?? [];
        const parent = findNode(r, parentFolderId);
        rootsPatch(categoryId, addChild(r, parentFolderId, `Folder ${(parent?.children?.length ?? 0) + 1}`));
    };

    const addFolderBelow = (categoryId: string, parentId: string | null, afterFolderId: string) => {
        const r = layout.subMenusByCategory[categoryId] ?? [];
        rootsPatch(categoryId, addSiblingAfter(r, parentId, afterFolderId, `Folder ${r.length + 1}`));
    };

    const deleteFolder = (categoryId: string, folderId: string) => {
        const r = layout.subMenusByCategory[categoryId] ?? [];
        const ids = collectSubtreeIdsForId(r, folderId);
        const newRoots = removeSubtree(r, folderId);
        const itemSubMenuByItemId = { ...layout.itemSubMenuByItemId };
        for (const [itemId, sid] of Object.entries(itemSubMenuByItemId)) {
            if (ids.has(sid)) delete itemSubMenuByItemId[itemId];
        }
        persist({
            ...layout,
            subMenusByCategory: { ...layout.subMenusByCategory, [categoryId]: newRoots },
            itemSubMenuByItemId,
        });
        setFinderPath((p) => p.filter((id) => !ids.has(id)));
    };

    const handleDropOnFolder = (categoryId: string, targetFolderId: string, e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const p = parseDndPayload(e);
        if (!p || !activeCat) return;
        if (p.kind === 'item') {
            assignItemToFolder(p.itemId, targetFolderId);
            flash(`f:${targetFolderId}`);
            return;
        }
        if (p.kind === 'folder' && p.categoryId === categoryId) {
            const r = layout.subMenusByCategory[categoryId] ?? [];
            const next = moveFolder(r, p.folderId, { mode: 'into', folderId: targetFolderId });
            if (next) rootsPatch(categoryId, next);
            flash(`f:${targetFolderId}`);
        }
    };

    const handleDropMenuRoot = (categoryId: string, e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const p = parseDndPayload(e);
        if (!p || !activeCat) return;
        if (p.kind === 'item') {
            assignItemToFolder(p.itemId, null);
            flash('root');
            return;
        }
        if (p.kind === 'folder' && p.categoryId === categoryId) {
            const r = layout.subMenusByCategory[categoryId] ?? [];
            const next = moveFolder(r, p.folderId, { mode: 'rootAppend' });
            if (next) rootsPatch(categoryId, next);
            flash('root');
        }
    };

    const handleDropColumnChrome = (categoryId: string, parentFolderId: string, e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const p = parseDndPayload(e);
        if (!p || !activeCat) return;
        if (p.kind === 'item') {
            assignItemToFolder(p.itemId, parentFolderId);
            flash(`col:${parentFolderId}`);
            return;
        }
        if (p.kind === 'folder' && p.categoryId === categoryId) {
            const r = layout.subMenusByCategory[categoryId] ?? [];
            const next = moveFolder(r, p.folderId, { mode: 'into', folderId: parentFolderId });
            if (next) rootsPatch(categoryId, next);
            flash(`col:${parentFolderId}`);
        }
    };

    const addFolderFromChrome = (categoryId: string, parentFolderId: string | null) => {
        const r = layout.subMenusByCategory[categoryId] ?? [];
        if (parentFolderId === null) {
            rootsPatch(categoryId, addRootSibling(r, `Folder ${r.length + 1}`));
            return;
        }
        const parent = findNode(r, parentFolderId);
        rootsPatch(categoryId, addChild(r, parentFolderId, `Folder ${(parent?.children?.length ?? 0) + 1}`));
    };

    const selectInColumn = (colIdx: number, segment: string) => {
        setFinderPath((prev) => [...prev.slice(0, colIdx), segment]);
    };

    const columnCount = useMemo(() => {
        if (finderPath.length === 0) return 1;
        if (finderPath[0] === UNASSIGNED_SUBMENU_ID) return 2;
        return finderPath.length + 1;
    }, [finderPath]);

    const folderParent = useCallback((folderId: string) => findParentId(roots, folderId), [roots]);

    const showDock = hydrated && activeCat && (!embedded || dockCss);

    const categoryOrderPanel = (
        <div className={styles.panel}>
            <h2 className={styles.sectionTitle}>Category order</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'center', marginBottom: '1rem' }}>
                <button type="button" className="btn btn-secondary" onClick={resetOrder}>
                    Reset to default order
                </button>
                {!hydrated && <span className={styles.rowMuted}>Loading…</span>}
                {hydrated && saveStatus === 'saving' && <span className={styles.rowMuted}>Saving…</span>}
                {hydrated && saveStatus === 'saved' && <span className={styles.rowMuted}>Saved</span>}
                {hydrated && saveStatus === 'error' && <span className={styles.rowMuted}>Save failed</span>}
            </div>
            <ul className={styles.categoryOrderList}>
                {orderedCategories.map((cat, index) => (
                    <li key={cat.id} className={styles.categoryOrderRow}>
                        <span className={styles.categoryOrderName}>{cat.name}</span>
                        <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem' }} onClick={() => moveCategory(index, -1)} disabled={index === 0}>
                            ↑
                        </button>
                        <button type="button" className="btn btn-secondary" style={{ padding: '0.35rem 0.65rem' }} onClick={() => moveCategory(index, 1)} disabled={index >= orderedCategories.length - 1}>
                            ↓
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );

    const columnsPanel = (
        <div className={styles.panel}>
            <h2 className={styles.sectionTitle}>Columns</h2>
            {!hydrated || !activeCat ? (
                <p className={styles.rowMuted}>No active category.</p>
            ) : (
                <>
                    <div className={styles.categoryPillStrip} role="tablist" aria-label="Pick category">
                        {orderedCategories.map((cat) => (
                            <button
                                key={cat.id}
                                type="button"
                                role="tab"
                                aria-selected={activeCategoryId === cat.id}
                                className={`${styles.categoryPill} ${activeCategoryId === cat.id ? styles.categoryPillActive : ''}`}
                                onClick={() => setActiveCategoryId(cat.id)}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>

                    <nav className={styles.millerBreadcrumb} aria-label="Column trail">
                        <button type="button" className={styles.millerBcSeg} onClick={() => setFinderPath([])}>
                            {activeCat.name}
                        </button>
                        {finderPath.map((seg, i) => (
                            <Fragment key={`${seg}-${i}`}>
                                <span className={styles.millerBcSep} aria-hidden>
                                    ›
                                </span>
                                <button
                                    type="button"
                                    className={styles.millerBcSeg}
                                    onClick={() => setFinderPath(finderPath.slice(0, i + 1))}
                                >
                                    {seg === UNASSIGNED_SUBMENU_ID ? 'Uncategorized' : findNode(roots, seg)?.name ?? 'Folder'}
                                </button>
                            </Fragment>
                        ))}
                    </nav>

                    <div
                        ref={millerScrollRef}
                        className={styles.millerScroller}
                        onContextMenu={(e) => {
                            const t = e.target as HTMLElement;
                            if (t.closest('[data-item-palette]') || t.closest('[data-miller-row]')) return;
                            const colEl = t.closest('[data-miller-col]');
                            const colIdx = colEl ? Number(colEl.getAttribute('data-miller-col')) : 0;
                            if (finderPath[0] === UNASSIGNED_SUBMENU_ID && colIdx >= 1) {
                                e.preventDefault();
                                return;
                            }
                            let newFolderParentId: string | null = null;
                            if (colIdx > 0 && finderPath.length >= colIdx) {
                                const seg = finderPath[colIdx - 1];
                                if (seg && seg !== UNASSIGNED_SUBMENU_ID) newFolderParentId = seg;
                            }
                            e.preventDefault();
                            setContextMenu({
                                x: e.clientX,
                                y: e.clientY,
                                categoryId: activeCat.id,
                                folderId: null,
                                parentId: null,
                                newFolderParentId,
                            });
                        }}
                    >
                        {Array.from({ length: columnCount }).map((_, colIdx) => (
                            <MillerColumn
                                key={`c-${colIdx}-${finderPath.slice(0, colIdx).join('|')}`}
                                colIdx={colIdx}
                                columnCount={columnCount}
                                categoryId={activeCat.id}
                                roots={roots}
                                finderPath={finderPath}
                                layout={layout}
                                catItems={catItems}
                                unassignedItems={unassignedItems}
                                unassignedCount={unassignedCount}
                                dropFlash={dropFlash}
                                assignItemToFolder={assignItemToFolder}
                                onSelectFolder={(fid) => selectInColumn(colIdx, fid)}
                                onSelectUnassigned={() => selectInColumn(colIdx, UNASSIGNED_SUBMENU_ID)}
                                onDropFolder={handleDropOnFolder}
                                onDropMenuRoot={handleDropMenuRoot}
                                onDropColumnChrome={handleDropColumnChrome}
                                renamingFolderId={renamingFolderId}
                                setRenamingFolderId={setRenamingFolderId}
                                onRename={(folderId, name) => {
                                    const r = layout.subMenusByCategory[activeCat.id] ?? [];
                                    rootsPatch(activeCat.id, updateNodeName(r, folderId, name));
                                }}
                                onFolderDragStart={(e, folderId, name) => setFolderDragData(e, activeCat.id, folderId, name)}
                                onContextMenuFolder={(e, folderId) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setContextMenu({
                                        x: e.clientX,
                                        y: e.clientY,
                                        categoryId: activeCat.id,
                                        folderId,
                                        parentId: folderParent(folderId),
                                    });
                                }}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );

    return (
        <div
            ref={wrapRef}
            className={`${styles.wrap} ${styles.withItemPalette} ${embedded ? styles.wrapEmbedded : ''}`}
        >
            <div className={styles.inner}>
                {!embedded ? (
                    <Link href="/admin/box-selector-demo" className={styles.navBack}>
                        ← Box demo hub
                    </Link>
                ) : null}

                {!embedded ? (
                    <header className={styles.hero}>
                        <h1>Menu layout — Finder columns</h1>
                        <p>
                            Like <strong>macOS Finder column view</strong>: pick a folder in one column to open the next. Click an earlier column’s selection trail in the breadcrumb to see where you are.
                            Drag items from the dock — the label floats under your cursor. Right-click for folders. Saved to <span className={styles.mono}>database</span>.
                        </p>
                    </header>
                ) : null}

                {embedded ? (
                    <>
                        {columnsPanel}
                        {categoryOrderPanel}
                    </>
                ) : (
                    <>
                        {categoryOrderPanel}
                        {columnsPanel}
                    </>
                )}

                {!embedded ? (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                        Open{' '}
                        <Link href="/admin/box-selector-demo/select" style={{ fontWeight: 600, color: 'var(--color-accent)' }}>
                            Box selection demo
                        </Link>{' '}
                        and click <strong>Refresh layout</strong> if needed.
                    </p>
                ) : null}
            </div>

            {showDock ? (
                <aside
                    className={`${styles.itemPaletteDock} ${embedded ? styles.itemPaletteDockEmbedded : ''}`}
                    style={embedded ? dockCss : undefined}
                    data-item-palette
                    aria-label="Items dock"
                >
                    <div className={styles.itemPaletteHead}>
                        <span className={styles.itemPaletteTitle}>Items</span>
                        <span className={styles.itemPaletteCat}>{activeCat.name}</span>
                    </div>
                    <div className={styles.itemFilterToggle} role="group" aria-label="Filter items">
                        <button
                            type="button"
                            className={`${styles.filterChip} ${itemFilter === 'all' ? styles.filterChipActive : ''}`}
                            onClick={() => setItemFilter('all')}
                        >
                            All ({catItems.length})
                        </button>
                        <button
                            type="button"
                            className={`${styles.filterChip} ${itemFilter === 'unassigned' ? styles.filterChipActive : ''}`}
                            onClick={() => setItemFilter('unassigned')}
                        >
                            Uncategorized ({unassignedCount})
                        </button>
                    </div>
                    <p className={styles.itemPaletteHelp}>Drag into the columns. Ghost follows the pointer.</p>
                    <ul className={styles.itemPaletteList}>
                        {filteredPaletteItems.map((item) => (
                            <li key={item.id} className={styles.itemPaletteRow} draggable onDragStart={(e) => setItemDragData(e, item.id, item.name)}>
                                <GripVertical size={15} className={styles.dragHandle} aria-hidden />
                                <span className={styles.itemPaletteName}>{item.name}</span>
                            </li>
                        ))}
                    </ul>
                </aside>
            ) : null}

            {contextMenu && activeCat ? (
                <ContextMenu
                    menu={contextMenu}
                    onClose={() => setContextMenu(null)}
                    onNewFolderFromChrome={() =>
                        addFolderFromChrome(contextMenu.categoryId, contextMenu.newFolderParentId ?? null)
                    }
                    onRenameFolder={() => {
                        if (contextMenu.folderId) setRenamingFolderId(contextMenu.folderId);
                    }}
                    onNewFolderInside={() => {
                        if (contextMenu.folderId) addFolderInside(contextMenu.categoryId, contextMenu.folderId);
                    }}
                    onNewFolderBelow={() => {
                        if (contextMenu.folderId)
                            addFolderBelow(contextMenu.categoryId, contextMenu.parentId, contextMenu.folderId);
                    }}
                    onDeleteFolder={() => {
                        if (contextMenu.folderId) deleteFolder(contextMenu.categoryId, contextMenu.folderId);
                    }}
                />
            ) : null}
        </div>
    );
}

function FolderNameCell({
    folderId,
    name,
    renamingFolderId,
    setRenamingFolderId,
    onRename,
}: {
    folderId: string;
    name: string;
    renamingFolderId: string | null;
    setRenamingFolderId: (id: string | null) => void;
    onRename: (folderId: string, name: string) => void;
}) {
    const cancelBlurSave = useRef(false);

    if (renamingFolderId === folderId) {
        return (
            <input
                key={folderId}
                className={styles.millerRowInput}
                aria-label="Folder name"
                defaultValue={name}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                onBlur={(e) => {
                    if (!cancelBlurSave.current) {
                        onRename(folderId, e.target.value.trim());
                    }
                    cancelBlurSave.current = false;
                    setRenamingFolderId(null);
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelBlurSave.current = true;
                        setRenamingFolderId(null);
                    }
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        (e.target as HTMLInputElement).blur();
                    }
                }}
            />
        );
    }
    return (
        <span className={styles.millerRowLabel} onClick={(e) => e.stopPropagation()}>
            {name || 'Untitled folder'}
        </span>
    );
}

function MillerColumn({
    colIdx,
    columnCount,
    categoryId,
    roots,
    finderPath,
    layout,
    catItems,
    unassignedItems,
    unassignedCount,
    dropFlash,
    assignItemToFolder,
    onSelectFolder,
    onSelectUnassigned,
    onDropFolder,
    onDropMenuRoot,
    onDropColumnChrome,
    renamingFolderId,
    setRenamingFolderId,
    onRename,
    onFolderDragStart,
    onContextMenuFolder,
}: {
    colIdx: number;
    columnCount: number;
    categoryId: string;
    roots: DemoSubMenuNode[];
    finderPath: string[];
    layout: DemoBoxLayoutConfig;
    catItems: MenuItem[];
    unassignedItems: MenuItem[];
    unassignedCount: number;
    dropFlash: string | null;
    assignItemToFolder: (itemId: string, folderId: string | null) => void;
    onSelectFolder: (folderId: string) => void;
    onSelectUnassigned: () => void;
    onDropFolder: (categoryId: string, folderId: string, e: React.DragEvent) => void;
    onDropMenuRoot: (categoryId: string, e: React.DragEvent) => void;
    onDropColumnChrome: (categoryId: string, parentFolderId: string, e: React.DragEvent) => void;
    renamingFolderId: string | null;
    setRenamingFolderId: (id: string | null) => void;
    onRename: (folderId: string, name: string) => void;
    onFolderDragStart: (e: React.DragEvent, folderId: string, name: string) => void;
    onContextMenuFolder: (e: React.MouseEvent, folderId: string) => void;
}) {
    if (colIdx >= columnCount) return null;

    const selectedHere = finderPath[colIdx];

    if (colIdx === 0) {
        return (
            <div
                data-miller-col={colIdx}
                className={`${styles.millerCol} ${dropFlash === 'root' ? styles.millerColFlash : ''}`}
                onDragEnter={(e) => allowMillerDragOver(e, 'copyMove')}
                onDragOver={(e) => allowMillerDragOver(e, 'copyMove')}
                onDrop={(e) => onDropMenuRoot(categoryId, e)}
            >
                <div className={styles.millerColHead}>1 · Top level</div>
                <div className={styles.millerColBody}>
                    <div
                        role="button"
                        tabIndex={0}
                        data-miller-row
                        className={`${styles.millerRow} ${styles.millerRowEmphasis} ${selectedHere === UNASSIGNED_SUBMENU_ID ? styles.millerRowSelected : ''}`}
                        onClick={() => onSelectUnassigned()}
                        onKeyDown={(ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') {
                                ev.preventDefault();
                                onSelectUnassigned();
                            }
                        }}
                        onDragEnter={(e) => allowMillerDragOver(e, 'copyMove')}
                        onDragOver={(e) => allowMillerDragOver(e, 'copyMove')}
                        onDrop={(e) => onDropMenuRoot(categoryId, e)}
                    >
                        <span className={styles.millerRowIcon}>⌂</span>
                        <span className={styles.millerRowLabel}>Uncategorized</span>
                        <span className={styles.millerRowMeta}>{unassignedCount} items</span>
                    </div>
                    {roots.map((node) => (
                        <div
                            key={node.id}
                            data-miller-row
                            className={`${styles.millerRow} ${styles.millerFolderRow} ${selectedHere === node.id ? styles.millerRowSelected : ''}`}
                            onClick={() => onSelectFolder(node.id)}
                            onContextMenu={(e) => onContextMenuFolder(e, node.id)}
                            onDragEnter={(e) => allowMillerDragOver(e, 'copyMove')}
                            onDragOver={(e) => allowMillerDragOver(e, 'copyMove')}
                            onDrop={(e) => onDropFolder(categoryId, node.id, e)}
                        >
                            <span
                                className={styles.millerFolderDragHandle}
                                draggable
                                title="Drag to move folder"
                                aria-label="Drag folder"
                                onDragStart={(e) => {
                                    e.stopPropagation();
                                    onFolderDragStart(e, node.id, node.name);
                                }}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <GripVertical size={15} strokeWidth={2} aria-hidden />
                            </span>
                            <span className={styles.millerRowIcon} aria-hidden>
                                <Folder size={16} strokeWidth={2} />
                            </span>
                            <FolderNameCell
                                folderId={node.id}
                                name={node.name}
                                renamingFolderId={renamingFolderId}
                                setRenamingFolderId={setRenamingFolderId}
                                onRename={onRename}
                            />
                        </div>
                    ))}
                    {roots.length === 0 ? (
                        <div className={styles.millerEmpty}>Right-click this strip for a new folder.</div>
                    ) : null}
                </div>
            </div>
        );
    }

    if (finderPath[0] === UNASSIGNED_SUBMENU_ID && colIdx === 1) {
        return (
            <div
                data-miller-col={colIdx}
                className={styles.millerCol}
                onDragEnter={(e) => allowMillerDragOver(e, 'copyMove')}
                onDragOver={(e) => allowMillerDragOver(e, 'copyMove')}
                onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const p = parseDndPayload(e);
                    if (p?.kind === 'item') assignItemToFolder(p.itemId, null);
                }}
            >
                <div className={styles.millerColHead}>2 · Uncategorized (items)</div>
                <div className={styles.millerColBody}>
                    {unassignedItems.map((item) => (
                        <div
                            key={item.id}
                            data-miller-row
                            draggable
                            className={styles.millerRow}
                            onDragStart={(e) => setItemDragData(e, item.id, item.name)}
                        >
                            <span className={styles.millerRowIcon} aria-hidden>
                                <FileText size={15} strokeWidth={2} />
                            </span>
                            <span className={styles.millerRowLabel}>{item.name}</span>
                        </div>
                    ))}
                    {unassignedItems.length === 0 ? <div className={styles.millerEmpty}>Nothing uncategorized.</div> : null}
                </div>
            </div>
        );
    }

    const parentFolderId = finderPath[colIdx - 1];
    if (!parentFolderId || parentFolderId === UNASSIGNED_SUBMENU_ID) return null;

    const parentNode = findNode(roots, parentFolderId);
    if (!parentNode) return null;

    const childFolders = parentNode.children ?? [];
    const itemsHere = catItems.filter((m) => layout.itemSubMenuByItemId[m.id] === parentFolderId);
    const parentLabel = parentNode.name || 'Folder';
    const colNum = colIdx + 1;

    return (
        <div
            data-miller-col={colIdx}
            className={`${styles.millerCol} ${dropFlash === `col:${parentFolderId}` ? styles.millerColFlash : ''}`}
            onDragEnter={(e) => allowMillerDragOver(e, 'copyMove')}
            onDragOver={(e) => allowMillerDragOver(e, 'copyMove')}
            onDrop={(e) => onDropColumnChrome(categoryId, parentFolderId, e)}
        >
            <div className={styles.millerColHead}>
                {colNum} · Inside “{parentLabel}”
            </div>
            <div className={styles.millerColBody}>
                {childFolders.map((node) => (
                    <div
                        key={node.id}
                        data-miller-row
                        className={`${styles.millerRow} ${styles.millerFolderRow} ${selectedHere === node.id ? styles.millerRowSelected : ''}`}
                        onClick={() => onSelectFolder(node.id)}
                        onContextMenu={(e) => onContextMenuFolder(e, node.id)}
                        onDragEnter={(e) => allowMillerDragOver(e, 'copyMove')}
                        onDragOver={(e) => allowMillerDragOver(e, 'copyMove')}
                        onDrop={(e) => onDropFolder(categoryId, node.id, e)}
                    >
                        <span
                            className={styles.millerFolderDragHandle}
                            draggable
                            title="Drag to move folder"
                            aria-label="Drag folder"
                            onDragStart={(e) => {
                                e.stopPropagation();
                                onFolderDragStart(e, node.id, node.name);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <GripVertical size={15} strokeWidth={2} aria-hidden />
                        </span>
                        <span className={styles.millerRowIcon} aria-hidden>
                            <Folder size={16} strokeWidth={2} />
                        </span>
                        <FolderNameCell
                            folderId={node.id}
                            name={node.name}
                            renamingFolderId={renamingFolderId}
                            setRenamingFolderId={setRenamingFolderId}
                            onRename={onRename}
                        />
                    </div>
                ))}
                {itemsHere.map((item) => (
                    <div
                        key={item.id}
                        data-miller-row
                        draggable
                        className={`${styles.millerRow} ${styles.millerRowFile}`}
                        onDragStart={(e) => setItemDragData(e, item.id, item.name)}
                    >
                        <span className={styles.millerRowIcon} aria-hidden>
                            <FileText size={15} strokeWidth={2} />
                        </span>
                        <span className={styles.millerRowLabel}>{item.name}</span>
                    </div>
                ))}
                {childFolders.length === 0 && itemsHere.length === 0 ? (
                    <div className={styles.millerEmpty}>Drop items onto this column or open a subfolder.</div>
                ) : null}
            </div>
        </div>
    );
}
