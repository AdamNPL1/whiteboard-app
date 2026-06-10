This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Account verification email with SMTP

The custom board has a server-side registration flow with email verification codes. User accounts and sessions are stored locally in `.data/auth.json` during development, and `.data/` is ignored by git.

Verification email is sent with plain SMTP through Nodemailer. No Resend, SendGrid, Mailgun, Brevo, or other email API provider is used.

Create `.env.local` in the project root and add:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=
```

For Gmail, `SMTP_PASS` must be a Google app password, not your normal Google account password. `SMTP_USER` must be the same Gmail address that owns that app password. `SMTP_FROM` is optional and should usually match `SMTP_USER`. After changing `.env.local`, restart `npm run dev` so Next.js loads the new environment variables.

Verification codes expire after 10 minutes, are stored only as bcrypt hashes, and can be resent at most once every 60 seconds.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
