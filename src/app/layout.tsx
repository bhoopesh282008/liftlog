import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { STARTUP_SCREENS, startupMedia, startupPixels } from "@/lib/startup-screens";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// Athletic condensed display face for titles and the big numbers.
const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LiftLog",
  description: "Track your lifts and food, and see if you're building muscle while staying lean.",
  applicationName: "LiftLog",
  appleWebApp: {
    capable: true,
    title: "LiftLog",
    // "default" tints the status bar from theme-color (per light/dark). The
    // translucent style forces white text, unreadable on the light theme.
    statusBarStyle: "default",
    startupImage: STARTUP_SCREENS.map((s) => ({ url: `/startup/${startupPixels(s)}`, media: startupMedia(s) })),
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0b0c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${barlowCondensed.variable} antialiased`}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
