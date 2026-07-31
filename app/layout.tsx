import type { Metadata } from "next";
import { Instrument_Serif, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Three type roles, exposed as CSS variables that globals.css maps onto the
// --f-display / --f-body / --f-mono design tokens.
const display = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = IBM_Plex_Sans({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const SITE_URL = "https://buyback-agent.vercel.app";
const DESCRIPTION =
  "Score a week of work into DRIP quadrants, find where your hours leak, and name your first hire. Independent demo.";

// metadataBase makes the file-convention images (app/opengraph-image.png,
// app/icon.svg) resolve to absolute URLs. Without it Next emits relative ones,
// which crawlers and link unfurlers cannot fetch.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Buyback Agent",
  description: DESCRIPTION,
  applicationName: "Buyback Agent",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Buyback Agent",
    title: "Buyback Agent",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Buyback Agent",
    description: DESCRIPTION,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        {/* Applies a stored theme override before first paint. Without this the
            page paints the OS theme and then snaps to the stored one — a visible
            flash on every navigation. It runs synchronously and ahead of
            hydration, which is why <html> carries suppressHydrationWarning. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('buyback:theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t)}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
