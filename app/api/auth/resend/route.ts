import { NextResponse } from "next/server";
import { sendVerificationEmail } from "@/lib/email";
import {
  canSendVerificationCode,
  createVerificationCode,
  findUserByEmail,
  normalizeEmail,
  setVerificationCode,
} from "@/lib/auth-store";

export const runtime = "nodejs";

const getEmailConfigurationError = (error: unknown) => {
  if (!(error instanceof Error)) return null;

  if (error.message.startsWith("SMTP_NOT_CONFIGURED:")) {
    const missingKeys = error.message.split(":")[1];
    return `Email sending is not configured. Missing: ${missingKeys}.`;
  }

  if (error.message === "SMTP_INVALID_PORT") {
    return "SMTP_PORT must be a valid number.";
  }

  if (error.message === "SMTP_AUTH_FAILED") {
    return "SMTP login failed. For Gmail, set SMTP_USER to the same Gmail address that owns the app password, use that app password in SMTP_PASS, and restart the dev server.";
  }

  if (error.message === "SMTP_CONNECTION_FAILED") {
    return "Could not connect to the SMTP server. Check SMTP_HOST, SMTP_PORT, SMTP_SECURE, and whether your network or provider is blocking SMTP.";
  }

  if (error.message === "SMTP_FROM_REJECTED") {
    return "The SMTP server rejected the sender address. Set SMTP_FROM to the same address as SMTP_USER, or leave SMTP_FROM empty so it falls back to SMTP_USER.";
  }

  return null;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        email?: string;
      }
    | null;
  const email = normalizeEmail(body?.email ?? "");

  if (!email) {
    return NextResponse.json(
      { error: "Enter the email you registered with." },
      { status: 400 }
    );
  }

  const { data, user } = await findUserByEmail(email);

  if (!user) {
    return NextResponse.json(
      { error: "No account was found for this email." },
      { status: 404 }
    );
  }

  if (user.emailVerified) {
    return NextResponse.json(
      { error: "This account is already verified. You can log in." },
      { status: 409 }
    );
  }

  const cooldown = canSendVerificationCode(user);
  if (!cooldown.allowed) {
    return NextResponse.json(
      {
        error: `Please wait ${cooldown.retryAfter} seconds before requesting another code.`,
        retryAfter: cooldown.retryAfter,
      },
      { status: 429 }
    );
  }

  const verificationCode = createVerificationCode();

  try {
    await sendVerificationEmail({
      to: user.email,
      name: user.name,
      code: verificationCode,
    });
    await setVerificationCode(data, user, verificationCode);
  } catch (error) {
    const configurationError = getEmailConfigurationError(error);
    if (configurationError) {
      return NextResponse.json({ error: configurationError }, { status: 500 });
    }

    return NextResponse.json(
      {
        error:
          "Could not send the email with the current SMTP settings. Check SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, and SMTP_FROM.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    email,
    message: "A new verification code was sent. Check your email.",
  });
}
