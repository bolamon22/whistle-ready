import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage, { Section, Bullets, LEGAL_EMAIL, LEGAL_PHONE } from '../LegalPage'
import { TERMS_OWNER, TERMS_UPDATED, TERMS_VERSION } from '@/lib/termsVersion'

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'The terms for using Whistle Ready, including its end-user license and confidentiality terms.',
  alternates: { canonical: '/terms' },
}

// People agree to this page with a checkbox (sign-in prompt, team registration,
// waivers), and the version they agreed to is recorded (lib/terms). When the
// wording changes in a way people should agree to again, bump TERMS_VERSION and
// TERMS_UPDATED in lib/termsVersion.ts.

const privacy = <Link href="/privacy" className="text-teal-700 hover:underline">Privacy Policy</Link>

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      updated={TERMS_UPDATED}
      intro={<>
        <p>
          These terms are an agreement between you and {TERMS_OWNER} (&ldquo;Whistle Ready&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;),
          which owns and operates the Whistle Ready software at whistleready.app and on event organizers&apos; own websites.
          By creating an account, ticking a box that says you agree, or using Whistle Ready, you agree to them.
        </p>
        <p>
          Event organizers, such as Sunshine Events Group, use Whistle Ready to run their events. If you use Whistle Ready
          for a club, team, organizer or other organization, you agree to these terms for it too, and confirm you&apos;re
          allowed to.
        </p>
      </>}
    >
      <Section title="1. Your license to use Whistle Ready">
        <p>
          Whistle Ready helps organizers run sports events, and helps clubs, coaches, players, families and event staff
          register, pay and keep up with those events. We give you a limited, non-exclusive, non-transferable, revocable
          license to use Whistle Ready for that purpose only, under these terms.
        </p>
      </Section>

      <Section title="2. Who owns Whistle Ready">
        <p>
          {TERMS_OWNER} owns Whistle Ready and everything in it that isn&apos;t your content: the software and its code, its
          features, workflows, screens, layouts, designs, help pages, training videos, the WHISTLE READY name and logos,
          and all related intellectual property. Using Whistle Ready does not give you any ownership of it or any right to
          use it except under the license above.
        </p>
      </Section>

      <Section title="3. Confidential information">
        <p>
          Many parts of Whistle Ready are not public. Depending on your role, you may see staff, scheduling, scoring,
          payment, assigning, reporting or administration screens, and how they work. Those non-public parts, and anything
          we tell you about features not yet released, are our confidential information. You agree to:
        </p>
        <Bullets items={[
          'use them only to take part in or help run the events you are involved in;',
          'not show, share, describe, screenshot or record them for anyone outside that purpose, including another event operator or software company;',
          'not share your login or let anyone else use your account.',
        ]} />
        <p>This does not cover information that is already public or that you already knew without a duty to keep it private.</p>
      </Section>

      <Section title="4. Acceptable use">
        <p>You agree not to:</p>
        <Bullets items={[
          'look at information or parts of Whistle Ready you are not authorized to see, or try to get around its security or access limits;',
          'copy, sell, rent, sublicense or reverse engineer Whistle Ready, or collect data from it with automated tools;',
          'use Whistle Ready, or anything you learn from using it, to build, design or help someone else build a product or service that competes with it;',
          'upload anything unlawful, harmful or infringing, or information you don’t have the right to share;',
          'send spam, or use Whistle Ready to harass, mislead or harm anyone;',
          'interfere with Whistle Ready or with other people’s use of it.',
        ]} />
      </Section>

      <Section title="5. Your information and content">
        <p>
          You keep ownership of the information and content you put into Whistle Ready. You let us store, process and display
          it as needed to run Whistle Ready and the events you take part in, as described in our {privacy}. When you enter
          information about other people, such as players on a roster, you confirm you have the right to share it.
        </p>
        <p>
          If you send us ideas or suggestions for Whistle Ready, we may use them without owing you anything.
        </p>
      </Section>

      <Section title="6. Events, organizers and payments">
        <Bullets items={[
          'Each event is run by its organizer, who sets its fees, deadlines, refund and cancellation policies, rules and schedule. Questions about an event go to its organizer.',
          'Waivers you sign for an event are agreements with that event’s organizer.',
          'Payments are processed by Stripe, or PayPal where offered, under their own terms. The organizer sets the amount due, and refunds follow the organizer’s policy.',
        ]} />
      </Section>

      <Section title="7. Connected services">
        <p>
          Whistle Ready can connect to services you or your organization use, such as QuickBooks Online, Stripe, PayPal,
          Facebook and Instagram. Their own terms apply to your use of them. Whistle Ready uses only what it needs for the
          features you turn on, and you can disconnect a service at any time.
        </p>
      </Section>

      <Section title="8. Changes and availability">
        <p>
          We work to keep Whistle Ready available and accurate, but it may sometimes be unavailable or contain errors, and
          we may change, add or remove features. We may update these terms; we&apos;ll post the changes here, update the date
          at the top and may ask you to agree again. If you keep using Whistle Ready after that, you accept the updated terms.
        </p>
      </Section>

      <Section title="9. Disclaimer">
        <p>
          Whistle Ready is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; To the fullest extent the law allows, we disclaim
          all warranties, express or implied, including merchantability, fitness for a particular purpose and
          non-infringement. Schedules, results and other event information can change; when it matters, check with the
          event organizer.
        </p>
      </Section>

      <Section title="10. Limitation of liability">
        <p>
          To the fullest extent the law allows, {TERMS_OWNER} is not liable for any indirect, incidental, special,
          consequential or punitive damages, or for lost profits, revenue or data, arising from your use of Whistle Ready.
          Our total liability for any claim about Whistle Ready is limited to the greater of $100 or the amount you paid us
          to use Whistle Ready itself (not event fees) in the 12 months before the claim. This does not limit any
          liability that the law does not allow to be limited.
        </p>
      </Section>

      <Section title="11. Indemnity">
        <p>
          If a claim is brought against us because you misused Whistle Ready or broke these terms, you agree to cover our
          reasonable costs of dealing with it, including reasonable legal fees.
        </p>
      </Section>

      <Section title="12. Enforcing these terms">
        <p>
          If you break the sections on ownership, confidential information or acceptable use, we may suffer harm that money
          alone can&apos;t fix, so we may ask a court to stop it, in addition to any other remedy.
        </p>
      </Section>

      <Section title="13. Ending">
        <p>
          You can stop using Whistle Ready at any time and ask us to close your account. We may suspend or end your access if
          you break these terms. The parts of these terms that by their nature should last, such as ownership,
          confidentiality, the disclaimer and the limits on liability, continue after that.
        </p>
      </Section>

      <Section title="14. Governing law">
        <p>
          These terms are governed by the laws of the State of Florida, without regard to its conflict-of-law rules. Any
          dispute will be handled in the state or federal courts located in Florida, unless the law requires otherwise.
        </p>
      </Section>

      <Section title="15. Contact us">
        <p>
          {TERMS_OWNER}<br />
          11830 Wiles Rd, Coral Springs, FL 33076<br />
          Email: <a href={`mailto:${LEGAL_EMAIL}`} className="text-teal-700 hover:underline">{LEGAL_EMAIL}</a><br />
          Phone: {LEGAL_PHONE}
        </p>
        <p className="text-xs text-slate-400">Version {TERMS_VERSION}</p>
      </Section>
    </LegalPage>
  )
}
