"use client";

/**
 * NOVA CENA — uma folha só, com ou sem mapa.
 *
 * Antes eram dois destinos diferentes para o mesmo gesto: "do zero"
 * caía numa linha com um campo de nome e pronto (a cena nascia 26×18
 * sem ninguém ter dito que queria 26×18), e "de um mapa" caía numa
 * folha com tudo. Quem começava do zero só descobria o tamanho depois,
 * abrindo os parâmetros da cena que acabou de criar — e a pergunta
 * "quantas células?" é justamente a que se responde ANTES, não depois.
 *
 * Agora o mapa é um CAMPO desta folha, não uma porta separada. Dá pra
 * anexar um mapa numa cena que começou do zero e tirar o mapa de uma
 * que começou dele, sem cancelar e recomeçar pela outra porta. O menu
 * continua com duas entradas porque as duas intenções existem — uma
 * delas só abre o seletor de arquivo antes de chegar aqui.
 *
 * COM MAPA O TAMANHO É DERIVADO, e é isso que evita a queixa mais comum
 * de VTT: o mapa desalinhado da grade. O mapa manda — dos pixels dele e
 * do divisor sai o tamanho da cena, e a imagem entra como fundo
 * cobrindo exatamente essa extensão. SEM MAPA o tamanho é digitado, em
 * células ou em pixels, como nos parâmetros.
 *
 * O preview é o blob que subiria (um `object URL` da imagem já
 * reduzida), então cancelar não deixa resíduo nenhum: nenhuma cena,
 * nenhuma reserva de quota, nada no Storage.
 */

import { useEffect, useState } from "react";
import { Image as IconeImagem, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import type { ImagemPreparada } from "../../../../../lib/vtt/imagePreparation";
import { CampoNumero, formatarNumero } from "./CampoNumero";

export interface ValoresNovaCena {
  nome: string;
  local: string | null;
  resumo: string | null;
  celulaPx: number;
  largura: number;
  altura: number;
  gradeCor: string;
  gradeOpacidade: number;
}

export interface MapaPendente {
  preparada: ImagemPreparada;
  /** Nome sugerido — o do arquivo, sem extensão. */
  nome: string;
}

export interface PropsNovaCena {
  /** O mapa anexado, ou `null` numa cena do zero. */
  mapa: MapaPendente | null;
  ocupado: boolean;
  erro: string | null;
  /** Abre o seletor de arquivo — quem o guarda é o gerenciador. */
  onEscolherMapa: () => void;
  onRemoverMapa: () => void;
  onCriar: (v: ValoresNovaCena) => void;
  onCancelar: () => void;
}

/** Os limites do banco (0065): `check (largura between 1 and 200)`. */
const MIN = 1;
const MAX = 200;
/** Idem (0123): `check (celula_px between 8 and 512)`. */
const CELULA_MIN = 8;
const CELULA_MAX = 512;
/** Os mesmos de `create_vtt_scene` (0111) — o tamanho que a cena teria calada. */
const LARGURA_PADRAO = 26;
const ALTURA_PADRAO = 18;
const CELULA_PADRAO = 70;
/** Os mesmos de `vtt_scenes` (0122) — o que a cena teria sem esta folha. */
const GRADE_COR_PADRAO = "#96bed7";
const GRADE_OPACIDADE_PADRAO = 0.07;
/** Os mesmos de sempre nos mapas prontos — atalho, não regra. */
const ATALHOS_PX = [50, 70, 100, 140];

/** Quantas células cabem em `px` com esse divisor, dentro do teto do banco. */
function celulas(px: number, divisor: number): number {
  if (divisor <= 0) return MIN;
  return Math.max(MIN, Math.min(MAX, Math.round(px / divisor)));
}

export function NovaCena(p: PropsNovaCena) {
  const [nome, setNome] = useState("");
  const [local, setLocal] = useState("");
  const [resumo, setResumo] = useState("");
  const [celulaPx, setCelulaPx] = useState(CELULA_PADRAO);
  /** Só valem sem mapa: com mapa, o tamanho é derivado dos pixels. */
  const [largura, setLargura] = useState(LARGURA_PADRAO);
  const [altura, setAltura] = useState(ALTURA_PADRAO);
  const [gradeCor, setGradeCor] = useState(GRADE_COR_PADRAO);
  const [gradeOpacidade, setGradeOpacidade] = useState(GRADE_OPACIDADE_PADRAO);

  /**
   * O nome do arquivo é SUGESTÃO, não imposição: anexar um mapa depois
   * de já ter digitado um nome não pode apagar o que foi digitado.
   */
  useEffect(() => {
    if (p.mapa) setNome((atual) => (atual.trim().length === 0 ? p.mapa!.nome : atual));
  }, [p.mapa]);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape" && !p.ocupado) { e.preventDefault(); p.onCancelar(); }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [p]);

  const comMapa = p.mapa !== null;
  const larguraFinal = comMapa ? celulas(p.mapa!.preparada.widthPx, celulaPx) : largura;
  const alturaFinal = comMapa ? celulas(p.mapa!.preparada.heightPx, celulaPx) : altura;

  /* O resto da divisão é a informação que decide o divisor: 2000 px com
     células de 70 sobra 40 px, e é esse sobrando que vira a faixa de
     mapa cortada na borda. Dizer quanto sobra é o que permite escolher
     outro número com conhecimento de causa. */
  const sobraX = comMapa ? Math.abs(p.mapa!.preparada.widthPx - larguraFinal * celulaPx) : 0;
  const sobraY = comMapa ? Math.abs(p.mapa!.preparada.heightPx - alturaFinal * celulaPx) : 0;
  const encaixaCertinho = sobraX === 0 && sobraY === 0;

  /* Pixels → células, ARREDONDANDO: meia célula não existe na grade.
     Mesma conversão dos parâmetros, e pelo mesmo motivo — quem desenha
     do zero pensa em quadrados, quem tem arte pronta pensa em pixels. */
  const emCelulas = (px: number) => celulas(px, celulaPx);

  return (
    <section className="rv-gav-folha" aria-label="Nova cena" data-testid="cena-nova-folha">
      <header className="rv-gav-folha-cab">
        <IconeImagem size={15} aria-hidden="true" />
        <h3 className="rv-gav-folha-titulo">Nova cena</h3>
        <button
          type="button" className="rv-gav-fechar" onClick={p.onCancelar}
          disabled={p.ocupado} aria-label="Cancelar"
        >
          <X size={15} aria-hidden="true" />
          <span className="rv-dica rv-dica--abaixo">Cancelar</span>
        </button>
      </header>

      <div className="rv-gav-folha-corpo">
        {/* O MAPA VEM PRIMEIRO porque ele decide o resto: com ele, o
            tamanho da cena deixa de ser digitado e passa a ser
            calculado. Um campo que muda o significado dos de baixo tem
            que aparecer antes deles. */}
        <p className="rv-gav-folha-secao">Mapa</p>
        {p.mapa ? (
          <>
            <div className="rv-gav-mapa-previa">
              <img src={p.mapa.preparada.previewUrl} alt="" />
            </div>
            <p className="rv-gav-folha-nota rv-gav-mapa-linha">
              <span>{p.mapa.preparada.widthPx} × {p.mapa.preparada.heightPx} px</span>
              <button
                type="button" className="rv-btn rv-btn--ghost"
                data-testid="cena-nova-trocar-mapa"
                disabled={p.ocupado} onClick={p.onEscolherMapa}
              >Trocar</button>
              <button
                type="button" className="rv-btn rv-btn--ghost"
                data-testid="cena-nova-remover-mapa"
                disabled={p.ocupado} onClick={p.onRemoverMapa}
              ><Trash2 size={13} aria-hidden="true" /> Remover</button>
            </p>
          </>
        ) : (
          <button
            type="button" className="rv-gav-mapa-vazio"
            data-testid="cena-nova-anexar-mapa"
            disabled={p.ocupado} onClick={p.onEscolherMapa}
          >
            <ImagePlus size={18} aria-hidden="true" />
            <strong>Escolher um mapa</strong>
            <em>Opcional. Com um mapa, o tamanho da cena vem dele.</em>
          </button>
        )}

        <label className="rv-fp-campo">
          <span className="rv-fp-rotulo">Nome</span>
          <input
            className="rv-cena-campo" value={nome} maxLength={120}
            placeholder="Pátio de carga"
            data-testid="cena-nova-nome"
            onChange={(e) => setNome(e.target.value)}
          />
        </label>

        <label className="rv-fp-campo">
          <span className="rv-fp-rotulo">Local</span>
          <input
            className="rv-cena-campo" value={local} maxLength={120}
            placeholder="Submundo de Vosek"
            data-testid="cena-nova-local"
            onChange={(e) => setLocal(e.target.value)}
          />
        </label>

        <label className="rv-fp-campo">
          <span className="rv-fp-rotulo">Resumo</span>
          <input
            className="rv-cena-campo" value={resumo} maxLength={200}
            placeholder="O que acontece aqui"
            data-testid="cena-nova-resumo"
            onChange={(e) => setResumo(e.target.value)}
          />
        </label>

        <p className="rv-gav-folha-secao">Tamanho da grade</p>

        {comMapa ? (
          <>
            <p className="rv-fp-rotulo">Quantos pixels tem um quadrado do mapa</p>
            <div className="rv-gav-eixo">
              <span className="rv-gav-medida">
                <CampoNumero
                  className="rv-cena-campo" min={CELULA_MIN} max={CELULA_MAX}
                  decimais={4}
                  valor={celulaPx}
                  data-testid="mapa-celula-px"
                  aria-label="Pixels por célula"
                  onConfirmar={setCelulaPx}
                />
                <em>px</em>
              </span>
              <span className="rv-gav-atalhos">
                {ATALHOS_PX.map((n) => (
                  <button
                    key={n} type="button" className="rv-gav-atalho"
                    aria-pressed={celulaPx === n}
                    onClick={() => setCelulaPx(n)}
                  >{n}</button>
                ))}
              </span>
            </div>

            <p className="rv-gav-conta" data-encaixa={encaixaCertinho || undefined} data-testid="mapa-conta">
              <span>
                A cena nasce com <strong>{larguraFinal} × {alturaFinal}</strong> células
                {encaixaCertinho
                  ? " — o mapa encaixa exato"
                  : ` — sobram ${sobraX} px na largura e ${sobraY} px na altura`}
              </span>
              {/* A sobra some dividindo o mapa pelas células que ele já
                  tem. O número resultante quase nunca é redondo, e é
                  por isso que é um botão e não uma instrução. */}
              {!encaixaCertinho && (
                <button
                  type="button" className="rv-btn rv-btn--ghost"
                  data-testid="mapa-encaixar"
                  onClick={() => setCelulaPx(
                    Math.round((p.mapa!.preparada.widthPx / larguraFinal) * 10000) / 10000,
                  )}
                >
                  Encaixar em {formatarNumero(p.mapa!.preparada.widthPx / larguraFinal, 4)} px por célula
                </button>
              )}
            </p>
          </>
        ) : (
          <>
            <div className="rv-gav-eixo">
              <span className="rv-fp-rotulo">Largura</span>
              <span className="rv-gav-medida">
                <CampoNumero
                  className="rv-cena-campo" min={MIN} max={MAX}
                  valor={largura}
                  data-testid="cena-nova-largura"
                  onConfirmar={setLargura}
                  aria-label="Largura em células"
                />
                <em>células</em>
              </span>
              <span className="rv-gav-sinal" aria-hidden="true">=</span>
              <span className="rv-gav-medida">
                <CampoNumero
                  className="rv-cena-campo" min={MIN * celulaPx} max={MAX * celulaPx}
                  valor={Math.round(largura * celulaPx)}
                  data-testid="cena-nova-largura-px"
                  onConfirmar={(px) => setLargura(emCelulas(px))}
                  aria-label="Largura em pixels"
                />
                <em>px</em>
              </span>
            </div>

            <div className="rv-gav-eixo">
              <span className="rv-fp-rotulo">Altura</span>
              <span className="rv-gav-medida">
                <CampoNumero
                  className="rv-cena-campo" min={MIN} max={MAX}
                  valor={altura}
                  data-testid="cena-nova-altura"
                  onConfirmar={setAltura}
                  aria-label="Altura em células"
                />
                <em>células</em>
              </span>
              <span className="rv-gav-sinal" aria-hidden="true">=</span>
              <span className="rv-gav-medida">
                <CampoNumero
                  className="rv-cena-campo" min={MIN * celulaPx} max={MAX * celulaPx}
                  valor={Math.round(altura * celulaPx)}
                  data-testid="cena-nova-altura-px"
                  onConfirmar={(px) => setAltura(emCelulas(px))}
                  aria-label="Altura em pixels"
                />
                <em>px</em>
              </span>
            </div>

            <p className="rv-gav-folha-nota">
              {largura} × {altura} células = {largura} × {altura} metros de terreno.
              Os pixels só servem para encaixar um mapa pronto.
            </p>
          </>
        )}

        <p className="rv-gav-folha-secao">Aparência da grade</p>
        {/* A prévia é a razão de este bloco existir aqui e não num
            menu: cor de linha não se escolhe por nome, se escolhe
            olhando. O quadriculado atrás mostra a linha sobre claro E
            sobre escuro, que é onde 7% e 50% se comportam diferente. */}
        <div className="rv-gav-grade-previa" style={{
          "--previa-cor": gradeCor,
          "--previa-op": gradeOpacidade,
        } as React.CSSProperties} aria-hidden="true" />

        <div className="rv-gav-folha-par">
          <label className="rv-fp-campo">
            <span className="rv-fp-rotulo">Cor da linha</span>
            <span className="rv-gav-cor">
              <input
                type="color" value={gradeCor}
                data-testid="cena-nova-grade-cor"
                onChange={(e) => setGradeCor(e.target.value)}
              />
              <em>{gradeCor}</em>
            </span>
          </label>
          <label className="rv-fp-campo">
            <span className="rv-fp-rotulo">Opacidade</span>
            <span className="rv-gav-medida">
              <input
                type="range" min={0} max={100} step={1}
                className="rv-gav-faixa"
                value={Math.round(gradeOpacidade * 100)}
                data-testid="cena-nova-grade-opacidade"
                onChange={(e) => setGradeOpacidade(Number(e.target.value) / 100)}
              />
              <em>{Math.round(gradeOpacidade * 100)}%</em>
            </span>
          </label>
        </div>
        {/* Zero não é "grade desligada": a geometria continua lá, e é
            por isso que esconder a linha nunca quebra o alcance. */}
        {gradeOpacidade === 0 && (
          <p className="rv-gav-folha-nota">Linha invisível — os hexágonos continuam valendo</p>
        )}

        {p.erro && <p className="rv-cena-estado" data-tipo="erro" role="alert">{p.erro}</p>}
      </div>

      <footer className="rv-gav-folha-pe">
        <button type="button" className="rv-btn rv-btn--ghost" disabled={p.ocupado} onClick={p.onCancelar}>
          Cancelar
        </button>
        <button
          type="button" className="rv-btn rv-btn--pri"
          data-testid="cena-nova-confirmar"
          disabled={p.ocupado || nome.trim().length === 0}
          onClick={() => p.onCriar({
            nome: nome.trim(),
            local: local.trim() || null,
            resumo: resumo.trim() || null,
            celulaPx,
            largura: larguraFinal,
            altura: alturaFinal,
            gradeCor,
            gradeOpacidade,
          })}
        >
          {p.ocupado ? <Loader2 size={13} className="rv-girando" aria-hidden="true" /> : null}
          {p.ocupado ? "Criando…" : "Criar cena"}
        </button>
      </footer>
    </section>
  );
}
