// Why the club-invite send button will not send.
//
// A PAGE FILE CANNOT EXPORT THIS. Next generates a type check that allows a route file
// to export only `default` and its own config keys, so hoisting a helper into the page
// to make it testable costs three type errors and silently passes the build, because
// next.config.js sets typescript.ignoreBuildErrors. Measured Sep 18 2026: baseline 73,
// 76 with the export in the page, 73 again from here.
/**
 * WHY THE SEND BUTTON IS OFF, in words, or '' when it is not.
 *
 * It used to just grey out, and the only clue was a "(0)" inside its own label. Bo
 * clicked through two sends that way -- a Monster Mash reminder and a Fall Classic one
 * -- believed both had gone, and found out days later that neither had: a disabled
 * button says nothing, and the confirmation email that never arrived was the only other
 * signal (Sep 18 2026). A control that refuses has to say what it wants instead.
 *
 * Module-level and pure so the three states can be tested without standing up the page.
 */
export function sendBlockedReason(
  { selected, sendable, unregistered, sending }:
  { selected: number; sendable: number; unregistered: number; sending: boolean },
): string {
  if (sending) return ''
  if (selected === 0) return `No clubs picked yet \u2014 tick some below, or use \u201cSelect all ${unregistered} unregistered\u201d.`
  // Ticked, but every one of them has already registered: the send would be a no-op.
  if (sendable === 0) {
    return unregistered === 0
      ? 'Every club on this list has already registered \u2014 there is nobody left to invite.'
      : `Every club you picked has already registered. Invites only go to clubs that haven\u2019t \u2014 pick some of the ${unregistered} that haven\u2019t.`
  }
  return ''
}
