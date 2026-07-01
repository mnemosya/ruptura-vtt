/**
 * Dashboard do narrador (checkpoint v0.21) — área de PRODUTO, exige
 * login. Lista só as mesas do narrador logado (owner_id = usuário),
 * permite criar e abrir. /dev/table continua como console de
 * diagnóstico (vê tudo, sem auth).
 */

import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/session";
import { listCampaigns } from "../../lib/table/storage";
import type { Campaign } from "../../lib/table";
import MesasDashboardClient from "./MesasDashboardClient";

export const dynamic = "force-dynamic";

export default async function MesasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let minhasMesas: Campaign[] = [];
  let errorMessage: string | null = null;
  try {
    // listCampaigns hoje (RLS transição) retorna todas — filtramos ao dono
    // no servidor. Quando a RLS real cortar anon, o próprio owner_select
    // já devolverá só as do narrador.
    const todas = await listCampaigns();
    minhasMesas = todas.filter((m) => m.owner_id === user.id);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao carregar mesas.";
  }

  return (
    <MesasDashboardClient
      userEmail={user.email ?? "(sem email)"}
      mesasIniciais={minhasMesas}
      errorInicial={errorMessage}
    />
  );
}
