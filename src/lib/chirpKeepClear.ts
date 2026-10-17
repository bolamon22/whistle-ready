import { useEffect, useState, type RefObject } from 'react'

// Parts of a public page that Chirp's greeting card must not cover (Bo, Oct 17
// 2026: "Looking for your team?" sat on the champions' Light up their path
// button). A component marks itself with useKeepChirpClear(ref); while anything
// marked is in the lower 60% of the screen, where the card sits (phones: full
// width), PublicChirp holds its greeting back and shows it once the visitor
// scrolls past. The Ask Chirp button itself always stays.

const EVENT = 'chirp-keep-clear'
const inTheWay = new Set<number>()
let nextId = 0

export function useKeepChirpClear(ref: RefObject<Element>) {
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const id = ++nextId
    const set = (visible: boolean) => {
      if (visible === inTheWay.has(id)) return
      if (visible) inTheWay.add(id); else inTheWay.delete(id)
      window.dispatchEvent(new Event(EVENT))
    }
    const io = new IntersectionObserver(entries => set(entries[entries.length - 1].isIntersecting), { rootMargin: '-40% 0px 0px 0px' })
    io.observe(el)
    return () => { io.disconnect(); set(false) }
  }, [ref])
}

/** True while something marked with useKeepChirpClear is where the greeting card would sit. */
export function useChirpKeepClear(): boolean {
  const [held, setHeld] = useState(false)
  useEffect(() => {
    const update = () => setHeld(inTheWay.size > 0)
    update()
    window.addEventListener(EVENT, update)
    return () => window.removeEventListener(EVENT, update)
  }, [])
  return held
}
