// Chirp's manual and the Help & support Guides tab. The pages themselves live
// in src/help/*.md, one topic per file (see scripts/build-help.mjs); this file
// exposes them plus the page list Chirp links to.
import { GENERATED_HELP } from './helpArticles.generated'

export type HelpArticle = { id: string; title: string; category: string; keywords: string; routes: string[]; body: string }

export const HELP_ARTICLES: HelpArticle[] = GENERATED_HELP

/** Guides tab order. A category not listed here goes last. */
const CATEGORY_ORDER = ['Getting started', 'Setup', 'Registration & money', 'Teams & players', 'Staff', 'Game day', 'Public pages', 'Organization', 'Admin']
export const HELP_CATEGORIES: string[] = [
  ...CATEGORY_ORDER,
  ...Array.from(new Set(HELP_ARTICLES.map(a => a.category))).filter(c => !CATEGORY_ORDER.includes(c)),
]

/** The pages each article is about ('*' = tournament id). A role is given an
 *  article when it can open at least one of them; none = everyone. */
export const ARTICLE_ROUTES: Record<string, string[]> = Object.fromEntries(HELP_ARTICLES.map(a => [a.id, a.routes]))

// Where each page lives, so Chirp can link to it. Labels match TournamentNav;
// paths are relative to /tournaments/{id}. Chirp shows a role only the pages
// that role can open (lib/routeAccess), plus the public pages.
export const TOURNAMENT_PAGES: { label: string; path: string; public?: boolean }[] = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Setup → Tournament setup', path: '/builder' },
  { label: 'Setup → Divisions & teams', path: '/divisions' },
  { label: 'Setup → Scheduler', path: '/scheduler' },
  { label: 'Setup → Assigner', path: '' },
  { label: 'Setup → Checklist', path: '/checklist' },
  { label: 'Setup → Documents', path: '/documents' },
  { label: 'People → Team registrations', path: '/registrations' },
  { label: 'People → Player waivers', path: '/player-waivers' },
  { label: 'People → Coach waivers', path: '/coach-waivers' },
  { label: 'People → Travel & hotels', path: '/travel' },
  { label: 'People → Staff roster', path: '/roster' },
  { label: 'People → Staff applications', path: '/staff-applications' },
  { label: 'People → Vendor requests', path: '/vendor-requests' },
  { label: 'Live → Post scores', path: '/scores' },
  { label: 'Live → Assignments', path: '/assignments' },
  { label: 'Live → Communications', path: '/communications' },
  { label: 'Live → Chirp insights', path: '/chirp-insights' },
  { label: 'Financials', path: '/financials' },
  { label: 'Public page', path: '/public', public: true },
  { label: 'Event page', path: '/event', public: true },
]

/** Org-level pages (not inside one tournament). */
export const ORG_PAGES: { label: string; path: string }[] = [
  { label: 'Forms (home dashboard → Forms)', path: '/dashboard/org/forms' },
]

// Flattened text used as grounding context for the AI help assistant.
export function helpArticlesText(): string {
  return HELP_ARTICLES.map(a => `## ${a.title} [${a.category}]\n${a.body}`).join('\n\n')
}
