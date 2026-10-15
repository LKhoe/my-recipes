import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { ViewTransitionsProvider } from "@/components/ViewTransitions";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Minhas Receitas",
  description: "Uma coleção de receitas privada para a família.",
};

// viewport-fit=cover makes env(safe-area-inset-bottom) non-zero on iPhones, so the mobile tab bar
// clears the home indicator.
export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${fraunces.variable} ${inter.variable} antialiased`}>
        <ViewTransitionsProvider>
          {children}
          {/* Clear the mobile tab bar (components/AppNav.tsx) */}
          <Toaster mobileOffset={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }} />
        </ViewTransitionsProvider>
      </body>
    </html>
  );
}
