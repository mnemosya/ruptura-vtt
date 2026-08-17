/**
 * Mesa — rota `/mesas/[campaignId]` (aditivo §5.1, "rotas como /mesas
 * podem permanecer"). Fase 3: acesso e papel já resolvidos pelo layout
 * (`resolveCampaignAccess`) — esta página só decide QUANTO buscar
 * conforme o papel (o jogador não precisa das listas usadas só por
 * "Resolver Ataque", ferramenta exclusiva do narrador).
 *
 * Campanha, log e roster NÃO são mais buscados aqui: subiram para o
 * layout, que os entrega ao `CampaignRealtimeProvider` — os painéis que
 * os consomem vivem na casca e não podem depender de estar na Mesa.
 * Buscar de novo aqui seria consulta duplicada no mesmo request.
 */
import { resolveCampaignAccess } from "../../../lib/campaign/access";
import { listCharactersForNarratorCampaign, listControlledCharacters } from "../../../lib/character/storage";
import {
  getCharacterRules,
  getCombatField,
  getCombatFlow,
  listProperties,
  normalizeTechnicalContentItem,
  type TechnicalContentItem,
} from "../../../lib/content";
import { listItemsEffective, listRunesEffective } from "../../../lib/campaignContent";
import {
  normalizeAttackCriticalRules,
  normalizeItemContent,
  normalizeReactionRules,
  type AttackCriticalRules,
  type CharacterRecord,
  type CharacterRulesPayload,
  type ItemContent,
  type ReactionRules,
} from "../../../lib/character";
import MesaClient from "./MesaClient";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ campaignId: string }>;
}

export default async function MesaPage({ params }: PageProps) {
  const { campaignId } = await params;
  const access = await resolveCampaignAccess(campaignId);
  if (access.kind !== "ok") return null; // layout já mostra o estado certo (login/não encontrada/sem acesso)

  const isNarrator = access.role === "narrator";

  let personagensAtivos: CharacterRecord[] = [];
  let regras: CharacterRulesPayload | null = null;
  let criticalRules: AttackCriticalRules = normalizeAttackCriticalRules(null);
  let items: ItemContent[] = [];
  let properties: TechnicalContentItem[] = [];
  let runes: TechnicalContentItem[] = [];
  let reactionRules: ReactionRules = normalizeReactionRules(null);
  let personagensControlados: CharacterRecord[] = [];
  // Distinto de "[]" por decisão explícita (auditoria da Fase 4): uma
  // falha real de leitura não pode virar silenciosamente "você não
  // controla personagem nenhum" pro jogador — a Mesa do cliente usa
  // este campo pra mostrar erro+retry em vez do estado vazio quando
  // `personagensControlados` está vazio só porque a consulta quebrou,
  // não porque é vazio de verdade.
  let personagensControladosErro: string | null = null;

  if (!isNarrator) {
    // "Seus personagens" (Mesa do jogador) — mesma leitura que já
    // alimenta `controlledCharacterIds` no `CampaignSessionViewer`
    // (`resolveCampaignSessionViewer`, layout.tsx), chamada de novo
    // aqui porque aquela descarta os registros inteiros e fica só com
    // os ids. `CharacterRecord` já traz PV/PE/Mana/Integridade ATUAIS e
    // colapso/condições no `payload` — nenhuma consulta extra pra isso.
    try {
      personagensControlados = (await listControlledCharacters(campaignId)).filter((c) => !c.archived_at);
    } catch (e) {
      personagensControladosErro = e instanceof Error ? e.message : "Erro ao carregar seus personagens.";
    }
  }

  if (isNarrator) {
    // Só o narrador usa "Resolver Ataque" — o jogador não precisa
    // destas listas (evita busca e payload desnecessários).
    try {
      const all = await listCharactersForNarratorCampaign(campaignId);
      personagensAtivos = all.filter((c) => !c.archived_at);
    } catch {
      personagensAtivos = [];
    }
    try {
      const doc = await getCharacterRules();
      regras = (doc?.payload as CharacterRulesPayload | undefined) ?? null;
    } catch {
      // "Resolver Ataque" segue sem avanço automático de Colapso.
    }
    try {
      const combatFlow = await getCombatField();
      criticalRules = normalizeAttackCriticalRules(combatFlow?.payload);
    } catch {
      // Sugestões críticas indisponíveis; ataque básico continua funcional.
    }
    try {
      const [itemDocs, propertyDocs, runeDocs] = await Promise.all([
        listItemsEffective(campaignId),
        listProperties(),
        listRunesEffective(campaignId),
      ]);
      items = itemDocs.map((doc) => normalizeItemContent(doc.payload as Record<string, unknown>));
      properties = propertyDocs.map((doc) => normalizeTechnicalContentItem(doc.payload as Record<string, unknown>));
      runes = runeDocs.map((doc) => normalizeTechnicalContentItem(doc.payload as Record<string, unknown>));
    } catch {
      // Sugestões críticas indisponíveis; ataque básico continua funcional.
    }
    try {
      const combatFlow = await getCombatFlow();
      reactionRules = normalizeReactionRules(combatFlow?.payload);
    } catch {
      // Fail-closed — Reação segue disponível pelo custo normal.
    }
  }

  return (
    <MesaClient
      personagensAtivosIniciais={personagensAtivos}
      personagensControladosIniciais={personagensControlados}
      personagensControladosErroInicial={personagensControladosErro}
      regras={regras}
      criticalRules={criticalRules}
      items={items}
      properties={properties}
      runes={runes}
      reactionRules={reactionRules}
    />
  );
}
