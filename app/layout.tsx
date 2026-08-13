import type { Metadata } from "next";
import { CallProvider } from "@/app/components/CallProvider";
import { LanguageProvider } from "@/lib/i18n";
import "./globals.css";

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
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <LanguageProvider>
          <CallProvider>{children}</CallProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
