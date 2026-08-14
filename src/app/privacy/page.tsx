import type { Metadata } from 'next';
import { Callout, Clause, DataTable, LegalShell } from '@/components/Legal';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = {
  title: 'Privacy Policy — Enforcee',
  description: 'What Enforcee collects, why, how long it is kept, and who else touches it.',
};

export default function Privacy() {
  return (
    <LegalShell
      title="Privacy Policy"
      updated="8 August 2026"
      intro={
        <>
          <p>
            Enforcee is a tool for checking whether an AI followed the rules you gave it. To do that you sometimes hand
            us your rules and something an AI produced — which can be among the most sensitive text you own. This
            document says exactly what happens to it.
          </p>
          <p className="mt-3">
            The short version: <strong>most of Enforcee never sends anything anywhere.</strong> The command-line tool
            and the guard run entirely on your machine and make no network calls. Session transcripts you drop into the
            website are read in your browser and never uploaded. What does reach our servers is listed below, item by
            item.
          </p>
        </>
      }
    >
      <Clause n="01" title="Who we are">
        <p>
          Enforcee is operated by the individual publishing it at{' '}
          <span className="font-mono text-[15px]">enforcee.com</span>, based in Hungary, in the European Union.
          For the purposes of the UK and EU General Data Protection Regulation we are the <em>controller</em> of the
          personal data described here.
        </p>
        <p>
          Contact for anything in this document, including any request to exercise your rights:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand hover:underline">{CONTACT_EMAIL}</a>. We answer
          within 30 days, and usually far sooner.
        </p>
      </Clause>

      <Clause n="02" title="What never leaves your machine">
        <p>This is not a courtesy. It is how the product is built.</p>
        <ul>
          <li>
            <strong>The command-line tool.</strong> It makes zero network calls unless you explicitly pass a flag asking
            it to use the judged layer. There is no telemetry, no usage ping, no update check, and nothing to switch off,
            because there is nothing there.
          </li>
          <li>
            <strong>The guard.</strong> It runs inside your editor session, reads a policy file from your own project,
            and writes its decisions to a log file on your own disk. It never contacts us.
          </li>
          <li>
            <strong>Session transcripts.</strong> When you drop a session file onto the website it is parsed entirely in
            your browser using local JavaScript. The file is never uploaded, never stored, and never seen by us.
          </li>
          <li>
            <strong>Anything you audit without an account.</strong> If you are not signed in, nothing you paste is
            written to our database. It is processed to produce your result and discarded.
          </li>
        </ul>
      </Clause>

      <Clause n="03" title="What we do collect, and why">
        <DataTable
          rows={[
            [
              'Email address',
              'To create your account, send the sign-in link, and contact you about your subscription.',
              'Contract',
              'Until you delete your account.',
            ],
            [
              'Rulesets you save',
              'So audits can be linked to the same ruleset over time and rules can keep a track record.',
              'Contract',
              'Until you delete them or close your account.',
            ],
            [
              'Audit receipts, including the text you audited',
              'So you can reopen a past result and see whether a rule is getting worse.',
              'Contract',
              'Until you delete them or close your account.',
            ],
            [
              'Subscription and payment status',
              'To know what your account is entitled to and to handle renewals and cancellations.',
              'Contract',
              'Duration of the subscription, then 8 years for accounting law.',
            ],
            [
              'A one-way hash of your IP address',
              'To meter the judged layer so one caller cannot exhaust it for everybody.',
              'Legitimate interests — preventing abuse of a shared resource.',
              '30 days.',
            ],
            [
              'Server logs from our hosting provider',
              'To diagnose errors and detect attacks.',
              'Legitimate interests — keeping the service working and secure.',
              '1 hour to 1 day, set by the provider.',
            ],
          ]}
        />
        <Callout>
          <strong>We do not store your IP address.</strong> The rate limiter keeps a salted one-way hash, which cannot be
          reversed into an address. We do not want a list of who visits, so we made sure we could not build one.
        </Callout>
        <p>
          We do not use analytics, advertising pixels, session recording, fingerprinting, or third-party trackers of any
          kind. There is no cookie banner because the only cookies we set are the ones that keep you signed in.
        </p>
      </Clause>

      <Clause n="04" title="The judged layer, in detail">
        <p>
          Most of an audit is decided on our own servers with no external service involved. A minority of rules cannot be
          settled that way, and for those the rule text and the text you are auditing are sent to our model provider,
          Anthropic, over an encrypted connection, and a verdict comes back.
        </p>
        <ul>
          <li>This only happens when you ask for a full audit. A deterministic audit never sends anything to a model.</li>
          <li>
            We send only what is needed to answer the question: the rules being judged, and the output under audit. Not
            your email, not your account, not your other rulesets.
          </li>
          <li>
            Our commercial agreement with the provider does not permit your inputs or outputs to be used to train their
            models.
          </li>
          <li>
            On the free tier you may use your own key instead, in which case the request is between you and the provider
            and never touches our infrastructure.
          </li>
        </ul>
      </Clause>

      <Clause n="05" title="Who else touches your data">
        <p>
          We use a small number of processors. Each is bound by a data-processing agreement, and each is listed here so
          you can check them yourself rather than take our word for it.
        </p>
        <ul>
          <li><strong>Vercel</strong> — hosting and delivery of the website and its API.</li>
          <li><strong>Supabase</strong> — database and authentication. Our project is hosted in Frankfurt, Germany.</li>
          <li><strong>Anthropic</strong> — the judged layer described above.</li>
          <li><strong>Stripe</strong> — subscription payments. Card details go directly to Stripe and never reach us; we store only a customer reference and a subscription status.</li>
        </ul>
        <p>
          Some of these operate infrastructure outside the European Economic Area. Where personal data is transferred out
          of the EEA it is covered by the European Commission&apos;s Standard Contractual Clauses. We do not sell personal
          data, and we do not share it with anyone not listed above.
        </p>
      </Clause>

      <Clause n="06" title="Security">
        <ul>
          <li>Every row in our database carries row-level security, applied from the first migration rather than added later. One account cannot read another account&apos;s rows, and the key used by the browser cannot bypass it.</li>
          <li>Administrative tables are locked entirely to public keys and reachable only through a server-side allowlist.</li>
          <li>Payment webhooks are cryptographically verified before anything is acted on.</li>
          <li>All traffic is encrypted in transit. Data is encrypted at rest by our infrastructure providers.</li>
          <li>Secrets are held as server-side environment variables and are never exposed to the browser.</li>
        </ul>
        <p>
          No system is perfect. If you believe you have found a vulnerability, write to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand hover:underline">{CONTACT_EMAIL}</a> before
          disclosing it publicly, and we will work with you and credit you if you would like.
        </p>
      </Clause>

      <Clause n="07" title="What you should not paste">
        <Callout>
          Please do not paste passwords, API keys, private keys, payment details, medical records, or anyone else&apos;s
          personal data into an audit. Enforcee has no use for them, and the safest data is the data we never receive.
        </Callout>
        <p>
          If you do so accidentally, delete the audit from your history and rotate the credential. Deleting an audit
          removes it and its per-rule results immediately and permanently.
        </p>
      </Clause>

      <Clause n="08" title="Your rights">
        <p>Under the GDPR you may, at any time, ask us to:</p>
        <ul>
          <li><strong>Access</strong> a copy of everything we hold about you.</li>
          <li><strong>Correct</strong> anything inaccurate.</li>
          <li><strong>Delete</strong> your account and its contents. We action this within 30 days, and backups age out within a further 7.</li>
          <li><strong>Export</strong> your data in a portable, machine-readable form. Receipts are already JSON you can download yourself at any time.</li>
          <li><strong>Restrict or object</strong> to processing carried out on the basis of legitimate interests.</li>
          <li><strong>Withdraw consent</strong> where we relied on it, without affecting anything done beforehand.</li>
        </ul>
        <p>
          None of these cost anything and none of them require a reason. If you think we have handled your data badly,
          you may complain to your national supervisory authority — in Hungary, the Nemzeti Adatvédelmi és
          Információszabadság Hatóság (NAIH).
        </p>
      </Clause>

      <Clause n="09" title="Cookies">
        <p>
          We set one category of cookie: the session cookies that keep you signed in after you click a sign-in link.
          They are strictly necessary for the service to work and are exempt from consent requirements. They are removed
          when you sign out. We set no analytics, advertising or profiling cookies at all.
        </p>
      </Clause>

      <Clause n="10" title="Children">
        <p>
          Enforcee is a developer tool and is not directed at anyone under 16. We do not knowingly collect data from
          children. If you believe a child has given us data, write to us and we will delete it.
        </p>
      </Clause>

      <Clause n="11" title="Changes">
        <p>
          If we change this policy in a way that affects you, we will change the date at the top and email anyone with an
          account before the change takes effect. We will not quietly widen what we collect and hope nobody reads the
          diff.
        </p>
      </Clause>
    </LegalShell>
  );
}
