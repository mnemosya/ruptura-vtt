"use client";

/**
 * Painel de camadas do mapa — só as que EXISTEM de verdade no SVG de
 * `_mapa/MapaHex.tsx` (nenhuma opção falsa). Visibilidade e bloqueio de
 * interação são LOCAIS a este navegador/usuário — nunca transmitidos
 * por Realtime, nunca mudam regra de jogo (pathfinding, colisão, linha
 * de visão continuam vendo a camada como se estivesse visível/
 * desbloqueada, mesmo escondida/travada aqui).
 *
 * Bloqueio de interação só existe pras camadas que TÊM ação própria:
 * Terreno funcional (pintar), Marcações (criar/apagar) e Tokens
 * (selecionar/arrastar). Grade/terreno decorativo/objetos/pings não
 * têm ação própria pra travar — só visibilidade.
 */

import { useEffect, useRef } from "react";
import { Eye, EyeOff, Lock, Unlock, RotateCcw, X } from "lucide-react";

export type CamadaId = "grade" | "terrenoDecorativo" | "terrenoFuncional" | "objetos" | "marcas" | "tokens" | "pings";

export interface EstadoUmaCamada {
  visivel: boolean;
  bloqueada: boolean;
}

export type EstadoCamadas = Record<CamadaId, EstadoUmaCamada>;

interface DefinicaoCamada {
  id: CamadaId;
  rotulo: string;
  temBloqueio: boolean;
}

/** Ordem de exibição no painel — não é `z-index` (isso continua fixo no SVG, ver `MapaHex.tsx`), só a ordem da lista de controles. */
export const CAMADAS_DEFINICAO: DefinicaoCamada[] = [
  { id: "grade", rotulo: "Grade", temBloqueio: false },
  { id: "terrenoDecorativo", rotulo: "Terreno (decorativo)", temBloqueio: false },
  { id: "terrenoFuncional", rotulo: "Terreno (funcional)", temBloqueio: true },
  { id: "objetos", rotulo: "Objetos / coberturas", temBloqueio: false },
  { id: "marcas", rotulo: "Marcações", temBloqueio: true },
  { id: "tokens", rotulo: "Tokens", temBloqueio: true },
  { id: "pings", rotulo: "Pings", temBloqueio: false },
];

export const CAMADAS_PADRAO: EstadoCamadas = {
  grade: { visivel: true, bloqueada: false },
  terrenoDecorativo: { visivel: true, bloqueada: false },
  terrenoFuncional: { visivel: true, bloqueada: false },
  objetos: { visivel: true, bloqueada: false },
  marcas: { visivel: true, bloqueada: false },
  tokens: { visivel: true, bloqueada: false },
  pings: { visivel: true, bloqueada: false },
};

const VERSAO_SCHEMA = "v1";

/** Chave versionada — inclui usuário e cena: preferência de camadas é individual e não faz sentido vazar entre cenas diferentes (uma cena travada de terreno não devia travar a próxima). */
export function chaveCamadas(usuarioId: string | null, campaignId: string, sceneId: string | null): string {
  return `rv-camadas:${VERSAO_SCHEMA}:${usuarioId ?? "anon"}:${campaignId}:${sceneId ?? "sem-cena"}`;
}

function estadoUmaCamadaValido(v: unknown): v is EstadoUmaCamada {
  return !!v && typeof v === "object" && typeof (v as EstadoUmaCamada).visivel === "boolean" && typeof (v as EstadoUmaCamada).bloqueada === "boolean";
}

/**
 * Lê a preferência salva — tolerante a QUALQUER coisa que não bata o
 * formato esperado: schema antigo, JSON corrompido, camada removida
 * do código, camada nova sem entrada salva. Nunca lança, sempre
 * devolve um `EstadoCamadas` válido (o padrão pra tudo que não valida).
 */
export function carregarPreferenciaCamadas(chave: string): EstadoCamadas {
  if (typeof window === "undefined") return CAMADAS_PADRAO;
  try {
    const bruto = window.localStorage.getItem(chave);
    if (!bruto) return CAMADAS_PADRAO;
    const json = JSON.parse(bruto) as Record<string, unknown>;
    const resultado = { ...CAMADAS_PADRAO };
    for (const def of CAMADAS_DEFINICAO) {
      const entrada = json[def.id];
      if (estadoUmaCamadaValido(entrada)) resultado[def.id] = entrada;
      // entrada ausente/inválida: fica no padrão (já copiado acima) —
      // cobre tanto "camada nova, nunca salva" quanto "valor corrompido".
    }
    return resultado;
  } catch {
    return CAMADAS_PADRAO;
  }
}

export function salvarPreferenciaCamadas(chave: string, estado: EstadoCamadas): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chave, JSON.stringify(estado));
  } catch {
    // Storage cheio/desabilitado (modo privado) — preferência vira só
    // desta sessão, não é motivo pra quebrar a mesa.
  }
}

export function PainelCamadas({
  aberto, camadas, onAlternarVisivel, onAlternarBloqueio, onRestaurarPadrao, onFechar, botaoRef,
}: {
  aberto: boolean;
  camadas: EstadoCamadas;
  onAlternarVisivel: (id: CamadaId) => void;
  onAlternarBloqueio: (id: CamadaId) => void;
  onRestaurarPadrao: () => void;
  onFechar: () => void;
  /** Botão "Camadas do mapa" da barra de ferramentas — recebe o foco de volta ao fechar por Esc/clique externo. */
  botaoRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") { onFechar(); botaoRef.current?.focus(); }
    }
    function aoClicarFora(e: PointerEvent) {
      if (painelRef.current && !painelRef.current.contains(e.target as Node) && e.target !== botaoRef.current) {
        onFechar();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("pointerdown", aoClicarFora);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("pointerdown", aoClicarFora);
    };
  }, [aberto, onFechar, botaoRef]);

  if (!aberto) return null;

  return (
    <div ref={painelRef} className="rv-flutuante rv-camadas" role="dialog" aria-label="Camadas do mapa">
      <div className="rv-camadas-cab">
        <span>Camadas</span>
        <button type="button" className="rv-camadas-fechar" onClick={() => { onFechar(); botaoRef.current?.focus(); }} aria-label="Fechar painel de camadas">
          <X size={14} />
        </button>
      </div>
      <ul className="rv-camadas-lista">
        {CAMADAS_DEFINICAO.map((def) => {
          const st = camadas[def.id];
          return (
            <li key={def.id} className="rv-camadas-item">
              <span className="rv-camadas-nome">{def.rotulo}</span>
              <span className="rv-camadas-estado">
                {!st.visivel && <span className="rv-camadas-tag">oculta</span>}
                {def.temBloqueio && st.bloqueada && <span className="rv-camadas-tag rv-camadas-tag--bloqueio">bloqueada</span>}
              </span>
              <button
                type="button"
                className="rv-camadas-btn"
                aria-pressed={st.visivel}
                aria-label={`${st.visivel ? "Ocultar" : "Mostrar"} camada ${def.rotulo}`}
                title={st.visivel ? "Ocultar" : "Mostrar"}
                onClick={() => onAlternarVisivel(def.id)}
              >
                {st.visivel ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              {def.temBloqueio && (
                <button
                  type="button"
                  className="rv-camadas-btn"
                  aria-pressed={st.bloqueada}
                  aria-label={`${st.bloqueada ? "Desbloquear" : "Bloquear"} interação com ${def.rotulo}`}
                  title={st.bloqueada ? "Desbloquear interação" : "Bloquear interação"}
                  onClick={() => onAlternarBloqueio(def.id)}
                >
                  {st.bloqueada ? <Lock size={15} /> : <Unlock size={15} />}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <button type="button" className="rv-btn rv-btn--ghost rv-camadas-restaurar" onClick={onRestaurarPadrao}>
        <RotateCcw size={13} /> Restaurar padrão
      </button>
    </div>
  );
}
