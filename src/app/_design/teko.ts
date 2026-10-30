import { Teko } from "next/font/google";

/**
 * Teko: a fonte de destaque da área autenticada V1 (nomes de campanha,
 * abas, números grandes). Como a Oxanium, fica fora do layout raiz e só
 * baixa nas telas que a usam; a classe vai na raiz da casca global e em
 * cada portal que nasce fora dela (modal de perfil).
 *
 * Exposta como `--font-teko`.
 */
export const teko = Teko({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-teko",
  display: "swap",
});
