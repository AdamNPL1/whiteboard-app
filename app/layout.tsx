import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { CallProvider } from "@/app/components/CallProvider";
import RealtimeDiagnostics from "@/app/components/RealtimeDiagnostics";
import { LanguageProvider } from "@/lib/i18n";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://scribooapp.com"),
  title: {
    default: "Scriboo",
    template: "%s | Scriboo",
  },
  description:
    "A visual workspace for creating boards, organizing ideas, and planning work.",
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: {
      url: "/favicon-rounded-48.png",
      type: "image/png",
      sizes: "48x48",
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <LanguageProvider>
          <CallProvider>{children}</CallProvider>
          <RealtimeDiagnostics />
        </LanguageProvider>
      </body>
    </html>
  );
}
