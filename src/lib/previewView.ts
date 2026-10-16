import { readOrgPlan } from '@/lib/orgPlanStore'
import { offGroups } from '@/lib/orgPlans'

// An admin's View as (Bo, Oct 16 2026: "view it as an outside organization, just so
// I can see what they see ... so I can just switch between them"). Three cookies,
// honored only for a signed-in admin (middleware, lib/apiAuth, lib/role-context):
//   preview-role  the role being previewed (set in the browser, lib/role-context)
//   preview-org   the organization being looked at (the "Viewing" picker too)
//   preview-plan  that organization's switched-off feature groups (lib/orgPlans),
//                 written here whenever preview-org is, so middleware can apply the
//                 plan without asking the database.
// Cookies belong to the browser, so each browser window that has its own cookies (a
// private window, another browser profile) keeps its own view.
// Server only.

export const PREVIEW_COOKIE = { path: '/', httpOnly: false, sameSite: 'lax' as const, maxAge: 60 * 60 * 8 }

/** The preview-plan cookie's value for an organization: its off groups, comma-separated. */
export async function previewPlanValue(orgId: string): Promise<string> {
  return offGroups(await readOrgPlan(orgId)).join(',')
}
