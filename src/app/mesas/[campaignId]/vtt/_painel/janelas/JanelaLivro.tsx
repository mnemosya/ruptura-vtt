"use client";

/**
 * O LIVRO, dentro da mesa.
 *
 * Eram duas rotas — `/livro` (sumário) e `/livro/[slug]` (capítulo) —
 * e ler um capítulo no meio da sessão custava sair do mapa. Aqui é uma
 * janela com duas vistas: a lista, e o capítulo aberto. Voltar é
 * estado, não navegação.
 *
 * Leitura pura, para os DOIS papéis, e só `published`: rascunho é do
 * narrador e mora em "Conteúdo da campanha".
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { JanelaInterna } from "../ui/JanelaInterna";
import {
  lerCapituloAction,
  listarCapitulosAction,
  type CapituloAberto,
  type CapituloDoLivro,
} from "../../_acoes/campanhaActions";

const TIPO_CONTEUDO_LABEL: Record<string, string> = {
  spell: "Magia",
  talent: "Talento",
  item: "Item",
  rune: "Runa",
  capitulo: "Capítulo",
};

export function JanelaLivro({ campaignId, onFechar }: { campaignId: string; onFechar: () => void }) {
  const [capitulos, setCapitulos] = useState<CapituloDoLivro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  /** `null` = sumário. Trocar de capítulo é trocar este estado. */
  const [aberto, setAberto] = useState<CapituloAberto | null>(null);
  const [carregandoCapitulo, setCarregandoCapitulo] = useState(false);

  useEffect(() => {
    let vivo = true;
    void listarCapitulosAction(campaignId).then((r) => {
      if (!vivo) return;
      if (!r.ok) { setErro(r.erro ?? "Falha ao carregar o Livro."); return; }
      setCapitulos(r.dados ?? []);
    });
    return () => { vivo = false; };
  }, [campaignId]);

  const abrirCapitulo = useCallback(async (slug: string) => {
    setCarregandoCapitulo(true);
    setErro(null);
    const r = await lerCapituloAction(campaignId, slug);
    setCarregandoCapitulo(false);
    if (!r.ok || !r.dados) { setErro(r.erro ?? "Falha ao abrir o capítulo."); return; }
    setAberto(r.dados);
  }, [campaignId]);

  const termo = busca.trim().toLowerCase();
  const filtrados = (capitulos ?? []).filter((c) =>
    !termo
    || c.nome.toLowerCase().includes(termo)
    || (c.descricaoCurta ?? "").toLowerCase().includes(termo)
    || c.tags.some((t) => t.toLowerCase().includes(termo)),
  );

  return (
    <JanelaInterna
      aberta
      titulo="Livro"
      subtitulo={aberto?.nome}
      largura={680}
      altura={620}
      onFechar={onFechar}
      testId="painel-janela-livro"
    >
      <div className="rv-livro">
        {erro && <p className="rv-cena-estado" data-tipo="erro" role="alert">{erro}</p>}

        {aberto ? (
          <>
            {/* VOLTAR É ESTADO. Na rota isto era um `<Link>` pro sumário,
                que remontava a página inteira; aqui é soltar o capítulo. */}
            <button type="button" className="rv-livro-voltar" onClick={() => setAberto(null)}>
              <ArrowLeft size={13} aria-hidden="true" /> Sumário
            </button>

            <article className="rv-livro-texto" data-testid="livro-capitulo">
              <h3 className="rv-livro-titulo">{aberto.nome}</h3>
              {aberto.descricaoCurta && <p className="rv-livro-resumo">{aberto.descricaoCurta}</p>}
              {aberto.corpo && <p>{aberto.corpo}</p>}

              {aberto.blocos.map((bloco) =>
                bloco.tipo === "texto" ? (
                  <p key={bloco.id}>{bloco.texto}</p>
                ) : bloco.entidade?.tipo_conteudo === "capitulo" ? (
                  // Bloco que aponta pra outro capítulo continua sendo um
                  // salto — só que dentro da janela.
                  <button
                    key={bloco.id}
                    type="button"
                    className="rv-livro-salto"
                    data-testid={`livro-bloco-entidade-${bloco.id}`}
                    onClick={() => void abrirCapitulo(bloco.entidade!.slug)}
                  >
                    → Ver capítulo: {aberto.nomesPorSlug[bloco.entidade.slug] ?? bloco.entidade.slug}
                  </button>
                ) : (
                  <div key={bloco.id} className="rv-livro-entidade" data-testid={`livro-bloco-entidade-${bloco.id}`}>
                    {TIPO_CONTEUDO_LABEL[bloco.entidade?.tipo_conteudo ?? ""] ?? bloco.entidade?.tipo_conteudo}: {bloco.entidade?.slug}
                  </div>
                ),
              )}
            </article>

            <nav className="rv-livro-paginacao">
              {aberto.anterior ? (
                <button type="button" className="rv-btn rv-btn--ghost" onClick={() => void abrirCapitulo(aberto.anterior!.slug)}>
                  <ChevronLeft size={13} aria-hidden="true" /> {aberto.anterior.nome}
                </button>
              ) : <span />}
              {aberto.proximo ? (
                <button type="button" className="rv-btn rv-btn--ghost" onClick={() => void abrirCapitulo(aberto.proximo!.slug)}>
                  {aberto.proximo.nome} <ChevronRight size={13} aria-hidden="true" />
                </button>
              ) : <span />}
            </nav>
          </>
        ) : (
          <>
            <span className="rv-cena-busca-casca">
              <Search size={14} aria-hidden="true" />
              <input
                className="rv-cena-campo rv-cena-busca"
                type="search"
                value={busca}
                placeholder="Buscar capítulo…"
                aria-label="Buscar capítulo pelo nome, resumo ou marcador"
                data-testid="livro-busca"
                onChange={(e) => setBusca(e.target.value)}
              />
            </span>

            {capitulos === null && !erro && (
              <p className="rv-cena-estado"><Loader2 size={14} className="rv-girando" aria-hidden="true" /> Carregando o Livro…</p>
            )}
            {capitulos !== null && filtrados.length === 0 && (
              <p className="rv-cena-estado" data-testid="livro-vazio">
                {termo ? `Nada encontrado para “${busca.trim()}”.` : "Nenhum capítulo publicado ainda."}
              </p>
            )}

            <ul className="rv-livro-sumario">
              {filtrados.map((c) => (
                <li key={c.slug}>
                  <button
                    type="button"
                    className="rv-livro-item"
                    disabled={carregandoCapitulo}
                    data-testid="livro-capitulo-abrir"
                    onClick={() => void abrirCapitulo(c.slug)}
                  >
                    <span className="rv-livro-item-nome">{c.nome}</span>
                    {c.descricaoCurta && <span className="rv-livro-item-resumo">{c.descricaoCurta}</span>}
                    {c.tags.length > 0 && (
                      <span className="rv-livro-tags">
                        {c.tags.map((t) => <span key={t} className="rv-livro-tag">{t}</span>)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </JanelaInterna>
  );
}
