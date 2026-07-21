import { redirect } from 'next/navigation'

// The standalone Event page editor has been folded into Tournament setup (/builder).
// Its sections map onto the wizard's PUBLIC group — hero banner, page builder,
// overview, hotels, rules and contacts — while Location now comes from Venues &
// fields (one place to describe where you play) and fees/divisions are derived from
// Team fees and Divisions rather than typed a second time.
//
// Kept as a redirect so existing links and bookmarks still land somewhere useful.
export default function EventPageEditorRedirect({ params }: { params: { id: string } }) {
  redirect(`/tournaments/${params.id}/builder?section=pagebuilder`)
}
