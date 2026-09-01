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
import { useEffect, useState } from "react";
import {
  Ban, Blocks, Box, BrickWall, Car, Check, Construction, Container, DoorClosed,
  Fence, Loader2, Lock, LockOpen, MousePointerClick, Move, Pencil,
  RectangleVertical, Shapes, Table, Trash2, TriangleAlert, } from "lucide-react";
import { PRESETS_OBJETO } from "../_dominio/presetsObjeto";
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

export interface PropsPainelObjetos {
  presetObjeto: PresetObjeto;
  onPresetObjeto: (p: PresetObjeto) => void;
  celulasPendentes: number;
  criando: boolean;
  onCriar: () => void;
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
  personalizado: { Icone: Shapes, curto: "Personalizado" },
};

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

  return (
    <JanelaFerramenta
      id="objetos"
      icone={<Box size={16} />}
      titulo="Objetos"
      modo={modoTexto}
      rotulo="Ferramenta Objetos"
      rotuloFechar="Fechar ferramenta Objetos"
      aoFechar={p.onFechar}
    >

      <div className="rv-fp-corpo">
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

              <div className="rv-fp-grupo">
                <span className="rv-fp-rotulo">Movimento</span>
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

              <div className="rv-fp-grupo">
                <span className="rv-fp-rotulo">Cobertura</span>
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

              <div className="rv-fp-grupo">
                <span className="rv-fp-rotulo">Durabilidade</span>
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

              <div className="rv-fp-grupo">
                <span className="rv-fp-rotulo">Visibilidade</span>
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
              <div className="rv-fp-grupo">
                <span className="rv-fp-rotulo" id="rv-fp-rot-pd">Dano e reparo</span>
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

            <div className="rv-fp-grupo">
              <span className="rv-fp-rotulo" id="rv-fp-rot-acoes">Ações</span>
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

            <button type="button" className="rv-fp-discreta" onClick={p.onDesmarcar}>Desmarcar</button>
          </>
        )}

        {/* ── CRIANDO ────────────────────────────────────────────── */}
        {estado === "criando" && (
          <>
            <div className="rv-fp-grupo">
              <span className="rv-fp-rotulo" id="rv-fp-rot-preset">Preset</span>
              <div className="rv-fp-presets" role="group" aria-labelledby="rv-fp-rot-preset">
                {(Object.keys(PRESETS_OBJETO) as PresetObjeto[]).map((k) => {
                  const meta = META_PRESET[k];
                  return (
                    <button
                      key={k}
                      type="button" className="rv-fp-preset"
                      aria-pressed={p.presetObjeto === k}
                      disabled={p.criando}
                      // O nome curto da grade pode abreviar ("Caixa"), então
                      // o rótulo acessível carrega o nome COMPLETO do preset.
                      aria-label={PRESETS_OBJETO[k].rotulo}
                      onClick={() => p.onPresetObjeto(k)}
                    >
                      <span className="rv-fp-preset-ic"><meta.Icone size={16} /></span>
                      <span className="rv-fp-preset-nome">{meta.curto}</span>
                    </button>
                  );
                })}
              </div>
              <div className="rv-fp-obj">
                <span className="rv-fp-obj-nome">{PRESETS_OBJETO[p.presetObjeto].rotulo}</span>
                <div className="rv-fp-obj-props">
                  {PRESETS_OBJETO[p.presetObjeto].bloqueiaMovimento
                    ? <span className="rv-fp-tag rv-fp-tag--dg">Bloqueia</span>
                    : <span className="rv-fp-tag">Atravessável</span>}
                  {PRESETS_OBJETO[p.presetObjeto].terrenoProjetado === "dificil" && (
                    <span className="rv-fp-tag rv-fp-tag--am">Terreno difícil</span>
                  )}
                  {PRESETS_OBJETO[p.presetObjeto].grauCobertura && (
                    <span className="rv-fp-tag rv-fp-tag--cy">{ROTULO_GRAU[PRESETS_OBJETO[p.presetObjeto].grauCobertura!]}</span>
                  )}
                  {PRESETS_OBJETO[p.presetObjeto].pd !== null && (
                    <span className="rv-fp-tag">{PRESETS_OBJETO[p.presetObjeto].pd} PD</span>
                  )}
                </div>
                <span className="rv-fp-switch-sub">{PRESETS_OBJETO[p.presetObjeto].nota}</span>
              </div>
            </div>

            <p className="rv-fp-instrucao">
              <MousePointerClick size={13} />
              <span>Clique ou arraste as células no mapa. Clicar de novo tira a célula da seleção; clicar num objeto existente seleciona ele.</span>
            </p>

            <p
              className={`rv-fp-status${p.celulasPendentes === 0 ? " rv-fp-status--neutro" : ""}`}
              role="status" aria-live="polite"
            >
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
              <button
                type="button" className="rv-btn rv-btn--pri rv-fp-primaria"
                disabled={p.celulasPendentes === 0 || p.criando}
                onClick={p.onCriar}
              >
                {p.criando ? <Loader2 size={14} className="rv-spin" /> : <Box size={14} />}
                Criar objeto
              </button>
              {p.celulasPendentes > 0 && (
                <button type="button" className="rv-btn rv-btn--ghost rv-fp-primaria" disabled={p.criando} onClick={p.onCancelarSelecao}>
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
