import type { Metadata } from 'next';
import Link from 'next/link';
import { Callout, Clause, LegalShell } from '@/components/Legal';
import { TRIAL_DAYS } from '@/lib/plans';

export const metadata: Metadata = {
  title: 'Terms of Service — Enforcee',
  description: 'The agreement between you and Enforcee: what we promise, what we do not, and what happens if either of us walks away.',
};

export default function Terms() {
  return (
    <LegalShell
      title="Terms of Service"
      updated="8 August 2026"
      intro={
        <>
          <p>
            These terms are the agreement between you and Enforcee. They are longer than we would like, because the
            alternative is a short document that quietly means something other than what it says.
          </p>
          <p className="mt-3">
            The part that matters most is <strong>clause 09</strong>. Read that one even if you read nothing else:{' '}
            <span className="hi font-semibold text-ink">
              Enforcee is a verification tool, not a security control.
            </span>{' '}
            It reduces how often a rule is missed. It cannot promise that a rule is never missed, and nothing on this
            site should be read as promising otherwise.
          </p>
        </>
      }
    >
      <Clause n="01" title="Who this agreement is with, and when it starts">
        <p>
          &ldquo;Enforcee&rdquo;, &ldquo;we&rdquo; and &ldquo;us&rdquo; mean the individual operating the service at{' '}
          <span className="font-mono text-[15px]">enforcee.vercel.app</span>, based in Hungary, in the European Union.
          &ldquo;You&rdquo; means the person or organisation using it.
        </p>
        <p>
          This agreement takes effect the first time you use any part of the service — the website, the command-line
          tool, the guard, the plugin, or the API — whether or not you create an account. If you are agreeing on behalf
          of a company, you confirm you are allowed to bind it.
        </p>
        <p>
          If you do not accept these terms, the remedy is simple and immediate: stop using it, and delete your account
          if you made one.
        </p>
      </Clause>

      <Clause n="02" title="What the service actually is">
        <p>Enforcee does three separate things, and they carry different promises.</p>
        <ul>
          <li>
            <strong>It audits.</strong> You give it a set of rules and something an AI produced. It returns a per-rule
            verdict, the evidence it found, and an honest label for anything it could not settle. Some verdicts are
            produced by reproducible checks on our side. Others are produced by asking a language model, and are
            labelled as such wherever they appear.
          </li>
          <li>
            <strong>It guards.</strong> On paid plans you can install a component into your own development environment
            that inspects certain actions before they run and can refuse them, and that re-supplies your rules to the
            model at points where they would otherwise be lost. It runs on your machine, under your control, and you can
            remove it at any time.
          </li>
          <li>
            <strong>It records.</strong> Audits are kept so a rule can accumulate a track record, and so you can see when
            a rule that used to hold starts failing.
          </li>
        </ul>
        <Callout>
          What Enforcee is <strong>not</strong>: it is not a sandbox, not an antivirus, not a permissions system, not a
          code-review process, and not a substitute for reading what an AI wrote before you ship it. It is an extra
          check that catches things you would otherwise miss. It is not the only check you should have.
        </Callout>
      </Clause>

      <Clause n="03" title="Accounts">
        <ul>
          <li>You may use the command-line tool and the free web audit without an account at all.</li>
          <li>An account requires a working email address. You are responsible for keeping access to that inbox, because sign-in links go to it.</li>
          <li>One account is for one person. Share a subscription across a team and we may ask you to move to the right number of seats; keep doing it after we ask and we may suspend the account.</li>
          <li>Tell us promptly if you think somebody else has got into your account.</li>
          <li>You must be at least 16 years old.</li>
        </ul>
      </Clause>

      <Clause n="04" title="Your content stays yours">
        <p>
          Rules you write, code and text you audit, receipts you generate, and policies you compile remain entirely
          yours. We claim no ownership of any of it and we acquire no licence to it beyond the narrow one we need to
          operate the service for you: to process it in order to return your result, to store it if you asked us to keep
          your history, and to transmit the necessary portion to our model provider when you request a judged audit.
        </p>
        <p>
          <strong>We do not use your content to train models</strong>, ours or anybody else&apos;s, and our agreement
          with our model provider does not permit them to either. We do not read your audits except where you explicitly
          ask us to look at one to help you with a problem.
        </p>
        <p>
          You keep responsibility for what you put in. You confirm you have the right to submit it, and that doing so
          does not breach a duty you owe to someone else — an employer, a client, or a licence.
        </p>
      </Clause>

      <Clause n="05" title="Our content stays ours">
        <p>
          The service, its interface, its documentation, its methodology and the software behind it are ours and are
          protected by copyright and related rights. Using Enforcee does not transfer any of that to you.
        </p>
        <p>Specifically, and to save an argument later, you may not:</p>
        <ul>
          <li>copy, adapt, translate or create derivative works from any part of the service except where a component is published by us under an open-source licence, in which case that licence governs that component and nothing else;</li>
          <li>reverse engineer, decompile or disassemble any part of the service, except to the strict extent that applicable law says you may despite this clause;</li>
          <li>use the service, or automated access to it, to build or train a competing product, or to extract our checking methodology, our rule taxonomy, our evaluation prompts, our thresholds or our scoring in order to reproduce them elsewhere;</li>
          <li>scrape, crawl or bulk-download any part of the service, or access the API other than through the documented interface with your own credentials;</li>
          <li>remove or obscure any notice of ownership, or present output of the service as produced by something else;</li>
          <li>resell, sublicense or provide the service to third parties as a service of your own, unless we have agreed that in writing.</li>
        </ul>
        <p>
          Feedback you send us — bug reports, suggestions, feature requests — we may use freely and without obligation.
          If you would rather that were not the case, do not send it.
        </p>
      </Clause>

      <Clause n="06" title="Acceptable use">
        <p>Do not use Enforcee to:</p>
        <ul>
          <li>break the law, or help anyone else do so;</li>
          <li>submit content you have no right to submit, including someone else&apos;s confidential material or personal data you were not permitted to share;</li>
          <li>attack, overload, probe or circumvent the service, its rate limits, its quotas or its entitlement checks, or attempt to reach data belonging to another account;</li>
          <li>use automated means to consume the judged layer beyond what a person auditing their own work would plausibly need;</li>
          <li>produce a receipt intended to mislead a third party about what an AI did — a receipt is a record, and forging a record is fraud whichever tool you used;</li>
          <li>present Enforcee&apos;s output as a guarantee of safety, correctness or compliance to a customer, a regulator or an employer.</li>
        </ul>
        <p>
          We may suspend an account immediately, without notice, where continued use would harm the service or other
          users. Where we can give notice first, we will, and where we suspend without it we will tell you the reason
          afterwards and give you a way to answer it.
        </p>
      </Clause>

      <Clause n="07" title="Plans, trials and payment">
        <ul>
          <li>
            <strong>Free</strong> is free, permanently, and does not require a card. What it includes and what it
            deliberately excludes is set out on the{' '}
            <Link href="/pricing" className="text-brand hover:underline">pricing page</Link>, which forms part of these
            terms.
          </li>
          <li>
            <strong>The {TRIAL_DAYS}-day trial</strong> gives you the full paid plan. We do not require a card to start
            it. If no payment method is present when the trial ends, the subscription simply ends — nothing is charged,
            and your account drops back to Free with auditing still working.
          </li>
          <li>
            <strong>Subscriptions renew automatically</strong> at the price shown when you subscribed, monthly or
            yearly, until cancelled. Payments are handled by Stripe; we never see or store your card details.
          </li>
          <li>
            <strong>Cancel any time</strong>, from your account or by emailing us. Cancellation takes effect at the end
            of the period you have already paid for, and you keep the paid features until then.
          </li>
          <li>
            <strong>Prices</strong> are in USD and exclude any tax that applies where you are. Struck-through prices on
            the pricing page are our standard prices; the price beside them is a launch price that we may stop offering
            to new customers at any time. If you subscribe at a launch price, that is your price for as long as your
            subscription runs uninterrupted.
          </li>
          <li>
            <strong>If we raise the price</strong> of a plan you are on, we will email you at least 30 days beforehand,
            and it takes effect at your next renewal. Cancelling before then costs you nothing.
          </li>
          <li>
            <strong>Failed payments.</strong> We retry for a short period. If it keeps failing the subscription lapses
            to Free rather than the account being deleted.
          </li>
        </ul>
      </Clause>

      <Clause n="08" title="Refunds">
        <p>
          If you are in the EU or UK you have a statutory 14-day right of withdrawal on a distance purchase. Because a
          trial precedes every paid plan, you will normally have used the product for thirty days before you are charged
          anything — but the right stands regardless, and we will not argue about it.
        </p>
        <p>
          Beyond that: if something we sold you does not do what this site says it does, tell us and we will refund you.
          We would rather give the money back than have somebody paying for something that disappointed them. What we
          will not refund is a subscription that ran for months unused — cancelling is one click, and we send a receipt
          for every charge.
        </p>
      </Clause>

      <Clause n="09" title="What we do not promise — read this one">
        <Callout>
          <strong>Enforcee is a verification tool, not a security control.</strong> It reduces the rate at which
          instructions are silently missed. It does not eliminate it, and it must never be the only thing standing
          between an AI and something that matters.
        </Callout>
        <p>Concretely, and without hedging:</p>
        <ul>
          <li>
            <strong>An audit can be wrong.</strong> Part of every audit is a judgement made by a language model. We
            constrain it hard — every judged verdict must carry a quote we can find in your own text, and a verdict
            whose evidence fails that test is downgraded rather than shown — but a constrained judgement is still a
            judgement, and it can be mistaken in either direction.
          </li>
          <li>
            <strong>A clean audit is not proof that nothing went wrong.</strong> It means nothing was found by the
            checks that ran. Some rules cannot be checked mechanically at all, and we label those instead of pretending.
            Read the coverage figure: it exists precisely so that &ldquo;we could not tell&rdquo; never disguises itself
            as &ldquo;it passed&rdquo;.
          </li>
          <li>
            <strong>The guard can be bypassed.</strong> It operates inside a development environment you control,
            through interfaces provided by third-party software we do not own. It can be disabled, uninstalled,
            circumvented, or rendered ineffective by a change to that software. It should be treated as a seatbelt, not
            as a locked door.
          </li>
          <li>
            <strong>We do not review your code for security.</strong> Enforcee checks your output against{' '}
            <em>your</em> rules. If your rules do not cover something dangerous, neither will Enforcee.
          </li>
          <li>
            <strong>You remain responsible for what you ship.</strong> Every professional obligation you had before you
            installed Enforcee — reviewing code, testing it, complying with your industry&apos;s rules — you still have.
          </li>
          <li>
            <strong>Third parties can change.</strong> The service depends on providers whose models, interfaces and
            terms are outside our control. A change on their side can alter or interrupt what Enforcee does, sometimes
            without warning to us either.
          </li>
        </ul>
        <p>
          The service is provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>. To the fullest
          extent the law allows, we exclude all implied warranties, including merchantability, fitness for a particular
          purpose and non-infringement. We do not warrant that the service will be uninterrupted, error-free, or that
          any defect will be fixed.
        </p>
      </Clause>

      <Clause n="10" title="Liability">
        <p>
          Nothing here limits liability for death or personal injury caused by negligence, for fraud or fraudulent
          misrepresentation, or for anything else that cannot lawfully be limited. If you are a consumer, your statutory
          rights are unaffected by anything in this document.
        </p>
        <p>Subject to that, and to the fullest extent the law allows:</p>
        <ul>
          <li>
            we are not liable for indirect or consequential loss, loss of profit, loss of revenue, loss of business,
            loss of goodwill, loss of anticipated savings, or loss or corruption of data, however it arises;
          </li>
          <li>
            we are not liable for any harm arising from an action an AI took, or failed to take, whether or not Enforcee
            audited it, guarded it, passed it, failed it or said nothing about it at all;
          </li>
          <li>
            our total liability to you for all claims in any twelve-month period is capped at the greater of the amount
            you actually paid us in that period, or 50 USD.
          </li>
        </ul>
        <p>
          That cap is low because the price is low, and both reflect the same honest position: this is a tool that helps
          you catch things, sold at a tool&apos;s price, not an insurance policy sold at an insurer&apos;s.
        </p>
      </Clause>

      <Clause n="11" title="Your indemnity">
        <p>
          If someone brings a claim against us because of content you submitted, because of how you used the service, or
          because you broke these terms or the law, you will cover our reasonable costs and any damages awarded. We will
          tell you promptly about any such claim, let you take part in defending it, and not settle it without asking
          you first.
        </p>
      </Clause>

      <Clause n="12" title="Availability and changes to the service">
        <p>
          We will try to keep the service up, but it may be unavailable for maintenance, for reasons at a provider, or
          for reasons nobody anticipated. There is no uptime commitment on any plan sold on this site.
        </p>
        <p>
          We may change, add or remove features. If we remove something material that a paid plan advertised, we will
          tell subscribers by email, and if the change materially reduces what you paid for you may cancel and receive a
          pro-rata refund of the unused period.
        </p>
        <p>
          If we ever discontinue the service entirely, we will give at least 60 days&apos; notice, stop charging
          immediately, refund the unused portion of any prepaid period, and keep an export route open until the end.
        </p>
      </Clause>

      <Clause n="13" title="Ending the agreement">
        <ul>
          <li><strong>You</strong> may stop at any time by cancelling and deleting your account. Deleting the account removes your rulesets, audits and receipts. That cannot be undone.</li>
          <li><strong>We</strong> may terminate for a material breach of these terms that you have not fixed within 14 days of us telling you about it, or immediately for the conduct listed in clause 06.</li>
          <li>If we terminate for reasons other than your breach, we refund the unused part of any prepaid period.</li>
          <li>Clauses 04, 05, 09, 10, 11 and 15 survive the end of this agreement.</li>
        </ul>
      </Clause>

      <Clause n="14" title="Privacy">
        <p>
          How we handle personal data is set out in the{' '}
          <Link href="/privacy" className="text-brand hover:underline">Privacy Policy</Link>, which forms part of these
          terms. In short: most of the product never sends anything anywhere, we store no IP addresses, and we do not
          run analytics or trackers.
        </p>
      </Clause>

      <Clause n="15" title="Law, disputes and the rest">
        <ul>
          <li>
            <strong>Governing law.</strong> Hungarian law governs this agreement, and the courts of Hungary have
            jurisdiction. If you are a consumer resident elsewhere in the EU, this does not deprive you of the
            protection of your own country&apos;s mandatory consumer law, or of your right to bring proceedings there.
          </li>
          <li>
            <strong>Talk to us first.</strong> Before anything formal, email{' '}
            <a href="mailto:hello@enforcee.app" className="text-brand hover:underline">hello@enforcee.app</a>. Almost
            everything is a misunderstanding that a reply fixes.
          </li>
          <li>
            <strong>Online dispute resolution.</strong> EU consumers may also use the European Commission&apos;s ODR
            platform.
          </li>
          <li>
            <strong>Changes to these terms.</strong> We will post the new version with a new date, and email account
            holders at least 14 days before a material change takes effect. Continuing to use the service afterwards
            means you accept it; if you do not, cancel and we will refund the unused period.
          </li>
          <li>
            <strong>Assignment.</strong> You may not transfer this agreement without our consent. We may transfer it to
            a successor of the business, on the same terms, with notice to you.
          </li>
          <li>
            <strong>Severability.</strong> If a court finds part of this unenforceable, the rest still stands.
          </li>
          <li>
            <strong>No waiver.</strong> Not enforcing something once does not mean giving it up.
          </li>
          <li>
            <strong>Entire agreement.</strong> These terms, the Privacy Policy and the pricing page are the whole
            agreement between us and replace anything said beforehand.
          </li>
          <li>
            <strong>Force majeure.</strong> Neither of us is liable for a failure caused by something genuinely outside
            our control.
          </li>
        </ul>
      </Clause>
    </LegalShell>
  );
}
