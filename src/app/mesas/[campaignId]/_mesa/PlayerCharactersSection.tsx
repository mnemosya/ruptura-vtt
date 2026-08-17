"use client";

/**
 * "Seus personagens" — a composição própria da Mesa do jogador (Fase 4,
 * arquitetura do plano). Narrador tem "Resolver Ataque"; jogador tem
 * isto: os personagens que controla (`viewer.controlledCharacterIds`),
 * atalho pra abrir cada ficha, "é a sua vez" por personagem e alertas
 * de colapso/condições ativas — os dados que já vêm de graça no mesmo
 * `CharacterRecord` de `listControlledCharacters` (PV/PE/Mana/
 * Integridade ATUAIS, colapso, condições — tudo no `payload`, sem
 * consulta extra). O que NÃO entra aqui, de propósito: valores MÁXIMOS
 * (exigem `getCharacterRules()` + `computeDerivedStats`, uma leitura a
 * mais só pra isto) e "atividade recente" (o `SessionPanel` da casca já
 * mostra o log persistente em qualquer rota — duplicar aqui seria o
 * mesmo dado dividido em dois lugares, não um dado novo).
 *
 * Link client-side pra `/ficha` — abre como modal por cima desta
 * página via a rota interceptada já existente
 * (`src/app/mesas/@modal/(...)ficha/page.tsx`), sem decisão de
 * arquitetura nova.
 *
 * `personagens`/`erro` chegam do estado do `MesaClient.tsx`, não são
 * mais só o snapshot do SSR — correção pós-auditoria da Fase 4: sem
 * releitura, PV/PE/condições/colapso e a lista de personagens
 * controlados ficavam congelados até um refresh de página, inclusive
 * depois de editar a própria ficha no modal. `MesaClient` recarrega em
 * 3 gatilhos (Realtime do canal `characters`, mudança de
 * `viewer.controlledCharacterIds`, fechamento do modal da ficha) e
 * nunca troca cards válidos por vazio quando só a RELEITURA falha — daí
 * `erro` ser um campo separado de `personagens`, não algo que zera a
 * lista.
 */
import Link from "next/link";
import { isParticipantTurnNow, type TurnTrackState } from "../../../../lib/table/turnTrack";
import type { CharacterRecord } from "../../../../lib/character";

function ConditionBadges({ character }: { character: CharacterRecord }) {
  const payload = character.payload as { condicoes_ativas?: { id: string; nome: string; ativa: boolean }[] };
  const ativas = (payload.condicoes_ativas ?? []).filter((c) => c.ativa);
  if (ativas.length === 0) return null;
  const visiveis = ativas.slice(0, 3);
  const resto = ativas.length - visiveis.length;
  return (
    <div className="rm-charcard-alertas">
      {visiveis.map((c) => (
        <span key={c.id} className="rm-badge rm-badge--warn">{c.nome}</span>
      ))}
      {resto > 0 && <span className="rm-badge rm-badge--dim">+{resto}</span>}
    </div>
  );
}

function CollapseBadge({ character }: { character: CharacterRecord }) {
  const payload = character.payload as {
    colapso?: { ativo: boolean; tipo: "pv" | "pe" | null; desfecho?: "morte" | "coma" | null };
  };
  const colapso = payload.colapso;
  if (!colapso?.ativo) return null;
  if (colapso.desfecho === "morte") return <span className="rm-badge rm-badge--danger">Morte</span>;
  if (colapso.desfecho === "coma") return <span className="rm-badge rm-badge--danger">Coma</span>;
  // `tipo` pode chegar `null` (ou outro valor fora de "pv"/"pe") — rotular
  // como "(físico)" por padrão nesse caso seria afirmar um tipo que os
  // dados não confirmam. Fallback neutro: sem qualificador.
  const rotuloTipo = colapso.tipo === "pv" ? " (físico)" : colapso.tipo === "pe" ? " (mental)" : "";
  return <span className="rm-badge rm-badge--danger">Em colapso{rotuloTipo}</span>;
}

function CharacterCard({
  character,
  campaignId,
  suaVezAgora,
}: {
  character: CharacterRecord;
  campaignId: string;
  suaVezAgora: boolean;
}) {
  const payload = character.payload as { recursos_atuais?: { pv?: number; pe?: number; mana?: number; integridade?: number } };
  const recursos = payload.recursos_atuais ?? {};
  const vitais: { label: string; valor: number }[] = [];
  if (typeof recursos.pv === "number") vitais.push({ label: "PV", valor: recursos.pv });
  if (typeof recursos.pe === "number") vitais.push({ label: "PE", valor: recursos.pe });
  if (typeof recursos.mana === "number") vitais.push({ label: "Mana", valor: recursos.mana });
  if (typeof recursos.integridade === "number") vitais.push({ label: "Integridade", valor: recursos.integridade });

  return (
    <div className="rm-card" data-testid="mesa-jogador-personagem-card" data-character-id={character.id}>
      <div className="rm-card-row">
        <span className="rm-charcard-nome">{character.name}</span>
        {suaVezAgora && <span className="rm-badge" data-testid="mesa-jogador-sua-vez">Sua vez</span>}
      </div>
      {vitais.length > 0 && (
        <div className="rm-charcard-vitais">
          {vitais.map((v) => (
            <span key={v.label} data-testid={`mesa-jogador-vital-${v.label.toLowerCase()}`}>
              {v.label} <strong>{v.valor}</strong>
            </span>
          ))}
        </div>
      )}
      <CollapseBadge character={character} />
      <ConditionBadges character={character} />
      <div className="rm-charcard-acao">
        <Link
          href={`/ficha?campaignId=${campaignId}&characterId=${character.id}`}
          className="rm-btn rm-btn-primary rv-focusable"
          data-testid="mesa-jogador-abrir-ficha"
        >
          Abrir ficha
        </Link>
      </div>
    </div>
  );
}

export function PlayerCharactersSection({
  campaignId,
  personagens,
  turnTrack,
  erro,
  onTentarDeNovo,
}: {
  campaignId: string;
  personagens: CharacterRecord[];
  turnTrack: TurnTrackState;
  /** Falha da leitura mais recente (SSR ou releitura) — distinta de "vazio de verdade": nunca reescreve `personagens` sozinha, os cards já carregados continuam de pé. */
  erro: string | null;
  onTentarDeNovo: () => void;
}) {
  return (
    <section aria-labelledby="mesa-jogador-heading" style={{ marginBottom: 32 }}>
      <h2 id="mesa-jogador-heading" className="rm-section-title">Seus personagens</h2>

      {erro && (
        <p role="alert" className="rm-erro" data-testid="mesa-jogador-erro" style={{ marginBottom: 12 }}>
          Erro: {erro}{" "}
          <button type="button" className="rm-btn rm-btn-ghost rv-focusable" onClick={onTentarDeNovo} data-testid="mesa-jogador-tentar-de-novo" style={{ marginLeft: 8 }}>
            Tentar de novo
          </button>
        </p>
      )}

      {personagens.length === 0 ? (
        // Vazio de verdade só é vazio de verdade quando a leitura não
        // falhou — com `erro` de pé, o banner acima já cobre o caso;
        // afirmar "você não controla personagem nenhum" aqui seria
        // apresentar uma falha de consulta como fato sobre a campanha.
        !erro && (
          <p className="rm-empty" data-testid="mesa-jogador-vazio">
            Você não controla nenhum personagem nesta campanha ainda.
          </p>
        )
      ) : (
        <div className="rm-card-grid">
          {personagens.map((c) => (
            <CharacterCard key={c.id} character={c} campaignId={campaignId} suaVezAgora={isParticipantTurnNow(turnTrack, c.id)} />
          ))}
        </div>
      )}
    </section>
  );
}
