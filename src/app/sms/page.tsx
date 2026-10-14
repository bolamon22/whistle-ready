import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage, { Section, Bullets, Contact } from '../LegalPage'
import { smsConsentText } from '@/lib/smsConsent'

// The public description of the staff text-message program.
//
// Written for a carrier's toll-free verification reviewer as much as for staff:
// a TFV submission is judged partly on whether the business has a reachable,
// branded page that names who sends, what gets sent, how often, how to stop, and
// what happens to the number (rejection codes 30489/30492/30493 cover exactly
// this). Keep it true to what src/lib/smsConsent.ts actually says on the signup
// form — a reviewer compares the two.

export const metadata: Metadata = {
  title: 'Text message program',
  description: 'How Sunshine Events Group texts event staff: who gets messages, what they contain, and how to stop them.',
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
          Sunshine Events Group, which operates Whistle Ready (whistleready.app), sends text messages to the
          referees, scorekeepers, field staff and athletic trainers who work our events — and only to those who
          have asked us to.
        </p>
        <p>
          This is an internal staffing tool. It is not marketing, and we do not text players, parents, clubs or
          anyone who has not worked for us.
        </p>
      </>}
    >
      <Section title="Who gets messages">
        <p>
          Only event staff who ticked the box asking to be texted. Nobody is added by being on a roster, by giving
          us a phone number, or by working an event.
        </p>
      </Section>

      <Section title="How staff opt in">
        <Bullets items={[
          <>On the staff signup form, there is a checkbox under the phone number. It is <b>never pre-ticked</b>, and signup can be completed without it.</>,
          <>Staff already signed up can turn it on themselves from their staff home page, and turn it off there at any time.</>,
          <>We record the date each person agreed, and which of the two they used.</>,
        ]} />
        <p>This is the control exactly as it appears on the staff signup form:</p>

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

        <p className="text-sm text-slate-500">
          The box starts empty. Signup completes whether or not it is ticked, and nothing about this consent is
          bundled with any other agreement.
        </p>
      </Section>

      <Section title="What we send">
        <Bullets items={[
          'Your assignments for an event, and changes to them.',
          'Schedule and field changes on game day.',
          'Requests for help on a field — an athletic trainer, equipment, or an official needed.',
          'Check-in and arrival reminders on the morning of an event.',
        ]} />
        <p>
          Example: &ldquo;Monster Mash: you&apos;re on Field 4 at 8:00am, not Field 2. Reply STOP to opt out.&rdquo;
        </p>
      </Section>

      <Section title="How often">
        <p>
          Message frequency varies. Most staff hear from us only in the days around an event they are working, and
          not at all between events.
        </p>
      </Section>

      <Section title="Cost">
        <p>Message and data rates may apply, depending on your mobile plan. We do not charge for these messages.</p>
      </Section>

      <Section title="How to stop">
        <Bullets items={[
          <>Reply <b>STOP</b> to any message. We stop immediately.</>,
          <>Or turn texts off on your staff home page, which takes effect the same way.</>,
          <>Reply <b>HELP</b> for help, or use the contact details below.</>,
          'Stopping texts does not affect your assignments, your pay, or any email we send you.',
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
          Sunshine Events Group LLC, a Florida limited liability company, running youth and high-school lacrosse
          tournaments in Florida since 2019. We operate Whistle Ready, the software that runs our events.
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
