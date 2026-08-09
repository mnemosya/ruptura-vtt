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

import { useState, type CSSProperties, type ReactNode } from "react";
import { HardHat, Shirt, Hand, Footprints, Shield, Swords, Crosshair, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type InventoryItemInstance, type ItemContent } from "../../../../lib/character";
import { useClickGuard } from "../useClickGuard";
import { DiamondPip } from "../pips";
import { BodySilhouette, type BodyRegiao } from "../bodySilhouette";
import { BODY_SLOT_LABELS, type BodySlot, type BodySlotId } from "../slots";
import type { ConsoleApi } from "../types";

const ICONES: Record<BodySlotId, LucideIcon> = {
  cabeca: HardHat,
  tronco: Shirt,
  membro_superior: Hand,
  membro_inferior: Footprints,
  escudo: Shield,
  arma_primaria: Swords,
  arma_secundaria: Crosshair,
  acesso_rapido_1: Package,
  acesso_rapido_2: Package,
};

/** Boxes rente à ESQUERDA (membros superiores/inferiores — braços/pernas de fora da silhueta). */
const ESQUERDA: { id: BodySlotId; regiao: BodyRegiao; top: string }[] = [
  { id: "membro_superior", regiao: "membro_superior", top: "13%" },
  { id: "membro_inferior", regiao: "membro_inferior", top: "58%" },
];

/** Boxes rente à DIREITA (soltos — armas ficam num par empilhado à parte). */
const DIREITA: { id: BodySlotId; regiao: BodyRegiao; top: string }[] = [
  { id: "cabeca", regiao: "cabeca", top: "1%" },
  { id: "tronco", regiao: "tronco", top: "23%" },
];

/** Arma primária + Arma secundária ficam anexadas, uma em cima da outra. */
const ARMAS_TOP = "47%";

function PlusIcon() {
  return (
    // Preenchido (um polígono só), não duas linhas com STROKE se
    // cruzando — duas linhas tracejadas se sobrepondo no meio faz os
    // pixels da interseção ficarem parcialmente cobertos duas vezes
    // (antialiasing composto), o que lia como "mais escuro/translúcido"
    // bem no cruzamento mesmo com uma cor 100% opaca. Um fill único
    // não tem essa sobreposição — é uma região sólida só.
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
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

function PipRow({
  atual,
  max,
  rotulo,
  onDefinir,
}: {
  atual: number;
  max: number;
  rotulo: string;
  onDefinir: (valor: number) => void;
}) {
  const guard = useClickGuard();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const total = Math.max(0, Math.round(max));
  // Mesma prévia de trilha de Integridade: hover num pip mostra o que
  // TODOS os pips entre o atual e ele fariam se clicado agora — não só
  // o pip sob o cursor.
  const previewValor = hoverIdx == null ? null : hoverIdx < atual ? hoverIdx : hoverIdx + 1;
  return (
    // stopPropagation aqui (não só nos botões dos pips) — clicar no
    // texto "3/5 PD" entre os pips não pode abrir o modal do item.
    <span className="rc-eq-pipvalor" onClick={(e) => e.stopPropagation()}>
      <span className="rc-eq-pips" onMouseLeave={() => setHoverIdx(null)}>
        {Array.from({ length: total }, (_, i) => {
          const cheio = i < atual;
          let preview: "fill" | "empty" | undefined;
          if (previewValor != null) {
            if (previewValor > atual && i >= atual && i < previewValor) preview = "fill";
            else if (previewValor < atual && i >= previewValor && i < atual) preview = "empty";
          }
          return (
            <button
              key={i}
              type="button"
              className="rc-eq-pipbtn"
              onMouseEnter={() => setHoverIdx(i)}
              onFocus={() => setHoverIdx(i)}
              onBlur={() => setHoverIdx(null)}
              onClick={() => guard(() => onDefinir(cheio ? i : i + 1))}
              aria-label={`${rotulo} ${i + 1} de ${total}: ${cheio ? "disponível" : "consumido"}. Clique para ajustar até aqui.`}
            >
              <DiamondPip cheio={cheio} size={14} preview={preview} />
            </button>
          );
        })}
      </span>
      <span className="rc-eq-valor">
        {atual}
        <span className="rc-eq-valor-total">
          /{total} {rotulo}
        </span>
      </span>
    </span>
  );
}

function CardFilled({
  Icone,
  nome,
  onAbrirNome,
  titleNome,
  direita,
}: {
  Icone: LucideIcon;
  nome: string;
  onAbrirNome: () => void;
  titleNome: string;
  direita: ReactNode;
}) {
  return (
    // Não é um <button> de verdade porque o conteúdo (PipRow) tem seus
    // próprios botões dentro — <button> não pode aninhar <button>.
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
      <span className="rc-eq-ico">
        <Icone size={18} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="rc-eq-corpo">
        <span className="rc-eq-nome">{nome}</span>
        {direita}
      </span>
    </div>
  );
}

function EquipBox({
  slotId,
  regiao,
  label,
  style,
  pinned = true,
  active,
  onHover,
  children,
}: {
  slotId: BodySlotId;
  regiao: BodyRegiao;
  label: string;
  style?: CSSProperties;
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
  onAbrirAtaque: (inst: InventoryItemInstance, modelo: ItemContent) => void;
  onUsarItem: (inst: InventoryItemInstance, modelo: ItemContent | undefined) => void;
  onRecarregar: (inst: InventoryItemInstance) => void;
}) {
  const [hover, setHover] = useState<BodyRegiao | null>(null);
  const por = (id: BodySlotId) => slots.find((s) => s.id === id)!;

  // Escudo e arma secundária representam a MESMA mão — um único box
  // visual, escudo tem prioridade de exibição se os dois existirem.
  const escudoSlot = por("escudo");
  const armaSecSlot = por("arma_secundaria");
  const secundariaInst = escudoSlot.instance ?? armaSecSlot.instance;
  const secundariaModelo = secundariaInst ? api.catalogo.get(secundariaInst.itemSlug) : undefined;
  const secundariaEhEscudo = secundariaInst === escudoSlot.instance && !!secundariaInst;

  function renderArmadura(slotId: BodySlotId) {
    const slot = por(slotId);
    const Icone = ICONES[slotId];
    const inst = slot.instance;
    const modelo = inst ? api.catalogo.get(inst.itemSlug) : undefined;

    if (!inst || !modelo) {
      return <BotaoEquipar onClick={() => onAbrirVazio(slotId)} testId={`console-equipar-${slotId}`} label={BODY_SLOT_LABELS[slotId]} />;
    }

    return (
      <CardFilled
        Icone={Icone}
        nome={inst.itemNome}
        titleNome={`${inst.itemNome} — usar item`}
        onAbrirNome={() => onUsarItem(inst, modelo)}
        direita={
          modelo.mitMax != null ? (
            <PipRow atual={inst.mitAtual ?? modelo.mitMax} max={modelo.mitMax} rotulo="MIT" onDefinir={(v) => api.definirMit(inst.id, v)} />
          ) : null
        }
      />
    );
  }

  function renderArma(slotId: "arma_primaria") {
    const slot = por(slotId);
    const Icone = ICONES[slotId];
    const inst = slot.instance;
    const modelo = inst ? api.catalogo.get(inst.itemSlug) : undefined;

    if (!inst || !modelo) {
      return <BotaoEquipar onClick={() => onAbrirVazio(slotId)} testId={`console-equipar-${slotId}`} label={BODY_SLOT_LABELS[slotId]} />;
    }

    const dano = [modelo.danoBase, modelo.subtipoDano].filter(Boolean).join(" ");
    return (
      <CardFilled
        Icone={Icone}
        nome={inst.itemNome}
        titleNome={`${inst.itemNome} — abrir ataque`}
        onAbrirNome={() => onAbrirAtaque(inst, modelo)}
        direita={dano ? <span className="rc-eq-dano">{dano}</span> : null}
      />
    );
  }

  function renderSecundaria() {
    const Icone = secundariaEhEscudo ? ICONES.escudo : ICONES.arma_primaria;
    if (!secundariaInst || !secundariaModelo) {
      return <BotaoEquipar onClick={() => onAbrirVazio("arma_secundaria")} testId="console-equipar-arma_secundaria" label="Arma secundária" />;
    }

    if (secundariaEhEscudo) {
      return (
        <CardFilled
          Icone={Icone}
          nome={secundariaInst.itemNome}
          titleNome={`${secundariaInst.itemNome} — usar item`}
          onAbrirNome={() => onUsarItem(secundariaInst, secundariaModelo)}
          direita={
            secundariaModelo.pdMax != null ? (
              <PipRow
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
        Icone={Icone}
        nome={secundariaInst.itemNome}
        titleNome={`${secundariaInst.itemNome} — abrir ataque`}
        onAbrirNome={() => onAbrirAtaque(secundariaInst, secundariaModelo)}
        direita={dano ? <span className="rc-eq-dano">{dano}</span> : null}
      />
    );
  }

  function conteudo(slotId: BodySlotId) {
    if (slotId === "arma_primaria") return renderArma("arma_primaria");
    if (slotId === "arma_secundaria") return renderSecundaria();
    return renderArmadura(slotId);
  }

  function renderAcessoRapido(slotId: "acesso_rapido_1" | "acesso_rapido_2", numero: 1 | 2) {
    const slot = por(slotId);
    const inst = slot.instance;
    const modelo = inst ? api.catalogo.get(inst.itemSlug) : undefined;

    return (
      <div className="rc-eq-quick" data-testid={`console-equip-box-${slotId}`}>
        <span className="rc-eq-box-label">Acesso rápido #{numero}</span>
        {!inst || !modelo ? (
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
            <span className="rc-eq-ico rc-eq-ico--quick">
              <Package size={18} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="rc-eq-equipar-txt">{inst.itemNome}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <section aria-label="Equipamentos" className="rc-eq-outer">
      <span className="rc-eq-caption">Equipamentos</span>
      <div className="rc-eq-card-outer">
        <div className="rc-eq-inner-container">
          {/* SVG inline, path por região (não <img>) — hover é o PATH
              real (pixel-perfect, sem retângulo aproximado), e o
              tamanho/centralização vêm de graça do `viewBox` +
              `preserveAspectRatio` padrão do SVG (mesmo efeito do
              object-fit:contain, sem precisar medir nada em JS). */}
          <BodySilhouette hover={hover} onHover={setHover} />

          {ESQUERDA.map(({ id, regiao, top }) => (
            <EquipBox key={id} slotId={id} regiao={regiao} label={BODY_SLOT_LABELS[id]} style={{ left: 0, top }} active={hover === regiao} onHover={setHover}>
              {conteudo(id)}
            </EquipBox>
          ))}
          {DIREITA.map(({ id, regiao, top }) => (
            <EquipBox key={id} slotId={id} regiao={regiao} label={BODY_SLOT_LABELS[id]} style={{ right: 0, top }} active={hover === regiao} onHover={setHover}>
              {conteudo(id)}
            </EquipBox>
          ))}

          <div className="rc-eq-armas-stack" style={{ top: ARMAS_TOP }}>
            <EquipBox slotId="arma_primaria" regiao="arma_primaria" label={BODY_SLOT_LABELS.arma_primaria} pinned={false} active={hover === "arma_primaria"} onHover={setHover}>
              {conteudo("arma_primaria")}
            </EquipBox>
            <EquipBox slotId="arma_secundaria" regiao="arma_secundaria" label="Arma secundária" pinned={false} active={hover === "arma_secundaria"} onHover={setHover}>
              {conteudo("arma_secundaria")}
            </EquipBox>
          </div>

          <div className="rc-eq-quick-row">
            {renderAcessoRapido("acesso_rapido_1", 1)}
            {renderAcessoRapido("acesso_rapido_2", 2)}
          </div>
        </div>
      </div>
    </section>
  );
}
