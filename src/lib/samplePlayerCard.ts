// The example player card shown on the registration form.
//
// WHY THIS EXISTS: the live preview builds itself as a parent types, which is
// lovely once there is something to build from and blank when it matters most —
// at the top of the form, where "Player name / Your club" in grey reads like an
// empty template rather than a thing worth filling in. An example gives them the
// finished article to aim at (Bo, Sep 18 2026).
//
// IT IS DATA, NOT A PICTURE. A screenshot of a card goes stale the first time the
// card design changes, and then the form is advertising something that no longer
// exists. This is fed through the same PassCard component the real card uses, so
// the example cannot drift from the product.
//
// The player is invented. A youth-sports form is the last place to put a real
// child's photo and name up as marketing, and an invented one costs us nothing.

/**
 * A flat silhouette for the photo slot.
 *
 * Deliberately not a photograph. A stock face would be a stranger's child; a grey
 * "Photo" box would undersell the whole point of the example. A bold graphic
 * reads as "an action shot goes here" and matches the copy on the photo field.
 */
function SAMPLE_PHOTO_SVG(): string {
  // Built from thick round-capped strokes rather than separate polygons: the
  // joints then actually meet. The first pass drew torso, legs and arms as
  // individual shapes and they floated apart at the shoulder and hip, which
  // reads as a broken graphic rather than a stylized one.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#14b8a6"/><stop offset="1" stop-color="#0b1220"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#bg)"/>
<g stroke="#ffffff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" fill="none">
<path d="M196 178 L214 252"/>
<path d="M214 252 L184 324"/>
<path d="M214 252 L270 308"/>
<path d="M202 198 L264 170"/>
</g>
<circle cx="190" cy="140" r="30" fill="#ffffff"/>
<g stroke="#fbbf24" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" fill="none">
<path d="M264 170 L332 98"/>
<path d="M324 90 q32 -12 28 21 q-5 27 -32 12"/>
</g></svg>`
}


export const SAMPLE_PHOTO =
  'data:image/svg+xml;base64,' + (typeof btoa === 'function'
    ? btoa(SAMPLE_PHOTO_SVG())
    : Buffer.from(SAMPLE_PHOTO_SVG()).toString('base64'))

/** Everything about the example that is NOT the event's own branding. */
export const SAMPLE_PLAYER = {
  code: 'K7M-3PX',
  playerName: 'Riley Carter',
  clubName: 'Riverside Lacrosse',
  teamName: '2031 Select',
  division: 'Boys U14 A',
  jersey: '7',
  position: 'Goalie',
  photoUrl: SAMPLE_PHOTO,
  clubLogoUrl: '',
  qrLabel: 'Highlight reel',
}
