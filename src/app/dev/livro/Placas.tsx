"use client";

/**
 * AS PÁGINAS COMPOSTAS À MÃO — capa, folha de rosto, sumário, abertura
 * de capítulo, índice remissivo e a página que fecha um capítulo.
 * O texto corrido não passa por aqui (ver `compositor`).
 *
 * O motivo gráfico do livro é o CORTE: uma diagonal de ~5° (a mesma da
 * passarela da capa) que fatia a arte e os blocos de cor, sempre com um
 * fio ciano paralelo, deslocado — duas tintas fora de registro.
 */
import { Search } from "lucide-react";
import type { BlocoCompendio } from "../../../lib/compendio/tipos";
import type { DestinoLivro } from "../../mesas/[campaignId]/vtt/_compendio/modelo";
import { MarcaRuptura } from "../../_design/Marca";
import { htmlSimples } from "./fluxoHtml";
import {
  ID_INTRODUCAO, nesteCapitulo, seloDoCaderno, separarAbertura, temDedeira, tituloDoCaderno, varianteAbertura,
  type Caderno, type ItemIndice,
} from "./modelo";
import { usePaginacao } from "./paginacao";

type Ir = (destino: DestinoLivro) => void;
type Capitulo = Extract<Caderno, { tipo: "capitulo" }>;

/** Número de página de um destino, como impresso. */
export function Pag({ id, ancora }: { id: string; ancora?: string }) {
  const n = usePaginacao().numeroDe(id, ancora);
  return <span className="lv-pag">{n ?? "···"}</span>;
}

/* ---- capa e folha de rosto ---------------------------------------- */

export function PlacaCapa({ arte }: { arte: string }) {
  return (
    <div className="lv-capa__face">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="lv-capa__arte" src={arte} alt="Vista panorâmica de Vosek" />
      <div className="lv-capa__veu" aria-hidden="true" />
      <div className="lv-capa__lombada" aria-hidden="true" />
      <div className="lv-capa__topo">COMPÊNDIO <i>·</i> V1.2</div>
      <div className="lv-capa__marca">
        <span className="lv-capa__frase">A ORDEM É UMA FACHADA</span>
        <MarcaRuptura como="span" className="lv-capa__logo" />
      </div>
      <div className="lv-capa__pe">
        <strong>VOSEK</strong>
        <span>CAPITAL DO IMPÉRIO CENTRAL</span>
        <div className="lv-capa__lema"><span>ACIMA, O CONTROLE.</span><span>ABAIXO, A FAGULHA.</span></div>
      </div>
    </div>
  );
}

export function PlacaRosto() {
  return (
    <div className="lv-rosto">
      <svg className="lv-tracos" viewBox="0 0 640 860" aria-hidden="true">
        <path d="M0 548 L640 488" className="lv-traco lv-traco--cy" />
        <path d="M0 562 L250 538.5" className="lv-traco lv-traco--am" />
      </svg>
      <div className="lv-rosto__topo">Compêndio <i>·</i> v1.2</div>
      <MarcaRuptura como="span" className="lv-rosto__logo" />
      <div className="lv-rosto__sub">Livro<br />de regras</div>
      <p className="lv-rosto__fecho">
        Você é um magista refratário.<br />Um erro fora dos planos do Império.
        <span aria-hidden="true">///</span>
      </p>
    </div>
  );
}

/* ---- sumário -------------------------------------------------------- */

export function PlacaSumario({ cadernos, ir }: { cadernos: Caderno[]; ir: Ir }) {
  const linhas: ({ secao: string } | { c: Caderno })[] = [];
  let secao = "";
  for (const c of cadernos) {
    if (c.tipo === "frente" || !temDedeira(c)) continue;
    if (c.tipo === "capitulo" && c.linha.secao && c.linha.secao !== secao) {
      secao = c.linha.secao;
      linhas.push({ secao });
    }
    linhas.push({ c });
  }
  return (
    <div className="lv-sumario">
      <h2 className="lv-sumario__titulo">Sumário</h2>
      <div className="lv-sumario__lista">
        {linhas.map((l, i) => "secao" in l ? (
          <div key={i} className="lv-sumario__secao">{l.secao}</div>
        ) : (
          <button key={i} type="button" className="lv-sumario__linha" onClick={() => ir({ pageId: l.c.id })}>
            <span className="lv-sumario__num">{seloDoCaderno(l.c)}</span>
            <span className="lv-sumario__nome">{tituloDoCaderno(l.c)}</span>
            <Pag id={l.c.id} />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---- abertura de capítulo ----------------------------------------- */

/** Número grande da abertura: o do capítulo ou, numa subpágina, o do capítulo onde ela está. */
function numeralDe(c: Capitulo): string {
  const n = c.linha.numero ?? c.pai?.numero;
  if (c.id === ID_INTRODUCAO) return "00";
  if (/patch/i.test(c.linha.secao)) return seloDoCaderno(c);
  return n != null ? String(n).padStart(2, "0") : seloDoCaderno(c);
}

function Kicker({ c }: { c: Capitulo }) {
  const rotulo = c.id === ID_INTRODUCAO ? "Compêndio" : c.pai ? c.pai.titulo : c.linha.secao;
  return (
    <div className="lv-ab__kicker">
      <b>{c.pai ? "Seção" : "Capítulo"} {numeralDe(c)}</b>
      <span>{rotulo}</span>
    </div>
  );
}

/**
 * O título ocupa a largura que tem: o corpo da letra sai da palavra mais
 * comprida (a Teko em caixa-alta mede perto de meio corpo por letra).
 */
function Titulo({ c, largura, teto }: { c: Capitulo; largura: number; teto: number }) {
  if (c.id === ID_INTRODUCAO) return <h1 className="lv-ab__h1 lv-ab__h1--frase">Neste mundo, o arcano <em>não é lenda.</em></h1>;
  const t = c.linha.titulo;
  const maior = Math.max(...t.split(/\s+/).map((p) => p.length));
  const corpo = Math.max(54, Math.min(teto, Math.floor(largura / (maior * 0.5))));
  return <h1 className="lv-ab__h1" style={{ fontSize: corpo }}>{t}</h1>;
}

/** Epígrafe, lide e "neste capítulo": o texto que acompanha o título na abertura. */
function Apoio({ c, blocos, ir, max }: { c: Capitulo; blocos: BlocoCompendio[] | null; ir: Ir; max: number }) {
  if (!blocos) return null;
  const { epigrafe, lide } = separarAbertura(blocos, varianteAbertura(c.linha));
  const { entradas, resto } = nesteCapitulo(blocos, max);
  return (
    <>
      {epigrafe && (
        <blockquote className="lv-ab__epigrafe">
          <span dangerouslySetInnerHTML={{ __html: htmlSimples(epigrafe.texto) }} />
          {epigrafe.filhos.map((f, i) => f.tipo === "paragrafo" ? <cite key={i} dangerouslySetInnerHTML={{ __html: htmlSimples(f.texto) }} /> : null)}
        </blockquote>
      )}
      {lide && <p className="lv-ab__lide" dangerouslySetInnerHTML={{ __html: htmlSimples(lide) }} />}
      {entradas.length > 0 && (
        <nav className="lv-neste">
          <div className="lv-neste__rotulo">Neste capítulo</div>
          {entradas.map((e) => (
            <button key={e.ancora} type="button" className="lv-neste__linha" onClick={() => ir({ pageId: c.id, ancora: e.ancora })}>
              <span className="lv-neste__nome">{e.texto}</span>
              <Pag id={c.id} ancora={e.ancora} />
            </button>
          ))}
          {resto > 0 && <div className="lv-neste__resto">e mais {resto}</div>}
        </nav>
      )}
    </>
  );
}

export function PlacaAbertura({ c, lado, blocos, ir }: { c: Capitulo; lado: "esq" | "dir"; blocos: BlocoCompendio[] | null; ir: Ir }) {
  const variante = varianteAbertura(c.linha);
  const posicao = c.linha.capa?.posicao;
  const arte = c.linha.capa && (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="lv-ab__arte" src={c.linha.capa.url} alt="" style={posicao ? { objectPosition: posicao } : undefined} />
  );

  if (variante === "faixa") {
    return (
      <div className={`lv-ab lv-ab--faixa lv-ab--${lado}`}>
        <div className="lv-ab__recorte">{arte}<div className="lv-ab__veu" aria-hidden="true" /></div>
        <svg className="lv-tracos" viewBox="0 0 640 860" aria-hidden="true">
          {lado === "esq"
            ? <><path d="M0 532 L640 472" className="lv-traco lv-traco--cy" /><path d="M0 546 L210 526.3" className="lv-traco lv-traco--am" /></>
            : <><path d="M0 472 L640 412" className="lv-traco lv-traco--cy" /><path d="M470 441.9 L640 426" className="lv-traco lv-traco--am" /></>}
        </svg>
        {lado === "esq" ? (
          <div className="lv-ab__titulo"><Kicker c={c} /><Titulo c={c} largura={544} teto={150} /></div>
        ) : (
          <div className="lv-ab__apoio lv-ab__apoio--duas"><Apoio c={c} blocos={blocos} ir={ir} max={5} /></div>
        )}
      </div>
    );
  }

  if (variante === "coluna") {
    return (
      <div className={`lv-ab lv-ab--coluna lv-ab--${lado}`}>
        <div className="lv-ab__recorte">{arte}<div className="lv-ab__veu" aria-hidden="true" /></div>
        {lado === "dir" && (
          <>
            <svg className="lv-tracos" viewBox="0 0 640 860" aria-hidden="true">
              <path d="M212 0 L122 860" className="lv-traco lv-traco--cy" />
              <path d="M226 0 L199.8 250" className="lv-traco lv-traco--am" />
            </svg>
            <div className="lv-ab__lateral"><Kicker c={c} /><Titulo c={c} largura={328} teto={124} /><Apoio c={c} blocos={blocos} ir={ir} max={5} /></div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={`lv-ab lv-ab--cunha lv-ab--${lado}`}>
      <div className="lv-ab__cunha" aria-hidden="true" />
      <svg className="lv-tracos" viewBox="0 0 640 860" aria-hidden="true">
        {lado === "esq" ? <path d="M640 428 L444 860" className="lv-traco lv-traco--cy" /> : <path d="M194 0 L0 428" className="lv-traco lv-traco--cy" />}
      </svg>
      {lado === "esq" ? (
        <>
          <span className="lv-ab__secao">{c.pai ? c.pai.titulo : c.linha.secao}</span>
          <span className="lv-ab__numeral" aria-hidden="true">{numeralDe(c)}</span>
        </>
      ) : (
        <div className="lv-ab__lateral lv-ab__lateral--cunha"><Kicker c={c} /><Titulo c={c} largura={348} teto={124} /><Apoio c={c} blocos={blocos} ir={ir} max={7} /></div>
      )}
    </div>
  );
}

/* ---- fim de capítulo ---------------------------------------------- */

export function PlacaFim({ proximo, ir }: { proximo: Caderno | null; ir: Ir }) {
  return (
    <div className="lv-fim">
      <svg className="lv-tracos" viewBox="0 0 640 860" aria-hidden="true">
        <path d="M0 640 L640 580" className="lv-traco lv-traco--cy" />
      </svg>
      {proximo && (
        <button type="button" className="lv-fim__seguir" onClick={() => ir({ pageId: proximo.id })}>
          <span className="lv-fim__rotulo">A seguir</span>
          <span className="lv-fim__nome">{tituloDoCaderno(proximo)}</span>
          <span className="lv-fim__pag">p. <Pag id={proximo.id} /></span>
        </button>
      )}
      <span className="lv-fim__marca" aria-hidden="true">///</span>
    </div>
  );
}

/* ---- índice remissivo --------------------------------------------- */

export function PlacaIndice({ colunas, primeira, filtro, onFiltro, ir }: {
  colunas: ItemIndice[][] | undefined; primeira: boolean; filtro: string; onFiltro: (v: string) => void; ir: Ir;
}) {
  return (
    <div className={`lv-ind ${primeira ? "lv-ind--primeira" : ""}`}>
      {primeira && (
        <div className="lv-ind__cabeca">
          <h2 className="lv-ind__titulo">Índice</h2>
          <label className="lv-ind__busca">
            <Search aria-hidden="true" />
            <input type="search" value={filtro} onChange={(e) => onFiltro(e.target.value)} placeholder="Procurar verbete" data-testid="livro-busca" />
          </label>
        </div>
      )}
      {(colunas ?? [[]]).map((col, k) => (
        <div key={k} className="lv-ind__col">
          {col.map((item, i) => item.tipo === "letra" ? (
            <div key={i} className="lv-ind__letra">{item.letra}</div>
          ) : (
            <button key={i} type="button" className="lv-ind__linha" onClick={() => ir({ pageId: item.e.pageId, ancora: item.e.ancora })}>
              <span className="lv-ind__nome">{item.e.titulo}</span>
              <span className="lv-ind__origem">{item.e.origem}</span>
              <Pag id={item.e.pageId} ancora={item.e.ancora} />
            </button>
          ))}
        </div>
      ))}
      {primeira && filtro.trim() && (colunas?.[0]?.length ?? 0) === 0 && <p className="lv-ind__nada">Nenhum verbete com “{filtro.trim()}”.</p>}
    </div>
  );
}
