import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Bennoo", template: "%s · Bennoo" },
  description: "Une cérémonie, toute la famille, un seul endroit.",
  applicationName: "Bennoo",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4b2a8c",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh antialiased">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2"
        >
          Aller au contenu
        </a>
        {children}
      </body>
    </html>
  );
}
