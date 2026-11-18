import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "@fontsource/noto-sans-bengali/bengali-400.css";
import "@fontsource/noto-sans-bengali/bengali-500.css";
import "@fontsource/noto-sans-bengali/bengali-600.css";
import "@fontsource/noto-sans-bengali/bengali-700.css";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { withBase } from "@/lib/base-path";

export const metadata: Metadata = {
  title: "Smart Rx — Digital Prescription Management System",
  description:
    "Smart Digital Prescription Management System for doctors — click-to-select prescribing, 21,000+ medicine database, live A4 preview, print & PDF.",
  keywords: ["prescription", "digital prescription", "medicine", "doctor", "clinic", "Bengali"],
  authors: [{ name: "Smart Rx" }],
  icons: {
    icon: withBase("/logo.svg"),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d9488",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="bottom-right" offset={20} richColors closeButton />
      </body>
    </html>
  );
}
