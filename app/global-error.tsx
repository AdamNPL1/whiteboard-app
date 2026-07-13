"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html><body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "Arial,sans-serif", background: "#f8fafc", color: "#0f172a" }}><main style={{ maxWidth: 520, padding: 32, textAlign: "center" }}><h1>Something went wrong</h1><p style={{ color: "#64748b", lineHeight: 1.6 }}>Scriboo could not complete this action. The technical error has been recorded without sending your board contents.</p><button onClick={reset} style={{ border: 0, borderRadius: 10, padding: "12px 18px", background: "#7c3aed", color: "white", fontWeight: 700 }}>Try again</button></main></body></html>
  );
}
