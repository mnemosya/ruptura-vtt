"use client";

/**
 * OS PARÂMETROS DE UMA CENA — a folha que a engrenagem do ladrilho abre.
 *
 * Por que aqui e não só na janela "Configurações da Cena": aquela edita
 * a cena ABERTA, e é exatamente isso que atrapalha quem prepara. Ajustar
 * o tamanho da grade de três mapas seguidos custava abrir cada um deles
 * — o que move a tela, recarrega tokens e faz o narrador perder o lugar.
 * Daqui, qualquer cena do catálogo se ajusta sem sair de onde se está.
 *
 * Escreve pela MESMA RPC (`set_vtt_scene_config`), com a mesma revisão
 * otimista: duas portas para a mesma porta, nunca duas verdades.
 *
 * A largura e a altura são em CÉLULAS, que é a unidade do mapa — 1
 * célula = 1 metro. Mostrar pixels como o Roll20 faz seria mostrar uma
 * unidade que nada mais no VTT usa.
 */

import { useEffect, useState } from "react";
import { Loader2, SlidersHorizontal, X } from "lucide-react";
import type { CartaoCena as DadosCartaoCena } from "../../../../../lib/vtt/sceneStorage";
import { CampoCorGrade } from "./CampoCorGrade";
import { CampoNumero, formatarNumero } from "./CampoNumero";

export interface ValoresParametros {
  nome: string;
  local: string | null;
  resumo: string | null;
  largura: number;
  altura: number;
  gradeCor: string;
  gradeOpacidade: number;
  celulaPx: number;
}

export interface PropsParametrosCena {
  cena: DadosCartaoCena;
  ocupada: boolean;
  erro: string | null;
  /**
   * Quantas peças ficariam fora da grade com o tamanho em edição —
   * herdado da janela "Configurações da Cena", que era a única que
   * avisava antes de encolher.
   *
   * OPCIONAL de propósito: contar peças exige os tokens e objetos da
   * cena, e o cliente só tem os da cena ABERTA. Configurando outra do
   * catálogo não há o que contar, e o aviso simplesmente não aparece —
   * melhor calado que chutando zero como se fosse seguro.
   */
  foraDaGrade?: number;
  /** Avisa o tamanho enquanto se digita, pra quem conta o que fica de fora. Só faz sentido na cena aberta. */
  onMudarTamanho?: (largura: number, altura: number) => void;
  onSalvar: (v: ValoresParametros) => void;
  onFechar: () => void;
}

/** Os limites são os do banco (0065): `check (largura between 1 and 200)`. */
const MIN = 1;
const MAX = 200;
/** Idem (0123): `check (celula_px between 8 and 512)`. */
const CELULA_MIN = 8;
const CELULA_MAX = 512;

export function ParametrosCena(p: PropsParametrosCena) {
  /**
   * O último pedido em pixels que NÃO coube na grade.
   *
   * 2000 px em 29 células dá 68,9655 px por célula — um número que a
   * grade aceita, mas que ninguém vai digitar de cabeça. Então o aviso
   * não é só aviso: ele traz o botão que faz essa divisão. Guardar o
   * PEDIDO e as CÉLULAS é o que permite calcular o divisor exato
   * depois, sem refazer a conta pela metade.
   *
   * Some quando o pedido seguinte encaixa sozinho.
   */
  const [ajuste, setAjuste] = useState<{ pedido: number; celulas: number; virou: number } | null>(null);

  const [v, setV] = useState<ValoresParametros>({
    nome: p.cena.nome,
    local: p.cena.local,
    resumo: p.cena.resumo,
    largura: p.cena.largura,
    altura: p.cena.altura,
    gradeCor: p.cena.gradeCor,
    gradeOpacidade: p.cena.gradeOpacidade,
    celulaPx: p.cena.celulaPx,
  });

  // Trocar de cena com a folha aberta recarrega os campos. Sem isto, a
  // engrenagem de outro ladrilho mostraria os valores do anterior.
  useEffect(() => {
    setV({
      nome: p.cena.nome, local: p.cena.local, resumo: p.cena.resumo,
      largura: p.cena.largura, altura: p.cena.altura,
      gradeCor: p.cena.gradeCor, gradeOpacidade: p.cena.gradeOpacidade,
      celulaPx: p.cena.celulaPx,
    });
  }, [p.cena.id, p.cena.nome, p.cena.local, p.cena.resumo, p.cena.largura, p.cena.altura,
      p.cena.gradeCor, p.cena.gradeOpacidade, p.cena.celulaPx]);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); p.onFechar(); }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [p]);

  const mudou =
    v.nome !== p.cena.nome || v.local !== p.cena.local || v.resumo !== p.cena.resumo
    || v.largura !== p.cena.largura || v.altura !== p.cena.altura
    || v.gradeCor !== p.cena.gradeCor || v.gradeOpacidade !== p.cena.gradeOpacidade
    || v.celulaPx !== p.cena.celulaPx;
  const nomeValido = v.nome.trim().length > 0;

  /* Pixels → células, ARREDONDANDO: meia célula não existe na grade, e
     deixar o campo aceitar 31,74 (como o Roll20 deixa) só empurra o
     arredondamento para o próximo lugar, onde ninguém está olhando.
     Quem prende na faixa é o `CampoNumero`; aqui só a conversão. */
  const emCelulas = (px: number, porCelula: number) => {
    if (porCelula <= 0) return MIN;
    return Math.max(MIN, Math.min(MAX, Math.round(px / porCelula)));
  };

  // A CONTAGEM segue o que está digitado. Efeito, e não chamada
  // dentro do `onConfirmar` de cada campo: são quatro campos que mexem
  // em largura/altura (células e pixels, dois eixos), e avisar em cada
  // um deles é a mesma linha repetida quatro vezes.
  const avisarTamanho = p.onMudarTamanho;
  useEffect(() => {
    avisarTamanho?.(v.largura, v.altura);
  }, [avisarTamanho, v.largura, v.altura]);

  return (
    <section className="rv-gav-folha" aria-label={`Parâmetros de ${p.cena.nome}`} data-testid="cena-parametros">
      <header className="rv-gav-folha-cab">
        <SlidersHorizontal size={15} aria-hidden="true" />
        <h3 className="rv-gav-folha-titulo">Parâmetros da cena</h3>
        <button
          type="button" className="rv-gav-fechar" onClick={p.onFechar}
          aria-label="Fechar os parâmetros"
        >
          <X size={15} aria-hidden="true" />
          <span className="rv-dica rv-dica--abaixo">Fechar</span>
        </button>
      </header>

      <div className="rv-gav-folha-corpo">
        <label className="rv-fp-campo">
          <span className="rv-fp-rotulo">Nome</span>
          <input
            className="rv-cena-campo" value={v.nome} maxLength={120}
            data-testid="parametros-nome"
            onChange={(e) => setV((a) => ({ ...a, nome: e.target.value }))}
          />
        </label>

        <label className="rv-fp-campo">
          <span className="rv-fp-rotulo">Local</span>
          <input
            className="rv-cena-campo" value={v.local ?? ""} maxLength={120}
            placeholder="Pátio de carga"
            data-testid="parametros-local"
            onChange={(e) => setV((a) => ({ ...a, local: e.target.value || null }))}
          />
        </label>

        <label className="rv-fp-campo">
          <span className="rv-fp-rotulo">Resumo</span>
          <input
            className="rv-cena-campo" value={v.resumo ?? ""} maxLength={200}
            placeholder="Submundo de Vosek"
            data-testid="parametros-resumo"
            onChange={(e) => setV((a) => ({ ...a, resumo: e.target.value || null }))}
          />
        </label>

        <p className="rv-gav-folha-secao">Tamanho da grade</p>
        {/* CÉLULAS e PIXELS são a mesma medida em duas linguagens, e as
            duas precisam ser escrevíveis: quem desenha a cena do zero
            pensa em quadrados; quem tem um mapa pronto tem 2000 px e
            um divisor. Editar um lado recalcula o outro na hora — sem
            "aplicar", que só existiria pra dar chance de errar. */}
        <div className="rv-gav-eixo">
          <span className="rv-fp-rotulo">Largura</span>
          <span className="rv-gav-medida">
            <CampoNumero
              className="rv-cena-campo" min={MIN} max={MAX}
              valor={v.largura}
              data-testid="parametros-largura"
              onConfirmar={(n) => setV((a) => ({ ...a, largura: n }))}
              aria-label="Largura em células"
            />
            <em>células</em>
          </span>
          <span className="rv-gav-sinal" aria-hidden="true">=</span>
          <span className="rv-gav-medida">
            <CampoNumero
              className="rv-cena-campo" min={MIN * v.celulaPx} max={MAX * v.celulaPx}
              valor={Math.round(v.largura * v.celulaPx)}
              data-testid="parametros-largura-px"
              onConfirmar={(px) => setV((a) => {
                const celulas = emCelulas(px, a.celulaPx);
                const virou = Math.round(celulas * a.celulaPx);
                setAjuste(virou === px ? null : { pedido: px, celulas, virou });
                return { ...a, largura: celulas };
              })}
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
              valor={v.altura}
              data-testid="parametros-altura"
              onConfirmar={(n) => setV((a) => ({ ...a, altura: n }))}
              aria-label="Altura em células"
            />
            <em>células</em>
          </span>
          <span className="rv-gav-sinal" aria-hidden="true">=</span>
          <span className="rv-gav-medida">
            <CampoNumero
              className="rv-cena-campo" min={MIN * v.celulaPx} max={MAX * v.celulaPx}
              valor={Math.round(v.altura * v.celulaPx)}
              data-testid="parametros-altura-px"
              onConfirmar={(px) => setV((a) => {
                const celulas = emCelulas(px, a.celulaPx);
                const virou = Math.round(celulas * a.celulaPx);
                setAjuste(virou === px ? null : { pedido: px, celulas, virou });
                return { ...a, altura: celulas };
              })}
              aria-label="Altura em pixels"
            />
            <em>px</em>
          </span>
        </div>

        <div className="rv-gav-eixo">
          <span className="rv-fp-rotulo">Célula</span>
          <span className="rv-gav-medida">
            <CampoNumero
              className="rv-cena-campo" min={CELULA_MIN} max={CELULA_MAX}
              decimais={4}
              valor={v.celulaPx}
              data-testid="parametros-celula-px"
              onConfirmar={(n) => { setAjuste(null); setV((a) => ({ ...a, celulaPx: n })); }}
              aria-label="Pixels por célula"
            />
            <em>px por célula</em>
          </span>
        </div>

        {/* O divisor é CONVERSÃO, não desenho — o mapa continua sendo
            desenhado em metros, e mexer aqui não move nada do que já
            está na cena. Vale dizer, porque o campo parece que mexe. */}
        {ajuste && (
          <p className="rv-gav-folha-ajuste" role="status" data-testid="parametros-ajuste">
            <span>
              {ajuste.pedido} px não fecha em células de {formatarNumero(v.celulaPx, 4)} —
              ficou {ajuste.virou}.
            </span>
            {/* O botão faz a única conta que resolve: manter as células
                e derivar o divisor exato. Não é atalho de digitação —
                68,9655 é um número que ninguém tira de cabeça. */}
            <button
              type="button" className="rv-btn rv-btn--ghost"
              data-testid="parametros-ajustar-celula"
              onClick={() => {
                const exato = Math.round((ajuste.pedido / ajuste.celulas) * 10000) / 10000;
                setAjuste(null);
                setV((a) => ({ ...a, celulaPx: Math.max(CELULA_MIN, Math.min(CELULA_MAX, exato)) }));
              }}
            >
              Ajustar a célula para {formatarNumero(ajuste.pedido / ajuste.celulas, 4)} px
            </button>
          </p>
        )}
        <p className="rv-gav-folha-nota">
          {v.largura} × {v.altura} células = {v.largura} × {v.altura} metros de terreno.
          Os pixels só servem para encaixar um mapa pronto.
        </p>
        {/* ENCOLHER NÃO APAGA. O aviso existe pra pessoa saber o que
            some de vista antes de salvar, não pra impedir — por isso é
            nota, não bloqueio do botão. */}
        {(p.foraDaGrade ?? 0) > 0 && (
          <p className="rv-cena-estado" data-tipo="erro" data-testid="cena-aviso-fora-da-grade">
            {p.foraDaGrade} {p.foraDaGrade === 1 ? "peça fica" : "peças ficam"} fora da grade com este
            tamanho. Nada é apagado — {p.foraDaGrade === 1 ? "ela volta" : "elas voltam"} a aparecer se
            você aumentar de novo.
          </p>
        )}

        <p className="rv-gav-folha-secao">Aparência da grade</p>
        {/* A prévia é a razão de este bloco existir aqui e não num
            menu: cor de linha não se escolhe por nome, se escolhe
            olhando. O quadriculado atrás mostra a linha sobre claro E
            sobre escuro, que é onde 7% e 50% se comportam diferente. */}
        <div className="rv-gav-grade-previa" style={{
          "--previa-cor": v.gradeCor,
          "--previa-op": v.gradeOpacidade,
        } as React.CSSProperties} aria-hidden="true" />

        {/* CADA UMA NA SUA LINHA. Lado a lado, as seis amostras
            dividiam meia largura com o campo hexadecimal e ficavam com
            12px cada — alvo pequeno demais para a única coisa que este
            controle faz, que é ser clicado. */}
        <label className="rv-fp-campo">
          <span className="rv-fp-rotulo">Cor da linha</span>
          <CampoCorGrade
            valor={v.gradeCor}
            testid="parametros-grade-cor"
            onMudar={(hex) => setV((a) => ({ ...a, gradeCor: hex }))}
          />
        </label>
        <label className="rv-fp-campo">
          <span className="rv-fp-rotulo">Opacidade</span>
          <span className="rv-gav-medida">
            <input
              type="range" min={0} max={100} step={1}
              className="rv-gav-faixa"
              // O trilho do WebKit precisa saber a posição pra pintar o
              // trecho percorrido — ver `.rv-gav-faixa` em `vtt.css`.
              style={{ ["--faixa-pct" as string]: Math.round(v.gradeOpacidade * 100) }}
              value={Math.round(v.gradeOpacidade * 100)}
              data-testid="parametros-grade-opacidade"
              onChange={(e) => setV((a) => ({ ...a, gradeOpacidade: Number(e.target.value) / 100 }))}
            />
            <em>{Math.round(v.gradeOpacidade * 100)}%</em>
          </span>
        </label>
        {/* Zero não é "grade desligada": a geometria continua lá, e é
            por isso que esconder a linha nunca quebra o alcance. */}
        {v.gradeOpacidade === 0 && (
          <p className="rv-gav-folha-nota">Linha invisível — os hexágonos continuam valendo</p>
        )}

        {p.erro && <p className="rv-cena-estado" data-tipo="erro" role="alert">{p.erro}</p>}
      </div>

      <footer className="rv-gav-folha-pe">
        <button type="button" className="rv-btn rv-btn--ghost" onClick={p.onFechar}>Cancelar</button>
        <button
          type="button" className="rv-btn rv-btn--pri"
          data-testid="parametros-salvar"
          disabled={!mudou || !nomeValido || p.ocupada}
          onClick={() => p.onSalvar({ ...v, nome: v.nome.trim() })}
        >
          {p.ocupada ? <Loader2 size={13} className="rv-girando" aria-hidden="true" /> : null}
          Salvar
        </button>
      </footer>
    </section>
  );
}
