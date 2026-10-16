// Which logins work one organization at a time (lib/orgMembers): the roles that run
// an organization's events. An event, game, registration or payment of any other
// organization is not theirs, even when the same login works there too (it switches
// first). Staff (refs, scorekeepers), club and family logins reach events through
// their own records, and admins see everything. Shared by middleware and lib/apiAuth;
// no imports, so the edge runtime can use it.
export const ORG_SCOPED_ROLES = ['director', 'scheduler', 'assigner', 'field_director']
export const orgScoped = (role: unknown): boolean => ORG_SCOPED_ROLES.includes(String(role || ''))
