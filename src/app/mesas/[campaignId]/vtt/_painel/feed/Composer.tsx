"use client";

/**
 * COMPOSER — a barra de escrita, fixa no rodapé interno do Chat e
 * SEMPRE inteiramente visível.
 *
 * Padrão visual do Console: superfície técnica escura, borda ciano só
 * ao focar, botão de envio QUADRADO (não uma bolha), e a linha de
 * autoria/visibilidade como CHIPS — `FALAR COMO: MARA VENN` e
 * `VISIBILIDADE: TODOS` — cada um abrindo um menu compacto ancorado,
 * nunca um `<select>` nativo.
 *
 * A textarea cresce até ~4 linhas e então rola por dentro; o composer
 * não muda de altura além disso, que é o que garante o feed nunca ser
 * empurrado para fora do viewport.
 *
 * Enter envia, Shift+Enter quebra linha, Seta-pra-cima recupera a
 * última mensagem enviada SÓ com o campo vazio (para não brigar com a
 * edição normal).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, Eye, Loader2, Lock, Radio, ShieldAlert, User } from "lucide-react";

/**
 * Seta de enviar — exportada do Figma (Button - Enviar, nó 467:5993),
 * não o `Send` do lucide: o desenho é a mesma geometria, mas PREENCHIDA,
 * e o lucide só tem a versão de contorno. Desenhada inline (e não pela
 * URL do asset) porque os links do Figma expiram em ~7 dias.
 * `currentColor` deixa o estado (normal/desabilitado) morar no CSS.
 */
function SetaEnviar() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.1665 1.778C2.11404 1.75239 2.05507 1.74318 1.9973 1.75157C1.93952 1.75997 1.88562 1.78557 1.84261 1.82505C1.7996 1.86454 1.76949 1.91606 1.75619 1.97291C1.7429 2.02976 1.74704 2.08929 1.76808 2.14375L3.4265 6.59283C3.52431 6.85547 3.52431 7.14453 3.4265 7.40717L1.76867 11.8563C1.74773 11.9106 1.74364 11.9701 1.75693 12.0268C1.77022 12.0836 1.80026 12.135 1.84317 12.1745C1.88607 12.2139 1.93985 12.2395 1.99751 12.248C2.05518 12.2565 2.11406 12.2474 2.1665 12.222L12.6665 7.26367C12.7164 7.24005 12.7587 7.20272 12.7882 7.15604C12.8178 7.10937 12.8335 7.05525 12.8335 7C12.8335 6.94475 12.8178 6.89064 12.7882 6.84396C12.7587 6.79728 12.7164 6.75996 12.6665 6.73633L2.1665 1.778Z"
        fill="currentColor"
      />
    </svg>
  );
}
import { MenuAncorado, type ItemMenu } from "../ui/MenuAncorado";
import type { TableLogVisibility } from "../../../../../../lib/table";

export interface IdentidadeComposer {
  /** `null` = falar como Narrador (narrador) ou como a própria conta (jogador). */
  characterId: string | null;
  nome: string;
  modo: "personagem" | "narrador" | "conta";
}

export function Composer({
  papel,
  identidade,
  identidadesDisponiveis,
  escolhaIdentidade,
  onEscolherIdentidade,
  visibilidade,
  onEscolherVisibilidade,
  texto,
  onTexto,
  enviando,
  erro,
  onEnviar,
  onLimparErro,
  ultimaEnviada,
}: {
  papel: "narrator" | "player";
  identidade: IdentidadeComposer;
  identidadesDisponiveis: readonly { id: string; nome: string }[];
  /** `null` = automático; `"narrador"`/`"conta"` = sem personagem; senão, characterId. */
  escolhaIdentidade: string | null;
  onEscolherIdentidade: (v: string | null) => void;
  visibilidade: TableLogVisibility;
  onEscolherVisibilidade: (v: TableLogVisibility) => void;
  texto: string;
  onTexto: (v: string) => void;
  enviando: boolean;
  erro: string | null;
  onEnviar: () => void;
  onLimparErro: () => void;
  ultimaEnviada: string | null;
}) {
  const campoRef = useRef<HTMLTextAreaElement>(null);
  const btnAutoriaRef = useRef<HTMLButtonElement>(null);
  const btnVisRef = useRef<HTMLButtonElement>(null);
  const [menuAutoria, setMenuAutoria] = useState(false);
  const [menuVis, setMenuVis] = useState(false);

  // Autoexpansão até o teto do CSS (~4 linhas); depois disso rola por
  // dentro. Medir antes da pintura evita o "pulo" de um frame.
  useLayoutEffect(() => {
    const el = campoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [texto]);

  const aoTeclar = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onEnviar();
        return;
      }
      if (e.key === "ArrowUp" && texto === "" && ultimaEnviada) {
        e.preventDefault();
        onTexto(ultimaEnviada);
      }
    },
    [onEnviar, texto, ultimaEnviada, onTexto],
  );

  useEffect(() => {
    if (erro && texto === "") onLimparErro();
  }, [erro, texto, onLimparErro]);

  const itensAutoria: ItemMenu[] = [
    {
      id: "__auto__",
      rotulo: `Automático (${identidade.nome})`,
      descricao: "Segue o token selecionado no mapa quando ele tem um personagem que você controla.",
      selecionado: escolhaIdentidade === null,
      onSelecionar: () => onEscolherIdentidade(null),
      grupoAntes: "Falar como",
    },
    ...(papel === "narrator"
      ? [
          {
            id: "narrador",
            rotulo: "Narrador",
            icone: <Radio size={13} />,
            selecionado: escolhaIdentidade === "narrador",
            onSelecionar: () => onEscolherIdentidade("narrador"),
          } satisfies ItemMenu,
        ]
      : [
          {
            id: "conta",
            rotulo: identidade.modo === "conta" ? identidade.nome : "Minha conta",
            icone: <User size={13} />,
            selecionado: escolhaIdentidade === "conta",
            onSelecionar: () => onEscolherIdentidade("conta"),
          } satisfies ItemMenu,
        ]),
    ...identidadesDisponiveis.map((p, i) => ({
      id: p.id,
      rotulo: p.nome,
      selecionado: escolhaIdentidade === p.id,
      onSelecionar: () => onEscolherIdentidade(p.id),
      ...(i === 0 ? { grupoAntes: "Personagens" } : {}),
    })),
  ];

  /** `private` é autor + narrador — nunca "só eu". */
  const ROTULO_VIS: Record<TableLogVisibility, string> = {
    public: "Todos",
    private: papel === "player" ? "Somente Narrador" : "Reservada",
    gm: "Narrador",
  };
  const itensVis: ItemMenu[] = (papel === "narrator" ? (["public", "gm", "private"] as const) : (["public", "private"] as const)).map(
    (v, i) => ({
      id: v,
      rotulo: ROTULO_VIS[v],
      icone: v === "public" ? <Eye size={13} /> : v === "gm" ? <ShieldAlert size={13} /> : <Lock size={13} />,
      descricao:
        v === "public"
          ? "Todo mundo na mesa vê."
          : v === "gm"
            ? "Só o Narrador vê."
            : papel === "player"
              ? "Só você e o Narrador veem."
              : "Só você vê.",
      selecionado: visibilidade === v,
      onSelecionar: () => onEscolherVisibilidade(v),
      ...(i === 0 ? { grupoAntes: "Visibilidade" } : {}),
    }),
  );

  const podeEnviar = texto.trim().length > 0 && !enviando;

  return (
    <form
      className="pn-composer"
      onSubmit={(e) => {
        e.preventDefault();
        onEnviar();
      }}
      data-testid="painel-composer"
    >
      <div className="pn-composer-chips">
        <button
          ref={btnAutoriaRef}
          type="button"
          className="pn-chipbtn"
          data-acento={identidade.modo === "personagem" ? "cy" : identidade.modo === "narrador" ? "am" : "neutro"}
          aria-haspopup="menu"
          aria-expanded={menuAutoria}
          onClick={() => setMenuAutoria((v) => !v)}
          data-testid="painel-composer-autoria"
        >
          Falar como
          <span className="pn-chipbtn-val">{identidade.nome}</span>
          <ChevronDown aria-hidden="true" />
        </button>

        <button
          ref={btnVisRef}
          type="button"
          className="pn-chipbtn"
          data-acento={visibilidade === "public" ? "neutro" : visibilidade === "gm" ? "am" : "cy"}
          aria-haspopup="menu"
          aria-expanded={menuVis}
          onClick={() => setMenuVis((v) => !v)}
          data-testid="painel-composer-visibilidade"
        >
          {visibilidade === "public" ? <Eye aria-hidden="true" /> : visibilidade === "gm" ? <ShieldAlert aria-hidden="true" /> : <Lock aria-hidden="true" />}
          <span className="pn-chipbtn-val">{ROTULO_VIS[visibilidade]}</span>
          <ChevronDown aria-hidden="true" />
        </button>

      </div>

      {erro && (
        <p className="rv-pn-estado rv-pn-estado--erro" role="alert" style={{ margin: 0 }} data-testid="painel-composer-erro">
          <span className="rv-pn-estado-texto">{erro}</span>
          <button type="button" className="rv-pn-retry" onClick={onEnviar}>
            Tentar de novo
          </button>
        </p>
      )}

      <div className="pn-composer-linha">
        <div className="pn-composer-campo">
          <label className="rv-sr-only" htmlFor="pn-composer-input">
            Mensagem para a mesa
          </label>
          <textarea
            id="pn-composer-input"
            ref={campoRef}
            className="pn-composer-input"
            rows={1}
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            onKeyDown={aoTeclar}
            placeholder="Enviar mensagem ou /r…"
            data-testid="painel-chat-input"
          />
        </div>
        <button
          type="submit"
          className="pn-composer-enviar"
          disabled={!podeEnviar}
          aria-label="Enviar mensagem"
          aria-busy={enviando || undefined}
          data-testid="painel-chat-enviar"
        >
          {enviando ? <Loader2 size={14} className="rv-spin" /> : <SetaEnviar />}
        </button>
      </div>

      <MenuAncorado
        ancora={btnAutoriaRef.current}
        aberto={menuAutoria}
        onFechar={() => setMenuAutoria(false)}
        itens={itensAutoria}
        rotulo="Falar como"
        testId="painel-composer-menu-autoria"
      />
      <MenuAncorado
        ancora={btnVisRef.current}
        aberto={menuVis}
        onFechar={() => setMenuVis(false)}
        itens={itensVis}
        rotulo="Visibilidade"
        testId="painel-composer-menu-visibilidade"
      />
    </form>
  );
}
