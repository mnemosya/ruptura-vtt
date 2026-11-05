/**
 * Escalpos instalados — checkpoint v0.54 (achado "conteúdo pronto mas
 * não exposto" da auditoria v0.50, fase 1 do checkpoint que se segue à
 * Biblioteca de consulta do v0.53).
 *
 * Escopo deliberadamente pequeno: instância PASSIVA referenciando o
 * MODELO publicado (`content_documents`, content_type="escalpo",
 * `listEscalpos()`) por slug — nunca uma cópia do payload, nunca um
 * catálogo manual. Instalar/remover só edita
 * `character.escalpos_instalados`; NENHUM efeito mecânico é aplicado
 * aqui (isso é escopo da Fase 2 deste checkpoint, se o payload
 * permitir com segurança — ver `deriveInstalledTechnicalEffects` em
 * `technicalEffects.ts`).
 */

import type { Character } from "./types";

export const ARS_CONTENT_ID = "escalpos_armadura_reativa_subdermica_ars";
export const ARS_REGIOES = [
  { id: "bracos", nome: "Braços", mit: 3 },
  { id: "cabeca", nome: "Cabeça", mit: 2 },
  { id: "pernas", nome: "Pernas", mit: 3 },
  { id: "tronco", nome: "Tronco", mit: 4 },
] as const;
export type ArsRegiao = (typeof ARS_REGIOES)[number]["id"];

export interface InstalledEscalpo {
  id: string;
  /** slug do content_documents (content_type="escalpo"). */
  contentId: string;
  nomeCustomizado?: string;
  notas?: string;
  /** Região protegida pela ARS. Instalações antigas podem não ter este campo. */
  regiaoArs?: ArsRegiao;
  arsAtiva?: boolean;
  arsMitAtual?: number;
  /** 0 íntegro, 1 danificado, 2 inativo (capítulo Escalpos v1.2). */
  desgaste?: 0 | 1 | 2;
  instaladoEm: string;
}

/** Instala um escalpo (referência ao modelo por slug) — sempre cria uma nova instância, mesmo repetindo o mesmo slug (ex.: dois implantes iguais em membros diferentes). */
export function installEscalpo(
  character: Character,
  params: { contentId: string; nomeCustomizado?: string; notas?: string; regiaoArs?: ArsRegiao; nowIso: string },
): Character {
  const atuais = character.escalpos_instalados ?? [];
  if (params.contentId === ARS_CONTENT_ID && !ARS_REGIOES.some(r => r.id === params.regiaoArs)) return character;
  if (params.contentId === ARS_CONTENT_ID && params.regiaoArs && atuais.some(e => e.contentId === ARS_CONTENT_ID && e.regiaoArs === params.regiaoArs)) return character;
  const nova: InstalledEscalpo = {
    id: crypto.randomUUID(),
    contentId: params.contentId,
    nomeCustomizado: params.nomeCustomizado?.trim() || undefined,
    notas: params.notas?.trim() || undefined,
    regiaoArs: params.contentId === ARS_CONTENT_ID ? params.regiaoArs : undefined,
    arsAtiva: params.contentId === ARS_CONTENT_ID ? false : undefined,
    desgaste: 0,
    instaladoEm: params.nowIso,
  };
  return { ...character, escalpos_instalados: [...atuais, nova] };
}

export function arsMitMax(regiao: ArsRegiao): number {
  return ARS_REGIOES.find(r => r.id === regiao)!.mit;
}

export function arsDaRegiao(character: Pick<Character, "escalpos_instalados">, regiao: ArsRegiao) {
  const instancia = (character.escalpos_instalados ?? []).find(e => e.contentId === ARS_CONTENT_ID && e.regiaoArs === regiao && e.arsAtiva && (e.desgaste ?? 0) === 0);
  if (!instancia) return null;
  const max = arsMitMax(regiao);
  return { instancia, max, atual: Math.max(0, Math.min(max, instancia.arsMitAtual ?? max)) };
}

export function setArsMitAtual(character: Character, instanceId: string, valor: number): Character {
  return { ...character, escalpos_instalados: (character.escalpos_instalados ?? []).map(e => e.id === instanceId && e.contentId === ARS_CONTENT_ID && e.regiaoArs
    ? { ...e, arsMitAtual: Math.max(0, Math.min(arsMitMax(e.regiaoArs), valor)) } : e) };
}

/** Ativa todas as regiões instaladas de uma vez e consome 1 PA. */
export function ativarArs(character: Character, paMax: number): { character: Character; reason?: string } {
  const instaladas = (character.escalpos_instalados ?? []).filter(e => e.contentId === ARS_CONTENT_ID && e.regiaoArs && (e.desgaste ?? 0) === 0);
  if (!instaladas.length) return { character, reason: "Nenhuma região da ARS instalada." };
  if (instaladas.every(e => e.arsAtiva)) return { character, reason: "ARS já está ativa." };
  if ((character.estado_jogo?.pa_gastos ?? 0) >= paMax) return { character, reason: "PA insuficiente para ativar a ARS." };
  return { character: { ...character, estado_jogo: { ...character.estado_jogo, pa_gastos: (character.estado_jogo?.pa_gastos ?? 0) + 1 }, escalpos_instalados: (character.escalpos_instalados ?? []).map(e => e.contentId === ARS_CONTENT_ID && e.regiaoArs && (e.desgaste ?? 0) === 0 ? { ...e, arsAtiva: true } : e) } };
}

export function desativarArs(character: Character): Character {
  return { ...character, escalpos_instalados: (character.escalpos_instalados ?? []).map(e => e.contentId === ARS_CONTENT_ID && e.regiaoArs ? { ...e, arsAtiva: false } : e) };
}

export function restaurarArsDescansoLongo(character: Character): Character {
  return { ...character, escalpos_instalados: (character.escalpos_instalados ?? []).map(e => e.contentId === ARS_CONTENT_ID && e.regiaoArs ? { ...e, arsMitAtual: arsMitMax(e.regiaoArs) } : e) };
}

/** Registro manual de dano/reparo. Descanso nunca altera Desgaste. */
export function definirDesgasteEscalpo(character: Character, instanceId: string, desgaste: 0 | 1 | 2): Character {
  if (![0, 1, 2].includes(desgaste)) return character;
  const atuais = character.escalpos_instalados ?? [];
  if (!atuais.some((instancia) => instancia.id === instanceId)) return character;
  return { ...character, escalpos_instalados: atuais.map((instancia) =>
    instancia.id === instanceId
      ? { ...instancia, desgaste, ...(desgaste > 0 && instancia.contentId === ARS_CONTENT_ID ? { arsAtiva: false } : {}) }
      : instancia,
  ) };
}

/** Remove só a instância do personagem — nunca toca no modelo da Biblioteca. */
export function removeInstalledEscalpo(character: Character, instanceId: string): Character {
  const atuais = character.escalpos_instalados ?? [];
  const next = atuais.filter((e) => e.id !== instanceId);
  if (next.length === atuais.length) return character;
  return { ...character, escalpos_instalados: next };
}
