"use client";

/**
 * Compêndio: o livro de RUPTURA v1.2 (sincronizado do Notion) num modal
 * com o visual do Códex da Forja. Índice do livro à esquerda, leitura à
 * direita, busca e "voltar" no cabeçalho.
 * Ver docs/prd/PLANO_COMPENDIO_NOTION.md, Fase 2.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CapituloCompendio } from "../../../../../lib/compendio/tipos";
import { CabecalhoCodex, Shell, useIndiceAtivo } from "../_forja/Codex";
import { Mono } from "../_forja/ui";
import "../_forja/forja.css";
import "./compendio.css";
import { abrirCapituloAction, listarCapitulosAction, textosDoLivroAction } from "./acoes";
import { Blocos, type ContextoLeitura } from "./Blocos";
import {
  agruparPorSecao,
  buscarNoLivro,
  indiceDeTermos,
  rotuloCapitulo,
  vizinhos,
  type DestinoLivro,
  type LinhaCapitulo,
} from "./modelo";

export function LivroCodex({ campaignId, inicial, onClose }: { campaignId: string; inicial?: DestinoLivro | null; onClose: () => void }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return null;
  return createPortal(
    <Shell rotulo="Compêndio de RUPTURA" onClose={onClose}>
      <Livro campaignId={campaignId} inicial={inicial ?? null} onClose={onClose} />
    </Shell>,
    document.body,
  );
}

function Livro({ campaignId, inicial, onClose }: { campaignId: string; inicial: DestinoLivro | null; onClose: () => void }) {
  const [linhas, setLinhas] = useState<LinhaCapitulo[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atual, setAtual] = useState<DestinoLivro | null>(inicial);
  const [historico, setHistorico] = useState<DestinoLivro[]>([]);
  const [capitulos, setCapitulos] = useState<Map<string, CapituloCompendio>>(new Map());
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [textos, setTextos] = useState<Map<string, string> | undefined>(undefined);
  const pedindoTextos = useRef(false);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    void listarCapitulosAction(campaignId).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.dados) return setErro(r.erro ?? "Não foi possível carregar o Compêndio.");
      setLinhas(r.dados);
      setAtual((a) => a ?? (r.dados![0] ? { pageId: r.dados![0].pageId } : null));
    });
    return () => { vivo = false; };
  }, [campaignId]);

  const capitulo = atual ? capitulos.get(atual.pageId) ?? null : null;

  useEffect(() => {
    if (!atual || capitulos.has(atual.pageId)) return;
    let vivo = true;
    setCarregando(true);
    void abrirCapituloAction(campaignId, atual.pageId).then((r) => {
      if (!vivo) return;
      setCarregando(false);
      if (!r.ok || !r.dados) return setErro(r.erro ?? "Não foi possível abrir o capítulo.");
      setErro(null);
      setCapitulos((m) => new Map(m).set(atual.pageId, r.dados!));
    });
    return () => { vivo = false; };
  }, [atual, capitulos, campaignId]);

  // A busca no texto corrido só carrega o livro inteiro na primeira vez que alguém procura.
  useEffect(() => {
    if (busca.trim().length < 2 || textos || pedindoTextos.current) return;
    pedindoTextos.current = true;
    void textosDoLivroAction(campaignId).then((r) => {
      if (r.ok && r.dados) setTextos(new Map(r.dados));
    });
  }, [busca, textos, campaignId]);

  const { scroller, active, go } = useIndiceAtivo(capitulo?.notionPageId ?? null);
  // Esc fecha o livro. Em captura: o livro está por cima de tudo na mesa, então
  // a tecla é dele antes do painel, do mapa ou de qualquer outro atalho.
  const fecharRef = useRef(onClose);
  fecharRef.current = onClose;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      fecharRef.current();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []);

  // O foco entra no livro ao abrir: teclado (rolagem, Esc, Tab) passa a valer aqui, não no painel.
  useEffect(() => { scroller.current?.focus({ preventScroll: true }); }, [scroller]);

  // Ao chegar num capítulo: abre o verbete pedido e rola até ele; sem âncora, volta ao topo.
  useEffect(() => {
    if (!capitulo || !atual) return;
    if (atual.ancora) {
      const ancora = atual.ancora;
      setAbertos((s) => (s.has(ancora) ? s : new Set(s).add(ancora)));
      requestAnimationFrame(() => scroller.current?.querySelector(`[id="${CSS.escape(ancora)}"]`)?.scrollIntoView({ block: "start" }));
    } else {
      scroller.current?.scrollTo({ top: 0 });
    }
  }, [capitulo, atual, scroller]);

  const atualRef = useRef(atual);
  atualRef.current = atual;
  const ir = useCallback((destino: DestinoLivro) => {
    setBusca("");
    const a = atualRef.current;
    if (a && (a.pageId !== destino.pageId || a.ancora !== destino.ancora)) setHistorico((h) => [...h, a]);
    setAtual({ ...destino });
  }, []);
  const voltar = () => {
    const anterior = historico[historico.length - 1];
    if (!anterior) return;
    setHistorico(historico.slice(0, -1));
    setAtual({ ...anterior });
  };

  const termos = useMemo(() => indiceDeTermos(linhas ?? []), [linhas]);
  const titulos = useMemo(() => new Map((linhas ?? []).map((c) => [c.pageId, rotuloCapitulo(c)])), [linhas]);
  const ctx: ContextoLeitura = {
    termos,
    titulos,
    ir,
    abertos,
    alternar: (ancora) => setAbertos((s) => {
      const n = new Set(s);
      if (n.has(ancora)) n.delete(ancora);
      else n.add(ancora);
      return n;
    }),
  };

  const linhaAtual = linhas?.find((c) => c.pageId === atual?.pageId) ?? null;
  const { anterior, proximo } = linhas && atual ? vizinhos(linhas, atual.pageId) : { anterior: null, proximo: null };
  const resultados = linhas ? buscarNoLivro(linhas, busca, textos) : [];
  const buscando = busca.trim().length >= 2;
  const subtitulos = (capitulo?.blocos ?? []).filter((b) => b.tipo === "titulo" && b.nivel <= 3);

  return (
    <div className="fj-borda fj-ch fj-codex" data-testid="compendio-livro">
      <div className="fj-ch fj-vidro fj-codex__corpo">
        <CabecalhoCodex
          icone={<span className="fj-ch-hex fj-codex-cab__sigla">{linhaAtual?.numero ?? "RP"}</span>}
          kicker={linhaAtual ? `Compêndio · ${linhaAtual.secao}` : "Compêndio · RUPTURA v1.2"}
          titulo={linhaAtual?.titulo ?? "Compêndio"}
          onClose={onClose}
        >
          {historico.length > 0 && (
            <button type="button" className="fj-fechar" onClick={voltar} data-testid="compendio-voltar">‹ Voltar</button>
          )}
          <input
            type="search"
            className="fj-livro-busca"
            placeholder="Buscar no livro…"
            aria-label="Buscar no livro"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            data-testid="compendio-busca"
          />
        </CabecalhoCodex>

        <div className="fj-codex__grade">
          <nav className="fj-sem-barra fj-indice" aria-label="Índice do livro">
            {agruparPorSecao(linhas ?? []).map((g) => (
              <div key={g.secao} className="fj-indice__grupo">
                <div className="fj-livro-indice-secao"><Mono pequeno tom="am">{g.secao}</Mono></div>
                {g.capitulos.map((c) => {
                  const ativo = c.pageId === atual?.pageId;
                  return (
                    <div key={c.pageId}>
                      <button
                        type="button"
                        onClick={() => ir({ pageId: c.pageId })}
                        className={`fj-indice__item ${ativo ? "fj-indice__item--ativo" : ""}`}
                        data-testid="compendio-indice-capitulo"
                      >
                        <span className="fj-indice__n">{c.numero != null ? String(c.numero).padStart(2, "0") : "··"}</span>
                        <span className="fj-indice__rotulo fj-livro-indice-rotulo">{c.titulo}</span>
                      </button>
                      {ativo && subtitulos.map((t) => t.tipo === "titulo" && (
                        <button type="button" key={t.ancora} onClick={() => go(t.ancora)} className={`fj-indice__sub ${active === t.ancora ? "fj-indice__sub--ativo" : ""}`}>
                          {t.texto.map((x) => x.texto).join("")}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>

          <div ref={scroller} className="fj-codex__leitura" tabIndex={-1} data-testid="compendio-leitura">
            {erro && <p className="fj-livro-aviso">{erro}</p>}
            {!linhas && !erro && <p className="fj-livro-aviso fj-mono">Carregando o livro…</p>}
            {linhas && linhas.length === 0 && <p className="fj-livro-aviso">O livro ainda não foi sincronizado.</p>}

            {buscando ? (
              <div className="fj-codex__coluna fj-livro-resultados" data-testid="compendio-resultados">
                <Mono pequeno tom="cy">{resultados.length} resultado{resultados.length === 1 ? "" : "s"}{textos ? "" : " · buscando no texto…"}</Mono>
                <ul>
                  {resultados.map((r, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        className="fj-livro-resultado"
                        onClick={() => ir(r.tipo === "verbete" ? { pageId: r.capitulo.pageId, ancora: r.ancora } : { pageId: r.capitulo.pageId })}
                        data-testid="compendio-resultado"
                      >
                        <span className="fj-mono fj-mono--pequeno">{r.tipo === "capitulo" ? "Capítulo" : r.tipo === "verbete" ? "Verbete" : "Texto"} · {rotuloCapitulo(r.capitulo)}</span>
                        <span className="fj-livro-resultado__titulo">
                          {r.tipo === "capitulo" ? r.capitulo.titulo : r.tipo === "verbete" ? r.titulo : r.trecho}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : capitulo && linhaAtual ? (
              <article key={capitulo.notionPageId}>
                <header className="fj-codex__heroi fj-livro-heroi">
                  <div className="fj-codex__heroi-texto">
                    <Mono tom="am">{linhaAtual.secao}{linhaAtual.numero != null ? ` · Capítulo ${linhaAtual.numero}` : ""}</Mono>
                    <h2 className="fj-codex__heroi-titulo fj-glow">{capitulo.titulo}</h2>
                  </div>
                </header>
                <div className="fj-codex__coluna fj-livro-texto">
                  <Blocos blocos={capitulo.blocos} ctx={ctx} />
                  <nav className="fj-livro-vizinhos" aria-label="Capítulos vizinhos">
                    {anterior ? (
                      <button type="button" className="fj-livro-vizinho" onClick={() => ir({ pageId: anterior.pageId })}>
                        <Mono pequeno>‹ Anterior</Mono>
                        <span>{rotuloCapitulo(anterior)}</span>
                      </button>
                    ) : <span />}
                    {proximo && (
                      <button type="button" className="fj-livro-vizinho fj-livro-vizinho--proximo" onClick={() => ir({ pageId: proximo.pageId })}>
                        <Mono pequeno>Próximo ›</Mono>
                        <span>{rotuloCapitulo(proximo)}</span>
                      </button>
                    )}
                  </nav>
                </div>
              </article>
            ) : (
              carregando && <p className="fj-livro-aviso fj-mono">Abrindo capítulo…</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
