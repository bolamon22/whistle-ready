import { redirect } from 'next/navigation'

// Short recruiting links: whistleready.app/join/<code>. The code alone identifies
// the org (AppSetting joinCodeMap:{code}, minted by /api/workers/recruit-link).
// Kept as a redirect so /join/page.tsx stays the single signup implementation.
export default function ShortJoinLink({ params }: { params: { code: string } }) {
  redirect(`/join?code=${encodeURIComponent(params.code)}`)
}
