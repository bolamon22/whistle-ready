import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage, { Section, Bullets, Contact } from '../LegalPage'

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
        <p>The checkbox reads:</p>
        <p className="rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-slate-700">
          Yes, text me staff and game-day updates at this number from Sunshine Events Group. Message frequency
          varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.
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

      <Section title="Contact">
        <Contact />
      </Section>
    </LegalPage>
  )
}
