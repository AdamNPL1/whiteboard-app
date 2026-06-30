import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Blackboard",
  description: "Workspace boards, planning, and scheduling in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
