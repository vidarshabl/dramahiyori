import type { Metadata, Viewport } from "next";
import { PublicChrome } from "@/components/SiteChrome";
import { getSiteUrl } from "@/lib/site-url";
import { dmSans, parisienne, playfairDisplay } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "DearDrama · Stories that stay",
    template: "%s · DearDrama",
  },
  description:
    "A cozy corner to discover Korean dramas and movies, save the stories you love, and find your next favorite.",
  openGraph: {
    type: "website",
    siteName: "DearDrama",
    title: "DearDrama · Stories that stay",
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
    <html lang="en" className={`${dmSans.variable} ${playfairDisplay.variable} ${parisienne.variable}`}>
      <body>
        <PublicChrome>{children}</PublicChrome>
      </body>
    </html>
  );
}
