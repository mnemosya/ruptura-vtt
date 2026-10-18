"use client";

/**
 * Painel das ferramentas DESENHAR e TEXTO — um componente só, com `modo`.
 *
 * As duas janelas são a mesma ideia (uma anotação livre na cena, com cor,
 * uma medida e quem vê) e o protótipo aprovado é um template único; ter
 * duas marcações seria convidar as duas a divergirem no primeiro ajuste.
 *
 * Só APRESENTAÇÃO: todo estado (cor, espessura, rascunho, seleção) e toda
 * regra de permissão continuam no `VttClient`, que passa os valores e os
 * "pode/não pode" já resolvidos. Aqui só mora o que é da tela — o texto
 * sob o mouse (`foco`) e a tecla da plataforma.
 */

import { useState, useSyncExternalStore, type RefObject } from "react";
import { HexColorInput, HexColorPicker } from "react-colorful";
import { Pencil, Type } from "lucide-react";
import { JanelaFerramenta } from "./JanelaFerramenta";
import { CORES_ANOTACAO, corAnotacaoValida, hexDaAnotacao, type CorAnotacao, type CorPredefinida } from "../_dominio/anotacoes";

const assinarNada = () => () => {};
/**
 * Mac ou não — para mostrar ⌘/⌥ em vez de Ctrl/Alt. Pelo
 * `useSyncExternalStore` com `false` no servidor: o HTML do SSR sai com
 * "Ctrl" e o cliente corrige sem aviso de hidratação divergente.
 */
export function usePlataformaMac(): boolean {
  return useSyncExternalStore(
    assinarNada,
    () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || ""),
    () => false,
  );
}

const NOME_COR: Record<CorPredefinida, string> = {
  ciano: "Ciano", ambar: "Âmbar", verde: "Verde", vermelho: "Vermelho", roxo: "Roxo", branco: "Branco",
};
const ESPESSURAS = [1, 2, 3, 4, 5, 6];
const TAMANHOS = [12, 16, 20, 24, 28, 32];

// Ícones copiados do protótipo (olho riscado / olho).
const ICONE_PRIVADA = "M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.8M6.2 7.6A16.6 16.6 0 0 0 2.5 12S6 18 12 18c1.6 0 3-.4 4.3-1";
const ICONE_MESA = "M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM9.4 12a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0";
const ICONE_LIXO = "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3";

export interface PropsPainelAnotacoes {
  modo: "desenhar" | "texto";
  aoFechar: () => void;
  /** Camada "Desenhos e textos". */
  bloqueada: boolean;
  oculta: boolean;
  /** Há anotação do tipo da ferramenta selecionada. */
  temSelecao: boolean;
  /** A pessoa pode editar a selecionada (narrador ou autora) — `true` sem seleção. */
  podeEditarSelecao: boolean;
  /** Só a autora muda a privacidade — `true` sem seleção. */
  podeMudarPrivacidade: boolean;
  cor: CorAnotacao;
  onEscolherCor: (cor: CorPredefinida) => void;
  seletorCorAberto: boolean;
  onAlternarSeletorCor: () => void;
  corRascunho: string;
  onCorRascunho: (cor: string) => void;
  onAplicarCorRascunho: () => void;
  /** Espessura (Desenhar) ou tamanho em px (Texto). */
  medida: number;
  onMedida: (n: number) => void;
  privada: boolean;
  onPrivada: (privada: boolean) => void;
  /** Texto: ponto pendente ou texto selecionado — a vitrine vira o editor. */
  editandoTexto: boolean;
  /** O editor aceita digitação (ponto novo ou texto que a pessoa pode editar). */
  podeEditarTexto: boolean;
  textoRascunho: string;
  onTextoRascunho: (t: string) => void;
  textoRef: RefObject<HTMLTextAreaElement | null>;
  onSalvarTexto: () => void;
  onCancelarTexto: () => void;
  onRemover: () => void;
  erro: string | null;
}

export function PainelAnotacoes(p: PropsPainelAnotacoes) {
  const [foco, setFoco] = useState<string | null>(null);
  const mac = usePlataformaMac();
  const desenho = p.modo === "desenhar";
  const hex = hexDaAnotacao(p.cor);
  const corTravada = p.bloqueada || p.oculta;
  const medidaTravada = p.bloqueada || !p.podeEditarSelecao;
  const visTravada = p.bloqueada || p.oculta || !p.podeMudarPrivacidade;
  const nomeMedida = desenho ? "Espessura" : "Tamanho";
  const valores = desenho ? ESPESSURAS : TAMANHOS;
  const fmt = (n: number) => (desenho ? String(n) : `${n} px`);
  const focar = (txt: string) => ({
    onMouseEnter: () => setFoco(txt), onMouseLeave: () => setFoco(null),
    onFocus: () => setFoco(txt), onBlur: () => setFoco(null),
  });

  // Aviso da camada vence o resto: é ele que explica por que tudo está apagado.
  const desc = p.bloqueada ? "A camada está bloqueada."
    : p.oculta ? "A camada está oculta."
    : foco
    ?? (p.temSelecao ? `${desenho ? "Traço selecionado" : "Texto selecionado"} · o que mudar vale pra ele`
      : desenho ? "Arraste no mapa para desenhar. Clique em um traço para selecionar."
      : "Clique no mapa para inserir texto. Arraste um texto para mover.");
  const estado = p.bloqueada ? "Camada bloqueada" : p.oculta ? "Camada oculta"
    : desenho ? (p.temSelecao ? "Traço selecionado" : "Pronto")
    : p.editandoTexto ? (p.temSelecao ? "Editando texto" : "Novo texto") : "Pronto";

  return (
    <JanelaFerramenta id={p.modo} icone={desenho ? <Pencil size={16} /> : <Type size={16} />}
      titulo={desenho ? "Desenhar" : "Texto"} modo={estado}
      rotulo={desenho ? "Ferramenta Desenhar" : "Ferramenta Texto"}
      rotuloFechar="Fechar ferramenta" aoFechar={p.aoFechar}
      className={`rv-janela-anotacoes rv-anot${desenho ? " rv-janela-desenhar" : ""}`}>
      <div className="rv-fp-corpo jf-corpo rv-anot-corpo" style={{ ["--jf-k" as string]: hex }}>
        {/* ── Vitrine: como vai sair no mapa ── */}
        <div className="jf-hero rv-anot-hero" style={{ ["--jf-hero" as string]: hex }}>
          {desenho ? (
            <svg className="rv-anot-palco" width="300" height="96" viewBox="0 0 300 96" aria-hidden="true">
              <path className="rv-anot-traco" d="M24 64C58 18 92 18 112 50S168 86 196 50S252 18 276 40"
                style={{ strokeWidth: `${p.medida * 1.6}px` }} />
              {p.temSelecao && <>
                <rect className="rv-anot-caixa" x="14" y="16" width="272" height="64" />
                <rect className="rv-anot-alca" x="10" y="12" width="8" height="8" /><rect className="rv-anot-alca" x="282" y="12" width="8" height="8" />
                <rect className="rv-anot-alca" x="10" y="76" width="8" height="8" /><rect className="rv-anot-alca" x="282" y="76" width="8" height="8" />
              </>}
            </svg>
          ) : p.editandoTexto ? (
            <textarea ref={p.textoRef} className="rv-anot-editor" value={p.textoRascunho} maxLength={500} rows={2}
              placeholder="Digite o texto no mapa" aria-label="Texto no mapa" disabled={!p.podeEditarTexto}
              style={{ fontSize: Math.round(p.medida * 1.15) }}
              onChange={(e) => p.onTextoRascunho(e.target.value)} onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); p.onCancelarTexto(); e.currentTarget.blur(); }
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); p.onSalvarTexto(); }
              }} />
          ) : (
            <span className="rv-anot-amostra" style={{ fontSize: Math.round(p.medida * 1.15) }} aria-hidden="true">Texto no mapa</span>
          )}
        </div>

        {/* ── Cor ── */}
        <div className="jf-linha rv-anot-linha">
          <span className="jf-l">Cor</span>
          <span className="jf-cores" role="group" aria-label="Cor da anotação">
            {(Object.keys(CORES_ANOTACAO) as CorPredefinida[]).map((c) => (
              <button key={c} type="button" className="jf-cor" title={NOME_COR[c]} aria-label={`Cor ${NOME_COR[c]}`}
                aria-pressed={p.cor === c} disabled={corTravada}
                style={{ ["--jf-k" as string]: CORES_ANOTACAO[c] }} onClick={() => p.onEscolherCor(c)} {...focar(NOME_COR[c])}>
                <span />
              </button>
            ))}
            <button type="button" className="rv-anot-custom" title="Escolher outra cor" aria-label="Escolher outra cor"
              aria-expanded={p.seletorCorAberto} aria-pressed={p.cor.startsWith("#")} disabled={corTravada}
              style={{ ["--cor-escolhida" as string]: hex }} onClick={p.onAlternarSeletorCor} {...focar("Escolher outra cor")}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22a10 10 0 1 1 10-10c0 2.8-2.2 4-4 4h-2.2a2 2 0 0 0-1.5 3.3A2 2 0 0 1 12 22z" /><circle cx="7.5" cy="10.5" r=".6" /><circle cx="12" cy="7" r=".6" /><circle cx="16.5" cy="10.5" r=".6" /></svg>
            </button>
          </span>
        </div>
        {p.seletorCorAberto && <div className="rv-anotacoes-seletor" role="group" aria-label="Cor personalizada">
          <HexColorPicker color={p.corRascunho} onChange={p.onCorRascunho} aria-label="Selecionar cor" />
          <div className="rv-anotacoes-seletor-rodape">
            <span className="rv-anotacoes-amostra" style={{ background: p.corRascunho }} aria-hidden="true" />
            <HexColorInput color={p.corRascunho} onChange={p.onCorRascunho} prefixed aria-label="Cor hexadecimal" />
            <button type="button" disabled={!p.corRascunho.startsWith("#") || !corAnotacaoValida(p.corRascunho)}
              onClick={p.onAplicarCorRascunho}>Aplicar</button>
          </div>
        </div>}

        {/* ── Espessura / Tamanho: régua de seis passos no lugar do select ── */}
        <div className="jf-linha rv-anot-linha">
          <span className="jf-l rv-anot-l">{nomeMedida}<b>{desenho ? `${p.medida}px` : `${p.medida} px`}</b></span>
          <span className="rv-anot-passos" role="group" aria-label={nomeMedida}>
            {valores.map((v, i) => (
              <button key={v} type="button" className="rv-anot-passo" aria-label={`${nomeMedida} ${fmt(v)}`}
                aria-pressed={p.medida === v} disabled={medidaTravada} onClick={() => p.onMedida(v)} {...focar(`${nomeMedida} ${fmt(v)}`)}>
                {desenho ? <i style={{ height: v }} /> : <em style={{ fontSize: 9 + i * 2 }}>A</em>}
              </button>
            ))}
          </span>
        </div>

        {/* ── Quem vê ── */}
        <div className="jf-grupo">
          <span className="jf-rot" id={`rv-anot-vis-${p.modo}`}>Quem vê</span>
          <div className="jf-tiles" role="group" aria-labelledby={`rv-anot-vis-${p.modo}`}>
            {([true, false] as const).map((privada) => (
              <button key={String(privada)} type="button" className="jf-tile rv-anot-tile" aria-pressed={p.privada === privada}
                disabled={visTravada} onClick={() => p.onPrivada(privada)}
                {...focar(privada ? "Nem o narrador vê" : "Todos veem")}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={privada ? ICONE_PRIVADA : ICONE_MESA} /></svg>
                <span>{privada ? "Só pra você" : "Pra mesa"}</span>
              </button>
            ))}
          </div>
        </div>

        <p className="jf-desc" aria-live="polite">{desc}</p>

        {/* ── Ação contextual ── */}
        {(p.temSelecao || (!desenho && p.editandoTexto)) && (
          <div className="jf-acao">
            {!desenho && p.editandoTexto && (
              <span className="rv-anot-prim-casca">
                <button type="button" className="jf-prim rv-anot-prim" onClick={p.onSalvarTexto}
                  disabled={!p.textoRascunho.trim() || p.bloqueada || !p.podeEditarTexto}>
                  <span>Salvar texto</span><kbd className="jf-kbd">{mac ? "⌘" : "Ctrl"} ↵</kbd>
                </button>
              </span>
            )}
            {p.temSelecao && (
              <button type="button" className={`rv-anot-remover${desenho ? " is-largo" : ""}`}
                aria-label={desenho ? "Remover traço" : "Remover texto"} title={desenho ? undefined : "Remover texto"}
                disabled={p.bloqueada || !p.podeEditarSelecao} onClick={p.onRemover}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONE_LIXO} /></svg>
                {desenho && <span>Remover traço</span>}
              </button>
            )}
          </div>
        )}
        {p.erro && <p className="rv-anot-erro" role="alert">{p.erro}</p>}
      </div>
    </JanelaFerramenta>
  );
}
