import type { MetadataRoute } from "next";

/** Nome e ícones usados quando o sistema é adicionado à tela inicial do celular. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ficonpa",
    short_name: "ficonpa",
    description: "Boletos do e-mail direto para o Conta Azul.",
    lang: "pt-BR",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f4f5",
    theme_color: "#f4f4f5",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
