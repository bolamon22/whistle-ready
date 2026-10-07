'use client'

// Leaflet's stylesheet is imported by HotelBrowser, so it is on the page before this loads.
import L from 'leaflet'
import { useEffect, useRef } from 'react'
import { hotelChain, milesLabel, onMap, rateLabel, safeUrl, type EventHotel, type MapPlace } from '@/lib/eventHotels'

// The hotels page map, behind its "View map" button (Bo, Oct 7 2026: "can we have
// a view map filter and have it default on hide"). HotelBrowser loads this file
// only when someone opens the map, so Leaflet stays off the page otherwise.
//
// Pins carry the hotel's number in the list below (the list numbers itself while
// the map is open), so they follow the sort and the filters. Event-rate hotels are
// teal, the rest white, sold-out grey; the fields are orange, from the event's
// venue addresses. A tap shows the hotel's photo, chain, miles and price with its
// booking button. Pins that would sit on top of each other spread into a small
// ring so every number shows.
//
// Map pictures: OpenStreetMap's tiles, credited in the corner as their policy asks.
// They suit a page this size; a busier site would move to a paid tile service by
// changing TILES.

const TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const CREDIT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const PIN = 26

type Kind = 'event' | 'other' | 'sold' | 'fields'
const PIN_CLASS: Record<Kind, string> = {
  event: 'bg-teal-700 text-white border-white',
  other: 'bg-white text-slate-900 border-slate-600',
  sold: 'bg-slate-300 text-slate-600 border-white',
  fields: 'bg-orange-600 text-white border-white',
}
const FLAG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>'

const kindOf = (h: EventHotel): Kind => h.soldOut ? 'sold' : h.eventRate !== false ? 'event' : 'other'

function icon(kind: Kind, label: string, dx = 0, dy = 0) {
  return L.divIcon({
    className: '',
    html: `<div class="flex items-center justify-center rounded-full border-2 shadow-md font-bold text-[12px] leading-none ${PIN_CLASS[kind]}" style="width:${PIN}px;height:${PIN}px;font-family:inherit">${label}</div>`,
    iconSize: [PIN, PIN],
    iconAnchor: [PIN / 2 - dx, PIN / 2 - dy],
    popupAnchor: [dx, dy - PIN / 2],
  })
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
  const e = document.createElement(tag)
  e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

/** A hotel's popup, built from elements so staff-typed text is never read as markup. */
function hotelPopup(h: EventHotel, n: number, fallbackUrl: string, onShow?: (i: number) => void) {
  const box = el('div', 'w-56')
  const photo = (h.photos || [])[0]
  if (photo) { const img = el('img', 'block w-full h-24 object-cover rounded-lg mb-2'); img.src = photo; img.alt = ''; box.append(img) }
  box.append(el('div', 'font-bold text-[13px] leading-snug text-slate-900', `${n}. ${h.name}`))
  const chain = hotelChain(h)
  const meta = [chain !== 'Other' ? chain : '', milesLabel(h.miles), rateLabel(h.rate)].filter(Boolean).join(' · ')
  if (meta) box.append(el('div', 'text-xs text-slate-500 mt-0.5', meta))
  if (h.eventRate !== false && !h.soldOut) box.append(el('div', 'text-[11px] font-semibold uppercase tracking-wide text-teal-700 mt-1', 'Event rate'))
  const href = safeUrl(h.url) || safeUrl(fallbackUrl)
  if (h.soldOut) box.append(el('div', 'mt-2 text-center rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-semibold py-1.5', 'Sold out'))
  else if (href) {
    const a = el('a', 'mt-2 block text-center rounded-full bg-teal-600 hover:bg-teal-700 !text-white !no-underline text-xs font-semibold py-2', 'See rates & book')
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'
    box.append(a)
  }
  if (onShow) {
    const more = el('button', 'mt-1.5 block w-full text-center text-xs font-semibold text-teal-700 hover:text-teal-900', photo ? 'See photos below' : 'See it in the list')
    more.type = 'button'
    more.onclick = () => onShow(n - 1)
    box.append(more)
  }
  return box
}

function fieldsPopup(f: MapPlace) {
  const box = el('div', 'w-52')
  box.append(el('div', 'font-bold text-[13px] leading-snug text-slate-900', f.name || 'The fields'))
  if (f.address) box.append(el('div', 'text-xs text-slate-500 mt-0.5', f.address))
  const a = el('a', 'mt-2 inline-block text-xs font-semibold !text-teal-700 hover:!text-teal-900', 'Directions')
  a.href = `https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`
  a.target = '_blank'; a.rel = 'noopener noreferrer'
  box.append(a)
  return box
}

type Pin = { marker: L.Marker; kind: Kind; label: string; fixed: boolean }
type Pt = { x: number; y: number }

/** Where a cluster's pins go: a ring around the fields pin when it is in the cluster, else around their middle, each roughly in its own direction. */
function ring(ids: number[], pins: Pin[], base: Pt[]): Map<number, Pt> {
  const out = new Map<number, Pt>()
  if (ids.length === 1) { out.set(ids[0], base[ids[0]]); return out }
  const anchor = ids.find(i => pins[i].fixed)
  const around = ids.filter(i => i !== anchor)
  const c = anchor !== undefined ? base[anchor] : { x: around.reduce((s, i) => s + base[i].x, 0) / around.length, y: around.reduce((s, i) => s + base[i].y, 0) / around.length }
  if (anchor !== undefined) out.set(anchor, base[anchor])
  const n = around.length
  const room = (n * (PIN + 4)) / (2 * Math.PI) // enough ring for every pin
  const r = Math.max(anchor !== undefined ? PIN + 4 : PIN / 2 + 3 + 2 * n, room)
  const dir = (i: number) => Math.atan2(base[i].y - c.y, base[i].x - c.x)
  // Round the fields, the hotels fan out on the side they are really on; a cluster
  // of hotels alone spreads all the way round its middle.
  const step = (PIN + 4) / r
  const fan = anchor !== undefined && n * step < 2 * Math.PI
  const mid = Math.atan2(around.reduce((s, i) => s + Math.sin(dir(i)), 0), around.reduce((s, i) => s + Math.cos(dir(i)), 0))
  const rel = (i: number) => { let d = dir(i) - mid; while (d <= -Math.PI) d += 2 * Math.PI; while (d > Math.PI) d -= 2 * Math.PI; return d }
  const order = [...around].sort((a, b) => (fan ? rel(a) - rel(b) : dir(a) - dir(b)))
  order.forEach((i, k) => {
    const a = fan ? mid + step * (k - (n - 1) / 2) : dir(order[0]) + (2 * Math.PI * k) / n
    out.set(i, { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) })
  })
  return out
}

/**
 * Pins closer than a pin's width move into small rings so every number shows.
 * Moving a pin can bring it onto another one, so clusters that touch after a pass
 * join up and are laid out again (a few passes settle it).
 */
function spread(map: L.Map, pins: Pin[]) {
  const base: Pt[] = pins.map(p => { const q = map.latLngToLayerPoint(p.marker.getLatLng()); return { x: q.x, y: q.y } })
  let pos: Pt[] = base.map(p => ({ ...p }))
  let groups: number[][] = pins.map((_, i) => [i])
  for (let pass = 0; pass < 8; pass++) {
    const gid: number[] = []
    groups.forEach((g, k) => g.forEach(i => (gid[i] = k)))
    const parent = groups.map((_, k) => k)
    const root = (k: number): number => (parent[k] === k ? k : (parent[k] = root(parent[k])))
    let joined = false
    for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
      if (root(gid[i]) !== root(gid[j]) && Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y) < PIN + 2) { parent[root(gid[i])] = root(gid[j]); joined = true }
    }
    if (!joined) break
    const next: Record<number, number[]> = {}
    groups.forEach((g, k) => (next[root(k)] = (next[root(k)] || []).concat(g)))
    groups = Object.values(next)
    pos = base.map(p => ({ ...p }))
    for (const g of groups) ring(g, pins, base).forEach((q, i) => (pos[i] = q))
  }
  pins.forEach((p, i) => p.marker.setIcon(icon(p.kind, p.label, Math.round(pos[i].x - base[i].x), Math.round(pos[i].y - base[i].y))))
}

// Popups open clear of the zoom buttons in the top-left corner.
const POPUP = { autoPanPaddingTopLeft: L.point(56, 16), autoPanPaddingBottomRight: L.point(16, 16) }

export default function HotelMap({ hotels, fields = [], fallbackUrl = '', onShowHotel }: {
  /** The hotels in the list's order; a pin's number is its place in this list. */
  hotels: EventHotel[]
  fields?: MapPlace[]
  fallbackUrl?: string
  /** "See photos below": scroll to that hotel (0-based place in `hotels`). */
  onShowHotel?: (index: number) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const pinsRef = useRef<Pin[]>([])
  const show = useRef(onShowHotel)
  show.current = onShowHotel

  useEffect(() => {
    if (!box.current) return
    const map = L.map(box.current, { scrollWheelZoom: false, zoomSnap: 0.5 })
    L.tileLayer(TILES, { maxZoom: 18, attribution: CREDIT }).addTo(map)
    const layer = L.layerGroup().addTo(map)
    map.on('zoomend', () => spread(map, pinsRef.current))
    mapRef.current = map
    layerRef.current = layer
    return () => { map.remove(); mapRef.current = null; layerRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current, layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const pins: Pin[] = []
    for (const f of fields) {
      const marker = L.marker([f.lat, f.lng], { icon: icon('fields', FLAG), zIndexOffset: 1000, title: f.name || 'The fields', alt: f.name || 'The fields' })
        .bindPopup(fieldsPopup(f), { maxWidth: 240, ...POPUP })
      marker.addTo(layer)
      pins.push({ marker, kind: 'fields', label: FLAG, fixed: true })
    }
    hotels.forEach((h, i) => {
      if (!onMap(h)) return
      const kind = kindOf(h)
      const marker = L.marker([h.lat as number, h.lng as number], { icon: icon(kind, String(i + 1)), title: `${i + 1}. ${h.name}`, alt: `${i + 1}. ${h.name}`, riseOnHover: true })
        .bindPopup(() => hotelPopup(h, i + 1, fallbackUrl, j => { map.closePopup(); show.current?.(j) }), { maxWidth: 260, ...POPUP })
      marker.addTo(layer)
      pins.push({ marker, kind, label: String(i + 1), fixed: false })
    })
    pinsRef.current = pins
    if (pins.length) {
      const bounds = L.latLngBounds(pins.map(p => p.marker.getLatLng()))
      if (pins.length === 1) map.setView(bounds.getCenter(), 13)
      else map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 })
    } else if (!map.getZoom()) {
      map.setView([27.8, -81.7], 6) // Florida, until there is something to show
    }
    spread(map, pins)
  }, [hotels, fields, fallbackUrl])

  return (
    <div>
      <div ref={box} className="h-[280px] sm:h-[380px] rounded-2xl border border-slate-200 bg-slate-100 overflow-hidden z-0" style={{ fontFamily: 'inherit' }} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500" aria-hidden>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-full bg-teal-700" />Event rate</span>
        <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-full bg-white border-2 border-slate-600" />Other hotels</span>
        {hotels.some(h => h.soldOut && onMap(h)) && <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-full bg-slate-300" />Sold out</span>}
        {fields.length > 0 && <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-full bg-orange-600" />Fields</span>}
      </div>
    </div>
  )
}
