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
import { useState } from "react";
import { Check, Copy, Crosshair, Eye, EyeOff, Hexagon, Pencil, Trash2, Undo2 } from "lucide-react";
import { usePlataformaMac } from "./PainelAnotacoes";
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

/**
 * Dimensão em "valor grande editável" (`jf-dim`). Continua um
 * `<input type="number">` com o mesmo `data-testid` e a mesma regra de
 * valor — só a casca mudou.
 */
function CampoNumero({
  rotulo, valor, min, max, passo = 1, onChange, desabilitado, dica, apoio, testid, unidade = "m", vazio,
}: {
  rotulo: string; valor: number | null; min: number; max: number; passo?: number;
  onChange: (v: number) => void; desabilitado?: boolean; dica?: string;
  /** Linha de apoio VISÍVEL sob o campo — explicação que não pode depender de hover. */
  apoio?: string;
  testid: string; unidade?: string;
  /** Placeholder quando `valor` é `null` (campo opcional não declarado). */
  vazio?: string;
}) {
  return (
    <label className="jf-dim rv-area-dim" title={dica} data-desabilitado={desabilitado ? "true" : undefined}>
      <span className="jf-l">{rotulo}</span>
      <span className="jf-dim-v">
        <input
          type="number" inputMode="decimal" data-testid={testid} aria-label={rotulo}
          value={valor === null ? "" : Number.isFinite(valor) ? Number(valor.toFixed(2)) : 0}
          placeholder={vazio ?? "0"}
          min={min} max={max} step={passo} disabled={desabilitado}
          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }}
        />
        <small>{unidade}</small>
      </span>
      {apoio && <small className="rv-area-campo-apoio">{apoio}</small>}
    </label>
  );
}

/** Valor fixo do formato, na mesma leitura de uma dimensão, sem campo. */
function ValorFixo({ rotulo, valor, unidade, testid }: { rotulo: string; valor: string | number; unidade?: string; testid: string }) {
  return (
    <div className="jf-dim rv-area-dim rv-area-dim--fixo" data-testid={testid}>
      <span className="jf-l">{rotulo}</span>
      <span className="jf-dim-v"><b>{valor}</b>{unidade && <small>{unidade}</small>}</span>
    </div>
  );
}

/** Ícones dos formatos — SVG copiado do protótipo aprovado. */
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
const ROTULO_GESTO: Record<string, string> = { arraste: "Arraste", token: "Token", pontos: "Pontos" };
const NOME_COR_AREA: Record<CorArea, string> = {
  vermelho: "Cinética", laranja: "Energética", ambar: "Material", verde: "Biótica", ciano: "Sináptica", roxo: "Cognitiva", branco: "Branco",
};
const ICONE_CELULA = "M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9zM11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0";
const ICONE_TOKEN = "M8 8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6";
const ICONE_DIRECAO = "M4 20h16M4 20L18 6M12 20a8 8 0 0 0-2.3-5.7";
const ICONE_OCULTA = "M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.2 3.8M6.2 7.6A16.6 16.6 0 0 0 2.5 12S6 18 12 18c1.6 0 3-.4 4.3-1";
const ICONE_MESA = "M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM9.4 12a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0";

function Icone({ d, tam = 16, traco = 1.8 }: { d: string; tam?: number; traco?: number }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={traco}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}

function Chevron() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;
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
  /** Formato sob o mouse — a vitrine mostra a ficha dele sem trocar o escolhido. */
  const [espia, setEspia] = useState<TipoArea | null>(null);
  /** Descrição do bloco sob o mouse, na frase de ajuda. */
  const [foco, setFoco] = useState<string | null>(null);
  const mac = usePlataformaMac();

  const emPrevia = estado.fase === "concluida_local";
  const emEdicao = estado.fase === "editando";
  const persistindo = estado.fase === "persistindo";
  const emPontos = estado.fase === "pontos";
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

  // ── Dimensões, por tipo ───────────────────────────────────────────
  const dimensoes: React.ReactNode[] = [];
  /** Peças do formato que não são dimensão (token da aura, modo da linha). */
  let extra: React.ReactNode = null;

  if (config.tipo === "esfera" || config.tipo === "domo") {
    dimensoes.push(
      <CampoNumero key="raio" testid="area-campo-raio" rotulo="Raio" min={0.5} max={60}
        valor={p && (p.tipo === "esfera" || p.tipo === "domo") ? p.raioM : 0}
        desabilitado={!editandoParams}
        dica={editandoParams ? undefined : "Arraste no mapa para definir o raio."}
        onChange={(v) => p && (p.tipo === "esfera" || p.tipo === "domo") && onAlterarParams({ ...p, raioM: v })} />,
      <CampoNumero key="altura" testid="area-campo-altura-volume" rotulo="Altura" min={0} max={60}
        valor={config.alturaVolumeM} vazio="opcional"
        onChange={(v) => { onConfig({ alturaVolumeM: v > 0 ? v : null }); if (p && (p.tipo === "esfera" || p.tipo === "domo")) onAlterarParams({ ...p, alturaM: v > 0 ? v : null }); }} />,
      <CampoNumero key="nivel" testid="area-campo-nivel" rotulo="Nível" min={-60} max={60}
        valor={config.nivelOrigemM ?? 0}
        dica="Altura da superfície de onde o efeito parte. Guardada como informação — a mesa é bidimensional nesta versão."
        onChange={(v) => { onConfig({ nivelOrigemM: v !== 0 ? v : null }); if (p && (p.tipo === "esfera" || p.tipo === "domo")) onAlterarParams({ ...p, nivelOrigemM: v !== 0 ? v : null }); }} />,
    );
  }

  if (config.tipo === "aura") {
    const filtrados = busca.trim()
      ? props.tokens.filter((t) => `${t.nome} ${t.sigla}`.toLowerCase().includes(busca.trim().toLowerCase()))
      : props.tokens;
    // Sem botão de "escolher no mapa": clicar no token já escolhe a
    // origem direto. Sobra a lista, que serve pra achar por nome numa
    // mesa cheia.
    extra = (
      <div className="jf-grupo">
        <span className="jf-rot">Token de origem</span>
        {props.tokens.length > 8 && (
          <input type="search" className="jf-campo" placeholder="Buscar token…" data-testid="area-busca-token"
            value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar token de origem" />
        )}
        <select className="jf-campo rv-area-select" data-testid="area-campo-token" aria-label="Token de origem da aura"
          value={config.tokenAuraId ?? ""} onChange={(e) => onConfig({ tokenAuraId: e.target.value || null })}>
          <option value="">Escolha um token…</option>
          {filtrados.map((t) => <option key={t.id} value={t.id}>{t.nome} ({t.sigla})</option>)}
        </select>
      </div>
    );
    dimensoes.push(
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
    );
    extra = (
      <div className="jf-grupo">
        <span className="jf-rot">Modo</span>
        <div className="jf-tiles" role="radiogroup" aria-label="Modo da linha">
          {(["uma_celula", "traco_fino"] as ModoLinha[]).map((m) => (
            <button key={m} type="button" className="jf-tile" data-testid={`area-modo-${m}`}
              aria-pressed={(p && p.tipo === "linha" ? p.modo : config.modoLinha) === m}
              onClick={() => { onConfig({ modoLinha: m }); if (p && p.tipo === "linha") onAlterarParams({ ...p, modo: m }); }}>
              {m === "uma_celula" ? "Uma célula (1 m)" : "Traço fino"}
            </button>
          ))}
        </div>
      </div>
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
      <ValorFixo key="fixa" testid="area-info-largura-parede" rotulo="Largura" valor={`${LARGURA_PAREDE_M} m`} />,
      <CampoNumero key="alt" testid="area-campo-altura" rotulo="Altura" min={0} max={60}
        valor={p && p.tipo === "parede" ? p.alturaM : config.alturaParedeM}
        dica="Guardada em metros mesmo com a mesa bidimensional — nada de bloqueio é aplicado automaticamente nesta versão."
        onChange={(v) => { onConfig({ alturaParedeM: v }); if (p && p.tipo === "parede") onAlterarParams({ ...p, alturaM: v }); }} />,
    );
  }

  if (config.tipo === "cubo") {
    dimensoes.push(
      // Um campo só, com o que ele faz escrito embaixo: é a aresta, que
      // vale para as três medidas — não duas medidas independentes.
      <CampoNumero key="lado" testid="area-campo-lado" rotulo="Aresta" min={0.5} max={60}
        valor={p && p.tipo === "cubo" ? p.ladoM : 0} desabilitado={!editandoParams}
        apoio="Vale para largura, profundidade e altura."
        dica={editandoParams ? undefined : "Arraste no mapa para definir o tamanho da base."}
        onChange={(v) => p && p.tipo === "cubo" && onAlterarParams({ ...p, ladoM: v })} />,
      <CampoNumero key="dir" testid="area-campo-direcao" rotulo="Orientação" min={0} max={359} passo={PASSO_SNAP_DIRECAO_GRAUS} unidade="°"
        valor={p && p.tipo === "cubo" ? p.direcaoGraus : 0} desabilitado={!editandoParams}
        onChange={(v) => p && p.tipo === "cubo" && onAlterarParams({ ...p, direcaoGraus: v })} />,
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
      <ValorFixo key="fixa" testid="area-info-abertura" rotulo="Abertura" valor={`${ABERTURA_CONE_GRAUS}°`} />,
    );
  }

  if (config.tipo === "personalizada") {
    const n = p && p.tipo === "personalizada" ? p.pontos.length : pontosEmCurso;
    dimensoes.push(<ValorFixo key="v" testid="area-info-vertices" rotulo="Vértices" valor={n} />);
  }

  // Ficha da vitrine: o formato sob o mouse, senão o escolhido.
  const tipoFicha = espia ?? config.tipo;
  const ficha = META_AREA[tipoFicha];
  const temDirecao = tipoTemDirecao(config.tipo);
  const temOrigem = config.tipo !== "aura";
  const focar = (txt: string) => ({
    onMouseEnter: () => setFoco(txt), onMouseLeave: () => setFoco(null),
    onFocus: () => setFoco(txt), onBlur: () => setFoco(null),
  });
  const chaves: { id: string; nome: string; desc: string; icone: string; on: boolean; testid: string; alternar: () => void }[] = [];
  // Aura é sempre presa a um token — as opções de origem livre não fazem
  // sentido nela. Com as duas ligadas, token perto vence; sem token, cai
  // pro centro da célula; sem nenhum dos dois, o ponto livre.
  if (temOrigem) {
    chaves.push(
      { id: "celula", nome: "Centro da célula", desc: "A origem cai no centro da célula mais perto", icone: ICONE_CELULA,
        on: config.snapOrigemCelula, testid: "area-campo-snap-celula", alternar: () => onConfig({ snapOrigemCelula: !config.snapOrigemCelula }) },
      { id: "token", nome: "Token mais perto", desc: "Com as duas ligadas, o token perto vence o centro da célula", icone: ICONE_TOKEN,
        on: config.snapOrigemToken, testid: "area-campo-snap-token", alternar: () => onConfig({ snapOrigemToken: !config.snapOrigemToken }) },
    );
  }
  if (temDirecao) {
    chaves.push({ id: "direcao", nome: `Direção ${PASSO_SNAP_DIRECAO_GRAUS}°`, desc: `Trava a direção em passos de ${PASSO_SNAP_DIRECAO_GRAUS}°`, icone: ICONE_DIRECAO,
      on: config.snapDirecao, testid: "area-campo-snap", alternar: () => onConfig({ snapDirecao: !config.snapDirecao }) });
  }
  const instrucao = definindoRaioAura ? "Token escolhido. Arraste em qualquer ponto do mapa para definir o raio." : META_AREA[config.tipo].instrucao;
  const opacidadePct = Math.round(config.opacidade * 100);

  return (
    <JanelaFerramenta
      id="areas"
      largura="gestao"
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
        <div className="rv-fp-corpo jf-corpo rv-area-f" style={{ ["--jf-k" as string]: HEX_COR_AREA[config.cor] }}>
          {/* ── Vitrine: ficha do formato ── */}
          <div className="jf-hero rv-area-ficha" aria-live="polite">
            <span className="rv-area-selo" aria-hidden="true"><Icone d={ICONE_TIPO[tipoFicha]} tam={52} traco={1.3} /></span>
            <div className="rv-area-ficha-txt">
              <span className="rv-area-ficha-topo">
                <span className="rv-area-ficha-nome">{ficha.rotulo}</span>
                {ficha.tridimensional && <span className="rv-area-tag">3D</span>}
                <span className="rv-area-tag">{ROTULO_GESTO[ficha.gesto] ?? ficha.gesto}</span>
              </span>
              <p className="rv-area-ficha-desc">{ficha.descricao}</p>
            </div>
          </div>

          {/* ── Formato ── */}
          <div className="jf-tiles" style={{ ["--jf-n" as string]: 3 }} role="radiogroup" aria-label="Formato da área"
            onMouseLeave={() => setEspia(null)}>
            {TIPOS_AREA.map((t) => (
              <button key={t} type="button" className="jf-tile jf-tile--alto" data-testid={`area-tipo-${t}`}
                aria-pressed={config.tipo === t} aria-label={META_AREA[t].rotulo}
                disabled={persistindo} onClick={() => trocarTipo(t)}
                onMouseEnter={() => setEspia(t)} onFocus={() => setEspia(t)} onBlur={() => setEspia(null)}>
                <Icone d={ICONE_TIPO[t]} tam={20} traco={1.7} />
                <span>{META_AREA[t].rotulo}</span>
              </button>
            ))}
          </div>
          <p className="jf-desc" data-testid="area-instrucao">{foco ?? instrucao}</p>

          {extra}

          {/* ── Dimensões ── */}
          <div className="jf-grupo">
            <div className="jf-dims" style={{ ["--jf-n" as string]: Math.max(1, dimensoes.length) }}>{dimensoes}</div>
            {(resumo || props.resumo) && (
              <p className="jf-leg rv-area-resumos">
                {resumo && <span data-testid="area-resumo-forma">{resumo}</span>}
                {props.resumo && (
                  <span data-testid="area-resumo">
                    {props.resumo.celulas} célula{props.resumo.celulas === 1 ? "" : "s"} afetada{props.resumo.celulas === 1 ? "" : "s"} · {props.resumo.tokens} token{props.resumo.tokens === 1 ? "" : "s"} afetado{props.resumo.tokens === 1 ? "" : "s"}
                  </span>
                )}
              </p>
            )}
          </div>

          {/* ── Fixar origem (e trava de direção) ── */}
          {chaves.length > 0 && (
            <div className="jf-grupo">
              <span className="jf-rot">{temOrigem ? "Fixar origem" : "Direção"}</span>
              <div className="jf-tiles" style={{ ["--jf-n" as string]: chaves.length }}>
                {chaves.map((c) => (
                  <button key={c.id} type="button" role="checkbox" aria-checked={c.on} className="jf-tile jf-tile--chave"
                    data-testid={c.testid} onClick={c.alternar} {...focar(c.desc)}>
                    <Icone d={c.icone} /><span>{c.nome}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Quem vê: o "visível para os jogadores" ── */}
          <div className="jf-grupo">
            <span className="jf-rot" id="area-quem-ve">Quem vê</span>
            <div className="jf-tiles" role="group" aria-labelledby="area-quem-ve">
              {([false, true] as const).map((visivel) => (
                <button key={String(visivel)} type="button" className="jf-tile" aria-pressed={config.visivel === visivel}
                  data-testid={visivel ? "area-campo-visivel" : "area-campo-oculta"}
                  onClick={() => onConfig({ visivel })}
                  {...focar(visivel ? "Todos veem a área" : "Os jogadores não veem — só o narrador e quem criou")}>
                  <Icone d={visivel ? ICONE_MESA : ICONE_OCULTA} /><span>{visivel ? "Pra mesa" : "Oculta"}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Aparência (recolhível) ── */}
          <div className="rv-area-sec">
            <button type="button" className="jf-sec-cab" aria-expanded={props.aparenciaAberta} data-testid="area-secao-aparencia"
              onClick={props.onAlternarAparencia}>
              <span className="jf-l">Aparência</span>
              <span className="jf-sec-res rv-area-sec-res"><i aria-hidden="true" />{config.rotulo.trim() ? `${config.rotulo.trim()} · ` : ""}{opacidadePct}%</span>
              <Chevron />
            </button>
            {props.aparenciaAberta && (
              <div className="jf-sec-corpo">
                <input type="text" className="jf-campo" maxLength={80} data-testid="area-campo-rotulo" value={config.rotulo}
                  placeholder="Rótulo (opcional)" aria-label="Rótulo" onChange={(e) => onConfig({ rotulo: e.target.value })} />
                <div className="jf-linha">
                  <span className="jf-l">Cor</span>
                  <span className="jf-cores rv-area-cores-f" role="group" aria-label="Cor">
                    {CORES_AREA.map((c) => (
                      <button key={c} type="button" className="jf-cor" data-testid={`area-cor-${c}`} aria-label={NOME_COR_AREA[c]}
                        aria-pressed={config.cor === c} style={{ ["--jf-k" as string]: HEX_COR_AREA[c] }} onClick={() => onConfig({ cor: c })}>
                        <span />
                      </button>
                    ))}
                  </span>
                </div>
                <label className="jf-faixa rv-area-faixa" style={{ ["--jf-p" as string]: `${Math.round(((config.opacidade - 0.05) / 0.95) * 100)}%` }}>
                  <span className="jf-l">Opacidade</span>
                  <input type="range" min={0.05} max={1} step={0.05} data-testid="area-campo-opacidade" id="area-campo-opacidade"
                    value={config.opacidade} onChange={(e) => onConfig({ opacidade: Number(e.target.value) })} />
                  <output htmlFor="area-campo-opacidade"><b>{opacidadePct}%</b></output>
                </label>
              </div>
            )}
          </div>

          {props.erro && <p className="rv-area-erro-f" role="alert" data-testid="area-erro">{props.erro}</p>}

          {/* ── Ações por fase ── */}
          {emPontos && (
            <div className="rv-area-fase-acoes">
              <div className="jf-acao">
                <span className="rv-area-prim-casca">
                  <button type="button" className="jf-prim" data-testid="area-concluir"
                    disabled={!!props.motivoNaoConclui} onClick={props.onConcluirPontos}>
                    <Check size={14} /> Concluir
                  </button>
                </span>
                <button type="button" className="jf-cancelar" data-testid="area-desfazer-ponto" onClick={props.onDesfazerPonto}>
                  <Undo2 size={13} /> Desfazer ponto
                </button>
                <button type="button" className="jf-cancelar" data-testid="area-cancelar" onClick={props.onDescartar}>
                  Cancelar
                </button>
              </div>
              {props.motivoNaoConclui && <p className="jf-nota rv-area-motivo" data-testid="area-motivo">{props.motivoNaoConclui}</p>}
            </div>
          )}

          {/* Prévia: o caminho PRINCIPAL de confirmar/descartar são os
              botões ao lado da própria geometria, no mapa. Aqui fica a
              alternativa alcançável por TECLADO. */}
          {emPrevia && (
            <div className="rv-area-fase-acoes" data-testid="area-rodape-previa">
              <span className="jf-leg">Área aguardando confirmação</span>
              <div className="jf-acao">
                <span className="rv-area-prim-casca">
                  <button type="button" className="jf-prim" data-testid="area-manter" onClick={props.onManter}>
                    <Check size={14} /> Manter na mesa
                  </button>
                </span>
                <button type="button" className="jf-cancelar" data-testid="area-descartar" onClick={props.onDescartar}>
                  Descartar
                </button>
              </div>
            </div>
          )}

          {emEdicao && (
            <div className="jf-acao">
              <span className="rv-area-prim-casca">
                <button type="button" className="jf-prim" data-testid="area-salvar" onClick={props.onSalvarEdicao}>
                  <Check size={14} /> Salvar alterações
                </button>
              </span>
              <button type="button" className="jf-cancelar" data-testid="area-cancelar-edicao" onClick={props.onCancelarEdicao}>
                Cancelar
              </button>
            </div>
          )}

          {estado.fase === "erro" && (
            <div className="jf-acao">
              <span className="rv-area-prim-casca">
                <button type="button" className="jf-prim" data-testid="area-tentar-novamente" onClick={props.onManter}>
                  Tentar de novo
                </button>
              </span>
              <button type="button" className="jf-cancelar" data-testid="area-descartar" onClick={props.onDescartar}>
                Descartar
              </button>
            </div>
          )}

          {persistindo && <p className="jf-leg" aria-live="polite">Salvando…</p>}

          {/* ── Áreas na cena (recolhida por padrão) ── */}
          <div className="rv-area-sec">
            <button type="button" className="jf-sec-cab" data-testid="area-lista-toggle"
              aria-expanded={listaAberta} aria-controls="area-lista-corpo" onClick={() => setListaAberta((v) => !v)}>
              <span className="jf-l">Áreas na cena</span>
              <span className="jf-sec-res">{props.areas.length}</span>
              <Chevron />
            </button>
            {listaAberta && (
              <div className="jf-lista rv-area-lista-f" id="area-lista-corpo" data-testid="area-lista">
                {props.areas.length === 0 && <p className="jf-nota rv-area-vazio-f">Nenhuma área persistida nesta cena.</p>}
                {props.areas.map((a) => (
                  <div key={a.id} className={`jf-item rv-area-item-f${a.visivel ? "" : " is-fora"}`} data-testid={`area-item-${a.id}`}
                    data-selecionada={props.selecionadaId === a.id}>
                    <button type="button" className="rv-area-item-nome" aria-pressed={props.selecionadaId === a.id}
                      onClick={() => props.onSelecionar(props.selecionadaId === a.id ? null : a.id)}>
                      <span className="rv-area-item-glifo" style={{ color: HEX_COR_AREA[a.cor] }}><Icone d={ICONE_TIPO[a.tipo]} traco={1.7} /></span>
                      <span className="jf-item-txt">
                        <span className="jf-item-nome">
                          {a.rotulo || META_AREA[a.tipo].rotulo}
                          {a.criadaPorVoce && <span className="rv-area-autoria-f" data-testid={`area-autoria-${a.id}`}>você</span>}
                        </span>
                        <span className="jf-item-sub">{META_AREA[a.tipo].rotulo} · {a.celulas} cél · {a.tokens} tok{a.visivel ? "" : " · oculta"}</span>
                      </span>
                    </button>
                    <div className="jf-acts rv-area-item-acoes">
                      <button type="button" className="jf-mini rv-area-item-acao" aria-label="Localizar no mapa" title="Localizar no mapa"
                        data-testid={`area-localizar-${a.id}`} onClick={() => props.onLocalizar(a.id)}>
                        <Crosshair size={14} />
                      </button>
                      {a.podeEditar && (
                        <>
                          <button type="button" className="jf-mini rv-area-item-acao" aria-label="Editar área" title="Editar área"
                            data-testid={`area-editar-${a.id}`} onClick={() => props.onEditar(a.id)}>
                            <Pencil size={14} />
                          </button>
                          <button type="button" className="jf-mini rv-area-item-acao"
                            aria-label={a.visivel ? "Ocultar dos jogadores" : "Mostrar aos jogadores"}
                            title={a.visivel ? "Ocultar dos jogadores" : "Mostrar aos jogadores"}
                            data-testid={`area-visibilidade-${a.id}`} onClick={() => props.onAlternarVisibilidade(a.id)}>
                            {a.visivel ? <Eye size={14} /> : <EyeOff size={14} />}
                          </button>
                          <button type="button" className="jf-mini rv-area-item-acao" aria-label="Duplicar área" title="Duplicar área"
                            data-testid={`area-duplicar-${a.id}`} onClick={() => props.onDuplicar(a.id)}>
                            <Copy size={14} />
                          </button>
                          <button type="button" className="jf-mini is-perigo rv-area-item-acao" aria-label="Excluir área" title="Excluir área"
                            data-testid={`area-excluir-${a.id}`} onClick={() => props.onExcluir(a.id)}>
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Atalhos: Alt ou ⌘ (o código aceita os dois em qualquer
              sistema); no Mac mostramos ⌥ e ⌘, fora dele só Alt. ── */}
          <div className="jf-atalhos" data-testid="area-dica-precisao">
            <span>
              <kbd className="jf-kbd">{mac ? "⌥" : "Alt"}</kbd>
              {mac && <kbd className="jf-kbd">⌘</kbd>}
              medida fracionária
            </span>
            <span><kbd className="jf-kbd">Esc</kbd>cancela</span>
          </div>
        </div>
      )}
    </JanelaFerramenta>
  );
}
