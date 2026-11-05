"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Eye, EyeOff, Minus, Plus, Settings2, Undo2, X } from "lucide-react";
import {
  type CorArea, type TipoArea, CORES_AREA, HEX_COR_AREA,
  MAXIMO_LARGURA_M, META_AREA, MINIMO_DIMENSAO_M, TIPOS_AREA,
} from "../_dominio/areaEfeito";
import { type ConfigAreas, type EstadoAreas } from "../_ferramentas/areasEstado";
import { tipoTemDirecao } from "../_ferramentas/areasSnap";

interface PropsPainelAreas {
  config: ConfigAreas;
  onConfig: (patch: Partial<ConfigAreas>) => void;
  estado: EstadoAreas;
  onConcluirPontos: () => void;
  onDesfazerPonto: () => void;
  onDescartar: () => void;
  motivoNaoConclui: string | null;
  erro: string | null;
}

/* Os mesmos pictogramas da janela antiga, agora em uma faixa compacta. */
const ICONE_TIPO: Record<TipoArea, string> = {
  esfera: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M3 12a9 3.2 0 0 0 18 0",
  domo: "M3 17a9 9 0 0 1 18 0M2 17h20M6 17a6 2 0 0 0 12 0",
  aura: "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0M12 8.5l3 1.75v3.5L12 15.5l-3-1.75v-3.5z",
  linha: "M4 20L20 4",
  faixa: "M3 15.5L15.5 3M8.5 21L21 8.5",
  parede: "M3 9h18v6H3zM9 9v6M15 9v6",
  cubo: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12L4 7.5M12 12v9",
  cone: "M4 12L20 5M4 12l16 7M20 5q3 7 0 14",
  personalizada: "M5 8l6-5 9 5-3 11H7z",
};
const NOME_COR_AREA: Record<CorArea, string> = {
  vermelho: "Cinética", laranja: "Energética", ambar: "Material",
  verde: "Biótica", ciano: "Sináptica", roxo: "Cognitiva", branco: "Branco",
};

function IconeTipo({ tipo }: { tipo: TipoArea }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONE_TIPO[tipo]} />
    </svg>
  );
}

function OpcaoAvancada({ rotulo, detalhe, ligada, onClick, testId }: {
  rotulo: string; detalhe: string; ligada: boolean; onClick: () => void; testId: string;
}) {
  return (
    <button type="button" className="jf-tile jf-tile--chave rv-area-compacta__chave" role="checkbox"
      aria-checked={ligada} data-testid={testId} onClick={onClick}>
      <span className="rv-area-compacta__chave-texto">
        <strong>{rotulo}</strong>
        <small>{detalhe}</small>
      </span>
      <span className="jf-ponto" aria-hidden="true" />
    </button>
  );
}

function CampoParametro({ rotulo, valor, min, max, passo = 1, desabilitado = false, testId, onValor }: {
  rotulo: string; valor: number; min: number; max: number; passo?: number; desabilitado?: boolean;
  testId: string; onValor: (valor: number) => void;
}) {
  const [texto, setTexto] = useState(String(valor));
  useEffect(() => setTexto(String(valor)), [valor]);
  const mudarPorPasso = (direcao: -1 | 1) => {
    const proximo = Math.min(max, Math.max(min, Number((valor + direcao * passo).toFixed(2))));
    onValor(proximo);
  };
  return (
    <div className="jf-ajuste rv-area-compacta__ajuste">
      <span className="jf-l">{rotulo}</span>
      <span className="jf-ajuste-ctl">
        <button type="button" aria-label={`Diminuir ${rotulo.toLowerCase()}`} disabled={desabilitado || valor <= min}
          onClick={() => mudarPorPasso(-1)}><Minus size={14} /></button>
        <input className="jf-ajuste-v rv-area-compacta__valor" type="text" inputMode="decimal"
          value={texto} data-testid={testId} disabled={desabilitado}
          aria-label={`${rotulo} em metros`}
          onChange={(e) => {
            const novoTexto = e.target.value;
            setTexto(novoTexto);
            if (!novoTexto.trim()) return;
            const numero = Number(novoTexto.replace(",", "."));
            if (Number.isFinite(numero)) onValor(Math.min(max, Math.max(min, numero)));
          }}
          onBlur={() => setTexto(String(valor))} />
        <small>m</small>
        <button type="button" aria-label={`Aumentar ${rotulo.toLowerCase()}`} disabled={desabilitado || valor >= max}
          onClick={() => mudarPorPasso(1)}><Plus size={14} /></button>
      </span>
    </div>
  );
}

export function PainelAreas({ config, onConfig, estado, onConcluirPontos, onDesfazerPonto, onDescartar, motivoNaoConclui, erro }: PropsPainelAreas) {
  const [configAberta, setConfigAberta] = useState(false);
  const raizRef = useRef<HTMLElement>(null);
  const emPontos = estado.fase === "pontos";
  const formatoBloqueado = estado.fase === "concluida_local" || estado.fase === "editando"
    || estado.fase === "persistindo" || estado.fase === "erro";
  const parametrosBloqueados = estado.fase === "persistindo" || estado.fase === "erro";

  useEffect(() => {
    if (!configAberta) return;
    const fora = (e: PointerEvent) => {
      if (!raizRef.current?.contains(e.target as Node)) setConfigAberta(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [configAberta]);

  const trocarTipo = (tipo: TipoArea) => {
    if (tipo === config.tipo) return;
    if (estado.fase !== "ociosa") onDescartar();
    onConfig({ tipo });
    setConfigAberta(false);
  };

  return (
    <section ref={raizRef} className="rv-area-compacta" aria-label="Ferramenta Áreas"
      data-testid="painel-areas" data-fase={estado.fase}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape" && configAberta) {
          e.preventDefault();
          e.stopPropagation();
          setConfigAberta(false);
        }
      }}>
      {configAberta && (
        <div className="rv-area-compacta__config" id="rv-area-config"
          role="group" aria-label="Configurações da área" data-testid="area-configuracoes">
          <div className="rv-area-compacta__config-cab">
            <strong>CONFIGURAÇÕES DA ÁREA</strong>
            <button type="button" className="jf-mini" aria-label="Fechar configurações" onClick={() => setConfigAberta(false)}><X size={15} /></button>
          </div>

          <div className="jf-grupo">
            <span className="jf-rot" id="rv-area-quem-ve">Quem vê</span>
            <div className="jf-tiles" role="group" aria-labelledby="rv-area-quem-ve">
              <button type="button" className="jf-tile" aria-pressed={!config.visivel} data-testid="area-campo-oculta"
                onClick={() => onConfig({ visivel: false })}><EyeOff size={15} /> Oculta</button>
              <button type="button" className="jf-tile" aria-pressed={config.visivel} data-testid="area-campo-visivel"
                onClick={() => onConfig({ visivel: true })}><Eye size={15} /> Pra mesa</button>
            </div>
          </div>

          <div className="jf-grupo">
            <span className="jf-rot">Aparência</span>
            <input type="text" className="jf-campo" maxLength={80} value={config.rotulo} data-testid="area-campo-rotulo"
              aria-label="Rótulo da área" placeholder="Rótulo (opcional)"
              onChange={(e) => onConfig({ rotulo: e.target.value })} />
            <div className="jf-linha rv-area-compacta__linha-cor">
              <span className="jf-l" id="rv-area-cor">Cor</span>
              <span className="jf-cores" role="group" aria-labelledby="rv-area-cor">
                {CORES_AREA.map((cor) => (
                  <button key={cor} type="button" className="jf-cor" data-testid={"area-cor-" + cor}
                    aria-label={NOME_COR_AREA[cor]} title={NOME_COR_AREA[cor]} aria-pressed={config.cor === cor}
                    style={{ ["--jf-k" as string]: HEX_COR_AREA[cor] }}
                    onClick={() => onConfig({ cor })}><span /></button>
                ))}
              </span>
            </div>
            <label className="jf-faixa" style={{
              ["--jf-p" as string]: `${((config.opacidade - 0.05) / 0.95) * 100}%`,
              ["--jf-acento" as string]: HEX_COR_AREA[config.cor],
            }}>
              <span className="jf-l">Opacidade</span>
              <input type="range" min={0.05} max={1} step={0.05} value={config.opacidade}
                data-testid="area-campo-opacidade" aria-label="Opacidade da área"
                onChange={(e) => onConfig({ opacidade: Number(e.target.value) })} />
              <b>{Math.round(config.opacidade * 100)}%</b>
            </label>
          </div>

          <div className="jf-grupo">
            <span className="jf-rot">Avançado</span>
            {config.tipo === "aura" ? (
              <p className="rv-area-compacta__nota">A Aura fica presa ao token escolhido no mapa.</p>
            ) : (
              <>
                <OpcaoAvancada rotulo="Centro da célula" detalhe="Fixa a origem no hexágono"
                  ligada={config.snapOrigemCelula} testId="area-campo-snap-celula"
                  onClick={() => onConfig({ snapOrigemCelula: !config.snapOrigemCelula })} />
                <OpcaoAvancada rotulo="Token mais próximo" detalhe="Prioridade sobre a célula"
                  ligada={config.snapOrigemToken} testId="area-campo-snap-token"
                  onClick={() => onConfig({ snapOrigemToken: !config.snapOrigemToken })} />
              </>
            )}
            {tipoTemDirecao(config.tipo) && (
              <OpcaoAvancada rotulo="Travar direção" detalhe="Passos de 15°"
                ligada={config.snapDirecao} testId="area-campo-snap"
                onClick={() => onConfig({ snapDirecao: !config.snapDirecao })} />
            )}
          </div>
        </div>
      )}

      <div className="rv-area-compacta__faixa">
        <div className="rv-area-compacta__formatos" role="group" aria-label="Formato da área">
          {TIPOS_AREA.map((tipo) => (
            <button key={tipo} type="button" className="rv-area-compacta__tipo"
              data-testid={"area-tipo-" + tipo} aria-pressed={config.tipo === tipo}
              aria-label={META_AREA[tipo].rotulo} title={META_AREA[tipo].instrucao}
              disabled={formatoBloqueado} onClick={() => trocarTipo(tipo)}>
              <IconeTipo tipo={tipo} />
              <span>{META_AREA[tipo].rotulo}</span>
            </button>
          ))}
        </div>
        <span className="rv-area-compacta__separador" aria-hidden="true" />
        <button type="button" className="rv-area-compacta__config-botao"
          aria-label="Configurações da área" aria-expanded={configAberta}
          aria-controls="rv-area-config" data-testid="area-abrir-configuracoes"
          onClick={() => setConfigAberta((v) => !v)}>
          <Settings2 size={19} />
        </button>
      </div>

      {config.tipo === "faixa" && (
        <div className="rv-area-compacta__parametros" data-testid="area-parametros" data-tipo="faixa"
          role="group" aria-label="Parâmetros de Faixa">
          <div className="rv-area-compacta__parametros-contexto">
            <IconeTipo tipo="faixa" />
            <span><strong>Faixa</strong><small>Comprimento pelo arrasto · largura declarada</small></span>
          </div>
          <div className="rv-area-compacta__parametros-controles">
            <CampoParametro rotulo="Largura" valor={config.larguraFaixaM} min={MINIMO_DIMENSAO_M}
              max={MAXIMO_LARGURA_M} passo={0.5} desabilitado={parametrosBloqueados} testId="area-campo-largura"
              onValor={(larguraFaixaM) => onConfig({ larguraFaixaM })} />
          </div>
        </div>
      )}

      {emPontos && (
        <div className="rv-area-compacta__acoes" role="group" aria-label="Desenho por pontos">
          <span>{estado.pontos.length} ponto{estado.pontos.length === 1 ? "" : "s"}</span>
          <button type="button" data-testid="area-desfazer-ponto" onClick={onDesfazerPonto}>
            <Undo2 size={14} /> Desfazer
          </button>
          <button type="button" data-testid="area-cancelar" onClick={onDescartar}>
            <X size={14} /> Cancelar
          </button>
          <button type="button" className="rv-area-compacta__concluir"
            data-testid="area-concluir" disabled={!!motivoNaoConclui}
            title={motivoNaoConclui ?? undefined} onClick={onConcluirPontos}>
            <Check size={14} /> Concluir
          </button>
        </div>
      )}
      {config.tipo === "aura" && estado.fase === "escolhendo_token_da_aura" && (
        <p className="rv-area-compacta__estado" role="status">Escolha um token no mapa</p>
      )}
      {config.tipo === "aura" && estado.fase === "definindo_raio_da_aura" && (
        <p className="rv-area-compacta__estado" role="status">Arraste no mapa para definir o raio</p>
      )}
      {erro && <p className="rv-area-compacta__erro" role="alert" data-testid="area-erro">{erro}</p>}
    </section>
  );
}
