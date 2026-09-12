"use client";

/**
 * Despacho de UMA entrada do feed para o card certo.
 *
 * É um `switch` sobre a união discriminada de `contratos.ts` — e o
 * TypeScript garante exaustividade: um `kind` novo sem card quebra o
 * build em vez de cair silenciosamente num render genérico. Não existe
 * `GenericLogCard`, de propósito.
 */

import { Lock, ShieldAlert } from "lucide-react";
import { ChatMessageEntry } from "./ChatMessageEntry";
import { RollCard } from "./RollCard";
import { ContentReferenceCard, ContentUseCard } from "./ContentReferenceCard";
import { AttackWorkflowCard } from "./AttackWorkflowCard";
import { SpellCastWorkflowCard } from "./SpellCastWorkflowCard";
import { CombatDivider, EffectApplicationCard, PendingCheckCard, TurnResolutionCard } from "./CombatCards";
import { CollapseCard, OverloadCard, RestCard, RuptureCard } from "./EstadoCards";
import { ehContinuacao, rotuloVisibilidade, type CartaoFeed } from "./contratos";

function horaCurta(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Selo de visibilidade reutilizado por todos os cards mecânicos. */
function Visibilidade({ cartao, papel }: { cartao: CartaoFeed; papel: "narrator" | "player" }) {
  const rotulo = rotuloVisibilidade(cartao.visibilidade, papel);
  if (!rotulo) return null;
  return (
    <span className="pn-msg-selo" data-acento={cartao.visibilidade === "gm" ? "am" : "neutro"} data-testid="painel-feed-selo-visibilidade">
      {cartao.visibilidade === "gm" ? <ShieldAlert size={9} aria-hidden="true" /> : <Lock size={9} aria-hidden="true" />}
      {rotulo}
    </span>
  );
}

export interface AcoesFeed {
  /** Aplicação de dano de um ataque — server-side e idempotente. */
  onAplicarDano: (cartaoId: string) => void;
  aplicandoId: string | null;
  errosPorCartao: Record<string, string>;
  /** Ação EXPLÍCITA de centralizar a câmera num token (a única exceção ao invariante de não mexer na cena). */
  onFocarToken?: (tokenId: string) => void;
  podeAplicarDano: boolean;
}

export function EntradaFeed({
  cartao,
  anterior,
  papel,
  expandidos,
  onAlternar,
  acoes,
  pendente,
}: {
  cartao: CartaoFeed;
  anterior: CartaoFeed | undefined;
  papel: "narrator" | "player";
  expandidos: ReadonlySet<string>;
  onAlternar: (id: string) => void;
  acoes: AcoesFeed;
  pendente?: boolean;
}) {
  const hora = horaCurta(cartao.criadoEm);
  const expandido = expandidos.has(cartao.id);
  const alternar = () => onAlternar(cartao.id);
  const vis = <Visibilidade cartao={cartao} papel={papel} />;

  switch (cartao.kind) {
    case "mensagem":
      return (
        <ChatMessageEntry
          cartao={cartao}
          papel={papel}
          hora={hora}
          continuacao={ehContinuacao(cartao, anterior)}
          pendente={pendente}
        />
      );
    case "rolagem":
      // Sem `expandido`/`alternar`: nenhum dos dois desenhos de
      // rolagem tem gaveta — dados e modificadores ficam à mostra.
      return <RollCard cartao={cartao} hora={hora} visibilidade={vis} />;
    case "referencia":
      return <ContentReferenceCard cartao={cartao} hora={hora} expandido={expandido} onAlternar={alternar} visibilidade={vis} />;
    case "uso":
      return <ContentUseCard cartao={cartao} hora={hora} expandido={expandido} onAlternar={alternar} visibilidade={vis} />;
    case "ataque":
      return (
        <AttackWorkflowCard
          cartao={cartao}
          hora={hora}
          expandido={expandido}
          onAlternar={alternar}
          visibilidade={vis}
          podeAplicar={acoes.podeAplicarDano}
          aplicando={acoes.aplicandoId === cartao.id}
          erro={acoes.errosPorCartao[cartao.id] ?? null}
          onAplicarDano={() => acoes.onAplicarDano(cartao.id)}
          onFocarAlvo={acoes.onFocarToken}
        />
      );
    case "magia":
      return <SpellCastWorkflowCard cartao={cartao} hora={hora} expandido={expandido} onAlternar={alternar} visibilidade={vis} />;
    case "efeito":
      return <EffectApplicationCard cartao={cartao} hora={hora} expandido={expandido} onAlternar={alternar} visibilidade={vis} />;
    case "colapso":
      return <CollapseCard cartao={cartao} hora={hora} expandido={expandido} onAlternar={alternar} visibilidade={vis} />;
    case "sobrecarga":
      return <OverloadCard cartao={cartao} hora={hora} visibilidade={vis} />;
    case "descanso":
      return <RestCard cartao={cartao} hora={hora} visibilidade={vis} />;
    case "ruptura":
      return <RuptureCard cartao={cartao} hora={hora} visibilidade={vis} />;
    case "resolucao":
      return <TurnResolutionCard cartao={cartao} hora={hora} expandido={expandido} onAlternar={alternar} visibilidade={vis} />;
    case "divisor":
      return <CombatDivider cartao={cartao} />;
    case "pendencia":
      return <PendingCheckCard cartao={cartao} hora={hora} visibilidade={vis} />;
  }
}
