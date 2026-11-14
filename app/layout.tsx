import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DIPO CRM — Mitsubishi DIPO Lead & CAPI Hub",
  description: "Mini inbox WhatsApp untuk tim CS dengan atribusi Click-to-WhatsApp dan Meta Conversions API.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
