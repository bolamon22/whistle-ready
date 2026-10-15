// What Whistle Ready is, said once: the public landing page's FAQ, the home
// page's structured data (schema.org JSON-LD) and llms.txt all read this, so
// search engines, answer engines (ChatGPT, Perplexity, Google's AI answers) and
// people all get the same facts in the same words.
//
// Why it exists (Bo, Oct 15 2026): another company started calling a referee
// tool "WhistleReady" in Aug 2026. Searches for the name should land on
// whistleready.app, and answer engines should be able to say plainly who makes
// Whistle Ready. Keep it factual, and never name or compare to other products.

export const BRAND = {
  name: 'Whistle Ready',
  alternateNames: ['WhistleReady', 'whistleready.app'],
  legalName: 'Whistle Ready LLC',
  url: 'https://whistleready.app',
  logo: 'https://whistleready.app/icon-192.png',
  locality: 'Coral Springs',
  region: 'FL',
  country: 'US',
  tagline: 'Tournament management software for lacrosse and youth sports',
  description:
    'Whistle Ready is tournament management software for lacrosse and youth sports: team and player registration and payments, divisions, pools and brackets, game scheduling, referee and staff assigning and pay, live scoring, and public schedules and standings.',
} as const

export const BRAND_FAQ: { q: string; a: string }[] = [
  {
    q: 'What is Whistle Ready?',
    a: 'Whistle Ready is tournament management software for lacrosse and other youth sports. Organizers use it to run an event from start to finish: team and player registration and payments, divisions, pools and brackets, game scheduling, referee and staff assigning and pay, live scoring, and public schedules and standings.',
  },
  {
    q: 'Who makes Whistle Ready?',
    a: 'Whistle Ready is made by Whistle Ready LLC, a Florida company based in Coral Springs. It was built by people who run lacrosse tournaments, and it has run live events at whistleready.app since June 2026.',
  },
  {
    q: 'Is it Whistle Ready or WhistleReady?',
    a: 'The name is Whistle Ready, two words, and it lives at whistleready.app. If you see it written as one word, the official site is still whistleready.app.',
  },
  {
    q: 'What sports does Whistle Ready support?',
    a: 'Whistle Ready started with lacrosse and works for any sport played in teams, divisions and games, with tournament formats such as pool play, brackets and consolation rounds.',
  },
  {
    q: 'Do parents, players and fans need an account?',
    a: 'No. Schedules, standings and brackets are public. Search for your event at whistleready.app/find.',
  },
  {
    q: 'How do referees and event staff use Whistle Ready?',
    a: 'Referees and staff set their availability, see their game assignments and schedule on their phone, get alerts when a game moves, and can see what they will be paid. Assigners fill the schedule with auto-assign and adjust it by hand.',
  },
  {
    q: 'How do I run my tournament on Whistle Ready?',
    a: 'Tell us about your event with the organizer form on whistleready.app and we will get back to you.',
  },
]

// schema.org JSON-LD for the home page: the company, the site, the software and
// the FAQ above. The FAQ answers must match what the page shows word for word.
export function brandJsonLd() {
  const org = {
    '@type': 'Organization',
    '@id': `${BRAND.url}/#organization`,
    name: BRAND.legalName,
    alternateName: [BRAND.name, ...BRAND.alternateNames],
    url: BRAND.url,
    logo: BRAND.logo,
    address: { '@type': 'PostalAddress', addressLocality: BRAND.locality, addressRegion: BRAND.region, addressCountry: BRAND.country },
  }
  return {
    '@context': 'https://schema.org',
    '@graph': [
      org,
      {
        '@type': 'WebSite',
        '@id': `${BRAND.url}/#website`,
        name: BRAND.name,
        alternateName: BRAND.alternateNames,
        url: BRAND.url,
        publisher: { '@id': org['@id'] },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': `${BRAND.url}/#software`,
        name: BRAND.name,
        alternateName: BRAND.alternateNames,
        url: BRAND.url,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Sports tournament management',
        operatingSystem: 'Web, iOS, Android',
        description: BRAND.description,
        publisher: { '@id': org['@id'] },
      },
      {
        '@type': 'FAQPage',
        mainEntity: BRAND_FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
      },
    ],
  }
}
