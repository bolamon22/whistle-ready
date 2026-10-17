import EventChrome from '@/app/tournaments/[id]/_eventChrome'

// A champion's share page reads as part of the event's schedule and results: same
// org header, event hero and fact strip as /public, with SCHEDULE marked.
export default function ChampionsLayout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  return <EventChrome tournamentId={params.id} active="schedule">{children}</EventChrome>
}
