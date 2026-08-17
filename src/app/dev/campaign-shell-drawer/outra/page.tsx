/**
 * Página B do harness — ver `layout.tsx` e `page.tsx` (página A).
 */

import Link from "next/link";

export default function CampaignShellDrawerPageB() {
  return (
    <div>
      <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 12 }}>Página B do harness.</p>
      <Link href="/dev/campaign-shell-drawer" data-testid="harness-ir-para-a" style={{ color: "#5ec8ff" }}>
        Voltar para a página A
      </Link>
    </div>
  );
}
