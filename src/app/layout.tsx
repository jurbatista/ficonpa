import Providers from "@/app/providers";
import { appUrl } from "@/lib/env";
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

// O endereço público só é conhecido com o servidor rodando (APP_URL), e a imagem de
// compartilhamento precisa de um endereço completo: por isso nada aqui é pré-gerado.
export const dynamic = "force-dynamic";

const DESCRIPTION = "Boletos do e-mail direto para o Conta Azul.";

export function generateMetadata(): Metadata {
  return {
    metadataBase: new URL(appUrl()),
    title: {
      template: "%s · ficonpa",
      default: "ficonpa",
    },
    description: DESCRIPTION,
    applicationName: "ficonpa",
    // Sistema interno: não deve aparecer em buscadores.
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      siteName: "ficonpa",
      title: "ficonpa",
      description: DESCRIPTION,
      locale: "pt_BR",
      url: "/",
    },
  };
}

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
