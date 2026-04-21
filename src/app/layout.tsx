import type { Metadata, Viewport } from "next";
import { Inter_Tight, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import StoreProvider from "@/store/StoreProvider";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ThemeProvider } from "@/components/ThemeProvider";

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: {
    default: "Lattice",
    template: "Lattice - %s",
  },
  description: "Docker container orchestration management",
  applicationName: "Lattice",
  authors: [{ name: "Lattice" }],
  icons: {
    icon: [
      { url: "/favicon/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      { url: "/favicon/favicon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon/favicon.ico",
    apple: { url: "/favicon/apple-touch-icon.png", sizes: "180x180" },
  },
  manifest: "/favicon/site.webmanifest",
  appleWebApp: {
    title: "Lattice",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const appearance = cookieStore.get("lattice-appearance")?.value;
  // Default to dark. "system" defaults dark server-side; client ThemeProvider resolves it.
  const isDark = appearance !== "light";
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${jetbrainsMono.variable} antialiased${isDark ? " dark" : ""}`}
      suppressHydrationWarning
    >
      <body>
        <StoreProvider>
          <ThemeProvider>
            <DashboardLayout>{children}</DashboardLayout>
          </ThemeProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
