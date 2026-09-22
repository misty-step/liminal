import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const origin = new URL("https://liminal.mistystep.io");
const title = "Liminal | A daily intersection puzzle";
const description = "Find what belongs inside every condition. One drawer a day, five guesses.";

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
    apple: [{ url: "/brand/liminal-mark.svg", type: "image/svg+xml", sizes: "256x256" }],
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Liminal",
    title,
    description,
    images: [
      {
        url: "/brand/liminal-share.svg",
        width: 1200,
        height: 630,
        alt: "A brass keyhole on Liminal's ink cabinet face",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/brand/liminal-share.svg"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#101419",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#game">
          Skip to the puzzle
        </a>
        {children}
      </body>
    </html>
  );
}
