"use client";

/**
 * Console do Personagem — janela + abas + aba Visão Geral montada.
 *
 * Este componente ORQUESTRA: decide o que abrir e delega as ações para
 * `api`, que é o conjunto de handlers que `CharacterSheetClient` já
 * implementa. Nenhuma regra de domínio vive aqui.
 *
 * Só a Visão Geral é implementada nesta etapa; as demais abas existem,
 * trocam e mostram um estado discreto (spec §7).
 */

import { useMemo, useState } from "react";
import { ConsoleWindow } from "./ConsoleWindow";
import { IdentityAside } from "./panels/IdentityAside";
import { VitalsRow } from "./panels/VitalsRow";
import { EquipmentPanel } from "./panels/EquipmentPanel";
import { SkillsGrid } from "./panels/SkillsGrid";
import { PinsRow, ConditionsPanel } from "./panels/PinsAndConditions";
import {
  AttackModal,
  BackpackPickerModal,
  ConditionPickerModal,
  ConfirmModal,
  RollResultModal,
  SurgePickerModal,
} from "./panels/AuxModals";
import { itensCompativeisComSlot, projectBodySlots, type BodySlotId } from "./slots";
import type { ConsoleApi, ConsolePin } from "./types";
import type { CharacterAttributes, InventoryItemInstance, ItemContent } from "../../../lib/character";
import type { RupturaRollResult } from "../../../lib/dice/types";

const ABAS = [
  { id: "visao_geral", label: "Visão Geral" },
  { id: "magias", label: "Magias" },
  { id: "mochila", label: "Mochila" },
  { id: "escalpos", label: "Escalpos" },
  { id: "caracteristicas", label: "Características" },
  { id: "acoes", label: "Ações" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

/** Estado do modal auxiliar aberto no momento (um por vez). */
type Aux =
  | { tipo: "rolagem"; resultado: RupturaRollResult }
  | { tipo: "surto" }
  | { tipo: "mochila"; slot: BodySlotId }
  | { tipo: "ataque"; instancia: InventoryItemInstance; modelo: ItemContent }
  | { tipo: "recarga"; instancia: InventoryItemInstance }
  | { tipo: "condicao" }
  | { tipo: "aviso"; titulo: string; mensagem: string }
  | null;

export function CharacterConsole({ aberto, onClose, api }: { aberto: boolean; onClose: () => void; api: ConsoleApi }) {
  const [aba, setAba] = useState<AbaId>("visao_geral");
  const [aux, setAux] = useState<Aux>(null);

  const inventario = useMemo(() => api.character.inventario ?? [], [api.character.inventario]);
  const projecao = useMemo(
    () => projectBodySlots(inventario as InventoryItemInstance[], api.catalogo),
    [inventario, api.catalogo],
  );

  function rolarAtributo(id: keyof CharacterAttributes) {
    setAux({ tipo: "rolagem", resultado: api.rolarAtributo(id) });
  }
  function rolarPericia(id: string) {
    setAux({ tipo: "rolagem", resultado: api.rolarPericia(id) });
  }

  const dock = {
    nome: api.character.nome || "Sem nome",
    trilhas: [
      { chave: "pv", atual: api.character.recursos_atuais?.pv ?? api.derivados.pv_max, max: api.derivados.pv_max, cor: "#e0455e" },
      { chave: "pe", atual: api.character.recursos_atuais?.pe ?? api.derivados.pe_max, max: api.derivados.pe_max, cor: "#9a6cff" },
      { chave: "mana", atual: api.character.recursos_atuais?.mana ?? api.derivados.mana_max, max: api.derivados.mana_max, cor: "#3aa6f0" },
    ],
  };

  return (
    <>
      <ConsoleWindow aberto={aberto} onClose={onClose} titulo="Console do Personagem" dock={dock}>
        <div className="rc-grid">
          <IdentityAside api={api} onRolarAtributo={rolarAtributo} onEscolherSurto={() => setAux({ tipo: "surto" })} />

          <VitalsRow api={api} onEstabilizar={api.estabilizarColapso} />

          {aba === "visao_geral" ? (
            <EquipmentPanel
              slots={projecao.slots}
              api={api}
              onAbrirVazio={(slot) => setAux({ tipo: "mochila", slot })}
              onAbrirAtaque={(instancia, modelo) => setAux({ tipo: "ataque", instancia, modelo })}
              onUsarItem={(instancia, modelo) =>
                setAux({
                  tipo: "aviso",
                  titulo: instancia.itemNome,
                  mensagem: modelo?.descricao_curta ?? "A ação definitiva deste item entra no lugar deste aviso.",
                })
              }
              onRecarregar={(instancia) => setAux({ tipo: "recarga", instancia })}
            />
          ) : (
            <section className="rc-panel rc-equip" aria-label="Conteúdo da aba">
              <div className="rc-tab-vazio">
                <span>{ABAS.find((a) => a.id === aba)?.label}</span>
                <span className="rc-vazio">Esta aba será implementada em outra etapa.</span>
              </div>
            </section>
          )}

          <div className="rc-tabsarea">
            <div className="rc-tabs" role="tablist" aria-label="Seções do console">
              {ABAS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={aba === a.id}
                  className="rc-tab"
                  onClick={() => setAba(a.id)}
                  data-testid={`console-tab-${a.id}`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            <div className="rc-tabpanel" role="tabpanel">
              {aba === "visao_geral" ? (
                <SkillsGrid api={api} onRolar={rolarPericia} />
              ) : (
                <div className="rc-tab-vazio">
                  <span className="rc-vazio">Conteúdo pendente.</span>
                </div>
              )}
            </div>

            <PinsRow
              api={api}
              onAbrirPin={(p: ConsolePin) =>
                setAux({ tipo: "aviso", titulo: p.nome, mensagem: `Abrir ${p.tipo} (${p.ref}) — fluxo definitivo pendente.` })
              }
            />

            <ConditionsPanel
              api={api}
              onAdicionar={() => setAux({ tipo: "condicao" })}
              onDetalhes={(id) => {
                const c = (api.character.condicoes_ativas ?? []).find((x) => x.id === id);
                setAux({ tipo: "aviso", titulo: c?.nome ?? "Condição", mensagem: c?.descricao ?? "Sem descrição registrada." });
              }}
            />

            {api.erro && (
              <p className="rc-vazio" role="alert" style={{ color: "#ffc4cf" }}>
                {api.erro}
              </p>
            )}
          </div>
        </div>
      </ConsoleWindow>

      {aux?.tipo === "rolagem" && <RollResultModal resultado={aux.resultado} onFechar={() => setAux(null)} />}

      {aux?.tipo === "surto" && (
        <SurgePickerModal
          tipos={api.tiposDeSurto}
          onEscolher={(t) => {
            api.usarSobrecarga(t);
            setAux(null);
          }}
          onFechar={() => setAux(null)}
        />
      )}

      {aux?.tipo === "mochila" && (
        <BackpackPickerModal
          slot={aux.slot}
          itens={itensCompativeisComSlot(inventario as InventoryItemInstance[], api.catalogo, aux.slot)}
          catalogo={api.catalogo}
          onEquipar={(instanceId) => {
            api.equiparNoSlot(instanceId, aux.slot);
            setAux(null);
          }}
          onFechar={() => setAux(null)}
        />
      )}

      {aux?.tipo === "ataque" && <AttackModal instancia={aux.instancia} modelo={aux.modelo} onFechar={() => setAux(null)} />}

      {aux?.tipo === "recarga" && (
        <ConfirmModal
          titulo="Recarregar"
          mensagem={`Recarregar ${aux.instancia.itemNome} usando a munição do inventário?`}
          onConfirmar={() => {
            api.recarregar(aux.instancia.id);
            setAux(null);
          }}
          onFechar={() => setAux(null)}
        />
      )}

      {aux?.tipo === "condicao" && (
        <ConditionPickerModal
          disponiveis={api.condicoesDisponiveis}
          onAplicar={(c) => {
            api.adicionarCondicao({ conditionId: c.slug, nome: c.nome, descricao: "", origem: "Console", duracao: "" });
            setAux(null);
          }}
          onFechar={() => setAux(null)}
        />
      )}

      {aux?.tipo === "aviso" && (
        <ConfirmModal titulo={aux.titulo} mensagem={aux.mensagem} onConfirmar={() => setAux(null)} onFechar={() => setAux(null)} />
      )}
    </>
  );
}
