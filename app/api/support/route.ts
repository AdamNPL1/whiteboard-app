import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";

import { sendSupportRequestEmails } from "@/lib/email";
import { createSupabaseServerAuthClient } from "@/lib/supabase-server";
import { enforceRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { reportOperationalError } from "@/lib/monitoring";

export const runtime = "nodejs";

const categories = new Set([
  "Billing",
  "Login",
  "Lost data",
  "Cancellation",
  "Withdrawal / refund",
  "Complaint",
  "Privacy",
  "Other",
]);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const data = body as Record<string, unknown>;
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const subject = typeof data.subject === "string" ? data.subject.trim() : "";
  const category = typeof data.category === "string" ? data.category.trim() : "";
  const message = typeof data.message === "string" ? data.message.trim() : "";
  const website = typeof data.website === "string" ? data.website.trim() : "";

  // Hidden honeypot field: silently accept bot submissions without emailing.
  if (website) return NextResponse.json({ ok: true });

  const rateLimit = await enforceRateLimit(request, {
    action: "support-request",
    limit: 5,
    windowSeconds: 60 * 60,
    identifiers: [email],
  });
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  if (!emailPattern.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (subject.length < 3 || subject.length > 140) {
    return NextResponse.json({ error: "Subject must be between 3 and 140 characters." }, { status: 400 });
  }
  if (!categories.has(category)) {
    return NextResponse.json({ error: "Choose a valid category." }, { status: 400 });
  }
  if (message.length < 10 || message.length > 5000) {
    return NextResponse.json({ error: "Message must be between 10 and 5,000 characters." }, { status: 400 });
  }

  const supabase = createSupabaseServerAuthClient({ getAll: () => request.cookies.getAll() });
  const { data: { user } } = await supabase.auth.getUser();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const ticketNumber = `SUP-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;

  try {
    await sendSupportRequestEmails({
      ticketNumber,
      requesterEmail: email,
      subject,
      category,
      message,
      accountId: user?.id,
    });
  } catch (error) {
    console.error("Support request email failed", error);
    reportOperationalError(error, { area: "email", operation: "support-request" });
    return NextResponse.json(
      { error: "We could not send your request right now. Please try again shortly." },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, ticketNumber });
}
