import type { Metadata, Viewport } from "next";
import { Newsreader, Schibsted_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// Self-hosted at build by next/font (SIL OFL). Words on the board use the serif.
const serif = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
  variable: "--font-serif",
  display: "swap",
});
const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-sans",
  display: "swap",
});

const origin = new URL("https://liminal.mistystep.io");
const title = "Liminal | A daily intersection puzzle";
const description =
  "Three circles, four places where they overlap. Fill them all. One puzzle a day.";

export const metadata: Metadata = {
  metadataBase: origin,
  title,
  description,
  applicationName: "Liminal",
  alternates: { canonical: "/" },
  icons: {
    icon: [
      { url: "/brand/liminal-mark-16.svg", type: "image/svg+xml", sizes: "16x16" },
      { url: "/brand/liminal-mark-32.svg", type: "image/svg+xml", sizes: "32x32" },
      { url: "/brand/liminal-mark.svg", type: "image/svg+xml", sizes: "256x256" },
    ],
    shortcut: "/brand/liminal-mark-32.svg",
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Liminal",
    title,
    description,
    images: [
      {
        url: "/brand/liminal-share.png",
        width: 1200,
        height: 630,
        alt: "Three overlapping colored circles with a filled center beside Liminal and Fill the in-between.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/brand/liminal-share.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#fafaf8",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable}`}>
      <body>
        <a className="skip-link" href="#game">
          Skip to the puzzle
        </a>
        {children}
      </body>
    </html>
  );
}
