import { notFound } from 'next/navigation'
import { Camera, Check, Clock, MapPin, Upload, Phone, ShieldAlert } from 'lucide-react'
import { loadMediaApproval } from '@/lib/mediaApproval'
import { ensureProfileFromApplication, profileBySlug, DEFAULT_PACKAGES } from '@/lib/photographers'
import { orgBaseUrl } from '@/lib/orgDomains'
import ProfileEditor from './ProfileEditor'
import Uploader from './Uploader'

// PUBLIC (see src/middleware.ts): a photographer's credential page. The 128-bit token
// in the URL is the authorization -- they have no account, and the link only ever went
// to the address on their application.
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata = { robots: { index: false, follow: false } }

function Block({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  if (!body.trim()) return null
  return (
    <div className="flex gap-3.5 py-4 border-b border-slate-200 last:border-0">
      <span className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <h3 className="font-bold text-[14.5px] text-slate-900">{title}</h3>
        <p className="text-[14px] text-slate-600 mt-1 leading-relaxed whitespace-pre-line">{body}</p>
      </div>
    </div>
  )
}

export default async function MediaCredentialPage({ params }: { params: { token: string } }) {
  const a = await loadMediaApproval(params.token)
  if (!a) notFound()

  const d = a.submission.data || {}
  const who = String(d.company || d.name || 'Photographer')
  const person = String(d.name || '')
  const ins = a.cfg.instructions
  const hasPacket = Object.values(ins).some(v => String(v || '').trim())

  // Self-serve: an approved photographer who asked for bookings owns their public
  // page and edits it from here, so nobody at the org has to retype a bio.
  const wantsBookings = (Array.isArray(d.levels) ? d.levels : []).includes('book')
  let profile: any = null
  if (a.approved && wantsBookings) {
    try {
      const slug = await ensureProfileFromApplication(a.orgId, d)
      if (slug) profile = await profileBySlug(a.orgId, slug)
    } catch { /* the credential still renders without the editor */ }
  }

  if (a.declined) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-20">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-slate-900">We couldn&rsquo;t fit you in this time</h1>
          <p className="text-slate-600 mt-3 leading-relaxed text-[15px]">
            Thanks for applying to shoot {a.tournamentName || 'with us'}. We aren&rsquo;t able to credential you for this
            event. You&rsquo;re welcome to apply again for the next one.
          </p>
        </div>
      </div>
    )
  }

  if (!a.approved) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6 py-20">
        <div className="max-w-md text-center">
          <Clock size={34} className="mx-auto text-slate-300" />
          <h1 className="text-xl font-bold text-slate-900 mt-4">Still under review</h1>
          <p className="text-slate-600 mt-3 leading-relaxed text-[15px]">
            We have your application for {a.tournamentName || 'the event'} and we&rsquo;re looking at it.
            This page turns into your credential the moment it&rsquo;s approved &mdash; keep the link.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* The credential itself — this is the thing they show at check-in. */}
        <div className="rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 text-white">
          <div className="px-6 py-5 flex items-start justify-between gap-4 border-b border-white/10">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-teal-300">
                <Camera size={11} /> Media credential
              </span>
              <h1 className="text-2xl font-extrabold tracking-tight mt-2 truncate">{who}</h1>
              {person && person !== who && <p className="text-slate-400 text-[13.5px] mt-0.5 truncate">{person}</p>}
            </div>
            <span className="inline-flex items-center gap-1.5 bg-teal-500/15 text-teal-300 border border-teal-400/30 rounded-full px-3 py-1.5 text-[11px] font-bold shrink-0">
              <Check size={12} strokeWidth={3} /> Approved
            </span>
          </div>
          <div className="px-6 py-4">
            <span className="block text-[10.5px] uppercase tracking-wider text-slate-500 font-semibold">Good for</span>
            <span className="block text-[15px] font-bold mt-1">{a.tournamentName || 'Our event'}</span>
            {a.eventDates && <span className="block text-[13.5px] text-slate-400 mt-0.5">{a.eventDates}</span>}
            {a.org?.name && <span className="block text-[13px] text-slate-500 mt-3">Issued by {a.org.name}</span>}
          </div>
        </div>

        <p className="text-[13px] text-slate-500 mt-3 text-center">
          Show this screen at check-in. Keep the link &mdash; it&rsquo;s your pass for the weekend.
        </p>

        {a.levels.length > 0 && (
          <div className="mt-8">
            <h2 className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-slate-400 mb-3">You&rsquo;re approved for</h2>
            <div className="space-y-2">
              {a.levels.map(l => (
                <div key={l.id} className="flex gap-2.5 items-start bg-white border border-slate-200 rounded-xl px-4 py-3">
                  <Check size={15} className="text-teal-600 mt-0.5 shrink-0" strokeWidth={3} />
                  <span className="text-[14.5px] font-semibold text-slate-800">{l.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasPacket ? (
          <div className="mt-8 bg-white border border-slate-200 rounded-2xl px-5 py-1">
            <Block icon={<MapPin size={15} />} title="Where to go" body={ins.where} />
            <Block icon={<Check size={15} />} title="Checking in" body={ins.checkIn} />
            <Block icon={<Clock size={15} />} title="Event times" body={ins.eventTimes} />
            <Block icon={<ShieldAlert size={15} />} title="Field rules" body={ins.fieldRules} />
            <Block icon={<Upload size={15} />} title="Sending us your photos" body={ins.upload} />
            <Block icon={<Phone size={15} />} title="Who to call" body={ins.contact} />
          </div>
        ) : (
          <div className="mt-8 bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
            <p className="text-[14px] text-amber-900 leading-relaxed">
              <strong>Details are still being finalised.</strong> Check-in point, field rules and load-in times land on
              this page before the event &mdash; same link, so keep it.
            </p>
          </div>
        )}

        {/* Contributing is what the credential was issued for, so the drop zone sits
            above the booking-page editor rather than below it. */}
        <Uploader token={params.token} eventName={a.tournamentName} />

        {profile && (
          <ProfileEditor
            token={params.token}
            pageUrl={`${orgBaseUrl(a.org?.slug)}/photographers/${profile.slug}`}
            initial={{
              slug: String(profile.slug || ''), name: String(profile.name || ''), business: String(profile.business || ''),
              location: String(profile.location || ''), bio: String(profile.bio || ''),
              website: String(profile.website || ''), instagram: String(profile.instagram || ''),
              bookingEmail: String(profile.bookingEmail || ''), avatarUrl: String(profile.avatarUrl || ''),
              coverUrl: String(profile.coverUrl || ''),
              packages: Array.isArray(profile.packages) && profile.packages.length ? profile.packages : DEFAULT_PACKAGES.map(x => ({ ...x })),
              samples: Array.isArray(profile.samples) ? profile.samples : [],
            }}
          />
        )}

        <div className="mt-8 text-[12.5px] text-slate-500 leading-relaxed bg-white border border-slate-200 rounded-2xl p-5">
          <p><strong className="text-slate-800">Your work stays yours.</strong> {a.cfg.terms}</p>
          <p className="mt-3"><strong className="text-slate-800">Photos of minors.</strong> {a.cfg.minorsNotice}</p>
        </div>
      </div>
    </div>
  )
}
