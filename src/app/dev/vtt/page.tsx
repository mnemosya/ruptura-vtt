/**
 * Harness da mesa de Ruptura — mesmo princípio de
 * `/dev/campaign-shell-drawer`: monta o componente REAL (`VttClient`,
 * não uma cópia) fora da rota de produção.
 *
 * Desde a fundação funcional das ferramentas (movimento, terreno,
 * marcação, medição), `VttClient` lê e escreve estado PERSISTIDO via
 * `resolveCampaignAccess` — precisa de uma sessão logada de verdade e
 * de um `campaignId` real onde o usuário tenha acesso. O harness deixou
 * de poder rodar sem nenhum dos dois (era o caso quando a mesa era só
 * `_dados/cenaDemo.ts` em memória); agora exige `?campaignId=<uuid>` na
 * URL, com a sessão do navegador já autenticada.
 *
 * `?papel=player` continua útil para diagnosticar outras diferenças de
 * apresentação, mas o HUD nunca escolhe personagem por papel: ele
 * representa exclusivamente o token selecionado. A autorização real
 * continua vindo do servidor.
 *
 * Guardada por `assertDevRouteAllowed`, como as demais rotas `/dev`.
 */

import { assertDevRouteAllowed } from "../../../lib/dev/guard";
import { listTalentsEffective } from "../../../lib/campaignContent";
import { normalizeReactionRules, normalizeTalentContent, type CharacterRulesPayload } from "../../../lib/character";
import { getCharacterRules, getCombatFlow, listConditions } from "../../../lib/content";
import { VttClient } from "../../mesas/[campaignId]/vtt/VttClient";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ papel?: string; campaignId?: string }>;
}

export default async function DevVttPage({ searchParams }: PageProps) {
  assertDevRouteAllowed();
  const { papel, campaignId } = await searchParams;
  if (!campaignId) {
    return (
      <div style={{ padding: 32, fontFamily: "monospace", color: "#eafcff", background: "#0a0e14" }}>
        Passe <code>?campaignId=&lt;uuid&gt;</code> na URL — desde a fundação funcional das
        ferramentas, a mesa lê/escreve estado persistido e precisa de uma campanha real
        onde o usuário logado tenha acesso.
      </div>
    );
  }
  const [rulesDocument, combatFlow, conditionDocuments, talentDocuments] = await Promise.all([
    getCharacterRules().catch(() => null),
    getCombatFlow().catch(() => null),
    listConditions().catch(() => []),
    listTalentsEffective(campaignId).catch(() => []),
  ]);
  return (
    <VttClient
      campaignId={campaignId}
      campanhaNome="Ossos sob Vosek"
      papel={papel === "player" ? "player" : "narrator"}
      hudRules={(rulesDocument?.payload as CharacterRulesPayload | undefined) ?? null}
      hudReactionRules={normalizeReactionRules(combatFlow?.payload)}
      hudTalents={talentDocuments.map((document) => normalizeTalentContent(document.payload as Record<string, unknown>))}
      hudConditions={conditionDocuments.map((document) => {
        const payload = document.payload as { descricao_curta?: string } | null;
        return { slug: document.slug, name: document.nome ?? document.slug, description: payload?.descricao_curta };
      })}
    />
  );
}
