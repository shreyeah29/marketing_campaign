import Link from 'next/link'

/**
 * The privacy policy, at a public URL.
 *
 * Meta requires one before an app can go Live, and a reviewer opens it. A
 * generated template would pass the form and fail the human: it would describe
 * data handling this system does not do and omit the parts it does — the
 * encrypted Meta tokens, the reference images sent to an image model, the
 * campaign copy sent to a language model.
 *
 * So this is written from what the code actually does. Every processor named
 * below is one this application really calls, and every category of data is one
 * it really stores. The parts only the operator can supply — legal entity,
 * address, contact address, governing law — are marked and must be filled in
 * before this is submitted anywhere.
 *
 * It is not legal advice and has not been reviewed by a lawyer.
 *
 * Deliberately outside `/app`: a policy behind a login is a policy Meta's
 * reviewer cannot read.
 */

export const metadata = {
  title: 'Privacy Policy — Marketing OS',
  description: 'What Marketing OS collects, why, who processes it, and how to have it deleted.',
}

/** Fill these in before submitting the app for review. */
const OPERATOR = {
  legalName: '[Your registered company name]',
  address: '[Registered address]',
  email: '[privacy@yourdomain.com]',
  jurisdiction: '[India]',
}

const UPDATED = '20 August 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 18, marginBottom: 10, letterSpacing: '-0.01em' }}>{title}</h2>
      {children}
    </section>
  )
}

export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: '68ch',
        margin: '0 auto',
        padding: '56px 24px 96px',
        lineHeight: 1.65,
      }}
    >
      <Link className="btn ghost sm" href="/" style={{ marginBottom: 24 }}>
        ← Marketing OS
      </Link>

      <h1 style={{ fontSize: 30, letterSpacing: '-0.02em', marginBottom: 8 }}>Privacy Policy</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Last updated {UPDATED}
      </p>

      <p style={{ marginTop: 24 }}>
        Marketing OS is operated by {OPERATOR.legalName} ({OPERATOR.address}). It is a marketing
        tool used by businesses to plan campaigns, generate creative, and publish to their own
        social accounts. This page explains what it stores, who it sends data to, and how to have
        that data removed.
      </p>

      <Section title="What we store">
        <ul>
          <li>
            <strong>Your account</strong> — name, email address, and a hashed password. Passwords
            are never stored in a readable form.
          </li>
          <li>
            <strong>Your workspace</strong> — business name, industry, brand colours, logo, contact
            details and any advertising disclaimers you configure.
          </li>
          <li>
            <strong>Campaign content</strong> — the briefs you write, the copy and captions
            generated from them, and the images and video generated for you.
          </li>
          <li>
            <strong>Files you upload</strong> — product photographs and reference designs.
          </li>
          <li>
            <strong>Contacts and leads</strong> — where you use the CRM, or where a lead arrives
            from an advertisement you ran: typically name, email address and phone number.
          </li>
          <li>
            <strong>Connected account credentials</strong> — when you connect Meta, we store the
            access token it issues, together with the identifiers of the Page and Instagram account
            you selected.
          </li>
          <li>
            <strong>Performance figures</strong> — impressions, clicks and lead counts retrieved
            from advertising platforms you have connected.
          </li>
        </ul>
      </Section>

      <Section title="What we do not store">
        <ul>
          <li>
            Card or bank details. Payments, where they apply, are handled outside this system.
          </li>
          <li>
            Your Facebook or Instagram password. Connecting uses Meta&rsquo;s own login screen.
          </li>
          <li>
            The contents of your social inbox, beyond messages you route through this application
            deliberately.
          </li>
        </ul>
      </Section>

      <Section title="Who else processes it">
        <p>
          Marketing OS is built on other services. Each receives only what it needs to do its part,
          and none of them are permitted to use your data for their own purposes.
        </p>
        <ul>
          <li>
            <strong>Meta Platforms</strong> — to publish to the Facebook Page and Instagram account
            you connect, to run advertisements you create, and to retrieve leads and performance
            figures for them.
          </li>
          <li>
            <strong>OpenAI</strong> — receives your campaign briefs and prompts to write copy, and
            receives reference or product images you upload in order to generate artwork or describe
            a visual style.
          </li>
          <li>
            <strong>Runway</strong> — receives image and video prompts, and product photographs
            where you have asked for the product to appear in the result.
          </li>
          <li>
            <strong>Supabase</strong> — stores generated and uploaded media files.
          </li>
          <li>
            <strong>Render and Vercel</strong> — host the application and its database.
          </li>
          <li>
            <strong>Resend</strong> — sends transactional and notification email.
          </li>
        </ul>
      </Section>

      <Section title="How connected accounts are protected">
        <p>
          The access token Meta issues is the one credential in this system that could be used to
          act as you. It is encrypted before it is written down, using a key held separately from
          the database, and it is never displayed anywhere in the interface or returned by the API —
          not to you, and not to us.
        </p>
        <p>
          Every workspace&rsquo;s data is isolated at the database level, so one customer&rsquo;s
          query cannot reach another customer&rsquo;s rows.
        </p>
      </Section>

      <Section title="Disconnecting and deletion">
        <ul>
          <li>
            <strong>Disconnect Meta at any time</strong> — in the application under All connections.
            This deletes the stored token immediately.
          </li>
          <li>
            <strong>Revoke from Meta&rsquo;s side</strong> — Facebook Settings &rarr; Business
            integrations &rarr; remove Marketing OS. This works whether or not you can reach this
            application.
          </li>
          <li>
            <strong>Delete your data</strong> — write to {OPERATOR.email} and we will delete your
            workspace and everything in it. We will confirm when it is done.
          </li>
        </ul>
      </Section>

      <Section title="How long it is kept">
        <p>
          Campaign content and contacts are kept while your workspace is active, and removed when
          you ask us to delete it. Access tokens are removed the moment you disconnect. Some records
          may persist briefly in encrypted backups before those expire.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You may ask what we hold about you, ask for it to be corrected, or ask for it to be
          deleted. Write to {OPERATOR.email}. This service is operated from {OPERATOR.jurisdiction}
          and its data is processed there and in the regions of the providers named above.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes materially, we will say so in the application before the change
          takes effect. The date at the top always reflects the current version.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          {OPERATOR.legalName}
          <br />
          {OPERATOR.address}
          <br />
          {OPERATOR.email}
        </p>
      </Section>
    </main>
  )
}
