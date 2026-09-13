"use client";

/**
 * NOVA CENA A PARTIR DE UM MAPA.
 *
 * O caminho normal — criar a cena vazia e depois colar o mapa dentro —
 * pede que a pessoa acerte DUAS coisas separadas: o tamanho da grade e
 * o tamanho da imagem. Elas quase nunca batem de primeira, e o
 * resultado é a queixa mais comum de VTT: o mapa desalinhado da grade.
 *
 * Aqui a conta é feita uma vez e no sentido certo. O mapa manda: dos
 * pixels dele e do divisor (px por célula) sai o tamanho da cena, e a
 * imagem entra como fundo cobrindo exatamente essa extensão. Se a
 * planta tem quadrados de 70px, escolher 70 aqui faz um quadrado da
 * arte valer uma célula da regra — que é a única coisa que "alinhar"
 * quer dizer.
 *
 * O preview é o blob que subiria (um `object URL` da imagem já
 * reduzida), então cancelar não deixa resíduo nenhum: nenhuma cena,
 * nenhuma reserva de quota, nada no Storage.
 */

import { useEffect, useState } from "react";
import { Loader2, Map as IconeMapa, X } from "lucide-react";
import type { ImagemPreparada } from "../../../../../lib/vtt/imagePreparation";
import { CampoNumero, formatarNumero } from "./CampoNumero";

export interface ValoresNovaCenaDeMapa {
  nome: string;
  celulaPx: number;
  largura: number;
  altura: number;
}

export interface PropsNovaCenaDeMapa {
  preparada: ImagemPreparada;
  /** Nome sugerido — o do arquivo, sem extensão. */
  nomeSugerido: string;
  ocupado: boolean;
  erro: string | null;
  onCriar: (v: ValoresNovaCenaDeMapa) => void;
  onCancelar: () => void;
}

const CELULA_MIN = 8;
const CELULA_MAX = 512;
const CELULAS_MAX = 200;
/** Os mesmos de sempre nos mapas prontos — atalho, não regra. */
const ATALHOS_PX = [50, 70, 100, 140];

/** Quantas células cabem em `px` com esse divisor, dentro do teto do banco. */
function celulas(px: number, divisor: number): number {
  if (divisor <= 0) return 1;
  return Math.max(1, Math.min(CELULAS_MAX, Math.round(px / divisor)));
}

export function NovaCenaDeMapa(p: PropsNovaCenaDeMapa) {
  const [nome, setNome] = useState(p.nomeSugerido);
  const [celulaPx, setCelulaPx] = useState(70);

  useEffect(() => { setNome(p.nomeSugerido); }, [p.nomeSugerido]);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape" && !p.ocupado) { e.preventDefault(); p.onCancelar(); }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [p]);

  const largura = celulas(p.preparada.widthPx, celulaPx);
  const altura = celulas(p.preparada.heightPx, celulaPx);
  /* O resto da divisão é a informação que decide o divisor: 2000 px com
     células de 70 sobra 40 px, e é esse sobrando que vira a faixa de
     mapa cortada na borda. Dizer quanto sobra é o que permite escolher
     outro número com conhecimento de causa. */
  const sobraX = Math.abs(p.preparada.widthPx - largura * celulaPx);
  const sobraY = Math.abs(p.preparada.heightPx - altura * celulaPx);
  const encaixaCertinho = sobraX === 0 && sobraY === 0;

  return (
    <section className="rv-gav-folha" aria-label="Nova cena a partir de um mapa" data-testid="cena-de-mapa">
      <header className="rv-gav-folha-cab">
        <IconeMapa size={15} aria-hidden="true" />
        <h3 className="rv-gav-folha-titulo">Nova cena de um mapa</h3>
        <button
          type="button" className="rv-gav-fechar" onClick={p.onCancelar}
          disabled={p.ocupado} aria-label="Cancelar"
        >
          <X size={15} aria-hidden="true" />
          <span className="rv-dica rv-dica--abaixo">Cancelar</span>
        </button>
      </header>

      <div className="rv-gav-folha-corpo">
        <div className="rv-gav-mapa-previa">
          <img src={p.preparada.previewUrl} alt="" />
        </div>
        <p className="rv-gav-folha-nota">
          {p.preparada.widthPx} × {p.preparada.heightPx} px
        </p>

        <label className="rv-fp-campo">
          <span className="rv-fp-rotulo">Nome da cena</span>
          <input
            className="rv-cena-campo" value={nome} maxLength={120}
            data-testid="mapa-nome"
            onChange={(e) => setNome(e.target.value)}
          />
        </label>

        <p className="rv-gav-folha-secao">Quantos pixels tem um quadrado do mapa</p>
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
            A cena nasce com <strong>{largura} × {altura}</strong> células
            {encaixaCertinho
              ? " — o mapa encaixa exato"
              : ` — sobram ${sobraX} px na largura e ${sobraY} px na altura`}
          </span>
          {/* A sobra some dividindo o mapa pelas células que ele já tem.
              O número resultante quase nunca é redondo, e é por isso que
              é um botão e não uma instrução. */}
          {!encaixaCertinho && (
            <button
              type="button" className="rv-btn rv-btn--ghost"
              data-testid="mapa-encaixar"
              onClick={() => setCelulaPx(Math.round((p.preparada.widthPx / largura) * 10000) / 10000)}
            >
              Encaixar em {formatarNumero(p.preparada.widthPx / largura, 4)} px por célula
            </button>
          )}
        </p>

        {p.erro && <p className="rv-cena-estado" data-tipo="erro" role="alert">{p.erro}</p>}
      </div>

      <footer className="rv-gav-folha-pe">
        <button type="button" className="rv-btn rv-btn--ghost" disabled={p.ocupado} onClick={p.onCancelar}>
          Cancelar
        </button>
        <button
          type="button" className="rv-btn rv-btn--pri"
          data-testid="mapa-criar"
          disabled={p.ocupado || nome.trim().length === 0}
          onClick={() => p.onCriar({ nome: nome.trim(), celulaPx, largura, altura })}
        >
          {p.ocupado ? <Loader2 size={13} className="rv-girando" aria-hidden="true" /> : null}
          {p.ocupado ? "Criando…" : "Criar cena"}
        </button>
      </footer>
    </section>
  );
}
