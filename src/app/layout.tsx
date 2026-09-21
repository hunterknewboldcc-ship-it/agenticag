import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgenticAG",
  description: "Chat with Grok using voice mode and read aloud.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
