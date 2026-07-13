import nodemailer from "nodemailer";

type BoardShareInviteEmailParams = {
  appOrigin: string;
  ownerEmail: string;
  recipientEmail: string;
  invitationToken: string;
  expiresAt: string;
};

type AccountDeletedEmailParams = {
  recipientEmail: string;
};

type SupportRequestEmailParams = {
  ticketNumber: string;
  requesterEmail: string;
  subject: string;
  category: string;
  message: string;
  accountId?: string;
};

type SubscriptionLifecycleEmailParams = {
  recipientEmail: string;
  subject: string;
  heading: string;
  message: string;
  details?: Array<{ label: string; value: string }>;
  eventId?: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;

type SenderKind = "accounts" | "billing" | "support";

const getRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`EMAIL_ENV_MISSING:${name}`);
  }

  return value;
};

const getTransporter = () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  const host = getRequiredEnv("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT ?? "465");
  const secure = (process.env.SMTP_SECURE ?? "true").toLowerCase() !== "false";
  const user = getRequiredEnv("SMTP_USER");
  const pass = getRequiredEnv("SMTP_PASS");

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 30_000,
  });

  return cachedTransporter;
};

const getSender = (kind: SenderKind) => {
  const variableName = {
    accounts: "SMTP_FROM_ACCOUNTS",
    billing: "SMTP_FROM_BILLING",
    support: "SMTP_FROM_SUPPORT",
  }[kind];

  const sender =
    process.env[variableName]?.trim() ||
    process.env.SMTP_FROM?.trim() ||
    process.env.SMTP_USER?.trim();

  if (!sender) throw new Error(`EMAIL_ENV_MISSING:${variableName}`);
  return sender;
};

const getSupportEmail = () =>
  process.env.SUPPORT_EMAIL?.trim() || "support@scribooapp.com";

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] ?? character
  );

export const sendSubscriptionLifecycleEmail = async ({
  recipientEmail,
  subject,
  heading,
  message,
  details = [],
  eventId,
}: SubscriptionLifecycleEmailParams) => {
  const transporter = getTransporter();
  const from = getSender("billing");
  const supportEmail = getSupportEmail();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") ||
    "https://scribooapp.com";

  const textDetails = details.map(({ label, value }) => `${label}: ${value}`);
  const htmlDetails = details
    .map(
      ({ label, value }) =>
        `<div style="padding: 5px 0;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`
    )
    .join("");

  await transporter.sendMail({
    from,
    to: recipientEmail,
    replyTo: supportEmail || undefined,
    subject,
    messageId: eventId ? `<${eventId}@scribooapp.com>` : undefined,
    text: [
      heading,
      "",
      message,
      ...(textDetails.length ? ["", ...textDetails] : []),
      "",
      `Manage your plan: ${appUrl}/?view=plan`,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        <div style="height: 6px; border-radius: 999px; background: linear-gradient(90deg, #7c3aed, #2563eb, #22a6a1); margin-bottom: 24px;"></div>
        <h2 style="margin: 0 0 12px;">${escapeHtml(heading)}</h2>
        <p style="margin: 0 0 18px; color: #475569;">${escapeHtml(message)}</p>
        ${
          htmlDetails
            ? `<div style="padding: 16px; border-radius: 12px; background: #f8fafc; margin-bottom: 20px;">${htmlDetails}</div>`
            : ""
        }
        <a href="${escapeHtml(appUrl)}/?view=plan" style="display: inline-block; padding: 11px 17px; border-radius: 10px; background: #7c3aed; color: #ffffff; text-decoration: none; font-weight: 700;">Manage your plan</a>
        <p style="margin-top: 22px; color: #94a3b8; font-size: 12px;">This is an automatic Scriboo billing message.</p>
      </div>`,
  });
};

export const sendSupportRequestEmails = async ({
  ticketNumber,
  requesterEmail,
  subject,
  category,
  message,
  accountId,
}: SupportRequestEmailParams) => {
  const transporter = getTransporter();
  const from = getSender("support");
  const supportEmail = getSupportEmail();


  const safeTicket = escapeHtml(ticketNumber);
  const safeEmail = escapeHtml(requesterEmail);
  const safeSubject = escapeHtml(subject);
  const safeCategory = escapeHtml(category);
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");
  const receivedAt = new Date().toISOString();

  // Send to support first. A confirmation must never claim receipt if the
  // actual request could not be delivered to the support inbox.
  await transporter.sendMail({
    from,
    to: supportEmail,
    replyTo: requesterEmail,
    subject: `[${ticketNumber}] ${category}: ${subject}`,
    text: [
      `Ticket: ${ticketNumber}`,
      `Category: ${category}`,
      `From: ${requesterEmail}`,
      `Received at: ${receivedAt}`,
      accountId ? `Account ID: ${accountId}` : "Account: not signed in",
      "",
      subject,
      "",
      message,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h2 style="margin: 0 0 16px;">New support request ${safeTicket}</h2>
        <p><strong>Category:</strong> ${safeCategory}<br /><strong>From:</strong> ${safeEmail}<br /><strong>Received at:</strong> ${escapeHtml(receivedAt)}<br /><strong>Account ID:</strong> ${escapeHtml(accountId || "not signed in")}</p>
        <h3 style="margin-bottom: 8px;">${safeSubject}</h3>
        <div style="padding: 16px; border-radius: 10px; background: #f8fafc;">${safeMessage}</div>
      </div>`,
  });

  await transporter.sendMail({
    from,
    to: requesterEmail,
    replyTo: supportEmail,
    subject: `We received your request — ${ticketNumber}`,
    text: [
      "We received your support request.",
      "",
      `Reference number: ${ticketNumber}`,
      `Category: ${category}`,
      `Subject: ${subject}`,
      `Received at: ${receivedAt}`,
      "",
      "Keep this reference number if you contact us again about this request.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h2 style="margin: 0 0 12px;">We received your request</h2>
        <p style="margin: 0 0 16px;">Our support team will review it.</p>
        <div style="padding: 16px; border-radius: 10px; background: #f5f3ff;">
          <strong>Reference number:</strong> ${safeTicket}<br />
          <strong>Category:</strong> ${safeCategory}<br />
          <strong>Subject:</strong> ${safeSubject}
          <br /><strong>Received at:</strong> ${escapeHtml(receivedAt)}
        </div>
        <p style="margin-top: 16px; color: #475569;">Keep this reference number if you contact us again about this request.</p>
      </div>`,
  });
};

export const sendBoardShareInviteEmail = async ({
  appOrigin,
  ownerEmail,
  recipientEmail,
  invitationToken,
  expiresAt,
}: BoardShareInviteEmailParams) => {
  const transporter = getTransporter();
  const from = getSender("accounts");
  const supportEmail = getSupportEmail();

  const invitationUrl = `${appOrigin}/share/accept?token=${encodeURIComponent(invitationToken)}`;
  const registerUrl = `${appOrigin}/register`;

  await transporter.sendMail({
    from,
    to: recipientEmail,
    replyTo: supportEmail,
    subject: `${ownerEmail} shared a board with you`,
    text: [
      `Hi,`,
      ``,
      `${ownerEmail} shared a board with you in Scriboo.`,
      ``,
      `Accept this invitation within 7 days: ${invitationUrl}`,
      `If you do not have an account yet, register here first: ${registerUrl}`,
      ``,
      `Important: use the same email address this invite was sent to.`,
      `This invitation expires on ${expiresAt}.`,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h2 style="margin: 0 0 16px;">A board was shared with you</h2>
        <p style="margin: 0 0 12px;"><strong>${escapeHtml(ownerEmail)}</strong> shared a board with you in Scriboo.</p>
        <p style="margin: 0 0 12px;">Accept within 7 days using <strong>${escapeHtml(recipientEmail)}</strong>.</p>
        <p style="margin: 0 0 16px;">
          <a href="${invitationUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700;">Review invitation</a>
        </p>
        <p style="margin: 0 0 12px;">No account yet? Register first:</p>
        <p style="margin: 0 0 16px;">
          <a href="${registerUrl}" style="color: #2563eb;">${registerUrl}</a>
        </p>
        <p style="margin: 0; color: #475569;">Important: use the same email address this invite was sent to.</p>
        <p style="margin: 8px 0 0; color: #475569;">This invitation expires on ${escapeHtml(expiresAt)}.</p>
      </div>
    `,
  });
};

export const sendAccountDeletedEmail = async ({
  recipientEmail,
}: AccountDeletedEmailParams) => {
  const transporter = getTransporter();
  const from = getSender("accounts");
  const supportEmail = getSupportEmail();

  await transporter.sendMail({
    from,
    to: recipientEmail,
    replyTo: supportEmail,
    subject: "Your Scriboo account has been deleted",
    text: [
      "Your Scriboo account has been permanently deleted.",
      "",
      "Your boards, calendar entries, sharing records, profile, and sign-in access were removed. Any active subscription was cancelled. Billing records that must be retained for accounting or legal compliance may remain with our payment provider.",
      "",
      "If you did not request this deletion, contact support immediately.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h2 style="margin: 0 0 16px;">Your account has been deleted</h2>
        <p style="margin: 0 0 12px;">Your Scriboo account has been permanently deleted.</p>
        <p style="margin: 0 0 12px;">Your boards, calendar entries, sharing records, profile, and sign-in access were removed. Any active subscription was cancelled.</p>
        <p style="margin: 0 0 12px; color: #475569;">Billing records that must be retained for accounting or legal compliance may remain with our payment provider.</p>
        <p style="margin: 0;">If you did not request this deletion, contact support immediately.</p>
      </div>
    `,
  });
};
