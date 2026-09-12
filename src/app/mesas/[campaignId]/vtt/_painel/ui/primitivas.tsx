"use client";

/**
 * PRIMITIVAS TÉCNICAS do painel — o vocabulário visual compartilhado
 * por todos os cards, abas e janelas internas.
 *
 * Não é um sistema de design novo. É a MESMA linguagem do Console do
 * Personagem (`src/app/_design/console.css`), extraída para os
 * componentes que o painel precisa e que o Console não expõe como
 * primitiva reutilizável:
 *
 *   · `Modulo`      ← anatomia de `.rc-skill` (badge de ícone com
 *                     borda própria + corpo com label mono + valor)
 *   · `Chip`        ← `.rc-ncond-tag` / `.rc-dock-tag`
 *   · `Caption`     ← `.rc-caption` / `.rc-nres-caption` (selo de seção)
 *   · `FaixaResultado` ← trilha de recurso `.rc-nres-track` virada em
 *                     faixa de resultado forte
 *   · `BotaoTecnico`← `.rc-ghost` / `.rc-ncol-estabilizar`
 *   · `Painel`      ← `.rc-panel` (canto cortado, borda 1px)
 *
 * As cores são as MESMAS: ciano estrutural (#00d4ff), âmbar contextual
 * (#f5a200), vermelho de perigo (#ff5f74), verde de sucesso (#3ddc9a),
 * violeta de Mana/magia (#a78bfa). Nada de paleta arbitrária por tipo
 * de evento — o tipo se distingue por LINHA DE ACENTO, LABEL e ÍCONE,
 * nunca por um fundo colorido inteiro.
 */

import type { ReactNode } from "react";

/** Acento semântico — a única dimensão de cor que um card escolhe. */
export type Acento = "cy" | "am" | "perigo" | "ok" | "mana" | "magenta" | "neutro";

/**
 * Selo de seção — o `[RECURSOS]` / `[PERÍCIAS]` do Console, na escala
 * do painel. Mono, caixa alta, tracking largo.
 */
export function Caption({ children, acento = "cy" }: { children: ReactNode; acento?: Acento }) {
  return (
    <span className="pn-caption" data-acento={acento}>
      {children}
    </span>
  );
}

/** Label mono de metadado — tipo de evento, nome de campo, unidade. */
export function Label({ children, acento = "cy" }: { children: ReactNode; acento?: Acento }) {
  return (
    <span className="pn-label" data-acento={acento}>
      {children}
    </span>
  );
}

/**
 * Chip técnico — tag, categoria, estado. Pequeno, mono, borda 1px.
 * `icone` entra antes do texto; nunca um emoji (ícones vêm de
 * `lucide-react`, o mesmo conjunto do resto do VTT).
 */
export function Chip({
  children,
  acento = "neutro",
  icone,
  titulo,
  testId,
}: {
  children: ReactNode;
  acento?: Acento;
  icone?: ReactNode;
  titulo?: string;
  testId?: string;
}) {
  return (
    <span className="pn-chip" data-acento={acento} title={titulo} data-testid={testId}>
      {icone && <span className="pn-chip-ico" aria-hidden="true">{icone}</span>}
      {children}
    </span>
  );
}

/** Linha de chips que quebra sozinha em largura estreita. */
export function Chips({ children }: { children: ReactNode }) {
  return <div className="pn-chips">{children}</div>;
}

/**
 * MÓDULO TÉCNICO — a peça central dos cards mecânicos.
 *
 * É a anatomia do card de perícia do Console: um badge de ícone com
 * borda e fundo próprios à esquerda, e um corpo com o rótulo mono em
 * cima e o valor grande embaixo. É o que desenha `DES 6`, `MOD +0`,
 * `ND 10`, `PA 3`, `MANA 2` — sempre a mesma peça, sempre a mesma
 * densidade, mudando só o acento.
 *
 * `sub` é o "dado do atributo" da referência (ex.: `1D8`) — some
 * quando não existe, sem deixar buraco.
 */
export function Modulo({
  rotulo,
  valor,
  sub,
  icone,
  acento = "cy",
  destaque,
  titulo,
  testId,
}: {
  rotulo: string;
  valor: ReactNode;
  sub?: ReactNode;
  icone?: ReactNode;
  acento?: Acento;
  /** Módulo do resultado principal — tipografia maior. */
  destaque?: boolean;
  titulo?: string;
  testId?: string;
}) {
  return (
    <div className="pn-modulo" data-acento={acento} data-destaque={destaque ? "true" : undefined} title={titulo} data-testid={testId}>
      {icone && <span className="pn-modulo-ico" aria-hidden="true">{icone}</span>}
      <span className="pn-modulo-corpo">
        <span className="pn-modulo-rotulo">{rotulo}</span>
        <span className="pn-modulo-valor">
          {valor}
          {sub != null && <span className="pn-modulo-sub">{sub}</span>}
        </span>
      </span>
    </div>
  );
}

/**
 * Grade de módulos. Em largura estreita cai para duas colunas e depois
 * uma — nunca estoura em rolagem horizontal (requisito de
 * responsividade do painel).
 */
export function Modulos({ children, colunas = 4 }: { children: ReactNode; colunas?: 2 | 3 | 4 }) {
  return (
    <div className="pn-modulos" data-colunas={colunas}>
      {children}
    </div>
  );
}

/**
 * FAIXA DE RESULTADO — a barra horizontal forte que fecha uma
 * resolução (`ACERTO`, `FALHA`, `9`, `SUCESSO PADRÃO`).
 *
 * Herda a geometria da trilha de recurso do Console (`.rc-nres-track`):
 * borda 1px, cantos duros, preenchimento sólido no estado — nunca um
 * gradiente decorativo. A cor vem do acento; o TEXTO nunca depende só
 * dela (sempre há rótulo escrito), atendendo "cor nunca como único
 * indicador".
 */
export function FaixaResultado({
  rotulo,
  valor,
  icone,
  acento = "cy",
  pulso,
  testId,
}: {
  rotulo: ReactNode;
  valor?: ReactNode;
  icone?: ReactNode;
  acento?: Acento;
  /** Pulso curto de borda ao chegar um resultado novo. Respeita `prefers-reduced-motion` no CSS. */
  pulso?: boolean;
  testId?: string;
}) {
  return (
    <div className="pn-faixa" data-acento={acento} data-pulso={pulso ? "true" : undefined} data-testid={testId}>
      {icone && <span className="pn-faixa-ico" aria-hidden="true">{icone}</span>}
      {valor != null && <span className="pn-faixa-valor">{valor}</span>}
      <span className="pn-faixa-rotulo">{rotulo}</span>
    </div>
  );
}

/**
 * Barra de alvo — a linha `Gravenight — Acerto vs 6` da referência.
 * Nome do alvo à esquerda, resultado à direita, ações compactas na
 * ponta.
 */
export function BarraAlvo({
  nome,
  resultado,
  acento = "cy",
  acoes,
  testId,
}: {
  nome: ReactNode;
  resultado?: ReactNode;
  acento?: Acento;
  acoes?: ReactNode;
  testId?: string;
}) {
  return (
    <div className="pn-alvo" data-acento={acento} data-testid={testId}>
      <span className="pn-alvo-nome">{nome}</span>
      {resultado != null && <span className="pn-alvo-res">{resultado}</span>}
      {acoes && <span className="pn-alvo-acoes">{acoes}</span>}
    </div>
  );
}

/**
 * Botão técnico. `primario` ocupa a largura útil (é a ação principal do
 * card, como `APLICAR DANO`); os demais são compactos.
 */
export function BotaoTecnico({
  children,
  onClick,
  acento = "cy",
  primario,
  ocupado,
  desabilitado,
  titulo,
  tipo = "button",
  icone,
  testId,
  ariaLabel,
}: {
  children?: ReactNode;
  onClick?: () => void;
  acento?: Acento;
  primario?: boolean;
  /** Mostra estado de trabalho e bloqueia o clique — a guarda contra duplo clique mora aqui e no servidor. */
  ocupado?: boolean;
  desabilitado?: boolean;
  titulo?: string;
  tipo?: "button" | "submit";
  icone?: ReactNode;
  testId?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type={tipo}
      className="pn-btn"
      data-acento={acento}
      data-primario={primario ? "true" : undefined}
      data-ocupado={ocupado ? "true" : undefined}
      onClick={onClick}
      disabled={desabilitado || ocupado}
      title={titulo}
      aria-label={ariaLabel}
      aria-busy={ocupado || undefined}
      data-testid={testId}
    >
      {icone && <span className="pn-btn-ico" aria-hidden="true">{icone}</span>}
      {children}
    </button>
  );
}

/** Linha de ações no rodapé de um card. */
export function Acoes({ children }: { children: ReactNode }) {
  return <div className="pn-acoes">{children}</div>;
}

/**
 * Painel técnico com canto cortado — o `.rc-panel` do Console. Usado
 * por módulos internos de card (descrição, detalhes, tabela).
 */
export function PainelTecnico({
  children,
  className,
  testId,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={className ? `pn-painel ${className}` : "pn-painel"} data-testid={testId}>
      {children}
    </div>
  );
}

/**
 * Barra de recurso compacta (PA, Mana, PV) — células discretas, como a
 * trilha do Console, nunca uma barra de progresso contínua de
 * dashboard. `gasto` acende as células consumidas.
 */
export function BarraRecurso({
  rotulo,
  atual,
  total,
  acento = "cy",
  testId,
}: {
  rotulo: string;
  atual: number;
  total: number;
  acento?: Acento;
  testId?: string;
}) {
  const celulas = Math.max(0, Math.min(12, Math.round(total)));
  const cheias = Math.max(0, Math.min(celulas, Math.round(atual)));
  return (
    <span className="pn-recurso" data-acento={acento} data-testid={testId}>
      <span className="pn-recurso-rotulo">{rotulo}</span>
      <span className="pn-recurso-trilha" role="img" aria-label={`${rotulo}: ${atual} de ${total}`}>
        {Array.from({ length: celulas }, (_, i) => (
          <span key={i} className="pn-recurso-cel" data-on={i < cheias ? "true" : undefined} />
        ))}
      </span>
      <span className="pn-recurso-num">
        {atual}
        <span className="pn-recurso-total">/{total}</span>
      </span>
    </span>
  );
}

/** Indicador luminoso pequeno (presença, estado ativo). */
export function Pip({ acento = "cy", ligado, titulo }: { acento?: Acento; ligado?: boolean; titulo?: string }) {
  return <span className="pn-pip" data-acento={acento} data-on={ligado ? "true" : undefined} title={titulo} aria-hidden="true" />;
}

/**
 * Seção numerada de um dossiê ("01 · ATRIBUTOS") — o cabeçalho que
 * organiza o detalhe de Personagens/Participantes/Bando/Compêndio em
 * blocos, com uma linha decorativa preenchendo o resto da largura.
 */
export function SecaoDossie({ n, titulo, children }: { n: string; titulo: string; children: ReactNode }) {
  return (
    <section className="rv-pn-secao">
      <div className="rv-pn-secao-cab">
        <span className="rv-pn-secao-n">{n}</span>
        <span className="rv-pn-secao-titulo">{titulo}</span>
        <span className="rv-pn-secao-linha" aria-hidden="true" />
      </div>
      {children}
    </section>
  );
}
