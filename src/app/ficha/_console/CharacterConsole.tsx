"use client";

/**
 * Console do Personagem — janela + abas + aba Visão Geral montada.
 *
 * Este componente ORQUESTRA: decide o que abrir e delega as ações para
 * `api`, que é o conjunto de handlers que `CharacterSheetClient` já
 * implementa. Nenhuma regra de domínio vive aqui.
 *
 * Layout (trocado a pedido — Perícias e Equipamentos inverteram de
 * lugar): Perícias + Fixados + Condições ficam FIXOS na coluna central
 * (abaixo de Colapso/Recursos), fora do sistema de abas. O trilho de
 * abas foi COM Equipamentos para a coluna direita — trocar de aba
 * troca o conteúdo de lá; só "Equipamentos" mostra conteúdo de verdade
 * por enquanto, as demais abas seguem placeholder (spec §7).
 *
 * Modos Painel/Foco (spec "Alteração do Console do Personagem: modos
 * Painel e Foco"): no Painel (comportamento de sempre), as colunas 1/2
 * ficam fixas e só a área de conteúdo troca de aba. No Foco, a janela
 * mostra só a aba ativa — as colunas 1/2 viram a aba especial
 * "Personagem", reaproveitando os MESMOS componentes (`IdentityAside`,
 * `VitalsRow`, `SkillsGrid`, `ConditionsPanel`, `PinsRow`) num layout
 * novo (`renderPersonagem`), não uma cópia do conteúdo.
 *
 * O estado do avatar (preview local — o projeto ainda não tem fluxo de
 * upload real, ver limitações) vive AQUI, não dentro de `IdentityAside`,
 * porque o console minimizado precisa mostrar a MESMA imagem.
 */

import { useMemo, useRef, useState } from "react";
import { ConsoleWindow } from "./ConsoleWindow";
import { Scrollbar } from "./scrollbar";
import { DecoTop } from "./deco";
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
  DefensePickerModal,
  ResistirAtributoModal,
  RollResultModal,
  SurgePickerModal,
  type TipoDefesa,
} from "./panels/AuxModals";
import { itensCompativeisComSlot, projectBodySlots, type BodySlotId } from "./slots";
import { ABAS, type AbaId } from "./tabs";
import type { ViewMode } from "./viewMode";
import { FOCO_MAX_W, FOCO_ALTURA_INICIAL } from "./geometry";
import type { ConsoleApi, ConsolePin } from "./types";
import type { CharacterAttributes, InventoryItemInstance, ItemContent } from "../../../lib/character";
import type { RupturaRollResult } from "../../../lib/dice/types";

/** Estado do modal auxiliar aberto no momento (um por vez). */
type Aux =
  | { tipo: "rolagem"; resultado: RupturaRollResult; defesa?: { usouReacao: boolean; penalidade: number; defesasSemReacao: number } }
  | { tipo: "surto" }
  | { tipo: "mochila"; slot: BodySlotId }
  | { tipo: "ataque"; instancia: InventoryItemInstance; modelo: ItemContent }
  | { tipo: "recarga"; instancia: InventoryItemInstance }
  | { tipo: "condicao" }
  | { tipo: "defesa" }
  | { tipo: "resistir-atributo" }
  | { tipo: "aviso"; titulo: string; mensagem: string }
  | null;

export function CharacterConsole({ aberto, onClose, api }: { aberto: boolean; onClose: () => void; api: ConsoleApi }) {
  const [aba, setAba] = useState<AbaId>("equipamentos");
  const [viewMode, setViewMode] = useState<ViewMode>("painel");
  const [aux, setAux] = useState<Aux>(null);
  const tabpanelRef = useRef<HTMLDivElement>(null);

  /** Última aba de NAVEGAÇÃO (nunca "personagem") — pra restaurar ao
      voltar pro Painel enquanto "Personagem" estava ativa (spec). */
  const ultimaAbaConvencionalRef = useRef<Exclude<AbaId, "personagem">>("equipamentos");

  function escolherAba(id: AbaId) {
    if (id !== "personagem") ultimaAbaConvencionalRef.current = id;
    setAba(id);
  }

  function alternarViewMode(novo: ViewMode) {
    // Voltar pro Painel com "Personagem" ativa não tem pra onde ir — o
    // Painel não tem essa aba — então restaura a última convencional.
    if (novo === "painel" && aba === "personagem") setAba(ultimaAbaConvencionalRef.current);
    setViewMode(novo);
  }

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
  function onAdicionarCondicao() {
    setAux({ tipo: "condicao" });
  }
  function onDetalhesCondicao(id: string) {
    const c = (api.character.condicoes_ativas ?? []).find((x) => x.id === id);
    setAux({ tipo: "aviso", titulo: c?.nome ?? "Condição", mensagem: c?.descricao ?? "Sem descrição registrada." });
  }
  function onAbrirPin(p: ConsolePin) {
    setAux({ tipo: "aviso", titulo: p.nome, mensagem: `Abrir ${p.tipo} (${p.ref}) — fluxo definitivo pendente.` });
  }
  // Regra "AÇÕES DEFENSIVAS": Esquivar e Bloquear testam Reflexos,
  // Aparar testa Luta — todas perícias reais (`regras_personagem`,
  // atributo Corpo). "Resistir" não tem perícia fixa (o narrador
  // decide entre Vigor/Mobilidade conforme a situação), então abre um
  // segundo passo em vez de rolar direto.
  const PERICIA_DEFESA: Partial<Record<TipoDefesa, string>> = { esquivar: "reflexos", bloquear: "reflexos", aparar: "luta" };
  function onEscolherDefesa(tipo: TipoDefesa) {
    if (tipo === "resistir") {
      setAux({ tipo: "resistir-atributo" });
      return;
    }
    // Regra "Reação": rolar qualquer defesa gasta 1 Reação — sem
    // sobra, a defesa ainda acontece, só que com a penalidade
    // cumulativa da rodada já aplicada na própria rolagem
    // (`rolarDefesa` decide isso via `spendReactionForDefense`, não o
    // Console).
    const { resultado, ...defesa } = api.rolarDefesa(PERICIA_DEFESA[tipo]!);
    setAux({ tipo: "rolagem", resultado, defesa });
  }
  function onEscolherResistir(periciaId: "vigor" | "mobilidade") {
    const { resultado, ...defesa } = api.rolarDefesa(periciaId);
    setAux({ tipo: "rolagem", resultado, defesa });
  }

  /** Conteúdo da aba de NAVEGAÇÃO ativa — reusado sem mudanças tanto no
      Painel (`.rc-tabsarea-outer`) quanto no Foco (mesma estrutura,
      só a largura disponível muda). */
  function renderConteudoAba() {
    return (
      <div className="rc-tabsarea-outer">
        <div className="rc-tabsarea-main">
          {/* Decoração fica FORA do `.rc-tabpanel`: ele rola por dentro
              (`overflow: auto`), e um filho absoluto em `top: 0` ali
              rolaria junto com o conteúdo. `.rc-tabsarea-main` já é
              `position: relative` (âncora das scrollbars) e o tabpanel
              é o primeiro filho, então `top: 0` daqui cai exatamente na
              borda de cima dele. A aba de Equipamentos tem a sua
              própria, no `.rc-eq-card-outer`. */}
          {aba !== "equipamentos" && <DecoTop />}
          <div className="rc-tabpanel" role="tabpanel" ref={tabpanelRef}>
            {aba === "equipamentos" ? (
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
              <div className="rc-tab-vazio">
                <span>{ABAS.find((a) => a.id === aba)?.label}</span>
                <span className="rc-vazio">Esta aba será implementada em outra etapa.</span>
              </div>
            )}
          </div>
          <Scrollbar targetRef={tabpanelRef} orientacao="vertical" />
          <Scrollbar targetRef={tabpanelRef} orientacao="horizontal" />
        </div>
      </div>
    );
  }

  /** Conteúdo da aba especial "Personagem" (só no Foco) — MESMOS
      componentes das colunas 1/2 do Painel, layout lado a lado num
      wrapper novo (`.rc-foco-personagem`) em vez de colunas de grid. */
  function renderPersonagem() {
    return (
      <div className="rc-foco-personagem">
        <IdentityAside
          api={api}
          avatarUrl={avatarUrl}
          avatarErro={avatarErro}
          onAvatarChange={onAvatarChange}
          onRolarAtributo={rolarAtributo}
          onEscolherSurto={() => setAux({ tipo: "surto" })}
          onRolarDefesa={() => setAux({ tipo: "defesa" })}
        />
        <div className="rc-foco-personagem-col2">
          <VitalsRow api={api} onEstabilizar={api.estabilizarColapso} />
          <div className="rc-center-lower">
            <SkillsGrid api={api} onRolar={rolarPericia} />
            <ConditionsPanel api={api} onAdicionar={onAdicionarCondicao} onDetalhes={onDetalhesCondicao} />
            <PinsRow api={api} onAbrirPin={onAbrirPin} />
            {api.erro && (
              <p className="rc-vazio" role="alert" style={{ color: "#ffc4cf" }}>
                {api.erro}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <ConsoleWindow
        aberto={aberto}
        onClose={onClose}
        titulo="Console do Personagem"
        dockContent={<MinimizedDockContent api={api} avatarUrl={avatarUrl} />}
        tablist={<TabRail aba={aba} onChangeAba={escolherAba} viewMode={viewMode} onChangeViewMode={alternarViewMode} />}
        larguraMaximaFixa={viewMode === "foco" ? FOCO_MAX_W : undefined}
        alturaFallbackInicial={viewMode === "foco" ? FOCO_ALTURA_INICIAL : undefined}
        conteudoChave={`${viewMode}:${aba}`}
      >
        {viewMode === "painel" ? (
          <div className="rc-grid">
            <IdentityAside
              api={api}
              avatarUrl={avatarUrl}
              avatarErro={avatarErro}
              onAvatarChange={onAvatarChange}
              onRolarAtributo={rolarAtributo}
              onEscolherSurto={() => setAux({ tipo: "surto" })}
              onRolarDefesa={() => setAux({ tipo: "defesa" })}
            />

            <VitalsRow api={api} onEstabilizar={api.estabilizarColapso} />

            {/* Antigo lugar de Equipamentos — agora Perícias, fixo, fora
                do sistema de abas. Fixados e Condições acompanham. */}
            <div className="rc-center-lower">
              <SkillsGrid api={api} onRolar={rolarPericia} />
              <ConditionsPanel api={api} onAdicionar={onAdicionarCondicao} onDetalhes={onDetalhesCondicao} />
              <PinsRow api={api} onAbrirPin={onAbrirPin} />
              {api.erro && (
                <p className="rc-vazio" role="alert" style={{ color: "#ffc4cf" }}>
                  {api.erro}
                </p>
              )}
            </div>

            {renderConteudoAba()}
          </div>
        ) : (
          <div className="rc-foco-content">{aba === "personagem" ? renderPersonagem() : renderConteudoAba()}</div>
        )}
      </ConsoleWindow>

      {/* Modais auxiliares NÃO passam pelo portal de ConsoleWindow — sem
          este wrapper, o cursor nativo voltaria a aparecer sobre eles
          (o HudCursor global continua rastreando a posição normalmente,
          só falta a regra `cursor:none` alcançar este ramo da árvore). */}
      <div className="rc-cursor-scope">
      {aux?.tipo === "rolagem" && <RollResultModal resultado={aux.resultado} defesa={aux.defesa} onFechar={() => setAux(null)} />}

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

      {aux?.tipo === "defesa" && <DefensePickerModal onEscolher={onEscolherDefesa} onFechar={() => setAux(null)} />}

      {aux?.tipo === "resistir-atributo" && <ResistirAtributoModal onEscolher={onEscolherResistir} onFechar={() => setAux(null)} />}

      {aux?.tipo === "aviso" && (
        <ConfirmModal titulo={aux.titulo} mensagem={aux.mensagem} onConfirmar={() => setAux(null)} onFechar={() => setAux(null)} />
      )}
      </div>
    </>
  );
}
