"use client";

/**
 * Menu geral da conta (Fase 3, aditivo §4.3) — existe FORA de qualquer
 * campanha: Minhas Campanhas, Criar Campanha, Conta e preferências,
 * Sair. Nunca mistura conteúdo de uma campanha específica (princípio
 * 11 do aditivo §13.1).
 */
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "../../../lib/auth/actions";
import { color } from "../[campaignId]/_shell/theme";

export function AccountNav({ userEmail }: { userEmail: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/login");
    router.refresh();
  }

  const linkStyle = (active: boolean) => ({
    color: active ? "#cfe6ff" : "#a8a8b4",
    textDecoration: "none",
    fontSize: 13,
    fontWeight: active ? 600 : 400,
  });

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 24px",
        borderBottom: `1px solid ${color.borderSubtle}`,
        flexWrap: "wrap",
      }}
    >
      <nav aria-label="Menu da conta" style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Ruptura VTT</span>
        <Link href="/mesas" data-testid="account-nav-minhas-campanhas" className="rv-focusable" style={linkStyle(pathname === "/mesas")}>
          Minhas Campanhas
        </Link>
        <Link href="/mesas#criar-campanha" data-testid="account-nav-criar-campanha" className="rv-focusable" style={linkStyle(false)}>
          Criar Campanha
        </Link>
        <Link href="/mesas/conta" data-testid="account-nav-conta" className="rv-focusable" style={linkStyle(pathname === "/mesas/conta")}>
          Conta e preferências
        </Link>
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 12, opacity: 0.6 }}>{userEmail}</span>
        <button
          data-testid="account-nav-sair"
          onClick={handleSignOut}
          disabled={signingOut}
          className="rv-btn rv-focusable"
          style={{ background: color.surface, color: "inherit", border: `1px solid ${color.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
        >
          {signingOut ? "Saindo…" : "Sair"}
        </button>
      </div>
    </header>
  );
}
