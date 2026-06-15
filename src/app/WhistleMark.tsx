// Whistle Ready brand mark — inline SVG so it scales crisply, has a transparent
// background, and needs no asset file. Teal whistle with an orange pea.
export default function WhistleMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 44" className={className} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Whistle Ready">
      {/* top loop */}
      <circle cx="20" cy="9" r="4.5" fill="none" stroke="#14b8a6" strokeWidth="3" />
      {/* mouthpiece */}
      <rect x="33" y="16.5" width="27" height="13" rx="6.5" fill="#14b8a6" />
      {/* body */}
      <circle cx="22" cy="26" r="16" fill="#14b8a6" />
      {/* air hole */}
      <circle cx="22" cy="26" r="6" fill="#0d9488" />
      {/* orange pea */}
      <circle cx="22" cy="26" r="2.6" fill="#f97316" />
    </svg>
  )
}
