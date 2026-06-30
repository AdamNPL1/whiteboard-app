import nodemailer from "nodemailer";

type BoardShareInviteEmailParams = {
  appOrigin: string;
  ownerEmail: string;
  recipientEmail: string;
};

let cachedTransporter: nodemailer.Transporter | null = null;

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
  });

  return cachedTransporter;
};

export const sendBoardShareInviteEmail = async ({
  appOrigin,
  ownerEmail,
  recipientEmail,
}: BoardShareInviteEmailParams) => {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();

  if (!from) {
    throw new Error("EMAIL_ENV_MISSING:SMTP_FROM");
  }

  const signInUrl = `${appOrigin}/custom`;
  const registerUrl = `${appOrigin}/register`;

  await transporter.sendMail({
    from,
    to: recipientEmail,
    subject: `${ownerEmail} shared a board with you`,
    text: [
      `Hi,`,
      ``,
      `${ownerEmail} shared a board with you in dontknowyet.`,
      ``,
      `Sign in with ${recipientEmail} to open it: ${signInUrl}`,
      `If you do not have an account yet, register here first: ${registerUrl}`,
      ``,
      `Important: use the same email address this invite was sent to.`,
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
        <h2 style="margin: 0 0 16px;">A board was shared with you</h2>
        <p style="margin: 0 0 12px;"><strong>${ownerEmail}</strong> shared a board with you in dontknowyet.</p>
        <p style="margin: 0 0 12px;">Sign in with <strong>${recipientEmail}</strong> to open it.</p>
        <p style="margin: 0 0 16px;">
          <a href="${signInUrl}" style="display: inline-block; padding: 12px 18px; border-radius: 10px; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: 700;">Open app</a>
        </p>
        <p style="margin: 0 0 12px;">No account yet? Register first:</p>
        <p style="margin: 0 0 16px;">
          <a href="${registerUrl}" style="color: #2563eb;">${registerUrl}</a>
        </p>
        <p style="margin: 0; color: #475569;">Important: use the same email address this invite was sent to.</p>
      </div>
    `,
  });
};
