'use client'

// Snap's avatar: an inline whistle-face badge that always renders. If /snap.png
// exists it overlays on top (the uploaded logo wins); otherwise the face shows.
export default function SnapAvatar({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`relative inline-block rounded-full overflow-hidden bg-[#0f1f3d] shrink-0 ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" width={size} height={size} className="absolute inset-0">
        <circle cx="16" cy="16" r="16" fill="#0f1f3d" />
        <rect x="20" y="15.4" width="8.2" height="5.6" rx="2.4" fill="#e2e8f0" stroke="#94a3b8" stroke-width="0.8" />
        <circle cx="15.4" cy="18" r="9" fill="#eef2f6" stroke="#94a3b8" stroke-width="0.9" />
        <rect x="11.2" y="9.2" width="8.2" height="2.3" rx="1" fill="#334155" />
        <circle cx="20" cy="7.4" r="2.3" fill="none" stroke="#2dd4bf" stroke-width="1.5" />
        <circle cx="12.3" cy="17.7" r="1.75" fill="#0f1f3d" />
        <circle cx="18.5" cy="17.7" r="1.75" fill="#0f1f3d" />
        <circle cx="11.8" cy="17.1" r="0.5" fill="#ffffff" />
        <circle cx="18.0" cy="17.1" r="0.5" fill="#ffffff" />
        <path d="M12.5 21.3 q2.9 2.3 5.9 0" fill="none" stroke="#334155" stroke-width="1.25" stroke-linecap="round" />
      </svg>
      <img
        src="/snap.png" alt=""
        className="absolute inset-0 w-full h-full object-cover"
        onError={(e) => { e.currentTarget.style.display = 'none' }}
      />
    </span>
  )
}
