import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruptura VTT",
  description: "Ruptura VTT — páginas de desenvolvimento/debug.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
