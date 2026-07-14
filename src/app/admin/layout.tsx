/**
 * Portão único de autorização da área administrativa da Biblioteca
 * (Etapa 2). Roda em TODA requisição a qualquer rota sob /admin — a
 * checagem é sempre no servidor (`getContentAdminStatus`), nunca uma
 * questão de esconder um botão no client. `force-dynamic` impede que o
 * Next sirva uma versão estática/cacheada da checagem de autorização.
 */

import type { ReactNode } from "react";
import { getContentAdminStatus } from "../../lib/auth/contentAdmin";
import { AcessoNegado } from "./AcessoNegado";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { user, isAdmin } = await getContentAdminStatus();

  if (!user) {
    return (
      <AcessoNegado
        titulo="Área administrativa"
        motivo="Esta área exige login. Entre com uma conta de narrador para continuar."
        mostrarLinkLogin
      />
    );
  }

  if (!isAdmin) {
    return (
      <AcessoNegado
        titulo="Acesso restrito"
        motivo={`A conta ${user.email ?? user.id} está autenticada, mas não tem acesso administrativo à Biblioteca. Peça para quem administra o projeto conceder acesso (scripts/grant-content-admin.ts).`}
      />
    );
  }

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "24px 20px 64px" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 12, color: "#7d7d8a", textTransform: "uppercase", letterSpacing: 0.6 }}>Ruptura VTT — Admin</div>
          <h1 style={{ fontSize: 24, margin: "4px 0 0" }}>Biblioteca (leitura e diagnóstico)</h1>
          <nav style={{ marginTop: 8, display: "flex", gap: 14, fontSize: 13 }}>
            <a href="/admin/biblioteca" style={{ color: "#a8a8b3" }}>
              Lista
            </a>
            <a href="/admin/biblioteca/rascunhos" style={{ color: "#a8a8b3" }}>
              Rascunhos
            </a>
          </nav>
        </div>
        <div style={{ fontSize: 13, color: "#a8a8b3", textAlign: "right" }}>
          <div>{user.email ?? user.id}</div>
          <div style={{ color: "#7d7d8a" }}>administrador</div>
        </div>
      </header>
      {children}
    </div>
  );
}
