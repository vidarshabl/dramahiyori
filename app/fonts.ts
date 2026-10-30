import { DM_Sans, Noto_Sans_Sinhala, Parisienne, Playfair_Display } from "next/font/google";

export const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

export const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-playfair",
  weight: ["500", "600", "700"],
});

export const parisienne = Parisienne({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-parisienne",
  weight: "400",
});

export const notoSansSinhala = Noto_Sans_Sinhala({
  subsets: ["sinhala"],
  display: "swap",
  preload: false,
  variable: "--font-noto-sans-sinhala",
  weight: "400",
});
