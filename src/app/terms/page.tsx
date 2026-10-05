import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPage, { Section, Bullets, Contact } from '../LegalPage'

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'The terms for using Whistle Ready, including its end-user license.',
  alternates: { canonical: '/terms' },
}

const privacy = <Link href="/privacy" className="text-teal-700 hover:underline">Privacy Policy</Link>

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Use"
      intro={<>
        <p>
          These terms are an agreement between you and Sunshine Events Group (&ldquo;we&rdquo;, &ldquo;us&rdquo;), which operates
          Whistle Ready (whistleready.app). By creating an account or using Whistle Ready, you agree to them.
        </p>
        <p>
          If you use Whistle Ready for a club, team or organization, you agree to these terms for it too, and confirm you&apos;re
          allowed to.
        </p>
      </>}
    >
      <Section title="1. Your license to use Whistle Ready">
        <p>
          Whistle Ready helps organizers run sports events, and helps clubs, coaches, players, families and event staff
          register, pay and keep up with those events. We give you a limited, non-exclusive, non-transferable, revocable
          license to use Whistle Ready for that purpose, under these terms. We and our licensors keep all rights in
          Whistle Ready itself.
        </p>
      </Section>

      <Section title="2. Accounts">
        <Bullets items={[
          'Give accurate information and keep it up to date.',
          'Keep your password private. You are responsible for what happens under your account, so tell us right away if you think someone else has used it.',
          'If you are under 18, you may use Whistle Ready only with a parent or guardian’s permission, and they agree to these terms for you.',
          'We may suspend or close an account that breaks these terms or puts other people at risk.',
        ]} />
      </Section>

      <Section title="3. Acceptable use">
        <p>You agree not to:</p>
        <Bullets items={[
          'look at information or parts of Whistle Ready you are not authorized to see, or try to get around its security or access limits;',
          'copy, sell, rent or reverse engineer Whistle Ready, or collect data from it with automated tools;',
          'upload anything unlawful, harmful or infringing, or information you don’t have the right to share;',
          'send spam, or use Whistle Ready to harass, mislead or harm anyone;',
          'interfere with Whistle Ready or with other people’s use of it.',
        ]} />
      </Section>

      <Section title="4. Your information and content">
        <p>
          You keep ownership of the information and content you put into Whistle Ready. You let us store, process and display
          it as needed to run Whistle Ready and the events you take part in, as described in our {privacy}. When you enter
          information about other people, such as players on a roster, you confirm you have the right to share it.
        </p>
      </Section>

      <Section title="5. Events, organizers and payments">
        <Bullets items={[
          'Each event is run by its organizer, who sets its fees, deadlines, refund and cancellation policies, rules and schedule. Questions about an event go to its organizer.',
          'Waivers you sign for an event are agreements with that event’s organizer.',
          'Payments are processed by Stripe, or PayPal where offered, under their own terms. The organizer sets the amount due, and refunds follow the organizer’s policy.',
        ]} />
      </Section>

      <Section title="6. Connected services">
        <p>
          Whistle Ready can connect to services you or your organization use, such as QuickBooks Online, Stripe, PayPal,
          Facebook and Instagram. Their own terms apply to your use of them. Whistle Ready uses only what it needs for the
          features you turn on, and you can disconnect a service at any time.
        </p>
      </Section>

      <Section title="7. Changes and availability">
        <p>
          We work to keep Whistle Ready available and accurate, but it may sometimes be unavailable or contain errors, and
          we may change, add or remove features. We may update these terms; we&apos;ll post the changes here and update the date
          at the top. If you keep using Whistle Ready after that, you accept the updated terms.
        </p>
      </Section>

      <Section title="8. Disclaimer">
        <p>
          Whistle Ready is provided &ldquo;as is&rdquo; and &ldquo;as available.&rdquo; To the fullest extent the law allows, we disclaim
          all warranties, express or implied, including merchantability, fitness for a particular purpose and
          non-infringement. Schedules, results and other event information can change; when it matters, check with the
          event organizer.
        </p>
      </Section>

      <Section title="9. Limitation of liability">
        <p>
          To the fullest extent the law allows, Sunshine Events Group is not liable for any indirect, incidental, special,
          consequential or punitive damages, or for lost profits, revenue or data, arising from your use of Whistle Ready.
          Our total liability for any claim about Whistle Ready is limited to the greater of $100 or the amount you paid us
          to use Whistle Ready itself (not event fees) in the 12 months before the claim. This does not limit any
          liability that the law does not allow to be limited.
        </p>
      </Section>

      <Section title="10. Indemnity">
        <p>
          If a claim is brought against us because you misused Whistle Ready or broke these terms, you agree to cover our
          reasonable costs of dealing with it, including reasonable legal fees.
        </p>
      </Section>

      <Section title="11. Ending">
        <p>
          You can stop using Whistle Ready at any time and ask us to close your account. We may suspend or end your access if
          you break these terms. The parts of these terms that by their nature should last, such as ownership, the
          disclaimer and the limits on liability, continue after that.
        </p>
      </Section>

      <Section title="12. Governing law">
        <p>
          These terms are governed by the laws of the State of Florida, without regard to its conflict-of-law rules. Any
          dispute will be handled in the state or federal courts located in Florida, unless the law requires otherwise.
        </p>
      </Section>

      <Section title="13. Contact us">
        <Contact />
      </Section>
    </LegalPage>
  )
}
