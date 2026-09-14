"use client";

/**
 * Compêndio — diretório pesquisável do conteúdo EFETIVO da campanha
 * (oficial + override + homebrew publicado), resolvido pelas consultas
 * que já existem (`resolveEffectiveList`/`resolveEffectiveOne`).
 *
 * CARREGAMENTO SOB DEMANDA, em três degraus (ver
 * `acoes/compendioPainel.ts`):
 *   · abrir a aba → só as CONTAGENS por categoria;
 *   · escolher categoria / digitar → linhas leves daquela categoria;
 *   · abrir uma linha → o documento completo.
 * Nada disso acontece no primeiro render do VTT, e cada consulta já
 * respondida fica no cache DA SESSÃO (um `Map` neste componente, que
 * sobrevive à troca de aba porque o painel mantém as abas montadas).
 *
 * "Enviar ao Chat" persiste um EVENTO estruturado
 * (`compendio_compartilhado`), com nome/categoria/origem/resumo
 * resolvidos no servidor. Visualizar NUNCA instancia nada — nenhum
 * item entra em inventário por causa desta aba.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, ExternalLink, Loader2, RefreshCw, Send } from "lucide-react";
import { BotaoAba, BuscaDiretorio, CabecalhoGrupo, LinhaDiretorio, RodapeAcoes } from "./Diretorio";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "./Estados";
import { SecaoDossie } from "./ui/primitivas";

/** Acento por categoria — a mesma ideia de `ACCENTS` da referência (uma cor por categoria, nunca por tipo de evento). */
const ACENTO_CATEGORIA: Record<CategoriaCompendio, string> = {
  magias: "var(--rv-ar)",
  talentos: "var(--rv-am)",
  itens: "var(--rv-cy)",
  runas: "var(--rv-mg)",
  condicoes: "var(--rv-dg)",
  companheiros: "var(--rv-ok)",
};
import {
  CATEGORIAS_COMPENDIO,
  chaveCache,
  filtrarLinhas,
  rotuloDaCategoria,
  rotuloDaOrigem,
  type CategoriaCompendio,
  type LinhaCompendio,
} from "./compendioModelo";
import {
  abrirCompendioAction,
  buscarCompendioAction,
  enviarCompendioAoChatAction,
  lerResumoCompendioAction,
  type DetalheCompendio,
  type ResumoCompendio,
} from "./acoes/compendioPainel";
import { useRolagemVelada } from "../_shell/useRolagemVelada";
import { comecarLeitura, dadosDoEstado, falharLeitura, type EstadoAba } from "./tipos";

/** Espera antes de disparar a busca no servidor — evita uma ida por tecla digitada. */
const ATRASO_BUSCA_MS = 250;

export function CompendioTab({
  campaignId,
  visivel,
  onAbrirJanela,
  fixtureVisual,
}: {
  campaignId: string;
  visivel: boolean;
  /** Abre o Compêndio completo em JANELA INTERNA. `undefined` quando ESTA instância já é a janela. */
  onAbrirJanela?: () => void;
  /**
   * Dados prontos, só para a galeria visual em `/dev/estilos` — nunca
   * usado pela mesa real. Mesmo padrão do `dadosFixos` do
   * `CartaoTokenHover`: sem ele, a única forma de ver esta aba fora de
   * uma campanha seria o estado de erro.
   */
  fixtureVisual?: ResumoCompendio[];
}) {
  /* O degradê nas pontas da lista — ver `useRolagemVelada`. */
  const veuDaLista = useRolagemVelada<HTMLDivElement>();
  const [resumo, setResumo] = useState<EstadoAba<ResumoCompendio[]>>({ fase: "ocioso" });
  const [categoria, setCategoria] = useState<CategoriaCompendio | null>(null);
  const [consulta, setConsulta] = useState("");
  const [linhas, setLinhas] = useState<EstadoAba<{ linhas: LinhaCompendio[]; truncado: boolean }>>({ fase: "ocioso" });
  const [detalhe, setDetalhe] = useState<EstadoAba<DetalheCompendio>>({ fase: "ocioso" });
  const [enviando, setEnviando] = useState(false);
  const [avisoEnvio, setAvisoEnvio] = useState<string | null>(null);
  const jaCarregouRef = useRef(false);
  /** Cache DA SESSÃO por (categoria, consulta) — sobrevive à troca de aba porque o painel não desmonta as abas. */
  const cacheRef = useRef(new Map<string, { linhas: LinhaCompendio[]; truncado: boolean }>());

  const carregarResumo = useCallback(async () => {
    if (fixtureVisual) { setResumo({ fase: "pronto", dados: fixtureVisual }); return; }
    setResumo((e) => comecarLeitura(e));
    const r = await lerResumoCompendioAction(campaignId);
    setResumo((e) => (r.ok && r.dados ? { fase: "pronto", dados: r.dados } : falharLeitura(e, r.erro ?? "Falha ao carregar o Compêndio.")));
  }, [campaignId, fixtureVisual]);

  useEffect(() => {
    if (!visivel || jaCarregouRef.current) return;
    jaCarregouRef.current = true;
    carregarResumo();
  }, [visivel, carregarResumo]);

  const resumos = dadosDoEstado(resumo);
  // Esta aba NÃO tem contador: o tamanho do catálogo não muda com o
  // jogo e não pede ação nenhuma — um "99+" permanente na faixa de
  // ícones seria exatamente o badge decorativo que este trabalho
  // veio remover (o "3" fixo do Chat). Chat conta não lidos,

  // Busca com atraso, cache e descarte de resposta velha. O `seq`
  // garante que uma resposta mais LENTA de uma consulta anterior nunca
  // sobrescreve a mais recente.
  const seqRef = useRef(0);
  useEffect(() => {
    if (!visivel || !categoria) return;
    const chave = chaveCache(categoria, consulta);
    const emCache = cacheRef.current.get(chave);
    if (emCache) {
      setLinhas({ fase: "pronto", dados: emCache });
      return;
    }
    const seq = ++seqRef.current;
    setLinhas((e) => comecarLeitura(e));
    const timer = setTimeout(async () => {
      const r = await buscarCompendioAction(campaignId, categoria, consulta);
      if (seq !== seqRef.current) return;
      if (r.ok && r.dados) {
        cacheRef.current.set(chave, r.dados);
        setLinhas({ fase: "pronto", dados: r.dados });
      } else {
        setLinhas((e) => falharLeitura(e, r.erro ?? "Falha ao buscar no Compêndio."));
      }
    }, ATRASO_BUSCA_MS);
    return () => clearTimeout(timer);
  }, [visivel, categoria, consulta, campaignId]);

  const dadosLinhas = dadosDoEstado(linhas);
  // Refino local instantâneo sobre o que já veio, com a MESMA regra do
  // servidor — a busca real continua acontecendo lá (ela enxerga a
  // categoria inteira, não só o que já está em memória).
  const linhasVisiveis = useMemo(
    () => (dadosLinhas ? filtrarLinhas(dadosLinhas.linhas, consulta) : []),
    [dadosLinhas, consulta],
  );

  const abrirDetalhe = useCallback(
    async (linha: LinhaCompendio) => {
      setAvisoEnvio(null);
      setDetalhe({ fase: "carregando" });
      const r = await abrirCompendioAction(campaignId, linha.categoria, linha.slug);
      setDetalhe(r.ok && r.dados ? { fase: "pronto", dados: r.dados } : { fase: "erro", mensagem: r.erro ?? "Falha ao abrir.", dados: null });
    },
    [campaignId],
  );

  const detalheAtual = dadosDoEstado(detalhe);
  const mostrandoDetalhe = detalhe.fase !== "ocioso";

  async function enviarAoChat(categoriaAlvo: CategoriaCompendio, slug: string) {
    setEnviando(true);
    setAvisoEnvio(null);
    try {
      const r = await enviarCompendioAoChatAction(campaignId, categoriaAlvo, slug);
      setAvisoEnvio(r.ok ? "Enviado ao Chat." : (r.erro ?? "Falha ao enviar ao Chat."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rv-pn-aba">
      <div className="rv-pn-dossie" data-detalhe={mostrandoDetalhe ? "true" : undefined}>
        {/* ── Lista: busca, categorias, entradas ─────────────────── */}
        <div className="rv-pn-dossie-lista">
          <BuscaDiretorio
            valor={consulta}
            onMudar={(v) => {
              setConsulta(v);
              // Digitar sem categoria escolhida cai na primeira — buscar
              // "em tudo" exigiria varrer seis catálogos por tecla.
              if (v.trim() && !categoria) setCategoria(CATEGORIAS_COMPENDIO[0]);
            }}
            rotulo="Buscar no Compêndio"
            placeholder="Buscar por nome ou slug…"
            testId="painel-compendio-busca"
          />

          <div className="rv-pn-chips" role="group" aria-label="Categorias do Compêndio">
            {CATEGORIAS_COMPENDIO.map((c) => {
              const info = resumos?.find((r) => r.categoria === c);
              const ativo = categoria === c;
              return (
                <button
                  key={c}
                  type="button"
                  className="rv-pn-chip"
                  aria-pressed={ativo}
                  onClick={() => setCategoria((atual) => (atual === c ? null : c))}
                  data-testid={`painel-compendio-categoria-${c}`}
                  style={ativo ? { color: ACENTO_CATEGORIA[c], borderColor: `color-mix(in srgb, ${ACENTO_CATEGORIA[c]} 47%, transparent)`, background: `color-mix(in srgb, ${ACENTO_CATEGORIA[c]} 9%, transparent)` } : undefined}
                >
                  {rotuloDaCategoria(c)}
                  {info && <span className="rv-pn-chip-n">{info.total}</span>}
                </button>
              );
            })}
          </div>

          <div {...veuDaLista.atributos} className="rv-pn-scroll" data-testid="painel-compendio-scroll">
            {resumo.fase === "carregando" && <EstadoCarregando testId="painel-compendio-carregando" />}
            {resumo.fase === "erro" && <EstadoErro mensagem={resumo.mensagem} onTentarDeNovo={carregarResumo} testId="painel-compendio-erro" />}

            {!categoria && resumos && (
              <ul className="rv-pn-lista" data-testid="painel-compendio-resumo">
                {resumos.map((r) => (
                  <LinhaDiretorio
                    key={r.categoria}
                    face={<BookOpen size={14} />}
                    nome={r.rotulo}
                    subtitulo={r.daMesa > 0 ? `${r.total} entradas · ${r.daMesa} da mesa` : `${r.total} entradas`}
                    onAbrir={() => setCategoria(r.categoria)}
                    testId="painel-compendio-resumo-linha"
                    atributos={{ "data-categoria": r.categoria, "data-total": String(r.total) }}
                  />
                ))}
              </ul>
            )}

            {categoria && (
              <>
                <CabecalhoGrupo rotulo={rotuloDaCategoria(categoria)} contagem={linhasVisiveis.length} glifo={<BookOpen size={13} />} />
                {linhas.fase === "carregando" && <EstadoCarregando testId="painel-compendio-buscando" />}
                {linhas.fase === "erro" && <EstadoErro mensagem={linhas.mensagem} testId="painel-compendio-busca-erro" />}
                {dadosLinhas && linhasVisiveis.length === 0 && linhas.fase !== "carregando" && (
                  <EstadoVazio testId="painel-compendio-vazio">Nada nesta categoria com esse termo.</EstadoVazio>
                )}
                <ul className="rv-pn-lista">
                  {linhasVisiveis.map((l) => (
                    <LinhaDiretorio
                      key={`${l.categoria}:${l.slug}`}
                      face={l.nome.slice(0, 2).toUpperCase()}
                      nome={l.nome}
                      acento={ACENTO_CATEGORIA[l.categoria]}
                      subtitulo={l.subtitulo ?? undefined}
                      selecionado={detalheAtual?.slug === l.slug && detalheAtual.categoria === l.categoria}
                      marca={
                        l.origem !== "oficial" ? (
                          <span className="rv-pn-tag" title={rotuloDaOrigem(l.origem)}>
                            {l.origem === "homebrew" ? "homebrew" : "modificado"}
                          </span>
                        ) : undefined
                      }
                      onAbrir={() => abrirDetalhe(l)}
                      testId="painel-compendio-linha"
                      atributos={{ "data-slug": l.slug, "data-origem": l.origem }}
                    />
                  ))}
                </ul>
                {dadosLinhas?.truncado && (
                  <p className="rv-pn-estado rv-pn-estado--vazio">Mostrando os primeiros resultados — refine a busca.</p>
                )}
              </>
            )}
          </div>

          <RodapeAcoes>
            {onAbrirJanela && (
              <BotaoAba onClick={onAbrirJanela} testId="painel-compendio-abrir">
                <ExternalLink size={13} /> Abrir Compêndio
              </BotaoAba>
            )}
            <BotaoAba
              desabilitado={resumo.fase === "carregando"}
              onClick={() => {
                cacheRef.current.clear();
                setLinhas({ fase: "ocioso" });
                carregarResumo();
              }}
              testId="painel-compendio-atualizar"
            >
              <RefreshCw size={13} /> Atualizar
            </BotaoAba>
          </RodapeAcoes>
        </div>

        {/* ── Detalhe: verbete aberto (ou o placeholder, em janela larga) ── */}
        <div className="rv-pn-dossie-detalhe">
          {!mostrandoDetalhe && (
            <div className="rv-pn-dossie-vazio">
              <BookOpen size={22} aria-hidden="true" style={{ opacity: 0.4 }} />
              <strong>Selecione um verbete</strong>
              <span>Escolha uma entrada da lista para ver o detalhe.</span>
            </div>
          )}
          {mostrandoDetalhe && detalhe.fase === "carregando" && !detalheAtual && (
            <div className="rv-pn-scroll" data-testid="painel-compendio-detalhe"><EstadoCarregando /></div>
          )}
          {mostrandoDetalhe && detalhe.fase === "erro" && !detalheAtual && (
            <div className="rv-pn-scroll" data-testid="painel-compendio-detalhe">
              <EstadoErro mensagem={detalhe.mensagem} testId="painel-compendio-detalhe-erro" />
            </div>
          )}
          {mostrandoDetalhe && detalheAtual && (
            <div className="rv-fg-card" data-testid="painel-compendio-detalhe" style={{ "--fg-a": ACENTO_CATEGORIA[detalheAtual.categoria] } as React.CSSProperties}>
              <div className="rv-fg-brackets" aria-hidden="true">
                <span className="rv-fg-bk-tl" /><span className="rv-fg-bk-tr" /><span className="rv-fg-bk-bl" /><span className="rv-fg-bk-br" />
              </div>
              <div className="rv-fg-espinha">
                <span className="rv-fg-espinha-topo">§</span>
                <span className="rv-fg-espinha-rotulo">Verbete</span>
                <span className="rv-fg-espinha-ponto" />
              </div>
              <div className="rv-fg-corpo">
                <div className="rv-fg-cab">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button type="button" className="rv-pn-voltar" onClick={() => setDetalhe({ fase: "ocioso" })} data-testid="painel-compendio-voltar" style={{ marginBottom: 8 }}>
                      <ArrowLeft size={13} /> Compêndio
                    </button>
                    <h3 className="rv-pn-detalhe-titulo">{detalheAtual.nome}</h3>
                    <div className="rv-pn-detalhe-sub"><i />{rotuloDaCategoria(detalheAtual.categoria)} · {rotuloDaOrigem(detalheAtual.origem)}</div>
                  </div>
                </div>
                <div className="rv-fg-scroll">
                  <CampoPayload payload={detalheAtual.payload} />
                </div>
                <RodapeAcoes>
                  <BotaoAba
                    desabilitado={enviando}
                    onClick={() => enviarAoChat(detalheAtual.categoria, detalheAtual.slug)}
                    testId="painel-compendio-enviar-chat"
                  >
                    {enviando ? <Loader2 size={13} className="rv-spin" /> : <Send size={13} />} Enviar ao Chat
                  </BotaoAba>
                  {avisoEnvio && <span className="rv-pn-aviso" role="status">{avisoEnvio}</span>}
                </RodapeAcoes>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Campos de ENVELOPE do documento — identidade, versionamento e
 * procedência. Já aparecem no cabeçalho do detalhe (nome, categoria,
 * origem) ou não dizem nada a quem está jogando; listá-los como se
 * fossem regra empurra o conteúdo de verdade pra baixo da dobra.
 * Mesma ideia da lista `skip` de `formatGenericLog`
 * (lib/table/logPresentation.ts).
 */
const CAMPOS_DE_ENVELOPE = new Set([
  "id",
  "slug",
  "nome",
  "status",
  "versao",
  "version",
  "schema_version",
  "payload_hash",
  "source_pack_id",
  "source_pack_version",
  "content_type",
  "created_at",
  "updated_at",
]);

/**
 * Renderização legível de um payload de conteúdo: campos escalares
 * viram linhas de definição, listas de string viram listas, e o resto
 * é omitido. NUNCA `JSON.stringify` na tela — se um campo não é
 * apresentável, ele simplesmente não aparece.
 */
function CampoPayload({ payload }: { payload: Record<string, unknown> }) {
  const escalares: { chave: string; valor: string }[] = [];
  const textos: { chave: string; valor: string }[] = [];
  const listas: { chave: string; valores: string[] }[] = [];

  for (const [chave, valor] of Object.entries(payload)) {
    if (CAMPOS_DE_ENVELOPE.has(chave)) continue;
    if (typeof valor === "string") {
      if (valor.length > 120) textos.push({ chave, valor });
      else if (valor.trim()) escalares.push({ chave, valor });
    } else if (typeof valor === "number" || typeof valor === "boolean") {
      escalares.push({ chave, valor: String(valor) });
    } else if (Array.isArray(valor)) {
      const strings = valor.filter((v): v is string => typeof v === "string");
      if (strings.length > 0) listas.push({ chave, valores: strings });
    }
  }

  const humanizar = (k: string) => k.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  let n = 0;
  const proximoN = () => String(++n).padStart(2, "0");

  return (
    <>
      {escalares.length > 0 && (
        <SecaoDossie n={proximoN()} titulo="Estatísticas">
          <div className="rv-fg-statgrid" style={{ "--rv-fg-cols": escalares.length >= 3 ? 3 : 2 } as React.CSSProperties}>
            {escalares.map((c) => (
              <div key={c.chave} className="rv-fg-statcell"><b>{c.valor}</b><span>{humanizar(c.chave)}</span></div>
            ))}
          </div>
        </SecaoDossie>
      )}
      {listas.map((l) => (
        <SecaoDossie key={l.chave} n={proximoN()} titulo={humanizar(l.chave)}>
          <div className="rv-fg-chips">
            {l.valores.map((v, j) => (
              <span key={j} className="rv-fg-chip">{v}</span>
            ))}
          </div>
        </SecaoDossie>
      ))}
      {textos.map((t) => (
        <SecaoDossie key={t.chave} n={proximoN()} titulo={humanizar(t.chave)}>
          <p className="rv-fg-texto">{t.valor}</p>
        </SecaoDossie>
      ))}
    </>
  );
}
