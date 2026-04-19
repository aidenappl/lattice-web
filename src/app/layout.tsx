import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import StoreProvider from "@/store/StoreProvider";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
  const appearance = cookieStore.get("forta-appearance")?.value;
  const isDark = appearance === "dark" || (!appearance && true); // default to dark
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} antialiased${isDark ? " dark" : ""}`}
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
