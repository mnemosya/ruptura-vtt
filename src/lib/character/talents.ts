/**
 * Talentos: automação por padrão — checkpoint v0.48 (PRD 12).
 *
 * O catálogo inteiro de talentos (22 talentos publicados, ~60 níveis,
 * PRD 12.2) NUNCA é listado manualmente aqui — vem de
 * `content_documents` (content_type="talent", `listTalents()`,
 * `db_talentos_normalizado_v1_3.json`). Este módulo só interpreta,
 * genericamente, o ÚNICO padrão reutilizável (PRD 12.1) seguro de
 * automatizar sem inventar regra: "+X em testes específicos"
 * (`payload_automacao.efeitos[].tipo === "modificador"`, com
 * `alvo_tags`) — mesmo mecanismo de `ActiveEffect` já usado por
 * condições (v0.33) e defesa sem Reação (v0.43), plugado direto no
 * mesmo prompt de rolagem (`RollsTab`), sem duplicar infraestrutura.
 *
 * Os outros 13 padrões do PRD 12.1 (promoção de margem, piso/override,
 * dado extra com gatilho, buff empilhável, reação grátis, redução de
 * PA, aplicar condição em margem menor, contadores por cadência,
 * companheiro, trama, economia/loja, runas, troca de atributo) NÃO são
 * automatizados aqui — são narrativamente variados demais para uma
 * regra genérica seguro sem inventar mecânica; ficam como
 * `pendingEffects` textuais (mesmo critério de `actionConsole.ts`) e
 * documentados no relatório.
 */

import type { ActiveEffect } from "./activeEffects";
import { addTemporaryEffect, getActiveTemporaryEffects, removeTemporaryEffect } from "./temporaryEffects";
import type { Character, TemporaryEffect, TemporaryEffectModifier } from "./types";

/** Gera um uuid — injetável para testes; talents.ts é chamado só no cliente onde crypto.randomUUID existe (mesmo padrão de acquireTalentLevel). */
function defaultIdFactory(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------
// Conteúdo bruto (subconjunto lido de content_documents.payload)
// ---------------------------------------------------------------------

export interface TalentLevelEffect {
  familia?: string;
  tipo: string;
  [key: string]: unknown;
}

export interface TalentLevelContent {
  id: string;
  slug: string;
  talentoId: string;
  nivel: number;
  nome: string;
  descricao_curta?: string;
  payload_automacao?: unknown;
  requisitos?: unknown;
}

export interface TalentContent {
  id: string;
  slug: string;
  nome: string;
  descricao_curta?: string;
  niveis: TalentLevelContent[];
  status: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Preserva o payload inteiro do registro — não achata nem descarta campos. */
export function normalizeTalentContent(raw: Record<string, unknown>): TalentContent {
  const niveisRaw = Array.isArray(raw.niveis) ? (raw.niveis as Record<string, unknown>[]) : [];
  const niveis: TalentLevelContent[] = niveisRaw.map((nivel) => ({
    id: String(nivel.id ?? nivel.slug ?? ""),
    slug: String(nivel.slug ?? nivel.id ?? ""),
    talentoId: String(nivel.talento_id ?? raw.id ?? ""),
    nivel: typeof nivel.nivel === "number" ? nivel.nivel : 0,
    nome: String(nivel.nome ?? nivel.slug ?? "Nível"),
    descricao_curta: typeof nivel.descricao_curta === "string" ? nivel.descricao_curta : undefined,
    payload_automacao: nivel.payload_automacao,
    requisitos: nivel.requisitos,
  }));
  return {
    id: String(raw.id ?? raw.slug ?? ""),
    slug: String(raw.slug ?? raw.id ?? ""),
    nome: String(raw.nome ?? raw.slug ?? "Talento"),
    descricao_curta: typeof raw.descricao_curta === "string" ? raw.descricao_curta : undefined,
    niveis,
    status: String(raw.status ?? "published"),
  };
}

export function getTalentLevelEffects(nivel: TalentLevelContent): TalentLevelEffect[] {
  const payload = asRecord(nivel.payload_automacao);
  const efeitos = payload?.efeitos;
  return Array.isArray(efeitos) ? (efeitos as TalentLevelEffect[]) : [];
}

// ---------------------------------------------------------------------
// Talentos adquiridos pelo personagem — registro simples, um item por
// NÍVEL adquirido (não assume progressão contígua automática; a UI
// sugere adquirir em ordem, mas não bloqueia — mesmo espírito de
// "nunca travar a UI" já usado em condições/Ruptura).
// ---------------------------------------------------------------------

export interface AcquiredTalentLevel {
  id: string;
  talentoId: string;
  nivelId: string;
  nivel: number;
  adquiridoEm: string;
}

export function acquireTalentLevel(
  character: Character,
  params: { talentoId: string; nivelId: string; nivel: number; nowIso: string },
): Character {
  const atuais = character.talentos_adquiridos ?? [];
  if (atuais.some((t) => t.nivelId === params.nivelId)) return character; // já adquirido — sem duplicar.
  const novo: AcquiredTalentLevel = {
    id: crypto.randomUUID(),
    talentoId: params.talentoId,
    nivelId: params.nivelId,
    nivel: params.nivel,
    adquiridoEm: params.nowIso,
  };
  return { ...character, talentos_adquiridos: [...atuais, novo] };
}

export function removeTalentLevel(character: Character, acquiredId: string): Character {
  const atuais = character.talentos_adquiridos ?? [];
  const next = atuais.filter((t) => t.id !== acquiredId);
  if (next.length === atuais.length) return character;
  return { ...character, talentos_adquiridos: next };
}

// ---------------------------------------------------------------------
// Efeitos ativos derivados — ÚNICO padrão automatizado: "+X em testes
// específicos" (`tipo: "modificador"`, com `alvo_tags`/`valor`).
// ---------------------------------------------------------------------

/**
 * Deriva os `ActiveEffect` dos talentos ADQUIRIDOS (mesmo formato de
 * `deriveActiveEffectsFromConditions`, plugável no mesmo prompt de
 * rolagem). Cobre APENAS o padrão PASSIVO permanente "+X em testes
 * específicos" (`tipo: "modificador"` com `alvo_tags`/`alvo_acoes`).
 *
 * Os TOGGLES deixaram de ser derivados aqui no checkpoint pós-v0.72:
 * ativar um toggle agora cria um `TemporaryEffect` (ver
 * `toggleTalentEffect`), cujo modificador de rolagem entra no MESMO
 * pipeline via `deriveActiveEffectsFromTemporaryEffects` — mantê-los
 * também aqui somaria o bônus DUAS vezes. Efeitos cujo `tipo` não é
 * `"modificador"` continuam ignorados (texto manual na aba Talentos).
 */
export function deriveActiveEffectsFromTalents(
  character: Pick<Character, "talentos_adquiridos">,
  talents: TalentContent[],
): ActiveEffect[] {
  const acquiredByLevelId = new Map((character.talentos_adquiridos ?? []).map((t) => [t.nivelId, t]));
  const effects: ActiveEffect[] = [];

  for (const talent of talents) {
    if (talent.status !== "published") continue;
    for (const nivel of talent.niveis) {
      const acquired = acquiredByLevelId.get(nivel.id);
      if (!acquired) continue;

      const efeitosDoNivel = getTalentLevelEffects(nivel);
      // Achado: níveis que declaram `detectar_falha_sem_teste` (ex.: Bricolagem)
      // têm um `modificador` IRMÃO que só vale no PRÓXIMO teste relacionado à
      // falha identificada — nunca "sempre ligado". Excluído do pipeline
      // incondicional aqui; vira efeito consumível/escopado em `talentEngine.ts`
      // (`getBricolagemActiveEffects`), com tag sintética própria.
      const temFalhaCondicional = efeitosDoNivel.some((e) => e.tipo === "detectar_falha_sem_teste");
      efeitosDoNivel.forEach((efeito, index) => {
        // Toggles são tratados via efeito temporário (não aqui) — evita
        // dupla contagem do mesmo modificador.
        if (efeito.tipo === "toggle_condicional") return;
        if (efeito.tipo !== "modificador") return;
        if (temFalhaCondicional) return;
        const valor = efeito.valor;
        // Achado de auditoria do DB real (`db_talentos_normalizado_v1_3.json`):
        // a maioria dos efeitos "modificador" usa `alvo_acoes` (slug de
        // ação, ex.: "bloquear"), não `alvo_tags` — tratados aqui como a
        // MESMA lista de alvos (ambos são só "o que este modificador
        // afeta"), já que `RollsTab`/`ActionsTab` já usam slugs de ação
        // e tags de perícia intercambiavelmente como `affectedTags`.
        const alvoTags = [
          ...(Array.isArray(efeito.alvo_tags) ? efeito.alvo_tags : []),
          ...(Array.isArray(efeito.alvo_acoes) ? efeito.alvo_acoes : []),
        ].filter((t): t is string => typeof t === "string");
        if (typeof valor !== "number" || alvoTags.length === 0) return;

        const alvoTexto = typeof efeito.alvo_texto === "string" ? efeito.alvo_texto : alvoTags.join(", ");
        effects.push({
          id: `talent:${acquired.id}:${index}`,
          sourceType: "talent",
          sourceId: nivel.id,
          sourceName: `${talent.nome} — ${nivel.nome}`,
          affectedTags: alvoTags,
          modifier: valor,
          explanation: `${talent.nome} (${nivel.nome}): ${valor >= 0 ? "+" : ""}${valor} em ${alvoTexto}.`,
          enabledByDefault: true,
          kind: "modifier",
          reversible: true,
        });
      });
    }
  }

  return effects;
}

/** Texto/rótulo dos efeitos de um nível que NÃO são o padrão automatizado — para exibição manual (nunca JSON cru). */
export function describeNonAutomatedTalentEffects(nivel: TalentLevelContent): string[] {
  return getTalentLevelEffects(nivel)
    .filter((efeito) => efeito.tipo !== "modificador")
    .map((efeito) => {
      const usos = typeof efeito.usos === "number" ? efeito.usos : undefined;
      const cadencia = typeof efeito.cadencia === "string" ? efeito.cadencia : undefined;
      const cadenciaTexto = usos != null && cadencia ? ` (${usos}/${cadencia})` : "";
      return `${efeito.tipo}${cadenciaTexto} — resolução manual`;
    });
}

// ---------------------------------------------------------------------
// Segunda camada (checkpoint pós-v0.63): talentos ATIVOS usáveis.
//
// Dois padrões inequívocos, ambos 100% data-driven:
//   1. `usos` + `cadencia` no efeito → recurso limitado rastreável.
//      Usar = gastar 1 uso (+ PA se `custo_pa` numérico > 0), logar
//      `talent_used` com a descrição TEXTUAL do payload e lembretes —
//      o EFEITO em si continua manual (nunca inventado).
//   2. `tipo: "toggle_condicional"` → estado ligado/desligado; enquanto
//      ligado, os itens de `beneficios`/`penalidades` que são
//      `modificador` estruturado viram ActiveEffect (mesmo mecanismo da
//      camada 1); o restante vira lembrete.
// Reset de cadência: "rodada" no Encerrar Rodada da ficha, "cena" no
// Encerrar Cena da mesa, "dia" no descanso longo (mesmo precedente de
// `sobrecarga_usada_dia`). Outras cadências (combate, sessão, missão,
// sessao_malha) só têm reset manual — sem gatilho canônico no app.
// ---------------------------------------------------------------------

/** Chave estável de um efeito de talento no estado do personagem. */
export function getTalentEffectKey(nivelId: string, efeitoIndex: number): string {
  return `${nivelId}:${efeitoIndex}`;
}

/**
 * Descrição textual genérica de um efeito de talento — composta só de
 * campos do payload (nunca inventa mecânica), legível, nunca JSON cru.
 */
export function describeTalentEffect(efeito: TalentLevelEffect): string {
  const partes: string[] = [];
  if (typeof efeito.de === "string" && typeof efeito.para === "string") partes.push(`${efeito.de} → ${efeito.para}`);
  if (typeof efeito.margem === "string") partes.push(`margem: ${efeito.margem.replace(/_/g, " ")}`);
  if (typeof efeito.condicao === "string") partes.push(`condição: ${efeito.condicao}`);
  if (typeof efeito.acao === "string") partes.push(`ação: ${efeito.acao.replace(/_/g, " ")}`);
  if (typeof efeito.valor === "number") partes.push(`valor: ${efeito.valor >= 0 ? "+" : ""}${efeito.valor}`);
  if (typeof efeito.reducao === "number") partes.push(`redução: ${efeito.reducao} PA${typeof efeito.minimo === "number" ? ` (mínimo ${efeito.minimo})` : ""}`);
  if (typeof efeito.percentual === "number") partes.push(`${efeito.percentual}%`);
  if (typeof efeito.gatilho === "string") partes.push(`gatilho: ${efeito.gatilho.replace(/_/g, " ")}`);
  if (typeof efeito.contexto === "string") partes.push(`contexto: ${efeito.contexto}`);
  if (typeof efeito.requisito === "string") partes.push(`requisito: ${efeito.requisito.replace(/_/g, " ")}`);
  if (typeof efeito.duracao === "string") partes.push(`duração: ${efeito.duracao.replace(/_/g, " ")}`);
  if (typeof efeito.custo === "string") partes.push(`custo: ${efeito.custo}`);
  if (Array.isArray(efeito.opcoes)) {
    const ids = (efeito.opcoes as unknown[])
      .map((o) => {
        const rec = asRecord(o);
        return typeof rec?.id === "string" ? rec.id : typeof o === "string" ? o : null;
      })
      .filter((x): x is string => x != null);
    if (ids.length > 0) partes.push(`opções: ${ids.map((i) => i.replace(/_/g, " ")).join(", ")}`);
  }
  const tipoLabel = efeito.tipo.replace(/_/g, " ");
  return `${tipoLabel}${partes.length > 0 ? ` (${partes.join("; ")})` : ""}`;
}

// ---------------------------------------------------------------------
// Migração para o modelo canônico de efeitos temporários (checkpoint
// pós-v0.72). SÓ padrões seguros e data-driven — nunca por nome de
// talento. Toggles e usos limitados que carregam MODIFICADOR de rolagem
// estruturado (+ duração reconhecível) passam a criar `TemporaryEffect`,
// no lugar de chips paralelos/lembretes. Modificador de rolagem
// (`alvo_tags`/`alvo_acoes`) é o ÚNICO aplicado automaticamente (vira
// ActiveEffect via `deriveActiveEffectsFromTemporaryEffects`); dano/PA/
// defesa/MIT/PD e efeitos não estruturados viram `reminders` do efeito,
// nunca somados. Duração ausente: só vira efeito "manual" para
// toggle/estado ativo; senão o chamador mantém lembrete.
// ---------------------------------------------------------------------

/** `true` se `rec` é um item de modificador de ROLAGEM estruturado (valor numérico + alvo de tags/ações). */
function isStructuredRollModifier(rec: Record<string, unknown>): boolean {
  if (rec.tipo !== "modificador" || typeof rec.valor !== "number") return false;
  const alvo = [
    ...(Array.isArray(rec.alvo_tags) ? rec.alvo_tags : []),
    ...(Array.isArray(rec.alvo_acoes) ? rec.alvo_acoes : []),
  ].filter((t): t is string => typeof t === "string");
  return alvo.length > 0;
}

function rollModifierFromItem(rec: Record<string, unknown>): TemporaryEffectModifier {
  const valor = rec.valor as number;
  const alvo = [
    ...(Array.isArray(rec.alvo_tags) ? rec.alvo_tags : []),
    ...(Array.isArray(rec.alvo_acoes) ? rec.alvo_acoes : []),
  ].filter((t): t is string => typeof t === "string");
  const alvoTexto = typeof rec.alvo_texto === "string" ? rec.alvo_texto : alvo.join(", ");
  return {
    target: "roll",
    operation: valor < 0 ? "subtract" : "add",
    value: Math.abs(valor),
    appliesTo: alvo,
    label: `${valor >= 0 ? "+" : ""}${valor} em ${alvoTexto}`,
  };
}

/**
 * Reúne, de um efeito de talento, os modificadores de rolagem
 * estruturados (aplicados automaticamente) e os lembretes textuais (o
 * resto: dano/defesa/PA sem ponto de integração canônico, e efeitos não
 * estruturados). Lê os grupos conhecidos do conteúdo real: nível-topo
 * (`valor`+`alvo_tags`), `buffs[]`, `beneficios[]`, `penalidades[]`.
 */
function collectTalentModifiers(efeito: TalentLevelEffect): { modifiers: TemporaryEffectModifier[]; reminders: string[] } {
  const modifiers: TemporaryEffectModifier[] = [];
  const reminders: string[] = [];

  // Modificador de rolagem declarado no próprio nível-topo (ex.: substituir_bonus_acao com alvo_tags).
  if (isStructuredRollModifier(efeito as unknown as Record<string, unknown>)) {
    modifiers.push(rollModifierFromItem(efeito as unknown as Record<string, unknown>));
  }

  for (const grupo of ["buffs", "beneficios", "penalidades"] as const) {
    const itens = Array.isArray(efeito[grupo]) ? (efeito[grupo] as unknown[]) : [];
    for (const item of itens) {
      const rec = asRecord(item);
      if (!rec) continue;
      if (isStructuredRollModifier(rec)) {
        modifiers.push(rollModifierFromItem(rec));
      } else if (rec.tipo === "dano_extra" && (typeof rec.valor === "string" || typeof rec.valor === "number")) {
        reminders.push(`Dano extra ${rec.valor}${typeof rec.contexto === "string" ? ` (${rec.contexto})` : ""} — aplique manualmente ao resolver o ataque.`);
      } else {
        reminders.push(`${grupo === "penalidades" ? "Penalidade" : "Efeito"} não somável automaticamente: ${describeTalentEffect(rec as TalentLevelEffect)} — resolução manual.`);
      }
    }
  }

  return { modifiers, reminders };
}

interface ParsedTalentDuration {
  durationType: TemporaryEffect["durationType"];
  remainingRounds?: number;
}

/**
 * Interpreta a duração de um efeito de talento a partir de sinais
 * estruturados: `duracao` textual, `cadencia`, e `consequencia_fim_cena`
 * (o conteúdo usa isso para efeitos que resolvem no fim da cena, ex.:
 * "Último Fôlego"). `allowManual=true` (toggles/estado ativo) devolve
 * `manual` quando nada é reconhecido; senão devolve `null` (o chamador
 * mantém lembrete — regra de migração §3: sem duração, não automatiza).
 */
function parseTalentDuration(efeito: TalentLevelEffect, allowManual: boolean): ParsedTalentDuration | null {
  const duracao = typeof efeito.duracao === "string" ? efeito.duracao.toLowerCase() : "";
  const cadencia = typeof efeito.cadencia === "string" ? efeito.cadencia.toLowerCase() : "";

  const rodadasMatch = duracao.match(/(\d+)\s*[_ ]?rodada/);
  if (rodadasMatch) return { durationType: "rounds", remainingRounds: Math.max(1, parseInt(rodadasMatch[1], 10)) };
  if (duracao.includes("fim_da_rodada") || duracao.includes("fim da rodada") || duracao.includes("proximo_turno") || duracao.includes("rodada_atual")) {
    return { durationType: "rounds", remainingRounds: 1 };
  }
  if (duracao.includes("cena") || cadencia === "cena" || asRecord(efeito.consequencia_fim_cena) != null) {
    return { durationType: "scene" };
  }
  if (duracao.includes("descanso") || cadencia === "dia") return { durationType: "rest" };
  return allowManual ? { durationType: "manual" } : null;
}

export interface TalentTemporaryEffectContext {
  talentNome: string;
  nivelNome: string;
  nivelId: string;
  efeitoIndex: number;
  efeito: TalentLevelEffect;
  isToggle: boolean;
  round?: number;
  scene?: number;
  nowIso: string;
  idFactory?: () => string;
}

/**
 * Constrói um `TemporaryEffect` a partir de um efeito de talento —
 * `null` quando não há estrutura suficiente para migrar (sem
 * modificador nem lembrete, ou sem duração reconhecível em efeito que
 * não é toggle). `sourceId = getTalentEffectKey(nivelId, index)` liga o
 * efeito ao toggle/uso (para ligar/desligar e derivar `toggledOn`).
 */
export function buildTalentTemporaryEffect(ctx: TalentTemporaryEffectContext): TemporaryEffect | null {
  const { modifiers, reminders } = collectTalentModifiers(ctx.efeito);
  const dur = parseTalentDuration(ctx.efeito, ctx.isToggle);
  if (!dur) return null; // sem duração reconhecível e não é toggle — mantém lembrete.
  if (modifiers.length === 0 && reminders.length === 0) return null; // nada estruturado para representar.

  // Condição de ativação declarada (ex.: pv_abaixo_metade) vira lembrete — nunca verificada automaticamente.
  const condicaoAtivacao = asRecord(ctx.efeito.condicao_ativacao);
  if (condicaoAtivacao && typeof condicaoAtivacao.tipo === "string") {
    reminders.unshift(`Condição de ativação: ${condicaoAtivacao.tipo.replace(/_/g, " ")} — confirme manualmente.`);
  }

  const nome = `${ctx.talentNome} — ${ctx.nivelNome}`;
  const effect: TemporaryEffect = {
    id: (ctx.idFactory ?? defaultIdFactory)(),
    sourceType: "talent",
    sourceId: getTalentEffectKey(ctx.nivelId, ctx.efeitoIndex),
    sourceName: nome,
    name: nome,
    durationType: dur.durationType,
    // Toggle: "ignore" evita duplicar se reativar sem passar pelo estado; uso limitado: "manual" (o narrador resolve duplicatas).
    stackingMode: ctx.isToggle ? "ignore" : "manual",
    active: true,
    createdAt: ctx.nowIso,
    endedAt: null,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
    reminders: reminders.length > 0 ? reminders : undefined,
  };
  if (dur.remainingRounds != null) effect.remainingRounds = dur.remainingRounds;
  if (ctx.round != null) effect.createdRound = ctx.round;
  if (ctx.scene != null) effect.createdScene = ctx.scene;
  return effect;
}

/** Preview textual (para a aba Talentos) do que o talento CRIARIA como efeito temporário — null se não migraria. */
export function describeTalentTemporaryEffectPreview(usable: UsableTalentEffect): string | null {
  const effect = buildTalentTemporaryEffect({
    talentNome: usable.talentNome,
    nivelNome: usable.nivelNome,
    nivelId: usable.nivelId,
    efeitoIndex: usable.efeitoIndex,
    efeito: usable.efeito,
    isToggle: usable.kind === "toggle",
    nowIso: "preview",
    idFactory: () => "preview",
  });
  if (!effect) return null;
  const dur =
    effect.durationType === "rounds"
      ? `${effect.remainingRounds ?? 1} rodada(s)`
      : effect.durationType === "scene"
        ? "até o fim da cena"
        : effect.durationType === "rest"
          ? "até o descanso longo"
          : "controle manual";
  const mods = (effect.modifiers ?? []).map((m) => m.label ?? `${m.value ?? ""} em ${(m.appliesTo ?? []).join("/")}`);
  const partes = [`duração: ${dur}`];
  if (mods.length > 0) partes.push(`bônus: ${mods.join(", ")}`);
  if ((effect.reminders ?? []).length > 0) partes.push(`lembrete: ${(effect.reminders ?? []).join(" ")}`);
  const stackTexto = effect.stackingMode === "ignore" ? "não duplica" : effect.stackingMode === "stack" ? "empilha" : "controle manual";
  partes.push(stackTexto);
  return partes.join(" · ");
}

export type UsableTalentEffectKind = "limited_use" | "toggle";

export interface UsableTalentEffect {
  key: string;
  talentSlug: string;
  talentNome: string;
  nivelId: string;
  nivelNome: string;
  nivel: number;
  efeitoIndex: number;
  efeito: TalentLevelEffect;
  kind: UsableTalentEffectKind;
  /** `usos` do payload (máximo por cadência) — null em toggles. */
  usosMax: number | null;
  usosGastos: number;
  cadencia: string | null;
  /** `custo_pa` numérico > 0 do efeito — null quando ausente/0 (uso sem custo automático). */
  custoPa: number | null;
  toggledOn: boolean;
  description: string;
}

/**
 * Efeitos usáveis/toggle dos talentos ADQUIRIDOS — a UI só mostra
 * "Usar talento" para o que sair daqui (efeito com `usos` estruturado
 * ou toggle). Efeitos passivos (`modificador`) e narrativos sem
 * contador ficam de fora (os primeiros já são automáticos, os últimos
 * são texto na aba).
 */
export function getUsableTalentEffects(
  character: Pick<Character, "talentos_adquiridos" | "talentos_estado" | "efeitos_temporarios">,
  talents: TalentContent[],
): UsableTalentEffect[] {
  const acquiredByLevelId = new Map((character.talentos_adquiridos ?? []).map((t) => [t.nivelId, t]));
  const usosState = character.talentos_estado?.usos ?? {};
  // `toggledOn` (pós-v0.72) é derivado da PRESENÇA de um efeito temporário ativo ligado ao toggle
  // (mesmo `sourceId`), não mais de `talentos_estado.toggles` — fonte única, sem estado paralelo.
  const activeToggleSources = new Set(
    getActiveTemporaryEffects(character)
      .filter((e) => e.sourceType === "talent" && typeof e.sourceId === "string")
      .map((e) => e.sourceId as string),
  );
  const result: UsableTalentEffect[] = [];

  for (const talent of talents) {
    if (talent.status !== "published") continue;
    for (const nivel of talent.niveis) {
      if (!acquiredByLevelId.has(nivel.id)) continue;
      getTalentLevelEffects(nivel).forEach((efeito, index) => {
        const isToggle = efeito.tipo === "toggle_condicional";
        const usosMax = typeof efeito.usos === "number" && efeito.usos > 0 ? efeito.usos : null;
        if (!isToggle && usosMax == null) return;
        const key = getTalentEffectKey(nivel.id, index);
        result.push({
          key,
          talentSlug: talent.slug,
          talentNome: talent.nome,
          nivelId: nivel.id,
          nivelNome: nivel.nome,
          nivel: nivel.nivel,
          efeitoIndex: index,
          efeito,
          kind: isToggle ? "toggle" : "limited_use",
          usosMax,
          usosGastos: usosState[key]?.usados ?? 0,
          cadencia: typeof efeito.cadencia === "string" ? efeito.cadencia : null,
          custoPa: typeof efeito.custo_pa === "number" && efeito.custo_pa > 0 ? efeito.custo_pa : null,
          toggledOn: activeToggleSources.has(key),
          description: describeTalentEffect(efeito),
        });
      });
    }
  }
  return result;
}

/** Cadências com reset automático canônico no app (rodada/cena/dia) — as demais só resetam manualmente. */
export const TALENT_CADENCE_AUTO_RESET = new Set(["rodada", "cena", "dia"]);

export interface UseTalentEffectResult {
  character: Character;
  ok: boolean;
  reason?: string;
  usable: UsableTalentEffect | null;
  paCost: number | null;
  paBefore: number;
  paAfter: number;
  usosGastosDepois: number;
  /** Efeitos temporários criados por este uso (checkpoint pós-v0.72) — vazio quando o talento não tem buff estruturado + duração. */
  temporaryEffectsAdded: TemporaryEffect[];
  reminders: string[];
}

/**
 * Usa 1 carga de um efeito de talento limitado — checa uso restante e
 * PA ANTES de mudar qualquer estado (mesmo padrão de
 * `useItemOnCharacter`). O efeito mecânico em si NÃO é aplicado
 * automaticamente (resolução manual, descrita nos lembretes) — o que é
 * automatizado é o contador, o custo e o log.
 */
export function useTalentEffect(params: {
  character: Character;
  talents: TalentContent[];
  key: string;
  paMax: number;
  nowIso: string;
  round?: number;
  scene?: number;
  idFactory?: () => string;
}): UseTalentEffectResult {
  const { character, talents, key, paMax, nowIso, round, scene, idFactory } = params;
  const usable = getUsableTalentEffects(character, talents).find((u) => u.key === key) ?? null;
  const paGastosAntes = character.estado_jogo?.pa_gastos ?? 0;
  const paBefore = Math.max(0, paMax - paGastosAntes);

  const blocked = (reason: string): UseTalentEffectResult => ({
    character,
    ok: false,
    reason,
    usable,
    paCost: usable?.custoPa ?? null,
    paBefore,
    paAfter: paBefore,
    usosGastosDepois: usable?.usosGastos ?? 0,
    temporaryEffectsAdded: [],
    reminders: [],
  });

  if (!usable) return blocked("Efeito de talento não encontrado (nível não adquirido ou catálogo indisponível).");
  if (usable.kind !== "limited_use" || usable.usosMax == null) {
    return blocked("Este efeito não é de usos limitados — use o botão Ativar/Desativar.");
  }
  if (usable.usosGastos >= usable.usosMax) {
    return blocked(
      `Sem usos restantes (${usable.usosGastos}/${usable.usosMax}${usable.cadencia ? ` por ${usable.cadencia.replace(/_/g, " ")}` : ""}).`,
    );
  }
  if (usable.custoPa != null && usable.custoPa > paBefore) {
    return blocked(`PA insuficiente (atual: ${paBefore}, necessário: ${usable.custoPa}).`);
  }

  const usosAtuais = character.talentos_estado?.usos ?? {};
  const usosGastosDepois = usable.usosGastos + 1;
  let nextCharacter: Character = {
    ...character,
    talentos_estado: {
      ...character.talentos_estado,
      usos: { ...usosAtuais, [key]: { usados: usosGastosDepois, cadencia: usable.cadencia, atualizadoEm: nowIso } },
    },
  };
  if (usable.custoPa != null) {
    nextCharacter = { ...nextCharacter, estado_jogo: { ...nextCharacter.estado_jogo, pa_gastos: paGastosAntes + usable.custoPa } };
  }

  const reminders: string[] = [`${usable.talentNome} — ${usable.nivelNome}: ${usable.description} — resolução manual do efeito.`];
  if (usable.cadencia && !TALENT_CADENCE_AUTO_RESET.has(usable.cadencia)) {
    reminders.push(`Cadência "${usable.cadencia.replace(/_/g, " ")}" não tem reset automático — use "Resetar usos" quando a cadência renovar.`);
  }

  // Migração pós-v0.72: se o uso carrega buff estruturado (modificador de rolagem) COM duração
  // reconhecível (ex.: "Último Fôlego" → +2 Luta até o fim da cena), cria efeito temporário
  // rastreado. Sem estrutura suficiente (allowManual=false para uso limitado), segue só lembrete.
  const temporaryEffectsAdded: TemporaryEffect[] = [];
  const built = buildTalentTemporaryEffect({
    talentNome: usable.talentNome,
    nivelNome: usable.nivelNome,
    nivelId: usable.nivelId,
    efeitoIndex: usable.efeitoIndex,
    efeito: usable.efeito,
    isToggle: false,
    round,
    scene,
    nowIso,
    idFactory,
  });
  if (built) {
    nextCharacter = addTemporaryEffect(nextCharacter, built);
    temporaryEffectsAdded.push(built);
  }

  return {
    character: nextCharacter,
    ok: true,
    usable,
    paCost: usable.custoPa,
    paBefore,
    paAfter: usable.custoPa != null ? paBefore - usable.custoPa : paBefore,
    usosGastosDepois,
    temporaryEffectsAdded,
    reminders,
  };
}

export interface ToggleTalentEffectResult {
  character: Character;
  ok: boolean;
  reason?: string;
  usable: UsableTalentEffect | null;
  active: boolean;
  /** Efeito temporário criado ao ATIVAR — null ao desativar. */
  temporaryEffect: TemporaryEffect | null;
  /** Efeito temporário desativado ao DESLIGAR — null ao ativar. */
  removedEffect: TemporaryEffect | null;
  reminders: string[];
}

/**
 * Liga/desliga um `toggle_condicional` (checkpoint pós-v0.72 — migrado
 * para o modelo canônico). Ativar CRIA um `TemporaryEffect` (ligado ao
 * toggle por `sourceId`), cujos modificadores de rolagem entram nas
 * rolagens via `deriveActiveEffectsFromTemporaryEffects`; desativar
 * REMOVE esse efeito. O estado ligado/desligado é a presença do efeito
 * ativo — sem `talentos_estado.toggles` paralelo. `idFactory` injetável.
 */
export function toggleTalentEffect(params: {
  character: Character;
  talents: TalentContent[];
  key: string;
  nowIso: string;
  round?: number;
  scene?: number;
  idFactory?: () => string;
}): ToggleTalentEffectResult {
  const { character, talents, key, nowIso, round, scene, idFactory } = params;
  const usable = getUsableTalentEffects(character, talents).find((u) => u.key === key) ?? null;
  if (!usable || usable.kind !== "toggle") {
    return { character, ok: false, reason: "Efeito de talento não encontrado ou não é um toggle.", usable, active: false, temporaryEffect: null, removedEffect: null, reminders: [] };
  }

  const existing = getActiveTemporaryEffects(character).find((e) => e.sourceType === "talent" && e.sourceId === key) ?? null;

  // Já ativo → desligar (remove o efeito temporário).
  if (existing) {
    const nextCharacter = removeTemporaryEffect(character, existing.id, nowIso);
    return { character: nextCharacter, ok: true, usable, active: false, temporaryEffect: null, removedEffect: existing, reminders: [] };
  }

  // Inativo → ligar (cria o efeito temporário).
  const built = buildTalentTemporaryEffect({
    talentNome: usable.talentNome,
    nivelNome: usable.nivelNome,
    nivelId: usable.nivelId,
    efeitoIndex: usable.efeitoIndex,
    efeito: usable.efeito,
    isToggle: true,
    round,
    scene,
    nowIso,
    idFactory,
  });
  if (!built) {
    // Toggle sem estrutura suficiente (nem modificador nem lembrete) — não deveria ocorrer no catálogo real.
    return { character, ok: false, reason: "Este toggle não tem efeito estruturado para ativar.", usable, active: false, temporaryEffect: null, removedEffect: null, reminders: [] };
  }
  const nextCharacter = addTemporaryEffect(character, built);
  return { character: nextCharacter, ok: true, usable, active: true, temporaryEffect: built, removedEffect: null, reminders: built.reminders ?? [] };
}

/**
 * Reseta contadores de uso cujas cadências estejam em `cadencias` —
 * chamado pelo Encerrar Rodada ("rodada"), Encerrar Cena ("cena") e
 * descanso longo ("dia"). `null`/cadência desconhecida nunca é resetada
 * automaticamente. Devolve o MESMO objeto se nada mudou.
 */
export function resetTalentUses(character: Character, cadencias: string[]): { character: Character; resetCount: number } {
  const usos = character.talentos_estado?.usos;
  if (!usos) return { character, resetCount: 0 };
  const alvo = new Set(cadencias);
  let resetCount = 0;
  const nextUsos: Record<string, { usados: number; cadencia: string | null; atualizadoEm: string }> = {};
  for (const [key, entry] of Object.entries(usos)) {
    if (entry.cadencia != null && alvo.has(entry.cadencia) && entry.usados > 0) {
      resetCount += 1;
      continue; // limpo — some do registro (0 usados é o estado implícito).
    }
    nextUsos[key] = entry;
  }
  if (resetCount === 0) return { character, resetCount: 0 };
  return {
    character: { ...character, talentos_estado: { ...character.talentos_estado, usos: nextUsos } },
    resetCount,
  };
}

/** Reset manual de UM contador (cadências sem gatilho canônico — combate/sessão/missão). */
export function resetTalentUse(character: Character, key: string): Character {
  const usos = character.talentos_estado?.usos;
  if (!usos || !(key in usos)) return character;
  const nextUsos = { ...usos };
  delete nextUsos[key];
  return { ...character, talentos_estado: { ...character.talentos_estado, usos: nextUsos } };
}
