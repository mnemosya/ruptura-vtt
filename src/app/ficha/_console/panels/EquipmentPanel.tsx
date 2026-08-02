"use client";

/**
 * Equipamentos — corpo ao centro e slots posicionados ao redor dele.
 *
 * Os slots usam posicionamento ABSOLUTO dentro de um canvas próprio
 * (`.rc-doll`, `position:relative`), com coordenadas PERCENTUAIS — não
 * a viewport — porque precisam guardar uma relação espacial específica
 * com a silhueta e podem avançar parcialmente sobre ela (spec: isso é
 * parte da composição). Percentuais mantêm o comportamento durante
 * resize; o canvas tem `min-height` fixo para as posições terem uma
 * referência estável.
 *
 * Acesso rápido #1/#2 ficam FORA do canvas absoluto, numa fileira
 * normal abaixo — não têm relação espacial com o corpo.
 *
 * Armaduras mostram trilha de MIT + tipo de resistência; escudo mostra
 * PD; armas mostram dano, propriedades e munição com ação de recarga.
 * Todos esses dados vêm do modelo publicado (`ItemContent`) — nada é
 * inventado aqui. Slot vazio abre a Mochila já filtrada pelo slot.
 */

import type { CSSProperties } from "react";
import { HardHat, Shirt, Hand, Footprints, Shield, Swords, Crosshair, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  getWeaponAmmoAtual,
  getWeaponAmmoMax,
  type InventoryItemInstance,
  type ItemContent,
} from "../../../../lib/character";
import { useClickGuard } from "../useClickGuard";
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

const PROTECAO_LABEL: Record<string, string> = {
  fisica: "Físico",
  energetica: "Energético",
  hibrida: "Híbrido",
};

/**
 * Coordenadas percentuais dos 7 slots posicionados sobre a silhueta —
 * coluna esquerda (membro superior/escudo/membro inferior) e direita
 * (cabeça/tronco/arma primária/arma secundária), seguindo o print de
 * referência. Acesso rápido fica fora deste canvas.
 */
const POSICAO: Partial<Record<BodySlotId, CSSProperties>> = {
  membro_superior: { left: "0%", top: "16%", width: "43%" },
  escudo: { left: "0%", top: "43%", width: "43%" },
  membro_inferior: { left: "0%", top: "70%", width: "43%" },
  cabeca: { right: "0%", top: "4%", width: "43%" },
  tronco: { right: "0%", top: "32%", width: "43%" },
  arma_primaria: { right: "0%", top: "58%", width: "43%" },
  arma_secundaria: { right: "0%", top: "80%", width: "43%" },
};

/** Trilha clicável de MIT/PD: cheio = ponto disponível, vazado = consumido. */
function MiniTrilha({
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
  return (
    <span className="rc-slot-linha">
      <span className="rc-minipips">
        {Array.from({ length: Math.max(0, Math.round(max)) }, (_, i) => {
          const cheio = i < atual;
          return (
            <button
              key={i}
              type="button"
              className="rc-minipip"
              data-on={cheio}
              onClick={(e) => {
                e.stopPropagation();
                // Clicar num cheio consome até ali; num vazado, devolve.
                guard(() => onDefinir(cheio ? i : i + 1));
              }}
              aria-label={`${rotulo} ${i + 1} de ${max}: ${cheio ? "disponível" : "consumido"}`}
            />
          );
        })}
      </span>
      <span className="rc-num">
        {atual}/{max} {rotulo}
      </span>
    </span>
  );
}

function SlotCard({
  slot,
  style,
  api,
  onAbrirVazio,
  onAbrirAtaque,
  onUsarItem,
  onRecarregar,
}: {
  slot: BodySlot;
  style?: CSSProperties;
  api: ConsoleApi;
  onAbrirVazio: (slot: BodySlotId) => void;
  onAbrirAtaque: (inst: InventoryItemInstance, modelo: ItemContent) => void;
  onUsarItem: (inst: InventoryItemInstance, modelo: ItemContent | undefined) => void;
  onRecarregar: (inst: InventoryItemInstance) => void;
}) {
  const Icone = ICONES[slot.id];
  const inst = slot.instance;
  const modelo = inst ? api.catalogo.get(inst.itemSlug) : undefined;
  const wrapClass = style ? "rc-slot-abs" : undefined;

  if (!inst) {
    return (
      <div className={wrapClass} style={style}>
        <button
          type="button"
          className="rc-slot"
          data-preenchido={false}
          data-testid={`console-slot-${slot.id}`}
          onClick={() => onAbrirVazio(slot.id)}
          aria-label={`${BODY_SLOT_LABELS[slot.id]}: vazio. Abrir mochila filtrada`}
        >
          <Icone size={17} className="rc-slot-ico" aria-hidden="true" />
          <span className="rc-slot-main">
            <span className="rc-slot-label">{slot.label}</span>
            <span className="rc-slot-nome" data-vazio="true">
              vazio
            </span>
          </span>
        </button>
      </div>
    );
  }

  const ehArma = modelo?.categoria === "arma";
  const ehArmadura = modelo?.categoria === "armadura";
  const ehEscudo = modelo?.categoria === "escudo";
  const municaoMax = modelo ? getWeaponAmmoMax(modelo) : null;
  const municaoAtual = getWeaponAmmoAtual(inst);

  return (
    <div className={wrapClass} style={style}>
      <div
        className="rc-slot"
        data-preenchido="true"
        data-testid={`console-slot-${slot.id}`}
        role="group"
        aria-label={`${BODY_SLOT_LABELS[slot.id]}: ${inst.itemNome}`}
      >
        <Icone size={17} className="rc-slot-ico" aria-hidden="true" />
        <span className="rc-slot-main">
          <span className="rc-slot-label">{slot.label}</span>
          <button
            type="button"
            className="rc-slot-nome"
            onClick={() => (ehArma && modelo ? onAbrirAtaque(inst, modelo) : onUsarItem(inst, modelo))}
            title={`${inst.itemNome} — ${ehArma ? "abrir ataque" : "usar item"}`}
          >
            {inst.itemNome}
          </button>

          {ehArma && modelo && (
            <>
              <span className="rc-slot-linha">
                {modelo.danoBase && <span className="rc-tag">{modelo.danoBase}</span>}
                {modelo.tipoDano && <span className="rc-tag">{modelo.tipoDano}</span>}
                {modelo.propertySlugs.slice(0, 2).map((p) => (
                  <span className="rc-tag" key={p}>
                    {p.replace(/_/g, " ")}
                  </span>
                ))}
              </span>
              {municaoMax != null && (
                <span className="rc-slot-linha">
                  <span className="rc-num">
                    {municaoAtual ?? 0}/{municaoMax} mun.
                  </span>
                  <button
                    type="button"
                    className="rc-slot-acao"
                    // stopPropagation: Recarregar não pode abrir o Ataque.
                    onClick={(e) => {
                      e.stopPropagation();
                      onRecarregar(inst);
                    }}
                    data-testid={`console-recarregar-${slot.id}`}
                  >
                    Recarregar
                  </button>
                </span>
              )}
            </>
          )}

          {ehArmadura && modelo?.mitMax != null && (
            <>
              <MiniTrilha
                atual={inst.mitAtual ?? modelo.mitMax}
                max={modelo.mitMax}
                rotulo="MIT"
                onDefinir={(v) => api.definirMit(inst.id, v)}
              />
              {modelo.tipoProtecao && (
                <span className="rc-slot-linha">
                  <span className="rc-tag rc-tag--am">{PROTECAO_LABEL[modelo.tipoProtecao] ?? modelo.tipoProtecao}</span>
                </span>
              )}
            </>
          )}

          {ehEscudo && modelo?.pdMax != null && (
            <MiniTrilha
              atual={inst.pdAtual ?? modelo.pdMax}
              max={modelo.pdMax}
              rotulo="PD"
              onDefinir={(v) => api.definirPd(inst.id, v)}
            />
          )}

          <button
            type="button"
            className="rc-slot-acao"
            onClick={(e) => {
              e.stopPropagation();
              api.desequipar(inst.id);
            }}
          >
            Desequipar
          </button>
        </span>
      </div>
    </div>
  );
}

/** Silhueta substituível — o SVG definitivo entra no lugar deste componente. */
function CorpoHumano() {
  return (
    <svg viewBox="0 0 120 300" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <ellipse cx="60" cy="30" rx="17" ry="21" />
      <path d="M53 50h14v10" />
      <path d="M60 58c-12 0-21 5-24 13l-4 32c-1 7-1 13 1 20l4 24h46l4-24c2-7 2-13 1-20l-4-32c-3-8-12-13-24-13z" />
      <path d="M36 72c-6 4-10 9-11 17l-7 44c-1 5-1 10 0 15l3 24M84 72c6 4 10 9 11 17l7 44c1 5 1 10 0 15l-3 24" />
      <path d="M42 157l-4 60c-1 8-2 16-3 24l-4 30h14l3-30c2-8 3-16 3-24l5-42 5 42c0 8 1 16 3 24l3 30h14l-4-30c-1-8-2-16-3-24l-4-60z" />
      <path d="M31 273h16M73 273h16" />
    </svg>
  );
}

export function EquipmentPanel({
  slots,
  api,
  onAbrirVazio,
  onAbrirAtaque,
  onUsarItem,
  onRecarregar,
}: {
  slots: BodySlot[];
  api: ConsoleApi;
  onAbrirVazio: (slot: BodySlotId) => void;
  onAbrirAtaque: (inst: InventoryItemInstance, modelo: ItemContent) => void;
  onUsarItem: (inst: InventoryItemInstance, modelo: ItemContent | undefined) => void;
  onRecarregar: (inst: InventoryItemInstance) => void;
}) {
  const por = (id: BodySlotId) => slots.find((s) => s.id === id)!;
  const comuns = { api, onAbrirVazio, onAbrirAtaque, onUsarItem, onRecarregar };
  const posicionados: BodySlotId[] = [
    "membro_superior",
    "escudo",
    "membro_inferior",
    "cabeca",
    "tronco",
    "arma_primaria",
    "arma_secundaria",
  ];

  return (
    <section className="rc-panel rc-equip" aria-label="Equipamentos">
      <span className="rc-caption">Equipamentos</span>

      <div className="rc-doll">
        <div className="rc-doll-figure">
          <CorpoHumano />
        </div>
        {posicionados.map((id) => (
          <SlotCard key={id} slot={por(id)} style={POSICAO[id]} {...comuns} />
        ))}
      </div>

      <div className="rc-doll-quick">
        <SlotCard slot={por("acesso_rapido_1")} {...comuns} />
        <SlotCard slot={por("acesso_rapido_2")} {...comuns} />
      </div>
    </section>
  );
}
