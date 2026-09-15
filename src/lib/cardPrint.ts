// Printing a player card on a home printer.
//
// The card is already drawn at 720x1140 -- CR80 badge proportions, the same
// 2.125" x 3.375" as the staff ID card and the media credential. What was missing
// was any way to get it onto paper at that size: "Save to phone" gives you a PNG,
// and a browser printing a web page will happily scale that PNG to whatever fits
// the sheet. A badge that comes out at four inches tall does not go in a lanyard
// holder, so the size is pinned in inches here rather than left to the browser.
//
// One module because two pages print the same card -- the confirmation screen
// right after a parent submits, and the card page they come back to later. If the
// numbers lived in both they would drift.

/** CR80 portrait, in inches. Matches PASS_W/PASS_H's 720x1140 aspect. */
export const CARD_PRINT_W = '2.125in'
export const CARD_PRINT_H = '3.375in'

/**
 * Print rules for a page whose card image carries `id`.
 *
 * The visibility trick rather than display:none -- hiding ancestors with display
 * would take the card down with them, so everything is made invisible and only
 * the card is turned back on. print-color-adjust keeps the dark header from
 * being helpfully optimized away into white.
 */
export function cardPrintCss(id: string): string {
  return `@media print {
  /* Both card pages sit on a near-black background. visibility:hidden takes an
     element's own background with it, but the body's background propagates to the
     page canvas and paints anyway -- caught by printing to PDF and finding a full
     sheet of #0b1220 behind a badge that was otherwise exactly the right size.
     A parent with "Background graphics" ticked would have emptied a cartridge. */
  html, body { background: #ffffff !important; }
  body * { visibility: hidden !important; }
  #${id}, #${id} * { visibility: visible !important; }
  #${id} {
    position: fixed !important;
    left: 0.4in; top: 0.4in;
    width: ${CARD_PRINT_W} !important;
    height: ${CARD_PRINT_H} !important;
    max-width: none !important;
    margin: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  @page { margin: 0.4in; }
}`
}

/** The line that tells a parent the print is a real badge and not a big picture. */
export const CARD_PRINT_NOTE =
  'Prints at true badge size (2.125″ × 3.375″) — cut along the edge and it fits a standard lanyard holder.'
