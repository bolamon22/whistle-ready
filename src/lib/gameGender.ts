// Whose game it is, from the division name: "boys", "girls", or "both" (coed, or a
// name that says neither). Whole words, so "Women" is not also read as "men" (it
// used to be, which made every women's game a boys' game too). Shared by the
// assigner board's Boys/Girls filter, Auto-assign and Clear assignments so all
// three sort a game the same way.
//
// A division that says neither goes by the event's teams (lib/eventTeams), when they
// are all one side: at an event of boys' or men's teams only, "2030 Elite" is a boys'
// game (Bo, Oct 17 2026: "we should ask if it's boys, men's, girls or women's
// teams"). Pass that side; without it such a game is "both", as before.
export type GameGender = 'boys' | 'girls' | 'both'
export function gameGender(division: string, side: GameGender = 'both'): GameGender {
  const d = ` ${(division || '').toLowerCase().replace(/[^a-z]+/g, ' ')} `
  if (/ (girl|girls|women|womens|ladies) /.test(d)) return 'girls'
  if (/ (boy|boys|men|mens) /.test(d)) return 'boys'
  return side === 'boys' || side === 'girls' ? side : 'both'
}
