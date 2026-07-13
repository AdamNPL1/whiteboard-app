import Link from "next/link";
import type { CSSProperties } from "react";

const contactEmail = "support@scribooapp.com";
const effectiveDate = "July 12, 2026";

export default function TermsPage() {
  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={heroStyle}>
          <p style={eyebrowStyle}>Legal</p>
          <h1 style={titleStyle}>Terms of Service</h1>
          <p style={subtitleStyle}>
            These Terms of Service govern access to and use of Scriboo.
          </p>
          <p style={metaStyle}>Effective date: {effectiveDate}</p>
        </div>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>1. Acceptance of Terms</h2>
          <p style={paragraphStyle}>
            By creating an account, accessing, or using Scriboo, you agree
            to these Terms of Service. If you do not agree, do not use the
            service.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>2. The Service</h2>
          <p style={paragraphStyle}>
            Scriboo provides digital whiteboard, planning, scheduling, and
            collaboration features. We may improve, modify, or discontinue
            parts of the service at any time.
          </p>
          <p style={paragraphStyle}>
            Some parts of the service may depend on third-party infrastructure
            or providers. Features may evolve over time as the product grows.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>3. Accounts</h2>
          <p style={paragraphStyle}>
            You are responsible for maintaining the confidentiality of your
            account credentials and for activities that occur under your
            account. You must provide accurate information and keep it updated.
          </p>
          <p style={paragraphStyle}>
            You are responsible for any activity that happens through your
            account until you notify us of unauthorized access or a security
            issue.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>4. Acceptable Use</h2>
          <p style={paragraphStyle}>You agree not to:</p>
          <ul style={listStyle}>
            <li>use the service for unlawful, abusive, or fraudulent purposes</li>
            <li>interfere with the operation or security of the service</li>
            <li>attempt unauthorized access to other accounts or systems</li>
            <li>upload or share content you do not have rights to use</li>
            <li>use the service to distribute malware, spam, or harmful code</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>5. Subscriptions and Billing</h2>
          <p style={paragraphStyle}>
            Some features require a paid subscription. Prices, billing cycles,
            and included features are shown in the app. Payments are processed
            by Stripe. Unless canceled, subscriptions renew automatically under
            the plan terms shown at checkout or in the billing portal.
          </p>
          <p style={paragraphStyle}>
            We may change pricing, plan structure, or included features in the
            future. Material price changes will be communicated before they
            apply and will take effect prospectively from a stated renewal date.
            Customers may cancel before a new recurring price takes effect.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>6. Cancellation and Changes</h2>
          <p style={paragraphStyle}>
            You may cancel through the available billing tools. Unless clearly
            stated otherwise, cancellation stops renewal and paid access remains
            available until the end of the already-paid billing period.
          </p>
          <p style={paragraphStyle}>
            Upgrades take effect immediately without an extra charge for the
            remainder of the current period; the full upgraded price starts at
            the next renewal. Downgrades take effect at the next renewal. No
            partial-period credits or proration calculations are applied.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>7. Withdrawal, Refunds, and Complaints</h2>
          <p style={paragraphStyle}>
            Consumers may have a statutory 14-day right to withdraw from a
            distance contract. Where a consumer expressly requests immediate
            performance during that period, the consequences of withdrawal and
            any amount payable for service already supplied are governed by
            applicable consumer law. Nothing in these Terms removes mandatory
            consumer rights.
          </p>
          <p style={paragraphStyle}>
            Refund, billing, and service complaints may be submitted through the
            Help &amp; Support form or to <a href={`mailto:${contactEmail}`} style={linkStyle}>{contactEmail}</a>.
            Include the account email, relevant date, and a description of the
            issue. We aim to acknowledge requests promptly and respond within 14
            days where Polish consumer law requires that deadline. Approved
            refunds are returned through the original payment method.
          </p>
          <p style={paragraphStyle}>
            To submit a withdrawal or refund request electronically, use the{" "}
            <Link href="/withdrawal" style={linkStyle}>withdrawal and refund form</Link>.
            No special wording is required: clearly identify the account and state
            that you wish to withdraw or request a refund. We send an electronic
            confirmation with a reference number and receipt time. Submitting a
            request does not automatically cancel future renewals, so customers
            should also cancel the subscription through the billing portal unless
            the request asks us to do so.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>8. Intellectual Property</h2>
          <p style={paragraphStyle}>
            The service, branding, interface, and software are owned by
            Scriboo or its licensors. You retain rights to the content you
            create, subject to the rights needed for us to host and operate the
            service.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>9. User Content</h2>
          <p style={paragraphStyle}>
            You are responsible for the content you create, upload, share, or
            store through Scriboo. You confirm that you have the rights
            needed to use that content and to allow us to host it as part of
            operating the service.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>10. Availability and Disclaimers</h2>
          <p style={paragraphStyle}>
            The service is provided on an &quot;as is&quot; and &quot;as
            available&quot; basis. We do not guarantee uninterrupted
            availability, complete accuracy, or that the service will always be
            free from defects.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>11. Limitation of Liability</h2>
          <p style={paragraphStyle}>
            To the maximum extent allowed by law, Scriboo will not be liable
            for indirect, incidental, special, consequential, or punitive
            damages arising from use of or inability to use the service.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>12. Termination</h2>
          <p style={paragraphStyle}>
            We may suspend or terminate access if these terms are violated, if
            misuse is detected, or if needed to protect the service, users, or
            legal compliance.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>13. Governing Law</h2>
          <p style={paragraphStyle}>
            These Terms are governed by Polish law. This choice does not remove
            mandatory protections available to consumers under the law of their
            country of residence. Disputes should first be submitted through the
            complaint process above; consumers may also use available courts and
            public consumer-advice or alternative-dispute-resolution channels.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>14. Changes to These Terms</h2>
          <p style={paragraphStyle}>
            We may update these Terms of Service from time to time. Updated
            terms become effective when posted unless stated otherwise.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>15. Contact</h2>
          <p style={paragraphStyle}>
            If you have questions about these Terms of Service, contact:
          </p>
          <p style={contactStyle}>
            Scriboo
            <br />
            <a href={`mailto:${contactEmail}`} style={linkStyle}>
              {contactEmail}
            </a>
          </p>
        </section>

        <div style={footerStyle}>
          <Link href="/privacy" style={linkStyle}>
            Privacy Policy
          </Link>
          <Link href="/register" style={linkStyle}>
            Back to registration
          </Link>
          <Link href="/custom" style={linkStyle}>
            Open board
          </Link>
        </div>
      </div>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  padding: "32px 18px",
  background: "linear-gradient(135deg, #111827, #312e81 55%, #065f46)",
};

const cardStyle: CSSProperties = {
  width: "min(920px, 100%)",
  margin: "0 auto",
  display: "grid",
  gap: "22px",
  padding: "28px",
  borderRadius: "24px",
  background: "#ffffff",
  boxShadow: "0 24px 80px rgba(0,0,0,0.28)",
};

const heroStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  paddingBottom: "8px",
  borderBottom: "1px solid #e2e8f0",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "#7c3aed",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const titleStyle: CSSProperties = {
  margin: 0,
  color: "#111827",
  fontSize: "38px",
  fontWeight: 800,
  lineHeight: 1.05,
};

const subtitleStyle: CSSProperties = {
  margin: 0,
  color: "#475569",
  fontSize: "15px",
  lineHeight: 1.7,
  fontWeight: 500,
};

const metaStyle: CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: "13px",
  fontWeight: 700,
};

const sectionStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
};

const headingStyle: CSSProperties = {
  margin: 0,
  color: "#111827",
  fontSize: "20px",
  fontWeight: 800,
};

const paragraphStyle: CSSProperties = {
  margin: 0,
  color: "#334155",
  fontSize: "15px",
  lineHeight: 1.75,
  fontWeight: 500,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: "20px",
  color: "#334155",
  fontSize: "15px",
  lineHeight: 1.75,
  fontWeight: 500,
};

const contactStyle: CSSProperties = {
  margin: 0,
  color: "#111827",
  fontSize: "15px",
  lineHeight: 1.75,
  fontWeight: 700,
};

const footerStyle: CSSProperties = {
  display: "flex",
  gap: "18px",
  flexWrap: "wrap",
  paddingTop: "10px",
  borderTop: "1px solid #e2e8f0",
};

const linkStyle: CSSProperties = {
  color: "#6d28d9",
  fontSize: "14px",
  fontWeight: 700,
  textDecoration: "none",
};
