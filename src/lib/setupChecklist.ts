// The shared setup checklist's starting items.
//
// One list per tournament (AppSetting `checklists:{id}`), checked off by staff
// on their phones while they set up. Served by /api/tournaments/[id]/checklists,
// which hands these out until the list is first saved; Tasks counts a list that
// was never saved as these ten, none done. Pure -- no database import -- so a
// client page can show the same defaults.

export type ChecklistItem = { id: string; text: string; done: boolean; doneBy?: string; doneAt?: string }

export const DEFAULT_SETUP_ITEMS: ChecklistItem[] = [
  { id: 'd1', text: 'Fields lined & marked', done: false },
  { id: 'd2', text: 'Goals & nets secured', done: false },
  { id: 'd3', text: 'Team tents / benches placed', done: false },
  { id: 'd4', text: 'Registration & check-in table set', done: false },
  { id: 'd5', text: 'Signage & directions posted', done: false },
  { id: 'd6', text: 'Scoreboards / clocks working', done: false },
  { id: 'd7', text: 'Water stations stocked', done: false },
  { id: 'd8', text: 'First-aid / medical station ready', done: false },
  { id: 'd9', text: 'Trash & recycling bins out', done: false },
  { id: 'd10', text: 'Parking & traffic plan set', done: false },
]
