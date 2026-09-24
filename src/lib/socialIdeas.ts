// Content ideas for the social scheduler calendar.
//
// Pure and client-safe: no database, no network. The page fetches the org's
// upcoming tournaments + idea settings from /api/social/ideas and runs this in the
// browser for whatever two weeks are on screen.
//
// Three sources of ideas, in priority order:
//   1. Countdown — every tournament's start date sets a phase (registration
//      runway → field is forming → plan the weekend → hype week → game weekend →
//      recap) and each phase speaks to a different audience (clubs & coaches →
//      parents → players). Feed posts land on the org's queue days, stories on
//      the days between.
//   2. Moments — holidays and quiet days, computed per year.
//   3. Sports tie-ins — per-league toggles (PLL, NCAA lacrosse, NFL, NHL, …).
//      Dated entries are for the 2026–27 season and need a refresh each year
//      (see SPORTS below); rule-based ones (power rankings, three stars, mic'd
//      up) repeat for every event automatically.
//
// All dates here are calendar-day keys ('YYYY-MM-DD') and all math is done on
// those keys in UTC, so there is no time-zone drift: "Oct 24" is Oct 24 for
// everyone. The caller passes today's key from the viewer's own clock (see
// src/lib/eventDays.ts for why that matters).
//
// Copy rules (Bo's, and the same ones the caption writer follows): nothing
// publishes from an idea on its own; no deadline, discount or "spots filling up"
// urgency — use field-composition wording instead; the CTA points at the org site.

export type Audience = 'clubs' | 'players' | 'parents' | 'all'
export type IdeaFormat = 'Reel' | 'Photo' | 'Carousel' | 'Story'
export type Phase = 'runway' | 'forming' | 'plan' | 'hype' | 'live' | 'recap' | 'off'
export type IdeaSource = 'countdown' | 'moment' | 'series' | 'sport'

export interface IdeaEvent {
  id: string; name: string; start: string; end: string; location: string
  divisions: string[]; lastYearTeams?: number
}
interface Ev extends IdeaEvent { short: string; place: string; town: string; dates: string; theme: 'halloween' | 'holiday' | ''; last: string }

interface IdeaBody { title: string; aud: Audience; fmt: IdeaFormat; why: string; hook: string; shots: string[]; cap: string; quiet?: boolean }
export interface Idea extends IdeaBody {
  key: string; date: string; weight: 'feed' | 'story'; src: IdeaSource; lg?: string
  phase: Phase; eventId?: string; eventName?: string; eventShort?: string; days?: number
  time: { h: number; m: number }
  brief: string
}
export interface Marker { date: string; label: string; kind: 'moment' | 'quiet' | 'sport'; lg?: string; clash?: boolean }
export interface DayIdeas { ideas: Idea[]; markers: Marker[]; badge: { text: string; live: boolean } | null }

export const AUDIENCE_LABEL: Record<Audience, string> = { clubs: 'Clubs & coaches', players: 'Players', parents: 'Parents', all: 'Everyone' }
export const PHASE_LABEL: Record<Phase, string> = { runway: 'Registration runway', forming: 'Field is forming', plan: 'Plan the weekend', hype: 'Hype week', live: 'Game weekend', recap: 'Recap', off: 'Between events' }

export interface League { k: string; n: string; group: 'lacrosse' | 'other'; fit: string; pick?: boolean }
export const LEAGUES: League[] = [
  { k: 'pll', n: 'PLL', group: 'lacrosse', pick: true, fit: "Your audience's own league. Out of season in the fall, so the ideas borrow its formats (mic'd-up clips) more than its dates." },
  { k: 'ncaa', n: 'NCAA lacrosse', group: 'lacrosse', pick: true, fit: 'Where most HS players want to go next. Fall ball in October, 2027 schedules around November, commitments all year.' },
  { k: 'nfl', n: 'NFL', group: 'other', pick: true, fit: 'Biggest audience in Florida: Dolphins, Bucs and Jaguars every Sunday, plus Thanksgiving and Christmas.' },
  { k: 'nhl', n: 'NHL', group: 'other', pick: true, fit: 'Two Florida teams, the "Battle of Florida," and hockey formats like three stars that suit recaps.' },
  { k: 'cfb', n: 'College football', group: 'other', fit: 'Owns Saturdays. Miami–FSU and Florida–Georgia split Florida households.' },
  { k: 'mlb', n: 'MLB', group: 'other', fit: 'Mostly the World Series, which baseball calls "the Fall Classic."' },
  { k: 'nba', n: 'NBA', group: 'other', fit: 'The Heat play on Christmas. Otherwise little overlap with event dates.' },
  { k: 'mls', n: 'MLS', group: 'other', fit: 'Decision Day and MLS Cup. Little else.' },
]
export const DEFAULT_LEAGUES = LEAGUES.filter(l => l.pick).map(l => l.k)
const LG_NAME = Object.fromEntries(LEAGUES.map(l => [l.k, l.n]))

// ---------------------------------------------------------------- date keys
const DAY = 864e5
const ms = (k: string) => { const [y, m, d] = k.slice(0, 10).split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1) }
const keyOf = (t: number) => new Date(t).toISOString().slice(0, 10)
export const addDaysKey = (k: string, n: number) => keyOf(ms(k) + n * DAY)
const diff = (a: string, b: string) => Math.round((ms(a) - ms(b)) / DAY) // a − b, in days
const dowOf = (k: string) => new Date(ms(k)).getUTCDay()
const md = (k: string) => new Date(ms(k)).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })
export function localDayKey(d: Date): string { const p = (n: number) => (n < 10 ? '0' : '') + n; return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
function rangeText(a: string, b: string) {
  if (!b || a === b) return md(a)
  const A = new Date(ms(a)), B = new Date(ms(b))
  return A.getUTCMonth() === B.getUTCMonth() ? `${md(a)}–${B.getUTCDate()}` : `${md(a)}–${md(b)}`
}
function nthDow(y: number, month: number, dow: number, n: number): string { // month 0-based; n = -1 for last
  if (n > 0) { const first = new Date(Date.UTC(y, month, 1)).getUTCDay(); return keyOf(Date.UTC(y, month, 1 + ((dow - first + 7) % 7) + (n - 1) * 7)) }
  const lastDay = new Date(Date.UTC(y, month + 1, 0)); const off = (lastDay.getUTCDay() - dow + 7) % 7
  return keyOf(Date.UTC(y, month, lastDay.getUTCDate() - off))
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

// ---------------------------------------------------------------- events
const STATE = /^(fl|florida|ga|al|sc|nc|tx|[a-z]{2})\.?(\s+\d{5}(-\d{4})?)?$/i
function prepEvent(e: IdeaEvent): Ev {
  const short = e.name.replace(/\b20\d\d\b/g, '').replace(/^\s*(sunshine state|seg)\s+/i, '').replace(/\b(lax|lacrosse|clash|tournament|invitational)\b/gi, '').replace(/\s{2,}/g, ' ').trim() || e.name
  const parts = (e.location || '').split(',').map(s => s.trim()).filter(Boolean)
  while (parts.length > 1 && STATE.test(parts[parts.length - 1])) parts.pop()
  const place = parts.join(', ')
  const town = parts.length > 1 ? parts[parts.length - 1] : (parts[0] || '')
  const theme: Ev['theme'] = /monster|halloween|spook|boo\b|haunt/i.test(e.name) ? 'halloween' : /jingle|holiday|christmas|winter|frost|snow/i.test(e.name) ? 'holiday' : ''
  const yr = Number(e.start.slice(0, 4)) - 1
  const last = e.lastYearTeams && e.lastYearTeams > 0 ? `${e.lastYearTeams} teams played ${short} in ${yr}` : ''
  return { ...e, end: e.end || e.start, short, place, town, dates: rangeText(e.start, e.end || e.start), theme, last }
}

interface Ctx { phase: Phase; ev?: Ev; days?: number; k?: number; next?: Ev; dow: number }
function ctxFor(date: string, evs: Ev[]): Ctx {
  const dow = dowOf(date)
  for (const e of evs) if (date >= e.start && date <= e.end) return { phase: 'live', ev: e, k: diff(date, e.start), dow, next: evs.find(x => x.start > e.end) }
  for (const e of evs) { const k = diff(date, e.end); if (k >= 1 && k <= 4) return { phase: 'recap', ev: e, k, dow, next: evs.find(x => x.start > date) } }
  const n = evs.find(x => x.start > date)
  if (!n) return { phase: 'off', dow }
  const days = diff(n.start, date)
  if (days > 90) return { phase: 'off', dow, next: n, days }
  return { phase: days >= 31 ? 'runway' : days >= 15 ? 'forming' : days >= 8 ? 'plan' : 'hype', ev: n, days, dow, next: n }
}
const PHASE_WINDOW: Record<string, [number, number]> = { runway: [90, 31], forming: [30, 15], plan: [14, 8], hype: [7, 1] }

// ---------------------------------------------------------------- templates
type T = (e: Ev, n: number, c: Ctx, cta: string) => IdeaBody
const divSlides = (e: Ev) => e.divisions.length ? `One slide per division (${e.divisions.slice(0, 6).join(', ')}${e.divisions.length > 6 ? ', …' : ''})` : 'One slide per division you’re offering'
function spotlightDivisions(e: Ev): string[] {
  const youthBoys = e.divisions.filter(d => /boy/i.test(d) && !/hs|high|varsity|jv/i.test(d))
  return youthBoys.length ? youthBoys : e.divisions
}
const T_: Record<'runway' | 'forming' | 'plan' | 'hype' | 'off', { feed: T[]; story: T[] }> = {
  runway: {
    feed: [
      (e, _n, _c, cta) => ({ title: 'Every division, one weekend', aud: 'clubs', fmt: 'Carousel', why: `Club directors decide early which teams to bring. One swipe listing every ${e.short} division is easy for them to forward to their coaches.`, hook: `Every division. One weekend${e.town ? ` in ${e.town}` : ''}.`, shots: ['Cover: event name, dates, venue', divSlides(e), `Close: dates + ${cta}`], cap: `Every division, one weekend. ${e.name} is ${e.dates}${e.place ? ` at ${e.place}` : ''}. Swipe for the full list →` }),
      (e, _n, _c, cta) => e.last
        ? { title: 'Last year, by the numbers', aud: 'clubs', fmt: 'Photo', why: `Directors want to know a weekend will have real competition. ${e.last}, and that's the proof.`, hook: `${e.last}. Here's who's coming back.`, shots: ['Big-number graphic over a game photo'], cap: `${e.last}. ${e.dates}${e.place ? ` at ${e.place}` : ''}. ${cta}.` }
        : { title: 'First look: the venue', aud: 'clubs', fmt: 'Reel', why: 'A quick look at the fields answers the first question directors ask, and it gives the event a picture people can see.', hook: `${e.dates}.${e.place ? ` ${e.place}.` : ''}`, shots: ['10–15 s walk or drone pass of the fields', 'End card with dates'], cap: `${e.name} · ${e.dates}${e.place ? ` · ${e.place}` : ''}. ${cta}.` },
      (e, _n, _c, cta) => ({ title: 'Walk the fields', aud: 'clubs', fmt: 'Reel', why: '"What are the fields like?" is the question directors and parents both ask. A 15-second walk-through answers it.', hook: `This is where ${e.short} happens.`, shots: ['Walk-through or drone pass', 'Text overlay: field count, turf or grass, parking'], cap: `${e.place || e.name}. ${e.dates}. ${cta}.` }),
      (e) => ({ title: 'Director quote card', aud: 'clubs', fmt: 'Photo', why: 'Directors trust other directors more than they trust an organizer. Ask a returning club for one line about why they come back.', hook: '"___" — a returning club director', shots: ['Quote over a team photo, tag the club'], cap: `Why clubs come back to ${e.short}. ${e.dates}.` }),
    ],
    story: [
      (e, _n, _c, cta) => ({ title: 'Registration link sticker', aud: 'clubs', fmt: 'Story', why: 'A low-effort story that keeps the link one tap away.', hook: `${e.short} · ${e.dates}`, shots: [`Photo + link sticker (${cta.replace(/^Register at /, '')})`], cap: '' }),
      (e) => ({ title: 'Reshare a club’s post', aud: 'clubs', fmt: 'Story', why: 'Resharing a club’s training or team post builds goodwill with them. It takes one tap.', hook: `Reshare with a "See you${e.town ? ` in ${e.town}` : ` at ${e.short}`}" sticker`, shots: ['Reshare + mention'], cap: '' }),
    ],
  },
  forming: {
    feed: [
      (e, _n, _c, cta) => ({ title: 'The bracket is taking shape', aud: 'clubs', fmt: 'Carousel', why: 'Field-composition messaging instead of deadlines: show which divisions are filling out so directors can see where their teams fit.', hook: `The ${e.short} bracket is taking shape.`, shots: ['Cover', 'One slide per division: clubs in so far (logos, no counts unless you want them)'], cap: `The ${e.short} bracket is taking shape. Swipe to see who's in. ${cta}.` }),
      (e, n, _c, cta) => { const ds = spotlightDivisions(e); const d = ds.length ? ds[n % ds.length] : 'Youth boys'; return { title: `Division spotlight: ${d}`, aud: 'clubs', fmt: 'Photo', why: `Youth boys divisions are the biggest room to grow. A post just for ${d} coaches helps them see their teams belong here.`, hook: `${d} coaches: this one's for you.`, shots: [`Best ${d} action photo`, 'Text: division, dates, venue'], cap: `${d} at ${e.short}: ${e.dates}${e.place ? `, ${e.place}` : ''}. ${cta}.` } },
      (e) => ({ title: 'Throwback: last year’s best 20 seconds', aud: 'players', fmt: 'Reel', why: 'Players share highlight clips, and their shares reach the parents and coaches you want to reach.', hook: `Last year at ${e.short}. This year: ${e.dates}.`, shots: ['Fast cuts: goals, saves, celebrations', 'End card with dates'], cap: `Run it back. ${e.short} returns ${e.dates}.` }),
      (e, _n, _c, cta) => ({ title: 'Clubs confirmed', aud: 'players', fmt: 'Photo', why: 'A logo wall where every club is tagged. Each tag is a club that will probably reshare.', hook: 'Who’s in so far 👀', shots: ['Logo grid on a branded background', 'Tag every club'], cap: `Who's in so far for ${e.short}. Don't see your club? ${cta}.` }),
    ],
    story: [
      (e) => ({ title: 'Poll: which division are you?', aud: 'players', fmt: 'Story', why: 'Poll stickers are the cheapest engagement on Instagram, and the answers show which divisions are excited.', hook: `Which division are you playing at ${e.short}?`, shots: ['Poll sticker: HS / MS / Youth'], cap: '' }),
      (e, _n, c) => ({ title: `${c.days} days to go`, aud: 'players', fmt: 'Story', why: 'A countdown sticker lets followers opt in to a reminder on game day.', hook: `${e.short} countdown`, shots: [`Countdown sticker set to ${md(e.start)}`], cap: '' }),
    ],
  },
  plan: {
    feed: [
      (e) => ({ title: 'Where to stay', aud: 'parents', fmt: 'Photo', why: 'Families start booking rooms around two weeks out. Point them to the hotel link in registration, not a search. If a sports-commission grant counts room nights, those bookings are the ones that get counted.', hook: `Coming${e.town ? ` to ${e.town}` : ''} for ${e.short}? Here's where to stay.`, shots: ['Hotel exterior or pool photo', 'Text: "Book through the hotel link in your registration"'], cap: `Staying over for ${e.short}? Use the hotel link in your registration. It's the easiest way to stay close to the fields.` }),
      (e) => ({ title: `Around ${e.town || 'the fields'}: eats nearby`, aud: 'parents', fmt: 'Carousel', why: 'Parents plan the whole weekend, not just the games. A local guide gets saved, and saves count in Insights.', hook: `Where to eat between games${e.town ? ` in ${e.town}` : ''}.`, shots: ['4–6 nearby spots, one slide each (tag them — they often reshare)'], cap: `Hungry between games? Here are our picks near ${e.place || 'the fields'}. Save this for the weekend 📌` }),
      (e) => ({ title: 'What to pack', aud: 'parents', fmt: 'Carousel', why: 'Florida weekends can swing from hot to chilly. A checklist gets saved and shared in team group chats.', hook: 'The game-day bag, parent edition.', shots: ['Chairs, tent, water, sunscreen, cash for parking, extra socks'], cap: `Parent checklist for ${e.short} 🧢 Save it for the weekend.` }),
    ],
    story: [
      (e) => ({ title: 'Parents: ask us anything', aud: 'parents', fmt: 'Story', why: 'The question box shows you what to put in the weekend guide, and each answer can be its own story.', hook: `Questions about ${e.short} weekend? Ask here.`, shots: ['Question sticker'], cap: '' }),
      () => ({ title: 'Hotel link sticker', aud: 'parents', fmt: 'Story', why: 'Keeps the booking link one tap away during the week families book.', hook: 'Staying the night?', shots: ['Link sticker to the registration hotel page'], cap: '' }),
    ],
  },
  hype: {
    feed: [
      (e) => ({ title: 'Behind the scenes: field prep', aud: 'players', fmt: 'Reel', why: 'Lining fields, nets going up, banners — behind-the-scenes clips show the weekend is real and close.', hook: `Getting${e.town ? ` ${e.town}` : ' the fields'} ready.`, shots: ['Lining, nets, banners, 10–15 s total'], cap: `Getting ready for you. ${e.short} is almost here.` }),
      (e) => e.theme === 'halloween'
        ? { title: `Show us your ${e.short} look`, aud: 'players', fmt: 'Photo', why: 'The Halloween theme is this event’s edge. Invite teams to show off their look before they arrive, then share what comes in.', hook: 'Themed socks, eye black, full costumes. Show us 🎃', shots: ['Last year’s best themed photo', '"Tag us" call-out'], cap: 'Tag us and we’ll share our favorites before the weekend.' }
        : e.theme === 'holiday'
          ? { title: 'Holiday looks? Tag us', aud: 'players', fmt: 'Photo', why: 'Get the holiday theme going before the weekend so teams show up in it.', hook: 'Santa hats on helmets? We want to see it 🎄', shots: ['Last year’s best holiday photo', '"Tag us" call-out'], cap: 'Tag us and we’ll share our favorites before the weekend.' }
          : { title: 'Tag your team', aud: 'players', fmt: 'Photo', why: 'Ask teams to tag themselves on a hype graphic. Every tag puts the event in front of that team’s families.', hook: `${e.short} is almost here. Tag your team 👇`, shots: ['Hype graphic with dates + venue'], cap: `${e.short} is almost here. Tag your team 👇` },
    ],
    story: [
      (e, _n, c) => ({ title: `${c.days} ${c.days === 1 ? 'day' : 'days'}`, aud: 'players', fmt: 'Story', why: 'A countdown story every day of the final week keeps the event at the front of every story tray.', hook: `${c.days} to ${e.short}`, shots: ['Countdown sticker or a big number over an action photo'], cap: '' }),
    ],
  },
  off: {
    feed: [
      () => ({ title: 'Thank you, clubs', aud: 'clubs', fmt: 'Carousel', why: 'Between events, thank the clubs that played. It keeps you front of mind while they plan the next season.', hook: 'Thank you to every club that played with us.', shots: ['Logo wall of every club from the last event'], cap: 'Thank you to every club that played with us this season.' }),
      (_e, _n, _c, cta) => ({ title: 'Save the dates', aud: 'clubs', fmt: 'Photo', why: 'Once next season’s dates are set, this is the first thing directors look for.', hook: 'Next season’s dates are here.', shots: ['Date card for each event (only the dates you’ve set)'], cap: `Next season's dates are here. ${cta}.` }),
    ],
    story: [
      () => ({ title: 'Reshare a player highlight', aud: 'players', fmt: 'Story', why: 'A quiet stretch. Reshare so the account stays active.', hook: 'Reshare', shots: ['Reshare + mention'], cap: '' }),
    ],
  },
}
const FIXED: Record<number, (e: Ev) => IdeaBody> = {
  14: e => ({ title: 'Two weeks out: the weekend guide', aud: 'parents', fmt: 'Carousel', why: 'Two weeks out is when families start planning travel. Put everything in one guide: parking, check-in, shade, food, hotel link.', hook: `${e.short} weekend guide 📌`, shots: ['Map + parking', 'Check-in times', 'What to bring', 'Food & shade', 'Hotel link'], cap: `Everything you need for ${e.short} weekend. Save this 📌` }),
  7: e => ({ title: 'One week', aud: 'players', fmt: 'Reel', why: 'The biggest hype post of the cycle. Make it a Reel — it’s the format Instagram shows most to people who don’t follow you yet.', hook: `One week. ${e.short}.`, shots: ['Fast cuts from last year, 15–20 s', 'End card: dates + venue'], cap: `One week. ${e.name}, ${e.dates}${e.place ? `, ${e.place}` : ''}.` }),
  3: e => ({ title: 'The schedule is out', aud: 'all', fmt: 'Carousel', why: 'The most-shared post of any event week. Post it as soon as the schedule is published, even if that isn’t exactly this day.', hook: `${e.short} schedule is live.`, shots: ['One slide per division or field', 'Close: where to find live updates'], cap: `The ${e.short} schedule is live. Find your team's games at the link in bio.` }),
  1: e => ({ title: 'Night-before checklist', aud: 'parents', fmt: 'Photo', why: 'Parents check their phones the night before. Tell them where to park, when to arrive and what to bring.', hook: `Tomorrow: ${e.short}. Here's what to know.`, shots: ['Checklist graphic: arrival time, parking, weather, what to bring'], cap: `See you tomorrow${e.place ? ` at ${e.place}` : ''}. Here's what to know before you go.` }),
}
const LIVE_FIRST = (e: Ev): IdeaBody => ({ title: 'Live all day: game-day stories', aud: 'all', fmt: 'Story', why: 'Stories every 60–90 minutes: scores, walk-ups, crowd, field views. Families who can’t be there follow along, and teams reshare.', hook: `Live from ${e.town || e.short}`, shots: ['Morning field shot', 'Score updates', 'Best moments as they happen'], cap: '' })
const LIVE_EVE = (e: Ev): IdeaBody => ({ title: 'Day one in 30 seconds', aud: 'players', fmt: 'Reel', why: 'A first-night highlight Reel gets watched and shared while teams are at dinner and in hotels.', hook: `Day one at ${e.short}.`, shots: ['Best clips from the day, 20–30 s'], cap: `Day one at ${e.short} was something. See you tomorrow.` })
const LIVE_LAST = (e: Ev): IdeaBody => ({ title: 'Championship day', aud: 'all', fmt: 'Carousel', why: 'Post the champions the same evening, while everyone is still on their phones. Tag every team.', hook: `Your ${e.short} champions 🏆`, shots: ['One slide per division champion, tagged'], cap: `Congratulations to every ${e.short} champion 🏆 Swipe to find your division.` })
const RECAP: ((e: Ev, c: Ctx, cta: string) => IdeaBody | null)[] = [
  () => null,
  (e, c) => ({ title: 'Thank you for a great weekend', aud: 'all', fmt: 'Reel', why: 'A recap Reel of the whole weekend. Close with the next event so it promotes what’s coming too.', hook: `That was ${e.short}.`, shots: ['Best clips from every day', c.next ? `End card: "Next up: ${c.next.short}, ${c.next.dates}"` : 'End card: thank you'], cap: `That was ${e.short}. Thank you to every team and family.${c.next ? ` Next up: ${c.next.short}, ${c.next.dates}.` : ''}` }),
  e => ({ title: 'The photo gallery is up', aud: 'parents', fmt: 'Photo', why: 'Parents are waiting for the photos. Announcing the gallery is usually one of the highest-engagement posts of the week.', hook: `${e.short} photos are live 📸`, shots: ['Best 1–3 photos + "link in bio"'], cap: `${e.short} photos are live. Find your player at the link in bio 📸` }),
  () => ({ title: 'Thank you, sponsors & partners', aud: 'clubs', fmt: 'Photo', why: 'A public thank-you to sponsors, the venue and any sports-commission partner. They reshare it, and visible thanks is often part of what a sponsorship asks for.', hook: 'Thank you to the partners who made this weekend happen.', shots: ['Logo lockup over a field photo'], cap: 'Thank you to our partners for making this weekend possible.' }),
  (e, c, cta) => c.next ? { title: `Next up: ${c.next.short}`, aud: 'clubs', fmt: 'Photo', why: `Directors are already talking about their next weekend. Turn ${e.short}'s momentum into ${c.next.short} sign-ups.`, hook: `${c.next.short} · ${c.next.dates}${c.next.town ? ` · ${c.next.town}` : ''}`, shots: [`Date card over a photo from ${e.short}`], cap: `Loved ${e.short}? ${c.next.short} is ${c.next.dates}${c.next.place ? ` at ${c.next.place}` : ''}. ${cta}.` } : null,
]

// ---------------------------------------------------------------- moments
interface MomentDef { date: string; label: string; quiet?: boolean; idea?: (c: Ctx, cta: string) => IdeaBody | null }
function momentsForYear(y: number): MomentDef[] {
  const nextName = (c: Ctx) => c.next ? `${c.next.short}, ${c.next.dates}` : ''
  const list: MomentDef[] = [
    { date: `${y}-01-01`, label: "New Year's Day", idea: () => ({ title: 'New year, new season', aud: 'clubs', fmt: 'Photo', why: 'Directors plan their spring and summer in January. A simple "here’s the year" post puts your calendar in front of them first.', hook: `${y}: here we go.`, shots: ['Season date card (only dates you’ve set)'], cap: `Happy New Year from our lacrosse family. Here's to a big ${y}.` }) },
    { date: nthDow(y, 4, 0, 2), label: "Mother's Day", idea: () => ({ title: 'Thank you, lacrosse moms', aud: 'parents', fmt: 'Carousel', why: 'Sideline moms drive the carpools, book the hotels and share the photos. A thank-you gets shared widely.', hook: 'To the moms on every sideline: thank you.', shots: ['4–6 sideline photos with moms and players'], cap: "Happy Mother's Day to every lacrosse mom on our sidelines 💐" }) },
    { date: nthDow(y, 4, 1, -1), label: 'Memorial Day', quiet: true },
    { date: nthDow(y, 5, 0, 3), label: "Father's Day", idea: () => ({ title: 'Sideline dads', aud: 'parents', fmt: 'Carousel', why: 'Same idea as Mother’s Day: a thank-you post that families share.', hook: 'To the dads on every sideline: thank you.', shots: ['4–6 sideline photos with dads and players'], cap: "Happy Father's Day to every lacrosse dad on our sidelines." }) },
    { date: `${y}-07-04`, label: 'Independence Day', idea: () => ({ title: 'Happy Fourth', aud: 'all', fmt: 'Photo', why: 'A short holiday post with no promo.', hook: 'Happy Fourth of July 🇺🇸', shots: ['Flag-at-the-field photo'], cap: 'Happy Fourth of July from our lacrosse family 🇺🇸' }) },
    { date: `${y}-10-01`, label: 'Breast Cancer Awareness Month begins' },
    { date: `${y}-10-06`, label: 'National Coaches Day', idea: () => ({ title: 'Thank a coach', aud: 'clubs', fmt: 'Carousel', why: 'A no-sell reason to tag every club coach in your photo library. Coaches reshare posts that thank them, and coaches are the people who sign teams up.', hook: 'To every coach who gave up a weekend for this game: thank you.', shots: ['Cover: "Happy National Coaches Day"', '4–6 sideline photos of coaches, each club tagged', 'Close: "Tag a coach who made you better"'], cap: 'Happy National Coaches Day. To every coach who spent a weekend on our sidelines: thank you. Tag a coach who made you better 👇' }) },
    { date: `${y}-10-08`, label: 'Pink month', idea: c => c.next ? ({ title: `Bringing pink to ${c.next.short}?`, aud: 'players', fmt: 'Story', why: 'October is Breast Cancer Awareness Month and a lot of teams already wear pink. Asking them to tag you gets content from teams and parents without a sales pitch.', hook: `Wearing pink at ${c.next.short}? Tag us. We'll share every team.`, shots: ['Pink-toned photo from last October', '"Tag us in your pink" with a mention sticker'], cap: '' }) : null },
    { date: `${y}-10-31`, label: 'Halloween', idea: c => ({ title: 'Happy Halloween', aud: 'players', fmt: 'Carousel', why: 'Repost the best themed looks from recent events. Every tagged team reshares.', hook: 'Happy Halloween from the sidelines 🎃', shots: ['8–10 of the best Halloween looks and eye black from recent events', 'Tag every team pictured'], cap: `Happy Halloween 🎃 Find your team in the best looks from this fall.${nextName(c) ? ` Next up: ${nextName(c)}.` : ''}` }) },
    { date: `${y}-11-11`, label: 'Veterans Day', idea: () => ({ title: 'Thank you, veterans', aud: 'all', fmt: 'Photo', why: 'A simple thank-you with no promo. People share these posts widely.', hook: 'Thank you to every veteran, and to the military families on our sidelines.', shots: ['One clean graphic, or a flag-at-the-field photo'], cap: 'Thank you to every veteran, and to the military families who show up on our sidelines. 🇺🇸' }) },
    { date: nthDow(y, 10, 4, 4), label: 'Thanksgiving', idea: () => ({ title: 'What we’re thankful for', aud: 'all', fmt: 'Carousel', why: 'Thank the people who make game days happen: refs, trainers, field crews, volunteers and clubs. One of the easiest posts to get reshared.', hook: 'Thankful for the people who make game day happen.', shots: ['One slide each: refs, athletic trainers, field crew, volunteers, clubs, families'], cap: 'Happy Thanksgiving. Thankful for the refs, trainers, field crews, volunteers, clubs and families who make every weekend happen.' }) },
    { date: addDaysKey(nthDow(y, 10, 4, 4), 1), label: 'Black Friday', quiet: true },
    { date: `${y}-12-25`, label: 'Christmas', idea: () => ({ title: 'Happy holidays', aud: 'all', fmt: 'Photo', why: 'A short holiday post, best with a team photo from your most recent event.', hook: 'Happy holidays from our lacrosse family to yours.', shots: ['Best recent team photo with a holiday frame'], cap: 'Happy holidays from all of us.' }) },
    { date: `${y}-12-31`, label: "New Year's Eve", idea: () => ({ title: `${y} in 30 seconds`, aud: 'clubs', fmt: 'Reel', why: 'A year-in-review Reel is a strong post for clubs to reshare, and it reminds directors what their teams did with you before they plan next year.', hook: `${y} in 30 seconds.`, shots: ['2–3 s clips from each event in order', `End card: "See you in ${y + 1}"`], cap: `${y} in 30 seconds. Thank you to every club, coach, player and parent. See you in ${y + 1}.` }) },
  ]
  if (y % 2 === 0) { const firstMon = nthDow(y, 10, 1, 1); list.push({ date: addDaysKey(firstMon, 1), label: 'Election Day', quiet: true }) }
  // Year-specific (USA Lacrosse sets these each year — add next year's when announced).
  if (y === 2026) list.push({ date: '2026-10-31', label: 'Celebrate Lacrosse Week (USA Lacrosse) · Oct 31–Nov 8', idea: c => ({ title: 'Celebrate Lacrosse Week starts today', aud: 'all', fmt: 'Story', why: 'USA Lacrosse’s Celebrate Lacrosse Week runs Oct 31–Nov 8. "Come watch" invites to families new to the sport fit the week.', hook: `Bring someone who's never seen a game${c.next ? ` to ${c.next.short}` : ''}.`, shots: [c.next ? `Countdown sticker to ${md(c.next.start)}` : 'Countdown sticker', '"Bring a friend" with venue and dates'], cap: '' }) })
  return list
}

// ---------------------------------------------------------------- sports
// Dated entries are the 2026–27 season (verified Sep 2026 from the leagues'
// published schedules). Refresh this list each season. `rule` entries repeat
// for every event and never go stale.
interface SportDef { lg: string; date?: string; rule?: (c: Ctx, date: string) => boolean; label?: string; clash?: boolean; idea?: (c: Ctx, cta: string) => IdeaBody | null }
const nextBits = (c: Ctx) => c.next ? `${c.next.short}, ${c.next.dates}` : 'our next event'
const SPORTS: SportDef[] = [
  // PLL
  { lg: 'pll', date: '2026-09-20', label: 'PLL Championship: Waterdogs 14, Outlaws 4' },
  { lg: 'pll', date: '2026-09-25', idea: c => ({ title: 'Who’s your PLL team?', aud: 'players', fmt: 'Story', why: 'The PLL season just ended (Waterdogs over the Outlaws, 14–4, on Sep 20). Your players follow the pros, so a poll gets taps and sets up a follow-up: the pros are done, our season is just starting.', hook: "PLL season's over. Who's your team?", shots: ['Poll or quiz sticker with 4 PLL teams', `Follow-up: "The pros are done. ${nextBits(c)}."`], cap: '' }) },
  { lg: 'pll', rule: c => c.phase === 'live' && c.k === 0, idea: c => c.ev ? ({ title: `Shoot today: mic'd up at ${c.ev.short}`, aud: 'players', fmt: 'Reel', why: "The PLL's mic'd-up videos are some of its most-watched content. Put a mic on a willing coach or ref for one game today and cut 30 seconds for recap week. Keep it to adults unless parents have signed off.", hook: `We mic'd up a coach at ${c.ev.short} 🎙️`, shots: ['Clip-on mic + phone on a gimbal for one game', 'Cut the best 30 s with captions'], cap: `We mic'd up a coach at ${c.ev.short}. Sound on 🎙️` }) : null },
  // NCAA lacrosse
  { lg: 'ncaa', date: '2026-10-03', label: 'College fall ball starts (FSU women at Jacksonville)', idea: c => ({ title: 'Where our alumni play now', aud: 'parents', fmt: 'Carousel', why: 'College fall ball starts this weekend at Florida programs. For HS families, playing in college is the goal — showing players who came through your events and now play in college shows that path is real. Ask clubs to send names.', hook: 'They played here. Now they play here.', shots: ['One slide per alum: event photo next to their college photo, school tagged', `Close: "Next up: ${nextBits(c)}"`], cap: 'College fall ball is here. Shout-out to the players who came through our events and now play in college. Know someone we missed? Tag them 👇' }) },
  { lg: 'ncaa', date: '2026-10-24', label: "FSU vs Florida women's fall ball, Tallahassee", clash: true },
  { lg: 'ncaa', date: '2026-11-18', label: '2027 college schedules usually come out in November', idea: () => ({ title: 'Plan a college game day', aud: 'parents', fmt: 'Carousel', why: 'Florida programs usually post spring schedules in November (last year: Jacksonville Nov 7 and Nov 24, Florida Nov 25). A post of home dates near you gets saved by families who want to take their player to a college game. Post once the schedules are out.', hook: 'Take your player to a college game this spring.', shots: ['One slide per program: home dates, school tagged'], cap: 'College lacrosse schedules are out. Here are the home games near you. Save this 📌' }) },
  { lg: 'ncaa', date: '2026-12-09', idea: c => ({ title: 'Commitment wall', aud: 'clubs', fmt: 'Carousel', why: `Ask clubs for the players who committed to college programs this year and post them before ${c.next?.short || 'your next event'}. Clubs and families reshare, and it shows directors their players get seen at your events. Only players whose families say yes.`, hook: 'Committed. Congrats to this year’s class 🎓', shots: ['Player + school graphic, club tagged'], cap: 'Congrats to the players from our clubs who committed to play in college this year 🎓' }) },
  // NFL
  { lg: 'nfl', date: '2026-09-27', label: 'Dolphins home opener vs Chiefs, 1 PM', idea: c => ({ title: 'Fins, Bucs or Jags?', aud: 'players', fmt: 'Story', why: 'The first big NFL Sunday of the fall in South Florida. A poll sticker is quick, fun engagement that gets you into story trays.', hook: 'Game day. Who are you rolling with?', shots: ['Poll sticker: Dolphins / Bucs / Jaguars / Other', `Follow-up: results + "Our game day: ${nextBits(c)}"`], cap: '' }) },
  { lg: 'nfl', date: '2026-10-11', label: 'Jaguars vs Eagles in London' },
  { lg: 'nfl', date: '2026-10-18', label: 'Jaguars vs Texans in London' },
  { lg: 'nfl', date: '2026-10-25', label: 'Dolphins at Jets · Bucs at Panthers, both 1 PM', clash: true },
  { lg: 'nfl', date: '2026-11-08', label: 'Dolphins vs Lions, 1 PM (home) · Bucs at Bears, SNF', clash: true },
  { lg: 'nfl', date: '2026-11-25', label: 'Thanksgiving Eve game (Packers at Rams)' },
  { lg: 'nfl', date: '2026-11-26', label: 'NFL Thanksgiving triple-header', idea: c => ({ title: 'Backyard Turkey Bowl, lacrosse edition', aud: 'parents', fmt: 'Story', why: `Families play backyard football between the Thanksgiving games. Asking for backyard lacrosse clips instead gets you family content over the holiday weekend${c.next ? `, ahead of ${c.next.short}` : ''}.`, hook: 'Turkey Bowl? We play lacrosse. Show us 🦃', shots: ['"Send us your backyard lax" with a mention sticker', 'Reshare the best clips through the weekend'], cap: '' }) },
  { lg: 'nfl', date: '2026-11-30', label: 'Bucs vs Panthers, Monday Night Football' },
  { lg: 'nfl', date: '2026-12-20', label: 'Dolphins at Packers · Bucs vs Saints, both 1 PM', clash: true },
  { lg: 'nfl', date: '2026-12-25', label: 'NFL Christmas triple-header' },
  { lg: 'nfl', date: '2026-12-27', label: 'Jaguars at Cowboys, Sunday night' },
  { lg: 'nfl', rule: c => c.phase === 'hype' && c.dow === 2, idea: c => c.ev ? ({ title: 'Power rankings: teams to watch', aud: 'players', fmt: 'Carousel', why: `NFL fans read power rankings every Tuesday. The same format for ${c.ev.short}'s HS divisions — teams to watch, returning champions, new clubs — gets players talking and tagging. Leave youth divisions out.`, hook: `${c.ev.short} power rankings: HS teams to watch 👀`, shots: ['One slide per HS division: returning champion + 2–3 teams to watch, tagged', `Close: "Agree? Settle it ${c.ev.dates}"`], cap: `${c.ev.short} power rankings: HS teams to watch. Agree? Settle it ${c.ev.dates}${c.ev.town ? ` in ${c.ev.town}` : ''}.` }) : null },
  { lg: 'nfl', rule: c => c.phase === 'live' && c.dow === 0, idea: () => ({ title: 'Our own RedZone', aud: 'all', fmt: 'Story', why: 'Sunday games run into the 1 PM NFL kickoffs. Live score stories styled like a football score ticker look familiar, and families checking NFL scores see yours too.', hook: 'Championship Sunday: live scores, RedZone-style', shots: ['Score-ticker story template: division · teams · score · field', 'A new one every time a game finishes'], cap: '' }) },
  // NHL
  { lg: 'nhl', date: '2026-09-29', label: 'NHL season opens (Panthers at Hurricanes)' },
  { lg: 'nhl', date: '2026-10-03', label: 'Lightning home opener vs Capitals' },
  { lg: 'nhl', date: '2026-10-10', label: 'Panthers home opener vs Wild', idea: c => ({ title: 'Two-sport athletes: hockey + lacrosse', aud: 'players', fmt: 'Carousel', why: 'Hockey season starts the same weeks as fall lacrosse and the two sports share a lot of culture. Featuring players who do both (clubs tagged) gets shared by the players, their parents and both teams.', hook: 'Ice in the winter. Turf in the fall.', shots: ['3–5 HS players who play both: one lacrosse + one hockey photo each (covered by the photo release)', 'Tag each player’s club'], cap: `Hockey season is here. Shout-out to the two-sport athletes we'll see at ${nextBits(c)}.` }) },
  { lg: 'nhl', date: '2026-10-13', label: 'Frozen Frenzy: all 32 NHL teams play' },
  { lg: 'nhl', date: '2026-11-17', label: 'Panthers vs Oilers (Cup Final rematch)' },
  { lg: 'nhl', date: '2026-11-28', label: 'Battle of Florida: Panthers vs Lightning', idea: (c, cta) => c.next ? ({ title: "Tonight's Battle of Florida is on ice", aud: 'clubs', fmt: 'Photo', why: `Panthers vs Lightning is the "Battle of Florida." Posting that night ties your ${c.next.short} to a rivalry Florida families already care about.`, hook: `Tonight's Battle of Florida is on ice. The lacrosse version: ${c.next.short}, ${c.next.dates}.`, shots: [`Bold graphic: "The Battle of Florida continues", ${c.next.short}, ${c.next.dates}`], cap: `Tonight's Battle of Florida is on ice. The lacrosse version is ${c.next.dates} at ${c.next.short}. ${cta}.` }) : null },
  { lg: 'nhl', date: '2026-12-26', label: 'Panthers vs Lightning (Boxing Day)' },
  { lg: 'nhl', rule: c => c.phase === 'recap' && c.k === 2, idea: c => c.ev ? ({ title: `Three stars of ${c.ev.short}`, aud: 'players', fmt: 'Carousel', why: 'Hockey names three stars after every game. The same format for your weekend — one standout per HS division, or three for the event — gives players something to share and parents a reason to comment. Run it after every event and it becomes a series.', hook: `Your three stars of ${c.ev.short} ⭐⭐⭐`, shots: ['Three action photos, player + club tagged (HS divisions, covered by the photo release)'], cap: `Three stars of ${c.ev.short} ⭐⭐⭐ Who else deserved one? Tell us below.` }) : null },
  // College football
  { lg: 'cfb', date: '2026-10-17', label: 'Miami vs Florida State, Hard Rock Stadium', idea: c => ({ title: 'House divided: Canes or Noles?', aud: 'parents', fmt: 'Story', why: 'Miami–FSU splits Florida households. A rivalry-day poll is low effort and gets parents tapping — and parents book the hotel rooms.', hook: 'Rivalry Saturday. Canes or Noles?', shots: ['Poll sticker', `Follow-up: "${c.next ? `${c.next.short} is our rivalry weekend` : 'Our rivalry weekend is coming'}"`], cap: '' }) },
  { lg: 'cfb', date: '2026-10-24', label: 'Miami vs Pitt (home)', clash: true },
  { lg: 'cfb', date: '2026-10-31', label: 'Florida vs Georgia (in Atlanta this year)' },
  { lg: 'cfb', date: '2026-11-07', label: 'Miami at Notre Dame', clash: true },
  { lg: 'cfb', date: '2026-12-06', label: 'College Football Playoff Selection Day', idea: (c, cta) => c.next ? ({ title: 'Our own selection show', aud: 'clubs', fmt: 'Carousel', why: `Everyone is watching the CFP selection show today. Borrow the format for a ${c.next.short} division reveal — "the field is taking shape" for each division. Field composition, not a deadline.`, hook: `Selection Sunday: the ${c.next.short} field is taking shape`, shots: ['One slide per division: clubs in so far (logos)', `Close: dates + ${cta}`], cap: `It's Selection Sunday. Here's how the ${c.next.short} field is shaping up. Swipe for your division →` }) : null },
  { lg: 'cfb', date: '2026-12-19', label: 'CFP first round (Dec 18–19)', clash: true },
  { lg: 'cfb', date: '2027-01-01', label: 'CFP quarterfinals' },
  // MLB
  { lg: 'mlb', date: '2026-09-29', label: 'MLB postseason starts' },
  { lg: 'mlb', date: '2026-10-23', label: 'World Series Game 1', idea: (c, cta) => ({ title: 'Baseball has its Fall Classic', aud: 'clubs', fmt: 'Photo', why: 'The World Series is nicknamed "the Fall Classic" and starts tonight. Posting now rides a name everyone is already seeing.', hook: `Baseball's Fall Classic starts tonight. Florida lacrosse has its own: ${nextBits(c)}.`, shots: ['One bold graphic with your event name and dates'], cap: `Baseball's Fall Classic starts tonight. Ours: ${nextBits(c)}. ${cta}.` }) },
  { lg: 'mlb', date: '2026-10-31', label: 'World Series Game 7, if needed' },
  // NBA / MLS
  { lg: 'nba', date: '2026-10-20', label: 'NBA opening night' },
  { lg: 'nba', date: '2026-12-11', label: 'NBA Cup final' },
  { lg: 'nba', date: '2026-12-25', label: 'Heat vs Celtics, Christmas, 2:30 PM' },
  { lg: 'mls', date: '2026-11-07', label: 'MLS Decision Day', clash: true },
  { lg: 'mls', date: '2026-12-18', label: 'MLS Cup final' },
]

// ---------------------------------------------------------------- engine
export interface BuildOpts {
  events: IdeaEvent[]
  from: string; to: string            // inclusive day keys
  today: string                       // viewer's local day key
  leagues: string[]
  takenDays: Set<string>              // days that already have a post — no ideas there
  dismissed: Set<string>
  feedDows?: number[]                 // queue days (0=Sun…6=Sat); feed posts land here
  slotTime?: Record<number, { h: number; m: number }>
  site?: string
}
const AUD_TIME: Record<Audience, { h: number; m: number }> = { clubs: { h: 11, m: 0 }, parents: { h: 18, m: 30 }, players: { h: 16, m: 0 }, all: { h: 9, m: 0 } }

function countDows(fromKey: string, toKey: string, dows: Set<number>): number {
  let n = 0; for (let k = fromKey; k < toKey; k = addDaysKey(k, 1)) if (dows.has(dowOf(k))) n++
  return n
}

export function buildIdeas(o: BuildOpts): Record<string, DayIdeas> {
  const evs = o.events.filter(e => e.start).map(prepEvent).sort((a, b) => a.start.localeCompare(b.start))
  const site = (o.site || 'sunshineeventsgroup.com').replace(/^https?:\/\//, '').replace(/\/$/, '')
  const cta = `Register at ${site}`
  const feedDows = new Set(o.feedDows && o.feedDows.length ? o.feedDows : [2, 4, 6])
  const storyDows = new Set([0, 1, 2, 3, 4, 5, 6].filter(d => !feedDows.has(d) && d !== 0))
  const on = new Set(o.leagues)
  const years = new Set<number>(); for (let k = o.from; k <= o.to; k = addDaysKey(k, 1)) years.add(Number(k.slice(0, 4)))
  const moments = Array.from(years).flatMap(momentsForYear)
  const out: Record<string, DayIdeas> = {}

  for (let date = o.from; date <= o.to; date = addDaysKey(date, 1)) {
    const c = ctxFor(date, evs)
    const day: DayIdeas = { ideas: [], markers: [], badge: null }
    if (c.phase === 'live') day.badge = { text: 'Game day', live: true }
    else if (c.phase === 'recap' && c.ev) day.badge = { text: `${c.ev.short} recap`, live: false }
    else if (c.ev && c.days != null && date >= o.today) day.badge = { text: `${c.days}d · ${c.ev.short}`, live: false }

    const moms = moments.filter(m => m.date === date)
    const sports = SPORTS.filter(s => on.has(s.lg) && (s.date ? s.date === date : !!s.rule?.(c, date)))
    for (const m of moms) day.markers.push({ date, label: m.label, kind: m.quiet ? 'quiet' : 'moment' })
    for (const s of sports) if (s.label) day.markers.push({ date, label: s.label, kind: 'sport', lg: s.lg, clash: s.clash })

    const open = date >= o.today && !o.takenDays.has(date)
    if (open) {
      const quiet = moms.find(m => m.quiet)
      const add = (b: IdeaBody | null, src: IdeaSource, lg?: string, forceWeight?: 'feed' | 'story', about?: { ev: Ev; days: number; phase: Phase }) => {
        if (!b) return
        const weight = forceWeight || (b.fmt === 'Story' ? 'story' : 'feed')
        const time = weight === 'feed' && o.slotTime?.[c.dow] ? o.slotTime[c.dow] : AUD_TIME[b.aud]
        const ev = about?.ev || c.ev || c.next
        const key = `${date}:${src}:${lg || ''}:${about ? ev?.id : ''}:${slug(b.title)}`
        if (o.dismissed.has(key)) return
        day.ideas.push({ ...b, key, date, weight, src, lg, phase: about?.phase || c.phase, eventId: ev?.id, eventName: ev?.name, eventShort: ev?.short, days: about ? about.days : c.days, time, brief: '' })
      }
      if (quiet) {
        add({ title: 'Quiet day: no promo', aud: 'all', fmt: 'Story', quiet: true, why: /black friday/i.test(quiet.label) ? 'Everyone else is running sales today, and you don’t do discounts. Skip the feed post and let the week’s posts keep working.' : 'Feeds are busy and people are distracted. Skip the promo and reshare a club post if you want to stay active.', hook: 'Skip the feed, or reshare one club story', shots: [], cap: '' }, 'moment')
      } else if (c.phase === 'live' && c.ev) {
        const last = date === c.ev.end
        if (c.k === 0 || !last) add(LIVE_FIRST(c.ev), 'countdown')
        if (!last) add(LIVE_EVE(c.ev), 'countdown')
        if (last) add(LIVE_LAST(c.ev), 'countdown')
      } else if (c.phase === 'recap' && c.ev) {
        add(RECAP[c.k!]?.(c.ev, c, cta) || null, 'countdown')
      } else if (c.phase === 'off') {
        // Between events there's less to say: a holiday or sports idea takes the day.
        const feed = feedDows.has(c.dow)
        const busy = moms.some(m => m.idea) || sports.some(s => s.idea)
        if (!busy && (feed || storyDows.has(c.dow))) {
          const list = T_.off[feed ? 'feed' : 'story']
          // Rotate by slot (week × position in the week) so consecutive posts differ
          // and the same day always gets the same idea, whatever range is on screen.
          const slots = [...(feed ? feedDows : storyDows)].sort()
          const n = Math.floor(diff(date, '2026-01-04') / 7) * slots.length + Math.max(0, slots.indexOf(c.dow))
          add(list[((n % list.length) + list.length) % list.length](evs[0] as Ev, n, c, cta), 'countdown')
        }
      } else if (c.ev && c.days != null) {
        const fixed = FIXED[c.days]
        if (fixed) add(fixed(c.ev), 'countdown', undefined, 'feed')
        else {
          const hype = c.phase === 'hype'
          const feed = feedDows.has(c.dow)
          if (feed || hype || storyDows.has(c.dow)) {
            const set = T_[c.phase as 'runway' | 'forming' | 'plan' | 'hype']
            const list = feed ? set.feed : set.story
            const [hi] = PHASE_WINDOW[c.phase]
            const phaseStart = addDaysKey(c.ev.start, -hi)
            const n = countDows(phaseStart, date, feed ? feedDows : new Set([0, 1, 2, 3, 4, 5, 6].filter(d => !feedDows.has(d))))
            add(list[n % list.length](c.ev, n, c, cta), 'countdown')
          }
        }
      }
      // Every upcoming event gets promoted, not just the next one. The countdown
      // above only talks about the nearest event, which leaves the later ones out
      // of sight for weeks — Fall Classic and Jingle Brawl had nothing to say
      // until Monster Mash was over. So the second event in line gets a
      // Wednesday post and the third a Friday post, from 90 days out until 15
      // days out (after that it's the nearest event and the countdown has it).
      if (!quiet && c.phase !== 'live') {
        const focus = c.ev
        const later = evs.filter(x => x.start > date && x.id !== focus?.id)
        const slot = [3, 5].indexOf(c.dow)
        const e2 = slot >= 0 ? later[slot] : undefined
        const d2 = e2 ? diff(e2.start, date) : 0
        // During a recap the next event has no other voice yet, so its slot also
        // covers the plan-the-weekend window (8–14 days) — otherwise its hotel and
        // weekend-guide posts fall on the first event's game days and never appear.
        const minDays = c.phase === 'recap' ? 8 : 15
        if (e2 && d2 >= minDays && d2 <= 90) {
          const phase2: Phase = d2 >= 31 ? 'runway' : d2 >= 15 ? 'forming' : 'plan'
          const week = countDows(addDaysKey(e2.start, -90), date, new Set([c.dow]))
          const about = { ev: e2, days: d2, phase: phase2 }
          // Back-to-back weekends read best as a pair, so alternate the pairing
          // post with the event's own runway/forming posts.
          if (focus && slot === 0 && diff(e2.start, focus.end) <= 21 && week % 2 === 0) {
            add({ title: `Two weekends: ${focus.short} + ${e2.short}`, aud: 'clubs', fmt: 'Photo', why: `${focus.short} takes most posts until it's over, which leaves ${e2.short} out of sight during its own registration window. Presenting them as a pair keeps both in front of directors.`, hook: `Weekend one: ${focus.short}, ${focus.dates}. Weekend two: ${e2.short}, ${e2.dates}.`, shots: ['Two-date graphic, both venues'], cap: `Two weekends: ${focus.short}${focus.town ? ` in ${focus.town}` : ''} (${focus.dates}), then ${e2.short}${e2.town ? ` in ${e2.town}` : ''} (${e2.dates}). ${cta}.` }, 'series', undefined, 'feed', about)
          } else {
            const list: T[] = phase2 === 'plan' ? [e => ({ ...FIXED[14](e), title: 'The weekend guide', why: 'Families are planning travel now. Put everything in one guide: parking, check-in, shade, food, hotel link.' }), ...T_.plan.feed] : T_[phase2].feed
            const pick = phase2 === 'plan' ? (d2 >= 10 ? 0 : 1) : week % list.length // plan: weekend guide first, then where to stay
            const b = list[pick](e2, week, { ...c, phase: phase2, ev: e2, days: d2, next: e2 }, cta)
            add({ ...b, title: `${e2.short}: ${b.title}`, why: `${b.why} This one is for ${e2.short} (${d2} days out), so it isn't lost behind ${focus?.short || 'the nearest event'}.` }, 'series', undefined, 'feed', about)
          }
        }
        // Once a month, one post with every date so directors can plan the season.
        const ahead = evs.filter(x => x.start > date && diff(x.start, date) <= 120)
        if (c.dow === 1 && Number(date.slice(8, 10)) <= 7 && ahead.length >= 2) {
          add({ title: 'Every date, one post', aud: 'clubs', fmt: 'Photo', why: `Directors plan several weekends at once. One graphic with every upcoming date (${ahead.map(x => x.short).join(', ')}) is the post they screenshot and send to their coaches.`, hook: 'Circle these weekends.', shots: ['Date card: each event, dates, town'], cap: `Circle these weekends:\n${ahead.map(x => `${x.short} · ${x.dates}${x.town ? ` · ${x.town}` : ''}`).join('\n')}\n${cta}.` }, 'series', undefined, 'feed', { ev: ahead[0], days: diff(ahead[0].start, date), phase: c.phase })
        }
      }
      if (!quiet) {
        for (const m of moms) if (m.idea) add(m.idea(c, cta), 'moment')
        for (const s of sports) if (s.idea) add(s.idea(c, cta), 'sport', s.lg)
      }
    }
    for (const i of day.ideas) i.brief = briefFor(i, evs, cta)
    out[date] = day
  }
  return out
}

function briefFor(i: Idea, evs: Ev[], cta: string): string {
  const e = evs.find(x => x.id === i.eventId)
  return [
    `Idea: ${i.title} (${i.fmt}${i.weight === 'story' ? ', Story' : ''}) for ${AUDIENCE_LABEL[i.aud].toLowerCase()}.`,
    e ? `Event: ${e.name}, ${e.dates}${e.place ? `, ${e.place}` : ''}.` : '',
    `Angle: ${i.why}`,
    `Hook: ${i.hook}`,
    i.cap ? `Starter caption (improve it, keep the facts): ${i.cap}` : '',
    e && i.aud !== 'all' && !i.quiet ? `CTA: ${cta}.` : '',
  ].filter(Boolean).join('\n').slice(0, 1500)
}

export const leagueName = (k?: string) => (k ? LG_NAME[k] || k : '')
