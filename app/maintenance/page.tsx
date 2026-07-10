import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Scriboo is coming soon",
  description: "Scriboo is temporarily closed while we prepare the launch.",
};

export default function MaintenancePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 20px",
        background:
          "radial-gradient(circle at 20% 10%, rgba(124,58,237,0.22), transparent 28%), linear-gradient(135deg, #101827 0%, #172554 46%, #0f766e 100%)",
        color: "#f8fafc",
      }}
    >
      <section
        style={{
          width: "min(100%, 620px)",
          textAlign: "center",
          display: "grid",
          gap: "20px",
        }}
      >
        <div
          style={{
            justifySelf: "center",
            padding: "8px 14px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.28)",
            background: "rgba(255,255,255,0.1)",
            fontSize: "13px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Temporarily closed
        </div>

        <div style={{ display: "grid", gap: "12px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "clamp(40px, 8vw, 84px)",
              lineHeight: 0.95,
              fontWeight: 900,
              letterSpacing: "0",
            }}
          >
            Scriboo is getting polished.
          </h1>
          <p
            style={{
              margin: "0 auto",
              maxWidth: "520px",
              color: "rgba(248,250,252,0.82)",
              fontSize: "18px",
              lineHeight: 1.6,
              fontWeight: 700,
            }}
          >
            We are preparing the product before opening it to new users. The
            workspace will be back online soon.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "16px",
            flexWrap: "wrap",
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          <Link style={{ color: "#f8fafc" }} href="/privacy">
            Privacy Policy
          </Link>
          <Link style={{ color: "#f8fafc" }} href="/terms">
            Terms
          </Link>
        </div>
      </section>
    </main>
  );
}
