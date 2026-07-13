import { useMemo, useState } from "react";
import { Section } from "./Section";
import { buttonStyle } from "./styles";
import {
  describeNonAutomatedTalentEffects,
  describeTalentTemporaryEffectPreview,
  getTalentLevelEffects,
  classifyTalentEffect,
  describeCadence,
  cadenceResetsAutomatically,
  TALENT_CADENCE_AUTO_RESET,
  type TalentOperationPattern,
} from "../../../../lib/character";
import type {
  AcquiredTalentLevel,
  TalentContent,
  TalentLevelContent,
  UsableTalentEffect,
  TalentContextualOpportunity,
  Character,
} from "../../../../lib/character";

/**
 * Aba "Talentos" — checkpoint CP14 (engine de operação canônica). Todo
 * nível adquirido termina classificado em um dos 4 padrões operacionais
 * (Automático / Contextual / Atividade própria / Narrativo rastreado),
 * calculado pela engine (`classifyTalentEffect`) a partir do payload
 * canônico — nunca de lista manual. Passivos não têm botão, mas aparecem
 * marcados como operacionais (efeito no fluxo). Filtros: Todos / Passivos
 * / Atividades / Contextuais / Ativos / Indisponíveis.
 */

const PATTERN_LABEL: Record<TalentOperationPattern, string> = {
  automatico: "Automático",
  contextual: "Contextual",
  atividade: "Atividade própria",
  narrativo: "Narrativo rastreado",
};

const PATTERN_COLOR: Record<TalentOperationPattern, string> = {
  automatico: "#4caf50",
  contextual: "#5ec8ff",
  atividade: "#e0a03c",
  narrativo: "#c78bff",
};

type FilterKey = "todos" | "passivos" | "atividades" | "contextuais" | "ativos" | "indisponiveis";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "passivos", label: "Passivos" },
  { key: "atividades", label: "Atividades" },
  { key: "contextuais", label: "Contextuais" },
  { key: "ativos", label: "Ativos" },
  { key: "indisponiveis", label: "Indisponíveis" },
];

/** Conjunto de padrões operacionais de um nível (agregado dos seus efeitos). */
function levelPatterns(nivel: TalentLevelContent): Set<TalentOperationPattern> {
  const set = new Set<TalentOperationPattern>();
  for (const efeito of getTalentLevelEffects(nivel)) set.add(classifyTalentEffect(efeito));
  if (set.size === 0) set.add("automatico");
  return set;
}

export function TalentsTab({
  talents,
  catalogError,
  acquired,
  usableEffects,
  contextualOpportunities,
  onAcquire,
  onRemove,
  onUseEffect,
  onToggleEffect,
  onResetEffect,
  bricolagemVulnerabilidade,
  onRegisterBricolagem,
  onRollBricolagemTest,
  onEndBricolagem,
  gambiarraAtiva,
  gambiarraAvailable = false,
  onRegisterGambiarra,
  onEndGambiarra,
  mirarAtivo,
  onConfirmMirar,
  onEndMirar,
  furtividadeAtiva,
  camuflagemOpticaAvailable = false,
  onStartFurtividade,
  onConfirmCamuflagemOptica,
  onEndFurtividade,
  gatilhoQuenteStatus,
  totemBencaoTokenStatus,
  bencaoAllies = [],
  onGrantBencaoToken,
  falcaoStatus,
  onGrantFalcaoToken,
  briefingDeCampoStatus,
  onRegisterBriefing,
  imposicaoDeRitmoStatus,
  onUseImposicaoDeRitmo,
  entrelinhasStatus,
  onRegisterEntrelinhas,
  puxarOsFiosStatus,
  entrelinhasAtivo,
  onRegisterPuxarOsFios,
  prontoSocorroStatus,
  onProntoSocorro,
  ritmoDeCampoStatus,
  ritmoDeCampoAtivo = false,
  onToggleRitmoDeCampo,
  protocoloDeEmergenciaStatus,
  onProtocoloDeEmergencia,
  ondaSolidariaStatus,
  chamaRedobradaStatus,
  ultimoEfeitoPositivoAliado,
  onOndaSolidariaExtend,
  onChamaRedobrada,
  espetaculoMortalStatus,
  espetaculoMortalArmasDisponiveis = [],
  onEspetaculoMortal,
  redeDeFavoresAtiva,
  redeDeFavoresStatus,
  onRegisterRedeDeFavores,
  onEndRedeDeFavores,
  zeDaEsquinaStatus,
  zeDaEsquinaRegistros = [],
  onRegisterZeDaEsquina,
  gatoDeTelhadoAtiva,
  gatoDeTelhadoStatus,
  onRegisterGatoDeTelhado,
  onEndGatoDeTelhado,
  saidaDosFundosAtiva,
  saidaDosFundosStatus,
  onRegisterSaidaDosFundos,
  onEndSaidaDosFundos,
  drones = [],
  sinalLimpoStatus,
  onRegisterDrone,
  onRemoveDrone,
  onActivateDrone,
  onDeactivateDrone,
  onApplySinalLimpoBonus,
  onSetDroneGatilho,
  onMarkDroneGatilhoOcorrido,
  enxameStatus,
  onPairEnxame,
  onUnpairEnxame,
}: {
  talents: TalentContent[];
  catalogError: string | null;
  acquired: AcquiredTalentLevel[];
  usableEffects: UsableTalentEffect[];
  contextualOpportunities: TalentContextualOpportunity[];
  onAcquire: (talentoId: string, nivelId: string, nivel: number) => void;
  onRemove: (acquiredId: string) => void;
  onUseEffect: (key: string) => void;
  onToggleEffect: (key: string) => void;
  onResetEffect: (key: string) => void;
  /** Artífice › Bricolagem (checkpoint talentos). */
  bricolagemVulnerabilidade?: BricolagemVuln | null;
  onRegisterBricolagem?: (params: { tipo: "mecanismo" | "estrutura" | "sistema_simples"; alvoDescricao: string; falhaPrincipal: string; periciaBeneficiada: "engenharia" | "robotica" }) => void;
  onRollBricolagemTest?: () => void;
  onEndBricolagem?: () => void;
  /** Artífice › Gambiarra Expressa (checkpoint talentos). */
  gambiarraAtiva?: GambiarraAtiva | null;
  gambiarraAvailable?: boolean;
  onRegisterGambiarra?: (params: { alvo: "estrutura" | "equipamento" | "automato"; materialBase: string; criacaoOuModificacao: "criacao" | "modificacao"; efeitoObtido: string; duracao: string; observacoes?: string }) => void;
  onEndGambiarra?: () => void;
  /** Atirador de Elite › 1 Tiro, 1 Acerto (checkpoint talentos). */
  mirarAtivo?: MirarAtivo | null;
  onConfirmMirar?: (resultado: "sucesso" | "critico") => void;
  onEndMirar?: () => void;
  /** Sorrateiro › Furtividade (checkpoint talentos, Fase 3). */
  furtividadeAtiva?: FurtividadeAtiva | null;
  camuflagemOpticaAvailable?: boolean;
  onStartFurtividade?: () => void;
  onConfirmCamuflagemOptica?: () => void;
  onEndFurtividade?: () => void;
  /** Pistoleiro › Gatilho Quente (checkpoint talentos, Fase 7) — status só; uso real na aba Rolagens (Fase 1). */
  gatilhoQuenteStatus?: { acquired: boolean; max: number; used: number; available: number };
  /** Totem › Benção (checkpoint talentos, Fase 1) — conceder token 1/cena a um aliado ativo da mesa. */
  totemBencaoTokenStatus?: { acquired: boolean; usedThisScene: boolean };
  bencaoAllies?: { id: string; nome: string }[];
  onGrantBencaoToken?: (targetCharacterId: string) => void;
  /** Estrategista › Falcão (checkpoint talentos, Fase 5) — conceder +2 real 1/cena a um aliado ativo da mesa (mesma lista de bencaoAllies). */
  falcaoStatus?: { acquired: boolean; usedThisScene: boolean; valor: number };
  onGrantFalcaoToken?: (targetCharacterId: string, alvoDescricao: string) => void;
  /** Estrategista › Briefing de Campo (checkpoint talentos, Fase 5) — registra até maxAliados aliados com perícia designada. */
  briefingDeCampoStatus?: { acquired: boolean; maxAliados: number; periciasOpcoes: string[] };
  onRegisterBriefing?: (entries: { targetCharacterId: string; periciaId: string }[]) => void;
  /** Estrategista › Imposição de Ritmo (checkpoint talentos, Fase 5) — 1/cena, gasta Reação, +1 PA real a um aliado. */
  imposicaoDeRitmoStatus?: { acquired: boolean; usedThisScene: boolean; paBonus: number; alcanceM: number };
  onUseImposicaoDeRitmo?: (targetCharacterId: string) => void;
  /** Manipulador › Entrelinhas (checkpoint talentos, Fase 6) — descobre vulnerabilidade 1/cena, +2 real no próximo teste de Influência do próprio caster contra a criatura. */
  entrelinhasStatus?: { acquired: boolean; usedThisScene: boolean; valor: number; opcoesDescoberta: string[] };
  onRegisterEntrelinhas?: (params: { alvoNome: string; descoberta: string }) => void;
  /** Manipulador › Puxar os Fios (checkpoint talentos, Fase 6) — exige vulnerabilidade ativa de Entrelinhas na mesma criatura. */
  puxarOsFiosStatus?: { acquired: boolean; usedThisScene: boolean; opcoesSucesso: string[] };
  entrelinhasAtivo?: { alvoNome: string; descoberta: string; valor: number; concedidoEm: string } | null;
  onRegisterPuxarOsFios?: (abertura: string) => void;
  /** Paramédico › Pronto-socorro (checkpoint talentos, Fase 7) — estabiliza aliado ativo da mesa a 0 PV, 1/cena. */
  prontoSocorroStatus?: { acquired: boolean; usedThisScene: boolean };
  onProntoSocorro?: (targetCharacterId: string, aindaNaoAgiu: boolean) => void;
  /** Paramédico › Ritmo de Campo (checkpoint talentos, Fase 7) — arma -1 PA para a próxima ação/item/magia de cura confirmada. */
  ritmoDeCampoStatus?: { acquired: boolean; reducao: number; minimo: number };
  ritmoDeCampoAtivo?: boolean;
  onToggleRitmoDeCampo?: (value: boolean) => void;
  /** Paramédico › Protocolo de Emergência (checkpoint talentos, Fase 7) — Reação real, 1/cena. */
  protocoloDeEmergenciaStatus?: { acquired: boolean; usedThisScene: boolean; alcanceM: number };
  onProtocoloDeEmergencia?: (targetCharacterId: string) => void;
  /** Totem › Onda Solidária/Chama Redobrada (checkpoint talentos, Fase 9) — operam sobre o último efeito positivo real aplicado via item em aliado. */
  ondaSolidariaStatus?: { acquired: boolean };
  chamaRedobradaStatus?: { acquired: boolean; usedThisScene: boolean };
  ultimoEfeitoPositivoAliado?: { targetCharacterId: string; targetNome: string } | null;
  onOndaSolidariaExtend?: (secondAllyId: string) => void;
  onChamaRedobrada?: (opcao: "numerico" | "duracao") => void;
  /** Malabarista › Espetáculo Mortal (checkpoint talentos, Fase 10) — consome 3 armas leves de Arremesso reais do inventário, 1/cena. */
  espetaculoMortalStatus?: { acquired: boolean; usedThisScene: boolean; armasNecessarias: number };
  espetaculoMortalArmasDisponiveis?: { id: string; nome: string }[];
  onEspetaculoMortal?: (selectedInstanceIds: string[], opcao: "convergencia" | "dispersao") => void;
  /** Mercador › Rede de Favores (checkpoint talentos, Fase 12) — PN aliado temporário recrutado, 1/sessão. */
  redeDeFavoresAtiva?: Character["rede_de_favores_ativa"] | null;
  redeDeFavoresStatus?: { acquired: boolean; usedThisSession: boolean; opcoesPagamento: string[] };
  onRegisterRedeDeFavores?: (params: { nomePn: string; papel: string; tipoPagamento: "favor" | "promessa" | "pagamento_simbolico"; duracao: string; notas: string }) => void;
  onEndRedeDeFavores?: () => void;
  /** Rato de Rua › Zé da Esquina (checkpoint talentos, Fase 13). */
  zeDaEsquinaStatus?: { acquired: boolean; usedThisMission: boolean; opcoes: string[] };
  zeDaEsquinaRegistros?: NonNullable<Character["ze_da_esquina_registros"]>;
  onRegisterZeDaEsquina?: (params: { contato: string; tipo: "informacao" | "abrigo" | "recurso_imediato"; complicacaoResolvida: string; notas: string }) => void;
  /** Rato de Rua › Gato de Telhado (checkpoint talentos, Fase 13). */
  gatoDeTelhadoAtiva?: Character["gato_de_telhado_ativo"] | null;
  gatoDeTelhadoStatus?: { acquired: boolean; usedToday: boolean };
  onRegisterGatoDeTelhado?: (params: { local: string; personagensProtegidos: string[] }) => void;
  onEndGatoDeTelhado?: () => void;
  /** Rato de Rua › Saída dos Fundos (checkpoint talentos, Fase 13). */
  saidaDosFundosAtiva?: Character["saida_dos_fundos_ativa"] | null;
  saidaDosFundosStatus?: { acquired: boolean; usedToday: boolean };
  onRegisterSaidaDosFundos?: (params: { situacaoDeRisco: string; rotaOuMetodo: string; consequenciaMenor: string }) => void;
  onEndSaidaDosFundos?: () => void;
  /** Droneiro › modelo mínimo de drone + Sinal Limpo/Script/Enxame (checkpoint talentos, Fase 14). */
  drones?: NonNullable<Character["drones"]>;
  sinalLimpoStatus?: { acquired: boolean; usedThisScene: boolean };
  onRegisterDrone?: (params: { nome: string; modelo: string; paMaximo: number; acoes: string }) => void;
  onRemoveDrone?: (droneId: string) => void;
  onActivateDrone?: (droneId: string) => void;
  onDeactivateDrone?: (droneId: string) => void;
  onApplySinalLimpoBonus?: (droneId: string) => void;
  onSetDroneGatilho?: (droneId: string, descricao: string, acaoAssociada: string) => void;
  onMarkDroneGatilhoOcorrido?: (droneId: string) => void;
  enxameStatus?: { acquired: boolean; usedToday: boolean; maxUnidades: number };
  onPairEnxame?: (droneIds: string[], modo: "pareada" | "independente") => void;
  onUnpairEnxame?: (grupoId: string) => void;
}) {
  const [filter, setFilter] = useState<FilterKey>("todos");

  const acquiredByLevelId = useMemo(() => new Map(acquired.map((a) => [a.nivelId, a])), [acquired]);
  const usableByLevelId = useMemo(() => {
    const m = new Map<string, UsableTalentEffect[]>();
    for (const u of usableEffects) {
      const list = m.get(u.nivelId) ?? [];
      list.push(u);
      m.set(u.nivelId, list);
    }
    return m;
  }, [usableEffects]);
  const persistedOppsByLevelId = useMemo(() => {
    const m = new Map<string, TalentContextualOpportunity[]>();
    for (const o of contextualOpportunities.filter((x) => x.persistida)) {
      const list = m.get(o.nivelId) ?? [];
      list.push(o);
      m.set(o.nivelId, list);
    }
    return m;
  }, [contextualOpportunities]);

  /** Um nível passa no filtro atual? "todos" sempre passa (mostra catálogo p/ adquirir). */
  function levelMatchesFilter(nivel: TalentLevelContent): boolean {
    if (filter === "todos") return true;
    const acquiredEntry = acquiredByLevelId.get(nivel.id);
    if (!acquiredEntry) return false; // filtros específicos só sobre adquiridos
    const patterns = levelPatterns(nivel);
    const usables = usableByLevelId.get(nivel.id) ?? [];
    const hasActivity = usables.some((u) => u.kind === "limited_use");
    const anyActive = usables.some((u) => u.kind === "toggle" && u.toggledOn);
    const anyPending = (persistedOppsByLevelId.get(nivel.id) ?? []).length > 0;
    const anyEsgotado = usables.some((u) => u.kind === "limited_use" && u.usosMax != null && u.usosGastos >= u.usosMax);
    switch (filter) {
      case "passivos":
        return patterns.has("automatico") && !hasActivity && !patterns.has("contextual");
      case "atividades":
        return hasActivity;
      case "contextuais":
        return patterns.has("contextual");
      case "ativos":
        return anyActive || anyPending;
      case "indisponiveis":
        return anyEsgotado;
      default:
        return true;
    }
  }

  const published = talents.filter((t) => t.status === "published");

  return (
    <Section title={`Talentos (${acquired.length} nível(is) adquirido(s))`}>
      <p style={{ fontSize: 12, opacity: 0.5, marginBottom: 10 }}>
        Catálogo inteiro vem da Biblioteca do Sistema (22 árvores, 66 níveis). Cada nível adquirido
        termina em um dos 4 padrões operacionais — <strong>Automático</strong> (soma no fluxo),{" "}
        <strong>Contextual</strong> (dispara em gatilho), <strong>Atividade própria</strong> (botão
        com usos/cadência) ou <strong>Narrativo rastreado</strong> (resolvido com o narrador). Nenhum
        talento fica só como descrição.
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            data-testid={`talento-filtro-${f.key}`}
            onClick={() => setFilter(f.key)}
            style={{
              ...buttonStyle,
              fontSize: 11,
              padding: "3px 10px",
              background: filter === f.key ? "#2e4b2e" : undefined,
              fontWeight: filter === f.key ? 700 : 400,
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {catalogError && (
        <p style={{ fontSize: 13, color: "#ff6b6b", background: "#2a1717", borderRadius: 8, padding: "10px 12px" }}>
          Catálogo de talentos indisponível. Nenhuma lista local foi usada.
        </p>
      )}

      {!catalogError && (
        <div data-testid="talentos-lista" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {published.map((talent) => {
            const visibleLevels = talent.niveis.filter(levelMatchesFilter);
            if (visibleLevels.length === 0) return null;
            return (
              <div key={talent.id} data-testid={`talento-${talent.slug}`} style={{ background: "#1d1e24", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{talent.nome}</div>
                {talent.descricao_curta && <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 8px" }}>{talent.descricao_curta}</p>}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {visibleLevels.map((nivel) => {
                    const acquiredEntry = acquiredByLevelId.get(nivel.id);
                    const nonAutomated = describeNonAutomatedTalentEffects(nivel);
                    const patterns = Array.from(levelPatterns(nivel));
                    const pendingOpps = persistedOppsByLevelId.get(nivel.id) ?? [];
                    return (
                      <div
                        key={nivel.id}
                        data-testid={`talento-nivel-${nivel.id}`}
                        style={{ borderLeft: acquiredEntry ? "3px solid #4caf50" : "3px solid #555", paddingLeft: 10, fontSize: 12 }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <strong>Nível {nivel.nivel} — {nivel.nome}</strong>
                          {acquiredEntry &&
                            patterns.map((p) => (
                              <span
                                key={p}
                                data-testid={`talento-padrao-${nivel.id}-${p}`}
                                style={{ color: PATTERN_COLOR[p], fontSize: 10, border: `1px solid ${PATTERN_COLOR[p]}`, borderRadius: 4, padding: "0 5px" }}
                              >
                                {PATTERN_LABEL[p]}
                              </span>
                            ))}
                        </div>
                        {nivel.descricao_curta && <p style={{ opacity: 0.7, margin: "2px 0" }}>{nivel.descricao_curta}</p>}
                        {nonAutomated.length > 0 && (
                          <p style={{ color: "#8892a0", margin: "2px 0" }}>Parte manual: {nonAutomated.join(" · ")}</p>
                        )}

                        {acquiredEntry && pendingOpps.length > 0 && (
                          <p data-testid={`talento-oportunidade-${nivel.id}`} style={{ color: "#5ec8ff", margin: "2px 0" }}>
                            Oportunidade pendente: {pendingOpps.map((o) => o.rotulo).join(" · ")}
                          </p>
                        )}

                        {acquiredEntry && nivel.slug === "artifice_bricolagem" && (
                          <BricolagemWidget
                            vulnerabilidade={bricolagemVulnerabilidade ?? null}
                            onRegister={onRegisterBricolagem}
                            onRollTest={onRollBricolagemTest}
                            onEnd={onEndBricolagem}
                          />
                        )}

                        {acquiredEntry && nivel.slug === "artifice_gambiarra_expressa" && (
                          <GambiarraWidget
                            ativa={gambiarraAtiva ?? null}
                            available={gambiarraAvailable}
                            onRegister={onRegisterGambiarra}
                            onEnd={onEndGambiarra}
                          />
                        )}

                        {acquiredEntry && nivel.slug === "atirador_de_elite_1_tiro_1_acerto" && (
                          <MirarWidget mirarAtivo={mirarAtivo ?? null} onConfirm={onConfirmMirar} onEnd={onEndMirar} />
                        )}

                        {acquiredEntry && nivel.slug === "pistoleiro_gatilho_quente" && gatilhoQuenteStatus && (
                          <GatilhoQuenteWidget status={gatilhoQuenteStatus} />
                        )}

                        {acquiredEntry && nivel.slug === "estrategista_falcao" && falcaoStatus?.acquired && (
                          <FalcaoWidget status={falcaoStatus} allies={bencaoAllies} onGrant={onGrantFalcaoToken} />
                        )}

                        {acquiredEntry && nivel.slug === "estrategista_briefing_de_campo" && briefingDeCampoStatus?.acquired && (
                          <BriefingDeCampoWidget status={briefingDeCampoStatus} allies={bencaoAllies} onRegister={onRegisterBriefing} />
                        )}

                        {acquiredEntry && nivel.slug === "estrategista_imposicao_de_ritmo" && imposicaoDeRitmoStatus?.acquired && (
                          <ImposicaoDeRitmoWidget status={imposicaoDeRitmoStatus} allies={bencaoAllies} onUse={onUseImposicaoDeRitmo} />
                        )}

                        {acquiredEntry && nivel.slug === "manipulador_entrelinhas" && entrelinhasStatus?.acquired && (
                          <EntrelinhasWidget status={entrelinhasStatus} onRegister={onRegisterEntrelinhas} />
                        )}

                        {acquiredEntry && nivel.slug === "manipulador_puxar_os_fios" && puxarOsFiosStatus?.acquired && (
                          <PuxarOsFiosWidget status={puxarOsFiosStatus} entrelinhasAtivo={entrelinhasAtivo ?? null} onRegister={onRegisterPuxarOsFios} />
                        )}

                        {acquiredEntry && nivel.slug === "paramedico_pronto_socorro" && prontoSocorroStatus?.acquired && (
                          <ProntoSocorroWidget status={prontoSocorroStatus} allies={bencaoAllies} onConfirm={onProntoSocorro} />
                        )}

                        {acquiredEntry && nivel.slug === "paramedico_ritmo_de_campo" && ritmoDeCampoStatus?.acquired && (
                          <RitmoDeCampoWidget status={ritmoDeCampoStatus} ativo={ritmoDeCampoAtivo} onToggle={onToggleRitmoDeCampo} />
                        )}

                        {acquiredEntry && nivel.slug === "paramedico_protocolo_de_emergencia" && protocoloDeEmergenciaStatus?.acquired && (
                          <ProtocoloDeEmergenciaWidget status={protocoloDeEmergenciaStatus} allies={bencaoAllies} onConfirm={onProtocoloDeEmergencia} />
                        )}

                        {acquiredEntry && nivel.slug === "totem_bencao" && totemBencaoTokenStatus?.acquired && (
                          <TotemBencaoWidget status={totemBencaoTokenStatus} allies={bencaoAllies} onGrant={onGrantBencaoToken} />
                        )}

                        {acquiredEntry && nivel.slug === "totem_onda_solidaria" && ondaSolidariaStatus?.acquired && (
                          <OndaSolidariaWidget allies={bencaoAllies} ultimoEfeito={ultimoEfeitoPositivoAliado ?? null} onExtend={onOndaSolidariaExtend} />
                        )}

                        {acquiredEntry && nivel.slug === "totem_chama_redobrada" && chamaRedobradaStatus?.acquired && (
                          <ChamaRedobradaWidget status={chamaRedobradaStatus} ultimoEfeito={ultimoEfeitoPositivoAliado ?? null} onConfirm={onChamaRedobrada} />
                        )}

                        {acquiredEntry && nivel.slug === "malabarista_espetaculo_mortal" && espetaculoMortalStatus?.acquired && (
                          <EspetaculoMortalWidget
                            status={espetaculoMortalStatus}
                            armasDisponiveis={espetaculoMortalArmasDisponiveis}
                            onConfirm={onEspetaculoMortal}
                          />
                        )}

                        {acquiredEntry && nivel.slug === "mercador_rede_de_favores" && redeDeFavoresStatus?.acquired && (
                          <RedeDeFavoresWidget
                            ativa={redeDeFavoresAtiva ?? null}
                            status={redeDeFavoresStatus}
                            onRegister={onRegisterRedeDeFavores}
                            onEnd={onEndRedeDeFavores}
                          />
                        )}

                        {acquiredEntry && nivel.slug === "rato_de_rua_ze_da_esquina" && zeDaEsquinaStatus?.acquired && (
                          <ZeDaEsquinaWidget status={zeDaEsquinaStatus} registros={zeDaEsquinaRegistros} onRegister={onRegisterZeDaEsquina} />
                        )}

                        {acquiredEntry && nivel.slug === "rato_de_rua_gato_de_telhado" && gatoDeTelhadoStatus?.acquired && (
                          <GatoDeTelhadoWidget
                            ativa={gatoDeTelhadoAtiva ?? null}
                            status={gatoDeTelhadoStatus}
                            onRegister={onRegisterGatoDeTelhado}
                            onEnd={onEndGatoDeTelhado}
                          />
                        )}

                        {acquiredEntry && nivel.slug === "rato_de_rua_saida_dos_fundos" && saidaDosFundosStatus?.acquired && (
                          <SaidaDosFundosWidget
                            ativa={saidaDosFundosAtiva ?? null}
                            status={saidaDosFundosStatus}
                            onRegister={onRegisterSaidaDosFundos}
                            onEnd={onEndSaidaDosFundos}
                          />
                        )}

                        {acquiredEntry && nivel.slug === "droneiro_sinal_limpo" && sinalLimpoStatus?.acquired && (
                          <DroneRosterWidget
                            drones={drones}
                            sinalLimpoStatus={sinalLimpoStatus}
                            onRegisterDrone={onRegisterDrone}
                            onRemoveDrone={onRemoveDrone}
                            onActivateDrone={onActivateDrone}
                            onDeactivateDrone={onDeactivateDrone}
                            onApplySinalLimpoBonus={onApplySinalLimpoBonus}
                          />
                        )}

                        {acquiredEntry && nivel.slug === "droneiro_script" && (
                          <ScriptWidget drones={drones} onSetGatilho={onSetDroneGatilho} onMarkOcorrido={onMarkDroneGatilhoOcorrido} />
                        )}

                        {acquiredEntry && nivel.slug === "droneiro_enxame" && enxameStatus?.acquired && (
                          <EnxameWidget drones={drones} status={enxameStatus} onPair={onPairEnxame} onUnpair={onUnpairEnxame} />
                        )}

                        {acquiredEntry && nivel.slug === "sorrateiro_passo_fantasma" && (
                          <FurtividadeWidget
                            furtividadeAtiva={furtividadeAtiva ?? null}
                            camuflagemOpticaAvailable={camuflagemOpticaAvailable}
                            onStart={onStartFurtividade}
                            onConfirmCover={onConfirmCamuflagemOptica}
                            onEnd={onEndFurtividade}
                          />
                        )}

                        {acquiredEntry &&
                          (usableByLevelId.get(nivel.id) ?? []).map((usable) => {
                            const esgotado = usable.kind === "limited_use" && usable.usosMax != null && usable.usosGastos >= usable.usosMax;
                            const tempPreview = describeTalentTemporaryEffectPreview(usable);
                            return (
                              <div
                                key={usable.key}
                                data-testid={`talento-usavel-${usable.key}`}
                                style={{ background: "#15161b", borderRadius: 6, padding: "6px 8px", margin: "6px 0", display: "flex", flexDirection: "column", gap: 4 }}
                              >
                                <span style={{ fontSize: 11, opacity: 0.8 }}>{usable.description}</span>
                                {tempPreview && (
                                  <span data-testid={`talento-efeito-temp-preview-${usable.key}`} style={{ fontSize: 11, color: "#4caf50" }}>
                                    Efeito temporário {usable.kind === "toggle" ? "ao ativar" : "ao usar"}: {tempPreview}
                                  </span>
                                )}
                                {usable.kind === "limited_use" ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span data-testid={`talento-usos-${usable.key}`} style={{ fontSize: 11, opacity: 0.6 }}>
                                      Usos restantes: {usable.usosMax != null ? Math.max(0, usable.usosMax - usable.usosGastos) : "—"}/{usable.usosMax ?? "—"}
                                      {usable.cadencia ? ` · ${describeCadence(usable.cadencia)}` : ""}
                                      {usable.custoPa != null ? ` · custo ${usable.custoPa} PA` : " · sem custo de PA estruturado"}
                                    </span>
                                    <button
                                      data-testid={`talento-usar-${usable.key}`}
                                      onClick={() => onUseEffect(usable.key)}
                                      disabled={esgotado}
                                      style={{ ...buttonStyle, fontSize: 11, padding: "2px 8px", opacity: esgotado ? 0.5 : 1 }}
                                    >
                                      Usar talento
                                    </button>
                                    {usable.usosGastos > 0 && (
                                      <button
                                        data-testid={`talento-resetar-${usable.key}`}
                                        onClick={() => onResetEffect(usable.key)}
                                        style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: 0.7 }}
                                        title={
                                          cadenceResetsAutomatically(usable.cadencia)
                                            ? "Também reseta automaticamente na cadência"
                                            : "Cadência sem gatilho automático — reset manual (logado)"
                                        }
                                      >
                                        Resetar usos
                                      </button>
                                    )}
                                    {esgotado && <span style={{ fontSize: 10, color: "#ff6b6b" }}>Indisponível — sem usos nesta cadência.</span>}
                                  </div>
                                ) : (
                                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                    <span style={{ fontSize: 11, opacity: 0.6 }}>
                                      {usable.toggledOn ? "Ativo — efeito temporário na aba Condições; modificadores valem nas rolagens." : "Inativo."}
                                    </span>
                                    <button
                                      data-testid={`talento-toggle-${usable.key}`}
                                      onClick={() => onToggleEffect(usable.key)}
                                      style={{ ...buttonStyle, fontSize: 11, padding: "2px 8px", background: usable.toggledOn ? "#2e4b2e" : undefined }}
                                    >
                                      {usable.toggledOn ? "Desativar" : "Ativar"}
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        <div style={{ marginTop: 4 }}>
                          {acquiredEntry ? (
                            <button
                              data-testid={`talento-remover-${nivel.id}`}
                              onClick={() => onRemove(acquiredEntry.id)}
                              style={{ ...buttonStyle, fontSize: 11, padding: "2px 8px" }}
                            >
                              Remover
                            </button>
                          ) : (
                            <button
                              data-testid={`talento-adquirir-${nivel.id}`}
                              onClick={() => onAcquire(talent.id, nivel.id, nivel.nivel)}
                              style={{ ...buttonStyle, fontSize: 11, padding: "2px 8px" }}
                            >
                              Adquirir
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

interface BricolagemVuln {
  id: string;
  tipo: "mecanismo" | "estrutura" | "sistema_simples";
  alvoDescricao: string;
  falhaPrincipal: string;
  periciaBeneficiada: "engenharia" | "robotica";
  consumida: boolean;
}

const widgetBox: React.CSSProperties = { background: "#15161b", borderRadius: 6, padding: "6px 8px", margin: "6px 0", display: "flex", flexDirection: "column", gap: 4, fontSize: 11 };
const widgetInput: React.CSSProperties = { background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 11 };

function BricolagemWidget({
  vulnerabilidade,
  onRegister,
  onRollTest,
  onEnd,
}: {
  vulnerabilidade: BricolagemVuln | null;
  onRegister?: (params: { tipo: "mecanismo" | "estrutura" | "sistema_simples"; alvoDescricao: string; falhaPrincipal: string; periciaBeneficiada: "engenharia" | "robotica" }) => void;
  onRollTest?: () => void;
  onEnd?: () => void;
}) {
  const [tipo, setTipo] = useState<"mecanismo" | "estrutura" | "sistema_simples">("mecanismo");
  const [alvoDescricao, setAlvoDescricao] = useState("");
  const [falhaPrincipal, setFalhaPrincipal] = useState("");
  const [pericia, setPericia] = useState<"engenharia" | "robotica">("engenharia");

  if (vulnerabilidade && !vulnerabilidade.consumida) {
    return (
      <div data-testid="bricolagem-ativa" style={widgetBox}>
        <span style={{ color: "#4caf50" }}>✦ Vulnerabilidade identificada</span> ({vulnerabilidade.tipo}): "{vulnerabilidade.falhaPrincipal}" — +1 no próximo teste de {vulnerabilidade.periciaBeneficiada}.
        <div style={{ display: "flex", gap: 6 }}>
          <button data-testid="bricolagem-rolar" onClick={onRollTest} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
            Rolar teste relacionado
          </button>
          <button data-testid="bricolagem-encerrar" onClick={onEnd} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
            Encerrar
          </button>
        </div>
      </div>
    );
  }
  if (vulnerabilidade?.consumida) {
    return (
      <div data-testid="bricolagem-consumida" style={{ ...widgetBox, opacity: 0.6 }}>
        Bônus consumido em "{vulnerabilidade.falhaPrincipal}". Examine outro mecanismo para gerar um novo.
      </div>
    );
  }
  return (
    <div data-testid="bricolagem-formulario" style={widgetBox}>
      <span style={{ opacity: 0.7 }}>Examinar ponto vulnerável — sem teste:</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <select data-testid="bricolagem-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} style={widgetInput}>
          <option value="mecanismo">Mecanismo</option>
          <option value="estrutura">Estrutura</option>
          <option value="sistema_simples">Sistema simples</option>
        </select>
        <input data-testid="bricolagem-alvo" placeholder="alvo (ex.: fechadura)" value={alvoDescricao} onChange={(e) => setAlvoDescricao(e.target.value)} style={{ ...widgetInput, width: 140 }} />
        <input data-testid="bricolagem-falha" placeholder="falha principal identificada" value={falhaPrincipal} onChange={(e) => setFalhaPrincipal(e.target.value)} style={{ ...widgetInput, width: 180 }} />
        <select data-testid="bricolagem-pericia" value={pericia} onChange={(e) => setPericia(e.target.value as typeof pericia)} style={widgetInput}>
          <option value="engenharia">Engenharia</option>
          <option value="robotica">Robótica</option>
        </select>
        <button
          data-testid="bricolagem-registrar"
          disabled={!falhaPrincipal.trim() || !alvoDescricao.trim()}
          onClick={() => onRegister?.({ tipo, alvoDescricao, falhaPrincipal, periciaBeneficiada: pericia })}
          style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: !falhaPrincipal.trim() || !alvoDescricao.trim() ? 0.5 : 1 }}
        >
          Registrar vulnerabilidade
        </button>
      </div>
    </div>
  );
}

interface MirarAtivo {
  resultado: "sucesso" | "critico";
  bonus: number;
  consumido: boolean;
}

function MirarWidget({
  mirarAtivo,
  onConfirm,
  onEnd,
}: {
  mirarAtivo: MirarAtivo | null;
  onConfirm?: (resultado: "sucesso" | "critico") => void;
  onEnd?: () => void;
}) {
  if (mirarAtivo) {
    return (
      <div data-testid="mirar-ativo" style={widgetBox}>
        <span style={{ color: "#4caf50" }}>✦ Mirar ativo</span> — +{mirarAtivo.bonus} no próximo disparo à distância ({mirarAtivo.resultado}), até o fim da rodada.
        {mirarAtivo.consumido && <span style={{ color: "#888" }}> Já usado nesta rodada.</span>}
        <button data-testid="mirar-encerrar" onClick={onEnd} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}>
          Encerrar
        </button>
      </div>
    );
  }
  return (
    <div data-testid="mirar-formulario" style={widgetBox}>
      <span style={{ opacity: 0.7 }}>Confirme o resultado do teste de Mirar:</span>
      <div style={{ display: "flex", gap: 6 }}>
        <button data-testid="mirar-confirmar-sucesso" onClick={() => onConfirm?.("sucesso")} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
          Sucesso
        </button>
        <button data-testid="mirar-confirmar-critico" onClick={() => onConfirm?.("critico")} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
          Crítico
        </button>
      </div>
    </div>
  );
}

interface FurtividadeAtiva {
  active: boolean;
  source: string;
  plausibleCoverConfirmed: boolean;
  detected: boolean;
  exitReason: string | null;
}

/**
 * Sorrateiro — estado de Furtividade (N1 Passo Fantasma âncora a entrada
 * manual; Camuflagem Óptica N2 usa `onConfirmCover` para permitir
 * continuar escondido após um deslocamento exposto; Ataque Fatal N3
 * encerra via o fluxo de resolução de ataque em /dev/table, não aqui).
 */
function FurtividadeWidget({
  furtividadeAtiva,
  camuflagemOpticaAvailable,
  onStart,
  onConfirmCover,
  onEnd,
}: {
  furtividadeAtiva: FurtividadeAtiva | null;
  camuflagemOpticaAvailable: boolean;
  onStart?: () => void;
  onConfirmCover?: () => void;
  onEnd?: () => void;
}) {
  if (furtividadeAtiva?.active) {
    return (
      <div data-testid="furtividade-ativa" style={widgetBox}>
        <span style={{ color: "#4caf50" }}>✦ Furtividade ativa</span> — não deixa rastros/pegadas/sinais físicos (Passo Fantasma).
        {camuflagemOpticaAvailable && (
          <>
            <span style={{ opacity: 0.7 }}>
              Camuflagem Óptica: entrar em linha de visão ou se mover fora de cobertura não encerra a Furtividade — confirme que o
              deslocamento terminou num ponto plausível para continuar escondido.
            </span>
            <button data-testid="furtividade-confirmar-cobertura" onClick={onConfirmCover} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}>
              Confirmar ponto de cobertura plausível
            </button>
            {furtividadeAtiva.plausibleCoverConfirmed && <span style={{ color: "#4caf50" }}>Último deslocamento confirmado como plausível.</span>}
          </>
        )}
        <button data-testid="furtividade-encerrar" onClick={onEnd} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}>
          Encerrar Furtividade
        </button>
      </div>
    );
  }
  return (
    <div data-testid="furtividade-formulario" style={widgetBox}>
      <span style={{ opacity: 0.7 }}>Não está em Furtividade agora.</span>
      <button data-testid="furtividade-entrar" onClick={onStart} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}>
        Entrar em Furtividade
      </button>
    </div>
  );
}

/**
 * Pistoleiro › Gatilho Quente (N1) — status do recurso real de dados de
 * gatilho. O USO em si (checkpoint talentos, Fase 1 — revisão) acontece na
 * aba Rolagens, integrado na MESMA rolagem do ataque (d8 real no pool de
 * dados, nunca digitado à parte) — este card só mostra o saldo disponível
 * para não duplicar o ponto de consumo do recurso.
 */
function GatilhoQuenteWidget({ status }: { status: { acquired: boolean; max: number; used: number; available: number } }) {
  return (
    <div data-testid="gatilho-quente-widget" style={widgetBox}>
      <span style={{ opacity: 0.7 }}>
        Dados de gatilho: {status.available}/{status.max} disponíveis — recupera no descanso longo. Use o checkbox
        &quot;Usar dado de gatilho&quot; na aba Rolagens ao atacar com pistola/revólver.
      </span>
    </div>
  );
}

/** Totem › Benção (N1) — concede o token 1/cena a um aliado ativo da mesa (o USO real acontece na aba Rolagens do aliado). */
function TotemBencaoWidget({
  status,
  allies,
  onGrant,
}: {
  status: { acquired: boolean; usedThisScene: boolean };
  allies: { id: string; nome: string }[];
  onGrant?: (targetCharacterId: string) => void;
}) {
  const [alvo, setAlvo] = useState("");
  return (
    <div data-testid="totem-bencao-widget" style={widgetBox}>
      {status.usedThisScene ? (
        <span style={{ opacity: 0.7 }}>Token de Benção já concedido nesta cena.</span>
      ) : allies.length === 0 ? (
        <span style={{ opacity: 0.7 }}>Nenhum aliado ativo na mesa para conceder o token de Benção (1/cena).</span>
      ) : (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select data-testid="totem-bencao-alvo" value={alvo} onChange={(e) => setAlvo(e.target.value)} style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}>
            <option value="">— escolher aliado —</option>
            {allies.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
          <button
            data-testid="totem-bencao-conceder"
            disabled={!alvo}
            onClick={() => {
              if (!alvo) return;
              onGrant?.(alvo);
              setAlvo("");
            }}
            style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
          >
            Conceder token de Benção (1/cena)
          </button>
        </div>
      )}
    </div>
  );
}

function FalcaoWidget({
  status,
  allies,
  onGrant,
}: {
  status: { acquired: boolean; usedThisScene: boolean; valor: number };
  allies: { id: string; nome: string }[];
  onGrant?: (targetCharacterId: string, alvoDescricao: string) => void;
}) {
  const [alvo, setAlvo] = useState("");
  const [descricao, setDescricao] = useState("");
  return (
    <div data-testid="falcao-widget" style={widgetBox}>
      {status.usedThisScene ? (
        <span style={{ opacity: 0.7 }}>Falcão já usado nesta cena.</span>
      ) : allies.length === 0 ? (
        <span style={{ opacity: 0.7 }}>Nenhum aliado ativo na mesa para conceder o +{status.valor} de Falcão (1/cena).</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            data-testid="falcao-descricao"
            type="text"
            placeholder="Alvo/detalhe observado (narrativo)"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select data-testid="falcao-alvo" value={alvo} onChange={(e) => setAlvo(e.target.value)} style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}>
              <option value="">— escolher aliado que vai agir —</option>
              {allies.map((a) => (
                <option key={a.id} value={a.id}>{a.nome}</option>
              ))}
            </select>
            <button
              data-testid="falcao-conceder"
              disabled={!alvo}
              onClick={() => {
                if (!alvo) return;
                onGrant?.(alvo, descricao);
                setAlvo("");
                setDescricao("");
              }}
              style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
            >
              Confirmar teste bem-sucedido — conceder +{status.valor} (1/cena)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BriefingDeCampoWidget({
  status,
  allies,
  onRegister,
}: {
  status: { acquired: boolean; maxAliados: number; periciasOpcoes: string[] };
  allies: { id: string; nome: string }[];
  onRegister?: (entries: { targetCharacterId: string; periciaId: string }[]) => void;
}) {
  const [entries, setEntries] = useState<{ targetCharacterId: string; periciaId: string }[]>([]);

  function addEntry() {
    if (entries.length >= status.maxAliados) return;
    setEntries((prev) => [...prev, { targetCharacterId: "", periciaId: status.periciasOpcoes[0] ?? "" }]);
  }

  return (
    <div data-testid="briefing-de-campo-widget" style={widgetBox}>
      <p style={{ fontSize: 11, opacity: 0.7, margin: 0 }}>
        5 minutos preparando o grupo — até {status.maxAliados} aliados, cada um com uma perícia designada.
      </p>
      {entries.map((entry, index) => (
        <div key={index} style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
          <select
            data-testid={`briefing-aliado-${index}`}
            value={entry.targetCharacterId}
            onChange={(e) => setEntries((prev) => prev.map((it, i) => (i === index ? { ...it, targetCharacterId: e.target.value } : it)))}
            style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}
          >
            <option value="">— aliado —</option>
            {allies.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
          <select
            data-testid={`briefing-pericia-${index}`}
            value={entry.periciaId}
            onChange={(e) => setEntries((prev) => prev.map((it, i) => (i === index ? { ...it, periciaId: e.target.value } : it)))}
            style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}
          >
            {status.periciasOpcoes.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <button onClick={() => setEntries((prev) => prev.filter((_, i) => i !== index))} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
            remover
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button data-testid="briefing-adicionar" disabled={entries.length >= status.maxAliados || allies.length === 0} onClick={addEntry} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
          + aliado
        </button>
        <button
          data-testid="briefing-registrar"
          disabled={entries.length === 0 || entries.some((e) => !e.targetCharacterId)}
          onClick={() => {
            onRegister?.(entries);
            setEntries([]);
          }}
          style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
        >
          Registrar Briefing de Campo
        </button>
      </div>
    </div>
  );
}

function ImposicaoDeRitmoWidget({
  status,
  allies,
  onUse,
}: {
  status: { acquired: boolean; usedThisScene: boolean; paBonus: number; alcanceM: number };
  allies: { id: string; nome: string }[];
  onUse?: (targetCharacterId: string) => void;
}) {
  const [alvo, setAlvo] = useState("");
  return (
    <div data-testid="imposicao-de-ritmo-widget" style={widgetBox}>
      {status.usedThisScene ? (
        <span style={{ opacity: 0.7 }}>Imposição de Ritmo já usada nesta cena.</span>
      ) : allies.length === 0 ? (
        <span style={{ opacity: 0.7 }}>Nenhum aliado ativo na mesa para agir imediatamente (confirme manualmente que está a até {status.alcanceM}m).</span>
      ) : (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select data-testid="imposicao-ritmo-alvo" value={alvo} onChange={(e) => setAlvo(e.target.value)} style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}>
            <option value="">— escolher aliado (até {status.alcanceM}m) —</option>
            {allies.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
          <button
            data-testid="imposicao-ritmo-usar"
            disabled={!alvo}
            onClick={() => {
              if (!alvo) return;
              onUse?.(alvo);
              setAlvo("");
            }}
            style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
          >
            Gastar Reação: +{status.paBonus} PA imediato ao aliado (1/cena)
          </button>
        </div>
      )}
    </div>
  );
}

const DESCOBERTA_LABELS: Record<string, string> = {
  desconforto: "Algo que parece deixá-la desconfortável",
  desejo: "Algo que ela parece querer obter",
  protecao: "Alguém/algo que ela demonstra proteger",
  assunto_evitado: "Um assunto que ela tenta evitar",
  contradicao: "Uma contradição na fala/postura/reação",
};

const ABERTURA_LABELS: Record<string, string> = {
  informacao_relevante: "Alvo deixa escapar informação relevante",
  contradicao_usavel: "Alvo entrega contradição usável até fim da cena",
  concessao_menor: "Alvo aceita concessão menor",
  hesitacao_hostil: "Alvo hesita antes de agir contra você",
  terceiro_duvida_do_alvo: "Terceiro presente passa a duvidar do alvo",
};

function EntrelinhasWidget({
  status,
  onRegister,
}: {
  status: { acquired: boolean; usedThisScene: boolean; valor: number; opcoesDescoberta: string[] };
  onRegister?: (params: { alvoNome: string; descoberta: string }) => void;
}) {
  const [alvoNome, setAlvoNome] = useState("");
  const [descoberta, setDescoberta] = useState(status.opcoesDescoberta[0] ?? "");
  return (
    <div data-testid="entrelinhas-widget" style={widgetBox}>
      {status.usedThisScene ? (
        <span style={{ opacity: 0.7 }}>Entrelinhas já usado nesta cena.</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            data-testid="entrelinhas-alvo"
            type="text"
            placeholder="Nome da criatura (conversa breve)"
            value={alvoNome}
            onChange={(e) => setAlvoNome(e.target.value)}
            style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}
          />
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select data-testid="entrelinhas-descoberta" value={descoberta} onChange={(e) => setDescoberta(e.target.value)} style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}>
              {status.opcoesDescoberta.map((o) => (
                <option key={o} value={o}>{DESCOBERTA_LABELS[o] ?? o}</option>
              ))}
            </select>
            <button
              data-testid="entrelinhas-registrar"
              disabled={!alvoNome}
              onClick={() => {
                if (!alvoNome) return;
                onRegister?.({ alvoNome, descoberta });
                setAlvoNome("");
              }}
              style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
            >
              Confirmar teste de Psicologia bem-sucedido (1/cena)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PuxarOsFiosWidget({
  status,
  entrelinhasAtivo,
  onRegister,
}: {
  status: { acquired: boolean; usedThisScene: boolean; opcoesSucesso: string[] };
  entrelinhasAtivo: { alvoNome: string; descoberta: string; valor: number; concedidoEm: string } | null;
  onRegister?: (abertura: string) => void;
}) {
  const [abertura, setAbertura] = useState(status.opcoesSucesso[0] ?? "");
  return (
    <div data-testid="puxar-os-fios-widget" style={widgetBox}>
      {status.usedThisScene ? (
        <span style={{ opacity: 0.7 }}>Puxar os Fios já usado nesta cena.</span>
      ) : !entrelinhasAtivo ? (
        <span style={{ opacity: 0.7 }}>Requer vulnerabilidade ativa de Entrelinhas contra a criatura (use Entrelinhas primeiro).</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Vulnerabilidade ativa contra: {entrelinhasAtivo.alvoNome}</span>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select data-testid="puxar-os-fios-abertura" value={abertura} onChange={(e) => setAbertura(e.target.value)} style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}>
              {status.opcoesSucesso.map((o) => (
                <option key={o} value={o}>{ABERTURA_LABELS[o] ?? o}</option>
              ))}
            </select>
            <button data-testid="puxar-os-fios-registrar" onClick={() => onRegister?.(abertura)} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
              Confirmar sucesso em Influência — registrar abertura (1/cena)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProntoSocorroWidget({
  status,
  allies,
  onConfirm,
}: {
  status: { acquired: boolean; usedThisScene: boolean };
  allies: { id: string; nome: string }[];
  onConfirm?: (targetCharacterId: string, aindaNaoAgiu: boolean) => void;
}) {
  const [alvo, setAlvo] = useState("");
  const [aindaNaoAgiu, setAindaNaoAgiu] = useState(false);
  return (
    <div data-testid="pronto-socorro-widget" style={widgetBox}>
      {status.usedThisScene ? (
        <span style={{ opacity: 0.7 }}>Pronto-socorro já usado nesta cena.</span>
      ) : allies.length === 0 ? (
        <span style={{ opacity: 0.7 }}>Nenhum aliado ativo na mesa para estabilizar (1/cena).</span>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <select data-testid="pronto-socorro-alvo" value={alvo} onChange={(e) => setAlvo(e.target.value)} style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}>
            <option value="">— aliado adjacente a 0 PV —</option>
            {allies.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <input type="checkbox" checked={aindaNaoAgiu} onChange={(e) => setAindaNaoAgiu(e.target.checked)} />
            Aliado ainda não agiu nesta rodada (concede +1 PA para agir)
          </label>
          <button
            data-testid="pronto-socorro-confirmar"
            disabled={!alvo}
            onClick={() => {
              if (!alvo) return;
              onConfirm?.(alvo, aindaNaoAgiu);
              setAlvo("");
              setAindaNaoAgiu(false);
            }}
            style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}
          >
            Estabilizar (sem teste, sem custo — 1/cena)
          </button>
        </div>
      )}
    </div>
  );
}

function RitmoDeCampoWidget({
  status,
  ativo,
  onToggle,
}: {
  status: { acquired: boolean; reducao: number; minimo: number };
  ativo: boolean;
  onToggle?: (value: boolean) => void;
}) {
  return (
    <div data-testid="ritmo-de-campo-widget" style={widgetBox}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
        <input data-testid="ritmo-de-campo-ativo" type="checkbox" checked={ativo} onChange={(e) => onToggle?.(e.target.checked)} />
        Armar Ritmo de Campo: -{status.reducao} PA (mín. {status.minimo}) na PRÓXIMA ação/item/magia de cura — sem tag
        estruturada de "cura" no catálogo, confirme só quando a próxima ação for mesmo de cura.
      </label>
    </div>
  );
}

function ProtocoloDeEmergenciaWidget({
  status,
  allies,
  onConfirm,
}: {
  status: { acquired: boolean; usedThisScene: boolean; alcanceM: number };
  allies: { id: string; nome: string }[];
  onConfirm?: (targetCharacterId: string) => void;
}) {
  const [alvo, setAlvo] = useState("");
  return (
    <div data-testid="protocolo-de-emergencia-widget" style={widgetBox}>
      {status.usedThisScene ? (
        <span style={{ opacity: 0.7 }}>Protocolo de Emergência já usado nesta cena.</span>
      ) : allies.length === 0 ? (
        <span style={{ opacity: 0.7 }}>Nenhum aliado ativo na mesa a até {status.alcanceM}m para socorrer (1/cena).</span>
      ) : (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select data-testid="protocolo-de-emergencia-alvo" value={alvo} onChange={(e) => setAlvo(e.target.value)} style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}>
            <option value="">— aliado caiu a 0 PV (até {status.alcanceM}m) —</option>
            {allies.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
          <button
            data-testid="protocolo-de-emergencia-confirmar"
            disabled={!alvo}
            onClick={() => {
              if (!alvo) return;
              onConfirm?.(alvo);
              setAlvo("");
            }}
            style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
          >
            Gastar Reação: aliado permanece de pé (1/cena)
          </button>
        </div>
      )}
    </div>
  );
}

function OndaSolidariaWidget({
  allies,
  ultimoEfeito,
  onExtend,
}: {
  allies: { id: string; nome: string }[];
  ultimoEfeito: { targetCharacterId: string; targetNome: string } | null;
  onExtend?: (secondAllyId: string) => void;
}) {
  const [alvo, setAlvo] = useState("");
  if (!ultimoEfeito) {
    return (
      <div data-testid="onda-solidaria-widget" style={widgetBox}>
        <span style={{ opacity: 0.7 }}>Use um item de cura/reforço em um aliado primeiro — Onda Solidária estende esse efeito para um segundo aliado adjacente.</span>
      </div>
    );
  }
  const outrosAliados = allies.filter((a) => a.id !== ultimoEfeito.targetCharacterId);
  return (
    <div data-testid="onda-solidaria-widget" style={widgetBox}>
      {outrosAliados.length === 0 ? (
        <span style={{ opacity: 0.7 }}>Nenhum outro aliado ativo na mesa para estender o efeito em {ultimoEfeito.targetNome}.</span>
      ) : (
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select data-testid="onda-solidaria-alvo" value={alvo} onChange={(e) => setAlvo(e.target.value)} style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}>
            <option value="">— segundo aliado adjacente —</option>
            {outrosAliados.map((a) => (
              <option key={a.id} value={a.id}>{a.nome}</option>
            ))}
          </select>
          <button
            data-testid="onda-solidaria-estender"
            disabled={!alvo}
            onClick={() => {
              if (!alvo) return;
              onExtend?.(alvo);
              setAlvo("");
            }}
            style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
          >
            Estender efeito de {ultimoEfeito.targetNome} (confirma faz sentido na ficção)
          </button>
        </div>
      )}
    </div>
  );
}

function ChamaRedobradaWidget({
  status,
  ultimoEfeito,
  onConfirm,
}: {
  status: { acquired: boolean; usedThisScene: boolean };
  ultimoEfeito: { targetCharacterId: string; targetNome: string } | null;
  onConfirm?: (opcao: "numerico" | "duracao") => void;
}) {
  return (
    <div data-testid="chama-redobrada-widget" style={widgetBox}>
      {status.usedThisScene ? (
        <span style={{ opacity: 0.7 }}>Chama Redobrada já usada nesta cena.</span>
      ) : !ultimoEfeito ? (
        <span style={{ opacity: 0.7 }}>Use um item de cura/reforço em um aliado primeiro — Chama Redobrada dobra esse efeito.</span>
      ) : (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, opacity: 0.7 }}>Dobrar efeito em {ultimoEfeito.targetNome}:</span>
          <button data-testid="chama-redobrada-numerico" onClick={() => onConfirm?.("numerico")} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
            Dobrar valor numérico
          </button>
          <button data-testid="chama-redobrada-duracao" onClick={() => onConfirm?.("duracao")} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
            Dobrar duração
          </button>
        </div>
      )}
    </div>
  );
}

function EspetaculoMortalWidget({
  status,
  armasDisponiveis,
  onConfirm,
}: {
  status: { acquired: boolean; usedThisScene: boolean; armasNecessarias: number };
  armasDisponiveis: { id: string; nome: string }[];
  onConfirm?: (selectedInstanceIds: string[], opcao: "convergencia" | "dispersao") => void;
}) {
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [opcao, setOpcao] = useState<"convergencia" | "dispersao">("convergencia");

  if (status.usedThisScene) {
    return (
      <div data-testid="espetaculo-mortal-widget" style={widgetBox}>
        <span style={{ opacity: 0.7 }}>Espetáculo Mortal já usado nesta cena.</span>
      </div>
    );
  }
  if (armasDisponiveis.length < status.armasNecessarias) {
    return (
      <div data-testid="espetaculo-mortal-widget" style={widgetBox}>
        <span style={{ opacity: 0.7 }}>
          Requer {status.armasNecessarias} armas leves de Arremesso disponíveis (tem {armasDisponiveis.length}).
        </span>
      </div>
    );
  }
  return (
    <div data-testid="espetaculo-mortal-widget" style={widgetBox}>
      <span style={{ fontSize: 11, opacity: 0.7 }}>Escolha {status.armasNecessarias} armas leves de Arremesso:</span>
      <select
        multiple
        data-testid="espetaculo-mortal-armas"
        value={selecionadas}
        onChange={(e) => setSelecionadas(Array.from(e.target.selectedOptions, (o) => o.value).slice(0, status.armasNecessarias))}
        style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12, minHeight: 70, marginTop: 4 }}
      >
        {armasDisponiveis.map((a) => (
          <option key={a.id} value={a.id}>{a.nome}</option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
        <select
          data-testid="espetaculo-mortal-opcao"
          value={opcao}
          onChange={(e) => setOpcao(e.target.value as "convergencia" | "dispersao")}
          style={{ background: "#0f1014", color: "inherit", border: "1px solid #333", borderRadius: 4, padding: "4px 6px", fontSize: 12 }}
        >
          <option value="convergencia">Convergência (1 alvo, dano das 3 armas)</option>
          <option value="dispersao">Dispersão (até 3 alvos, 1 arremesso cada)</option>
        </select>
        <button
          data-testid="espetaculo-mortal-confirmar"
          disabled={selecionadas.length !== status.armasNecessarias}
          onClick={() => {
            onConfirm?.(selecionadas, opcao);
            setSelecionadas([]);
          }}
          style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}
        >
          Ativar sequência (consome as armas, 1/cena)
        </button>
      </div>
    </div>
  );
}

const PAGAMENTO_LABEL: Record<string, string> = {
  favores: "Favor",
  promessas: "Promessa",
  pagamento_simbolico: "Pagamento simbólico",
};

function RedeDeFavoresWidget({
  ativa,
  status,
  onRegister,
  onEnd,
}: {
  ativa: Character["rede_de_favores_ativa"] | null;
  status: { acquired: boolean; usedThisSession: boolean; opcoesPagamento: string[] };
  onRegister?: (params: { nomePn: string; papel: string; tipoPagamento: "favor" | "promessa" | "pagamento_simbolico"; duracao: string; notas: string }) => void;
  onEnd?: () => void;
}) {
  const [nomePn, setNomePn] = useState("");
  const [papel, setPapel] = useState("");
  const [tipoPagamento, setTipoPagamento] = useState<"favor" | "promessa" | "pagamento_simbolico">("favor");
  const [duracao, setDuracao] = useState("");
  const [notas, setNotas] = useState("");

  if (ativa?.ativo) {
    return (
      <div data-testid="rede-de-favores-ativa" style={widgetBox}>
        <span style={{ color: "#4caf50" }}>✦ Aliado recrutado</span> — {ativa.nomePn} ({ativa.papel}), pago com {PAGAMENTO_LABEL[ativa.tipoPagamento] ?? ativa.tipoPagamento}
        {ativa.duracao ? ` (duração: ${ativa.duracao})` : ""}
        {ativa.notas ? ` — ${ativa.notas}` : ""}
        <button data-testid="rede-de-favores-encerrar" onClick={onEnd} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}>
          Encerrar vínculo
        </button>
      </div>
    );
  }
  if (status.usedThisSession) {
    return (
      <div data-testid="rede-de-favores-indisponivel" style={{ ...widgetBox, opacity: 0.6 }}>
        Rede de Favores já usada nesta sessão — o uso não é reembolsado ao encerrar (reset manual do narrador na próxima sessão).
      </div>
    );
  }
  return (
    <div data-testid="rede-de-favores-formulario" style={widgetBox}>
      <span style={{ opacity: 0.7 }}>1/sessão · recruta um PN como aliado temporário:</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input data-testid="rede-de-favores-nome" placeholder="nome do PN" value={nomePn} onChange={(e) => setNomePn(e.target.value)} style={{ ...widgetInput, width: 130 }} />
        <input data-testid="rede-de-favores-papel" placeholder="papel/função" value={papel} onChange={(e) => setPapel(e.target.value)} style={{ ...widgetInput, width: 130 }} />
        <select data-testid="rede-de-favores-pagamento" value={tipoPagamento} onChange={(e) => setTipoPagamento(e.target.value as typeof tipoPagamento)} style={widgetInput}>
          <option value="favor">Favor</option>
          <option value="promessa">Promessa</option>
          <option value="pagamento_simbolico">Pagamento simbólico</option>
        </select>
        <input data-testid="rede-de-favores-duracao" placeholder="duração (opcional)" value={duracao} onChange={(e) => setDuracao(e.target.value)} style={{ ...widgetInput, width: 110 }} />
        <input data-testid="rede-de-favores-notas" placeholder="notas" value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...widgetInput, width: 160 }} />
        <button
          data-testid="rede-de-favores-registrar"
          disabled={!nomePn.trim() || !papel.trim()}
          onClick={() => onRegister?.({ nomePn: nomePn.trim(), papel: papel.trim(), tipoPagamento, duracao, notas })}
          style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: !nomePn.trim() || !papel.trim() ? 0.5 : 1 }}
        >
          Recrutar aliado
        </button>
      </div>
    </div>
  );
}

const ZE_DA_ESQUINA_OPCAO_LABEL: Record<string, string> = {
  informacao: "Informação",
  abrigo: "Abrigo",
  recurso_imediato: "Recurso imediato",
};

function ZeDaEsquinaWidget({
  status,
  registros,
  onRegister,
}: {
  status: { acquired: boolean; usedThisMission: boolean; opcoes: string[] };
  registros: NonNullable<Character["ze_da_esquina_registros"]>;
  onRegister?: (params: { contato: string; tipo: "informacao" | "abrigo" | "recurso_imediato"; complicacaoResolvida: string; notas: string }) => void;
}) {
  const [contato, setContato] = useState("");
  const [tipo, setTipo] = useState<"informacao" | "abrigo" | "recurso_imediato">("informacao");
  const [complicacaoResolvida, setComplicacaoResolvida] = useState("");
  const [notas, setNotas] = useState("");
  const ultimo = registros[registros.length - 1];

  return (
    <div data-testid="ze-da-esquina-widget" style={widgetBox}>
      {ultimo && (
        <span style={{ opacity: 0.7 }}>
          Último contato: {ultimo.contato} ({ZE_DA_ESQUINA_OPCAO_LABEL[ultimo.tipo] ?? ultimo.tipo}) — resolveu: {ultimo.complicacaoResolvida}
        </span>
      )}
      {status.usedThisMission ? (
        <span style={{ opacity: 0.6 }}>Zé da Esquina já usado nesta missão (reset manual do narrador na próxima missão).</span>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input data-testid="ze-da-esquina-contato" placeholder="nome do contato" value={contato} onChange={(e) => setContato(e.target.value)} style={{ ...widgetInput, width: 130 }} />
          <select data-testid="ze-da-esquina-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} style={widgetInput}>
            {(status.opcoes.length > 0 ? status.opcoes : ["informacao", "abrigo", "recurso_imediato"]).map((o) => (
              <option key={o} value={o}>{ZE_DA_ESQUINA_OPCAO_LABEL[o] ?? o}</option>
            ))}
          </select>
          <input data-testid="ze-da-esquina-complicacao" placeholder="complicação menor resolvida" value={complicacaoResolvida} onChange={(e) => setComplicacaoResolvida(e.target.value)} style={{ ...widgetInput, width: 160 }} />
          <input data-testid="ze-da-esquina-notas" placeholder="notas" value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...widgetInput, width: 130 }} />
          <button
            data-testid="ze-da-esquina-invocar"
            disabled={!contato.trim() || !complicacaoResolvida.trim()}
            onClick={() => {
              onRegister?.({ contato: contato.trim(), tipo, complicacaoResolvida: complicacaoResolvida.trim(), notas });
              setContato("");
              setComplicacaoResolvida("");
              setNotas("");
            }}
            style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: !contato.trim() || !complicacaoResolvida.trim() ? 0.5 : 1 }}
          >
            Invocar contato
          </button>
        </div>
      )}
    </div>
  );
}

function GatoDeTelhadoWidget({
  ativa,
  status,
  onRegister,
  onEnd,
}: {
  ativa: Character["gato_de_telhado_ativo"] | null;
  status: { acquired: boolean; usedToday: boolean };
  onRegister?: (params: { local: string; personagensProtegidos: string[] }) => void;
  onEnd?: () => void;
}) {
  const [local, setLocal] = useState("");
  const [personagens, setPersonagens] = useState("");

  if (ativa?.ativo) {
    return (
      <div data-testid="gato-de-telhado-ativo" style={widgetBox}>
        <span style={{ color: "#4caf50" }}>✦ Local seguro ativo</span> — {ativa.local}
        {ativa.personagensProtegidos.length > 0 ? ` (protegendo: ${ativa.personagensProtegidos.join(", ")})` : ""} — inimigos não rastreiam sem pista direta.
        <button data-testid="gato-de-telhado-encerrar" onClick={onEnd} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}>
          Deixar o local
        </button>
      </div>
    );
  }
  if (status.usedToday) {
    return <div data-testid="gato-de-telhado-indisponivel" style={{ ...widgetBox, opacity: 0.6 }}>Gato de Telhado já usado hoje (reseta em Novo Dia/descanso longo).</div>;
  }
  return (
    <div data-testid="gato-de-telhado-formulario" style={widgetBox}>
      <span style={{ opacity: 0.7 }}>1/dia · ambiente urbano · conduz o grupo a um local seguro:</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input data-testid="gato-de-telhado-local" placeholder="local seguro" value={local} onChange={(e) => setLocal(e.target.value)} style={{ ...widgetInput, width: 160 }} />
        <input data-testid="gato-de-telhado-personagens" placeholder="personagens protegidos (vírgula)" value={personagens} onChange={(e) => setPersonagens(e.target.value)} style={{ ...widgetInput, width: 200 }} />
        <button
          data-testid="gato-de-telhado-conduzir"
          disabled={!local.trim()}
          onClick={() =>
            onRegister?.({
              local: local.trim(),
              personagensProtegidos: personagens.split(",").map((p) => p.trim()).filter(Boolean),
            })
          }
          style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: !local.trim() ? 0.5 : 1 }}
        >
          Conduzir ao local seguro
        </button>
      </div>
    </div>
  );
}

function SaidaDosFundosWidget({
  ativa,
  status,
  onRegister,
  onEnd,
}: {
  ativa: Character["saida_dos_fundos_ativa"] | null;
  status: { acquired: boolean; usedToday: boolean };
  onRegister?: (params: { situacaoDeRisco: string; rotaOuMetodo: string; consequenciaMenor: string }) => void;
  onEnd?: () => void;
}) {
  const [situacaoDeRisco, setSituacaoDeRisco] = useState("");
  const [rotaOuMetodo, setRotaOuMetodo] = useState("");
  const [consequenciaMenor, setConsequenciaMenor] = useState("");

  if (ativa?.ativo) {
    return (
      <div data-testid="saida-dos-fundos-ativa" style={widgetBox}>
        <span style={{ color: "#4caf50" }}>✦ Escape ativo</span> — fugiu de "{ativa.situacaoDeRisco}" via {ativa.rotaOuMetodo}; consequência: {ativa.consequenciaMenor}. Não pode ser capturado, morto ou rendido nesta cena.
        <button data-testid="saida-dos-fundos-encerrar" onClick={onEnd} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}>
          Encerrar proteção da cena
        </button>
      </div>
    );
  }
  if (status.usedToday) {
    return <div data-testid="saida-dos-fundos-indisponivel" style={{ ...widgetBox, opacity: 0.6 }}>Saída dos Fundos já usada hoje (reseta em Novo Dia/descanso longo).</div>;
  }
  return (
    <div data-testid="saida-dos-fundos-formulario" style={widgetBox}>
      <span style={{ opacity: 0.7 }}>1/dia · escapa instantaneamente de emboscada/perseguição/prisão/risco iminente:</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input data-testid="saida-dos-fundos-situacao" placeholder="situação de risco" value={situacaoDeRisco} onChange={(e) => setSituacaoDeRisco(e.target.value)} style={{ ...widgetInput, width: 160 }} />
        <input data-testid="saida-dos-fundos-rota" placeholder="rota/método de fuga" value={rotaOuMetodo} onChange={(e) => setRotaOuMetodo(e.target.value)} style={{ ...widgetInput, width: 150 }} />
        <input data-testid="saida-dos-fundos-consequencia" placeholder="consequência menor" value={consequenciaMenor} onChange={(e) => setConsequenciaMenor(e.target.value)} style={{ ...widgetInput, width: 150 }} />
        <button
          data-testid="saida-dos-fundos-escapar"
          disabled={!situacaoDeRisco.trim() || !rotaOuMetodo.trim()}
          onClick={() => onRegister?.({ situacaoDeRisco: situacaoDeRisco.trim(), rotaOuMetodo: rotaOuMetodo.trim(), consequenciaMenor: consequenciaMenor.trim() })}
          style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: !situacaoDeRisco.trim() || !rotaOuMetodo.trim() ? 0.5 : 1 }}
        >
          Escapar agora
        </button>
      </div>
    </div>
  );
}

type DroneInstance = NonNullable<Character["drones"]>[number];

function DroneRosterWidget({
  drones,
  sinalLimpoStatus,
  onRegisterDrone,
  onRemoveDrone,
  onActivateDrone,
  onDeactivateDrone,
  onApplySinalLimpoBonus,
}: {
  drones: DroneInstance[];
  sinalLimpoStatus: { acquired: boolean; usedThisScene: boolean };
  onRegisterDrone?: (params: { nome: string; modelo: string; paMaximo: number; acoes: string }) => void;
  onRemoveDrone?: (droneId: string) => void;
  onActivateDrone?: (droneId: string) => void;
  onDeactivateDrone?: (droneId: string) => void;
  onApplySinalLimpoBonus?: (droneId: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [modelo, setModelo] = useState("");
  const [paMaximo, setPaMaximo] = useState(3);
  const [acoes, setAcoes] = useState("");
  const [droneBonus, setDroneBonus] = useState("");

  const ativos = drones.filter((d) => d.estado === "ativo");

  return (
    <div data-testid="drone-roster-widget" style={widgetBox}>
      <span style={{ opacity: 0.7 }}>
        Drones sob comando (registro manual — sem catálogo estruturado de drones no conteúdo; use a ficha do modelo em "Drones e Robôs" para PA/ações):
      </span>
      {drones.length === 0 && <span style={{ opacity: 0.5 }}>Nenhum drone registrado.</span>}
      {drones.map((d) => (
        <div key={d.id} data-testid={`drone-${d.id}`} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: d.estado === "ativo" ? "#4caf50" : undefined }}>
            {d.nome} ({d.modelo}) — {d.estado} — PA {d.paAtual}/{d.paMaximo}
            {d.pareamento ? ` — pareado (${d.pareamento.modo})` : ""}
          </span>
          {d.estado === "ativo" ? (
            <button data-testid={`drone-desativar-${d.id}`} onClick={() => onDeactivateDrone?.(d.id)} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
              Desativar
            </button>
          ) : (
            <button data-testid={`drone-ativar-${d.id}`} onClick={() => onActivateDrone?.(d.id)} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
              Assumir controle
            </button>
          )}
          <button data-testid={`drone-remover-${d.id}`} onClick={() => onRemoveDrone?.(d.id)} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
            Remover
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input data-testid="drone-nome" placeholder="nome do drone" value={nome} onChange={(e) => setNome(e.target.value)} style={{ ...widgetInput, width: 110 }} />
        <input data-testid="drone-modelo" placeholder="modelo (ex.: Mosca)" value={modelo} onChange={(e) => setModelo(e.target.value)} style={{ ...widgetInput, width: 110 }} />
        <input data-testid="drone-pa-maximo" type="number" min={1} placeholder="PA máx." value={paMaximo} onChange={(e) => setPaMaximo(Math.max(1, Number(e.target.value)))} style={{ ...widgetInput, width: 70 }} />
        <input data-testid="drone-acoes" placeholder="ações (texto livre)" value={acoes} onChange={(e) => setAcoes(e.target.value)} style={{ ...widgetInput, width: 160 }} />
        <button
          data-testid="drone-registrar"
          disabled={!nome.trim() || !modelo.trim()}
          onClick={() => {
            onRegisterDrone?.({ nome: nome.trim(), modelo: modelo.trim(), paMaximo, acoes });
            setNome("");
            setModelo("");
            setAcoes("");
          }}
          style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: !nome.trim() || !modelo.trim() ? 0.5 : 1 }}
        >
          Registrar drone
        </button>
      </div>
      {sinalLimpoStatus.acquired && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, borderTop: "1px solid #333", paddingTop: 4 }}>
          {sinalLimpoStatus.usedThisScene ? (
            <span style={{ opacity: 0.6 }}>Sinal Limpo já usado nesta cena (+1 PA).</span>
          ) : ativos.length === 0 ? (
            <span style={{ opacity: 0.6 }}>Sinal Limpo: assuma o controle de um drone para conceder +1 PA nesta rodada.</span>
          ) : (
            <>
              <select data-testid="sinal-limpo-drone-select" value={droneBonus} onChange={(e) => setDroneBonus(e.target.value)} style={widgetInput}>
                <option value="">Escolha um drone ativo</option>
                {ativos.map((d) => (
                  <option key={d.id} value={d.id}>{d.nome}</option>
                ))}
              </select>
              <button
                data-testid="sinal-limpo-aplicar"
                disabled={!droneBonus}
                onClick={() => {
                  onApplySinalLimpoBonus?.(droneBonus);
                  setDroneBonus("");
                }}
                style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: !droneBonus ? 0.5 : 1 }}
              >
                Sinal Limpo: +1 PA nesta rodada (1/cena)
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ScriptWidget({
  drones,
  onSetGatilho,
  onMarkOcorrido,
}: {
  drones: DroneInstance[];
  onSetGatilho?: (droneId: string, descricao: string, acaoAssociada: string) => void;
  onMarkOcorrido?: (droneId: string) => void;
}) {
  const [descricao, setDescricao] = useState<Record<string, string>>({});
  const [acao, setAcao] = useState<Record<string, string>>({});
  const pendentesDeGatilho = drones.filter((d) => d.ativadoNestaCena && !d.gatilho);
  const comGatilho = drones.filter((d) => d.gatilho);

  if (pendentesDeGatilho.length === 0 && comGatilho.length === 0) {
    return <div data-testid="script-widget" style={{ ...widgetBox, opacity: 0.6 }}>Assuma o controle de um drone nesta cena para definir um gatilho.</div>;
  }

  return (
    <div data-testid="script-widget" style={widgetBox}>
      <span style={{ opacity: 0.7 }}>Gatilho simples: o drone executa a ação automaticamente na próxima ocorrência, sem custo de PA.</span>
      {pendentesDeGatilho.map((d) => (
        <div key={d.id} data-testid={`script-form-${d.id}`} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span>{d.nome}:</span>
          <input data-testid={`script-gatilho-${d.id}`} placeholder="gatilho (ex.: detectar movimento)" value={descricao[d.id] ?? ""} onChange={(e) => setDescricao((p) => ({ ...p, [d.id]: e.target.value }))} style={{ ...widgetInput, width: 160 }} />
          <input data-testid={`script-acao-${d.id}`} placeholder="ação associada" value={acao[d.id] ?? ""} onChange={(e) => setAcao((p) => ({ ...p, [d.id]: e.target.value }))} style={{ ...widgetInput, width: 130 }} />
          <button
            data-testid={`script-definir-${d.id}`}
            disabled={!descricao[d.id]?.trim() || !acao[d.id]?.trim()}
            onClick={() => onSetGatilho?.(d.id, descricao[d.id]!.trim(), acao[d.id]!.trim())}
            style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: !descricao[d.id]?.trim() || !acao[d.id]?.trim() ? 0.5 : 1 }}
          >
            Definir gatilho
          </button>
        </div>
      ))}
      {comGatilho.map((d) => (
        <div key={d.id} data-testid={`script-ativo-${d.id}`} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ color: d.gatilho!.ocorrido ? undefined : "#4caf50", opacity: d.gatilho!.ocorrido ? 0.6 : 1 }}>
            {d.nome}: "{d.gatilho!.descricao}" → {d.gatilho!.acaoAssociada}{d.gatilho!.ocorrido ? " (já ocorreu)" : ""}
          </span>
          {!d.gatilho!.ocorrido && (
            <button data-testid={`script-ocorrido-${d.id}`} onClick={() => onMarkOcorrido?.(d.id)} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
              Gatilho ocorreu — executar
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function EnxameWidget({
  drones,
  status,
  onPair,
  onUnpair,
}: {
  drones: DroneInstance[];
  status: { acquired: boolean; usedToday: boolean; maxUnidades: number };
  onPair?: (droneIds: string[], modo: "pareada" | "independente") => void;
  onUnpair?: (grupoId: string) => void;
}) {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [modo, setModo] = useState<"pareada" | "independente">("pareada");
  const pareamentos = new Map<string, DroneInstance[]>();
  for (const d of drones) {
    if (!d.pareamento) continue;
    const grupo = pareamentos.get(d.pareamento.grupoId) ?? [];
    grupo.push(d);
    pareamentos.set(d.pareamento.grupoId, grupo);
  }

  return (
    <div data-testid="enxame-widget" style={widgetBox}>
      {[...pareamentos.entries()].map(([grupoId, membros]) => (
        <div key={grupoId} data-testid={`enxame-grupo-${grupoId}`} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ color: "#4caf50" }}>✦ Pareados ({membros[0].pareamento!.modo})</span> — {membros.map((m) => m.nome).join(", ")}
          <button data-testid={`enxame-desfazer-${grupoId}`} onClick={() => onUnpair?.(grupoId)} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px" }}>
            Desfazer
          </button>
        </div>
      ))}
      {status.usedToday ? (
        <span style={{ opacity: 0.6 }}>Enxame já usado hoje (reseta em Novo Dia/descanso longo).</span>
      ) : (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ opacity: 0.7 }}>Escolha até {status.maxUnidades} drones de MESMO modelo:</span>
          <select
            multiple
            data-testid="enxame-drones"
            value={selecionados}
            onChange={(e) => setSelecionados(Array.from(e.target.selectedOptions, (o) => o.value).slice(0, status.maxUnidades))}
            style={{ ...widgetInput, minHeight: 60 }}
          >
            {drones.map((d) => (
              <option key={d.id} value={d.id}>{d.nome} ({d.modelo})</option>
            ))}
          </select>
          <select data-testid="enxame-modo" value={modo} onChange={(e) => setModo(e.target.value as typeof modo)} style={widgetInput}>
            <option value="pareada">Pareada (ação simultânea, sem PA extra)</option>
            <option value="independente">Independente (ações separadas, PA normal)</option>
          </select>
          <button
            data-testid="enxame-parear"
            disabled={selecionados.length < 2}
            onClick={() => {
              onPair?.(selecionados, modo);
              setSelecionados([]);
            }}
            style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: selecionados.length < 2 ? 0.5 : 1 }}
          >
            Parear
          </button>
        </div>
      )}
    </div>
  );
}

interface GambiarraAtiva {
  id: string;
  alvo: "estrutura" | "equipamento" | "automato";
  materialBase: string;
  criacaoOuModificacao: "criacao" | "modificacao";
  efeitoObtido: string;
  duracao: string;
  observacoes?: string;
}

function GambiarraWidget({
  ativa,
  available,
  onRegister,
  onEnd,
}: {
  ativa: GambiarraAtiva | null;
  available: boolean;
  onRegister?: (params: { alvo: "estrutura" | "equipamento" | "automato"; materialBase: string; criacaoOuModificacao: "criacao" | "modificacao"; efeitoObtido: string; duracao: string; observacoes?: string }) => void;
  onEnd?: () => void;
}) {
  const [alvo, setAlvo] = useState<"estrutura" | "equipamento" | "automato">("equipamento");
  const [materialBase, setMaterialBase] = useState("");
  const [criacaoOuModificacao, setCriacaoOuModificacao] = useState<"criacao" | "modificacao">("modificacao");
  const [efeitoObtido, setEfeitoObtido] = useState("");
  const [duracao, setDuracao] = useState("");
  const [observacoes, setObservacoes] = useState("");

  if (ativa) {
    return (
      <div data-testid="gambiarra-ativa" style={widgetBox}>
        <span style={{ color: "#4caf50" }}>✦ Gambiarra ativa</span> — {ativa.criacaoOuModificacao === "criacao" ? "criou" : "modificou"} {ativa.alvo} com {ativa.materialBase}: {ativa.efeitoObtido}
        {ativa.duracao ? ` (duração: ${ativa.duracao})` : ""}
        {ativa.observacoes ? ` — ${ativa.observacoes}` : ""}
        <button data-testid="gambiarra-encerrar" onClick={onEnd} style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", alignSelf: "flex-start" }}>
          Encerrar
        </button>
      </div>
    );
  }
  if (!available) {
    return <div data-testid="gambiarra-indisponivel" style={{ ...widgetBox, opacity: 0.6 }}>Sem usos restantes nesta sessão — reset manual do narrador quando a sessão renovar.</div>;
  }
  return (
    <div data-testid="gambiarra-formulario" style={widgetBox}>
      <span style={{ opacity: 0.7 }}>1/sessão · 5 minutos · sem teste estendido:</span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <select data-testid="gambiarra-alvo" value={alvo} onChange={(e) => setAlvo(e.target.value as typeof alvo)} style={widgetInput}>
          <option value="estrutura">Estrutura</option>
          <option value="equipamento">Equipamento</option>
          <option value="automato">Autômato</option>
        </select>
        <select data-testid="gambiarra-tipo" value={criacaoOuModificacao} onChange={(e) => setCriacaoOuModificacao(e.target.value as typeof criacaoOuModificacao)} style={widgetInput}>
          <option value="criacao">Criação</option>
          <option value="modificacao">Modificação</option>
        </select>
        <input data-testid="gambiarra-material" placeholder="material de base" value={materialBase} onChange={(e) => setMaterialBase(e.target.value)} style={{ ...widgetInput, width: 130 }} />
        <input data-testid="gambiarra-efeito" placeholder="efeito obtido" value={efeitoObtido} onChange={(e) => setEfeitoObtido(e.target.value)} style={{ ...widgetInput, width: 160 }} />
        <input data-testid="gambiarra-duracao" placeholder="duração (opcional)" value={duracao} onChange={(e) => setDuracao(e.target.value)} style={{ ...widgetInput, width: 110 }} />
        <input data-testid="gambiarra-observacoes" placeholder="observações do narrador" value={observacoes} onChange={(e) => setObservacoes(e.target.value)} style={{ ...widgetInput, width: 160 }} />
        <button
          data-testid="gambiarra-registrar"
          disabled={!materialBase.trim() || !efeitoObtido.trim()}
          onClick={() => onRegister?.({ alvo, materialBase, criacaoOuModificacao, efeitoObtido, duracao, observacoes: observacoes || undefined })}
          style={{ ...buttonStyle, fontSize: 10, padding: "2px 8px", opacity: !materialBase.trim() || !efeitoObtido.trim() ? 0.5 : 1 }}
        >
          Criar gambiarra
        </button>
      </div>
    </div>
  );
}
