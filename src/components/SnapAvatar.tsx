'use client'

// Snap's face. Shows /snap.png (drop the logo there); if it's missing, falls
// back to a teal "S" badge so nothing looks broken.
export default function SnapAvatar({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full overflow-hidden bg-[#0f1f3d] text-white font-bold shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.46) }}
      aria-hidden="true"
    >
      <img
        src="/snap.png" alt="" width={size} height={size}
        className="w-full h-full object-cover"
        onError={(e) => { const t = e.currentTarget; t.style.display = 'none'; const p = t.parentElement; if (p && !p.dataset.fb) { p.dataset.fb = '1'; p.appendChild(document.createTextNode('S')) } }}
      />
    </span>
  )
}
