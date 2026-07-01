/**
 * Página de DEBUG de status de auth (checkpoint v0.13). Server Component
 * que lê o usuário logado (cookie httpOnly) e mostra email + botão sair,
 * ou um aviso de "não logado".
 */

import Link from "next/link";
import { getCurrentUser } from "../../../../lib/auth/session";
import { SignOutButton } from "./SignOutButton";

export const dynamic = "force-dynamic";

export default async function AuthStatusPage() {
  const user = await getCurrentUser();

  return (
    <main style={{ maxWidth: 480, margin: "60px auto", padding: "0 20px" }}>
      <p style={{ opacity: 0.6, fontSize: 13, marginBottom: 16 }}>/dev/auth/status — status de auth dev.</p>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>Status de autenticação</h1>

      {user ? (
        <div data-testid="auth-logado" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#15301a", border: "1px solid #2a5a35", borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: 1 }}>Narrador logado</div>
            <div style={{ fontSize: 13 }}>
              Email: <strong data-testid="auth-email">{user.email ?? "(sem email)"}</strong>
            </div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              ID: <span data-testid="auth-user-id" style={{ fontFamily: "monospace" }}>{user.id}</span>
            </div>
          </div>
          <SignOutButton />
        </div>
      ) : (
        <div data-testid="auth-deslogado" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: "#2a1a1a", border: "1px solid #5a2a2a", borderRadius: 8, padding: 14, fontSize: 13 }}>
            Nenhum narrador logado.
          </div>
          <Link href="/dev/login" style={{ color: "#5ec8ff", fontSize: 13 }}>
            Ir para /dev/login
          </Link>
        </div>
      )}

      <p style={{ marginTop: 24, fontSize: 12 }}>
        <Link href="/dev/table" style={{ color: "#5ec8ff" }}>
          /dev/table
        </Link>
      </p>
    </main>
  );
}
