"use client";

/**
 * Mesa — área de entrada da sessão e do estado compartilhado da
 * campanha (aditivo §5.1). Fase 3: sucessora do antigo
 * MesaDetailClient.tsx monolítico (~1180 linhas, tela única
 * narrador-only) — dividida em seções coerentes (Rodada e cena,
 * Resolver Ataque, Log) e reutilizável por jogador E narrador. Gestão
 * de personagens/participantes/convites SAIU daqui: mora agora em
 * Personagens (`/mesas/[campaignId]/personagens`) e Jogadores e
 * convites (`/mesas/[campaignId]/jogadores-e-convites`) — nenhuma
 * função foi reimplementada, só reorganizada em áreas próprias.
 *
 * Campanha e log NÃO são mais estado local: vêm do
 * `CampaignRealtimeProvider` da casca, que os mantém vivos entre rotas
 * (os painéis que os mostram sobrevivem à navegação). O que continua
 * local é a lista de personagens ativos e o canal Realtime de
 * `characters` — só "Resolver Ataque" depende deles, e o payload que
 * acompanha essa lista é pesado demais para toda rota da campanha
 * carregar.
 *
 * Fase 3: as seções de Turnos e Log SAÍRAM daqui — viraram painéis
 * persistentes da casca (`TurnTrackDock`/`SessionPanel`,
 * `CampaignShell.tsx`), visíveis em qualquer rota da campanha, não só
 * na Mesa. Esta página fica só com o que é conteúdo DE FATO exclusivo
 * dela: Rodada/Cena e (pro narrador) Resolver Ataque.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { listCharactersForNarratorCampaign, listControlledCharacters } from "../../../lib/character/storage";
import { aggregateRealtimeStatus, useCampaignCharacterControllersRealtime, useCampaignCharactersRealtime } from "../../../lib/realtime/useCampaignRealtime";
import { describeRealtimeStatus } from "../../../lib/realtime/tableRealtime";
import type { RealtimeStatus } from "../../../lib/realtime/tableRealtime";
import type { AttackCriticalRules, CharacterRecord, CharacterRulesPayload, ItemContent, ReactionRules } from "../../../lib/character";
import type { TechnicalContentItem } from "../../../lib/content";
import { useCampaignSession } from "./_shell/CampaignRealtimeProvider";
import { RoundSceneSection } from "./_mesa/RoundSceneSection";
import { AttackResolutionSection } from "./_mesa/AttackResolutionSection";
import { PlayerCharactersSection } from "./_mesa/PlayerCharactersSection";

interface Props {
  personagensAtivosIniciais: CharacterRecord[];
  /** "Seus personagens" (Mesa do jogador) — vazio pro narrador, nunca buscado pra ele (ver page.tsx). */
  personagensControladosIniciais: CharacterRecord[];
  /** Falha real do SSR ao buscar `personagensControladosIniciais`, distinta de "vazio de verdade" — ver auditoria da Fase 4. */
  personagensControladosErroInicial: string | null;
  regras: CharacterRulesPayload | null;
  criticalRules: AttackCriticalRules;
  items: ItemContent[];
  properties: TechnicalContentItem[];
  runes: TechnicalContentItem[];
  reactionRules: ReactionRules;
}

export default function MesaClient({
  personagensAtivosIniciais,
  personagensControladosIniciais,
  personagensControladosErroInicial,
  regras,
  criticalRules,
  items,
  properties,
  runes,
  reactionRules,
}: Props) {
  const {
    campaignId,
    isNarrator,
    campaign,
    setCampaign,
    viewer,
    sessionSyncStatus,
    realtimeAuthDegradado,
    sessionError,
    reloadCampaign,
    reloadLogs,
  } = useCampaignSession();

  const [personagensAtivos, setPersonagensAtivos] = useState(personagensAtivosIniciais);
  const [error, setError] = useState<string | null>(null);

  const reloadPersonagens = useCallback(async () => {
    if (!isNarrator) return;
    try {
      const all = await listCharactersForNarratorCampaign(campaignId);
      setPersonagensAtivos(all.filter((c) => !c.archived_at));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao recarregar personagens.");
    }
  }, [campaignId, isNarrator]);

  // "Seus personagens" (Mesa do jogador) — estado PRÓPRIO, igual ao
  // padrão "erro por recurso" da Fase 3 (não misturado a `error`/
  // `sessionError` acima, que são de OUTRO recurso: a lista do
  // narrador pra "Resolver Ataque" e o estado geral da sessão). Uma
  // falha de releitura preserva os últimos cards válidos — nunca troca
  // dado bom por vazio (auditoria da Fase 4).
  const [personagensControlados, setPersonagensControlados] = useState(personagensControladosIniciais);
  const [erroPersonagensControlados, setErroPersonagensControlados] = useState(personagensControladosErroInicial);

  const reloadPersonagensControlados = useCallback(async () => {
    if (isNarrator) return;
    try {
      const all = await listControlledCharacters(campaignId);
      setPersonagensControlados(all.filter((c) => !c.archived_at));
      setErroPersonagensControlados(null);
    } catch (e) {
      setErroPersonagensControlados(e instanceof Error ? e.message : "Erro ao recarregar seus personagens.");
    }
  }, [campaignId, isNarrator]);

  async function reloadAll() {
    await Promise.all([reloadCampaign(), reloadLogs(), reloadPersonagens(), reloadPersonagensControlados()]);
  }

  // Canal de personagens: dois assinantes independentes, um por papel
  // (nunca os dois ativos ao mesmo tempo — o `campaignId` do lado
  // inativo é `null`, que desliga o hook). RLS de `characters`
  // (migration 0052) já restringe o que cada assinatura recebe: o
  // narrador vê toda a campanha, o jogador só os personagens que
  // controla — não precisa filtrar aqui, o Realtime nunca entrega o
  // resto. Hooks continuam incondicionais (Regras dos Hooks).
  const charactersSyncStatusNarrador = useCampaignCharactersRealtime(isNarrator ? campaignId : null, reloadPersonagens);
  const charactersSyncStatusJogador = useCampaignCharactersRealtime(!isNarrator ? campaignId : null, reloadPersonagensControlados);
  // Canal IRMÃO, só pro jogador: `character_controllers` (grant/revoke
  // de controle) não toca a linha de `characters`, então o canal acima
  // nunca vê essa mudança — auditoria pós-Fase-4. Sem isto, "Seus
  // personagens" só descobria um personagem recém-atribuído/removido
  // quando a janela recuperava o foco (gatilho 2, abaixo), nunca com a
  // Mesa aberta e em foco a sessão inteira.
  const controllersSyncStatusJogador = useCampaignCharacterControllersRealtime(!isNarrator ? campaignId : null, reloadPersonagensControlados);
  const charactersSyncStatusCanal = isNarrator
    ? charactersSyncStatusNarrador
    : aggregateRealtimeStatus([charactersSyncStatusJogador, controllersSyncStatusJogador]);
  // Mesmo client de browser do canal de sessão — se a autenticação
  // degradou lá, degradou aqui também (ver `realtimeAuthEstado` no
  // provider).
  const charactersSyncStatus: RealtimeStatus = realtimeAuthDegradado ? "error" : charactersSyncStatusCanal;

  const sessionStatus = describeRealtimeStatus(sessionSyncStatus, "mesa");
  const charactersStatus = describeRealtimeStatus(charactersSyncStatus, "mesa");

  // Gatilho 2 (jogador), FALLBACK — não mais o caminho primário pra
  // mudança de controle desde que o canal de `character_controllers`
  // acima existe. Continua útil pra quando o Realtime perdeu algum
  // evento (reconexão, aba em segundo plano com timer estrangulado) ou
  // pra quando a autenticação Realtime degradou: `reloadViewer` já
  // roda por foco de janela (provider, Fase 3) de qualquer forma, e
  // fechar essa lacuna aqui é gratuito. Chave em string (não o array em
  // si) porque `controlledCharacterIds` é uma referência NOVA a cada
  // `reloadViewer` mesmo com o mesmo conteúdo — comparar por valor
  // evita releitura à toa. Roda também no mount (chave inicial
  // "diferente" de nada) — inofensivo, e fecha a mesma lacuna do ponto
  // 2 (SSR pode já estar desatualizado quando a hidratação termina).
  const idsControladosChave = viewer.controlledCharacterIds.join(",");
  useEffect(() => {
    if (isNarrator) return;
    reloadPersonagensControlados();
  }, [idsControladosChave, isNarrator, reloadPersonagensControlados]);

  // Gatilho 3 (jogador): retorno/fechamento da ficha. A ficha abre como
  // modal por cima desta página via rota interceptada
  // (`@modal/(...)ficha`) — a Mesa NUNCA desmonta enquanto o modal está
  // aberto, só a URL muda (`usePathname` reflete isso mesmo com o modal
  // por cima, confirmado pelo critério 8 do check da Fase 4). Sem
  // remount pra disparar um refetch natural, o único jeito de saber
  // "a ficha acabou de fechar" é comparar o pathname ANTERIOR (que
  // começava com `/ficha`) com o atual (que não começa mais).
  const pathname = usePathname();
  const pathnameAnteriorRef = useRef(pathname);
  useEffect(() => {
    const anterior = pathnameAnteriorRef.current;
    pathnameAnteriorRef.current = pathname;
    if (isNarrator) return;
    if (anterior?.startsWith("/ficha") && !pathname?.startsWith("/ficha")) {
      reloadPersonagensControlados();
    }
  }, [pathname, isNarrator, reloadPersonagensControlados]);

  return (
    <div className="rm-page">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
        <span data-testid="mesa-sync-status" style={{ fontSize: 11, color: sessionStatus.cor }}>
          ● Sessão: {sessionStatus.texto}
        </span>
        <span data-testid="mesa-sync-status-personagens" style={{ fontSize: 11, color: charactersStatus.cor }}>
          ● Personagens: {charactersStatus.texto}
        </span>
        <button data-testid="mesa-recarregar" onClick={reloadAll} className="rm-btn rm-btn-ghost rv-focusable">
          Recarregar mesa
        </button>
      </div>

      {(error || sessionError) && (
        <p role="alert" className="rm-erro" style={{ marginBottom: 16 }}>
          Erro: {error ?? sessionError}
        </p>
      )}

      <RoundSceneSection
        campaign={campaign}
        isNarrator={isNarrator}
        onCampaignChange={setCampaign}
        onAfterEnd={() => Promise.all([reloadLogs(), reloadPersonagens()])}
      />

      {isNarrator ? (
        <AttackResolutionSection
          campaignId={campaignId}
          personagensAtivos={personagensAtivos}
          regras={regras}
          criticalRules={criticalRules}
          items={items}
          properties={properties}
          runes={runes}
          reactionRules={reactionRules}
          onAfterResolve={() => Promise.all([reloadPersonagens(), reloadLogs()])}
        />
      ) : (
        <PlayerCharactersSection
          campaignId={campaignId}
          personagens={personagensControlados}
          turnTrack={campaign.turn_track}
          erro={erroPersonagensControlados}
          onTentarDeNovo={reloadPersonagensControlados}
        />
      )}
    </div>
  );
}
