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
import { oxanium } from "../../../../_design/oxanium";
import "../_forja/forja.css";
import "./compendio.css";
import { abrirCapituloAction, enviarSelecaoAoChatAction, enviarTrechoAoChatAction, listarCapitulosAction, textosDoLivroAction } from "./acoes";
import { BotaoExpandir, Blocos, type ContextoLeitura } from "./Blocos";
import {
  agruparPorSecao,
  capituloRaiz,
  buscarNoLivro,
  indiceDeTermos,
  indiceDoCapitulo,
  rotuloCapitulo,
  separarAbertura,
  vizinhos,
  type DestinoLivro,
  type LinhaCapitulo,
} from "./modelo";

const CHAVE_ULTIMO_LIDO = "ruptura:compendio:ultimo";

/** Conveniência por navegador: falhar (aba privada, armazenamento bloqueado) só faz abrir no começo. */
function lerUltimoLido(): string | null {
  try {
    return localStorage.getItem(CHAVE_ULTIMO_LIDO);
  } catch {
    return null;
  }
}

function gravarUltimoLido(pageId: string) {
  try {
    localStorage.setItem(CHAVE_ULTIMO_LIDO, pageId);
  } catch {
    // sem armazenamento: nada a fazer
  }
}

/**
 * O livro numa página inteira, sem modal (Compêndio da área autenticada,
 * fora de qualquer mesa): sem campanha não há chat, então sem "Enviar ao chat".
 */
export function LivroPagina() {
  return (
    <div className={`fj-root ${oxanium.variable} fj-livro-pagina`}>
      <Livro campaignId={null} inicial={null} />
    </div>
  );
}

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

function Livro({ campaignId, inicial, onClose }: { campaignId: string | null; inicial: DestinoLivro | null; onClose?: () => void }) {
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
  const [avisoEnvio, setAvisoEnvio] = useState<string | null>(null);

  /** Imagem aberta em tela cheia ("Expandir"). */
  const [ampliada, setAmpliada] = useState<{ url: string; legenda: string } | null>(null);
  const ampliadaRef = useRef(ampliada);
  ampliadaRef.current = ampliada;

  /** Menu de contexto sobre uma seleção (só na mesa: fora dela não há chat). */
  const [menuSelecao, setMenuSelecao] = useState<{ x: number; y: number; texto: string; ancora: string | null } | null>(null);
  const menuSelecaoRef = useRef(menuSelecao);
  menuSelecaoRef.current = menuSelecao;

  function abrirMenuSelecao(e: React.MouseEvent) {
    if (!campaignId || !atual) return;
    const sel = window.getSelection();
    const texto = sel?.toString().trim() ?? "";
    const no = sel?.anchorNode ?? null;
    // Sem seleção dentro do livro: fica o menu normal do navegador.
    if (!texto || !no || !scroller.current?.contains(no)) return;
    e.preventDefault();
    const el = no.nodeType === Node.ELEMENT_NODE ? (no as Element) : no.parentElement;
    const ancora = el?.closest(".fj-livro-verbete")?.id ?? null;
    setMenuSelecao({ x: e.clientX, y: e.clientY, texto, ancora });
  }

  async function enviarSelecao() {
    const m = menuSelecao;
    setMenuSelecao(null);
    if (!m || !campaignId || !atual) return;
    setAvisoEnvio("Enviando trecho…");
    const r = await enviarSelecaoAoChatAction(campaignId, atual.pageId, m.ancora, m.texto);
    setAvisoEnvio(r.ok ? "Trecho enviado ao chat" : r.erro ?? "Falha ao enviar.");
    window.setTimeout(() => setAvisoEnvio(null), 3500);
  }

  // O menu fecha com clique fora, rolagem ou troca de página.
  useEffect(() => {
    if (!menuSelecao) return;
    const fechar = () => setMenuSelecao(null);
    const fora = (ev: MouseEvent) => { if (!(ev.target as Element | null)?.closest?.(".fj-livro-menu")) fechar(); };
    window.addEventListener("mousedown", fora);
    window.addEventListener("wheel", fechar, { passive: true });
    window.addEventListener("resize", fechar);
    return () => {
      window.removeEventListener("mousedown", fora);
      window.removeEventListener("wheel", fechar);
      window.removeEventListener("resize", fechar);
    };
  }, [menuSelecao]);
  useEffect(() => setMenuSelecao(null), [atual]);

  async function enviarAoChat(pageId: string, ancora: string | null) {
    if (!campaignId) return;
    setAvisoEnvio("Enviando…");
    const r = await enviarTrechoAoChatAction(campaignId, pageId, ancora);
    setAvisoEnvio(r.ok ? "Enviado ao chat" : r.erro ?? "Falha ao enviar.");
    window.setTimeout(() => setAvisoEnvio(null), 3000);
  }

  useEffect(() => {
    let vivo = true;
    void listarCapitulosAction(campaignId).then((r) => {
      if (!vivo) return;
      if (!r.ok || !r.dados) return setErro(r.erro ?? "Não foi possível carregar o Compêndio.");
      setLinhas(r.dados);
      // Sem destino pedido: volta ao último capítulo lido neste navegador; senão, o começo do livro.
      const ultimo = lerUltimoLido();
      const retomar = ultimo && r.dados.some((c) => c.pageId === ultimo) ? ultimo : r.dados.find((c) => !c.paiPageId)?.pageId;
      setAtual((a) => a ?? (retomar ? { pageId: retomar } : null));
    });
    return () => { vivo = false; };
  }, [campaignId]);

  const capitulo = atual ? capitulos.get(atual.pageId) ?? null : null;

  useEffect(() => {
    if (atual) gravarUltimoLido(atual.pageId);
  }, [atual]);

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

  // Numa subpágina, o índice mostra a árvore do capítulo raiz: carrega o raiz também.
  const raizAtual = atual && linhas ? capituloRaiz(linhas, atual.pageId) : null;
  useEffect(() => {
    if (!raizAtual || raizAtual === atual?.pageId || capitulos.has(raizAtual)) return;
    let vivo = true;
    void abrirCapituloAction(campaignId, raizAtual).then((r) => {
      if (vivo && r.ok && r.dados) setCapitulos((m) => new Map(m).set(raizAtual, r.dados!));
    });
    return () => { vivo = false; };
  }, [raizAtual, atual, capitulos, campaignId]);

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
      if (menuSelecaoRef.current || ampliadaRef.current) {
        e.preventDefault();
        e.stopPropagation();
        setMenuSelecao(null);
        setAmpliada(null);
        return;
      }
      if (!fecharRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      fecharRef.current?.();
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
  const paginas = useMemo(() => {
    const porId = new Map((linhas ?? []).map((c) => [c.pageId, c]));
    return new Map((linhas ?? []).map((c) => [c.pageId, { numero: c.numero, titulo: c.titulo, pai: c.paiPageId ? porId.get(c.paiPageId)?.titulo ?? c.secao : null }]));
  }, [linhas]);
  const ctx: ContextoLeitura = {
    termos,
    titulos,
    paginas,
    ir,
    abertos,
    expandir: (url, legenda) => setAmpliada({ url, legenda }),
    enviar: campaignId ? (ancora) => atual && void enviarAoChat(atual.pageId, ancora) : undefined,
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
  // Com capa, a abertura vai para o herói (ver separarAbertura).
  const { abertura, corpo } = capitulo?.abertura?.length
    ? { abertura: capitulo.abertura, corpo: capitulo.blocos }
    : capitulo?.capa ? separarAbertura(capitulo.blocos) : { abertura: [], corpo: capitulo?.blocos ?? [] };
  const capituloRaizCarregado = raizAtual ? capitulos.get(raizAtual) ?? null : null;
  const indiceAtivo = capituloRaizCarregado ? indiceDoCapitulo(capituloRaizCarregado.blocos) : [];
  const naRaiz = raizAtual === atual?.pageId;

  return (
    <div className="fj-borda fj-ch fj-codex" data-testid="compendio-livro">
      {ampliada && createPortal(
        <div className={`fj-root ${oxanium.variable} fj-mapa-grande fj-livro-ampliada`} role="dialog" aria-modal="true" aria-label="Imagem ampliada" onClick={() => setAmpliada(null)} data-testid="compendio-imagem-ampliada">
          <div className="fj-mapa-grande__topo" onClick={(e) => e.stopPropagation()}>
            {ampliada.legenda && <span className="fj-mapa-grande__nome">{ampliada.legenda}</span>}
            <button type="button" onClick={() => setAmpliada(null)} className="fj-fechar fj-mapa-grande__fechar">ESC · Fechar</button>
          </div>
          <div className="fj-mapa-grande__area">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ampliada.url} alt={ampliada.legenda} className="fj-livro-ampliada__img" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>,
        document.body,
      )}
      {menuSelecao && createPortal(
        <div className={`fj-root ${oxanium.variable}`}>
        <div
          className="fj-livro-menu"
          role="menu"
          style={{ left: Math.min(menuSelecao.x, window.innerWidth - 240), top: Math.min(menuSelecao.y, window.innerHeight - 60) }}
          data-testid="compendio-menu-selecao"
        >
          <button type="button" role="menuitem" className="fj-livro-menu__item" onClick={() => void enviarSelecao()} autoFocus data-testid="compendio-enviar-selecao">
            Enviar trecho ao chat
          </button>
        </div>
        </div>,
        document.body,
      )}
      <div className="fj-ch fj-vidro fj-codex__corpo">
        <CabecalhoCodex
          icone={<span className="fj-ch-hex fj-codex-cab__sigla">{linhaAtual?.numero ?? "RP"}</span>}
          kicker={linhaAtual ? `Compêndio · ${linhaAtual.paiPageId ? titulos.get(linhaAtual.paiPageId) ?? linhaAtual.secao : linhaAtual.secao}` : "Compêndio · RUPTURA v1.2"}
          titulo={linhaAtual?.titulo ?? "Compêndio"}
          onClose={onClose}
        >
          {avisoEnvio && <span className="fj-mono fj-mono--pequeno fj-mono--am" role="status" data-testid="compendio-aviso-envio">{avisoEnvio}</span>}
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
                  const ativo = !!atual && c.pageId === capituloRaiz(linhas ?? [], atual.pageId);
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
                      {ativo && indiceAtivo.map((t, k) => (
                        <div key={t.ancora ?? `sem-titulo-${k}`}>
                          {t.ancora && (
                            <button
                              type="button"
                              onClick={() => (naRaiz ? go(t.ancora!) : ir({ pageId: c.pageId, ancora: t.ancora! }))}
                              className={`fj-indice__sub ${naRaiz && active === t.ancora ? "fj-indice__sub--ativo" : ""}`}
                            >
                              {t.texto}
                            </button>
                          )}
                          {t.subpaginas.map((sp) => (
                            <button
                              type="button"
                              key={sp.pageId}
                              onClick={() => ir({ pageId: sp.pageId })}
                              className={`fj-indice__sub fj-livro-indice-subpagina ${capituloRaiz(linhas ?? [], atual?.pageId ?? "") === c.pageId && (atual?.pageId === sp.pageId || (linhas ?? []).find((l) => l.pageId === atual?.pageId)?.paiPageId === sp.pageId) ? "fj-indice__sub--ativo" : ""}`}
                              data-testid="compendio-indice-subpagina"
                            >
                              {sp.titulo || titulos.get(sp.pageId)}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </nav>

          <div ref={scroller} className="fj-codex__leitura" tabIndex={-1} data-testid="compendio-leitura" onContextMenu={abrirMenuSelecao}>
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
                <header className={`fj-codex__heroi fj-livro-heroi ${capitulo.capa ? "fj-livro-heroi--arte" : ""} ${capitulo.capa && capitulo.capa.largura > capitulo.capa.altura * 2 ? "fj-livro-heroi--panorama" : ""}`}>
                  {capitulo.capa && (
                    <div className="fj-livro-heroi__arte">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={capitulo.capa.url} alt="" className="fj-codex__heroi-img" style={capitulo.capa.posicao ? { objectPosition: capitulo.capa.posicao } : undefined} />
                      <BotaoExpandir onClick={() => setAmpliada({ url: capitulo.capa!.url, legenda: capitulo.titulo })} />
                    </div>
                  )}
                  <div className="fj-codex__heroi-texto">
                    {linhaAtual.paiPageId ? (
                      <button type="button" className="fj-livro-pai" onClick={() => ir({ pageId: linhaAtual.paiPageId! })}>
                        ‹ {titulos.get(linhaAtual.paiPageId) ?? linhaAtual.secao}
                      </button>
                    ) : (
                      <Mono tom="am">{linhaAtual.secao}{linhaAtual.numero != null ? ` · Capítulo ${linhaAtual.numero}` : ""}</Mono>
                    )}
                    <h2 className="fj-codex__heroi-titulo fj-glow">{capitulo.titulo}</h2>
                    {abertura.length > 0 && (
                      <div className="fj-codex__paragrafos fj-livro-abertura">
                        <Blocos blocos={abertura} ctx={ctx} />
                      </div>
                    )}
                    {campaignId && <button type="button" className="fj-livro-enviar fj-livro-enviar--heroi" onClick={() => void enviarAoChat(capitulo.notionPageId, null)} data-testid="compendio-enviar-pagina">
                      Enviar ao chat
                    </button>}
                  </div>
                </header>
                <div className="fj-codex__coluna fj-livro-texto">
                  <Blocos blocos={corpo} ctx={ctx} />
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
