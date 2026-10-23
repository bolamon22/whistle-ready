import { staffTypeOf, staffTypeShort } from '@/lib/staffType'

// "Volunteer" / "In training" next to an unpaid person's name (lib/staffType). Paid
// people get nothing, so the pool reads as before for orgs that don't use this.
export default function StaffTypePill({ type, className = '' }: { type: unknown; className?: string }) {
  const t = staffTypeOf(type)
  if (!t) return null
  const look = t === 'trainee' ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-slate-100 text-slate-700 border-slate-300'
  return <span className={`badge border ${look} ${className}`}>{staffTypeShort(t)}</span>
}
