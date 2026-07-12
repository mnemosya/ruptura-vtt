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

                        {acquiredEntry && nivel.slug === "totem_bencao" && totemBencaoTokenStatus?.acquired && (
                          <TotemBencaoWidget status={totemBencaoTokenStatus} allies={bencaoAllies} onGrant={onGrantBencaoToken} />
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
