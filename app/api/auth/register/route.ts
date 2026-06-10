import { NextResponse } from "next/server";
import { sendVerificationEmail } from "@/lib/email";
import {
  createPendingUser,
  createVerificationCode,
  findUserByEmail,
  normalizeEmail,
  updatePendingUserRegistration,
} from "@/lib/auth-store";

export const runtime = "nodejs";

const isValidEmail = (email: string) => /^\S+@\S+\.\S+$/.test(email);

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
        name?: string;
        email?: string;
        password?: string;
        confirmPassword?: string;
      }
    | null;
  const name = (body?.name ?? "").trim();
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";
  const confirmPassword = body?.confirmPassword ?? "";

  if (name.length < 2) {
    return NextResponse.json(
      { error: "Enter your name." },
      { status: 400 }
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: "Passwords must match." },
      { status: 400 }
    );
  }

  const verificationCode = createVerificationCode();

  try {
    const { data, user: existingUser } = await findUserByEmail(email);
    if (existingUser?.emailVerified) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    await sendVerificationEmail({
      to: email,
      name,
      code: verificationCode,
    });

    if (existingUser) {
      await updatePendingUserRegistration(
        data,
        existingUser,
        name,
        password,
        verificationCode
      );
    } else {
      await createPendingUser(name, email, password, verificationCode);
    }

    return NextResponse.json({
      ok: true,
      email,
      message: existingUser
        ? "A new verification code was sent. Check your email."
        : "Verification code sent. Check your email.",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ACCOUNT_EXISTS") {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const configurationError = getEmailConfigurationError(error);
    if (configurationError) {
      return NextResponse.json({ error: configurationError }, { status: 500 });
    }

    return NextResponse.json(
      {
        error:
          "Could not send the verification email with the current SMTP settings. Check SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, and SMTP_FROM.",
      },
      { status: 500 }
    );
  }
}
