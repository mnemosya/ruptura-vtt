"use client";

/**
 * Modais auxiliares do Console. Todos são PLACEHOLDERS FUNCIONAIS: a
 * interface definitiva de cada um está fora deste escopo, mas nenhum
 * inventa dado — todos operam sobre o conteúdo real e chamam o fluxo
 * existente. Podem ser trocados sem alterar a lógica que os alimenta.
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Check, TriangleAlert, X } from "lucide-react";
import { Plus as ConsolePlus } from "../../../_design/icons";
import type { RupturaRollResult } from "../../../../lib/dice/types";
import {
  ACCENTS, BODY, DISPLAY, DadosRolados, FaixaResultado, GroupLabel, INK, INK_FAINT, Leitura, MONO,
  MolduraRolagem, RESULTS, Stack, type ResultKey,
} from "../../../mesas/[campaignId]/vtt/_dados3d/ResultadoRolagem";
import type { InventoryItemInstance, ItemContent } from "../../../../lib/character";
import { BODY_SLOT_LABELS, itensCompativeisComSlot, type BodySlotId } from "../slots";
import { useCentroDoConsole } from "../useCentroDoConsole";
import type { ConsoleApi } from "../types";

function Aux({
  titulo,
  onFechar,
  cabecalho,
  plano,
  children,
}: {
  titulo: string;
  onFechar: () => void;
  /** Substitui o `<h2>` por uma faixa própria — ver a janela da arma. */
  cabecalho?: ReactNode;
  /** Sem recuo interno: quem desenha as seções é o conteúdo. */
  plano?: boolean;
  children: ReactNode;
}) {
  const centro = useCentroDoConsole();
  return (
    <div
      className="rc-aux-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div
        className="rc-aux"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        data-plano={plano ? "true" : undefined}
        style={centro ? { position: "absolute", left: centro.x, top: centro.y, transform: "translate(-50%, -50%)" } : undefined}
      >
        {cabecalho ?? <h2>{titulo}</h2>}
        {children}
      </div>
    </div>
  );
}

/**
 * Casca dos seletores definitivos do Console. Diferente de `Aux`, que
 * ainda atende vários placeholders, esta peça replica a anatomia dos
 * cards do personagem: título mono, faixa de identificação, conteúdo
 * rente às bordas e rodapé fixo.
 */
export function ConsolePicker({
  titulo,
  id,
  modulo,
  tamanho = "normal",
  onFechar,
  children,
  rodape,
  modal = true,
  testId,
  arrastavel = false,
}: {
  titulo: string;
  id: string;
  modulo: string;
  tamanho?: "normal" | "largo";
  onFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
  modal?: boolean;
  testId?: string;
  /** Opt-in: mantém os seletores existentes parados; ações do token podem ser movidas para liberar o mapa. */
  arrastavel?: boolean;
}) {
  const tituloId = useId();
  const centro = useCentroDoConsole();
  const janelaRef = useRef<HTMLElement>(null);
  const gestoRef = useRef<{ x: number; y: number } | null>(null);
  const [deslocamento, setDeslocamento] = useState({ x: 0, y: 0 });

  function iniciarArrasto(event: React.PointerEvent<HTMLElement>) {
    if (!arrastavel || (event.target as Element).closest("button, a, input, select, textarea")) return;
    gestoRef.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moverArrasto(event: React.PointerEvent<HTMLElement>) {
    const gesto = gestoRef.current;
    const janela = janelaRef.current;
    if (!gesto || !janela) return;
    const dx = event.clientX - gesto.x, dy = event.clientY - gesto.y;
    const caixa = janela.getBoundingClientRect();
    const margem = 8;
    const ajustadoX = Math.max(margem - caixa.left, Math.min(dx, window.innerWidth - margem - caixa.right));
    const ajustadoY = Math.max(margem - caixa.top, Math.min(dy, window.innerHeight - margem - caixa.bottom));
    setDeslocamento(p => ({ x: p.x + ajustadoX, y: p.y + ajustadoY }));
    gestoRef.current = { x: event.clientX, y: event.clientY };
  }
  function terminarArrasto(event: React.PointerEvent<HTMLElement>) {
    if (!gestoRef.current) return;
    gestoRef.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  useEffect(() => {
    function fecharComEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onFechar();
    }
    window.addEventListener("keydown", fecharComEscape, true);
    return () => window.removeEventListener("keydown", fecharComEscape, true);
  }, [onFechar]);

  return (
    <div
      className="rc-picker-backdrop rc-cursor-scope"
      data-nao-modal={!modal || undefined}
      onMouseDown={(event) => {
        if (modal && event.target === event.currentTarget) onFechar();
      }}
    >
      <section
        ref={janelaRef}
        className="rc-picker"
        data-testid={testId}
        data-tamanho={tamanho}
        role="dialog"
        aria-modal={modal}
        aria-labelledby={tituloId}
        style={centro || arrastavel ? {
          position: "absolute",
          left: centro?.x ?? window.innerWidth / 2,
          top: centro?.y ?? window.innerHeight / 2,
          transform: `translate(calc(-50% + ${deslocamento.x}px), calc(-50% + ${deslocamento.y}px))`,
        } : undefined}
      >
        <header className="rc-picker-cab" data-arrastavel={arrastavel || undefined}
          onPointerDown={iniciarArrasto} onPointerMove={moverArrasto}
          onPointerUp={terminarArrasto} onPointerCancel={terminarArrasto}>
          <h2 id={tituloId}>{titulo}</h2>
          <button type="button" className="rc-picker-fechar" onClick={onFechar} aria-label={`Fechar ${titulo.toLowerCase()}`}>
            <X size={15} aria-hidden="true" />
          </button>
        </header>
        <div className="rc-picker-modulo" aria-hidden="true">
          <span>{id}</span>
          <span>{modulo}</span>
        </div>
        <div className="rc-picker-corpo">{children}</div>
        {rodape !== undefined && <footer className="rc-picker-rodape">{rodape}</footer>}
      </section>
    </div>
  );
}

function PickerOption({
  indice,
  nome,
  selecionado,
  atalho,
  mostrarMarca = true,
  onClick,
}: {
  indice: number;
  nome: string;
  selecionado: boolean;
  atalho?: string;
  mostrarMarca?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rc-picker-opcao"
      aria-pressed={selecionado}
      aria-keyshortcuts={atalho}
      onClick={onClick}
    >
      <span className="rc-picker-indice" data-atalho={atalho ? "true" : undefined} aria-hidden="true">
        {atalho ?? String(indice + 1).padStart(2, "0")}
      </span>
      <span className="rc-picker-nome">{nome}</span>
      {mostrarMarca && (
        <span className="rc-picker-marca" aria-hidden="true">
          {selecionado ? <Check size={14} /> : <ConsolePlus size={14} strokeWidth={1.6} />}
        </span>
      )}
    </button>
  );
}

/**
 * RESULTADO DE ROLAGEM — a ferramenta "Rolar Dados", em versão de
 * leitura.
 *
 * Antes era uma lista de números em texto corrido. Agora é o MESMO
 * corpo da ferramenta flutuante do VTT (`_dados3d/RoladorDados`), pelas
 * mesmas peças (`_dados3d/ResultadoRolagem`): a fileira de d8 com o
 * maior aceso e a faixa de resultado com a classificação de margem.
 * Vale pra TODA rolagem do Console — atributo, perícia e as quatro
 * defesas passam por aqui.
 *
 * O que da ferramenta NÃO veio junto, e por quê:
 *
 *  · "Rolando como" — a ferramenta pergunta por qual personagem rolar
 *    porque quem a abre pode controlar vários. O Console JÁ É um
 *    personagem: a identidade não é escolha, é o contexto.
 *  · Abas "Atributo & Perícia" / "Livre" — o que vai ser rolado foi
 *    decidido pelo clique que abriu isto. Uma bandeja livre aqui seria
 *    uma segunda rolagem, não a leitura desta.
 *  · Os dois `Select` (atributo, perícia) e o `Stepper` de
 *    modificadores viram LEITURA. A rolagem já aconteceu — com
 *    talentos, condições e a penalidade de Reação já aplicados por
 *    `rollPericia`/`applyConsoleMutation`. Um controle editável aqui
 *    prometeria refazer a conta e não refaria.
 *  · "Definir CD" — mesma razão; a CD aparece na faixa quando a
 *    rolagem teve uma, e vira "sem CD definida" quando não teve.
 *  · Seletor de visibilidade (Mesa/Privada/Narrador) — a rolagem do
 *    Console é publicada como `public`, com origem "Console do
 *    Personagem", ANTES deste modal abrir. Oferecer a escolha depois
 *    seria oferecer algo que já não dá pra mudar.
 *  · Botão "Rolar"/"Rolar de novo" — a ferramenta rola; isto RELATA.
 *    Um botão de rolar aqui gravaria uma segunda linha em `table_logs`
 *    sem que ninguém tivesse pedido um segundo teste.
 *  · Dados 3D no palco — o Console também roda fora do VTT (`/ficha`,
 *    harness da ficha), onde não existe mesa pra jogar dado em cima. As
 *    faces chatas (`PolyDie`) são as mesmas que a ferramenta usa
 *    depois que os dados param.
 *
 * E o que é do Console e a ferramenta não tinha: o aviso de defesa sem
 * Reação, o talento que promoveu a margem e os dados de gatilho.
 */
export function RollResultModal({
  resultado,
  defesa,
  personagem,
  onFechar,
}: {
  resultado: RupturaRollResult;
  defesa?: { usouReacao: boolean; penalidade: number; defesasSemReacao: number };
  /** Nome de quem rolou — ocupa o lugar que a ferramenta dá à ficha escolhida. */
  personagem?: string | null;
  onFechar: () => void;
}) {
  const centro = useCentroDoConsole();
  const nd8 = resultado.quantidadeDados;
  const rotuloSelecao = resultado.modoSelecao === "lowest" ? "menor dado" : "maior dado";
  const natureza = defesa
    ? "Defesa"
    : resultado.periciaNome
      ? "Teste de perícia"
      : "Teste de atributo";
  // Dados de gatilho (Pistoleiro) já vêm somados em `dados`/`maiorDado`;
  // aqui é só dizer QUAIS foram, senão a fileira mostra um dado a mais
  // que o atributo permite sem explicar de onde saiu.
  const gatilho = resultado.dadosGatilhoResultados?.length
    ? resultado.dadosGatilhoResultados
    : resultado.dadoGatilhoResultado != null
      ? [resultado.dadoGatilhoResultado]
      : [];

  return (
    <div style={CAMADA_ROLAGEM}>
      <div style={centro
        ? { position: "absolute", left: centro.x, top: centro.y, transform: "translate(-50%, -50%)", pointerEvents: "auto" }
        : { pointerEvents: "auto" }}>
      <MolduraRolagem
        indice="01"
        codigo="Rolagem"
        titulo="Rolar Dados"
        modo={`d8 · ${rotuloSelecao} + perícia + modificadores`}
        aoFechar={onFechar}
        rotuloFechar="Fechar rolagem"
      >
      {defesa && !defesa.usouReacao && (
        <div className="rc-aux-defesa-aviso" role="status">
          <TriangleAlert size={15} aria-hidden="true" />
          <span>
            Sem Reação disponível — {defesa.defesasSemReacao}ª defesa sem Reação nesta rodada, penalidade cumulativa de{" "}
            <strong>{defesa.penalidade}</strong> já aplicada abaixo.
          </span>
        </div>
      )}

      <Stack gap={16}>
        <div>
          <GroupLabel
            right={personagem ? (
              <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: INK_FAINT }}>
                {personagem}
              </span>
            ) : undefined}
          >
            {natureza}
          </GroupLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Leitura label="Atributo · nº d8">{resultado.atributoNome} · {nd8}d8</Leitura>
            <Leitura label="Perícia · bônus">
              {resultado.periciaNome ? `${resultado.periciaNome} · +${resultado.periciaValor}` : "Sem perícia"}
            </Leitura>
          </div>
          <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.16em", color: INK_FAINT }}>
              Modificadores
            </span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: resultado.modificador === 0 ? INK_FAINT : INK }}>
              {resultado.modificador >= 0 ? `+${resultado.modificador}` : String(resultado.modificador)}
            </span>
          </div>
        </div>

        <div style={{ borderRadius: 4, padding: 14, background: "#0c1420", border: "1px solid #16233a" }}>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: INK_FAINT }}>
              Pool · <span style={{ color: "#35c7d8" }}>{nd8}d8</span> · {rotuloSelecao}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: INK_FAINT }}>
              {resultado.cd == null ? "sem CD definida" : `cd ${resultado.cd}`}
            </span>
          </div>
          <div data-testid="console-roll-dados">
            <DadosRolados
              dados={resultado.dados}
              maiorDado={resultado.maiorDado}
              size={40}
              landed
              acento={resultado.classificacaoMargem ? RESULTS[resultado.classificacaoMargem as ResultKey].accent : undefined}
            />
          </div>
          <div style={{ marginTop: 14 }}>
            <FaixaResultado
              testIdTotal="console-roll-total"
              r={{
                maiorDado: resultado.maiorDado,
                modoSelecao: resultado.modoSelecao,
                pericia: resultado.periciaNome ?? null,
                periciaValor: resultado.periciaValor,
                modificador: resultado.modificador,
                total: resultado.total,
                cd: resultado.cd ?? null,
                classificacao: resultado.classificacaoMargem ?? null,
              }}
              nota={resultado.promocaoAplicada ? (
                <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em", color: ACCENTS.arcane.hex }}>
                  margem promovida por {resultado.promocaoAplicada}
                </div>
              ) : undefined}
            />
          </div>
          {gatilho.length > 0 && (
            <p style={{ margin: "10px 0 0", fontFamily: BODY, fontSize: 11.5, lineHeight: 1.5, color: INK_FAINT }}>
              Dado de gatilho: {gatilho.join(", ")}
              {resultado.dadoGatilhoEscolhido ? ` — foi o ${rotuloSelecao} da rolagem.` : " — já incluído no pool acima."}
            </p>
          )}
        </div>
      </Stack>

      </MolduraRolagem>
      </div>
    </div>
  );
}

/**
 * Mesma camada sem backdrop do painel de rolagem do Console (ver
 * `PainelRolagem`): a janela flutua, o mapa atrás continua clicável, e
 * fechar é pelo X.
 */
const CAMADA_ROLAGEM: React.CSSProperties = {
  position: "fixed", inset: 0, zIndex: 520,
  pointerEvents: "none",
  display: "grid", placeItems: "center", padding: 24,
};

/** Seleção de surto de Sobrecarga — os rótulos vêm das regras publicadas. */
export function SurgePickerModal({
  tipos,
  onEscolher,
  onFechar,
}: {
  tipos: readonly string[];
  onEscolher: (tipo: string) => void;
  onFechar: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  return (
    <Aux titulo="Surto de Sobrecarga" onFechar={onFechar}>
      <p className="rc-vazio">Escolha o tipo de surto. O terceiro surto do dia dispara Ruptura.</p>
      <div className="rc-aux-lista">
        {tipos.map((t) => (
          <button
            key={t}
            type="button"
            className="rc-aux-item"
            disabled={enviando}
            // Trava contra clique repetido aplicando o mesmo surto 2×.
            onClick={() => {
              if (enviando) return;
              setEnviando(true);
              onEscolher(t);
            }}
          >
            <span>{t.replace(/_/g, " ")}</span>
          </button>
        ))}
      </div>
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar} disabled={enviando}>
          Cancelar
        </button>
      </div>
    </Aux>
  );
}

export const TIPOS_DEFESA = ["esquivar", "bloquear", "aparar", "resistir"] as const;
export type TipoDefesa = (typeof TIPOS_DEFESA)[number];
const LABEL_DEFESA: Record<TipoDefesa, string> = {
  esquivar: "Esquivar",
  bloquear: "Bloquear",
  aparar: "Aparar",
  resistir: "Resistir",
};

/**
 * Escolha de defesa (botão "Rolar defesa" de Reações) — regra "AÇÕES
 * DEFENSIVAS": Esquivar e Bloquear testam Reflexos, Aparar testa
 * Luta, todas perícias reais em `regras_personagem` (id "reflexos"/
 * "luta"). "Resistir" não tem perícia fixa — a regra deixa a critério
 * do narrador entre Vigor (força) e Mobilidade (agilidade) —, então
 * escolher "Resistir" aqui abre um segundo passo (`ResistirAtributoModal`)
 * em vez de rolar direto.
 */
export function DefensePickerModal({ onEscolher, onFechar }: { onEscolher: (tipo: TipoDefesa) => void; onFechar: () => void }) {
  const [selecionada, setSelecionada] = useState<TipoDefesa | null>(null);

  // Os atalhos existem SÓ enquanto esta janela está montada. A captura
  // interrompe os atalhos do VTT por baixo do modal, e a tecla já segue
  // para o fluxo real (inclusive o segundo passo de Resistir), sem
  // exigir o botão do rodapé.
  useEffect(() => {
    function escolherPorAtalho(event: KeyboardEvent) {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const alvo = event.target;
      if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement || alvo instanceof HTMLSelectElement) return;
      const indice = Number(event.key) - 1;
      const tipo = TIPOS_DEFESA[indice];
      if (!tipo) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onEscolher(tipo);
    }
    window.addEventListener("keydown", escolherPorAtalho, true);
    return () => window.removeEventListener("keydown", escolherPorAtalho, true);
  }, [onEscolher]);

  return (
    <ConsolePicker
      titulo="Rolar defesa"
      id="ID://DEFESA"
      modulo="MOD.DEFENSE // 05"
      onFechar={onFechar}
      rodape={(
        <>
          <span className="rc-picker-status">
            {selecionada ? `Defesa selecionada: ${LABEL_DEFESA[selecionada]}` : "Teclas 1–4 abrem a rolagem"}
          </span>
          <button
            type="button"
            className="rc-picker-aplicar"
            disabled={!selecionada}
            onClick={() => selecionada && onEscolher(selecionada)}
          >
            <img className="rc-defesa-escudo" src="/console/icons/shield-defense.svg" alt="" aria-hidden="true" />
            Rolar defesa
          </button>
        </>
      )}
    >
      <div className="rc-picker-grade" data-impar="false">
        {TIPOS_DEFESA.map((tipo, indice) => (
          <PickerOption
            key={tipo}
            indice={indice}
            nome={LABEL_DEFESA[tipo]}
            selecionado={selecionada === tipo}
            atalho={String(indice + 1)}
            onClick={() => setSelecionada(tipo)}
          />
        ))}
      </div>
    </ConsolePicker>
  );
}

/** Segundo passo de Resistir: escolhe a perícia antes de abrir a rolagem. */
export function ResistirAtributoModal({
  onEscolher,
  onFechar,
}: {
  onEscolher: (periciaId: "vigor" | "mobilidade") => void;
  onFechar: () => void;
}) {
  return (
    <ConsolePicker
      titulo="Resistir"
      id="ID://DEFESA"
      modulo="MOD.DEFENSE // 05"
      onFechar={onFechar}
    >
      <div className="rc-picker-grade" data-colunas="1">
        <PickerOption
          indice={0}
          nome="Vigor (robustez, suportar impacto ou pressão física)"
          selecionado={false}
          mostrarMarca={false}
          onClick={() => onEscolher("vigor")}
        />
        <PickerOption
          indice={1}
          nome="Mobilidade (maleabilidade, evitar o efeito com agilidade)"
          selecionado={false}
          mostrarMarca={false}
          onClick={() => onEscolher("mobilidade")}
        />
      </div>
    </ConsolePicker>
  );
}

/** Mochila filtrada por slot — só itens compatíveis, nunca lista genérica. */
export function BackpackPickerModal({
  slot,
  itens,
  catalogo,
  onEquipar,
  onFechar,
}: {
  slot: BodySlotId;
  itens: InventoryItemInstance[];
  catalogo: Map<string, ItemContent>;
  onEquipar: (instanceId: string) => void;
  onFechar: () => void;
}) {
  return (
    <Aux titulo={`Mochila — ${BODY_SLOT_LABELS[slot]}`} onFechar={onFechar}>
      {itens.length === 0 ? (
        <p className="rc-vazio">Nenhum item compatível com este slot na mochila.</p>
      ) : (
        <div className="rc-aux-lista">
          {itens.map((i) => {
            const m = catalogo.get(i.itemSlug);
            return (
              <button key={i.id} type="button" className="rc-aux-item" onClick={() => onEquipar(i.id)}>
                <span>{i.itemNome}</span>
                <span className="rc-num">
                  {m?.danoBase ?? (m?.mitMax != null ? `MIT ${m.mitMax}` : m?.pdMax != null ? `PD ${m.pdMax}` : "")}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </Aux>
  );
}

/** Janela de ataque — placeholder ligado aos dados reais da arma. */
/**
 * JANELA DA ARMA — o que abre ao clicar num slot de arma equipada.
 *
 * Duas vistas dentro da MESMA janela (a do Console, `Aux`, a mesma de
 * Condições e de Rolar defesa — nada de uma moldura nova):
 *
 *   FICHA    identidade, trilho de dados (perícia, dano, tipo) e as
 *            ações — rolar ataque abre o Painel de Rolagem prefilhado,
 *            que é por onde TODA rolagem do Console passa.
 *   TROCAR   as armas compatíveis que estão na mochila, mais a saída
 *            "remover do slot".
 *
 * Trocar de arma sem fechar e reabrir é o ponto: o slot de arma é o
 * lugar onde se troca de arma, e antes era preciso desequipar num
 * canto para equipar no outro.
 */
export function AttackModal({
  instancia,
  modelo,
  slot,
  api,
  onRolarPericia,
  onFechar,
}: {
  instancia: InventoryItemInstance;
  modelo: ItemContent;
  slot: BodySlotId;
  api: ConsoleApi;
  /** Abre o Painel de Rolagem com a perícia de ataque já escolhida. */
  onRolarPericia: (periciaId: string) => void;
  onFechar: () => void;
}) {
  const [trocando, setTrocando] = useState(false);
  const candidatos = itensCompativeisComSlot(api.character.inventario ?? [], api.catalogo, slot);
  const dano = [modelo.danoBase, modelo.subtipoDano ?? modelo.tipoDano].filter(Boolean).join(" ");
  const rotuloSlot = slot === "arma_primaria" ? "Arma primária" : "Arma secundária";

  return (
    <Aux
      titulo={`${instancia.itemNome} — ${rotuloSlot}`}
      onFechar={onFechar}
      plano
      cabecalho={
        <div className="rc-arma-cab">
          <span className="rc-arma-cab-id">
            WEAPON://<b>{instancia.itemNome}</b>
          </span>
          <button
            type="button"
            className="rc-arma-swap"
            data-ativo={trocando || undefined}
            onClick={() => setTrocando((v) => !v)}
          >
            {trocando ? "Voltar" : "Trocar"}
          </button>
          <button type="button" className="rc-arma-fechar" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>
      }
    >

      {!trocando ? (
        <>
          <div className="rc-arma-ident">
            <div>
              <div className="rc-arma-nome">{instancia.itemNome}</div>
              <div className="rc-arma-sub">{[modelo.categoria, modelo.raridade].filter(Boolean).join(" // ")}</div>
            </div>
            {modelo.propertySlugs.length > 0 && (
              <span className="rc-arma-tag">{modelo.propertySlugs.join(" · ")}</span>
            )}
          </div>

          <div className="rc-arma-trilho">
            <div className="rc-arma-celula">
              <span className="rc-arma-rotulo">Perícia</span>
              <span className="rc-arma-valor">{modelo.periciaAtaque ?? "—"}</span>
            </div>
            <div className="rc-arma-celula">
              <span className="rc-arma-rotulo">Dano</span>
              <span className="rc-arma-valor">{dano || "—"}</span>
            </div>
            <div className="rc-arma-celula">
              <span className="rc-arma-rotulo">Tipo</span>
              <span className="rc-arma-valor">{modelo.subtipoDano ?? modelo.tipoDano ?? "—"}</span>
            </div>
          </div>

          <div className="rc-arma-acoes">
            <button
              type="button"
              className="rc-arma-acao rc-arma-acao--primaria"
              disabled={!modelo.periciaAtaque}
              onClick={() => modelo.periciaAtaque && onRolarPericia(modelo.periciaAtaque)}
            >
              <span className="rc-arma-acao-titulo">Rolar ataque</span>
              <span className="rc-arma-acao-meta">
                {modelo.periciaAtaque ? `Teste de ${modelo.periciaAtaque}` : "Sem perícia de ataque"}
              </span>
            </button>
            {/* O DANO é leitura, não botão: o Console só sabe rolar
                atributo, perícia e defesa — não existe rolagem de
                expressão de dano no motor, e um botão que abrisse o
                painel com a perícia no lugar do dano prometeria uma
                coisa e faria outra. */}
            <div className="rc-arma-acao rc-arma-acao--dado">
              <span className="rc-arma-acao-titulo">{dano || "—"}</span>
              <span className="rc-arma-acao-meta">Dano do golpe</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="rc-arma-lista">
            <div className="rc-arma-opcao" data-atual="true">
              <span className="rc-arma-opcao-info">
                <span className="rc-arma-opcao-nome">{instancia.itemNome}</span>
                <span className="rc-arma-opcao-meta">Equipado</span>
              </span>
              <button type="button" className="rc-arma-equipar" disabled>
                Atual
              </button>
            </div>
            {candidatos.map((cand) => {
              const m = api.catalogo.get(cand.itemSlug);
              return (
                <div className="rc-arma-opcao" key={cand.id}>
                  <span className="rc-arma-opcao-info">
                    <span className="rc-arma-opcao-nome">{cand.itemNome}</span>
                    <span className="rc-arma-opcao-meta">
                      {[m?.danoBase, m?.subtipoDano ?? m?.tipoDano].filter(Boolean).join(" ") || "Na mochila"}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="rc-arma-equipar"
                    onClick={() => {
                      api.equiparNoSlot(cand.id, slot);
                      onFechar();
                    }}
                  >
                    Equipar
                  </button>
                </div>
              );
            })}
            {candidatos.length === 0 && <p className="rc-vazio">Nenhuma arma compatível na mochila.</p>}
          </div>
          <div className="rc-arma-remover">
            <button
              type="button"
              className="rc-arma-desequipar"
              onClick={() => {
                api.desequipar(instancia.id);
                onFechar();
              }}
            >
              Remover do slot
            </button>
          </div>
        </>
      )}
    </Aux>
  );
}

/** Confirmação de recarga. */
export function ConfirmModal({
  titulo,
  mensagem,
  onConfirmar,
  onFechar,
}: {
  titulo: string;
  mensagem: string;
  onConfirmar: () => void;
  onFechar: () => void;
}) {
  return (
    <Aux titulo={titulo} onFechar={onFechar}>
      <p className="rc-vazio">{mensagem}</p>
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
          Cancelar
        </button>
        <button type="button" className="rc-ghost" onClick={onConfirmar} data-testid="console-confirmar">
          Confirmar
        </button>
      </div>
    </Aux>
  );
}

/** Seleção de condição — lista as publicadas na Biblioteca. */
export function ConditionPickerModal({
  disponiveis,
  onAplicar,
  onFechar,
}: {
  disponiveis: { slug: string; nome: string; descricao_curta?: string }[];
  onAplicar: (condicoes: { slug: string; nome: string }[]) => void;
  onFechar: () => void;
}) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(() => new Set());
  const [aplicando, setAplicando] = useState(false);
  const exibidas = disponiveis.slice(0, 40);
  const total = selecionadas.size;

  function alternar(slug: string) {
    setSelecionadas((atuais) => {
      const proximas = new Set(atuais);
      if (proximas.has(slug)) proximas.delete(slug);
      else proximas.add(slug);
      return proximas;
    });
  }

  function aplicarSelecionadas() {
    if (aplicando || total === 0) return;
    setAplicando(true);
    onAplicar(exibidas.filter((condicao) => selecionadas.has(condicao.slug)));
  }

  return (
    <ConsolePicker
      titulo="Adicionar condição"
      id="ID://ESTADOS"
      modulo="MOD.STATUS // 02"
      tamanho="largo"
      onFechar={onFechar}
      rodape={(
        <>
          <span className="rc-picker-status">
            {total === 0 ? "Nenhuma condição selecionada" : total === 1 ? "1 condição selecionada" : `${total} condições selecionadas`}
          </span>
          <button
            type="button"
            className="rc-picker-aplicar"
            disabled={total === 0 || aplicando}
            onClick={aplicarSelecionadas}
          >
            <Check size={13} aria-hidden="true" />
            Aplicar
          </button>
        </>
      )}
    >
      {exibidas.length === 0 ? (
        <p className="rc-picker-vazio">A Biblioteca de condições não está disponível — nenhuma lista local é usada no lugar.</p>
      ) : (
        <div className="rc-picker-grade" data-impar={exibidas.length % 2 !== 0 ? "true" : "false"}>
          {exibidas.map((condicao, indice) => (
            <PickerOption
              key={condicao.slug}
              indice={indice}
              nome={condicao.nome}
              selecionado={selecionadas.has(condicao.slug)}
              onClick={() => alternar(condicao.slug)}
            />
          ))}
        </div>
      )}
    </ConsolePicker>
  );
}
