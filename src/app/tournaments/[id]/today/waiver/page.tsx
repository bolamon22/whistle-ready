import type { Metadata } from 'next'
import GameDayHeader from '@/components/GameDayHeader'
import PlayerWaiver from '../../player-waiver/page'

// The player waiver inside game day mode: the real waiver form
// (/tournaments/<id>/player-waiver, same signing and saving) under the slim Game day
// header, so a parent signing at the field never lands on the full site.
export const revalidate = 30
export const metadata: Metadata = { title: 'Player waiver', robots: { index: false, follow: true } }

export default async function GameDayWaiver({ params }: { params: { id: string } }) {
  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <GameDayHeader tournamentId={params.id} title="Player waiver" fullHref={`/tournaments/${params.id}/player-waiver?full=1`} />
      <PlayerWaiver params={params} />
    </div>
  )
}
