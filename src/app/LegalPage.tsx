import Link from 'next/link'
import PublicHeader from './PublicHeader'

// Shared layout for /privacy and /terms. Both are public (middleware
// PUBLIC_ROUTES): Intuit's production review for the QuickBooks connection asks
// for their URLs, and anyone signing up should be able to read them.

export const LEGAL_UPDATED = 'October 5, 2026'
export const LEGAL_EMAIL = 'info@sunshinelax.com'
export const LEGAL_PHONE = '(954) 608-5886'

export default function LegalPage({ title, intro, children }: { title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="-m-3 sm:-m-6 bg-white text-slate-700 min-h-screen">
      <PublicHeader />
      <article className="max-w-3xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Whistle Ready · Last updated {LEGAL_UPDATED}</p>
        <div className="mt-6 space-y-3 text-[15px] leading-7">{intro}</div>
        <div className="mt-10 space-y-9 text-[15px] leading-7">{children}</div>
        <footer className="mt-12 pt-6 border-t border-slate-200 text-sm text-slate-500 flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/privacy" className="hover:text-slate-800">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-slate-800">Terms of Use</Link>
          <a href={`mailto:${LEGAL_EMAIL}`} className="hover:text-slate-800">{LEGAL_EMAIL}</a>
          <Link href="/" className="hover:text-slate-800">whistleready.app</Link>
        </footer>
      </article>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold text-slate-900 mb-2">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5 marker:text-slate-400">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  )
}

export function Contact() {
  return (
    <p>
      Sunshine Events Group<br />
      Email: <a href={`mailto:${LEGAL_EMAIL}`} className="text-teal-700 hover:underline">{LEGAL_EMAIL}</a><br />
      Phone: {LEGAL_PHONE}
    </p>
  )
}
