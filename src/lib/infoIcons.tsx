import { Info, HeartPulse, Shirt, SquareParking, ScrollText, Utensils, Phone, CloudLightning } from 'lucide-react'

// Icons for Tournament info sections, shown on the public schedule page under Info.
//
// One list shared by the editor and the public page. They used to keep separate
// copies — the editor a list of raw slugs, the page a slug→component map — so the
// dropdown showed things like "square-parking" and "cloud-lightning" with no hint of
// what they meant or how they'd look.
export const INFO_ICON_CHOICES = [
  { key: 'info',            label: 'General info',       Icon: Info },
  { key: 'heart-pulse',     label: 'Medical & trainers', Icon: HeartPulse },
  { key: 'square-parking',  label: 'Parking',            Icon: SquareParking },
  { key: 'shirt',           label: 'Lost & found',       Icon: Shirt },
  { key: 'utensils',        label: 'Food & concessions', Icon: Utensils },
  { key: 'scroll-text',     label: 'Rules & policies',   Icon: ScrollText },
  { key: 'phone',           label: 'Contact / HQ',       Icon: Phone },
  { key: 'cloud-lightning', label: 'Weather',            Icon: CloudLightning },
] as const

/** slug → component, for rendering a saved section. */
export const INFO_ICONS: Record<string, any> = Object.fromEntries(
  INFO_ICON_CHOICES.map(c => [c.key, c.Icon])
)

export function infoIcon(key: string) {
  return INFO_ICONS[key] || Info
}
