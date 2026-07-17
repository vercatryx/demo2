'use client';

import React, { useMemo } from 'react';
import type { BoxSubMenuNode } from '@/lib/boxes/box-catalog-order';
import { findNode } from '@/components/admin/box-selector-demo/subMenuTree';
import { ALL_CATALOG_ITEMS_ID, sectionNodesAtPath } from '@/lib/portal-catalog-finder';
import styles from './portal-v2.module.css';

type Props = {
    mode: 'food' | 'boxes';
    departmentId: string;
    departmentName: string;
    heroImageUrl?: string | null;
    roots: BoxSubMenuNode[];
    folderPath?: string[];
    browseAllCount?: number;
    onSelectFolder: (path: string[]) => void;
    onViewFolderItems: (path: string[]) => void;
    onBrowseAll?: () => void;
};

function folderTrailParts(roots: BoxSubMenuNode[], path: string[]): string[] {
    const parts: string[] = [];
    let current = roots;
    for (const id of path) {
        const found = current.find((n) => n.id === id);
        if (!found) break;
        parts.push(found.name);
        current = found.children ?? [];
    }
    return parts;
}

function ChildFolderPills({
    nodes,
    pathPrefix,
    onSelect,
}: {
    nodes: BoxSubMenuNode[];
    pathPrefix: string[];
    onSelect: (path: string[]) => void;
}) {
    return (
        <div className={styles.portalV2SectionChildRow}>
            {nodes.map((node) => {
                const path = [...pathPrefix, node.id];
                const hasChildren = (node.children?.length ?? 0) > 0;
                if (hasChildren) {
                    return (
                        <div key={node.id} className={styles.portalV2SectionNestedGroup}>
                            <button
                                type="button"
                                className={styles.portalV2SectionNestedTitle}
                                onClick={() => onSelect(path)}
                            >
                                {node.name} ›
                            </button>
                            <ChildFolderPills
                                nodes={node.children ?? []}
                                pathPrefix={path}
                                onSelect={onSelect}
                            />
                        </div>
                    );
                }
                return (
                    <button
                        key={node.id}
                        type="button"
                        className={styles.portalV2SectionChildPill}
                        onClick={() => onSelect(path)}
                    >
                        {node.name}
                    </button>
                );
            })}
        </div>
    );
}

function SectionGroupCard({
    node,
    pathPrefix,
    onSelectFolder,
    onViewFolderItems,
}: {
    node: BoxSubMenuNode;
    pathPrefix: string[];
    onSelectFolder: (path: string[]) => void;
    onViewFolderItems: (path: string[]) => void;
}) {
    const path = [...pathPrefix, node.id];
    const hasChildren = (node.children?.length ?? 0) > 0;

    return (
        <article className={styles.portalV2SectionGroup}>
            <div className={styles.portalV2SectionGroupHeader}>
                <button
                    type="button"
                    className={styles.portalV2SectionGroupTitle}
                    onClick={() => onSelectFolder(path)}
                >
                    {node.name}
                    {hasChildren ? ' ›' : ''}
                </button>
                <button
                    type="button"
                    className={styles.portalV2SectionViewItems}
                    onClick={() => onViewFolderItems(path)}
                >
                    View items
                </button>
            </div>
            {hasChildren ? (
                <div className={styles.portalV2SectionGroupBody}>
                    <ChildFolderPills nodes={node.children ?? []} pathPrefix={path} onSelect={onSelectFolder} />
                </div>
            ) : (
                <button
                    type="button"
                    className={styles.portalV2SectionBrowseLeaf}
                    onClick={() => onSelectFolder(path)}
                >
                    Browse {node.name}
                </button>
            )}
        </article>
    );
}

export function PortalSections({
    departmentName,
    heroImageUrl,
    roots,
    folderPath = [],
    browseAllCount = 0,
    onSelectFolder,
    onViewFolderItems,
    onBrowseAll,
}: Props) {
    const levelNodes = useMemo(() => sectionNodesAtPath(roots, folderPath), [roots, folderPath]);
    const trailParts = useMemo(() => folderTrailParts(roots, folderPath), [roots, folderPath]);

    const heroClassName = heroImageUrl
        ? `${styles.portalV2SectionsHero} ${styles.portalV2SectionsHeroImage}`
        : styles.portalV2SectionsHero;
    const heroStyle = heroImageUrl
        ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url(${heroImageUrl})` }
        : undefined;

    const sectionTitle =
        trailParts.length > 0 ? trailParts[trailParts.length - 1] : departmentName;

    if (roots.length === 0) {
        return (
            <>
                <div className={heroClassName} style={heroStyle}>
                    <h2 className={styles.portalV2SectionsTitle}>{departmentName}</h2>
                </div>
                <div style={{ padding: 24 }}>
                    <button
                        type="button"
                        className={styles.portalV2StartBtn}
                        onClick={() => onBrowseAll?.() ?? onViewFolderItems([ALL_CATALOG_ITEMS_ID])}
                    >
                        Browse all items
                    </button>
                </div>
            </>
        );
    }

    const currentFolderId = folderPath[folderPath.length - 1];
    const currentFolderName = currentFolderId ? findNode(roots, currentFolderId)?.name : null;

    return (
        <>
            <div className={heroClassName} style={heroStyle}>
                <h2 className={styles.portalV2SectionsTitle}>{sectionTitle}</h2>
                {trailParts.length > 1 && (
                    <p className={styles.portalV2SectionsTrail}>{trailParts.join(' › ')}</p>
                )}
            </div>
            {folderPath.length > 0 && (
                <div className={styles.portalV2SectionNav}>
                    <button
                        type="button"
                        className={styles.portalV2SectionLink}
                        onClick={() => onSelectFolder(folderPath.slice(0, -1))}
                    >
                        ← Back
                    </button>
                    <button
                        type="button"
                        className={styles.portalV2SectionLink}
                        onClick={() => onViewFolderItems(folderPath)}
                    >
                        View items in {currentFolderName ?? 'this section'}
                    </button>
                </div>
            )}
            <div className={styles.portalV2SectionGrid}>
                {levelNodes.map((node) => (
                    <SectionGroupCard
                        key={node.id}
                        node={node}
                        pathPrefix={folderPath}
                        onSelectFolder={onSelectFolder}
                        onViewFolderItems={onViewFolderItems}
                    />
                ))}
            </div>
            {browseAllCount > 0 && onBrowseAll && folderPath.length === 0 && (
                <div className={styles.portalV2SectionBrowseAllRow}>
                    <button type="button" className={styles.portalV2SectionLink} onClick={onBrowseAll}>
                        Browse all ({browseAllCount})
                    </button>
                </div>
            )}
        </>
    );
}

export { ALL_CATALOG_ITEMS_ID };
