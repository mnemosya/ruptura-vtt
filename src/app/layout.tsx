import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruptura VTT",
  description: "Ruptura VTT — páginas de desenvolvimento/debug.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      {/* suppressHydrationWarning: extensões de navegador (ex.: ColorZilla/Grammarly)
          injetam atributos no <body> antes do React hidratar (ex.: cz-shortcut-listen) —
          falso positivo de mismatch, não um bug do app. Ver https://react.dev/link/hydration-mismatch */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
