/**
 * Assistente de criação de personagem (checkpoint v0.41, PRD 3.2).
 *
 * Fase 1 do plano de contas/campanhas/convites/personagens (revisão 4):
 * exige login E que o usuário seja participante ATIVO da campanha
 * (`is_campaign_member` — narrador dono OU jogador com `campaign_members`
 * ativo). Não existe mais "perfil" — a RPC `complete_character_creation`
 * (migration 0054) já autoriza pela mesma checagem e concede controle
 * (`character_controllers`) automaticamente à conta que cria.
 *
 * Permitir qualquer participante ativo criar pelo wizard é uma decisão
 * provisória desta fase — a política final de "quem pode criar
 * personagem livremente" é uma decisão de produto pendente (ver §12 do
 * relatório de auditoria), não bloqueada por esta página.
 *
 * Fase 6: o guard próprio (`getCurrentUser` + `getCampaign` +
 * `isCampaignMember`, com telas de erro hand-rolled em hex) virou
 * `resolveCampaignAccess` — já cobre "narrador OU jogador membro ativo"
 * num só veredito (`kind === "ok"` para os dois papéis), e o layout da
 * campanha já resolve login/`not_found`/`no_access` antes desta página
 * renderizar (memoizado por request), então a checagem aqui era uma
 * segunda consulta pro mesmo resultado. Mesmo padrão já aplicado nas
 * demais rotas de conteúdo da Fase 5.
 *
 * `.catch(() => [])` nos 3 catálogos (talentos/magias/itens) virou erro
 * POR RECURSO, não vazio silencioso (auditoria pós-Fase-6): os 3 têm um
 * estado "vazio de verdade" LEGÍTIMO e comum (mesa nova, Biblioteca sem
 * nada publicado ainda — as etapas 4/5 já dizem "avance sem preencher")
 * — colapsar falha de leitura no mesmo `[]` faz o jogador acreditar
 * que a mesa não tem talento/magia/item nenhum, quando na verdade a
 * consulta quebrou, e ele pode finalizar um personagem baseado nisso.
 * `talentosErro`/`magiasErro`/`itensLojaErro` chegam ao client só pra
 * decidir "mostro a etapa normal (vazio real OU dado carregado) ou um
 * erro+retry no lugar dela" — nunca os dois ao mesmo tempo.
 */

import Link from "next/link";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { getCharacterRules } from "../../../../../lib/content";
import { listTalentsEffective, listSpellsEffective, listItemsEffective } from "../../../../../lib/campaignContent";
import { comFalhaInjetavel } from "../../../../../lib/dev/faultInjection";
import {
  normalizeTalentContent,
  normalizeSpellContent,
  normalizeItemContent,
  type CharacterRulesPayload,
  type TalentContent,
  type SpellContent,
  type ItemContent,
} from "../../../../../lib/character";
import CreateCharacterWizardClient from "./CreateCharacterWizardClient";

/**
 * Loja restrita a raridade até incomum na criação (PRD 3.2, Etapa 6) —
 * "até incomum" inclui tudo IGUAL OU MAIS COMUM que incomum, não só o
 * rótulo "comum" — o enum real (`db_equipamentos_normalizado_v1_2.json`)
 * tem "muito_comum" abaixo de "comum". Raros e muito raros bloqueados.
 */
const RARIDADES_PERMITIDAS_NA_CRIACAO = new Set(["muito_comum", "comum", "incomum"]);

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function NovoPersonagemPage({ params }: PageProps) {
  const { campaignId } = await params;
  const access = await resolveCampaignAccess(campaignId);
  if (access.kind !== "ok") return null; // layout já mostra o estado certo (login/não encontrada/sem acesso)
  const campaign = access.campaign;

  let regras: CharacterRulesPayload | null = null;
  try {
    const doc = await getCharacterRules();
    regras = (doc?.payload as CharacterRulesPayload | undefined) ?? null;
  } catch {
    regras = null;
  }

  // Etapas 4-6 (Vertentes/Magias, Talento inicial, Inventário): nunca
  // lista hardcoded — sempre a partir do que a Biblioteca/Editor
  // Universal publicou de verdade para esta mesa (oficial + override +
  // homebrew, via listXEffective).
  let talentos: TalentContent[] = [];
  let talentosErro: string | null = null;
  try {
    const docs = await comFalhaInjetavel("wizard-talentos", () => listTalentsEffective(campaignId));
    talentos = docs
      .map((doc) => normalizeTalentContent(doc.payload))
      .filter((t) => t.status === "published");
  } catch (e) {
    talentosErro = e instanceof Error ? e.message : "Erro ao carregar talentos.";
  }

  let magias: SpellContent[] = [];
  let magiasErro: string | null = null;
  try {
    const docs = await comFalhaInjetavel("wizard-magias", () => listSpellsEffective(campaignId));
    magias = docs
      .map((doc) => normalizeSpellContent(doc.payload))
      .filter((m) => m.status === "published");
  } catch (e) {
    magiasErro = e instanceof Error ? e.message : "Erro ao carregar magias.";
  }

  let itensLoja: ItemContent[] = [];
  let itensLojaErro: string | null = null;
  try {
    const docs = await comFalhaInjetavel("wizard-itens", () => listItemsEffective(campaignId));
    itensLoja = docs
      .map((doc) => normalizeItemContent(doc.payload))
      .filter((item) => item.raridade != null && RARIDADES_PERMITIDAS_NA_CRIACAO.has(item.raridade));
  } catch (e) {
    itensLojaErro = e instanceof Error ? e.message : "Erro ao carregar itens da loja.";
  }

  if (!regras) {
    return (
      <main className="rm-boundary">
        <h1 className="rm-page-title">Erro ao carregar regras</h1>
        <p role="alert" className="rm-boundary-msg">
          regras_personagem não veio do banco — não é possível montar o assistente de criação sem
          atributos/perícias reais da Biblioteca.
        </p>
        <div className="rm-boundary-acoes">
          <Link href={`/mesas/${campaignId}`} className="rm-btn rm-btn-ghost rv-focusable">← Voltar à mesa</Link>
        </div>
      </main>
    );
  }

  return (
    <CreateCharacterWizardClient
      campaign={campaign}
      regras={regras}
      talentos={talentos}
      talentosErro={talentosErro}
      magias={magias}
      magiasErro={magiasErro}
      itensLoja={itensLoja}
      itensLojaErro={itensLojaErro}
    />
  );
}
