"use client";

/**
 * ANATOMIA BASE de todo card mecânico do feed.
 *
 * Uma peça só, com as regiões fixas do dossiê do estudo:
 *
 *   ESPINHA — coluna à esquerda com o ícone e o TIPO do evento escrito
 *     na vertical, na cor do acento. É ela que dá a leitura de "que
 *     tipo de coisa é esta" antes de qualquer texto.
 *   CANTOS — quatro brackets no acento, a mesma marcação da janela de
 *     rolagem. É o que amarra card e janela no mesmo desenho.
 *   CABEÇALHO — autoria e hora, em mono discreto.
 *   NOME + SUBTÍTULO — o principal em display caixa alta, o tipo
 *     repetido em mono para quem não lê a espinha.
 *   ESTADO, CORPO, AÇÕES e DETALHES recolhíveis.
 *
 * O que NÃO é permitido aqui, de propósito: um fundo colorido inteiro
 * por tipo de evento. A diferenciação é espinha + cantos + label +
 * cor do RESULTADO. É o que evita o feed virar um mosaico de caixas
 * coloridas e o que mantém a densidade do Console.
 *
 * TODA a aparência vem de `painel.css` (`.rv-pn-chat .pn-cartao*`).
 * Nada de utilitário de framework aqui: o projeto não carrega Tailwind,
 * e um card que dependesse dele voltaria a desmontar assim que a folha
 * do estudo saísse do bundle — que foi exatamente o que aconteceu.
 *
 * O estado de expansão é CONTROLADO por quem chama (o feed guarda um
 * `Set` de ids expandidos), então trocar de aba e voltar não recolhe
 * nada — requisito de preservação de estado do painel.
 */

import type { ReactNode } from "react";
import type { Acento } from "./primitivas";

const CANTOS = ["tl", "tr", "bl", "br"] as const;

export interface CartaoBaseProps {
  /** Rótulo do TIPO — "TESTE DE PERÍCIA", "ATAQUE", "CONDIÇÃO APLICADA". */
  tipo: string;
  /** Nome principal — a perícia, a arma, a magia, o efeito. */
  nome?: ReactNode;
  icone?: ReactNode;
  acento?: Acento;
  /** Autoria: personagem ou conta. Vem sempre resolvida do servidor. */
  autor?: ReactNode;
  hora?: string;
  horaISO?: string;
  /** Selo de visibilidade quando a entrada não é pública. */
  visibilidade?: ReactNode;
  /** Chip de estado do workflow (PENDENTE, AGUARDANDO DEFESA, RESOLVIDO…). */
  estado?: ReactNode;
  /** Corpo principal — módulos, faixas, alvo. */
  children?: ReactNode;
  /** Rodapé de ações. */
  acoes?: ReactNode;
  /** Conteúdo recolhível. Quando ausente, o controle de expandir não aparece. */
  detalhes?: ReactNode;
  rotuloDetalhes?: string;
  expandido?: boolean;
  onAlternarExpandido?: () => void;
  /** Entrada ainda não confirmada pelo servidor. */
  pendente?: boolean;
  testId?: string;
  atributos?: Record<string, string>;
}

/**
 * Forma curta do tipo pra espinha vertical.
 *
 * Tira o prefixo "TESTE DE " — presente em quase todo cartão de
 * rolagem, e por isso justamente a parte que NÃO ajuda a diferenciar um
 * do outro. O texto por extenso continua no corpo do cartão.
 */
function espinhaDoTipo(tipo: string): string {
  return tipo.replace(/^TESTE DE\s+/i, "").trim() || tipo;
}

export function CartaoBase({
  tipo,
  nome,
  icone,
  acento = "cy",
  autor,
  hora,
  horaISO,
  visibilidade,
  estado,
  children,
  acoes,
  detalhes,
  rotuloDetalhes = "Detalhes",
  expandido,
  onAlternarExpandido,
  pendente,
  testId,
  atributos,
}: CartaoBaseProps) {
  const temDetalhes = detalhes != null && onAlternarExpandido != null;
  return (
    <article
      className="pn-cartao"
      data-acento={acento}
      data-pendente={pendente ? "true" : undefined}
      data-testid={testId}
      {...atributos}
    >
      {CANTOS.map((c) => (
        <span key={c} className={`pn-cartao-canto pn-cartao-canto--${c}`} aria-hidden="true" />
      ))}

      <div className="pn-cartao-layout">
        <div className="pn-cartao-espinha" aria-hidden="true">
          {icone && <span className="pn-cartao-ico">{icone}</span>}
          {/* A espinha carrega a forma CURTA do tipo. O cartão já diz
              "TESTE DE ATRIBUTO" por extenso logo ao lado; repetir a
              frase inteira na vertical não cabia na altura de um
              cartão comum e saía cortada ("TESTE DE ATRI…"). O que a
              espinha precisa dizer é o que distingue um cartão do
              outro — e isso é a última palavra, não o prefixo que
              todos compartilham. */}
          <span className="pn-cartao-tipo">{espinhaDoTipo(tipo)}</span>
        </div>

        <div className="pn-cartao-conteudo">
          <div className="pn-cartao-cab">
            <span className="pn-cartao-autor">{autor}</span>
            <span className="pn-cartao-meta">
              {hora && <time className="pn-cartao-hora" dateTime={horaISO}>{hora}</time>}
            </span>
          </div>

          {nome != null && <h3 className="pn-cartao-nome">{nome}</h3>}
          {/* O tipo aparece de novo aqui porque a espinha é `aria-hidden`
              e porque em coluna estreita ela pode truncar. */}
          <div className="pn-cartao-subtitulo">{tipo}</div>

          {(estado || visibilidade) && (
            <div className="pn-cartao-estado">{estado}{visibilidade}</div>
          )}

          {children && <div className="pn-cartao-corpo">{children}</div>}

          {temDetalhes && expandido && (
            <div className="pn-cartao-detalhes" data-testid="painel-cartao-detalhes">{detalhes}</div>
          )}

          {(acoes || temDetalhes) && (
            <div className="pn-cartao-acoes">
              {acoes}
              {temDetalhes && (
                <button
                  type="button"
                  className="pn-cartao-expandir"
                  onClick={onAlternarExpandido}
                  aria-expanded={!!expandido}
                  aria-label={expandido ? `Recolher ${rotuloDetalhes.toLowerCase()}` : rotuloDetalhes}
                  data-testid="painel-cartao-expandir"
                >
                  {expandido ? "[ − ]" : "[ + ]"}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
