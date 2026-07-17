type Props = {
    message: string;
};

export function ClientLoginMaintenanceScreen({ message }: Props) {
    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                backgroundColor: 'var(--bg-app)',
            }}
        >
            <div
                role="alert"
                style={{
                    maxWidth: 560,
                    padding: '1.5rem 2rem',
                    backgroundColor: 'var(--bg-surface)',
                    borderRadius: 12,
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}
            >
                <h1
                    style={{
                        margin: '0 0 1rem',
                        fontSize: '1.5rem',
                        lineHeight: 1.3,
                        color: 'var(--text-primary)',
                    }}
                >
                    System Maintenance
                </h1>
                <p
                    style={{
                        margin: 0,
                        lineHeight: 1.65,
                        color: 'var(--text-primary)',
                        fontSize: '1.05rem',
                        whiteSpace: 'pre-wrap',
                    }}
                >
                    {message}
                </p>
            </div>
        </div>
    );
}
