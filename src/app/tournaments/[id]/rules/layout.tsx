import EventChrome from '@/app/tournaments/[id]/_eventChrome'

export default function Layout({ children, params }: { children: React.ReactNode; params: { id: string } }) {
  return <EventChrome tournamentId={params.id}>{children}</EventChrome>
}
