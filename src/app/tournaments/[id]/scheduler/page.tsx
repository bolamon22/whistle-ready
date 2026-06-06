'use client'
import { useEffect, useState } from 'react'
import TournamentNav from '../TournamentNav'
import toast, { Toaster } from 'react-hot-toast'

interface Game {
  id: string
  gameNumber: string
  date: string
  startTime: string
  location: string
  division: string
  pool: string | null
  team1: string
  team2: string
  isChampionship: boolean
  isCanceled: boolean
}

interface Field {
  venueName: string
  fieldName: string
  fullName: string
}

const PALETTE = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-red-500',
  'bg-amber-500',
  'bg-indigo-500',
  'bg-cyan-500',
]

function divColor(div: string, divs: string[]) {
  const i = divs.indexOf(div)
  return PALETTE[i % PALETTE.length] ?? PALETTE[0]
}

function makeSlots(startH: number, endH: number, inc: number) {
  const slots: string[] = []
  for (let h = startH; h < endH; h++) {
    for (let m = 0; m < 60; m += inc) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return slots
}

function fmtTime(t: string) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function fmtDate(d: string) {
  if (!d) return d
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function gameType(g: Game) {
  if (g.isChampionship) return 'championship'
  if (g.gameNumber.startsWith('B')) return 'bracket'
  if (g.pool) return 'pool'
  return 'regular'
}

export default function SchedulerPage({ params }: { params: { id: string } }) {
  const [games, setGames]               = useState<Game[]>([])
  const [fields, setFields]             = useState<Field[]>([])
  const [dates, setDates]               = useState<string[]>([])
  const [activeDate, setActiveDate]     = useState('')
  const [increment, setIncrement]       = useState(30)
  const [startH, setStartH]             = useState(8)
  const [endH, setEndH]                 = useState(19)
  const [loading, setLoading]           = useState(true)
  const [saving, setSaving]             = useState(false)
  const [unscheduling, setUnscheduling] = useState(false)
  const [dragId, setDragId]             = useState<string | null>(null)
  const [overCell, setOverCell]         = useState<string | null>(null)