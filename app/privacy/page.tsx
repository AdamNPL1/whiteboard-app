import Link from "next/link";
import type { CSSProperties } from "react";

const contactEmail = "nowakowskia43@gmail.com";
const effectiveDate = "July 2, 2026";

export default function PrivacyPolicyPage() {
  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={heroStyle}>
          <p style={eyebrowStyle}>Legal</p>
          <h1 style={titleStyle}>Privacy Policy</h1>
          <p style={subtitleStyle}>
            This Privacy Policy explains how Blackboard collects, uses, and
            protects personal information when people use the app.
          </p>
          <p style={metaStyle}>Effective date: {effectiveDate}</p>
        </div>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>1. Information We Collect</h2>
          <p style={paragraphStyle}>
            We may collect information you provide directly, including your
            name, email address, login details, billing details, and any
            content you create or store inside the app such as boards,
            schedules, and workspace data.
          </p>
          <p style={paragraphStyle}>
            We may also collect technical information such as browser type,
            device information, IP address, and basic usage data needed to run,
            secure, and improve the service.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>2. How We Use Information</h2>
          <p style={paragraphStyle}>We use information to:</p>
          <ul style={listStyle}>
            <li>create and manage accounts</li>
            <li>provide the whiteboard, planning, and collaboration features</li>
            <li>process subscriptions and billing</li>
            <li>send service-related emails such as account confirmations and password resets</li>
            <li>maintain security, detect misuse, and improve the app</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>3. Payments and Billing</h2>
          <p style={paragraphStyle}>
            Payments are processed by Stripe. We do not store full payment card
            numbers on our own servers. Billing-related information may be
            shared with Stripe to create, manage, renew, or cancel
            subscriptions.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>4. Authentication and Data Storage</h2>
          <p style={paragraphStyle}>
            Account authentication and app data storage may be handled using
            third-party infrastructure providers, including Supabase, to store
            account records, workspace data, and access credentials securely.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>5. Sharing of Information</h2>
          <p style={paragraphStyle}>
            We do not sell personal information. We may share information only
            when needed to operate the service, process payments, comply with
            law, enforce our terms, or protect the rights, safety, and security
            of users and the service.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>6. Data Retention</h2>
          <p style={paragraphStyle}>
            We keep personal information for as long as needed to provide the
            service, maintain legitimate business records, resolve disputes,
            enforce agreements, and comply with legal obligations.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>7. Security</h2>
          <p style={paragraphStyle}>
            We use reasonable technical and organizational measures to protect
            personal information. However, no internet-based service can be
            guaranteed to be completely secure.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>8. Your Rights</h2>
          <p style={paragraphStyle}>
            Depending on where you live, you may have rights to access, correct,
            delete, or restrict the use of your personal information. To make a
            request, contact us at <a href={`mailto:${contactEmail}`} style={linkStyle}>{contactEmail}</a>.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>9. Children&apos;s Privacy</h2>
          <p style={paragraphStyle}>
            The service is not intended for children under 13, and we do not
            knowingly collect personal information from children under 13.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>10. Changes to This Policy</h2>
          <p style={paragraphStyle}>
            We may update this Privacy Policy from time to time. When we do, we
            will post the updated version on this page and revise the effective
            date above.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={headingStyle}>11. Contact</h2>
          <p style={paragraphStyle}>
            If you have questions about this Privacy Policy, contact:
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
