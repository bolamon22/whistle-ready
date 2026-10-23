// Who sees the Seeding card (Bo, Oct 23 2026: "this only shows up on the schedulers and
// admin, field director view. Also maybe the assigners, but it's not a public view").
// Not refs, scorekeepers or other game-day staff, and never coaches, parents or the public.
// No database import: the card (a client component) and api/tournaments/[id]/seeding share it.
export const SEEDING_ROLES = ['admin', 'director', 'scheduler', 'field_director', 'assigner'] as const
export const seesSeeding = (role: string | null | undefined) => (SEEDING_ROLES as readonly string[]).includes(String(role || ''))
