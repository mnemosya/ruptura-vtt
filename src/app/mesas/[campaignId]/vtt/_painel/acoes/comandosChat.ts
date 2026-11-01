"use server";

import { getCharacterForCampaign, listControlledCharacters, updateCharacterSheetPayload } from "../../../../../../lib/character/storage";
import { getCharacterRules } from "../../../../../../lib/content";
import { listSpellsEffective } from "../../../../../../lib/campaignContent";
import { aplicarEscolhasDeConjuracao, applyConsoleMutation, castSpell, characterDerivedFormulas, computeDerivedStats, getOverloadSurgeDamageDie, getSpellCostChoice, getVertenteLevel, isSpellLearned, limiteSobrecarga, normalizeCharacter, normalizeSpellContent, pisoPeNegativo, prepareSpellCastResolution, rollSpellAttack, useOverloadSurge, type CharacterRulesPayload } from "../../../../../../lib/character";
import { SURTOS_SOBRECARGA } from "../../../../../../lib/rulesetV12/ruptura";
import { montarAbaAcoes, type CatalogoAcoesV12, type ItemAbaAcao } from "../../../../../../lib/character/abaAcoes";
import { somarPaGastos } from "../../../../../../lib/character/paGastos";
import { addLog } from "../../../../../../lib/table/storage";
import type { TableLogVisibility } from "../../../../../../lib/table";
import acoesV12 from "../../../../../../../content/v12/db_acoes_v1_2.json";
import { exigirAcessoPainel, mensagemDeErro, type ResultadoPainel } from "./comum";
import { registrarRolagemPericiaAction } from "./rolagemPainel";
import { normalizarComando } from "../feed/comandoPericia";

type Pedido = { campaignId: string; characterId: string; id: string; visibilidade: TableLogVisibility; argumento?: string };
type TesteAcao = { periciaId: string; atributoId: string; atributoValor: number };
const visibilidadeSegura = (v: TableLogVisibility, narrador: boolean): TableLogVisibility =>
  v === "public" || v === "private" ? v : v === "gm" ? (narrador ? "gm" : "private") : "public";

export async function usarSobrecargaChatAction(pedido: { campaignId: string; characterId: string; nome: string; pontos: number; visibilidade: TableLogVisibility }): Promise<ResultadoPainel> {
  try {
    const acesso = await personagemPermitido(pedido.campaignId, pedido.characterId);
    if ("erro" in acesso) return { ok: false, erro: acesso.erro };
    const surto = SURTOS_SOBRECARGA.find((s) => s.nome === pedido.nome);
    if (!surto || !Number.isSafeInteger(pedido.pontos) || pedido.pontos < surto.custo.min || pedido.pontos > surto.custo.max) return { ok: false, erro: "Surto ou custo inválido." };
    const regrasDoc = await getCharacterRules().catch(() => null);
    const regras = (regrasDoc?.payload as CharacterRulesPayload | undefined) ?? null;
    const ficha = normalizeCharacter(acesso.record.payload);
    const derivados = computeDerivedStats(ficha.atributos, regras, ficha.mana_bonus_ruptura ?? 0, characterDerivedFormulas(ficha));
    const limite = limiteSobrecarga(ficha, regras?.sobrecarga);
    if ((ficha.sobrecarga_usada_dia ?? 0) + pedido.pontos > limite) return { ok: false, erro: `Sobrecarga insuficiente (${ficha.sobrecarga_usada_dia ?? 0}/${limite}).` };
    let atual = ficha;
    let dano = 0;
    let rupturaPendente = false;
    let requiresWillRoll = false;
    const antes = ficha.sobrecarga_usada_dia ?? 0;
    for (let i = 0; i < pedido.pontos; i++) {
      const resultado = useOverloadSurge(atual, surto.nome, new Date().toISOString(), Math.random, regras?.sobrecarga, limite);
      if (!resultado.surge) return { ok: false, erro: resultado.warnings[0] ?? "Surto indisponível." };
      atual = resultado.character;
      dano += resultado.surge.danoPsiquico;
      rupturaPendente ||= resultado.rupturePending;
      requiresWillRoll ||= resultado.requiresWillRoll;
    }
    const peAntes = atual.recursos_atuais?.pe ?? 0;
    const peDepois = Math.max(pisoPeNegativo(derivados.pe_max), peAntes - dano);
    const comDano = applyConsoleMutation(atual, { type: "resource", resource: "pe", value: peDepois, nowIso: new Date().toISOString() },
      { derived: derivados, rules: regras, reactionRules: { actionsConsumeReaction: false, allowDefenseWithoutReaction: false, cumulativePenalty: 0, resetAt: "", valid: false } });
    await updateCharacterSheetPayload(pedido.characterId, comDano.character);
    await addLog({ campaignId: pedido.campaignId, characterId: pedido.characterId, type: "overload_surge_used", visibility: visibilidadeSegura(pedido.visibilidade, acesso.narrador), payload: {
      characterId: pedido.characterId, characterNome: acesso.record.name, tipo: surto.nome, indice: antes + pedido.pontos, maxSurtos: limite,
      danoPsiquico: dano, danoDado: pedido.pontos === 1 ? getOverloadSurgeDamageDie(regras?.sobrecarga) : `${pedido.pontos} × ${getOverloadSurgeDamageDie(regras?.sobrecarga)}`,
      peAntes, peDepois, sobrecargaAntes: antes, sobrecargaDepois: antes + pedido.pontos, rupturaPendente, requiresWillRoll, source: "vtt_painel_chat_comando",
    } });
    return { ok: true };
  } catch (e) { return { ok: false, erro: mensagemDeErro(e, "Falha ao usar Sobrecarga.") }; }
}

async function personagemPermitido(campaignId: string, characterId: string) {
  const acesso = await exigirAcessoPainel(campaignId);
  if (!acesso.ok) return { erro: acesso.erro } as const;
  if (acesso.acesso.role !== "narrator") {
    const controlados = await listControlledCharacters(campaignId, { somenteEditar: true });
    if (!controlados.some((p) => p.id === characterId)) return { erro: "Você não pode agir por este personagem." } as const;
  }
  const record = await getCharacterForCampaign(campaignId, characterId);
  if (!record || record.archived_at) return { erro: "Personagem indisponível." } as const;
  return { record, narrador: acesso.acesso.role === "narrator" } as const;
}

async function dadosAcao(pedido: Pedido): Promise<ResultadoPainel<{ item: ItemAbaAcao; ficha: ReturnType<typeof normalizeCharacter>; nome: string; regras: CharacterRulesPayload | null; paMax: number; narrador: boolean }>> {
  const acesso = await personagemPermitido(pedido.campaignId, pedido.characterId);
  if ("erro" in acesso) return { ok: false, erro: acesso.erro };
  const ficha = normalizeCharacter(acesso.record.payload);
  const regrasDoc = await getCharacterRules().catch(() => null);
  const regras = (regrasDoc?.payload as CharacterRulesPayload | undefined) ?? null;
  const derivados = computeDerivedStats(ficha.atributos, regras, ficha.mana_bonus_ruptura ?? 0, characterDerivedFormulas(ficha));
  const aba = montarAbaAcoes(acoesV12 as unknown as CatalogoAcoesV12, ficha, { paMax: derivados.pa_max, reacoesPorRodada: derivados.reacoes_por_rodada });
  const item = aba.grupos.flatMap((g) => g.itens).find((i) => i.chave === pedido.id);
  if (!item) return { ok: false, erro: "Ação indisponível para este personagem." };
  return { ok: true, dados: { item, ficha, nome: acesso.record.name, regras, paMax: derivados.pa_max, narrador: acesso.narrador } };
}

function testeDaAcao(item: ItemAbaAcao, regras: CharacterRulesPayload | null, ficha: ReturnType<typeof normalizeCharacter>, argumento = ""): ResultadoPainel<{ teste: TesteAcao | null; custo: number }> {
  const acao = item.acao;
  if (acao.custo.pa_preparado || acao.custo.proprio || acao.custo.ram || acao.custo.reacao || acao.tipo === "reacao" || acao.slug === "atacar" || acao.estado || acao.alvo) {
    return { ok: false, erro: `${acao.nome} tem um fluxo próprio que ainda não cabe em um comando direto.` };
  }
  let resto = normalizarComando(argumento.trim());
  const opcoes = acao.opcoes ?? [];
  let opcao = opcoes.length === 1 ? opcoes[0] : null;
  if (opcoes.length) {
    const correspondencias = opcoes.flatMap((o) => [o.nome, o.slug].map((nome) => ({ opcao: o, nome: normalizarComando(nome) })))
      .filter((x) => resto === x.nome || resto.startsWith(`${x.nome} `)).sort((a, b) => b.nome.length - a.nome.length);
    if (correspondencias.length) { opcao = correspondencias[0].opcao; resto = resto.slice(correspondencias[0].nome.length).trim(); }
    else if (!opcao) return { ok: false, erro: `Escolha a forma: ${opcoes.map((o) => o.nome).join(", ")}. Ex.: /a ${acao.nome} ${opcoes[0].nome}` };
  }
  const pericias = opcao?.teste?.pericias ?? acao.teste?.pericias;
  if (!pericias) {
    if (resto) return { ok: false, erro: `Não reconheci "${resto}" para ${acao.nome}.` };
    return { ok: true, dados: { teste: null, custo: opcao?.custo.pa ?? acao.custo.pa ?? 0 } };
  }
  const candidatas = pericias === "qualquer" ? (regras?.pericias ?? []).map((p) => p.id) : pericias;
  let periciaId: string | undefined;
  if (!resto && candidatas.length === 1) periciaId = candidatas[0];
  else {
    periciaId = candidatas.find((id) => {
      const nome = regras?.pericias?.find((p) => p.id === id)?.nome ?? id;
      return resto === normalizarComando(id) || resto === normalizarComando(nome);
    });
  }
  if (!periciaId) return { ok: false, erro: `Escolha a perícia para ${acao.nome}: ${candidatas.map((id) => regras?.pericias?.find((p) => p.id === id)?.nome ?? id).join(", ")}. Ex.: /a ${acao.nome} ${candidatas[0] ?? "Perícia"}` };
  const atributoId = regras?.pericias?.find((p) => p.id === periciaId)?.atributo_primario ?? "corpo";
  if (atributoId !== "corpo" && atributoId !== "mente" && atributoId !== "animo") return { ok: false, erro: "Atributo da ação indisponível." };
  return { ok: true, dados: { teste: { periciaId, atributoId, atributoValor: ficha.atributos[atributoId] }, custo: opcao?.custo.pa ?? acao.custo.pa ?? 0 } };
}

/** Prévia enxuta para pedir ao palco exatamente os d8 da ação. Não abre janela. */
export async function prepararAcaoChatAction(pedido: Pedido): Promise<ResultadoPainel<TesteAcao | null>> {
  try {
    const dados = await dadosAcao(pedido);
    if (!dados.ok || !dados.dados) return { ok: false, erro: dados.erro };
    const teste = testeDaAcao(dados.dados.item, dados.dados.regras, dados.dados.ficha, pedido.argumento);
    return teste.ok ? { ok: true, dados: teste.dados?.teste ?? null } : { ok: false, erro: teste.erro };
  } catch (e) { return { ok: false, erro: mensagemDeErro(e, "Falha ao preparar a ação.") }; }
}

/** Executa a ação pelo chat; o servidor relê ficha e catálogo antes de gastar PA ou publicar. */
export async function executarAcaoChatAction(pedido: Pedido & { dados?: number[] }): Promise<ResultadoPainel> {
  try {
    const contexto = await dadosAcao(pedido);
    if (!contexto.ok || !contexto.dados) return { ok: false, erro: contexto.erro };
    const { item, ficha, nome, regras, paMax, narrador } = contexto.dados;
    const visibilidade = visibilidadeSegura(pedido.visibilidade, narrador);
    const teste = testeDaAcao(item, regras, ficha, pedido.argumento);
    if (!teste.ok) return { ok: false, erro: teste.erro };
    if (teste.dados?.teste) {
      if (!pedido.dados) return { ok: false, erro: "Faltam os dados da ação." };
      const r = await registrarRolagemPericiaAction({
        campaignId: pedido.campaignId, characterId: pedido.characterId,
        atributoId: teste.dados.teste.atributoId, periciaId: teste.dados.teste.periciaId,
        modificador: 0, cd: null, dados: pedido.dados, visibilidade,
        intencao: { tipo: "AÇÃO", nome: item.acao.nome },
        origem: { rotulo: "Chat — Ação", source: "vtt_painel_chat_acao" },
      });
      if (!r.ok) return { ok: false, erro: r.erro };
    } else if (pedido.dados?.length) return { ok: false, erro: "Esta ação não pede dados." };
    const custo = teste.dados?.custo ?? 0;
    if (custo > 0) {
      const atual = await personagemPermitido(pedido.campaignId, pedido.characterId);
      if ("erro" in atual) return { ok: false, erro: atual.erro };
      const fichaAtual = normalizeCharacter(atual.record.payload);
      await updateCharacterSheetPayload(pedido.characterId, {
        ...fichaAtual,
        estado_jogo: { ...fichaAtual.estado_jogo, pa_gastos: somarPaGastos(fichaAtual.estado_jogo?.pa_gastos ?? 0, custo, paMax) },
      });
    }
    if (!teste.dados?.teste) {
      await addLog({ campaignId: pedido.campaignId, characterId: pedido.characterId, type: "chat", visibility: visibilidade,
        payload: { text: `${item.acao.nome}${custo ? ` · −${custo} PA` : ""}`, autorNome: nome, autorTipo: "personagem", characterId: pedido.characterId, characterNome: nome, source: "vtt_painel_chat_acao" } });
    }
    return { ok: true };
  } catch (e) { return { ok: false, erro: mensagemDeErro(e, "Falha ao executar a ação.") }; }
}

/** Conjura sem Console: valida aprendizado, custo, recursos e publica o mesmo card da ficha. */
export async function conjurarMagiaChatAction(pedido: Pedido): Promise<ResultadoPainel> {
  try {
    const acesso = await personagemPermitido(pedido.campaignId, pedido.characterId);
    if ("erro" in acesso) return { ok: false, erro: acesso.erro };
    const ficha = normalizeCharacter(acesso.record.payload);
    const visibilidade = visibilidadeSegura(pedido.visibilidade, acesso.narrador);
    const docs = await listSpellsEffective(pedido.campaignId);
    const spell = docs.map((doc) => normalizeSpellContent(doc.payload as Record<string, unknown>)).find((s) => s.slug === pedido.id && s.status === "published");
    if (!spell || !isSpellLearned(ficha, spell.slug)) return { ok: false, erro: "Magia não aprendida ou indisponível." };
    const escolhaCusto = getSpellCostChoice(spell);
    let argumento = normalizarComando(pedido.argumento ?? "");
    let custoManaEscolhido: number | undefined;
    if (escolhaCusto?.tipo === "nivel") {
      const match = /^nivel\s+(\d+)(?:\s+|$)/.exec(argumento);
      if (!match) return { ok: false, erro: `Escolha o nível. Ex.: /m ${spell.nome} nivel 2` };
      const nivel = Number(match[1]);
      const linha = escolhaCusto.tabela.linhas.find((l) => l.nivel === nivel);
      const nivelVertente = getVertenteLevel(ficha, spell.vertente);
      if (!linha || linha.mana == null || (nivelVertente != null && nivel > nivelVertente)) return { ok: false, erro: `Nível ${nivel} indisponível para ${spell.nome}.` };
      custoManaEscolhido = linha.mana;
      argumento = argumento.slice(match[0].length).trim();
    } else if (escolhaCusto?.tipo === "valor") {
      const match = /^mana\s+(\d+)(?:\s+|$)/.exec(argumento);
      if (!match) return { ok: false, erro: `Escolha a Mana. Ex.: /m ${spell.nome} mana ${escolhaCusto.min}` };
      const mana = Number(match[1]);
      if (!Number.isSafeInteger(mana) || mana < escolhaCusto.min || escolhaCusto.max != null && mana > escolhaCusto.max) return { ok: false, erro: `Mana fora da faixa de ${spell.nome}.` };
      custoManaEscolhido = mana;
      argumento = argumento.slice(match[0].length).trim();
    } else if (spell.estatisticas.custo_mana == null) {
      return { ok: false, erro: `${spell.nome} não tem custo de Mana definido no catálogo.` };
    }
    const escolhas: Record<string, string> = {};
    for (const escolha of spell.estatisticas.escolhasConjuracao ?? []) {
      const match = /^([^=\s]+)=([^\s]+)(?:\s+|$)/.exec(argumento);
      const opcao = match && normalizarComando(match[1]) === normalizarComando(escolha.id)
        ? escolha.opcoes.find((o) => normalizarComando(o.id) === normalizarComando(match[2]) || normalizarComando(o.nome) === normalizarComando(match[2]))
        : null;
      if (!opcao) return { ok: false, erro: `Escolha ${escolha.rotulo}: ${escolha.opcoes.map((o) => `${escolha.id}=${o.id}`).join(", ")}.` };
      escolhas[escolha.id] = opcao.id;
      argumento = argumento.slice(match![0].length).trim();
    }
    if (argumento) return { ok: false, erro: `Não reconheci "${argumento}" para ${spell.nome}.` };
    const vertenteLevel = getVertenteLevel(ficha, spell.vertente);
    const escolhaAplicada = aplicarEscolhasDeConjuracao(spell, escolhas, vertenteLevel);
    const magiaResolvida = escolhaAplicada.spell;
    const regrasDoc = await getCharacterRules().catch(() => null);
    const regras = (regrasDoc?.payload as CharacterRulesPayload | undefined) ?? null;
    const derivados = computeDerivedStats(ficha.atributos, regras, ficha.mana_bonus_ruptura ?? 0, characterDerivedFormulas(ficha));
    const cast = castSpell({ character: ficha, spell: magiaResolvida, paMax: derivados.pa_max, manaMax: derivados.mana_max, custoManaEscolhido });
    if (!cast.ok) return { ok: false, erro: cast.reason ?? "Conjuração não realizada." };
    const resolution = prepareSpellCastResolution(magiaResolvida, undefined, vertenteLevel);
    const attackRoll = resolution.attackProfile.isAttack ? rollSpellAttack({ spell: magiaResolvida, character: ficha, vertenteLevel }) : null;
    await updateCharacterSheetPayload(pedido.characterId, cast.character);
    const temporariaConsumida = (cast.manaTemporariaBefore ?? 0) - (cast.manaTemporariaAfter ?? 0);
    const longa = spell.descricao_longa?.trim() ?? "";
    const curta = spell.descricao_curta?.trim() ?? "";
    await addLog({ campaignId: pedido.campaignId, characterId: pedido.characterId, type: "spell_cast", visibility: visibilidade,
      payload: {
        characterId: pedido.characterId, characterNome: acesso.record.name, spellSlug: spell.slug, spellNome: spell.nome,
        vertente: spell.vertente, nivel: spell.estatisticas.nivel, tipoMagia: spell.estatisticas.tipo_magia,
        descricao: curta || null, efeito: (curta && longa.startsWith(curta) ? longa.slice(curta.length).trim() : longa) || null,
        alcance: spell.estatisticas.alcanceTexto ?? null, area: spell.estatisticas.areaTexto ?? null,
        duracao: spell.estatisticas.duracaoTexto ?? null, preRequisito: spell.estatisticas.preRequisito ?? null,
        conjuracaoTexto: spell.estatisticas.custo_pa === 0 ? spell.estatisticas.conjuracaoTexto ?? null : null,
        escolhas: escolhaAplicada.rotulos, manaPaga: custoManaEscolhido ?? spell.estatisticas.custo_mana, resolucao: resolution.resolucao,
        usaReacao: spell.estatisticas.usa_reacao, paCost: spell.estatisticas.custo_pa, paBefore: cast.paBefore,
        paAfter: cast.paAfter, manaCost: custoManaEscolhido ?? spell.estatisticas.custo_mana, manaCostUnknown: false,
        manaBefore: cast.manaBefore ?? null, manaAfter: cast.manaAfter ?? null, manaTemporariaConsumida: temporariaConsumida,
        resistance: resolution.resistance, damage: resolution.damage, manualEffects: resolution.manualEffects,
        reminders: resolution.reminders, source: "vtt_painel_chat_magia",
      } });
    if (resolution.attackProfile.isAttack) {
      await addLog({ campaignId: pedido.campaignId, characterId: pedido.characterId, type: "spell_attack_used", visibility: visibilidade,
        payload: {
          characterId: pedido.characterId, characterNome: acesso.record.name, spellSlug: spell.slug, spellId: spell.slug,
          spellName: spell.nome, spellVertente: spell.vertente, spellLevel: spell.estatisticas.nivel,
          casterVertenteLevel: vertenteLevel, attackAttribute: resolution.attackProfile.attackAttribute,
          attackSkill: resolution.attackProfile.attackSkill, dice: attackRoll?.dice ?? null,
          highestDie: attackRoll?.highestDie ?? null, skillValue: attackRoll?.skillValue ?? null,
          modifiersTotal: attackRoll?.modifiersTotal ?? null, total: attackRoll?.total ?? null,
          damageFormula: resolution.damage?.formula ?? null, damageRolled: resolution.damage?.result ?? null,
          damageType: resolution.damage?.tipoDano ?? null, range: spell.estatisticas.alcanceTexto ?? null,
          area: spell.estatisticas.areaTexto ?? spell.estatisticas.areaTipo ?? null,
          resistance: resolution.resistance, reminders: resolution.reminders, source: "vtt_painel_chat_magia",
        } });
    }
    return { ok: true };
  } catch (e) { return { ok: false, erro: mensagemDeErro(e, "Falha ao conjurar a magia.") }; }
}
