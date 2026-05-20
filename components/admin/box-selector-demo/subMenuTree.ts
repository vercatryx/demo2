import type { DemoSubMenuNode } from './constants';

export function newSubMenuNodeId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `sm-${crypto.randomUUID()}`;
    return `sm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Legacy flat rows → tree nodes with empty children */
export function migrateFlatSubMenusToTree(flat: { id: string; name: string }[]): DemoSubMenuNode[] {
    return flat.map((s) => ({ id: s.id, name: s.name, children: [] }));
}

function isPlainSubMenu(x: unknown): x is { id: string; name: string } {
    return Boolean(x && typeof x === 'object' && 'id' in x && 'name' in x && !('children' in (x as object)));
}

/** Normalize parsed JSON: flat arrays or missing children → DemoSubMenuNode[] */
export function normalizeSubMenuForest(raw: unknown): DemoSubMenuNode[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((x) => {
        if (isPlainSubMenu(x)) {
            return { id: x.id, name: x.name, children: [] };
        }
        const n = x as DemoSubMenuNode;
        return {
            id: n.id,
            name: n.name,
            children: normalizeSubMenuForest(n.children),
        };
    });
}

export function findNode(roots: DemoSubMenuNode[], id: string): DemoSubMenuNode | null {
    for (const n of roots) {
        if (n.id === id) return n;
        const d = findNode(n.children ?? [], id);
        if (d) return d;
    }
    return null;
}

/** IDs from root to the target node (inclusive), or null if not in this forest. */
export function findPathToNode(roots: DemoSubMenuNode[], targetId: string): string[] | null {
    function dfs(nodes: DemoSubMenuNode[], prefix: string[]): string[] | null {
        for (const n of nodes) {
            const here = [...prefix, n.id];
            if (n.id === targetId) return here;
            const sub = dfs(n.children ?? [], here);
            if (sub) return sub;
        }
        return null;
    }
    return dfs(roots, []);
}

/** Every node id in the forest (for assignment validation & Unassigned). */
export function collectAllNodeIds(roots: DemoSubMenuNode[]): Set<string> {
    const s = new Set<string>();
    function walk(nodes: DemoSubMenuNode[]) {
        for (const n of nodes) {
            s.add(n.id);
            if (n.children?.length) walk(n.children);
        }
    }
    walk(roots);
    return s;
}

/** Remove a node and its subtree; returns new roots */
export function removeSubtree(roots: DemoSubMenuNode[], removeId: string): DemoSubMenuNode[] {
    const filtered = roots.filter((n) => n.id !== removeId).map((n) => ({
        ...n,
        children: removeSubtree(n.children ?? [], removeId),
    }));
    return filtered;
}

/** Finder columns: col[0]=roots, col[j]=children(path[j-1]) */
export function buildFinderColumns(roots: DemoSubMenuNode[], path: string[]): DemoSubMenuNode[][] {
    const cols: DemoSubMenuNode[][] = [];
    if (!roots.length) return cols;
    cols.push(roots);
    let level: DemoSubMenuNode[] = roots;
    for (let i = 0; i < path.length; i++) {
        const node = level.find((n) => n.id === path[i]);
        if (!node) break;
        const next = node.children ?? [];
        cols.push(next);
        level = next;
    }
    return cols;
}

/** Nodes available after walking `prefixIds` (empty prefix → roots). Used for progressive submenu dropdowns. */
export function getSubMenuOptionsAtStep(
    roots: DemoSubMenuNode[],
    prefixIds: string[],
): DemoSubMenuNode[] {
    let nodes = roots;
    for (const id of prefixIds) {
        const n = nodes.find((x) => x.id === id);
        if (!n) return [];
        nodes = n.children ?? [];
    }
    return nodes;
}

/** Depth-first flat list for dropdowns */
export function flattenNodesForSelect(
    roots: DemoSubMenuNode[],
    depth = 0,
): { id: string; label: string }[] {
    const out: { id: string; label: string }[] = [];
    const pad = '— '.repeat(depth);
    for (const n of roots) {
        out.push({ id: n.id, label: `${pad}${n.name}` });
        out.push(...flattenNodesForSelect(n.children ?? [], depth + 1));
    }
    return out;
}

export function updateNodeName(roots: DemoSubMenuNode[], id: string, name: string): DemoSubMenuNode[] {
    return roots.map((n) => {
        if (n.id === id) return { ...n, name };
        if (n.children?.length) return { ...n, children: updateNodeName(n.children, id, name) };
        return n;
    });
}

export function addRootSibling(roots: DemoSubMenuNode[], name: string): DemoSubMenuNode[] {
    return [...roots, { id: newSubMenuNodeId(), name, children: [] }];
}

export function addChild(roots: DemoSubMenuNode[], parentId: string, name: string): DemoSubMenuNode[] {
    return roots.map((n) => {
        if (n.id === parentId) {
            const ch = [...(n.children ?? []), { id: newSubMenuNodeId(), name, children: [] }];
            return { ...n, children: ch };
        }
        if (n.children?.length) return { ...n, children: addChild(n.children, parentId, name) };
        return n;
    });
}

/** Insert another root after index */
export function addRootAfter(roots: DemoSubMenuNode[], afterIndex: number, name: string): DemoSubMenuNode[] {
    const next = [...roots];
    next.splice(afterIndex + 1, 0, { id: newSubMenuNodeId(), name, children: [] });
    return next;
}

/** Insert a sibling folder immediately after `afterNodeId` (same parent as that node). */
export function addSiblingAfter(
    roots: DemoSubMenuNode[],
    parentId: string | null,
    afterNodeId: string,
    name: string,
): DemoSubMenuNode[] {
    if (parentId === null) {
        const idx = roots.findIndex((n) => n.id === afterNodeId);
        if (idx === -1) return roots;
        const next = [...roots];
        next.splice(idx + 1, 0, { id: newSubMenuNodeId(), name, children: [] });
        return next;
    }
    return roots.map((n) => {
        if (n.id === parentId) {
            const ch = [...(n.children ?? [])];
            const idx = ch.findIndex((c) => c.id === afterNodeId);
            if (idx === -1) return n;
            ch.splice(idx + 1, 0, { id: newSubMenuNodeId(), name, children: [] });
            return { ...n, children: ch };
        }
        if (n.children?.length) return { ...n, children: addSiblingAfter(n.children, parentId, afterNodeId, name) };
        return n;
    });
}

export function moveAmongRoots(roots: DemoSubMenuNode[], index: number, dir: -1 | 1): DemoSubMenuNode[] {
    const j = index + dir;
    if (j < 0 || j >= roots.length) return roots;
    const next = [...roots];
    [next[index], next[j]] = [next[j], next[index]];
    return next;
}

export function moveAmongSiblings(
    roots: DemoSubMenuNode[],
    parentId: string | null,
    nodeId: string,
    dir: -1 | 1,
): DemoSubMenuNode[] {
    if (parentId === null) {
        const idx = roots.findIndex((n) => n.id === nodeId);
        if (idx === -1) return roots;
        return moveAmongRoots(roots, idx, dir);
    }
    return roots.map((n) => {
        if (n.id !== parentId) {
            if (n.children?.length) return { ...n, children: moveAmongSiblings(n.children, parentId, nodeId, dir) };
            return n;
        }
        const ch = [...(n.children ?? [])];
        const idx = ch.findIndex((c) => c.id === nodeId);
        if (idx === -1) return n;
        const j = idx + dir;
        if (j < 0 || j >= ch.length) return n;
        [ch[idx], ch[j]] = [ch[j], ch[idx]];
        return { ...n, children: ch };
    });
}

export function findParentId(roots: DemoSubMenuNode[], childId: string): string | null {
    for (const n of roots) {
        if (n.children?.some((c) => c.id === childId)) return n.id;
        const p = findParentId(n.children ?? [], childId);
        if (p) return p;
    }
    return null;
}

export function collectSubtreeIds(node: DemoSubMenuNode): Set<string> {
    const ids = new Set<string>([node.id]);
    for (const c of node.children ?? []) {
        for (const id of collectSubtreeIds(c)) ids.add(id);
    }
    return ids;
}

export function collectSubtreeIdsForId(roots: DemoSubMenuNode[], nodeId: string): Set<string> {
    const n = findNode(roots, nodeId);
    if (!n) return new Set();
    return collectSubtreeIds(n);
}

/** Remove first occurrence of `nodeId` and return extracted subtree (structure preserved). */
export function extractNodeById(
    roots: DemoSubMenuNode[],
    nodeId: string,
): { roots: DemoSubMenuNode[]; removed: DemoSubMenuNode | null } {
    let removed: DemoSubMenuNode | null = null;

    function strip(nodes: DemoSubMenuNode[]): DemoSubMenuNode[] {
        const out: DemoSubMenuNode[] = [];
        for (const n of nodes) {
            if (n.id === nodeId) {
                removed = n;
                continue;
            }
            out.push({ ...n, children: strip(n.children ?? []) });
        }
        return out;
    }

    return { roots: strip(roots), removed };
}

export function appendChildFolder(
    roots: DemoSubMenuNode[],
    parentId: string,
    child: DemoSubMenuNode,
): DemoSubMenuNode[] {
    return roots.map((n) => {
        if (n.id === parentId) {
            return { ...n, children: [...(n.children ?? []), child] };
        }
        if (n.children?.length) return { ...n, children: appendChildFolder(n.children, parentId, child) };
        return n;
    });
}

export function insertSiblingBeforeExisting(
    roots: DemoSubMenuNode[],
    parentId: string | null,
    beforeNodeId: string,
    node: DemoSubMenuNode,
): DemoSubMenuNode[] {
    if (parentId === null) {
        const idx = roots.findIndex((n) => n.id === beforeNodeId);
        if (idx === -1) return roots;
        const next = [...roots];
        next.splice(idx, 0, node);
        return next;
    }
    return roots.map((n) => {
        if (n.id === parentId) {
            const ch = [...(n.children ?? [])];
            const idx = ch.findIndex((c) => c.id === beforeNodeId);
            if (idx === -1) return n;
            ch.splice(idx, 0, node);
            return { ...n, children: ch };
        }
        if (n.children?.length) return { ...n, children: insertSiblingBeforeExisting(n.children, parentId, beforeNodeId, node) };
        return n;
    });
}

export function insertSiblingAfterExisting(
    roots: DemoSubMenuNode[],
    parentId: string | null,
    afterNodeId: string,
    node: DemoSubMenuNode,
): DemoSubMenuNode[] {
    if (parentId === null) {
        const idx = roots.findIndex((n) => n.id === afterNodeId);
        if (idx === -1) return roots;
        const next = [...roots];
        next.splice(idx + 1, 0, node);
        return next;
    }
    return roots.map((n) => {
        if (n.id === parentId) {
            const ch = [...(n.children ?? [])];
            const idx = ch.findIndex((c) => c.id === afterNodeId);
            if (idx === -1) return n;
            ch.splice(idx + 1, 0, node);
            return { ...n, children: ch };
        }
        if (n.children?.length) return { ...n, children: insertSiblingAfterExisting(n.children, parentId, afterNodeId, node) };
        return n;
    });
}

/** True if `candidateId` is `ancestorId` or anywhere under its subtree in `roots`. */
export function isUnderSubtree(roots: DemoSubMenuNode[], ancestorId: string, candidateId: string): boolean {
    const sub = findNode(roots, ancestorId);
    if (!sub) return false;
    return collectSubtreeIds(sub).has(candidateId);
}

export type MoveFolderTarget =
    | { mode: 'into'; folderId: string }
    | { mode: 'before'; folderId: string }
    | { mode: 'after'; folderId: string }
    | { mode: 'rootAppend' };

/** Move an existing folder subtree; returns null if invalid (e.g. into own descendant). */
export function moveFolder(roots: DemoSubMenuNode[], draggedFolderId: string, target: MoveFolderTarget): DemoSubMenuNode[] | null {
    const draggedNode = findNode(roots, draggedFolderId);
    if (!draggedNode) return null;

    if (target.mode === 'into') {
        if (target.folderId === draggedFolderId) return null;
        if (isUnderSubtree(roots, draggedFolderId, target.folderId)) return null;
    }

    const { roots: cut, removed } = extractNodeById(roots, draggedFolderId);
    if (!removed) return null;

    switch (target.mode) {
        case 'into':
            return appendChildFolder(cut, target.folderId, removed);
        case 'before': {
            const p = findParentId(cut, target.folderId);
            return insertSiblingBeforeExisting(cut, p, target.folderId, removed);
        }
        case 'after': {
            const p = findParentId(cut, target.folderId);
            return insertSiblingAfterExisting(cut, p, target.folderId, removed);
        }
        case 'rootAppend':
            return [...cut, removed];
    }
}
