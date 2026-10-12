// Whose game it is, from the division name: "boys", "girls", or "both" (coed, or a
// name that says neither). Whole words, so "Women" is not also read as "men" (it
// used to be, which made every women's game a boys' game too). Shared by the
// assigner board's Boys/Girls filter, Auto-assign and Clear assignments so all
// three sort a game the same way.
export type GameGender = 'boys' | 'girls' | 'both'
export function gameGender(division: string): GameGender {
  const d = ` ${(division || '').toLowerCase().replace(/[^a-z]+/g, ' ')} `
  if (/ (girl|girls|women|womens|ladies) /.test(d)) return 'girls'
  if (/ (boy|boys|men|mens) /.test(d)) return 'boys'
  return 'both'
}
