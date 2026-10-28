import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { PublicChrome } from "@/components/SiteChrome";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "Kverse · Stories that stay",
    template: "%s · Kverse",
  },
  description:
    "A cozy corner to discover Korean dramas and movies, save the stories you love, and find your next favorite.",
  openGraph: {
    type: "website",
    siteName: "Kverse",
    title: "Kverse · Stories that stay",
    description: "A cozy corner for stories that stay.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#08080D",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <PublicChrome>{children}</PublicChrome>

        {/* Monetag In-Page Push Banner Script */}
        <Script
          src="https://nap5k.com/tag.min.js"
          data-zone="12139234"
          strategy="lazyOnload"
        />
      </body>
    </html>
  );
}
