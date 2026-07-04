/**
 * Efeitos passivos de Escalpos/Runas instalados — checkpoint v0.55
 * (escalpos) e v0.57 (runas), fases do checkpoint iniciado no
 * v0.53/v0.54 (achado "conteúdo pronto mas não exposto" da auditoria
 * v0.50).
 *
 * Auditoria do payload real (`db_escalpos_normalizado_v1_3.json`):
 * 16 dos 58 escalpos têm `payload_automacao.efeitos[].tipo==="modificador"`
 * no MESMO formato já automatizado por talentos (v0.48) —
 * `valor: number` + `alvo_tags: string[]`. Esse é o ÚNICO padrão
 * automatizado para escalpos, pelo MESMO critério de segurança de
 * `deriveActiveEffectsFromTalents`: sem "quando" (condicional), sem
 * alvo/contexto que o VTT ainda não modela.
 *
 * Auditoria do payload real de runas (`db_runas_normalizado_v1_2.json`,
 * checkpoint v0.57): 12 das 40 runas têm `tipo==="modificador"`, mas
 * usam o campo `bonus` (não `valor`) e a maioria descreve um `efeito`
 * TEXTUAL (ex.: "torna_ocultavel", "ataques_sem_ruido") sem número
 * nenhum — não automatizável sem inventar regra. Só 1 runa
 * (`runa_fogo_estabilidade`) tem `bonus` numérico + `alvo_tags` +
 * NENHUMA restrição adicional (`restrito_a`/`quando`/`gatilho`) —
 * automatizada aqui. `runa_escudo_guarda` tem o mesmo formato mas com
 * `restrito_a:"bloquear"` (efeito só vale numa ação específica que o
 * motor de rolagem não sabe distinguir) — FICA DE FORA de propósito,
 * mesmo critério de "quando" condicional. Os outros 9 tipos
 * (`dano_modificador`, `efeito_com_resistencia`, `aplicar_condicao`,
 * `recurso`, `protecao`, `ataque_adicional`, `economia_pa`,
 * `autorreparo`, `revelar`, `reacao`, `narrativo`) exigem alvo
 * estruturado, sistema de dano de arma, MIT/PD, ou economia de PA que
 * o VTT ainda não modela — documentados em
 * `docs/RELATORIO_AUTOMACAO_RUNAS.md`, não automatizados.
 *
 * Só gera efeito para instâncias INSTALADAS (escalpos:
 * `character.escalpos_instalados`; runas: `character.inventario[].
 * runasInstaladas`) — nunca para o catálogo inteiro da Biblioteca.
 * Remover a instância remove o efeito (função pura, recalculada a cada
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

/**
 * Deriva os `ActiveEffect` das runas INSTALADAS em itens do inventário
 * (`character.inventario[].runasInstaladas`) — checkpoint v0.57. Único
 * padrão automatizado: `tipo==="modificador"` com `bonus` (ou `valor`,
 * caso algum registro futuro use o outro nome) numérico + `alvo_tags`
 * não vazio, e SEM `restrito_a`/`quando`/`gatilho` (qualquer um desses
 * indica que o bônus só vale num contexto que o motor de rolagem ainda
 * não distingue — preservado como não-automatizado, nunca aplica um
 * número indevido). Item sem modelo/rune sem modelo publicado são
 * ignorados silenciosamente.
 */
export function deriveInstalledRuneEffects(
  character: Pick<Character, "inventario">,
  runes: TechnicalContentItem[],
): ActiveEffect[] {
  const bySlug = new Map(runes.map((r) => [r.slug, r]));
  const effects: ActiveEffect[] = [];

  for (const instance of character.inventario ?? []) {
    for (const instalacao of instance.runasInstaladas ?? []) {
      const modelo = bySlug.get(instalacao.runeContentId);
      if (!modelo || modelo.status !== "published") continue;

      getEscalpoEffects(modelo).forEach((efeito, index) => {
        if (efeito.tipo !== "modificador") return;
        if (efeito.quando != null || efeito.restrito_a != null || efeito.gatilho != null) return; // contexto que o motor ainda não distingue.
        const bonus = efeito.bonus ?? efeito.valor;
        const alvoTags = Array.isArray(efeito.alvo_tags) ? efeito.alvo_tags.filter((t): t is string => typeof t === "string") : [];
        if (typeof bonus !== "number" || alvoTags.length === 0) return;

        const nome = `${modelo.nome} (Runa em ${instance.itemNome})`;
        const alvoTexto = alvoTags.join(", ");
        effects.push({
          id: `rune:${instalacao.id}:${index}`,
          sourceType: "rune",
          sourceId: modelo.slug,
          sourceName: nome,
          affectedTags: alvoTags,
          modifier: bonus,
          explanation: `${nome}: ${bonus >= 0 ? "+" : ""}${bonus} em ${alvoTexto}.`,
          enabledByDefault: true,
          kind: "modifier",
          reversible: true,
        });
      });
    }
  }

  return effects;
}
