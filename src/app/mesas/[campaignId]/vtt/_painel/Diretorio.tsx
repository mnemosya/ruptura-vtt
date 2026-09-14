"use client";

/**
 * Peças COMPARTILHADAS dos três diretórios do painel (Personagens,
 * Bando, Compêndio): campo de busca, cabeçalho de grupo/pasta, linha
 * compacta e barra de ações do rodapé.
 *
 * As três abas são a mesma ideia — uma lista densa de documentos com
 * busca e menu de contexto — e a única diferença real é o que cada
 * linha mostra. Manter isso em três lugares foi como o painel antigo
 * acabou com três listas visualmente parecidas e nenhuma delas
 * navegável por teclado.
 *
 * A LINHA é deliberadamente pobre: retrato/sigla, nome, uma marca
 * discreta e um subtítulo curto. Nada de PV, condição, turno ou
 * "está na cena" — diretório não é painel de estado, e a listagem de
 * Personagens em particular não pode virar um dashboard (o token da
 * cena é outra entidade, com HUD próprio).
 */

import { ChevronDown, Search, X } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { BotaoTecnico } from "./ui/primitivas";

export function BuscaDiretorio({
  valor,
  onMudar,
  rotulo,
  placeholder,
  testId,
}: {
  valor: string;
  onMudar: (v: string) => void;
  rotulo: string;
  placeholder: string;
  testId?: string;
}) {
  return (
    <div className="rv-pn-busca">
      <Search size={13} aria-hidden="true" />
      <input
        type="search"
        className="rv-pn-busca-input"
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        aria-label={rotulo}
        placeholder={placeholder}
        data-testid={testId}
      />
      {valor && (
        <button type="button" className="rv-pn-busca-limpar" aria-label="Limpar busca" onClick={() => onMudar("")}>
          <X size={12} />
        </button>
      )}
    </div>
  );
}

/**
 * Cabeçalho de um grupo/pasta. Quando `onAlternar` existe vira um
 * botão de expandir/recolher com `aria-expanded` — quando não, é só um
 * rótulo (o caso dos grupos por categoria do Bando, que não recolhem).
 */
export function CabecalhoGrupo({
  rotulo,
  contagem,
  aberto,
  onAlternar,
  glifo,
  acoes,
  nivel = 0,
  onMenuContextual,
  testId,
  arrastavel,
  onArrastarInicio,
  onArrastarFim,
  onArrastarSobre,
  onSoltar,
  alvoDeSolta,
  arrastando,
}: {
  rotulo: string;
  contagem?: number;
  aberto?: boolean;
  onAlternar?: () => void;
  glifo?: ReactNode;
  acoes?: ReactNode;
  nivel?: number;
  onMenuContextual?: (e: React.MouseEvent) => void;
  testId?: string;
  /* ARRASTO DA PRÓPRIA PASTA — pra mudar de posição entre as irmãs.
     Opcional porque o Bando usa este mesmo cabeçalho pra grupos por
     categoria, que não têm ordem própria pra mexer. */
  arrastavel?: boolean;
  onArrastarInicio?: (e: React.DragEvent) => void;
  onArrastarFim?: () => void;
  onArrastarSobre?: (e: React.DragEvent) => void;
  onSoltar?: (e: React.DragEvent) => void;
  alvoDeSolta?: boolean;
  arrastando?: boolean;
}) {
  const conteudo = (
    <>
      {glifo && <span className="rv-pn-grupo-glifo" aria-hidden="true">{glifo}</span>}
      <span className="rv-pn-grupo-rotulo">{rotulo}</span>
      {contagem != null && <span className="rv-pn-grupo-contagem">{contagem}</span>}
      {/* O CHEVRON só existe quando a pasta RECOLHE. Fica no fim, e
          gira: apontando pra baixo quando está aberta, pra direita
          quando fechada — a mesma leitura de toda árvore. O
          `aria-expanded` do botão já dizia isso pro leitor de tela; o
          chevron é a metade que faltava pra quem enxerga. */}
      {onAlternar && (
        <span className="rv-pn-grupo-chevron" data-aberto={aberto ? "true" : undefined} aria-hidden="true">
          <ChevronDown size={13} />
        </span>
      )}
    </>
  );
  return (
    <div
      className="rv-pn-grupo"
      /* O recuo da árvore vai como VARIÁVEL, pelo mesmo motivo da linha:
         `paddingLeft` inline vence a folha, e aí o padding do cabeçalho
         não tem como ser igual nos dois eixos. */
      style={{ "--pn-recuo-grupo": `${nivel * 12}px` } as React.CSSProperties}
      onContextMenu={onMenuContextual}
      data-testid={testId}
      draggable={arrastavel}
      onDragStart={onArrastarInicio}
      onDragEnd={onArrastarFim}
      onDragOver={onArrastarSobre}
      onDrop={onSoltar}
      data-alvo={alvoDeSolta ? "true" : undefined}
      data-arrastando={arrastando ? "true" : undefined}
    >
      {onAlternar ? (
        <button type="button" className="rv-pn-grupo-btn" aria-expanded={aberto} onClick={onAlternar}>
          {conteudo}
        </button>
      ) : (
        <span className="rv-pn-grupo-btn rv-pn-grupo-btn--estatico">{conteudo}</span>
      )}
      {acoes && <span className="rv-pn-grupo-acoes">{acoes}</span>}
    </div>
  );
}

export interface LinhaDiretorioProps {
  /** Sigla/iniciais, ou uma imagem quando existir retrato. */
  face: ReactNode;
  nome: string;
  /** Uma linha curta de contexto — tipo, categoria, quantidade. Nunca estado de jogo. */
  subtitulo?: ReactNode;
  /** Marca discreta à direita (acesso/controle, procedência, quantidade). */
  marca?: ReactNode;
  /** Terceira linha, abaixo do subtítulo — a barra de PV, quando o chamador tiver o dado. */
  rodape?: ReactNode;
  selecionado?: boolean;
  nivel?: number;
  /** Cor de acento da linha (valor CSS, ex. `"var(--rv-cy)"`) — some no avatar e na barra de seleção. */
  acento?: string;
  onAbrir?: () => void;
  /** Aquecimento no hover/foco — usado para pré-carregar o Console antes do clique. */
  onAquecer?: () => void;
  onMenuContextual?: (e: React.MouseEvent) => void;
  /** HTML5 drag — só quando a linha de fato pode ser arrastada pra algum destino autorizado. */
  arrastavel?: boolean;
  onArrastarInicio?: (e: React.DragEvent) => void;
  onArrastarFim?: () => void;
  /** A linha aceita algo sendo solto sobre ela (item do Bando caindo num personagem). */
  onSoltar?: (e: React.DragEvent) => void;
  onArrastarSobre?: (e: React.DragEvent) => void;
  alvoDeSolta?: boolean;
  testId?: string;
  atributos?: Record<string, string>;
}

/**
 * Linha compacta. É um `<li>` com `role="button"` e `tabIndex` —
 * Enter/Espaço abrem, exatamente como o clique, e o foco é visível
 * (`:focus-visible` no CSS). Nunca um `<div>` clicável mudo.
 */
export function LinhaDiretorio({
  face,
  nome,
  subtitulo,
  marca,
  rodape,
  selecionado,
  nivel = 0,
  acento = "var(--rv-cy)",
  onAbrir,
  onAquecer,
  onMenuContextual,
  arrastavel,
  onArrastarInicio,
  onArrastarFim,
  onSoltar,
  onArrastarSobre,
  alvoDeSolta,
  testId,
  atributos,
}: LinhaDiretorioProps) {
  function aoTeclar(e: KeyboardEvent<HTMLLIElement>) {
    if (!onAbrir) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onAbrir();
    }
  }
  return (
    <li
      className="rv-pn-linha"
      /* A indentação vai como VARIÁVEL, não como `paddingLeft` inline:
         estilo inline vence qualquer folha, e a aba Personagens precisa
         zerar o padding pra encostar o avatar na borda do cartão. Quem
         decide onde o recuo entra é o CSS — aqui só se diz de quanto
         ele é. */
      style={{ "--pn-recuo": `${12 + nivel * 12}px`, "--fg-a": acento } as React.CSSProperties}
      data-sel={selecionado ? "true" : undefined}
      data-alvo={alvoDeSolta ? "true" : undefined}
      role={onAbrir ? "button" : undefined}
      tabIndex={onAbrir ? 0 : undefined}
      onClick={onAbrir}
      onKeyDown={aoTeclar}
      onPointerEnter={onAquecer}
      onFocus={onAquecer}
      onContextMenu={onMenuContextual}
      draggable={arrastavel}
      onDragStart={onArrastarInicio}
      onDragEnd={onArrastarFim}
      onDragOver={onArrastarSobre}
      onDrop={onSoltar}
      data-testid={testId}
      {...atributos}
    >
      <span className="rv-pn-face" aria-hidden="true">{face}</span>
      <span className="rv-pn-linha-texto">
        <strong className="rv-pn-linha-nome">{nome}</strong>
        {subtitulo && <span className="rv-pn-linha-sub">{subtitulo}</span>}
        {rodape && <span className="rv-pn-linha-rodape">{rodape}</span>}
      </span>
      {marca && <span className="rv-pn-linha-marca">{marca}</span>}
    </li>
  );
}

/** Barra fixa no rodapé da aba — ações que valem pra aba inteira (criar, atualizar, abrir a página completa). */
export function RodapeAcoes({ children }: { children: ReactNode }) {
  return <div className="rv-pn-rodape">{children}</div>;
}

/**
 * Botão de rodapé/cabeçalho das abas.
 *
 * Delega ao `BotaoTecnico` das primitivas — a MESMA peça dos cards e
 * das janelas internas. Antes tinha classe própria (`rv-pn-btn`), e o
 * resultado eram dois botões diferentes na mesma tela: os do rodapé
 * arredondados e em caixa mista, os dos cards técnicos e em caixa alta.
 */
export function BotaoAba({
  children,
  onClick,
  desabilitado,
  titulo,
  primario,
  testId,
}: {
  children: ReactNode;
  onClick: () => void;
  desabilitado?: boolean;
  titulo?: string;
  primario?: boolean;
  testId?: string;
}) {
  return (
    <BotaoTecnico acento="cy" primario={primario} onClick={onClick} desabilitado={desabilitado} titulo={titulo} testId={testId}>
      {children}
    </BotaoTecnico>
  );
}
