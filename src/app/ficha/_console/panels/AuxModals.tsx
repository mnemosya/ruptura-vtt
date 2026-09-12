"use client";

/**
 * Modais auxiliares do Console. Todos são PLACEHOLDERS FUNCIONAIS: a
 * interface definitiva de cada um está fora deste escopo, mas nenhum
 * inventa dado — todos operam sobre o conteúdo real e chamam o fluxo
 * existente. Podem ser trocados sem alterar a lógica que os alimenta.
 */

import { useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import type { RupturaRollResult } from "../../../../lib/dice/types";
import {
  ACCENTS, BODY, DISPLAY, DadosRolados, FaixaResultado, GroupLabel, INK, INK_FAINT, Leitura, MONO,
  MolduraRolagem, RESULTS, Stack, type ResultKey,
} from "../../../mesas/[campaignId]/vtt/_dados3d/ResultadoRolagem";
import type { InventoryItemInstance, ItemContent } from "../../../../lib/character";
import { BODY_SLOT_LABELS, type BodySlotId } from "../slots";

function Aux({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  return (
    <div
      className="rc-aux-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="rc-aux" role="dialog" aria-modal="true" aria-label={titulo}>
        <h2>{titulo}</h2>
        {children}
      </div>
    </div>
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
  const nd8 = resultado.atributoValor;
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
      <div style={{ pointerEvents: "auto" }}>
      <MolduraRolagem
        indice="01"
        codigo="Rolagem"
        titulo="Rolar Dados"
        modo="d8 · maior dado + perícia + modificadores"
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

        <div style={{ borderRadius: 2, padding: 14, background: "#0c1420", border: "1px solid #16233a" }}>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: INK_FAINT }}>
              Pool · <span style={{ color: "#35c7d8" }}>{nd8}d8</span> · maior dado
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
              {resultado.dadoGatilhoEscolhido ? " — foi o maior dado da rolagem." : " — já incluído no pool acima."}
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
  return (
    <Aux titulo="Rolar defesa" onFechar={onFechar}>
      <p className="rc-vazio">Escolha a defesa usada nesta reação.</p>
      <div className="rc-aux-lista">
        {TIPOS_DEFESA.map((tipo) => (
          <button key={tipo} type="button" className="rc-aux-item" onClick={() => onEscolher(tipo)}>
            <span>{LABEL_DEFESA[tipo]}</span>
          </button>
        ))}
      </div>
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
          Cancelar
        </button>
      </div>
    </Aux>
  );
}

/**
 * Segundo passo só de "Resistir": a regra deixa a critério do
 * narrador qual perícia se aplica ("firmeza muscular" = Vigor,
 * "agilidade" = Mobilidade) — sem isso não dá pra saber qual rolar.
 */
export function ResistirAtributoModal({
  onEscolher,
  onFechar,
}: {
  onEscolher: (periciaId: "vigor" | "mobilidade") => void;
  onFechar: () => void;
}) {
  return (
    <Aux titulo="Resistir" onFechar={onFechar}>
      <p className="rc-vazio">O narrador indica qual das duas opções se aplica nesta situação.</p>
      <div className="rc-aux-lista">
        <button type="button" className="rc-aux-item" onClick={() => onEscolher("vigor")}>
          <span>Vigor — robustez, suportar impacto ou pressão física</span>
        </button>
        <button type="button" className="rc-aux-item" onClick={() => onEscolher("mobilidade")}>
          <span>Mobilidade — maleabilidade, evitar o efeito com agilidade</span>
        </button>
      </div>
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
          Cancelar
        </button>
      </div>
    </Aux>
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
export function AttackModal({
  instancia,
  modelo,
  onFechar,
}: {
  instancia: InventoryItemInstance;
  modelo: ItemContent;
  onFechar: () => void;
}) {
  return (
    <Aux titulo={`Ataque — ${instancia.itemNome}`} onFechar={onFechar}>
      <div className="rc-aux-lista">
        {modelo.danoBase && (
          <span className="rc-aux-item">
            <span>Dano</span>
            <span className="rc-num">
              {modelo.danoBase} {modelo.tipoDano ?? ""}
            </span>
          </span>
        )}
        {modelo.periciaAtaque && (
          <span className="rc-aux-item">
            <span>Perícia de ataque</span>
            <span className="rc-num">{modelo.periciaAtaque}</span>
          </span>
        )}
        {modelo.propertySlugs.length > 0 && (
          <span className="rc-aux-item">
            <span>Propriedades</span>
            <span className="rc-num">{modelo.propertySlugs.join(", ")}</span>
          </span>
        )}
      </div>
      <p className="rc-vazio">A janela de ataque definitiva entra no lugar deste painel.</p>
      <div className="rc-aux-acoes">
        <button type="button" className="rc-ghost" onClick={onFechar}>
          Fechar
        </button>
      </div>
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
  onAplicar: (c: { slug: string; nome: string }) => void;
  onFechar: () => void;
}) {
  const [busca, setBusca] = useState("");
  const filtradas = disponiveis.filter((c) => c.nome.toLowerCase().includes(busca.trim().toLowerCase()));

  return (
    <Aux titulo="Adicionar condição" onFechar={onFechar}>
      <input
        className="rc-aux-item"
        placeholder="Buscar condição…"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        aria-label="Buscar condição"
      />
      {filtradas.length === 0 ? (
        <p className="rc-vazio" style={{ marginTop: 10 }}>
          {disponiveis.length === 0
            ? "A Biblioteca de condições não está disponível — nenhuma lista local é usada no lugar."
            : "Nenhuma condição corresponde à busca."}
        </p>
      ) : (
        <div className="rc-aux-lista">
          {filtradas.slice(0, 40).map((c) => (
            <button key={c.slug} type="button" className="rc-aux-item" onClick={() => onAplicar(c)}>
              <span>{c.nome}</span>
            </button>
          ))}
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
