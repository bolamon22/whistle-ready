// The emergency action plan for one event (Bo, Oct 14 2026: "maybe have an
// emergency plan just so we have one"). One plan per event, stored as JSON in
// AppSetting `eap:<tournamentId>` (no migration). Every staff login can read it;
// directors, field directors and athletic trainers edit it. Shared by the API and
// the page, so this file must stay free of server imports.

export type PlanField = { key: string; label: string; hint?: string; long?: boolean; phone?: boolean; def?: string }
export type PlanSection = { key: string; title: string; fields: PlanField[] }

export const EAP_SECTIONS: PlanSection[] = [
  { key: 'venue', title: 'Where we are (tell 911 this)', fields: [
    { key: 'venueName', label: 'Venue name' },
    { key: 'address', label: 'Street address for EMS', hint: 'The address an ambulance should drive to, not a mailing address.' },
    { key: 'emsEntrance', label: 'Ambulance entrance', long: true, hint: 'Which gate or lot, and how to reach the fields from it.' },
  ] },
  { key: 'people', title: 'Who does what', fields: [
    { key: 'medicalLead', label: 'Medical lead (athletic trainer)' },
    { key: 'medicalPhone', label: 'Medical lead phone', phone: true },
    { key: 'directorName', label: 'Director on site' },
    { key: 'directorPhone', label: 'Director phone', phone: true },
    { key: 'calls911', label: 'Who calls 911', long: true, def: 'The athletic trainer. If the trainer is not at the field, the nearest staff member calls 911 first, then the trainer and the director.' },
    { key: 'meetsEms', label: 'Who meets the ambulance', long: true, def: 'Field Ops goes to the ambulance entrance and walks the crew to the field.' },
  ] },
  { key: 'care', title: 'Hospital and urgent care', fields: [
    { key: 'erName', label: 'Nearest emergency room' },
    { key: 'erAddress', label: 'ER address' },
    { key: 'erPhone', label: 'ER phone', phone: true },
    { key: 'ucName', label: 'Nearest urgent care' },
    { key: 'ucAddress', label: 'Urgent care address' },
    { key: 'ucPhone', label: 'Urgent care phone', phone: true },
  ] },
  { key: 'equipment', title: 'Equipment', fields: [
    { key: 'aed', label: 'AED location', long: true, hint: 'Where each AED is, and who has it if it moves with the trainer.' },
    { key: 'firstAid', label: 'First aid, ice and water', long: true },
  ] },
  { key: 'weather', title: 'Weather', fields: [
    { key: 'lightning', label: 'Lightning', long: true, def: 'Clear every field as soon as thunder is heard or lightning is seen. Players, coaches and fans go to cars or a building, not tents or dugouts. Play resumes 30 minutes after the last thunder or lightning; each new strike restarts the clock. The director makes the call and sends a broadcast.' },
    { key: 'shelter', label: 'Shelter locations', long: true },
    { key: 'heat', label: 'Heat', long: true, def: 'Water breaks are allowed at any stoppage on hot days. The athletic trainer can call extra breaks or pause a game. Anyone with signs of heat illness comes off and goes to the trainer.' },
  ] },
  { key: 'other', title: 'Other emergencies', fields: [
    { key: 'concussion', label: 'Suspected concussion', long: true, def: 'Remove the player from play right away. They do not return that day. Tell a parent, log it in Incidents, and the player returns only with written clearance from a licensed health care provider.' },
    { key: 'lostChild', label: 'Lost child', long: true, def: 'Tell the nearest staff member and the director right away. The director broadcasts a description to all staff. Field Ops watches the parking lot exits.' },
    { key: 'police', label: 'Police non-emergency number', phone: true },
    { key: 'notes', label: 'Anything else', long: true },
  ] },
]

export const EAP_KEYS = EAP_SECTIONS.flatMap(s => s.fields.map(f => f.key))

/** The defaults for the fields that have one, for a new plan. */
export function eapDefaults(): Record<string, string> {
  const o: Record<string, string> = {}
  for (const s of EAP_SECTIONS) for (const f of s.fields) if (f.def) o[f.key] = f.def
  return o
}

/** Roles that may edit (athletic trainers are checked separately, by Worker roles). */
export const EAP_EDIT_ROLES = ['admin', 'director', 'field_director']
