// components/MapLoadingOverlay.jsx
"use client";

import React from "react";

export default function MapLoadingOverlay({ show }) {
    if (!show) return null;

    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                background:
                    "linear-gradient(to bottom, rgba(240,242,245,0.8), rgba(225,228,232,0.6))",
                backdropFilter: "blur(1.5px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2000,
                pointerEvents: "auto",
            }}
        >
            <div
                style={{
                    width: 40,
                    height: 40,
                    borderRadius: "50%",
                    border: "3px solid rgba(0,0,0,0.1)",
                    borderTopColor: "#2563eb",
                    animation: "map-ring-spin 0.8s linear infinite",
                }}
            />
            <style>{`
        @keyframes map-ring-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}
