'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CheckCircle2, XCircle } from 'lucide-react'

// /pass/photo-ok/<token>: a parent says yes or no to the org sharing their
// player's card photo on social media (lib/photoConsent, /api/photo-ok).
// Lives under /pass so it inherits that path's public passthrough on every
// domain; the static "photo-ok" segment wins over /pass/[token].

type Info = { player: string; team: string; orgName: string; tournamentName: string; photo: string; posts?: { label: string; url: string }[]; answer: string; answeredAt: string; instagram: string; clubInstagram: string; clubFacebook: string; club: string; permission: string; test?: boolean }

export default function PhotoPermissionPage() {
  const { token } = useParams() as { token: string }
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [guardian, setGuardian] = useState(false)
  const [ig, setIg] = useState('')
  const [clubIg, setClubIg] = useState('')
  const [clubFb, setClubFb] = useState('')
  const [saving, setSaving] = useState<'' | 'yes' | 'no'>('')
  const [formError, setFormError] = useState('')
  const [changing, setChanging] = useState(false)

  useEffect(() => {
    fetch(`/api/photo-ok?t=${encodeURIComponent(token)}`).then(async r => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setError(j.error || 'This link is not valid.'); return }
      setInfo(j)
      if (j.instagram) setIg(String(j.instagram))
      if (j.clubInstagram) setClubIg(String(j.clubInstagram))
      if (j.clubFacebook) setClubFb(String(j.clubFacebook))
    }).catch(() => setError('Could not load this page. Check your connection and try again.'))
  }, [token])

  async function answer(a: 'yes' | 'no') {
    setFormError('')
    if (a === 'yes' && name.trim().length < 2) { setFormError('Type your name to give permission.'); return }
    if (a === 'yes' && !guardian) { setFormError("Check the box to confirm you're the player's parent or guardian."); return }
    setSaving(a)
    try {
      const r = await fetch('/api/photo-ok', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, answer: a, name: name.trim(), guardian, instagram: ig.trim(), clubInstagram: clubIg.trim(), clubFacebook: clubFb.trim() }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setFormError(j.error || 'Could not save your answer.'); return }
      setInfo(i => i ? { ...i, answer: a, answeredAt: new Date().toISOString(), instagram: a === 'yes' ? String(j.instagram || '') : '' } : i)
      setChanging(false)
    } catch { setFormError('Could not save your answer. Check your connection and try again.') }
    finally { setSaving('') }
  }

  const answered = info && (info.answer === 'yes' || info.answer === 'no') && !changing

  return (
    <div className="min-h-screen bg-[#0b1220] text-white">
      <div className="max-w-md mx-auto px-5 py-8 sm:py-12">
        {error && (
          <div className="text-center mt-16">
            <h1 className="text-xl font-bold">Link not valid</h1>
            <p className="text-slate-300 mt-2 text-sm">{error}</p>
          </div>
        )}
        {!error && !info && <p className="text-center text-slate-400 mt-16 text-sm">Loading…</p>}
        {info && (
          <>
            {info.test && (
              <div className="mb-5 rounded-lg bg-amber-300 text-slate-900 text-sm font-semibold px-3 py-2 text-center">Test preview: this is what the family sees. Nothing you answer here is saved.</div>
            )}
            <div className="text-center mb-5">
              <div className="text-xs uppercase tracking-[0.2em] text-teal-300">{info.tournamentName}</div>
              <h1 className="text-2xl font-extrabold leading-tight mt-1">Can we share {info.player || 'this'}{info.player ? "'s" : ''} photo?</h1>
              {info.team && <p className="text-slate-300 text-sm mt-1">{info.team}</p>}
            </div>

            {info.posts && info.posts.length ? (
              <>
                <p className="text-center text-sm text-slate-300 mb-3">Here's the kind of post we're planning:</p>
                <div className="grid grid-cols-2 gap-3">
                  {info.posts.map(p => (
                    <figure key={p.url} className="m-0">
                      <img src={p.url} alt={`${p.label} post with ${info.player}'s card`} loading="lazy"
                        className="w-full aspect-[4/5] rounded-xl ring-1 ring-white/10 bg-slate-800 object-cover" />
                      <figcaption className="text-center text-xs text-slate-400 mt-1">{p.label}</figcaption>
                    </figure>
                  ))}
                </div>
              </>
            ) : info.photo && (
              <img src={info.photo} alt={`${info.player}'s player card`}
                className="w-full max-w-[300px] mx-auto rounded-2xl shadow-2xl shadow-black/50 ring-1 ring-white/10 bg-white" />
            )}

            <div className="mt-6 rounded-xl bg-white/5 ring-1 ring-white/10 p-4 text-sm text-slate-200 leading-relaxed">
              {info.permission}
            </div>

            {answered ? (
              <div className="mt-6 text-center">
                {info.answer === 'yes'
                  ? <>
                      <p className="inline-flex items-center gap-2 text-teal-300 font-semibold"><CheckCircle2 size={20} /> Thanks! You said yes.</p>
                      <p className="text-slate-300 text-sm mt-2">{info.instagram ? `We'll tag ${info.instagram} and send it as a Collab post. Accept the invite, then share and repost!` : 'Watch our Instagram this week, and please share and repost when it goes up!'}</p>
                    </>
                  : <p className="inline-flex items-center gap-2 text-slate-200 font-semibold"><XCircle size={20} /> Got it. We won't use this photo.</p>}
                <p className="text-slate-400 text-xs mt-2">Saved {new Date(info.answeredAt).toLocaleDateString()}.</p>
                <button type="button" onClick={() => { setChanging(true); setFormError('') }} className="mt-4 text-sm text-teal-300 underline underline-offset-4">Change my answer</button>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); answer('yes') }}>
                <div>
                  <label htmlFor="po-name" className="block text-sm font-medium text-slate-200 mb-1">Your name</label>
                  <input id="po-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name"
                    className="w-full rounded-lg bg-white text-slate-900 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-400" />
                </div>
                <div>
                  <label htmlFor="po-ig" className="block text-sm font-medium text-slate-200 mb-1">Instagram to tag <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input id="po-ig" value={ig} onChange={e => setIg(e.target.value)} placeholder="@yourhandle" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                    className="w-full rounded-lg bg-white text-slate-900 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  <p className="text-xs text-slate-400 mt-1">Yours or your player's. We'll tag it and send a Collab invite so the post shows on your page too.</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="po-club-ig" className="block text-sm font-medium text-slate-200 mb-1">{info.club || 'Club'} Instagram <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input id="po-club-ig" value={clubIg} onChange={e => setClubIg(e.target.value)} placeholder="@clubname" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                      className="w-full rounded-lg bg-white text-slate-900 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                  <div>
                    <label htmlFor="po-club-fb" className="block text-sm font-medium text-slate-200 mb-1">{info.club || 'Club'} Facebook <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input id="po-club-fb" value={clubFb} onChange={e => setClubFb(e.target.value)} placeholder="facebook.com/clubname" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                      className="w-full rounded-lg bg-white text-slate-900 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-teal-400" />
                  </div>
                </div>
                <p className="text-xs text-slate-400 -mt-2">We'll tag the club too and invite them to collaborate, if they want to.</p>
                <label htmlFor="po-guardian" className="flex items-start gap-3 text-sm text-slate-200">
                  <input id="po-guardian" type="checkbox" checked={guardian} onChange={e => setGuardian(e.target.checked)} className="mt-0.5 h-5 w-5 accent-teal-500" />
                  <span>I'm {info.player || 'the player'}'s parent or legal guardian (or I'm the player and 18 or older).</span>
                </label>
                {formError && <p className="text-sm text-amber-300">{formError}</p>}
                <div className="grid gap-2.5">
                  <button type="submit" disabled={!!saving} className="w-full rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold py-3 disabled:opacity-60">
                    {saving === 'yes' ? 'Saving…' : 'Yes, you can share it'}
                  </button>
                  <button type="button" disabled={!!saving} onClick={() => answer('no')} className="w-full rounded-xl ring-1 ring-white/20 hover:bg-white/5 text-white font-semibold py-3 disabled:opacity-60">
                    {saving === 'no' ? 'Saving…' : 'No thanks'}
                  </button>
                </div>
              </form>
            )}
            <p className="text-center text-xs text-slate-500 mt-8">{info.orgName}</p>
          </>
        )}
      </div>
    </div>
  )
}
