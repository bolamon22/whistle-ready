// The one list of music for every Reel maker (the scheduler's Make a Reel in
// dashboard/org/social/ReelBuilder.tsx, and the player-post Reels in
// components/ReelMaker.tsx). All tracks were made from scratch for Whistle Ready
// and live in public/social-music/<id>.mp3, so there's nothing to license and
// nothing for Instagram or Facebook to mute. Bo, Oct 18 2026: merge the two lists
// "so all ten are in both places"; cut tracks here and both makers follow.
// bpm drives the scheduler's beat-timed cuts, so keep it accurate when adding one.

export type ReelSong = { id: string; title: string; mood: string; bpm: number }

export const REEL_SONGS: readonly ReelSong[] = [
  { id: 'game-day', title: 'Game Day', mood: 'Driving, upbeat', bpm: 128 },
  { id: 'big-stage', title: 'Big Stage', mood: 'Hype, hard-hitting', bpm: 140 },
  { id: 'warm-up', title: 'Warm-Up', mood: 'Relaxed, feel-good', bpm: 96 },
  { id: 'spooky-stomp', title: 'Spooky Stomp', mood: 'Halloween, playful', bpm: 118 },
  { id: 'holiday-rush', title: 'Holiday Rush', mood: 'Festive, bright', bpm: 132 },
  { id: 'trap-hype', title: 'Trap Hype', mood: 'Modern trap, the Whistle Ready spot', bpm: 144 },
  { id: 'electro-drive', title: 'Electro Drive', mood: 'Dance, four on the floor', bpm: 128 },
  { id: 'stadium-stomp', title: 'Stadium Stomp', mood: 'Stomp-clap crowd energy', bpm: 100 },
  { id: 'drumline', title: 'Drumline', mood: 'Marching snares and bass drums', bpm: 120 },
  { id: 'cinematic-rise', title: 'Cinematic Rise', mood: 'Booms and swells, calmer', bpm: 90 },
] as const

export const songUrl = (id: string) => `/social-music/${id}.mp3`
