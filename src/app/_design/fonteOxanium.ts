import { Oxanium } from "next/font/google";

/**
 * Oxanium: a fonte de títulos da Forja de Refratário, vinda do design do
 * Figma. Também dá corpo aos números e rótulos de leitura do Console
 * (nome, RPI, atributos, Integridade, Sobrecarga, PA e Reações), que
 * seguem a identidade da Forja. Fora do layout raiz porque só essas
 * telas a usam; corpo e mono continuam os do app (Rajdhani, JetBrains
 * Mono).
 *
 * Exposta como `--font-oxanium`. A classe vai na raiz de cada tela que a
 * usa e em cada portal dela, que nascem fora da raiz.
 */
export const oxanium = Oxanium({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-oxanium",
  display: "swap",
});
