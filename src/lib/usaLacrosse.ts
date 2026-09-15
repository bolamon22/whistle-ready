// USA Lacrosse.
//
// The organisation renamed from "US Lacrosse" to "USA Lacrosse" in 2021 and moved
// from uslacrosse.org to usalacrosse.com. Our forms still said the old name, and
// the one "look up your number" link we had pointed at
// https://www.uslacrosse.org/membership -- which today serves a certificate that
// is not valid for that hostname, so a parent clicking it gets a browser security
// warning rather than a membership page.
//
// The DATA KEYS stay `usLacrosse` / `usLacrosseNumber` on purpose: they are the
// shape of every waiver already stored and every CSV column exported from them.
// Renaming a label is cosmetic; renaming a key loses data.

/** Where a member finds a number they have forgotten: the account portal (AMMS). */
export const USA_LACROSSE_LOOKUP = 'https://account.usalacrosse.com/'

/** What the field is called, in one place. */
export const USA_LACROSSE_LABEL = 'USA Lacrosse member #'

/** The short column heading — staff tables and CSV headers. */
export const USA_LACROSSE_SHORT = 'USA Lacrosse #'

export const USA_LACROSSE_LOOKUP_TEXT = 'Look up my member number'
