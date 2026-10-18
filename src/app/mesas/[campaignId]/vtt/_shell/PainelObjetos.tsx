"use client";

/**
 * Painel da ferramenta OBJETOS — ancorado ao lado da barra, NUNCA modal.
 *
 * Componente PURAMENTE APRESENTACIONAL: nenhuma RPC, nenhuma regra de
 * objeto, nenhum acesso a `estadoCena`. Recebe o objeto já resolvido e
 * devolve intenções; a mecânica (revisão otimista, undo/redo, clamp de
 * PD) continua inteira em `VttClient.tsx`.
 *
 * QUATRO ESTADOS EXPLÍCITOS E MUTUAMENTE EXCLUSIVOS — a barra antiga
 * empilhava criação, seleção, movimento, edição, dano e exclusão numa
 * linha horizontal só, e nada dizia em que ponto do fluxo você estava:
 *   • "movendo"     — reposicionando um objeto que já existe;
 *   • "editando"    — formulário do objeto selecionado;
 *   • "selecionado" — identidade, PD, ações e zona destrutiva;
 *   • "criando"     — preset + seleção de células (estado inicial).
 * A ordem do `if` abaixo É a precedência: mover e editar são fluxos
 * abertos, e enquanto um deles está em andamento nada mais aparece.
 */

import { JanelaFerramenta } from "./JanelaFerramenta";
import { useCallback, useEffect, useState } from "react";
import {
  Ban, Blocks, Box, BrickWall, Car, Check, Construction, Container, DoorClosed,
  ChevronLeft, ChevronRight, Fence, Loader2, Lock, LockOpen, Minus, MousePointerClick, Move, Pencil,
  Plus, RectangleVertical, Shapes, Table, Trash2, TriangleAlert, } from "lucide-react";
import { FAIXA_PD_POR_CATEGORIA, PRESETS_OBJETO } from "../_dominio/presetsObjeto";
import {
  type CategoriaObjeto, type GrauCoberturaObjeto, type ObjetoVtt, type PresetObjeto,
} from "../../../../../lib/vtt/sceneStorage";

/** Campos editáveis — espelha o rascunho mantido por `VttClient`. */
export interface RascunhoEdicaoObjeto {
  nome: string;
  bloqueiaMovimento: boolean;
  terrenoProjetado: "dificil" | null;
  grauCobertura: GrauCoberturaObjeto | null;
  categoria: CategoriaObjeto | null;
  pd: number | null;
  pdMax: number | null;
  visivel: boolean;
  travado: boolean;
}

/** PD ajustado na vitrine de criação — `pd: null` = nasce sem PD. */
export interface AjustePdObjeto {
  categoria: CategoriaObjeto | null;
  pd: number | null;
}

/**
 * Categoria que SEGUE o número, pelas faixas oficiais
 * (`FAIXA_PD_POR_CATEGORIA`): até o teto de frágil é frágil, até o de
 * média é média, o resto é resistente. Derivar em vez de pedir as duas
 * coisas é o que impede o ajuste de criar PD fora da própria categoria.
 */
export function categoriaDoPd(pd: number | null): CategoriaObjeto | null {
  if (pd === null) return null;
  if (pd <= (FAIXA_PD_POR_CATEGORIA.fragil.max ?? 5)) return "fragil";
  if (pd <= (FAIXA_PD_POR_CATEGORIA.media.max ?? 15)) return "media";
  return "resistente";
}

export interface PropsPainelObjetos {
  presetObjeto: PresetObjeto;
  onPresetObjeto: (p: PresetObjeto) => void;
  celulasPendentes: number;
  criando: boolean;
  /**
   * Cria o objeto. `ajuste` leva o PD escolhido na vitrine ANTES de
   * criar (e a categoria que segue dele); ausente = valores do preset.
   */
  onCriar: (ajuste?: AjustePdObjeto) => void;
  onCancelarSelecao: () => void;

  objetoSelecionado: ObjetoVtt | null;
  objetoMovendo: ObjetoVtt | null;
  movendo: boolean;
  onConfirmarMover: () => void;
  onIniciarMover: () => void;
  onDesmarcar: () => void;

  rascunho: RascunhoEdicaoObjeto | null;
  onRascunho: (patch: (r: RascunhoEdicaoObjeto) => RascunhoEdicaoObjeto) => void;
  salvandoEdicao: boolean;
  onIniciarEdicao: () => void;
  onSalvarEdicao: () => void;
  onCancelarEdicao: () => void;
  onAlternarTravamento: () => void;

  deltaPd: string;
  onDeltaPd: (v: string) => void;
  aplicandoDano: boolean;
  onAplicarDano: (sinal: 1 | -1) => void;
  onVirarEntulho: () => void;

  excluindo: boolean;
  onExcluir: () => void;

  onFechar: () => void;
}

/**
 * Ícone + nome CURTO de cada preset, só pra grade de escolha.
 *
 * Apresentação pura, de propósito fora de `PRESETS_OBJETO`: aquele
 * módulo é a fonte das REGRAS (bloqueio, cobertura, PD, faixa oficial)
 * e não deve ganhar dependência de `lucide-react` nem de decisão
 * visual. O `rotulo` canônico de lá continua aparecendo inteiro no
 * cartão-resumo abaixo da grade — o nome curto aqui é só a etiqueta
 * que cabe numa célula de ~95px.
 */
const META_PRESET: Record<PresetObjeto, { Icone: typeof Box; curto: string }> = {
  muro: { Icone: BrickWall, curto: "Muro" },
  porta: { Icone: DoorClosed, curto: "Porta" },
  caixa: { Icone: Container, curto: "Caixa" },
  entulho: { Icone: Blocks, curto: "Entulho" },
  mesa: { Icone: Table, curto: "Mesa" },
  veiculo: { Icone: Car, curto: "Veículo" },
  barricada: { Icone: Construction, curto: "Barricada" },
  coluna: { Icone: RectangleVertical, curto: "Coluna" },
  grade: { Icone: Fence, curto: "Grade" },
  personalizado: { Icone: Shapes, curto: "Livre" },
};

const CHAVES_PRESET = Object.keys(PRESETS_OBJETO) as PresetObjeto[];
const NIVEL_GRAU: Record<GrauCoberturaObjeto, number> = { parcial: 1, maior: 2, total: 3 };
const NIVEL_CAT: Record<CategoriaObjeto, number> = { fragil: 1, media: 2, resistente: 3 };
const ROTULO_GRAU_CURTO: Record<GrauCoberturaObjeto, string> = { parcial: "Parcial", maior: "Maior", total: "Total" };

/** Medidor de 1–3 barras. Nunca só cor: o valor vem escrito ao lado. */
function Segs({ n }: { n: number }) {
  return (
    <span className="rv-obj-segs" aria-hidden="true">
      {[1, 2, 3].map((i) => <i key={i} className={n >= i ? "is-on" : undefined} />)}
    </span>
  );
}

const ROTULO_GRAU: Record<GrauCoberturaObjeto, string> = {
  parcial: "Cobertura parcial",
  maior: "Cobertura maior",
  total: "Cobertura total",
};
const ROTULO_CATEGORIA: Record<CategoriaObjeto, { rotulo: string; faixa: string }> = {
  fragil: { rotulo: "Frágil", faixa: "2–5 PD" },
  media: { rotulo: "Média", faixa: "6–15 PD" },
  resistente: { rotulo: "Resistente", faixa: "16+ PD" },
};

/** Barra de PD — indicador visual além do número (nunca só cor: o
 *  valor "atual/máximo" continua escrito ao lado). */
function BarraPd({ pd, pdMax }: { pd: number; pdMax: number }) {
  const frac = pdMax > 0 ? Math.max(0, Math.min(1, pd / pdMax)) : 0;
  const nivel = frac === 0 ? "baixo" : frac <= 0.25 ? "baixo" : frac <= 0.6 ? "medio" : "alto";
  return (
    <div className="rv-fp-pd">
      <div className="rv-fp-pd-topo">
        <span className="rv-fp-pd-rot">Durabilidade</span>
        <span className="rv-fp-pd-val">{pd}/{pdMax}</span>
      </div>
      <div
        className="rv-fp-pd-barra"
        role="meter" aria-valuenow={pd} aria-valuemin={0} aria-valuemax={pdMax}
        aria-label={`Pontos de durabilidade: ${pd} de ${pdMax}`}
      >
        <div className="rv-fp-pd-fill" data-nivel={nivel} style={{ width: `${frac * 100}%` }} />
      </div>
      {pd === 0 && <span className="rv-fp-pd-destruido">Destruído — 0 PD</span>}
    </div>
  );
}

function Switch({
  checked, onChange, disabled, rotulo, sub,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; rotulo: string; sub?: string }) {
  return (
    <label className="rv-fp-switch">
      <input
        type="checkbox" checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="rv-fp-switch-tr" aria-hidden="true" />
      <span className="rv-fp-switch-txt">
        <span>{rotulo}</span>
        {sub && <span className="rv-fp-switch-sub">{sub}</span>}
      </span>
    </label>
  );
}

export function PainelObjetos(p: PropsPainelObjetos) {
  const { objetoSelecionado: obj, objetoMovendo, rascunho } = p;
  // Confirmação de exclusão vive AQUI (estado local de apresentação),
  // não em `VttClient`: é UI pura, some sozinha ao trocar de objeto, e
  // não precisa existir no fluxo de dados da cena.
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  useEffect(() => { setConfirmandoExclusao(false); }, [obj?.id]);
  // Prévia por hover na faixa de ícones: mostra a ficha SEM escolher.
  const [espia, setEspia] = useState<PresetObjeto | null>(null);
  // PD ajustado POR PRESET antes de criar. Só guarda o que difere do
  // padrão — voltar ao número do preset apaga a entrada.
  const [pdAjustado, setPdAjustado] = useState<Partial<Record<PresetObjeto, number | null>>>({});

  const estado: "movendo" | "editando" | "selecionado" | "criando" =
    objetoMovendo ? "movendo" : obj && rascunho ? "editando" : obj ? "selecionado" : "criando";

  const modoTexto = {
    movendo: "Movendo objeto",
    editando: "Editando objeto",
    selecionado: "Objeto selecionado",
    criando: "Criar objeto",
  }[estado];

  // Erro de validação de PD — mostrado JUNTO do campo, não numa faixa
  // solta no rodapé. Só avisa; quem recusa de verdade é o servidor.
  const faixaCategoria = rascunho?.categoria ? ROTULO_CATEGORIA[rascunho.categoria].faixa : null;
  const pdForaDaFaixa = (() => {
    if (!rascunho?.categoria || rascunho.pdMax === null) return false;
    const limites: Record<CategoriaObjeto, [number, number]> = {
      fragil: [2, 5], media: [6, 15], resistente: [16, Number.POSITIVE_INFINITY],
    };
    const [min, max] = limites[rascunho.categoria];
    return rascunho.pdMax < min || rascunho.pdMax > max;
  })();

  // ── Vitrine de criação ──
  const idxSel = CHAVES_PRESET.indexOf(p.presetObjeto);
  const espiando = espia !== null && espia !== p.presetObjeto;
  const presetMostrado = espiando ? espia! : p.presetObjeto;
  const defMostrado = PRESETS_OBJETO[presetMostrado];
  const MetaMostrada = META_PRESET[presetMostrado];
  const pdDe = (k: PresetObjeto) => (k in pdAjustado ? pdAjustado[k]! : PRESETS_OBJETO[k].pd) ?? null;
  const pdMostrado = pdDe(presetMostrado);
  // Sem ajuste, a categoria é a do preset (fonte das regras); com
  // ajuste, ela segue o número pelas faixas oficiais.
  const catDe = (k: PresetObjeto) => (k in pdAjustado ? categoriaDoPd(pdDe(k)) : PRESETS_OBJETO[k].categoria);
  const catMostrada = catDe(presetMostrado);
  const ajustarPd = (v: number | null) => setPdAjustado((o) => {
    const n = { ...o };
    if (v === PRESETS_OBJETO[presetMostrado].pd) delete n[presetMostrado]; else n[presetMostrado] = v;
    return n;
  });
  const criar = useCallback(() => {
    if (p.celulasPendentes === 0 || p.criando) return;
    const k = p.presetObjeto;
    p.onCriar(k in pdAjustado ? { pd: pdDe(k), categoria: catDe(k) } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.celulasPendentes, p.criando, p.presetObjeto, p.onCriar, pdAjustado]);

  // ↵ cria — só quando o foco não está num campo nem num botão (ali o
  // Enter já tem dono). É o fluxo de marcar células no mapa e confirmar.
  useEffect(() => {
    if (estado !== "criando") return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== "Enter" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.closest("input, textarea, select, button, a, [contenteditable='true']"))) return;
      e.preventDefault();
      criar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [estado, criar]);

  return (
    <JanelaFerramenta
      id="objetos"
      icone={<Box size={16} />}
      titulo="Objetos"
      modo={estado === "criando" && p.celulasPendentes > 0 ? `${p.celulasPendentes} célula${p.celulasPendentes === 1 ? "" : "s"}` : modoTexto}
      rotulo="Ferramenta Objetos"
      rotuloFechar="Fechar ferramenta Objetos"
      aoFechar={p.onFechar}
    >

      <div className="rv-fp-corpo jf-corpo rv-obj-corpo">
        {/* ── MOVENDO ────────────────────────────────────────────── */}
        {estado === "movendo" && objetoMovendo && (
          <>
            <div className="rv-fp-obj">
              <span className="rv-fp-obj-nome">{objetoMovendo.nome}</span>
              <div className="rv-fp-obj-props">
                <span className="rv-fp-tag rv-fp-tag--cy">Reposicionando</span>
                <span className="rv-fp-tag">{objetoMovendo.celulas.length} célula{objetoMovendo.celulas.length === 1 ? "" : "s"} originais</span>
              </div>
            </div>
            <p className="rv-fp-instrucao">
              <MousePointerClick size={13} />
              <span>Clique ou arraste as células do novo local. O objeto fica esmaecido na posição antiga até você confirmar.</span>
            </p>
            <p
              className={`rv-fp-status${p.celulasPendentes === 0 ? " rv-fp-status--neutro" : ""}`}
              role="status" aria-live="polite"
            >
              {p.celulasPendentes > 0
                ? <><strong>{p.celulasPendentes}</strong>&nbsp;célula{p.celulasPendentes === 1 ? "" : "s"} no novo local</>
                : "Nenhuma célula escolhida ainda"}
            </p>
          </>
        )}

        {/* ── EDITANDO ───────────────────────────────────────────── */}
        {estado === "editando" && obj && rascunho && (
          <>
            <div className="rv-fp-form">
              <label className="rv-fp-campo">
                <span>Nome</span>
                <input
                  type="text" value={rascunho.nome} disabled={p.salvandoEdicao}
                  onChange={(e) => p.onRascunho((r) => ({ ...r, nome: e.target.value }))}
                />
              </label>

              <div className="rv-fp-grupo jf-grupo">
                <span className="rv-fp-rotulo jf-rot">Movimento</span>
                <Switch
                  checked={rascunho.bloqueiaMovimento} disabled={p.salvandoEdicao}
                  onChange={(v) => p.onRascunho((r) => ({ ...r, bloqueiaMovimento: v }))}
                  rotulo="Bloqueia movimento" sub="Impede atravessar as células do objeto"
                />
                <Switch
                  checked={rascunho.terrenoProjetado === "dificil"} disabled={p.salvandoEdicao}
                  onChange={(v) => p.onRascunho((r) => ({ ...r, terrenoProjetado: v ? "dificil" : null }))}
                  rotulo="Terreno difícil" sub="Atravessa, mas cada passo custa ×2"
                />
              </div>

              <div className="rv-fp-grupo jf-grupo">
                <span className="rv-fp-rotulo jf-rot">Cobertura</span>
                <label className="rv-fp-campo">
                  <span>Grau</span>
                  <select
                    value={rascunho.grauCobertura ?? ""} disabled={p.salvandoEdicao}
                    onChange={(e) => p.onRascunho((r) => ({ ...r, grauCobertura: (e.target.value || null) as GrauCoberturaObjeto | null }))}
                  >
                    <option value="">Sem cobertura</option>
                    <option value="parcial">Cobertura parcial (–1)</option>
                    <option value="maior">Cobertura maior (–2)</option>
                    <option value="total">Cobertura total (inalvejável)</option>
                  </select>
                </label>
              </div>

              <div className="rv-fp-grupo jf-grupo">
                <span className="rv-fp-rotulo jf-rot">Durabilidade</span>
                <label className="rv-fp-campo">
                  <span>Categoria</span>
                  <select
                    value={rascunho.categoria ?? ""} disabled={p.salvandoEdicao}
                    onChange={(e) => p.onRascunho((r) => {
                      const categoria = (e.target.value || null) as CategoriaObjeto | null;
                      // Sem categoria não há PD — limpa junto, senão o PD
                      // fica órfão (persistido, sem campo pra editar).
                      return { ...r, categoria, ...(categoria === null ? { pd: null, pdMax: null } : {}) };
                    })}
                  >
                    <option value="">Sem PD</option>
                    <option value="fragil">Frágil (2–5 PD)</option>
                    <option value="media">Média (6–15 PD)</option>
                    <option value="resistente">Resistente (16+ PD)</option>
                  </select>
                </label>
                {rascunho.categoria && (
                  <>
                    <div className="rv-fp-par">
                      <label className="rv-fp-campo">
                        <span>PD atual</span>
                        <input
                          type="number" min={0} value={rascunho.pd ?? ""} disabled={p.salvandoEdicao}
                          onChange={(e) => p.onRascunho((r) => ({ ...r, pd: e.target.value === "" ? null : Number(e.target.value) }))}
                        />
                      </label>
                      <span className="rv-fp-par-sep" aria-hidden="true">/</span>
                      <label className={`rv-fp-campo${pdForaDaFaixa ? " rv-fp-campo--erro" : ""}`}>
                        <span>PD máximo</span>
                        <input
                          type="number" min={0} value={rascunho.pdMax ?? ""} disabled={p.salvandoEdicao}
                          aria-invalid={pdForaDaFaixa || undefined}
                          onChange={(e) => p.onRascunho((r) => ({ ...r, pdMax: e.target.value === "" ? null : Number(e.target.value) }))}
                        />
                      </label>
                    </div>
                    {pdForaDaFaixa && faixaCategoria && (
                      <span className="rv-fp-campo-erro" role="status">
                        Fora da faixa oficial da categoria ({faixaCategoria}).
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className="rv-fp-grupo jf-grupo">
                <span className="rv-fp-rotulo jf-rot">Visibilidade</span>
                <Switch
                  checked={rascunho.visivel} disabled={p.salvandoEdicao}
                  onChange={(v) => p.onRascunho((r) => ({ ...r, visivel: v }))}
                  rotulo="Visível para jogadores" sub="Oculto continua bloqueando no servidor"
                />
              </div>
            </div>

          </>
        )}

        {/* ── SELECIONADO ────────────────────────────────────────── */}
        {estado === "selecionado" && obj && (
          <>
            <div className="rv-fp-obj">
              <span className="rv-fp-obj-nome">{obj.nome}</span>
              <div className="rv-fp-obj-props">
                {obj.bloqueiaMovimento
                  ? <span className="rv-fp-tag rv-fp-tag--dg">Bloqueia</span>
                  : <span className="rv-fp-tag">Atravessável</span>}
                {obj.terrenoProjetado === "dificil" && <span className="rv-fp-tag rv-fp-tag--am">Terreno difícil</span>}
                {obj.grauCobertura && <span className="rv-fp-tag rv-fp-tag--cy">{ROTULO_GRAU[obj.grauCobertura]}</span>}
                {obj.categoria && <span className="rv-fp-tag">{ROTULO_CATEGORIA[obj.categoria].rotulo}</span>}
                {!obj.visivel && <span className="rv-fp-tag rv-fp-tag--am">Oculto</span>}
                {obj.travado && <span className="rv-fp-tag rv-fp-tag--am">Travado</span>}
                <span className="rv-fp-tag">{obj.celulas.length} célula{obj.celulas.length === 1 ? "" : "s"}</span>
              </div>
              {obj.pd !== null && obj.pdMax !== null && <BarraPd pd={obj.pd} pdMax={obj.pdMax} />}
            </div>

            {obj.categoria !== null && obj.pd !== null && (
              <div className="rv-fp-grupo jf-grupo">
                <span className="rv-fp-rotulo jf-rot" id="rv-fp-rot-pd">Dano e reparo</span>
                <div className="rv-fp-dano" role="group" aria-labelledby="rv-fp-rot-pd">
                  <input
                    type="number" min={0} value={p.deltaPd} disabled={p.aplicandoDano}
                    onChange={(e) => p.onDeltaPd(e.target.value)}
                    placeholder="qtd" aria-label="Quantidade de dano ou reparo"
                  />
                  <button
                    type="button" className="rv-btn"
                    disabled={p.aplicandoDano || !p.deltaPd} onClick={() => p.onAplicarDano(-1)}
                  >
                    {p.aplicandoDano ? <Loader2 size={13} className="rv-spin" /> : null} Dano
                  </button>
                  <button
                    type="button" className="rv-btn"
                    disabled={p.aplicandoDano || !p.deltaPd} onClick={() => p.onAplicarDano(1)}
                  >
                    Reparar
                  </button>
                </div>
                {obj.pd === 0 && (
                  <button type="button" className="rv-btn" disabled={p.salvandoEdicao} onClick={p.onVirarEntulho}>
                    {p.salvandoEdicao ? <Loader2 size={13} className="rv-spin" /> : <TriangleAlert size={13} />}
                    Virar entulho
                  </button>
                )}
              </div>
            )}

            <div className="rv-fp-grupo jf-grupo">
              <span className="rv-fp-rotulo jf-rot" id="rv-fp-rot-acoes">Ações</span>
              <div className="rv-fp-grade-acoes" role="group" aria-labelledby="rv-fp-rot-acoes">
                <button type="button" className="rv-btn" disabled={p.salvandoEdicao} onClick={p.onIniciarMover}>
                  <Move size={14} /> Mover
                </button>
                <button type="button" className="rv-btn" disabled={p.salvandoEdicao} onClick={p.onIniciarEdicao}>
                  <Pencil size={14} /> Editar
                </button>
                <button type="button" className="rv-btn" disabled={p.salvandoEdicao} onClick={p.onAlternarTravamento}>
                  {p.salvandoEdicao
                    ? <Loader2 size={14} className="rv-spin" />
                    : obj.travado ? <LockOpen size={14} /> : <Lock size={14} />}
                  {obj.travado ? "Destravar" : "Travar"}
                </button>
              </div>
            </div>

            {/* Zona destrutiva — separada por borda, cor própria e com
                confirmação em dois passos (a exclusão é DURA no
                servidor: não há undo pra ela). */}
            <div className="rv-fp-perigo">
              {confirmandoExclusao ? (
                <div className="rv-fp-confirmar" role="alertdialog" aria-label={`Confirmar exclusão de ${obj.nome}`}>
                  <p>Excluir <strong>{obj.nome}</strong>? Esta ação não entra no desfazer.</p>
                  <div className="rv-fp-confirmar-acoes">
                    <button
                      type="button" className="rv-btn rv-btn--perigo" disabled={p.excluindo}
                      onClick={() => { setConfirmandoExclusao(false); p.onExcluir(); }}
                    >
                      {p.excluindo ? <Loader2 size={13} className="rv-spin" /> : <Trash2 size={13} />} Excluir
                    </button>
                    <button type="button" className="rv-btn rv-btn--ghost" disabled={p.excluindo} onClick={() => setConfirmandoExclusao(false)}>
                      Manter
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button" className="rv-btn rv-btn--perigo rv-fp-primaria"
                  disabled={p.excluindo || obj.travado}
                  title={obj.travado ? "Destrave o objeto antes de excluir" : undefined}
                  onClick={() => setConfirmandoExclusao(true)}
                >
                  <Trash2 size={14} /> Excluir objeto
                </button>
              )}
              {obj.travado && !confirmandoExclusao && (
                <span className="rv-fp-switch-sub">Objeto travado — destrave para mover ou excluir.</span>
              )}
            </div>

            <button type="button" className="rv-fp-discreta jf-quieto" onClick={p.onDesmarcar}>Desmarcar</button>
          </>
        )}

        {/* ── CRIANDO — o "Seletor" ──────────────────────────────────
            Um preset por vez na vitrine (◀ ▶ como seletor de console),
            medidores de regra em barras de 1–3, e a faixa dos 10 ícones
            pra pular direto. Passar o mouse num ícone só ESPIA. */}
        {estado === "criando" && (
          <>
            <div className="jf-hero rv-obj-vitrine" aria-live="polite">
              <div className="rv-obj-sel">
                <button type="button" className="rv-obj-seta" aria-label="Preset anterior" disabled={p.criando}
                  onClick={() => p.onPresetObjeto(CHAVES_PRESET[(idxSel - 1 + CHAVES_PRESET.length) % CHAVES_PRESET.length])}>
                  <ChevronLeft size={16} />
                </button>
                <span className="rv-obj-peca">
                  <MetaMostrada.Icone size={56} strokeWidth={1.2} aria-hidden="true" />
                  <b>{defMostrado.rotulo}</b>
                  <span className="jf-leg">{espiando ? "Prévia · clique pra escolher" : `${idxSel + 1} / ${CHAVES_PRESET.length}`}</span>
                </span>
                <button type="button" className="rv-obj-seta" aria-label="Próximo preset" disabled={p.criando}
                  onClick={() => p.onPresetObjeto(CHAVES_PRESET[(idxSel + 1) % CHAVES_PRESET.length])}>
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="rv-obj-medidores">
                <div className="rv-obj-med" style={{ ["--jf-t" as string]: defMostrado.bloqueiaMovimento ? "#ff5f74" : "#f5a200" }}>
                  <span className="jf-l">Movimento</span>
                  <Segs n={defMostrado.bloqueiaMovimento ? 3 : defMostrado.terrenoProjetado === "dificil" ? 1 : 0} />
                  <span className="rv-obj-v">{defMostrado.bloqueiaMovimento ? "Bloqueia" : defMostrado.terrenoProjetado === "dificil" ? "Custa ×2" : "Livre"}</span>
                </div>
                <div className="rv-obj-med" style={{ ["--jf-t" as string]: "#00d4ff" }}>
                  <span className="jf-l">Cobertura</span>
                  <Segs n={defMostrado.grauCobertura ? NIVEL_GRAU[defMostrado.grauCobertura] : 0} />
                  <span className={`rv-obj-v${defMostrado.grauCobertura ? "" : " is-vazio"}`}>
                    {defMostrado.grauCobertura ? ROTULO_GRAU_CURTO[defMostrado.grauCobertura] : "Depois"}
                  </span>
                </div>
                <div className="rv-obj-med" style={{ ["--jf-t" as string]: "#8ea0bd" }}>
                  <span className="jf-l">Durabilidade</span>
                  <Segs n={catMostrada ? NIVEL_CAT[catMostrada] : 0} />
                  <span className="rv-obj-pdctl">
                    <button type="button" aria-label="Diminuir PD" disabled={p.criando || pdMostrado === null}
                      onClick={() => ajustarPd(pdMostrado === null || pdMostrado <= 1 ? null : pdMostrado - 1)}>
                      <Minus size={10} strokeWidth={3} />
                    </button>
                    <span className={`rv-obj-v${catMostrada ? "" : " is-vazio"}`} data-testid="objeto-pd-ajuste">
                      {pdMostrado !== null && <b>{pdMostrado}</b>}
                      {catMostrada ? `PD · ${ROTULO_CATEGORIA[catMostrada].rotulo}` : "Sem PD"}
                    </span>
                    <button type="button" aria-label="Aumentar PD" disabled={p.criando || (pdMostrado ?? 0) >= 99}
                      onClick={() => ajustarPd(pdMostrado === null ? 1 : Math.min(99, pdMostrado + 1))}>
                      <Plus size={10} strokeWidth={3} />
                    </button>
                  </span>
                </div>
              </div>
            </div>

            <div className="rv-obj-icones" role="group" aria-label="Preset" onMouseLeave={() => setEspia(null)}>
              {CHAVES_PRESET.map((k) => {
                const meta = META_PRESET[k];
                return (
                  <button
                    key={k}
                    type="button" className="rv-obj-ic"
                    aria-pressed={p.presetObjeto === k}
                    disabled={p.criando}
                    // O nome curto pode abreviar ("Caixa"), então o rótulo
                    // acessível carrega o nome COMPLETO do preset.
                    aria-label={PRESETS_OBJETO[k].rotulo} title={PRESETS_OBJETO[k].rotulo}
                    onMouseEnter={() => setEspia(k)} onFocus={() => setEspia(k)} onBlur={() => setEspia(null)}
                    onClick={() => { setEspia(null); p.onPresetObjeto(k); }}
                  >
                    <meta.Icone size={17} strokeWidth={1.7} />
                  </button>
                );
              })}
            </div>

            {/* A nota do preset — o porquê dos padrões — continua aqui. */}
            <p className="jf-desc">{defMostrado.nota}</p>

            <p className="rv-obj-status" role="status" aria-live="polite">
              {p.celulasPendentes > 0
                ? <><strong>{p.celulasPendentes}</strong>&nbsp;célula{p.celulasPendentes === 1 ? "" : "s"} selecionada{p.celulasPendentes === 1 ? "" : "s"}{p.celulasPendentes >= 64 ? " — limite atingido" : ""}</>
                : "Nenhuma célula selecionada"}
            </p>
          </>
        )}
      </div>

      {/* Rodapé fixo — a ação primária do estado corrente, sempre
          visível mesmo com o corpo rolado. "Selecionado" não tem CTA
          primária (suas ações são a grade + a zona destrutiva, que
          vivem no corpo por serem várias e de peso diferente). */}
      {estado !== "selecionado" && (
        <div className="rv-fp-rodape">
          {estado === "movendo" && (
            <>
              <button
                type="button" className="rv-btn rv-btn--pri rv-fp-primaria"
                disabled={p.celulasPendentes === 0 || p.movendo}
                onClick={p.onConfirmarMover}
              >
                {p.movendo ? <Loader2 size={14} className="rv-spin" /> : <Check size={14} />}
                Confirmar novo local
              </button>
              <button type="button" className="rv-btn rv-btn--ghost rv-fp-primaria" disabled={p.movendo} onClick={p.onCancelarSelecao}>
                <Ban size={14} /> Cancelar movimento
              </button>
            </>
          )}
          {estado === "editando" && (
            <>
              <button
                type="button" className="rv-btn rv-btn--pri rv-fp-primaria"
                disabled={p.salvandoEdicao} onClick={p.onSalvarEdicao}
              >
                {p.salvandoEdicao ? <Loader2 size={14} className="rv-spin" /> : <Check size={14} />}
                Salvar alterações
              </button>
              <button type="button" className="rv-btn rv-btn--ghost rv-fp-primaria" disabled={p.salvandoEdicao} onClick={p.onCancelarEdicao}>
                <Ban size={14} /> Cancelar
              </button>
            </>
          )}
          {estado === "criando" && (
            <>
              <div className="jf-acao rv-obj-acao">
                <button
                  type="button" className="jf-prim"
                  disabled={p.celulasPendentes === 0 || p.criando}
                  onClick={criar}
                >
                  {p.criando && <Loader2 size={14} className="rv-spin" />}
                  <span>{p.celulasPendentes > 0 ? `Criar ${META_PRESET[p.presetObjeto].curto.toLowerCase()}` : "Marque as células no mapa"}</span>
                  {p.celulasPendentes > 0 && !p.criando && <kbd className="jf-kbd">↵</kbd>}
                </button>
              </div>
              <p className="jf-nota">
                {p.celulasPendentes > 0 ? "Clicar de novo numa célula tira ela da seleção" : "Clicar num objeto do mapa seleciona ele"}
              </p>
              {/* Secundária, não primária: descartar a seleção é o oposto
                  da ação da janela. */}
              {p.celulasPendentes > 0 && (
                <button type="button" className="jf-quieto is-perigo rv-obj-limpar" disabled={p.criando} onClick={p.onCancelarSelecao}>
                  <Ban size={14} /> Limpar seleção
                </button>
              )}
            </>
          )}
        </div>
      )}
    </JanelaFerramenta>
  );
}
