'use client';

import { useCallback, useEffect, useRef } from 'react';
import styles from './MassMessaging.module.css';

type RichTextEditorProps = {
    html: string;
    onChange: (html: string) => void;
};

export function RichTextEditor({ html, onChange }: RichTextEditorProps) {
    const editorRef = useRef<HTMLDivElement | null>(null);
    const isFocusedRef = useRef(false);

    useEffect(() => {
        const root = editorRef.current;
        if (!root || isFocusedRef.current) return;
        if (root.innerHTML !== html) {
            root.innerHTML = html;
        }
    }, [html]);

    const syncHtml = useCallback(() => {
        const root = editorRef.current;
        if (!root) return;
        onChange(root.innerHTML);
    }, [onChange]);

    const exec = (command: string, value?: string) => {
        document.execCommand(command, false, value);
        editorRef.current?.focus();
        syncHtml();
    };

    const insertToken = () => {
        const root = editorRef.current;
        if (!root) return;
        root.focus();
        document.execCommand('insertText', false, '{{name}}');
        syncHtml();
    };

    return (
        <div>
            <div className={styles.editorToolbar}>
                <button type="button" className={styles.toolbarBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}>
                    Bold
                </button>
                <button type="button" className={styles.toolbarBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}>
                    Italic
                </button>
                <button type="button" className={styles.toolbarBtn} onMouseDown={(e) => e.preventDefault()} onClick={() => exec('insertUnorderedList')}>
                    Bullets
                </button>
                <button type="button" className={styles.toolbarBtn} onMouseDown={(e) => e.preventDefault()} onClick={insertToken}>
                    Insert {'{{name}}'}
                </button>
            </div>
            <div
                ref={editorRef}
                className={styles.editorSurface}
                contentEditable
                suppressContentEditableWarning
                onFocus={() => {
                    isFocusedRef.current = true;
                }}
                onBlur={() => {
                    isFocusedRef.current = false;
                    syncHtml();
                }}
                onInput={syncHtml}
            />
        </div>
    );
}
