import EventChrome from '@/app/tournaments/[id]/_eventChrome'

export default function Layout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  return <EventChrome tournamentId={params.id} active="waiver">{children}</EventChrome>
}
