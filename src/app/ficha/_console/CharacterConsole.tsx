"use client";

/**
 * Console do Personagem — janela + abas + aba Visão Geral montada.
 *
 * Este componente ORQUESTRA: decide o que abrir e delega as ações para
 * `api`, que é o conjunto de handlers que `CharacterSheetClient` já
 * implementa. Nenhuma regra de domínio vive aqui.
 *
 * Só a Visão Geral é implementada nesta etapa; as demais abas existem
 * no trilho lateral, trocam e mostram um estado discreto (spec §7).
 *
 * O estado do avatar (preview local — o projeto ainda não tem fluxo de
 * upload real, ver limitações) vive AQUI, não dentro de `IdentityAside`,
 * porque o console minimizado precisa mostrar a MESMA imagem.
 */

import { useMemo, useState } from "react";
import { ConsoleWindow } from "./ConsoleWindow";
import { IdentityAside } from "./panels/IdentityAside";
import { VitalsRow } from "./panels/VitalsRow";
import { EquipmentPanel } from "./panels/EquipmentPanel";
import { SkillsGrid } from "./panels/SkillsGrid";
import { TabRail } from "./panels/TabRail";
import { MinimizedDockContent } from "./panels/MinimizedDockContent";
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
import { ABAS, type AbaId } from "./tabs";
import type { ConsoleApi, ConsolePin } from "./types";
import type { CharacterAttributes, InventoryItemInstance, ItemContent } from "../../../lib/character";
import type { RupturaRollResult } from "../../../lib/dice/types";

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

  // Avatar: preview local só (ver limitações — sem fluxo de upload real
  // no projeto). Vive aqui para o console minimizado mostrar a mesma imagem.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarErro, setAvatarErro] = useState<string | null>(null);
  function onAvatarChange(file: File) {
    setAvatarErro(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setAvatarErro("Formato inválido — use PNG, JPEG ou WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarErro("Imagem acima de 2 MB.");
      return;
    }
    setAvatarUrl(URL.createObjectURL(file));
  }

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

  return (
    <>
      <ConsoleWindow
        aberto={aberto}
        onClose={onClose}
        titulo="Console do Personagem"
        dockContent={<MinimizedDockContent api={api} avatarUrl={avatarUrl} />}
      >
        <div className="rc-grid">
          <IdentityAside
            api={api}
            avatarUrl={avatarUrl}
            avatarErro={avatarErro}
            onAvatarChange={onAvatarChange}
            onRolarAtributo={rolarAtributo}
            onEscolherSurto={() => setAux({ tipo: "surto" })}
          />

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

          <div className="rc-tabsarea-outer">
            <div className="rc-tabsarea">
              <div className="rc-tabsarea-main">
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

              <TabRail aba={aba} onChange={setAba} />
            </div>
          </div>
        </div>
      </ConsoleWindow>

      {/* Modais auxiliares NÃO passam pelo portal de ConsoleWindow — sem
          este wrapper, o cursor nativo voltaria a aparecer sobre eles
          (o HudCursor global continua rastreando a posição normalmente,
          só falta a regra `cursor:none` alcançar este ramo da árvore). */}
      <div className="rc-cursor-scope">
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
      </div>
    </>
  );
}
