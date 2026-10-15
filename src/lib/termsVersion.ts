// The current Terms of Use version, shared by the /terms page, the sign-in prompt
// and every form that asks people to agree. Client-safe: no database imports.
//
// Bump TERMS_VERSION (and TERMS_UPDATED) whenever /terms changes in a way people
// should agree to again. Everyone who signs in is then asked once more, and new
// form submissions record the new version. A typo fix does not need a bump.
export const TERMS_VERSION = '2026-10-15'
export const TERMS_UPDATED = 'October 15, 2026'

// The company that owns the Whistle Ready software and is the other party to the
// Terms of Use. Organizers such as Sunshine Events Group are customers that run
// their events on it; they are not the licensor.
export const TERMS_OWNER = 'Whistle Ready LLC'

// Shown beside every "I agree" box, so the wording stays the same everywhere.
export const TERMS_AGREE_LABEL = 'I agree to the Whistle Ready Terms of Use'
