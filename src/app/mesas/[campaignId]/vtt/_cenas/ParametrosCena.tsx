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

export interface ValoresParametros {
  nome: string;
  local: string | null;
  resumo: string | null;
  largura: number;
  altura: number;
}

export interface PropsParametrosCena {
  cena: DadosCartaoCena;
  ocupada: boolean;
  erro: string | null;
  onSalvar: (v: ValoresParametros) => void;
  onFechar: () => void;
}

/** Os limites são os do banco (0065): `check (largura between 1 and 200)`. */
const MIN = 1;
const MAX = 200;

export function ParametrosCena(p: PropsParametrosCena) {
  const [v, setV] = useState<ValoresParametros>({
    nome: p.cena.nome,
    local: p.cena.local,
    resumo: p.cena.resumo,
    largura: p.cena.largura,
    altura: p.cena.altura,
  });

  // Trocar de cena com a folha aberta recarrega os campos. Sem isto, a
  // engrenagem de outro ladrilho mostraria os valores do anterior.
  useEffect(() => {
    setV({
      nome: p.cena.nome, local: p.cena.local, resumo: p.cena.resumo,
      largura: p.cena.largura, altura: p.cena.altura,
    });
  }, [p.cena.id, p.cena.nome, p.cena.local, p.cena.resumo, p.cena.largura, p.cena.altura]);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); p.onFechar(); }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [p]);

  const mudou =
    v.nome !== p.cena.nome || v.local !== p.cena.local || v.resumo !== p.cena.resumo
    || v.largura !== p.cena.largura || v.altura !== p.cena.altura;
  const nomeValido = v.nome.trim().length > 0;

  /** Célula fora da faixa é recusada pelo banco: a tela prende antes. */
  const numero = (bruto: string) => {
    const n = Number.parseInt(bruto, 10);
    if (Number.isNaN(n)) return MIN;
    return Math.max(MIN, Math.min(MAX, n));
  };

  return (
    <section className="rv-gav-folha" aria-label={`Parâmetros de ${p.cena.nome}`} data-testid="cena-parametros">
      <header className="rv-gav-folha-cab">
        <SlidersHorizontal size={15} aria-hidden="true" />
        <h3 className="rv-gav-folha-titulo">Parâmetros da cena</h3>
        <button
          type="button" className="rv-gav-fechar" onClick={p.onFechar}
          aria-label="Fechar os parâmetros"
        ><X size={15} aria-hidden="true" /></button>
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
        <div className="rv-gav-folha-par">
          <label className="rv-fp-campo">
            <span className="rv-fp-rotulo">Largura</span>
            <span className="rv-gav-medida">
              <input
                className="rv-cena-campo" type="number" min={MIN} max={MAX}
                value={v.largura}
                data-testid="parametros-largura"
                onChange={(e) => setV((a) => ({ ...a, largura: numero(e.target.value) }))}
              />
              <em>células</em>
            </span>
          </label>
          <label className="rv-fp-campo">
            <span className="rv-fp-rotulo">Altura</span>
            <span className="rv-gav-medida">
              <input
                className="rv-cena-campo" type="number" min={MIN} max={MAX}
                value={v.altura}
                data-testid="parametros-altura"
                onChange={(e) => setV((a) => ({ ...a, altura: numero(e.target.value) }))}
              />
              <em>células</em>
            </span>
          </label>
        </div>
        {/* A conversão é a mesma do mapa: 1 célula = 1 metro. Dito aqui
            porque quem pensa em "quantos quadrados" precisa saber o que
            isso vira em distância de regra. */}
        <p className="rv-gav-folha-nota">
          {v.largura} × {v.altura} células — {v.largura} × {v.altura} metros de terreno
        </p>

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
