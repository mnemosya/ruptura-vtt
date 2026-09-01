"use client";

/**
 * Painel da ferramenta ÁREAS — flutuante, ARRASTÁVEL e NUNCA modal: a
 * mesa continua visível e interativa por baixo (nenhum
 * `.rv-modal-fundo`, nenhum bloqueio de foco, nenhum overlay escuro).
 *
 * ESTRUTURA EM QUATRO BLOCOS (revisão de UX):
 *   A. Cabeçalho — título, ESTADO atual em linguagem humana, recolher,
 *      fechar. É a alça de arrasto da janela.
 *   B. Formato — os nove tipos, compactos.
 *   C. Propriedades — só os campos do tipo escolhido, agrupados em
 *      Dimensões / Posicionamento e snap / Aparência (recolhível) /
 *      Visibilidade, com um RESUMO específico do formato.
 *   D. Áreas persistidas — recolhida quando vazia, e a seção
 *      administrativa de autorização separada dela.
 *
 * Divisão de responsabilidade: este componente não calcula geometria,
 * não valida regra e não fala com o servidor. Ele lê `ConfigAreas` +
 * `EstadoAreas` + os parâmetros correntes, e devolve intenções.
 */

import { JanelaFerramenta } from "./JanelaFerramenta";
import { useCallback, useEffect, useRef, useState } from "react";
import { Ban, Check, ChevronDown, ChevronRight, Copy, Crosshair, Eye, EyeOff, Hexagon, Pencil, Trash2, Undo2, X } from "lucide-react";
import {
  type CorArea, type ModoLinha, type ParametrosArea, type TipoArea,
  ABERTURA_CONE_GRAUS, CORES_AREA, HEX_COR_AREA, LARGURA_PAREDE_M, META_AREA, TIPOS_AREA,
} from "../_dominio/areaEfeito";
import { type ConfigAreas, type EstadoAreas } from "../_ferramentas/areasEstado";
import { PASSO_SNAP_DIRECAO_GRAUS, formatarMetros, tipoTemDirecao } from "../_ferramentas/areasSnap";
export interface ItemListaArea {
  id: string;
  tipo: TipoArea;
  rotulo: string | null;
  visivel: boolean;
  cor: CorArea;
  podeEditar: boolean;
  /** Autoria discreta ("Criada por você") — nunca expõe quem criou uma área de OUTRA pessoa, só se é sua ou não. */
  criadaPorVoce: boolean;
  celulas: number;
  tokens: number;
}

export interface PropsPainelAreas {
  config: ConfigAreas;
  onConfig: (patch: Partial<ConfigAreas>) => void;
  estado: EstadoAreas;
  paramsAtuais: ParametrosArea | null;
  onAlterarParams: (p: ParametrosArea) => void;
  resumo: { celulas: number; tokens: number } | null;
  tokens: { id: string; nome: string; sigla: string }[];
  areas: ItemListaArea[];
  selecionadaId: string | null;
  onSelecionar: (id: string | null) => void;
  onLocalizar: (id: string) => void;
  onDescartar: () => void;
  onManter: () => void;
  onConcluirPontos: () => void;
  onDesfazerPonto: () => void;
  onEscolherTokenAura: () => void;
  motivoNaoConclui: string | null;
  onEditar: (id: string) => void;
  onSalvarEdicao: () => void;
  onCancelarEdicao: () => void;
  onDuplicar: (id: string) => void;
  onExcluir: (id: string) => void;
  onAlternarVisibilidade: (id: string) => void;
  onFecharFerramenta: () => void;
  erro: string | null;
  /** Preferências locais de janela — posição, recolhimento e seção Aparência. */
  recolhido: boolean;
  onAlternarRecolhido: () => void;
  aparenciaAberta: boolean;
  onAlternarAparencia: () => void;
}

/** Rótulo humano de cada fase — o `data-fase` cru continua no elemento, para teste. */
const ROTULO_FASE: Record<EstadoAreas["fase"], string> = {
  ociosa: "Pronto",
  escolhendo_token_da_aura: "Escolha um token",
  definindo_raio_da_aura: "Arraste para definir o raio",
  pressionada: "Criando",
  arrastando: "Criando",
  pontos: "Criando",
  concluida_local: "Prévia",
  editando: "Editando",
  persistindo: "Salvando…",
  erro: "Erro",
};

function CampoNumero({
  rotulo, valor, min, max, passo = 1, onChange, desabilitado, dica, testid, unidade = "m",
}: {
  rotulo: string; valor: number; min: number; max: number; passo?: number;
  onChange: (v: number) => void; desabilitado?: boolean; dica?: string; testid: string; unidade?: string;
}) {
  return (
    <label className="rv-area-campo" title={dica}>
      <span>{rotulo}</span>
      <input
        type="number" inputMode="decimal" data-testid={testid}
        value={Number.isFinite(valor) ? Number(valor.toFixed(2)) : 0}
        min={min} max={max} step={passo} disabled={desabilitado}
        onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }}
      />
      <em>{unidade}</em>
    </label>
  );
}

function Secao({
  titulo, aberta, onAlternar, children, testid,
}: {
  titulo: string; aberta: boolean; onAlternar: () => void; children: React.ReactNode; testid: string;
}) {
  return (
    <div className="rv-area-secao">
      <button type="button" className="rv-area-secao-cab" aria-expanded={aberta} data-testid={testid} onClick={onAlternar}>
        {aberta ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>{titulo}</span>
      </button>
      {aberta && <div className="rv-area-secao-corpo">{children}</div>}
    </div>
  );
}

/**
 * Resumo ESPECÍFICO do formato. A versão anterior mostrava a mesma
 * frase genérica ("Lado X · altura X") mesmo em formatos que não têm
 * lado nem altura — informação errada é pior que nenhuma.
 */
function resumoDoFormato(p: ParametrosArea | null, config: ConfigAreas, pontosEmCurso: number): string | null {
  if (!p) {
    if ((config.tipo === "parede" || config.tipo === "personalizada") && pontosEmCurso > 0) {
      return `${pontosEmCurso} ponto${pontosEmCurso === 1 ? "" : "s"}`;
    }
    return null;
  }
  const m = formatarMetros;
  switch (p.tipo) {
    case "esfera":
    case "domo":
    case "aura":
      return `Raio ${m(p.raioM)}`;
    case "linha":
      return `Comprimento ${m(p.comprimentoM)} · largura ${m(LARGURA_PAREDE_M)}${p.modo === "traco_fino" ? " (traço fino)" : ""}`;
    case "faixa":
      return `${m(p.comprimentoM)} × ${m(p.larguraM)}`;
    case "parede": {
      let total = 0;
      for (let i = 0; i < p.pontos.length - 1; i++) {
        total += Math.hypot(p.pontos[i + 1].q - p.pontos[i].q, p.pontos[i + 1].r - p.pontos[i].r);
      }
      return `Comprimento total ${m(total)} · altura ${m(p.alturaM)}`;
    }
    case "cubo": {
      const lado = Number.isInteger(p.ladoM) ? String(p.ladoM) : String(p.ladoM).replace(".", ",");
      return `${lado} × ${lado} × ${lado} m`;
    }
    case "cone":
      return `Alcance ${m(p.alcanceM)} · abertura ${ABERTURA_CONE_GRAUS}°`;
    case "personalizada":
      return `${p.pontos.length} vértice${p.pontos.length === 1 ? "" : "s"}`;
  }
}

export function PainelAreas(props: PropsPainelAreas) {
  const { config, onConfig, estado, paramsAtuais, onAlterarParams } = props;
  const [listaAberta, setListaAberta] = useState(false);
  const [busca, setBusca] = useState("");

  const emPrevia = estado.fase === "concluida_local";
  const emEdicao = estado.fase === "editando";
  const persistindo = estado.fase === "persistindo";
  const emPontos = estado.fase === "pontos";
  const escolhendoTokenAura = estado.fase === "escolhendo_token_da_aura";
  const definindoRaioAura = estado.fase === "definindo_raio_da_aura";
  const editandoParams = emPrevia || emEdicao;
  const p = paramsAtuais;

  /** Só troca de tipo quando não há RPC em voo — trocar no meio abandonaria uma geometria sem avisar. */
  const trocarTipo = (t: TipoArea) => {
    if (persistindo) return;
    onConfig({ tipo: t });
  };

  const pontosEmCurso = emPontos ? estado.pontos.length : 0;
  const resumo = resumoDoFormato(p, config, pontosEmCurso);

  // ── C. Dimensões, por tipo ────────────────────────────────────────
  const dimensoes: React.ReactNode[] = [];

  if (config.tipo === "esfera" || config.tipo === "domo") {
    dimensoes.push(
      <CampoNumero key="raio" testid="area-campo-raio" rotulo="Raio" min={0.5} max={60}
        valor={p && (p.tipo === "esfera" || p.tipo === "domo") ? p.raioM : 0}
        desabilitado={!editandoParams}
        dica={editandoParams ? undefined : "Arraste no mapa para definir o raio."}
        onChange={(v) => p && (p.tipo === "esfera" || p.tipo === "domo") && onAlterarParams({ ...p, raioM: v })} />,
      <CampoNumero key="altura" testid="area-campo-altura-volume" rotulo="Altura (opcional)" min={0} max={60}
        valor={config.alturaVolumeM ?? 0}
        onChange={(v) => { onConfig({ alturaVolumeM: v > 0 ? v : null }); if (p && (p.tipo === "esfera" || p.tipo === "domo")) onAlterarParams({ ...p, alturaM: v > 0 ? v : null }); }} />,
      <CampoNumero key="nivel" testid="area-campo-nivel" rotulo="Nível de origem" min={-60} max={60}
        valor={config.nivelOrigemM ?? 0}
        dica="Altura da superfície de onde o efeito parte. Guardada como informação — a mesa é bidimensional nesta versão."
        onChange={(v) => { onConfig({ nivelOrigemM: v !== 0 ? v : null }); if (p && (p.tipo === "esfera" || p.tipo === "domo")) onAlterarParams({ ...p, nivelOrigemM: v !== 0 ? v : null }); }} />,
    );
  }

  if (config.tipo === "aura") {
    const filtrados = busca.trim()
      ? props.tokens.filter((t) => `${t.nome} ${t.sigla}`.toLowerCase().includes(busca.trim().toLowerCase()))
      : props.tokens;
    dimensoes.push(
      <div key="aura-origem" className="rv-area-campo rv-area-campo--largo">
        <span>Token de origem</span>
        <div className="rv-area-aura-origem">
          <button type="button" className="rv-btn rv-btn--ghost rv-area-escolher-token" data-testid="area-escolher-token-mapa"
            aria-pressed={escolhendoTokenAura} onClick={props.onEscolherTokenAura}>
            <Crosshair size={12} /> {escolhendoTokenAura ? "Clique num token…" : definindoRaioAura ? "Arraste para o raio…" : "Escolher no mapa"}
          </button>
          {/* Alternativa acessível e prática em mesas densas — sincronizada com a escolha no mapa. */}
          {props.tokens.length > 8 && (
            <input type="search" className="rv-area-busca" placeholder="Buscar token…" data-testid="area-busca-token"
              value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar token de origem" />
          )}
          <select data-testid="area-campo-token" aria-label="Token de origem da aura"
            value={config.tokenAuraId ?? ""} onChange={(e) => onConfig({ tokenAuraId: e.target.value || null })}>
            <option value="">Escolha um token…</option>
            {filtrados.map((t) => <option key={t.id} value={t.id}>{t.nome} ({t.sigla})</option>)}
          </select>
        </div>
      </div>,
      <CampoNumero key="raio" testid="area-campo-raio" rotulo="Raio" min={0.5} max={60}
        valor={p && p.tipo === "aura" ? p.raioM : config.raioAuraM}
        onChange={(v) => { onConfig({ raioAuraM: v }); if (p && p.tipo === "aura") onAlterarParams({ ...p, raioM: v }); }} />,
    );
  }

  if (config.tipo === "linha") {
    dimensoes.push(
      <CampoNumero key="comp" testid="area-campo-comprimento" rotulo="Comprimento" min={0.5} max={120}
        valor={p && p.tipo === "linha" ? p.comprimentoM : 0} desabilitado={!editandoParams}
        dica={editandoParams ? undefined : "Arraste no mapa para definir direção e comprimento."}
        onChange={(v) => p && p.tipo === "linha" && onAlterarParams({ ...p, comprimentoM: v })} />,
      <div key="modo" className="rv-area-campo rv-area-campo--largo" role="radiogroup" aria-label="Modo da linha">
        <span>Modo</span>
        <div className="rv-area-opcoes">
          {(["uma_celula", "traco_fino"] as ModoLinha[]).map((m) => (
            <button key={m} type="button" className="rv-sub-btn" data-testid={`area-modo-${m}`}
              aria-pressed={(p && p.tipo === "linha" ? p.modo : config.modoLinha) === m}
              onClick={() => { onConfig({ modoLinha: m }); if (p && p.tipo === "linha") onAlterarParams({ ...p, modo: m }); }}>
              {m === "uma_celula" ? "Uma célula (1 m)" : "Traço fino"}
            </button>
          ))}
        </div>
      </div>,
    );
  }

  if (config.tipo === "faixa") {
    dimensoes.push(
      <CampoNumero key="comp" testid="area-campo-comprimento" rotulo="Comprimento" min={0.5} max={120}
        valor={p && p.tipo === "faixa" ? p.comprimentoM : 0} desabilitado={!editandoParams}
        dica={editandoParams ? undefined : "Arraste no mapa para definir direção e comprimento."}
        onChange={(v) => p && p.tipo === "faixa" && onAlterarParams({ ...p, comprimentoM: v })} />,
      <CampoNumero key="larg" testid="area-campo-largura" rotulo="Largura" min={1} max={60} passo={1}
        valor={p && p.tipo === "faixa" ? p.larguraM : config.larguraFaixaM}
        onChange={(v) => { const w = Math.round(v); onConfig({ larguraFaixaM: w }); if (p && p.tipo === "faixa") onAlterarParams({ ...p, larguraM: w }); }} />,
    );
  }

  if (config.tipo === "parede") {
    dimensoes.push(
      <div key="fixa" className="rv-area-valor-fixo" data-testid="area-info-largura-parede">
        <span>Largura</span><strong>{LARGURA_PAREDE_M} m</strong>
      </div>,
      <CampoNumero key="alt" testid="area-campo-altura" rotulo="Altura" min={0} max={60}
        valor={p && p.tipo === "parede" ? p.alturaM : config.alturaParedeM}
        dica="Guardada em metros mesmo com a mesa bidimensional — nada de bloqueio é aplicado automaticamente nesta versão."
        onChange={(v) => { onConfig({ alturaParedeM: v }); if (p && p.tipo === "parede") onAlterarParams({ ...p, alturaM: v }); }} />,
    );
  }

  if (config.tipo === "cubo") {
    dimensoes.push(
      <CampoNumero key="lado" testid="area-campo-lado" rotulo="Lado" min={0.5} max={60}
        valor={p && p.tipo === "cubo" ? p.ladoM : 0} desabilitado={!editandoParams}
        dica={editandoParams ? undefined : "Arraste no mapa para definir o tamanho da base."}
        onChange={(v) => p && p.tipo === "cubo" && onAlterarParams({ ...p, ladoM: v })} />,
      <CampoNumero key="dir" testid="area-campo-direcao" rotulo="Orientação" min={0} max={359} passo={PASSO_SNAP_DIRECAO_GRAUS} unidade="°"
        valor={p && p.tipo === "cubo" ? p.direcaoGraus : 0} desabilitado={!editandoParams}
        onChange={(v) => p && p.tipo === "cubo" && onAlterarParams({ ...p, direcaoGraus: v })} />,
      <div key="fixa" className="rv-area-valor-fixo" data-testid="area-info-altura-cubo">
        <span>Altura</span><strong>{formatarMetros(p && p.tipo === "cubo" ? p.ladoM : 0)}</strong>
      </div>,
    );
  }

  if (config.tipo === "cone") {
    dimensoes.push(
      <CampoNumero key="alc" testid="area-campo-alcance" rotulo="Alcance" min={0.5} max={120}
        valor={p && p.tipo === "cone" ? p.alcanceM : 0} desabilitado={!editandoParams}
        dica={editandoParams ? undefined : "Arraste no mapa para definir direção e alcance."}
        onChange={(v) => p && p.tipo === "cone" && onAlterarParams({ ...p, alcanceM: v })} />,
      <CampoNumero key="dir" testid="area-campo-direcao" rotulo="Direção" min={0} max={359} passo={PASSO_SNAP_DIRECAO_GRAUS} unidade="°"
        valor={p && p.tipo === "cone" ? p.direcaoGraus : 0} desabilitado={!editandoParams}
        onChange={(v) => p && p.tipo === "cone" && onAlterarParams({ ...p, direcaoGraus: v })} />,
      <div key="fixa" className="rv-area-valor-fixo" data-testid="area-info-abertura">
        <span>Abertura</span><strong>{ABERTURA_CONE_GRAUS}°</strong>
      </div>,
    );
  }

  if (config.tipo === "personalizada") {
    const n = p && p.tipo === "personalizada" ? p.pontos.length : pontosEmCurso;
    dimensoes.push(<p key="v" className="rv-area-fixo" data-testid="area-info-vertices">{n} vértice{n === 1 ? "" : "s"}.</p>);
  }


  return (
    <JanelaFerramenta
      id="areas"
      icone={<Hexagon size={16} />}
      titulo="Áreas"
      modo={ROTULO_FASE[estado.fase]}
      modoAtributos={{ "data-testid": "area-fase", "data-fase-crua": estado.fase }}
      rotulo="Ferramenta Áreas"
      rotuloFechar="Fechar ferramenta Áreas"
      aoFechar={props.onFecharFerramenta}
      recolhido={props.recolhido}
      aoAlternarRecolhido={props.onAlternarRecolhido}
      rotuloRecolher={{ recolher: "Recolher painel de áreas", expandir: "Expandir painel de áreas" }}
      className="rv-painel-areas"
      testId="painel-areas"
      testIdCabecalho="area-cabecalho"
      testIdRecolher="area-recolher"
      testIdFechar="area-fechar-ferramenta"
      atributos={{ "data-fase": estado.fase }}
    >
      {/* O CORPO é do painel: recolher aqui esconde tudo menos o
          cabeçalho, que continua sendo a alça de arrasto. */}
      {!props.recolhido && (
        <div className="rv-fp-corpo rv-area-corpo">
      {/* ── B. Formato ─────────────────────────────────────── */}
          <div className="rv-area-tipos" role="radiogroup" aria-label="Formato da área">
            {TIPOS_AREA.map((t) => (
              <button key={t} type="button" className="rv-area-tipo" data-testid={`area-tipo-${t}`}
                aria-pressed={config.tipo === t} aria-label={META_AREA[t].rotulo}
                disabled={persistindo} onClick={() => trocarTipo(t)}>
                <span className="rv-area-glifo" aria-hidden>{META_AREA[t].glifo}</span>
                <span className="rv-area-nome">{META_AREA[t].rotulo}</span>
              </button>
            ))}
          </div>

          <p className="rv-area-instrucao" data-testid="area-instrucao">
            {definindoRaioAura ? "Token escolhido. Arraste em qualquer ponto do mapa para definir o raio." : META_AREA[config.tipo].instrucao}
          </p>

          {/* ── C. Propriedades ────────────────────────────────── */}
          <div className="rv-area-grupo">
            <span className="rv-area-grupo-titulo">Dimensões</span>
            <div className="rv-area-campos">{dimensoes}</div>
            {resumo && <p className="rv-area-resumo-forma" data-testid="area-resumo-forma">{resumo}</p>}
            {props.resumo && (
              <p className="rv-area-resumo" data-testid="area-resumo">
                {props.resumo.celulas} célula{props.resumo.celulas === 1 ? "" : "s"} afetada{props.resumo.celulas === 1 ? "" : "s"} · {props.resumo.tokens} token{props.resumo.tokens === 1 ? "" : "s"} afetado{props.resumo.tokens === 1 ? "" : "s"}
              </p>
            )}
          </div>

          <div className="rv-area-grupo">
            <span className="rv-area-grupo-titulo">Posicionamento e snap</span>
            {tipoTemDirecao(config.tipo) && (
              <label className="rv-area-check">
                <input type="checkbox" data-testid="area-campo-snap" checked={config.snapDirecao}
                  onChange={(e) => onConfig({ snapDirecao: e.target.checked })} />
                <span>Travar direção em passos de {PASSO_SNAP_DIRECAO_GRAUS}°</span>
              </label>
            )}
            {/* Aura é sempre presa a um token — as duas opções de
                origem livre não fazem sentido nela. Prioridade quando
                as duas estão ligadas (descrita aqui, não num parágrafo
                editorial): token perto vence; sem token, cai pro
                centro da célula; sem nenhum dos dois, o ponto livre. */}
            {config.tipo !== "aura" && (
              <>
                <label className="rv-area-check">
                  <input type="checkbox" data-testid="area-campo-snap-celula" checked={config.snapOrigemCelula}
                    aria-describedby="area-snap-prioridade"
                    onChange={(e) => onConfig({ snapOrigemCelula: e.target.checked })} />
                  <span>Fixar origem no centro da célula</span>
                </label>
                <label className="rv-area-check">
                  <input type="checkbox" data-testid="area-campo-snap-token" checked={config.snapOrigemToken}
                    aria-describedby="area-snap-prioridade"
                    onChange={(e) => onConfig({ snapOrigemToken: e.target.checked })} />
                  <span>Fixar origem no token mais próximo</span>
                </label>
                <span id="area-snap-prioridade" className="sr-only">
                  Com as duas opções ligadas, um token elegível perto do clique tem prioridade sobre o centro da célula.
                </span>
              </>
            )}
            <p className="rv-area-dica" data-testid="area-dica-precisao">
              Arraste para definir. Segure Alt ou ⌘ para usar medidas fracionárias.
            </p>
          </div>

          <Secao titulo="Aparência" aberta={props.aparenciaAberta} onAlternar={props.onAlternarAparencia} testid="area-secao-aparencia">
            <label className="rv-area-campo rv-area-campo--largo">
              <span>Rótulo</span>
              <input type="text" maxLength={80} data-testid="area-campo-rotulo" value={config.rotulo}
                onChange={(e) => onConfig({ rotulo: e.target.value })} />
            </label>
            <div className="rv-area-campo rv-area-campo--largo">
              <span>Cor</span>
              <div className="rv-area-cores">
                {CORES_AREA.map((c) => (
                  <button key={c} type="button" className="rv-area-cor" data-testid={`area-cor-${c}`} aria-label={c}
                    aria-pressed={config.cor === c} style={{ background: HEX_COR_AREA[c] }} onClick={() => onConfig({ cor: c })} />
                ))}
              </div>
            </div>
            <label className="rv-area-campo rv-area-campo--largo">
              <span>Opacidade</span>
              <input type="range" min={0.05} max={1} step={0.05} data-testid="area-campo-opacidade"
                value={config.opacidade} onChange={(e) => onConfig({ opacidade: Number(e.target.value) })} />
            </label>
          </Secao>

          <label className="rv-area-check">
            <input type="checkbox" data-testid="area-campo-visivel" checked={config.visivel}
              onChange={(e) => onConfig({ visivel: e.target.checked })} />
            <span>Visível para os jogadores</span>
          </label>

          {props.erro && <p className="rv-area-erro" role="alert" data-testid="area-erro">{props.erro}</p>}

          {/* ── Ações por fase ─────────────────────────────────── */}
          {emPontos && (
            <div className="rv-area-acoes">
              <button type="button" className="rv-btn rv-btn--pri" data-testid="area-concluir"
                disabled={!!props.motivoNaoConclui} onClick={props.onConcluirPontos}>
                <Check size={13} /> Concluir
              </button>
              <button type="button" className="rv-btn rv-btn--ghost" data-testid="area-desfazer-ponto" onClick={props.onDesfazerPonto}>
                <Undo2 size={13} /> Desfazer ponto
              </button>
              <button type="button" className="rv-btn rv-btn--ghost" data-testid="area-cancelar" onClick={props.onDescartar}>
                <Ban size={13} /> Cancelar (Esc)
              </button>
              {props.motivoNaoConclui && <p className="rv-area-aviso" data-testid="area-motivo">{props.motivoNaoConclui}</p>}
            </div>
          )}

          {/* Prévia: o caminho PRINCIPAL de confirmar/descartar são os
              botões contextuais ao lado da própria geometria, no mapa.
              Aqui fica só um rodapé compacto — que também é a
              alternativa alcançável por TECLADO, já que os botões
              flutuantes não podem ser o único meio. */}
          {emPrevia && (
            <div className="rv-area-rodape" data-testid="area-rodape-previa">
              <span className="rv-area-rodape-texto">Área aguardando confirmação.</span>
              <div className="rv-area-acoes">
                <button type="button" className="rv-btn rv-btn--pri" data-testid="area-manter" onClick={props.onManter}>
                  <Check size={13} /> Manter na mesa
                </button>
                <button type="button" className="rv-btn rv-btn--ghost" data-testid="area-descartar" onClick={props.onDescartar}>
                  <Ban size={13} /> Descartar
                </button>
              </div>
            </div>
          )}

          {emEdicao && (
            <div className="rv-area-acoes">
              <button type="button" className="rv-btn rv-btn--pri" data-testid="area-salvar" onClick={props.onSalvarEdicao}>
                <Check size={13} /> Salvar alterações
              </button>
              <button type="button" className="rv-btn rv-btn--ghost" data-testid="area-cancelar-edicao" onClick={props.onCancelarEdicao}>
                <X size={13} /> Cancelar (Esc)
              </button>
            </div>
          )}

          {estado.fase === "erro" && (
            <div className="rv-area-acoes">
              <button type="button" className="rv-btn rv-btn--pri" data-testid="area-tentar-novamente" onClick={props.onManter}>
                Tentar de novo
              </button>
              <button type="button" className="rv-btn rv-btn--ghost" data-testid="area-descartar" onClick={props.onDescartar}>
                <Ban size={13} /> Descartar
              </button>
            </div>
          )}

          {/* ── D. Áreas persistidas ───────────────────────────── */}
          <div className="rv-area-secao">
            <button type="button" className="rv-area-secao-cab" data-testid="area-lista-toggle"
              aria-expanded={listaAberta} aria-controls="area-lista-corpo" onClick={() => setListaAberta((v) => !v)}>
              {listaAberta ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              <span>Áreas na cena ({props.areas.length})</span>
            </button>
            {listaAberta && (
              <div className="rv-area-lista" id="area-lista-corpo" data-testid="area-lista">
                {props.areas.length === 0 && <p className="rv-area-vazio">Nenhuma área persistida nesta cena.</p>}
                {props.areas.map((a) => (
                  <div key={a.id} className="rv-area-item" data-testid={`area-item-${a.id}`} data-selecionada={props.selecionadaId === a.id}>
                    <button type="button" className="rv-area-item-nome" aria-pressed={props.selecionadaId === a.id}
                      onClick={() => props.onSelecionar(props.selecionadaId === a.id ? null : a.id)}>
                      <span className="rv-area-glifo" aria-hidden style={{ color: HEX_COR_AREA[a.cor] }}>{META_AREA[a.tipo].glifo}</span>
                      <span>{a.rotulo || META_AREA[a.tipo].rotulo}</span>
                      {a.criadaPorVoce && <span className="rv-area-autoria" data-testid={`area-autoria-${a.id}`}>você</span>}
                      <em>{a.celulas} cél · {a.tokens} tok</em>
                    </button>
                    <div className="rv-area-item-acoes">
                      <button type="button" className="rv-area-item-acao" aria-label="Localizar no mapa"
                        data-testid={`area-localizar-${a.id}`} onClick={() => props.onLocalizar(a.id)}>
                        <Crosshair size={13} /><span className="rv-dica">Localizar no mapa</span>
                      </button>
                      {a.podeEditar && (
                        <>
                          <button type="button" className="rv-area-item-acao" aria-label="Editar área"
                            data-testid={`area-editar-${a.id}`} onClick={() => props.onEditar(a.id)}>
                            <Pencil size={13} /><span className="rv-dica">Editar área</span>
                          </button>
                          <button type="button" className="rv-area-item-acao" aria-label={a.visivel ? "Ocultar dos jogadores" : "Mostrar aos jogadores"}
                            data-testid={`area-visibilidade-${a.id}`} onClick={() => props.onAlternarVisibilidade(a.id)}>
                            {a.visivel ? <Eye size={13} /> : <EyeOff size={13} />}
                            <span className="rv-dica">{a.visivel ? "Ocultar dos jogadores" : "Mostrar aos jogadores"}</span>
                          </button>
                          <button type="button" className="rv-area-item-acao" aria-label="Duplicar área"
                            data-testid={`area-duplicar-${a.id}`} onClick={() => props.onDuplicar(a.id)}>
                            <Copy size={13} /><span className="rv-dica">Duplicar área</span>
                          </button>
                          <button type="button" className="rv-area-item-acao" aria-label="Excluir área"
                            data-testid={`area-excluir-${a.id}`} onClick={() => props.onExcluir(a.id)}>
                            <Trash2 size={13} /><span className="rv-dica">Excluir área</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </JanelaFerramenta>
  );
}
