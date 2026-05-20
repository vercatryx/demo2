// components/drivers/MapLoadingOverlay.tsx
"use client";

import { APP_BRAND_NAME, APP_LOGO_PATH } from "@/lib/brand";

export default function MapLoadingOverlay({
    show,
    logoSrc = APP_LOGO_PATH,
}: {
    show?: boolean;
    logoSrc?: string;
}) {
    if (!show) return null;
    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                background: "rgba(255,255,255,0.9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10000,
                borderRadius: 12,
            }}
        >
            <div style={{ textAlign: "center" }}>
                {logoSrc ? (
                    <img
                        src={logoSrc}
                        alt={APP_BRAND_NAME}
                        style={{ width: 48, height: 48, marginBottom: 12 }}
                    />
                ) : null}
                <div
                    style={{
                        width: 32,
                        height: 32,
                        border: "3px solid #e5e7eb",
                        borderTopColor: "#3665F3",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                        margin: "0 auto",
                    }}
                />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        </div>
    );
}

