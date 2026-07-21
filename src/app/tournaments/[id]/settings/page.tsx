import { redirect } from 'next/navigation'

// Settings has been folded into Tournament setup (/builder). Everything that lived
// here — general info, venues, fees, registration types, pay rates, tiebreakers,
// tournament info, broadcast permissions — is now a section of the setup wizard, and
// Copy tournament moved to the dashboard.
//
// Kept as a redirect so existing links, bookmarks and muscle memory still land
// somewhere useful instead of a 404.
export default function SettingsRedirect({ params }: { params: { id: string } }) {
  redirect(`/tournaments/${params.id}/builder`)
}
