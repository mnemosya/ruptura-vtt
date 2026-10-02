import { Oxanium } from "next/font/google";

/**
 * Oxanium: a fonte de títulos da Forja de Refratário, vinda do design do
 * Figma. Fica só aqui (e não no layout raiz) porque é a única tela que a
 * usa; corpo e mono continuam os do app (Rajdhani, JetBrains Mono).
 *
 * Exposta como `--font-oxanium`. A classe vai na raiz da Forja e em cada
 * portal dela (Códex, mapa grande), que nascem fora da raiz.
 */
export const oxanium = Oxanium({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-oxanium",
  display: "swap",
});
