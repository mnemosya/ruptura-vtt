"use client";

/**
 * Equipamentos v2 (spec Figma) — silhueta do corpo (SVG real, com uma
 * variante por região que troca no hover) centralizada, com os boxes
 * de equipamento posicionados em absolute ao redor dela: os da direita
 * rente à direita, os da esquerda rente à esquerda (nunca soltos no
 * meio), largura entre 154px e 220px.
 *
 * Escudo e Arma secundária são dois slots INDEPENDENTES no modelo
 * (equipadoDefensivo × empunhado[1]), mas representam a MESMA mão —
 * por pedido explícito do usuário ("não dá pra segurar 2 pistolas e
 * ter um escudo"), viram um único box visual "Arma secundária" que
 * mostra o que estiver preenchido (escudo tem prioridade porque só um
 * dos dois deveria existir por vez). `itemCabeNoSlot` foi ajustado em
 * `slots.ts` pra aceitar arma OU escudo neste slot, então "Equipar" a
 * partir do box vazio já mostra as duas categorias na mochila.
 *
 * Armas (primária/secundária-arma) mostram só o dano — sem munição,
 * sem lista de propriedades: a spec pede exatamente esse conteúdo
 * mínimo pra esse card, e não há em nenhum outro lugar hoje uma
 * exibição de munição pra recuperar depois (sinalizado à parte).
 */

import { Fragment, useState, type CSSProperties, type ReactNode } from "react";
import { type InventoryItemInstance, type ItemContent } from "../../../../lib/character";
import { useClickGuard } from "../useClickGuard";
import { BodySilhouette, type BodyRegiao } from "../bodySilhouette";
import { BODY_SLOT_LABELS, type BodySlot, type BodySlotId } from "../slots";
import type { ConsoleApi } from "../types";
import { CabecalhoModulo } from "./CabecalhoModulo";

/* O mapa de ÍCONES POR SLOT saiu junto com eles: o card preenchido
   mostra nome + número, e o rótulo do slot ("TRONCO", "ARMA
   PRIMÁRIA") já diz o que o ícone dizia. */

/** Boxes rente à ESQUERDA (membros superiores/inferiores — braços/pernas de fora da silhueta). */
const ESQUERDA: { id: BodySlotId; regiao: BodyRegiao; top: string }[] = [
  { id: "membro_superior", regiao: "membro_superior", top: "26%" },
  { id: "membro_inferior", regiao: "membro_inferior", top: "68%" },
];

/** Boxes rente à DIREITA (soltos — armas ficam num par empilhado à parte). */
const DIREITA: { id: BodySlotId; regiao: BodyRegiao; top: string }[] = [
  { id: "cabeca", regiao: "cabeca", top: "6%" },
  { id: "tronco", regiao: "tronco", top: "35%" },
];

/** Arma primária + Arma secundária ficam anexadas, uma em cima da outra. */

function PlusIcon() {
  return (
    // Preenchido (um polígono só), não duas linhas com STROKE se
    // cruzando — duas linhas tracejadas se sobrepondo no meio faz os
    // pixels da interseção ficarem parcialmente cobertos duas vezes
    // (antialiasing composto), o que lia como "mais escuro/translúcido"
    // bem no cruzamento mesmo com uma cor 100% opaca. Um fill único
    // não tem essa sobreposição — é uma região sólida só.
    <svg viewBox="0 0 18 18" fill="none" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M7.75 3.75H10.25V7.75H14.25V10.25H10.25V14.25H7.75V10.25H3.75V7.75H7.75V3.75Z" fill="currentColor" />
    </svg>
  );
}

function BotaoEquipar({ onClick, testId, label }: { onClick: () => void; testId: string; label: string }) {
  return (
    <button
      type="button"
      className="rc-eq-inner rc-eq-equipar"
      onClick={onClick}
      data-testid={testId}
      aria-label={`${label}: vazio. Abrir mochila filtrada`}
    >
      <span className="rc-eq-ico">
        <PlusIcon />
      </span>
      <span className="rc-eq-equipar-txt">Equipar</span>
    </button>
  );
}

/** Slot vazio na ficha SÓ LEITURA: a mesma caixa, sem "+ Equipar" — equipar é edição. */
function SlotVazio({ quick = false }: { quick?: boolean }) {
  return (
    <div className={`rc-eq-inner rc-eq-vazio${quick ? " rc-eq-quick-inner" : ""}`}>
      <span className="rc-eq-equipar-txt">Vazio</span>
    </div>
  );
}

/* O antigo `PipRow` (pips + valor correndo EMBAIXO do nome, dentro da
   área clicável) saiu junto com o readout lateral — ver
   `ReadoutDesgaste`. */

function CardFilled({
  nome,
  onAbrirNome,
  titleNome,
  direita,
}: {
  nome: string;
  /** Ausente = só leitura: o nome não abre uso/ataque. */
  onAbrirNome?: () => void;
  titleNome: string;
  /** O READOUT LATERAL — a coluna da direita do card. */
  direita: ReactNode;
}) {
  return (
    // Não é um <button> de verdade porque o readout tem os próprios
    // botões dentro — <button> não pode aninhar <button>.
    //
    // SEM ÍCONE: o slot preenchido mostra o NOME do item e o número
    // que importa. O ícone repetia o que o rótulo do slot já diz
    // (escudo em "Tronco", mira em "Arma primária") e empurrava o nome
    // para a direita. O "+" continua no slot vazio — lá ele não é
    // ícone do item, é o controle de equipar.
    // O READOUT É IRMÃO da área clicável, não filho dela. Enquanto
    // estava dentro, cada clique em −/+ subia até o `onClick` do card
    // e abria a janela do item junto; o que segurava isso era um
    // `stopPropagation` — uma defesa que depende de ninguém esquecer
    // de repeti-la no próximo controle que entrar ali. Fora do alvo,
    // não há o que interceptar.
    <div className="rc-eq-linha">
      {!onAbrirNome ? (
        <div className="rc-eq-inner rc-eq-inner--leitura" title={nome}>
          <span className="rc-eq-nome-area">
            <span className="rc-eq-nome">{nome}</span>
          </span>
        </div>
      ) : (
      <div
        className="rc-eq-inner"
        role="button"
        tabIndex={0}
        onClick={onAbrirNome}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onAbrirNome();
          }
        }}
        title={titleNome}
      >
        <span className="rc-eq-nome-area">
          <span className="rc-eq-nome">{nome}</span>
        </span>
      </div>
      )}
      {direita}
    </div>
  );
}

/**
 * READOUT LATERAL de MIT/PD — a coluna da direita do card preenchido:
 * pips, valor atual/máximo e os controles de −/+.
 *
 * Os pips continuam clicáveis (salto direto para o valor, com prévia
 * no hover, como a trilha de Integridade); o que entrou foram os
 * BOTÕES, que resolvem o caso comum — levou um golpe, tira um ponto —
 * sem exigir mira num alvo de 14px.
 */
function ReadoutDesgaste({
  atual,
  max,
  rotulo,
  onDefinir,
  leitura = false,
}: {
  atual: number;
  max: number;
  rotulo: string;
  onDefinir: (valor: number) => void;
  /** Só leitura: o valor sem os −/+ (a coluna deles fecha). */
  leitura?: boolean;
}) {
  const guard = useClickGuard();
  const total = Math.max(0, Math.round(max));
  return (
    <span className="rc-eq-readout" data-leitura={leitura || undefined}>
      <span className="rc-eq-readout-main">
        <span className="rc-eq-valor">
          {atual}
          <span className="rc-eq-valor-total">/{total}</span>
        </span>
      </span>
      {!leitura && <span className="rc-eq-readout-ctrls">
        <button
          type="button"
          onClick={() => guard(() => onDefinir(Math.min(total, atual + 1)))}
          disabled={atual >= total}
          aria-label={`Aumentar ${rotulo}`}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => guard(() => onDefinir(Math.max(0, atual - 1)))}
          disabled={atual <= 0}
          aria-label={`Reduzir ${rotulo}`}
        >
          −
        </button>
      </span>}
    </span>
  );
}

function EquipBox({
  slotId,
  regiao,
  label,
  style,
  lado,
  pinned = true,
  active,
  onHover,
  children,
}: {
  slotId: BodySlotId;
  regiao: BodyRegiao;
  label: string;
  style?: CSSProperties;
  /** De que lado da silhueta o slot está — define para onde sai a guia. */
  lado?: "esquerda" | "direita";
  /** false = filho de um wrapper que já é absolute (ex.: par de armas empilhado) — não pina de novo. */
  pinned?: boolean;
  /** true quando o hover veio do SVG do corpo (não do mouse real sobre o box) — precisa de um data-attr porque `:hover` só reflete o cursor de verdade. */
  active: boolean;
  onHover: (r: BodyRegiao | null) => void;
  children: ReactNode;
}) {
  return (
    <div
      className={pinned ? "rc-eq-box rc-eq-box--pinned" : "rc-eq-box"}
      style={style}
      data-lado={lado}
      data-testid={`console-equip-box-${slotId}`}
      data-hover={active}
      onMouseEnter={() => onHover(regiao)}
      onMouseLeave={() => onHover(null)}
    >
      <span className="rc-eq-box-label">{label}</span>
      {children}
    </div>
  );
}

export function EquipmentPanel({
  slots,
  api,
  onAbrirVazio,
  onAbrirAtaque,
  onUsarItem,
  onRecarregar: _onRecarregar,
}: {
  slots: BodySlot[];
  api: ConsoleApi;
  onAbrirVazio: (slot: BodySlotId) => void;
  onAbrirAtaque: (inst: InventoryItemInstance, modelo: ItemContent, slot: "arma_primaria" | "arma_secundaria") => void;
  onUsarItem: (inst: InventoryItemInstance, modelo: ItemContent | undefined) => void;
  onRecarregar: (inst: InventoryItemInstance) => void;
}) {
  const [hover, setHover] = useState<BodyRegiao | null>(null);
  const por = (id: BodySlotId) => slots.find((s) => s.id === id)!;
  /* SÓ LEITURA: equipar, usar, atacar e ajustar MIT/PD são ações — o
     que fica é o que está equipado e em que estado. */
  const leitura = !!api.somenteLeitura;

  // Escudo e arma secundária representam a MESMA mão — um único box
  // visual, escudo tem prioridade de exibição se os dois existirem.
  const escudoSlot = por("escudo");
  const armaSecSlot = por("arma_secundaria");
  const secundariaInst = escudoSlot.instance ?? armaSecSlot.instance;
  const secundariaModelo = secundariaInst ? api.catalogo.get(secundariaInst.itemSlug) : undefined;
  const secundariaEhEscudo = secundariaInst === escudoSlot.instance && !!secundariaInst;

  function renderArmadura(slotId: BodySlotId) {
    const slot = por(slotId);
    const inst = slot.instance;
    const modelo = inst ? api.catalogo.get(inst.itemSlug) : undefined;

    if (!inst || !modelo) {
      if (leitura) return <SlotVazio />;
      return <BotaoEquipar onClick={() => onAbrirVazio(slotId)} testId={`console-equipar-${slotId}`} label={BODY_SLOT_LABELS[slotId]} />;
    }

    return (
      <CardFilled
        nome={inst.itemNome}
        titleNome={`${inst.itemNome} — usar item`}
        onAbrirNome={leitura ? undefined : () => onUsarItem(inst, modelo)}
        direita={
          modelo.mitMax != null ? (
            <ReadoutDesgaste leitura={leitura} atual={inst.mitAtual ?? modelo.mitMax} max={modelo.mitMax} rotulo="MIT" onDefinir={(v) => api.definirMit(inst.id, v)} />
          ) : null
        }
      />
    );
  }

  function renderArma(slotId: "arma_primaria") {
    const slot = por(slotId);
    const inst = slot.instance;
    const modelo = inst ? api.catalogo.get(inst.itemSlug) : undefined;

    if (!inst || !modelo) {
      if (leitura) return <SlotVazio />;
      return <BotaoEquipar onClick={() => onAbrirVazio(slotId)} testId={`console-equipar-${slotId}`} label={BODY_SLOT_LABELS[slotId]} />;
    }

    const dano = [modelo.danoBase, modelo.subtipoDano].filter(Boolean).join(" ");
    return (
      <CardFilled
        nome={inst.itemNome}
        titleNome={`${inst.itemNome} — abrir ataque`}
        onAbrirNome={leitura ? undefined : () => onAbrirAtaque(inst, modelo, slotId)}
        direita={dano ? <span className="rc-eq-readout rc-eq-readout--dano">{dano}</span> : null}
      />
    );
  }

  function renderSecundaria() {
    if (!secundariaInst || !secundariaModelo) {
      if (leitura) return <SlotVazio />;
      return <BotaoEquipar onClick={() => onAbrirVazio("arma_secundaria")} testId="console-equipar-arma_secundaria" label="Arma secundária" />;
    }

    if (secundariaEhEscudo) {
      return (
        <CardFilled
          nome={secundariaInst.itemNome}
          titleNome={`${secundariaInst.itemNome} — usar item`}
          onAbrirNome={leitura ? undefined : () => onUsarItem(secundariaInst, secundariaModelo)}
          direita={
            secundariaModelo.pdMax != null ? (
              <ReadoutDesgaste
                leitura={leitura}
                atual={secundariaInst.pdAtual ?? secundariaModelo.pdMax}
                max={secundariaModelo.pdMax}
                rotulo="PD"
                onDefinir={(v) => api.definirPd(secundariaInst.id, v)}
              />
            ) : null
          }
        />
      );
    }

    const dano = [secundariaModelo.danoBase, secundariaModelo.subtipoDano].filter(Boolean).join(" ");
    return (
      <CardFilled
        nome={secundariaInst.itemNome}
        titleNome={`${secundariaInst.itemNome} — abrir ataque`}
        onAbrirNome={leitura ? undefined : () => onAbrirAtaque(secundariaInst, secundariaModelo, "arma_secundaria")}
        direita={dano ? <span className="rc-eq-readout rc-eq-readout--dano">{dano}</span> : null}
      />
    );
  }

  function conteudo(slotId: BodySlotId) {
    if (slotId === "arma_primaria") return renderArma("arma_primaria");
    if (slotId === "arma_secundaria") return renderSecundaria();
    return renderArmadura(slotId);
  }

  /**
   * Clicar numa parte do corpo faz o MESMO que clicar no box daquela
   * região: mochila filtrada se o slot está vazio, abrir ataque (arma)
   * ou usar item (armadura/escudo) se está preenchido. É um atalho
   * redundante e só de mouse — a via acessível continua sendo o box,
   * que é botão de verdade (a silhueta é `aria-hidden`).
   */
  function acionarRegiao(regiao: BodyRegiao) {
    if (leitura) return;
    if (regiao === "arma_secundaria") {
      if (!secundariaInst || !secundariaModelo) return onAbrirVazio("arma_secundaria");
      if (secundariaEhEscudo) return onUsarItem(secundariaInst, secundariaModelo);
      return onAbrirAtaque(secundariaInst, secundariaModelo, "arma_secundaria");
    }

    const inst = por(regiao).instance;
    const modelo = inst ? api.catalogo.get(inst.itemSlug) : undefined;
    if (!inst || !modelo) return onAbrirVazio(regiao);
    if (regiao === "arma_primaria") return onAbrirAtaque(inst, modelo, "arma_primaria");
    return onUsarItem(inst, modelo);
  }

  function renderAcessoRapido(slotId: "acesso_rapido_1" | "acesso_rapido_2", numero: 1 | 2) {
    const slot = por(slotId);
    const inst = slot.instance;
    const modelo = inst ? api.catalogo.get(inst.itemSlug) : undefined;

    return (
      <div className="rc-eq-quick" data-testid={`console-equip-box-${slotId}`}>
        <span className="rc-eq-box-label">Acesso rápido #{numero}</span>
        {(!inst || !modelo) && leitura ? (
          <SlotVazio quick />
        ) : inst && modelo && leitura ? (
          <div className="rc-eq-inner rc-eq-quick-inner rc-eq-inner--leitura" title={inst.itemNome}>
            <span className="rc-eq-nome-area">
              <span className="rc-eq-nome">{inst.itemNome}</span>
            </span>
          </div>
        ) : !inst || !modelo ? (
          <button
            type="button"
            className="rc-eq-inner rc-eq-quick-inner rc-eq-equipar"
            onClick={() => onAbrirVazio(slotId)}
            data-testid={`console-equipar-${slotId}`}
            aria-label={`Acesso rápido ${numero}: vazio. Abrir mochila filtrada`}
          >
            <span className="rc-eq-ico rc-eq-ico--quick">
              <PlusIcon />
            </span>
            <span className="rc-eq-equipar-txt">Equipar</span>
          </button>
        ) : (
          <button
            type="button"
            className="rc-eq-inner rc-eq-quick-inner"
            onClick={() => onUsarItem(inst, modelo)}
            title={`${inst.itemNome} — usar item`}
            aria-label={`Acesso rápido ${numero}: ${inst.itemNome}. Usar item`}
          >
            {/* Sem ícone, como os outros slots preenchidos — o nome do
                item é o que se lê. */}
            <span className="rc-eq-nome-area">
              <span className="rc-eq-nome">{inst.itemNome}</span>
            </span>
          </button>
        )}
      </div>
    );
  }

  return (
    <section aria-label="Equipamentos" className="rc-eq-outer">
      <div className="rc-eq-card-outer">
        <CabecalhoModulo id="ID://EQUIPAMENTO" mod="MOD.GEAR // 06" />
        <div className="rc-eq-inner-container">
          {/* SVG inline, path por região (não <img>) — hover é o PATH
              real (pixel-perfect, sem retângulo aproximado), e o
              tamanho/centralização vêm de graça do `viewBox` +
              `preserveAspectRatio` padrão do SVG (mesmo efeito do
              object-fit:contain, sem precisar medir nada em JS). */}
          <BodySilhouette hover={hover} onHover={setHover} onAcionar={acionarRegiao} />

          {/* A GUIA é IRMÃ do card, não um pseudo dele: o chanfro
              recorta tudo o que é filho, e a guia existe justamente
              para sair da caixa em direção à silhueta. Vem logo depois
              do card para o hover alcançá-la por `+`. */}
          {ESQUERDA.map(({ id, regiao, top }) => (
            <Fragment key={id}>
              <EquipBox slotId={id} regiao={regiao} label={BODY_SLOT_LABELS[id]} style={{ top }} lado="esquerda" active={hover === regiao} onHover={setHover}>
                {conteudo(id)}
              </EquipBox>
              <span className="rc-eq-guia" data-lado="esquerda" data-slot={id} style={{ top }} aria-hidden="true" />
            </Fragment>
          ))}
          {DIREITA.map(({ id, regiao, top }) => (
            <Fragment key={id}>
              <EquipBox slotId={id} regiao={regiao} label={BODY_SLOT_LABELS[id]} style={{ top }} lado="direita" active={hover === regiao} onHover={setHover}>
                {conteudo(id)}
              </EquipBox>
              <span className="rc-eq-guia" data-lado="direita" data-slot={id} style={{ top }} aria-hidden="true" />
            </Fragment>
          ))}

        </div>

        {/* TRILHO DO LOADOUT — o que se EMPUNHA não pendura no corpo:
            armas e acessos rápidos viram quatro colunas no pé do
            painel, com a largura toda. Antes as armas ficavam
            empilhadas flutuando à direita e os acessos soltos no meio,
            disputando posição com os slots anatômicos. */}
        <div className="rc-eq-loadout">
          <EquipBox slotId="arma_primaria" regiao="arma_primaria" label={BODY_SLOT_LABELS.arma_primaria} pinned={false} active={hover === "arma_primaria"} onHover={setHover}>
            {conteudo("arma_primaria")}
          </EquipBox>
          <EquipBox slotId="arma_secundaria" regiao="arma_secundaria" label="Arma secundária" pinned={false} active={hover === "arma_secundaria"} onHover={setHover}>
            {conteudo("arma_secundaria")}
          </EquipBox>
          {renderAcessoRapido("acesso_rapido_1", 1)}
          {renderAcessoRapido("acesso_rapido_2", 2)}
        </div>
      </div>
    </section>
  );
}
