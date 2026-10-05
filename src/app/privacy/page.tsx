import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage, { Section, Bullets, Contact, LEGAL_EMAIL } from '../LegalPage'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'What information Whistle Ready collects, how it is used and shared, and the choices you have.',
  alternates: { canonical: '/privacy' },
}

const mail = <a href={`mailto:${LEGAL_EMAIL}`} className="text-teal-700 hover:underline">{LEGAL_EMAIL}</a>

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={<>
        <p>
          Whistle Ready (whistleready.app) is software for running sports tournaments and events: registration,
          payments, schedules, staffing and communication. It is operated by Sunshine Events Group (&ldquo;we&rdquo;, &ldquo;us&rdquo;).
        </p>
        <p>This policy explains what information Whistle Ready collects, how we use and share it, and the choices you have.</p>
      </>}
    >
      <Section title="Information we collect">
        <p className="font-semibold text-slate-800">Information you, your club or an event organizer give us</p>
        <Bullets items={[
          <><b>Account details:</b> name, email address, phone number and password. Passwords are stored only as a one-way hash.</>,
          <><b>Club and team registrations:</b> club name, contact people with their email and phone, teams and divisions, rosters, coaches, hotel needs and notes.</>,
          <><b>Player registrations and waivers:</b> player name, date of birth, grade, gender, USA Lacrosse membership number, jersey number, parent or guardian names and contact details, emergency contacts, waiver signatures, and any medical notes you choose to share.</>,
          <><b>Event staff</b> (referees, scorekeepers and other workers): contact details, availability, assignments, hours worked, pay rate, and how you&apos;d like to be paid (for example a Venmo or Zelle handle).</>,
          <><b>Payments:</b> amounts, dates, payment method, check numbers, invoice numbers and receipts. Card and bank payments are made through Stripe, or PayPal where offered. Those companies handle your card and bank details; Whistle Ready never receives or stores full card or bank account numbers.</>,
          <><b>Messages and questions:</b> emails and messages sent through Whistle Ready, and questions you ask the Whistle Ready assistant.</>,
          <><b>Photos and files</b> that organizers or users upload, such as logos, event photos and documents.</>,
        ]} />
        <p className="font-semibold text-slate-800 pt-2">Information collected automatically</p>
        <Bullets items={[
          'Cookies that keep you signed in and remember your settings.',
          'Usage information, such as pages visited, device and browser type, and approximate location based on IP address, through analytics tools (Vercel Analytics, Plausible and Google Analytics).',
          'If you turn on notifications, a push-notification token for your browser or device.',
        ]} />
      </Section>

      <Section title="How we use information">
        <Bullets items={[
          'To run events: registrations, rosters, pools, schedules, brackets, staffing, housing, check-in and credentials.',
          'To take and record payments, and to send invoices, receipts and payment reminders.',
          'To send messages about events you are part of, and alerts you asked for, such as following a team.',
          'To answer questions and provide support.',
          'To keep Whistle Ready secure, prevent fraud and misuse, and fix problems.',
          'To understand how Whistle Ready is used so we can improve it.',
        ]} />
        <p>We do not sell or rent personal information, and we don&apos;t share it with advertisers.</p>
      </Section>

      <Section title="QuickBooks Online">
        <p>An event organizer can connect their QuickBooks Online company to Whistle Ready so their invoices and payments are recorded in their own books. When they do:</p>
        <Bullets items={[
          'Whistle Ready connects through Intuit’s secure authorization (OAuth 2.0). We never see the organizer’s QuickBooks password.',
          'Whistle Ready creates and updates the organizer’s own customers (clubs), invoices and payments in their QuickBooks company, and reads only what it needs to do that: the company name, customers, products and services, payment methods and invoice numbers.',
          'The QuickBooks connection is stored encrypted and is used only to keep that organizer’s books in step with their events. Data from QuickBooks is never sold, shared with other organizers, or used for anything else.',
          'The organizer can disconnect at any time, in QuickBooks or in Whistle Ready (Payment providers › Disconnect). After that, Whistle Ready can no longer read or write their QuickBooks data.',
        ]} />
      </Section>

      <Section title="How information is shared">
        <Bullets items={[
          <><b>With the organizer of each event you take part in.</b> Organizers see the registrations, payments and messages for their events. Clubs see their own registrations.</>,
          <><b>On public event pages,</b> once the organizer publishes them: schedules, results, brackets, and team and club names. Contact details, dates of birth and medical notes are not shown on public pages.</>,
          <><b>With service providers</b> that run Whistle Ready for us, only so they can provide their service: Vercel (hosting, file storage and analytics), Turso (database), SendGrid (email), Stripe and PayPal (payments), Intuit (QuickBooks, when an organizer connects it), Anthropic (answers from the Whistle Ready assistant), Plausible and Google (site analytics), browser push services (notifications you turn on), and Meta (only when an organizer connects a Facebook or Instagram account to post event updates).</>,
          <><b>When the law requires it,</b> or to protect the safety and rights of people and of Whistle Ready.</>,
          <><b>If Whistle Ready or Sunshine Events Group is sold or merged,</b> information may move to the new owner, who must keep protecting it under this policy.</>,
        ]} />
      </Section>

      <Section title="Children">
        <p>
          Many Whistle Ready events are youth events. Player information is provided by a parent or guardian, or by the
          player&apos;s club or team, so the player can register for and take part in events. Whistle Ready is not directed
          to children under 13, and we do not knowingly collect personal information directly from a child under 13
          without a parent or guardian&apos;s consent.
        </p>
        <p>
          A parent or guardian can ask to review, correct or delete their child&apos;s information by emailing {mail}. If we
          learn we have a child&apos;s information without the consent the law requires, we will delete it.
        </p>
      </Section>

      <Section title="How long we keep information">
        <p>
          We keep information as long as it&apos;s needed for the events and accounts it belongs to, and as long as accounting,
          tax and legal rules require (payment records, for example, are kept for several years). You can ask us to delete
          your information sooner, and we will unless we need to keep it for those reasons.
        </p>
      </Section>

      <Section title="Security">
        <p>
          We protect information with encrypted connections (HTTPS), passwords stored only as hashes, encrypted storage of
          payment-provider and QuickBooks connections, and access limited by role: for example, only organizers and the
          staff they choose can see payment information. No system is perfectly secure, so please use a strong password and
          keep it private. If a security breach affects your information, we will notify you as the law requires.
        </p>
      </Section>

      <Section title="Your choices">
        <Bullets items={[
          <>To see, correct or delete your information, email {mail}. Organizers can also correct registration details for their events.</>,
          'To stop non-essential emails, reply to one or email us. You will still get messages needed for an event you are registered for, such as schedules and receipts.',
          'To stop notifications, turn them off in your browser or device settings, or unfollow the team.',
          'You can block cookies in your browser, but you need them to sign in.',
        ]} />
      </Section>

      <Section title="Changes to this policy">
        <p>
          We&apos;ll post changes on this page and update the date at the top. If a change is significant, we&apos;ll tell account
          holders by email or in Whistle Ready. See also our <Link href="/terms" className="text-teal-700 hover:underline">Terms of Use</Link>.
        </p>
      </Section>

      <Section title="Contact us">
        <Contact />
      </Section>
    </LegalPage>
  )
}
