/**
 * Página de DEBUG da base mínima de Mesa/Log persistente — sem design
 * definitivo, igual a /dev/character-sheet.
 *
 * Server Component: busca a lista inicial de mesas no Supabase (camada
 * de leitura pública, anon key — ver src/lib/table/storage.ts). A
 * interatividade (criar mesa, selecionar mesa, ver/adicionar log) fica
 * no Client Component (TableClient).
 */

import { listCampaigns } from "../../../lib/table/storage";
import type { Campaign } from "../../../lib/table";
import TableClient from "./TableClient";

export const dynamic = "force-dynamic";

export default async function TablePage() {
  let mesasIniciais: Campaign[] = [];
  let errorMessage: string | null = null;

  try {
    mesasIniciais = await listCampaigns();
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao carregar mesas.";
  }

  if (errorMessage) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Erro ao carregar mesas</h1>
        <p style={{ color: "#ff6b6b" }}>{errorMessage}</p>
        <p style={{ opacity: 0.6, fontSize: 13 }}>
          Verifique se SUPABASE_URL e SUPABASE_ANON_KEY estão definidos em .env.local e se a
          migration 0003_campaigns_table_logs.sql foi aplicada.
        </p>
      </main>
    );
  }

  return <TableClient mesasIniciais={mesasIniciais} />;
}
