import Link from "next/link";
import type { CSSProperties } from "react";

const contactEmail = "nowakowskia43@gmail.com";
const effectiveDate = "July 6, 2026";

export default function TermsPage() {
  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={heroStyle}>
          <p style={eyebrowStyle}>Legal</p>
          <h1 style={titleStyle}>Terms of Service</h1>
          <p style={subtitleStyle}>
            These Terms of Service govern access to and use of Blackboard.
          </p>
          <p style={metaStyle}>Effective date: {effectiveDate}</p>
        </div>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>1. Acceptance of Terms</h2>
          <p style={paragraphStyle}>
            By creating an account, accessing, or using Blackboard, you agree
            to these Terms of Service. If you do not agree, do not use the
            service.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>2. The Service</h2>
          <p style={paragraphStyle}>
            Blackboard provides digital whiteboard, planning, scheduling, and
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
            future. If we do, updated pricing will apply prospectively as
            described in the app, at checkout, or in your billing settings.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>6. Cancellation and Changes</h2>
          <p style={paragraphStyle}>
            You may cancel your subscription through the available billing
            tools. If you cancel, your paid access may remain active until the
            end of the current billing period, depending on your billing
            settings and Stripe subscription state.
          </p>
          <p style={paragraphStyle}>
            Except where required by law, subscription payments are generally
            non-refundable once a billing period has started.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>7. Intellectual Property</h2>
          <p style={paragraphStyle}>
            The service, branding, interface, and software are owned by
            Blackboard or its licensors. You retain rights to the content you
            create, subject to the rights needed for us to host and operate the
            service.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>8. User Content</h2>
          <p style={paragraphStyle}>
            You are responsible for the content you create, upload, share, or
            store through Blackboard. You confirm that you have the rights
            needed to use that content and to allow us to host it as part of
            operating the service.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>9. Availability and Disclaimers</h2>
          <p style={paragraphStyle}>
            The service is provided on an &quot;as is&quot; and &quot;as
            available&quot; basis. We do not guarantee uninterrupted
            availability, complete accuracy, or that the service will always be
            free from defects.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>10. Limitation of Liability</h2>
          <p style={paragraphStyle}>
            To the maximum extent allowed by law, Blackboard will not be liable
            for indirect, incidental, special, consequential, or punitive
            damages arising from use of or inability to use the service.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>11. Termination</h2>
          <p style={paragraphStyle}>
            We may suspend or terminate access if these terms are violated, if
            misuse is detected, or if needed to protect the service, users, or
            legal compliance.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>12. Changes to These Terms</h2>
          <p style={paragraphStyle}>
            We may update these Terms of Service from time to time. Updated
            terms become effective when posted unless stated otherwise.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>13. Contact</h2>
          <p style={paragraphStyle}>
            If you have questions about these Terms of Service, contact:
          </p>
          <p style={contactStyle}>
            Blackboard
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
