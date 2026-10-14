import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage, { Section, Bullets, Contact } from '../LegalPage'
import { smsConsentText } from '@/lib/smsConsent'

// The public description of the text-message program.
//
// Written for a carrier's toll-free verification reviewer as much as for staff:
// a TFV submission is judged partly on whether the business has a reachable,
// branded page that names who sends, what gets sent, how often, how to stop, and
// what happens to the number (rejection codes 30489/30492/30493 cover exactly
// this). Keep it true to what src/lib/smsConsent.ts actually says on the signup
// form — a reviewer compares the two.

export const metadata: Metadata = {
  title: 'Text message program',
  description: 'How Sunshine Events Group texts event staff and team coaches: who gets messages, what they contain, and how to stop them.',
  alternates: { canonical: '/sms' },
}

const privacy = <Link href="/privacy" className="text-teal-700 hover:underline">Privacy Policy</Link>
const terms = <Link href="/terms" className="text-teal-700 hover:underline">Terms of Use</Link>

export default function SmsProgramPage() {
  return (
    <LegalPage
      title="Text message program"
      intro={<>
        <p>
          Sunshine Events Group, which operates Whistle Ready (whistleready.app), sends text messages to two
          groups of people who work our events: the referees, scorekeepers, field staff and athletic trainers we
          staff a tournament with, and the coaches on the sidelines. Only to those who have asked us to.
        </p>
        <p>
          Both groups get the same kind of message and nothing else: where to be, and when that changes. This is
          an operations tool, not marketing. We do not text players, parents, spectators or clubs, and there is
          nothing to buy in any message we send.
        </p>
      </>}
    >
      <Section title="Who gets messages">
        <Bullets items={[
          <><b>Event staff</b> — referees, scorekeepers, field staff and athletic trainers who signed up to work our events.</>,
          <><b>Coaches</b> — the head and assistant coaches listed on a team’s signed coach waiver for an event they are coaching.</>,
        ]} />
        <p>
          In both cases, only the people who ticked the box asking to be texted. Nobody is added by being on a
          roster, by giving us a phone number, by registering a team, or by working an event. We hold phone
          numbers so we can call on game day; that is not permission to message them.
        </p>
      </Section>

      <Section title="How people opt in">
        <Bullets items={[
          <><b>Staff</b> tick a checkbox under the phone number on the staff signup form. It is <b>never pre-ticked</b>, and signup completes without it.</>,
          <>Staff already signed up can turn it on themselves from their staff home page, and turn it off there at any time.</>,
          <><b>Coaches</b> tick the same kind of checkbox under the phone number on the coach waiver for the event they are coaching. It is never pre-ticked, and the waiver submits without it.</>,
          <>We record the date each person agreed and which form they used.</>,
        ]} />
        <p>These are the controls exactly as they appear, first on the staff signup form:</p>

        {/* A real rendering, not a description — this page is what a carrier
            reviewer is pointed at for opt-in evidence (optInImageUrls), and
            code 30510 rejects an example that is unbranded or unclear. The
            wording comes from smsConsentText() so it can never drift from what
            staff actually tick. The box is drawn unticked on purpose: a
            pre-ticked box is its own rejection (30508). */}
        <div className="rounded-xl border border-slate-300 bg-white p-5 not-prose">
          <div className="text-[11px] font-bold tracking-wide text-slate-400 mb-1.5">PHONE</div>
          <div className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-400 mb-3">(555) 000-0000</div>
          <div className="flex gap-3 items-start bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <span aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-slate-400 bg-white" />
            <span className="text-xs leading-relaxed text-slate-600">
              {smsConsentText('Sunshine Events Group')}{' '}
              <span className="text-teal-700 underline underline-offset-2">Terms</span>
              {' · '}
              <span className="text-teal-700 underline underline-offset-2">Privacy</span>
              <span className="block mt-1 text-slate-400">Optional — you can sign up without this, and change it later.</span>
            </span>
          </div>
        </div>

        <p>And on the coach waiver:</p>

        <div className="rounded-xl border border-slate-300 bg-white p-5 not-prose">
          <div className="text-[11px] font-bold tracking-wide text-slate-400 mb-1.5">MOBILE PHONE</div>
          <div className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-400 mb-3">(555) 000-0000</div>
          <div className="flex gap-3 items-start bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <span aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 rounded border-2 border-slate-400 bg-white" />
            <span className="text-xs leading-relaxed text-slate-600">
              {smsConsentText('Sunshine Events Group', 'coach')}{' '}
              <span className="text-teal-700 underline underline-offset-2">Terms</span>
              {' · '}
              <span className="text-teal-700 underline underline-offset-2">Privacy</span>
              <span className="block mt-1 text-slate-400">Optional — your waiver goes through either way.</span>
            </span>
          </div>
        </div>

        <p className="text-sm text-slate-500">
          Both boxes start empty. The form completes whether or not it is ticked, this consent is never bundled
          with any other agreement, and ticking it is never a condition of working an event or coaching a team.
        </p>
      </Section>

      <Section title="What we send">
        <p>To staff:</p>
        <Bullets items={[
          'Your assignments for an event, and changes to them.',
          'Schedule and field changes on game day.',
          'Requests for help on a field — an athletic trainer, equipment, or an official needed.',
          'Check-in and arrival reminders on the morning of an event.',
        ]} />
        <p>To coaches, less:</p>
        <Bullets items={[
          'A game of theirs moving to a different time or field.',
          'An alert affecting the whole event — a weather hold, a lightning delay, fields closed.',
        ]} />
        <p>
          Examples: &ldquo;Monster Mash: you&apos;re on Field 4 at 8:00am, not Field 2. Reply STOP to opt
          out.&rdquo; &ldquo;Monster Mash: Ghost 2030 now 11:20am on Field 7. Reply STOP to opt out.&rdquo;
        </p>
        <p className="text-sm text-slate-500">
          Coaches are not texted scores, results or schedule summaries. Those reach the phones of anyone who asks
          for them — coaches and families alike — as free browser notifications, which cost nothing and are
          turned on and off on the device itself.
        </p>
      </Section>

      <Section title="How often">
        <p>
          Message frequency varies, and it is low. Most staff hear from us only in the days around an event they
          are working. A coach typically hears from us only when something moves — often not at all across a
          whole weekend. Neither group hears from us between events.
        </p>
      </Section>

      <Section title="Cost">
        <p>Message and data rates may apply, depending on your mobile plan. We do not charge for these messages.</p>
      </Section>

      <Section title="How to stop">
        <Bullets items={[
          <>Reply <b>STOP</b> to any message. We stop immediately.</>,
          <>Staff can also turn texts off on their staff home page, which takes effect the same way.</>,
          <>Reply <b>HELP</b> for help, or use the contact details below.</>,
          'Stopping texts does not affect your assignments, your pay, your team’s registration, or any email we send you.',
        ]} />
      </Section>

      <Section title="Your number">
        <p>
          We do not sell or rent phone numbers, and we never share mobile numbers or text-message consent with third
          parties for their own marketing. Numbers are shared only with the messaging provider that delivers the
          texts on our behalf. See the {privacy} for the full picture, and the {terms} for the rest of the
          agreement.
        </p>
      </Section>

      <Section title="Who we are">
        <p>
          We have run youth and high-school lacrosse tournaments in Florida since 2007, organized since 2019 as
          Sunshine Events Group LLC, a Florida limited liability company. We operate Whistle Ready, the software
          that runs our events.
        </p>
        <p>
          <a href="https://sunshineeventsgroup.com" className="text-teal-700 hover:underline">sunshineeventsgroup.com</a>
        </p>
      </Section>

      <Section title="Contact">
        <Contact />
      </Section>
    </LegalPage>
  )
}
