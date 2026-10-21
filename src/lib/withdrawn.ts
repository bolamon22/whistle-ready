// WITHDRAWN TEAMS (Bo, Oct 21 2026: Space Coast pulled out of Girls Lower School,
// had paid or owed, and "I need to keep them in the registration page until we
// figure out what to do, but I do not want them on the lower school list.")
//
// A withdrawn team stays on its club's registration -- invoice and payments as
// they were, until the office decides on a refund or credit -- but plays nowhere:
// it sits in this placeholder division, waitlisted, so every public page and pool
// already leaves it out (lib/poolMembership), and the Divisions list skips the
// division itself. It is never added to the event's registration divisions, so
// clubs can't pick it on the form.
//
// Pure: no database import, safe for client components.
export const WITHDRAWN_DIVISION = 'Withdrawn'
export const isWithdrawnDivision = (d: string | null | undefined) => String(d || '').trim().toLowerCase() === 'withdrawn'
