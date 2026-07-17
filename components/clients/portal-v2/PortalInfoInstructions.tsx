'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './portal-v2.module.css';

type Props = {
    body: string;
};

export function PortalInfoInstructions({ body }: Props) {
    const trimmed = body.trim();
    if (!trimmed) return null;

    return (
        <div className={styles.portalV2Markdown}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{trimmed}</ReactMarkdown>
        </div>
    );
}
