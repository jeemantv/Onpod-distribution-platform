import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Page-specific titles override; tab always ends with " · OnPod".
  title: { default: "OnPod", template: "%s · OnPod" },
  description:
    "OnPod Studios post-production and publishing workflow for podcast creators.",
  // Next auto-discovers icon.svg + apple-icon.svg in the app/ directory
  // (see src/app/icon.svg). manifest + theme color round out the
  // browser-tab + PWA experience.
  themeColor: "#0a0a0b",
  manifest: "/manifest.webmanifest",
  openGraph: {
    title: "OnPod",
    description:
      "OnPod Studios post-production and publishing workflow for podcast creators.",
    url: "https://onpod.vercel.app",
    siteName: "OnPod",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "OnPod",
    description:
      "OnPod Studios post-production and publishing workflow for podcast creators.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
