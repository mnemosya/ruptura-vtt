/**
 * Efeitos passivos de Escalpos instalados — checkpoint v0.55, fase 2
 * do checkpoint iniciado no v0.53/v0.54 (achado "conteúdo pronto mas
 * não exposto" da auditoria v0.50).
 *
 * Auditoria do payload real (`db_escalpos_normalizado_v1_3.json`):
 * 16 dos 58 escalpos têm `payload_automacao.efeitos[].tipo==="modificador"`
 * no MESMO formato já automatizado por talentos (v0.48) —
 * `valor: number` + `alvo_tags: string[]`. Esse é o ÚNICO padrão
 * automatizado aqui, pelo MESMO critério de segurança de
 * `deriveActiveEffectsFromTalents`: sem "quando" (condicional), sem
 * alvo/contexto que o VTT ainda não modela. Os outros 27 tipos
 * (`mit_subdermico`, `abrir_pool_de_espaco`, `acao_ativa`,
 * `arma_ou_ataque_integrado`, `escudo_integrado`, etc.) são
 * heterogêneos demais e/ou dependem de PA/ativação/dano/contexto —
 * FICAM DE FORA de propósito, sem virar automação alguma (nem
 * warning: a Biblioteca já mostra o texto completo do escalpo para
 * leitura manual, ver `BibliotecaTab.tsx`).
 *
 * Só gera efeito para escalpos INSTALADOS (`character.escalpos_
 * instalados`) — nunca para o catálogo inteiro da Biblioteca. Remover
 * a instância remove o efeito (função pura, recalculada a cada
 * render). Modelo ausente/despublicado é ignorado silenciosamente
 * (mesmo padrão de condição/talento sem correspondência).
 */

import type { ActiveEffect } from "./activeEffects";
import type { Character } from "./types";
import type { TechnicalContentItem } from "../content";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function getEscalpoEffects(item: TechnicalContentItem): Record<string, unknown>[] {
  const payload = asRecord(item.payloadAutomacao);
  const efeitos = payload?.efeitos;
  return Array.isArray(efeitos) ? efeitos.filter((e): e is Record<string, unknown> => asRecord(e) !== null) : [];
}

/**
 * Deriva os `ActiveEffect` dos escalpos INSTALADOS — mesmo formato/
 * critério de `deriveActiveEffectsFromTalents`: só `tipo==="modificador"`
 * com `valor` numérico e `alvo_tags` não vazio, e SEM `quando`
 * (efeito condicional preservado como não-automatizado, nunca aplica
 * um número indevido).
 */
export function deriveInstalledTechnicalEffects(
  character: Pick<Character, "escalpos_instalados">,
  escalpos: TechnicalContentItem[],
): ActiveEffect[] {
  const bySlug = new Map(escalpos.map((e) => [e.slug, e]));
  const effects: ActiveEffect[] = [];

  for (const instancia of character.escalpos_instalados ?? []) {
    const modelo = bySlug.get(instancia.contentId);
    if (!modelo || modelo.status !== "published") continue;

    getEscalpoEffects(modelo).forEach((efeito, index) => {
      if (efeito.tipo !== "modificador") return;
      if (efeito.quando != null) return; // condicional — não automatizado nesta fase, sem inventar contexto.
      const valor = efeito.valor;
      const alvoTags = Array.isArray(efeito.alvo_tags) ? efeito.alvo_tags.filter((t): t is string => typeof t === "string") : [];
      if (typeof valor !== "number" || alvoTags.length === 0) return;

      const nome = instancia.nomeCustomizado || modelo.nome;
      const alvoTexto = typeof efeito.alvo_texto === "string" ? efeito.alvo_texto : alvoTags.join(", ");
      effects.push({
        id: `escalpo:${instancia.id}:${index}`,
        sourceType: "escalpo",
        sourceId: modelo.slug,
        sourceName: nome,
        affectedTags: alvoTags,
        modifier: valor,
        explanation: `${nome} (Escalpo): ${valor >= 0 ? "+" : ""}${valor} em ${alvoTexto}.`,
        enabledByDefault: true,
        kind: "modifier",
        reversible: true,
      });
    });
  }

  return effects;
}
