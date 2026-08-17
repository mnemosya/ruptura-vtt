/**
 * Conteúdo da campanha (rota `/biblioteca`) — lista o conteúdo EFETIVO
 * (oficial + override + homebrew) dos 4 tipos editáveis, para o
 * narrador dono da mesa. Área ADMINISTRATIVA; a rota de leitura para
 * ambos os papéis é `/livro` (correção #11 do plano: os dois nomes
 * eram confundidos, agora são entradas distintas no trilho).
 *
 * Fase 5: guarda própria trocada por `requireNarratorAccess` +
 * `NarratorOnlyDenied` — a mesma dupla que Jogadores e convites e
 * Configurações já usavam (defesa em profundidade continua valendo: o
 * trilho esconder o link não é a autorização real, aditivo §5.3). As
 * telas de "Mesa não encontrada"/"Acesso negado" próprias saíram: o
 * layout da campanha já resolve `not_found`/`no_access` ANTES desta
 * página renderizar, então eram código inalcançável mantendo uma
 * segunda aparência para o mesmo estado.
 */

import { listCampaignDrafts, resolveEffectiveList, type CampaignContentDraftRow } from "../../../../lib/campaignContent";
import { requireNarratorAccess } from "../../../../lib/campaign/access";
import type { DraftContentType } from "../../../../lib/contentSchema";
import { NarratorOnlyDenied } from "../_shell/NarratorOnlyDenied";
import { BibliotecaCampanhaClient } from "./BibliotecaCampanhaClient";

export const dynamic = "force-dynamic";

const TIPOS: { id: DraftContentType; label: string }[] = [
  { id: "spell", label: "Magia" },
  { id: "talent", label: "Talento" },
  { id: "item", label: "Item / Equipamento" },
  { id: "rune", label: "Runa" },
];

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function BibliotecaCampanhaPage({ params }: PageProps) {
  const { campaignId } = await params;
  const access = await requireNarratorAccess(campaignId);
  if (!access) return <NarratorOnlyDenied campaignId={campaignId} />;

  // A lista EFETIVA é o conteúdo principal da tela: se falhar, o erro
  // sobe para o `error.tsx` da campanha (logger + "Tentar de novo") em
  // vez de virar uma tabela vazia que afirma "esta campanha não tem
  // conteúdo". Os RASCUNHOS são secundários e falham à parte — daí o
  // erro por recurso, e não um `.catch(() => [])` que apresentaria uma
  // falha de leitura como "nenhum rascunho aberto" (auditoria da
  // Fase 5).
  const listasPorTipo = await Promise.all(TIPOS.map((t) => resolveEffectiveList(campaignId, t.id)));
  const efetivos = TIPOS.flatMap((t, i) => listasPorTipo[i]);

  let rascunhos: CampaignContentDraftRow[] = [];
  let rascunhosErro: string | null = null;
  try {
    rascunhos = await listCampaignDrafts(campaignId);
  } catch (e) {
    rascunhosErro = e instanceof Error ? e.message : "Erro ao carregar os rascunhos abertos.";
  }

  return (
    <main className="rm-page">
      <h1 className="rm-page-title" style={{ marginBottom: 4 }}>Conteúdo da campanha</h1>
      <p className="rm-faint" style={{ marginBottom: 20 }}>
        Conteúdo efetivo desta mesa: oficial, modificado (override) ou homebrew. Alterar aqui nunca modifica o catálogo oficial nem
        outras mesas.
      </p>
      <BibliotecaCampanhaClient campaignId={campaignId} tipos={TIPOS} efetivos={efetivos} rascunhos={rascunhos} rascunhosErro={rascunhosErro} />
    </main>
  );
}
