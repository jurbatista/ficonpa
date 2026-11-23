import Providers from "@/app/providers";
import { cn } from "@/utils/cn";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const geistInter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    template: "%s · ficonpa",
    default: "ficonpa",
  },
  description: "Boletos do e-mail direto para o Conta Azul.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      suppressHydrationWarning
      lang="pt-BR"
      className={cn("h-full overflow-hidden antialiased", geistInter.className)}
    >
      <body className="h-full overflow-hidden bg-background-gray-secondary_alt_2">
        <ThemeProvider attribute={["class", "data-theme"]} defaultTheme="light" enableSystem={false}>
          <Providers>{children}</Providers>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
