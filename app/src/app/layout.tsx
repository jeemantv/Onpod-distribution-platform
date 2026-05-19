import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OnPod — Content Distribution Platform",
  description:
    "OnPod Studios post-production and publishing workflow for podcast creators.",
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
