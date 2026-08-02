"use client";

/**
 * Equipamentos — corpo ao centro e slots ao redor, nas posições do
 * wireframe, cada um ligado à região correspondente por um traço.
 *
 * Armaduras mostram trilha de MIT + tipo de resistência; escudo mostra
 * PD; armas mostram dano, propriedades e munição com ação de recarga.
 * Todos esses dados vêm do modelo publicado (`ItemContent`) — nada é
 * inventado aqui. Slot vazio abre a Mochila já filtrada pelo slot.
 */

import { HardHat, Shirt, Hand, Footprints, Shield, Swords, Crosshair, Package } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  getWeaponAmmoAtual,
  getWeaponAmmoMax,
  type InventoryItemInstance,
  type ItemContent,
} from "../../../../lib/character";
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
                onDefinir(cheio ? i : i + 1);
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
  api,
  onAbrirVazio,
  onAbrirAtaque,
  onUsarItem,
  onRecarregar,
}: {
  slot: BodySlot;
  api: ConsoleApi;
  onAbrirVazio: (slot: BodySlotId) => void;
  onAbrirAtaque: (inst: InventoryItemInstance, modelo: ItemContent) => void;
  onUsarItem: (inst: InventoryItemInstance, modelo: ItemContent | undefined) => void;
  onRecarregar: (inst: InventoryItemInstance) => void;
}) {
  const Icone = ICONES[slot.id];
  const inst = slot.instance;
  const modelo = inst ? api.catalogo.get(inst.itemSlug) : undefined;

  if (!inst) {
    return (
      <button
        type="button"
        className="rc-slot"
        data-preenchido={false}
        data-testid={`console-slot-${slot.id}`}
        onClick={() => onAbrirVazio(slot.id)}
        aria-label={`${BODY_SLOT_LABELS[slot.id]}: vazio. Abrir mochila filtrada`}
      >
        <Icone size={15} className="rc-slot-ico" aria-hidden="true" />
        <span className="rc-slot-main">
          <span className="rc-slot-label">{slot.label}</span>
          <span className="rc-slot-nome" data-vazio="true">
            vazio
          </span>
        </span>
      </button>
    );
  }

  const ehArma = modelo?.categoria === "arma";
  const ehArmadura = modelo?.categoria === "armadura";
  const ehEscudo = modelo?.categoria === "escudo";
  const municaoMax = modelo ? getWeaponAmmoMax(modelo) : null;
  const municaoAtual = getWeaponAmmoAtual(inst);

  return (
    <div
      className="rc-slot"
      data-preenchido="true"
      data-testid={`console-slot-${slot.id}`}
      role="group"
      aria-label={`${BODY_SLOT_LABELS[slot.id]}: ${inst.itemNome}`}
    >
      <Icone size={15} className="rc-slot-ico" aria-hidden="true" />
      <span className="rc-slot-main">
        <span className="rc-slot-label">{slot.label}</span>
        <button
          type="button"
          className="rc-slot-nome"
          style={{ background: "none", border: "none", padding: 0, textAlign: "left", color: "inherit" }}
          onClick={() => (ehArma && modelo ? onAbrirAtaque(inst, modelo) : onUsarItem(inst, modelo))}
          title={ehArma ? "Abrir ataque" : "Usar item"}
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

  return (
    <section className="rc-panel rc-equip" aria-label="Equipamentos">
      <span className="rc-caption">Equipamentos</span>
      <div className="rc-doll">
        <div className="rc-doll-col">
          <SlotCard slot={por("membro_superior")} {...comuns} />
          <SlotCard slot={por("membro_inferior")} {...comuns} />
          <SlotCard slot={por("escudo")} {...comuns} />
        </div>

        <div className="rc-doll-figure">
          <CorpoHumano />
        </div>

        <div className="rc-doll-col">
          <SlotCard slot={por("cabeca")} {...comuns} />
          <SlotCard slot={por("tronco")} {...comuns} />
          <SlotCard slot={por("arma_primaria")} {...comuns} />
          <SlotCard slot={por("arma_secundaria")} {...comuns} />
        </div>

        <div className="rc-doll-quick">
          <SlotCard slot={por("acesso_rapido_1")} {...comuns} />
          <SlotCard slot={por("acesso_rapido_2")} {...comuns} />
        </div>
      </div>
    </section>
  );
}
