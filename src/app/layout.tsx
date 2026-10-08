import type { Metadata } from "next";
import { Chakra_Petch, Exo_2, Orbitron, JetBrains_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

/**
 * Tipografia da identidade Ruptura (Orbitron / Exo 2 / JetBrains Mono).
 * Servidas por `next/font` (auto-hospedadas, sem requisição externa em
 * runtime) e expostas como variáveis CSS — as folhas de estilo em
 * `src/app/_design/*.css` referenciam `var(--font-orbitron)` etc.
 *
 * Ficam no layout raiz porque tanto a tela de autenticação quanto a área
 * autenticada global as usam; as páginas de /dev e /admin continuam com
 * a fonte de sistema (não referenciam essas variáveis).
 */
const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  variable: "--font-orbitron",
  display: "swap",
});

/**
 * Corpo de texto do VTT inteiro (`--font-corpo`). Era Rajdhani: estreita e
 * quadrada, cansava na leitura longa. A Forja e o Códex trocaram primeiro
 * (03/10/2026); o resto da mesa, o Console e a área global seguiram em
 * 05/10/2026, e a Rajdhani saiu do produto.
 */
const exo2 = Exo_2({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-corpo",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-mono",
  display: "swap",
});

/**
 * Tipografia do design de dados (`chat % dice tray`): Chakra Petch para
 * display, Exo 2 (`--font-corpo`) para corpo — a mesma do resto da mesa.
 *
 * Inter saía daqui e foi REMOVIDA do produto: ela era o corpo do VTT
 * enquanto o Console escrevia em outra fonte, e as duas apareciam lado a
 * lado toda vez que alguém abria a ficha por cima do mapa. Uma fonte a
 * menos pra baixar também.
 */
const chakraPetch = Chakra_Petch({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-chakra",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ruptura VTT",
  description: "Ruptura VTT — mesa virtual de Ruptura.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${orbitron.variable} ${jetbrainsMono.variable} ${chakraPetch.variable} ${exo2.variable}`}>
      {/* suppressHydrationWarning: extensões de navegador (ex.: ColorZilla/Grammarly)
          injetam atributos no <body> antes do React hidratar (ex.: cz-shortcut-listen) —
          falso positivo de mismatch, não um bug do app. Ver https://react.dev/link/hydration-mismatch */}
      <body suppressHydrationWarning>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
