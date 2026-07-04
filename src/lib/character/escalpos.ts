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

export interface InstalledEscalpo {
  id: string;
  /** slug do content_documents (content_type="escalpo"). */
  contentId: string;
  nomeCustomizado?: string;
  notas?: string;
  instaladoEm: string;
}

/** Instala um escalpo (referência ao modelo por slug) — sempre cria uma nova instância, mesmo repetindo o mesmo slug (ex.: dois implantes iguais em membros diferentes). */
export function installEscalpo(
  character: Character,
  params: { contentId: string; nomeCustomizado?: string; notas?: string; nowIso: string },
): Character {
  const atuais = character.escalpos_instalados ?? [];
  const nova: InstalledEscalpo = {
    id: crypto.randomUUID(),
    contentId: params.contentId,
    nomeCustomizado: params.nomeCustomizado?.trim() || undefined,
    notas: params.notas?.trim() || undefined,
    instaladoEm: params.nowIso,
  };
  return { ...character, escalpos_instalados: [...atuais, nova] };
}

/** Remove só a instância do personagem — nunca toca no modelo da Biblioteca. */
export function removeInstalledEscalpo(character: Character, instanceId: string): Character {
  const atuais = character.escalpos_instalados ?? [];
  const next = atuais.filter((e) => e.id !== instanceId);
  if (next.length === atuais.length) return character;
  return { ...character, escalpos_instalados: next };
}
