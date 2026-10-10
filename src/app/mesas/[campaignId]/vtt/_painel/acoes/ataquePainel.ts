"use server";

/**
 * ATAQUE CONTESTADO na mesa — o fluxo que faltava entre "rolar a
 * perícia da arma" e "aplicar o dano".
 *
 *   1. `declararAtaqueAction` — o ATACANTE rola o ataque contra o alvo
 *      marcado (ações do token → Atacar). Nasce o cartão no chat,
 *      aguardando defesa.
 *   2. `registrarDefesaAction` — quem controla o ALVO (ou o narrador)
 *      rola a defesa (Esquivar/Bloquear/Aparar/Resistir), ou o narrador
 *      informa o total. Sai a margem de impacto.
 *   3. `resolverDanoAction` — o ATACANTE escolhe a região que a margem
 *      libera (`resolveMarginBand`) e o dano é rolado com o ajuste da
 *      margem (−1 / +1 dado).
 *   4. `aplicarDanoDoAtaqueAction` (combatePainel.ts) — o narrador
 *      aplica; a armadura da região (ou o PD do escudo, se bloqueou)
 *      mitiga.
 *
 * Cada passo é um `table_logs` com o MESMO `workflowId` e o payload do
 * passo anterior por inteiro — o feed troca o cartão no lugar
 * (`projetarFeed`). Cada passo também grava uma trava em
 * `campaign_workflow_steps` (único por workflow+passo): dois cliques,
 * duas abas, uma resolução só. Os dados do servidor são a fonte; nada
 * do que o cliente manda é confiado sem reconferir.
 */

import { getScopedTableClient } from "../../../../../../lib/auth/scopedClient";
import { getCurrentUser } from "../../../../../../lib/auth/session";
import { getCharacterForCampaign, listControlledCharacters } from "../../../../../../lib/character/storage";
import {
  BODY_REGION_LABELS,
  normalizeCharacter,
  normalizeItemContent,
  resolveMarginBand,
  rollDamageFormula,
  rollExtraMarginDie,
  type BodyRegion,
} from "../../../../../../lib/character";
import { listItems } from "../../../../../../lib/content";
import { getRupturaPool, resolverPericia } from "../../../../../../lib/dice";
import { addLog } from "../../../../../../lib/table/storage";
import type { TableLogEntry } from "../../../../../../lib/table";
import { exigirAcessoPainel, mensagemDeErro, type ResultadoPainel } from "./comum";

const TABELA_PASSOS = "campaign_workflow_steps";
const MODIFICADOR_MAX = 20;
const ATRIBUTOS: Record<string, string> = { corpo: "Corpo", mente: "Mente", animo: "Ânimo" };

/** As defesas da regra "Ações defensivas" — perícia e atributo de cada uma. */
const DEFESAS = {
  esquivar: { nome: "Esquivar", pericia: "reflexos", atributo: "corpo", bloqueia: false },
  bloquear: { nome: "Bloquear", pericia: "reflexos", atributo: "corpo", bloqueia: true },
  aparar: { nome: "Aparar", pericia: "luta", atributo: "corpo", bloqueia: false },
  resistir_vigor: { nome: "Resistir (Vigor)", pericia: "vigor", atributo: "corpo", bloqueia: false },
  resistir_mobilidade: { nome: "Resistir (Mobilidade)", pericia: "mobilidade", atributo: "corpo", bloqueia: false },
} as const;
export type TipoDefesaMesa = keyof typeof DEFESAS;

type P = Record<string, unknown>;
const txt = (p: P, k: string) => (typeof p[k] === "string" && p[k] ? (p[k] as string) : null);
const num = (p: P, k: string) => (typeof p[k] === "number" && Number.isFinite(p[k]) ? (p[k] as number) : null);
const d8 = () => 1 + Math.floor(Math.random() * 8);

async function lerEntrada(campaignId: string, logId: string): Promise<TableLogEntry | null> {
  const client = await getScopedTableClient();
  const { data, error } = await client.from("table_logs").select().eq("id", logId).eq("campaign_id", campaignId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as TableLogEntry | null) ?? null;
}

/** Trava do passo. `false` = já resolvido por outra chamada. */
async function travarPasso(campaignId: string, workflowId: string, passo: string, logId: string, resultado: P): Promise<boolean> {
  const client = await getScopedTableClient();
  const usuario = await getCurrentUser();
  const { error } = await client.from(TABELA_PASSOS).insert({
    campaign_id: campaignId, workflow_id: workflowId, step: passo, log_id: logId, resultado, applied_by: usuario?.id ?? null,
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(error.message);
}

/** Quem pode agir por um personagem: o narrador, ou quem o controla. */
async function podeAgirPor(campaignId: string, ehNarrador: boolean, characterId: string | null): Promise<boolean> {
  if (ehNarrador) return true;
  if (!characterId) return false;
  const meus = await listControlledCharacters(campaignId, { somenteEditar: true });
  return meus.some((c) => c.id === characterId);
}

/** Teste de perícia rolado no servidor (pool derivado do atributo do banco). */
function rolarTeste(personagem: ReturnType<typeof normalizeCharacter>, atributoId: string, periciaId: string | null, modificador: number) {
  const atributoValor = Math.trunc(personagem.atributos[atributoId as "corpo" | "mente" | "animo"] ?? 0);
  const { quantidadeDados } = getRupturaPool(atributoValor);
  return resolverPericia({
    atributoId: atributoId as "corpo" | "mente" | "animo",
    atributoNome: ATRIBUTOS[atributoId] ?? atributoId,
    atributoValor,
    periciaId: periciaId ?? undefined,
    periciaValor: periciaId ? Math.trunc(personagem.pericias[periciaId] ?? 0) : 0,
    modificador,
  }, Array.from({ length: quantidadeDados }, d8));
}

/* ═════════ 1. declarar ═════════ */

export interface DeclararAtaqueParams {
  campaignId: string;
  /** Token do atacante e do alvo — revalidados pela RPC `read_vtt_action_context`. */
  actorTokenId: string;
  alvoTokenId: string;
  /** Instância da arma; `null` = desarmado. */
  armaInstanceId: string | null;
  armaNome: string;
  atributoId: string;
  periciaId: string | null;
  modificador: number;
  /** Faces do ataque já rolado no Console (as mesmas do log da rolagem). */
  dados: number[];
  /** Só para DESARMADO: o dano sai da ação de combate, não de item. */
  desarmado?: { danoFormula: string | null; tipoDano: string | null; subtipoDano: string | null } | null;
}

export async function declararAtaqueAction(params: DeclararAtaqueParams): Promise<ResultadoPainel<TableLogEntry>> {
  const v = await exigirAcessoPainel(params.campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  try {
    const client = await getScopedTableClient();
    const { data: ctx, error: erroCtx } = await client.rpc("read_vtt_action_context", { p_actor_id: params.actorTokenId, p_target_id: params.alvoTokenId });
    if (erroCtx || !ctx) return { ok: false, erro: erroCtx?.message ?? "Alvo indisponível." };
    const c = ctx as { campaignId: string; actorCharacterId: string; alvoTokenId: string | null; alvoCharacterId: string | null; alvoNome: string | null; logVisibility: "public" | "gm" };
    if (c.campaignId !== params.campaignId) return { ok: false, erro: "O token não é desta campanha." };
    if (!c.alvoTokenId) return { ok: false, erro: "Marque um alvo para atacar." };

    const registro = await getCharacterForCampaign(params.campaignId, c.actorCharacterId);
    if (!registro) return { ok: false, erro: "Você não controla este personagem." };
    const atacante = normalizeCharacter(registro.payload);

    const modificador = Math.trunc(params.modificador);
    if (!Number.isFinite(modificador) || Math.abs(modificador) > MODIFICADOR_MAX) return { ok: false, erro: "Modificador fora da faixa." };
    const atributoValor = Math.trunc(atacante.atributos[params.atributoId as "corpo"] ?? 0);
    const pool = getRupturaPool(atributoValor);
    const dados = (params.dados ?? []).map((d) => Math.trunc(d));
    if (dados.length !== pool.quantidadeDados || dados.some((d) => !(d >= 1 && d <= 8))) {
      return { ok: false, erro: "Dados do ataque inconsistentes com o atributo." };
    }
    const ataque = resolverPericia({
      atributoId: params.atributoId as "corpo",
      atributoNome: ATRIBUTOS[params.atributoId] ?? params.atributoId,
      atributoValor,
      periciaId: params.periciaId ?? undefined,
      periciaValor: params.periciaId ? Math.trunc(atacante.pericias[params.periciaId] ?? 0) : 0,
      modificador,
    }, dados);

    // Dano: da ARMA do inventário do atacante (catálogo publicado);
    // desarmado, o que a ação de combate declara (só número ou dado).
    let danoFormula: string | null = null, tipoDano: string | null = null, subtipoDano: string | null = null, armaNome = params.armaNome;
    if (params.armaInstanceId) {
      const inst = (atacante.inventario ?? []).find((i) => i.id === params.armaInstanceId);
      if (!inst) return { ok: false, erro: "Arma não encontrada no inventário." };
      const modelo = (await listItems()).map((d) => normalizeItemContent(d.payload as P)).find((m) => m.slug === inst.itemSlug);
      danoFormula = modelo?.danoBase ?? null;
      tipoDano = modelo?.tipoDano ?? null;
      subtipoDano = modelo?.subtipoDano ?? modelo?.subtiposDanoPossiveis?.[0] ?? null;
      armaNome = inst.itemNome;
    } else if (params.desarmado) {
      const f = params.desarmado.danoFormula?.trim() ?? null;
      danoFormula = f && /^(\d{1,2}|\d{1,2}d\d{1,2}([+-]\d{1,2})?)$/.test(f.replace(/\s+/g, "")) ? f : null;
      tipoDano = params.desarmado.tipoDano;
      subtipoDano = params.desarmado.subtipoDano;
    }

    const workflowId = crypto.randomUUID();
    const entrada = await addLog({
      campaignId: params.campaignId,
      characterId: c.actorCharacterId,
      type: "attack_declared",
      visibility: c.logVisibility,
      payload: {
        workflowId,
        atacanteCharacterId: c.actorCharacterId,
        atacanteNome: registro.name,
        actorTokenId: params.actorTokenId,
        alvoTokenId: c.alvoTokenId,
        alvoCharacterId: c.alvoCharacterId,
        alvoNome: c.alvoNome,
        armaNome,
        armaInstanceId: params.armaInstanceId,
        danoFormula,
        tipoDano,
        subtipoDano,
        dadosAtaque: ataque.dados,
        modificadorAtaque: ataque.modificador,
        periciaAtaque: ataque.periciaNome ?? null,
        totalAtaque: ataque.total,
        source: "vtt_ataque_contestado",
      },
    });
    return { ok: true, dados: entrada };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao declarar o ataque.") };
  }
}

/* ═════════ 2. defender ═════════ */

export interface RegistrarDefesaParams {
  campaignId: string;
  /** `table_logs.id` do passo atual do ataque. */
  logId: string;
  /** Rolar uma defesa da regra… */
  defesa?: TipoDefesaMesa;
  modificador?: number;
  /** Faces roladas na mesa 3D por quem defende — conferidas contra a pool do atributo. */
  dados?: number[];
  /** …ou (só o narrador) informar o total. */
  total?: number;
}

export async function registrarDefesaAction(params: RegistrarDefesaParams): Promise<ResultadoPainel<TableLogEntry>> {
  const v = await exigirAcessoPainel(params.campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  const ehNarrador = v.acesso.role === "narrator";
  try {
    const entrada = await lerEntrada(params.campaignId, params.logId);
    if (!entrada) return { ok: false, erro: "Este ataque não está mais disponível." };
    const p = entrada.payload as P;
    const workflowId = txt(p, "workflowId") ?? entrada.id;
    const totalAtaque = num(p, "totalAtaque");
    if (totalAtaque == null) return { ok: false, erro: "Este ataque não tem total de ataque." };
    if (num(p, "totalDefesa") != null) return { ok: false, erro: "A defesa já foi registrada." };
    const alvoId = txt(p, "alvoCharacterId");

    let totalDefesa: number, dadosDefesa: number[] = [], defesaNome: string, bloqueou = false, origem: "rolagem" | "narrador";
    if (params.total != null) {
      if (!ehNarrador) return { ok: false, erro: "Só o narrador informa o total da defesa." };
      const t = Math.trunc(params.total);
      if (!Number.isFinite(t) || t < -20 || t > 60) return { ok: false, erro: "Total de defesa fora da faixa." };
      totalDefesa = t; defesaNome = "Defesa informada"; origem = "narrador";
    } else {
      const def = params.defesa ? DEFESAS[params.defesa] : null;
      if (!def) return { ok: false, erro: "Escolha uma defesa." };
      if (!(await podeAgirPor(params.campaignId, ehNarrador, alvoId))) return { ok: false, erro: "Só quem controla o alvo (ou o narrador) rola a defesa." };
      if (!alvoId) return { ok: false, erro: "O alvo não tem ficha — o narrador informa o total." };
      const registro = await getCharacterForCampaign(params.campaignId, alvoId);
      if (!registro) return { ok: false, erro: "Ficha do alvo indisponível." };
      const mod = Math.trunc(params.modificador ?? 0);
      if (Math.abs(mod) > MODIFICADOR_MAX) return { ok: false, erro: "Modificador fora da faixa." };
      const alvo = normalizeCharacter(registro.payload);
      let r;
      if (params.dados) {
        const atributoValor = Math.trunc(alvo.atributos[def.atributo as "corpo"] ?? 0);
        const pool = getRupturaPool(atributoValor);
        const faces = params.dados.map((d) => Math.trunc(d));
        if (faces.length !== pool.quantidadeDados || faces.some((d) => !(d >= 1 && d <= 8))) {
          return { ok: false, erro: "Dados da defesa inconsistentes com o atributo." };
        }
        r = resolverPericia({
          atributoId: def.atributo as "corpo", atributoNome: ATRIBUTOS[def.atributo] ?? def.atributo, atributoValor,
          periciaId: def.pericia, periciaValor: Math.trunc(alvo.pericias[def.pericia] ?? 0), modificador: mod,
        }, faces);
      } else {
        r = rolarTeste(alvo, def.atributo, def.pericia, mod);
      }
      totalDefesa = r.total; dadosDefesa = r.dados; defesaNome = def.nome; bloqueou = def.bloqueia; origem = "rolagem";
    }

    const margem = totalAtaque - totalDefesa;
    const faixa = resolveMarginBand(margem);
    if (!(await travarPasso(params.campaignId, workflowId, "defesa", entrada.id, { totalDefesa, margem }))) {
      return { ok: false, erro: "A defesa já foi registrada." };
    }
    const nova = await addLog({
      campaignId: params.campaignId,
      // O cartão é do ATACANTE do começo ao fim — é por ele que o
      // retrato do cabeçalho é buscado.
      characterId: txt(p, "atacanteCharacterId") ?? undefined,
      type: "attack_defended",
      visibility: entrada.visibility,
      payload: {
        ...p,
        workflowId,
        defesaNome,
        defesaOrigem: origem,
        dadosDefesa,
        totalDefesa,
        bloqueou,
        margem,
        faixaMargem: faixa.band,
        regioesPermitidas: faixa.allowedRegions,
        acertou: faixa.band !== "miss",
      },
    });
    return { ok: true, dados: nova };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao registrar a defesa.") };
  }
}

/* ═════════ 3. região e dano ═════════ */

/**
 * Os dados que o dano pede: `NdM±K` rola N dados de M lados; o crítico
 * soma mais um do mesmo tipo. Dano fixo (desarmado) não rola nada.
 */
function dadosDoDano(formula: string, critico: boolean): { quantidade: number; lados: number; mod: number } | null {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(formula.trim().replace(/\s+/g, ""));
  if (!m) return null;
  return { quantidade: Number(m[1]) + (critico ? 1 : 0), lados: Number(m[2]), mod: m[3] ? Number(m[3]) : 0 };
}

export async function resolverDanoAction(params: {
  campaignId: string;
  logId: string;
  regiao: BodyRegion;
  /** Faces roladas na mesa 3D pelo atacante (já com o dado extra do crítico). */
  dados?: number[];
}): Promise<ResultadoPainel<TableLogEntry>> {
  const v = await exigirAcessoPainel(params.campaignId);
  if (!v.ok) return { ok: false, erro: v.erro };
  const ehNarrador = v.acesso.role === "narrator";
  try {
    const entrada = await lerEntrada(params.campaignId, params.logId);
    if (!entrada) return { ok: false, erro: "Este ataque não está mais disponível." };
    const p = entrada.payload as P;
    const workflowId = txt(p, "workflowId") ?? entrada.id;
    if (!(await podeAgirPor(params.campaignId, ehNarrador, txt(p, "atacanteCharacterId")))) {
      return { ok: false, erro: "Só quem atacou (ou o narrador) escolhe a região." };
    }
    const margem = num(p, "margem");
    if (margem == null) return { ok: false, erro: "A defesa ainda não foi registrada." };
    const faixa = resolveMarginBand(margem);
    if (faixa.band === "miss") return { ok: false, erro: "O ataque errou." };
    if (!faixa.allowedRegions.includes(params.regiao)) {
      return { ok: false, erro: `A margem ${margem} não libera ${BODY_REGION_LABELS[params.regiao]}.` };
    }
    const formula = txt(p, "danoFormula");
    if (!formula) return { ok: false, erro: "A arma não tem dano estruturado — role o dano manualmente." };

    const critico = faixa.modifierType === "extraDie";
    const pedido = dadosDoDano(formula, critico);
    let bruto: number, ajuste: number, facesDano: number[] = [];
    if (pedido && params.dados) {
      // Faces da mesa 3D: a contagem e os lados têm que ser os da arma
      // (+1 dado no crítico). O dado extra é o ÚLTIMO.
      const faces = params.dados.map((d) => Math.trunc(d));
      if (faces.length !== pedido.quantidade || faces.some((d) => !(d >= 1 && d <= pedido.lados))) {
        return { ok: false, erro: `O dano pede ${pedido.quantidade}d${pedido.lados}.` };
      }
      facesDano = faces;
      const base = faces.slice(0, critico ? -1 : undefined).reduce((a, b) => a + b, 0) + pedido.mod;
      bruto = Math.max(0, base);
      ajuste = critico ? faces[faces.length - 1] : faixa.modifierType === "flat" ? faixa.flatModifier : 0;
    } else {
      // Dano fixo (desarmado) vale como está; sem dados enviados, rola aqui.
      const fixo = /^\d+$/.test(formula.trim()) ? Number(formula.trim()) : null;
      bruto = fixo ?? rollDamageFormula(formula);
      const extra = critico ? rollExtraMarginDie(formula) ?? 0 : 0;
      ajuste = faixa.modifierType === "flat" ? faixa.flatModifier : extra;
    }
    const dano = Math.max(0, bruto + ajuste);

    if (!(await travarPasso(params.campaignId, workflowId, "dano_rolado", entrada.id, { dano, regiao: params.regiao }))) {
      return { ok: false, erro: "O dano já foi rolado." };
    }
    const nova = await addLog({
      campaignId: params.campaignId,
      characterId: txt(p, "atacanteCharacterId") ?? undefined,
      type: "attack_resolved",
      visibility: entrada.visibility,
      payload: {
        ...p,
        workflowId,
        regiao: params.regiao,
        regiaoRotulo: BODY_REGION_LABELS[params.regiao],
        danoBrutoRolado: bruto,
        dadosDano: facesDano,
        ajusteMargem: ajuste,
        dano,
        danoTipo: txt(p, "subtipoDano") ?? txt(p, "tipoDano"),
      },
    });
    return { ok: true, dados: nova };
  } catch (e) {
    return { ok: false, erro: mensagemDeErro(e, "Falha ao rolar o dano.") };
  }
}
