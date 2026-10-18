'use client'
// The org's Reel music list (lib/reelMusic) for the Reel makers: load it, add an MP3
// to it, remove one. Failing to load just means only the built-in tracks show.
import { useCallback, useEffect, useState } from 'react'
import { upload as blobUpload } from '@vercel/blob/client'
import type { OrgTrack } from '@/lib/reelMusic'

export function useOrgMusic() {
  const [tracks, setTracks] = useState<OrgTrack[]>([])
  useEffect(() => {
    let alive = true
    fetch('/api/social/music').then(r => r.ok ? r.json() : { tracks: [] }).then(j => { if (alive) setTracks(Array.isArray(j.tracks) ? j.tracks : []) }).catch(() => {})
    return () => { alive = false }
  }, [])

  /** Upload the file and add it to the list; returns the new track. */
  const add = useCallback(async (file: File, title: string, category: string): Promise<OrgTrack> => {
    const name = file.name.replace(/[^\w.\-]+/g, '_') || 'track.mp3'
    const type = file.type || (/\.m4a$/i.test(name) ? 'audio/x-m4a' : /\.wav$/i.test(name) ? 'audio/wav' : 'audio/mpeg')
    const up = await blobUpload(`reel-music/${name}`, new File([file], name, { type }), { access: 'public', handleUploadUrl: '/api/social/music/upload', multipart: true })
    const r = await fetch('/api/social/music', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, category, url: up.url }) })
    const j = await r.json().catch(() => ({} as any))
    if (!r.ok || !j.track) throw new Error(j.error || 'Could not save the track')
    setTracks(j.tracks)
    return j.track as OrgTrack
  }, [])

  const remove = useCallback(async (id: string) => {
    const r = await fetch(`/api/social/music?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    const j = await r.json().catch(() => ({} as any))
    if (!r.ok) throw new Error(j.error || 'Could not remove it')
    setTracks(j.tracks)
  }, [])

  return { tracks, add, remove }
}
