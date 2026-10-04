import { Oxanium } from "next/font/google";

/**
 * Oxanium: a fonte de títulos vinda do design da Forja de Refratário. Usada
 * pela Forja, pela marca RUPTURA (`Marca.tsx`) e pelas leituras do Console
 * (nome, RPI, atributos, Integridade, Sobrecarga, PA e Reações); fica fora
 * do layout raiz para só baixar nas telas que a usam. Corpo e mono
 * continuam os do app.
 *
 * Exposta como `--font-oxanium`. A classe vai na raiz de quem a usa e em
 * cada portal que nasce fora dessa raiz (Códex, mapa grande).
 */
export const oxanium = Oxanium({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-oxanium",
  display: "swap",
});
