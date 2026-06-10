import nodemailer from "nodemailer";

const requiredSmtpEnv = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
] as const;

const parseBooleanEnv = (value: string) => value.trim().toLowerCase() === "true";

const getSmtpConfig = () => {
  const missingKeys = requiredSmtpEnv.filter((key) => !process.env[key]);

  if (missingKeys.length > 0) {
    throw new Error(`SMTP_NOT_CONFIGURED:${missingKeys.join(",")}`);
  }

  const port = Number(process.env.SMTP_PORT);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("SMTP_INVALID_PORT");
  }

  return {
    host: process.env.SMTP_HOST!.trim(),
    port,
    secure: parseBooleanEnv(process.env.SMTP_SECURE!),
    user: process.env.SMTP_USER!.trim(),
    pass: process.env.SMTP_PASS!.trim(),
    from: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER!.trim(),
  };
};

const getVerificationEmailHtml = (name: string, code: string) => `
  <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
    <h1 style="font-size: 22px; margin: 0 0 12px;">Verify your Blackboard account</h1>
    <p style="margin: 0 0 16px;">Hi ${name || "there"}, use this code to finish creating your account:</p>
    <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; padding: 14px 18px; background: #f3f4f6; border-radius: 12px; display: inline-block;">
      ${code}
    </div>
    <p style="margin: 18px 0 0; color: #6b7280; font-size: 14px;">
      This code expires in 10 minutes. If you did not request it, you can ignore this email.
    </p>
  </div>
`;

export const sendVerificationEmail = async ({
  to,
  name,
  code,
}: {
  to: string;
  name: string;
  code: string;
}) => {
  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  try {
    await transporter.sendMail({
      from: smtp.from,
      to,
      subject: "Your Blackboard verification code",
      text: `Your Blackboard verification code is ${code}. It expires in 10 minutes.`,
      html: getVerificationEmailHtml(name, code),
    });
  } catch (error) {
    const mailError = error as
      | (Error & {
          code?: string;
          response?: string;
          responseCode?: number;
          command?: string;
        })
      | undefined;

    if (
      mailError?.code === "EAUTH" ||
      mailError?.responseCode === 535 ||
      /auth|login/i.test(mailError?.response ?? "")
    ) {
      throw new Error("SMTP_AUTH_FAILED");
    }

    if (
      mailError?.code === "ESOCKET" ||
      mailError?.code === "ECONNECTION" ||
      mailError?.code === "ETIMEDOUT" ||
      /greeting|connect|timeout/i.test(mailError?.message ?? "")
    ) {
      throw new Error("SMTP_CONNECTION_FAILED");
    }

    if (
      mailError?.responseCode === 553 ||
      /from|sender/i.test(mailError?.response ?? "")
    ) {
      throw new Error("SMTP_FROM_REJECTED");
    }

    throw error;
  }
};
