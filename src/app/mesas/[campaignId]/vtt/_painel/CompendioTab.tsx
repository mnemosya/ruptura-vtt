"use client";

/**
 * Aba Compêndio do painel: o índice do livro de RUPTURA v1.2
 * (sincronizado do Notion). Clicar num capítulo ou verbete abre o livro
 * (`_compendio/LivroCodex.tsx`) naquele ponto.
 *
 * Substituiu o diretório de conteúdo da campanha (magias, itens, runas,
 * condições), decisão de 02/10/2026 (PLANO_COMPENDIO_NOTION.md).
 * Carrega só ao ficar visível pela primeira vez.
 */

import { useEffect, useMemo, useState } from "react";
import { BookOpen, CloudDownload, Loader2, RefreshCw } from "lucide-react";
import { BotaoAba, BuscaDiretorio, CabecalhoGrupo, LinhaDiretorio, RodapeAcoes } from "./Diretorio";
import { EstadoCarregando, EstadoErro, EstadoVazio } from "./Estados";
import { listarCapitulosAction, podeSincronizarAction, sincronizarAgoraAction } from "../_compendio/acoes";
import { agruparPorSecao, buscarNoLivro, rotuloCapitulo, type DestinoLivro, type LinhaCapitulo } from "../_compendio/modelo";

type Estado = { fase: "ocioso" } | { fase: "carregando" } | { fase: "erro"; mensagem: string } | { fase: "pronto"; linhas: LinhaCapitulo[] };

export function CompendioTab({
  campaignId,
  visivel,
  onAbrir,
  fixtureVisual,
}: {
  campaignId: string;
  visivel: boolean;
  onAbrir: (destino: DestinoLivro | null) => void;
  /** Linhas prontas para a galeria de estilos (sem servidor). */
  fixtureVisual?: LinhaCapitulo[];
}) {
  const [estado, setEstado] = useState<Estado>({ fase: "ocioso" });
  const [busca, setBusca] = useState("");
  const [podeSincronizar, setPodeSincronizar] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [avisoSync, setAvisoSync] = useState<string | null>(null);

  async function sincronizar() {
    setSincronizando(true);
    setAvisoSync("Lendo o Notion… pode levar alguns minutos se muita coisa mudou.");
    const r = await sincronizarAgoraAction();
    setSincronizando(false);
    if (!r.ok || !r.dados) return setAvisoSync(r.erro ?? "A sincronização falhou.");
    const { criados, atualizados, arquivados, falhas } = r.dados;
    const mudou = criados + atualizados + arquivados;
    setAvisoSync(
      (mudou === 0 ? "Livro já estava em dia." : `${atualizados} capítulo(s) atualizado(s), ${criados} novo(s), ${arquivados} arquivado(s).`) +
        (falhas.length ? ` Falhas: ${falhas.join("; ")}` : ""),
    );
    if (mudou > 0) carregar();
  }

  function carregar() {
    if (fixtureVisual) return setEstado({ fase: "pronto", linhas: fixtureVisual });
    setEstado({ fase: "carregando" });
    void listarCapitulosAction(campaignId).then((r) =>
      setEstado(r.ok && r.dados ? { fase: "pronto", linhas: r.dados } : { fase: "erro", mensagem: r.erro ?? "Não foi possível carregar o Compêndio." }),
    );
  }

  useEffect(() => {
    if (visivel && estado.fase === "ocioso") {
      carregar();
      if (!fixtureVisual) void podeSincronizarAction().then(setPodeSincronizar);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel]);

  const linhas = estado.fase === "pronto" ? estado.linhas : [];
  const grupos = useMemo(() => agruparPorSecao(linhas), [linhas]);
  const resultados = useMemo(() => buscarNoLivro(linhas, busca), [linhas, busca]);
  const buscando = busca.trim().length >= 2;

  return (
    <div className="rv-pn-aba" data-testid="painel-compendio">
      <BuscaDiretorio valor={busca} onMudar={setBusca} rotulo="Buscar no livro" placeholder="Capítulo ou verbete…" testId="painel-compendio-busca" />
      <div className="rv-pn-scroll">
        {(estado.fase === "ocioso" || estado.fase === "carregando") && <EstadoCarregando rotulo="Carregando o livro…" />}
        {estado.fase === "erro" && <EstadoErro mensagem={estado.mensagem} />}
        {estado.fase === "pronto" && linhas.length === 0 && <EstadoVazio>O livro ainda não foi sincronizado.</EstadoVazio>}

        {estado.fase === "pronto" && buscando && (
          resultados.length === 0 ? (
            <EstadoVazio>Nada encontrado em títulos e verbetes. A busca no texto completo fica dentro do livro.</EstadoVazio>
          ) : (
            <ul className="rv-pn-lista">
              {resultados.map((r, i) => r.tipo !== "texto" && (
                <LinhaDiretorio
                  key={i}
                  face={<BookOpen size={14} />}
                  nome={r.tipo === "verbete" ? r.titulo : rotuloCapitulo(r.capitulo)}
                  subtitulo={r.tipo === "verbete" ? `Verbete · ${rotuloCapitulo(r.capitulo)}` : r.capitulo.secao}
                  onAbrir={() => onAbrir(r.tipo === "verbete" ? { pageId: r.capitulo.pageId, ancora: r.ancora } : { pageId: r.capitulo.pageId })}
                  testId="painel-compendio-resultado"
                />
              ))}
            </ul>
          )
        )}

        {estado.fase === "pronto" && !buscando && grupos.map((g) => (
          <div key={g.secao}>
            <CabecalhoGrupo rotulo={g.secao} contagem={g.capitulos.length} />
            <ul className="rv-pn-lista">
              {g.capitulos.map((c) => (
                <LinhaDiretorio
                  key={c.pageId}
                  face={<span className="rv-pn-compendio-num">{c.numero ?? "·"}</span>}
                  nome={c.titulo}
                  subtitulo={c.verbetes.length ? `${c.verbetes.length} verbete${c.verbetes.length === 1 ? "" : "s"}` : undefined}
                  onAbrir={() => onAbrir({ pageId: c.pageId })}
                  testId="painel-compendio-capitulo"
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
      <RodapeAcoes>
        <BotaoAba primario onClick={() => onAbrir(null)} testId="painel-compendio-abrir-livro">
          <BookOpen size={13} /> Abrir o livro
        </BotaoAba>
        <BotaoAba onClick={carregar} desabilitado={estado.fase === "carregando"} titulo="Recarregar o índice" testId="painel-compendio-atualizar">
          <RefreshCw size={13} />
        </BotaoAba>
        {podeSincronizar && (
          <BotaoAba onClick={() => void sincronizar()} desabilitado={sincronizando} titulo="Buscar agora as mudanças do Notion" testId="painel-compendio-sincronizar">
            {sincronizando ? <Loader2 size={13} className="rv-spin" /> : <CloudDownload size={13} />}
          </BotaoAba>
        )}
        {avisoSync && <span className="rv-pn-aviso" role="status" data-testid="painel-compendio-aviso-sync">{avisoSync}</span>}
      </RodapeAcoes>
    </div>
  );
}
