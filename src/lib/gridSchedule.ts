// SCHEDULES LAID OUT AS A FIELD GRID (Bo, Oct 19 2026).
//
// Some organizers send the schedule as a picture of the day: times down the left,
// fields across the top, and each cell the division ("5th-6th", "VAR") or the matchup.
// The importer only read one game per row, so a grid came in as a handful of junk games
// (the LuvLax Turkeyshoot file did: 8 games named "K-2" on 1 Feb 2001).
//
// This finds every grid in a workbook (several sheets, or several blocks on one sheet,
// one per day) and turns each filled cell into a game. Teams are "TBD" unless the cell
// names them ("Team A vs Team B"). No game numbers in a grid, so they run 1, 2, 3... by
// day, time and field.
//
// Pure: takes the sheets as arrays of rows (XLSX sheet_to_json with header: 1, raw), so
// both the preview and the import read a file the same way.

export type GridRow = unknown[]
export type GridSlot = { time: string; cells: (string | null)[] }
export type Grid = { key: string; label: string; sheet: string; fields: string[]; slots: GridSlot[]; dateGuess: string }
export type GridGame = { gameNumber: string; date: string; startTime: string; division: string; location: string; team1: string; team2: string }

const txt = (v: unknown) => (v == null ? '' : v instanceof Date ? '' : String(v)).replace(/\s+/g, ' ').trim()

// A time cell: "9:00", "1:30", "2:10 PM", 12:00 stored as a time (0.5 of a day), or a Date.
// Returns minutes after midnight and whether AM/PM was written.
function timeOf(v: unknown): { min: number; marked: boolean } | null {
  if (typeof v === 'number') return v >= 0 && v < 1 ? { min: Math.round(v * 1440), marked: true } : null
  if (v instanceof Date) return { min: v.getHours() * 60 + v.getMinutes(), marked: true }
  const m = txt(v).match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m?\.?$/i) || txt(v).match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  let h = Number(m[1]); const mm = Number(m[2] || 0); const ap = (m[3] || '').toLowerCase()
  if (h > 23 || mm > 59) return null
  if (ap === 'p' && h < 12) h += 12
  if (ap === 'a' && h === 12) h = 0
  return { min: h * 60 + mm, marked: !!ap || h >= 13 }
}
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

function fieldLabel(v: unknown): string {
  const s = txt(v)
  if (!s) return ''
  return /^\d+\s*[A-Za-z]?$/.test(s) ? `Field ${s.replace(/\s+/g, '').toUpperCase()}` : s
}

// "Mon Nov 1", "11/1/2026", "2026-11-01" in a title or sheet name.
export function dateIn(s: string, year = new Date().getFullYear()): string {
  const iso = s.match(/(20\d\d)-(\d{1,2})-(\d{1,2})/)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
  const us = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (us) { const y = us[3] ? (us[3].length === 2 ? '20' + us[3] : us[3]) : String(year); return `${y}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}` }
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  const mo = s.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b(?:,?\s*(20\d\d))?/)
  if (mo) return `${mo[3] || year}-${String(months.indexOf(mo[1]) + 1).padStart(2, '0')}-${mo[2].padStart(2, '0')}`
  return ''
}

/** Every time-by-field grid in the workbook, in sheet and row order. */
export function findGrids(sheets: { name: string; rows: GridRow[] }[]): Grid[] {
  const out: Grid[] = []
  for (const sh of sheets) {
    const rows = sh.rows
    let r = 0
    let lastTitle = ''
    while (r < rows.length) {
      const row = rows[r] || []
      // The first non-empty cell starts the row. A header row: that cell says time/field
      // (or is blank), at least two field names follow, and the next row starts with a time.
      // The time column is the first filled cell, or the blank one just before it.
      const first = row.findIndex(v => txt(v) !== '' || typeof v === 'number')
      const next = rows[r + 1] || []
      const c0 = [first, first - 1].find(c => c >= 0 && /time|field|^$/i.test(txt(row[c])) && !timeOf(row[c]) &&
        row.slice(c + 1).map(fieldLabel).filter(Boolean).length >= 2 && !!timeOf(next[c])) ?? -1
      const isHeader = first >= 0 && c0 >= 0
      const fieldsHere = isHeader ? row.slice(c0 + 1).map(fieldLabel) : []
      if (!isHeader) {
        const one = row.map(txt).filter(Boolean)
        if (one.length === 1) lastTitle = one[0]
        r++; continue
      }
      // The field columns run until the header's last named field.
      const lastCol = c0 + fieldsHere.reduce((m, f, i) => (f ? i + 1 : m), 0)
      const fields = row.slice(c0 + 1, lastCol + 1).map((v, i) => fieldLabel(v) || `Column ${i + 1}`)
      const slots: GridSlot[] = []
      let prev = -1
      let k = r + 1
      for (; k < rows.length; k++) {
        const t = timeOf((rows[k] || [])[c0])
        if (!t) break
        let min = t.min
        // "1:30" after "12:45" is 1:30 PM: an unmarked time that would go backwards, or an
        // hour before 7, is in the afternoon.
        if (!t.marked && min < 12 * 60 && (min < 7 * 60 || min < prev)) min += 12 * 60
        prev = min
        const cells = fields.map((_, i) => txt((rows[k] || [])[c0 + 1 + i]) || null)
        slots.push({ time: hhmm(min), cells })
      }
      const games = slots.reduce((n, s) => n + s.cells.filter(Boolean).length, 0)
      if (games > 0) {
        const label = lastTitle || sh.name
        out.push({ key: `${sh.name}#${r}`, label, sheet: sh.name, fields, slots, dateGuess: dateIn(label) || dateIn(sh.name) })
      }
      lastTitle = ''
      r = Math.max(k, r + 1)
    }
  }
  return out
}

export const gridGameCount = (g: Grid) => g.slots.reduce((n, s) => n + s.cells.filter(Boolean).length, 0)

/** The games in these grids, each grid on its date. Grids with no date are left out. */
export function gridGames(grids: Grid[], dateFor: (g: Grid) => string): GridGame[] {
  const rows: Omit<GridGame, 'gameNumber'>[] = []
  for (const g of grids) {
    const date = dateFor(g)
    if (!date) continue
    for (const s of g.slots) s.cells.forEach((cell, i) => {
      if (!cell) return
      // "Team A vs Team B" (optionally "5th-6th: Team A vs Team B") names the teams.
      const m = cell.match(/^(?:(.+?):\s*)?(.+?)\s+(?:vs\.?|v\.?|@)\s+(.+)$/i)
      rows.push({ date, startTime: s.time, location: g.fields[i], division: m ? (m[1] || '').trim() : cell, team1: m ? m[2].trim() : 'TBD', team2: m ? m[3].trim() : 'TBD' })
    })
  }
  const fieldNo = (f: string) => { const m = f.match(/(\d+)\s*([A-Za-z]?)/); return m ? Number(m[1]) * 100 + (m[2] ? m[2].toUpperCase().charCodeAt(0) - 64 : 0) : 99999 }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || fieldNo(a.location) - fieldNo(b.location))
  return rows.map((g, i) => ({ ...g, gameNumber: String(i + 1) }))
}
