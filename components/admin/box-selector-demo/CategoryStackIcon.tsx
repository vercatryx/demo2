/**
 * Visual for “category / subcategory” hierarchy — stacked bands, not a folder.
 * Used in box-selector demo navigation rows.
 */
export function CategoryStackIcon({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            viewBox="0 0 24 24"
            width={24}
            height={24}
            aria-hidden
        >
            {/* Three offset bands — reads as taxonomy / grouping */}
            <path
                fill="currentColor"
                fillOpacity={0.22}
                d="M4 16.5h16v3H4v-3zm2.5-5h11v3h-11v-3zM9 6h6v3H9V6z"
            />
            <path
                fill="currentColor"
                fillOpacity={0.45}
                d="M5 15.5h14v1H5v-1zm2.5-5h9v1h-9v-1zM10 7h4v1h-4V7z"
            />
            <path
                stroke="currentColor"
                strokeWidth={1.25}
                strokeLinejoin="round"
                fill="none"
                d="M4.5 19.5h15M7 14.5h10M10.5 9.5h3"
            />
        </svg>
    );
}
