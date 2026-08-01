import type { Metadata } from "next";
import { Orbitron, Rajdhani, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Tipografia da identidade Ruptura (Orbitron / Rajdhani / JetBrains Mono).
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

const rajdhani = Rajdhani({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-rajdhani",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ruptura VTT",
  description: "Ruptura VTT — mesa virtual de Ruptura.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${orbitron.variable} ${rajdhani.variable} ${jetbrainsMono.variable}`}>
      {/* suppressHydrationWarning: extensões de navegador (ex.: ColorZilla/Grammarly)
          injetam atributos no <body> antes do React hidratar (ex.: cz-shortcut-listen) —
          falso positivo de mismatch, não um bug do app. Ver https://react.dev/link/hydration-mismatch */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
