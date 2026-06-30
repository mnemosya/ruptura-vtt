/**
 * Página de DEBUG de entrada por "link de mesa" — sem design
 * definitivo, mesmo espírito de /dev/table e /dev/character-sheet.
 *
 * PRD (seção 1.2/1.4): "o link leva à seleção do perfil associado";
 * "cada mesa possui um link de entrada". Esta rota implementa só a
 * versão DEV mínima: o "link" é literalmente a URL com o `campaignId`
 * em texto puro — NÃO é um convite seguro (sem token, sem expiração,
 * sem revogação, sem autenticação). Qualquer pessoa que souber o uuid
 * de uma mesa pode abrir este link e ver/entrar em qualquer perfil
 * dela, usando a mesma anon key pública de sempre. Ver aviso completo
 * na seção "Confirmação de escopo" do checkpoint v0.10 do relatório de
 * Mesas/Log antes de tratar isto como convite real.
 *
 * Server Component: resolve a mesa e a lista de perfis/personagens no
 * servidor; a interatividade (entrar como perfil, abrir a ficha) fica
 * no Client Component (JoinClient).
 */

import { getCampaign, listCampaignProfiles } from "../../../../lib/table/storage";
import { listCharacters } from "../../../../lib/character/storage";
import type { Campaign, CampaignProfile } from "../../../../lib/table";
import type { CharacterRecord } from "../../../../lib/character";
import JoinClient from "./JoinClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function JoinPage({ params }: PageProps) {
  const { campaignId } = await params;

  let campaign: Campaign | null = null;
  let perfisIniciais: CampaignProfile[] = [];
  let personagens: CharacterRecord[] = [];
  let errorMessage: string | null = null;

  try {
    campaign = await getCampaign(campaignId);
    if (campaign) {
      perfisIniciais = await listCampaignProfiles(campaignId);
      personagens = await listCharacters();
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Erro desconhecido ao carregar a mesa.";
  }

  if (errorMessage) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Erro ao carregar a mesa</h1>
        <p style={{ color: "#ff6b6b" }}>{errorMessage}</p>
        <p style={{ opacity: 0.6, fontSize: 13 }}>
          Verifique se SUPABASE_URL e SUPABASE_ANON_KEY estão definidos em .env.local.
        </p>
      </main>
    );
  }

  if (!campaign) {
    return (
      <main style={{ maxWidth: 640, margin: "60px auto", padding: "0 20px" }}>
        <h1 style={{ fontSize: 20 }}>Mesa não encontrada</h1>
        <p style={{ opacity: 0.7, fontSize: 13 }}>
          Nenhuma mesa com id <code>{campaignId}</code>. Confirme o link em <code>/dev/table</code>.
        </p>
      </main>
    );
  }

  return <JoinClient campaign={campaign} perfisIniciais={perfisIniciais} personagens={personagens} />;
}
