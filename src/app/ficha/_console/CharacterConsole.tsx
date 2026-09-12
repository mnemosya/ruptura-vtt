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

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BYTES_ORIGINAL_MAXIMO,
  ImagemRecusadaError,
  enviarParaUrlAssinada,
  prepararRecorteQuadrado,
} from "../../../lib/vtt/imagePreparation";
import {
  cancelarUploadAction,
  definirAvatarPersonagemAction,
  finalizarUploadAvatarAction,
  lerAvatarAssinadoAction,
  reservarUploadAction,
} from "../../mesas/[campaignId]/vtt/_acoes/imageActions";
import { JanelaRecorte } from "./RecorteImagem";
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
import { FaixaEvolucao, ModoChip, VerNoMapaChip } from "./panels/ModoEvolucao";
import {
  AttackModal,
  BackpackPickerModal,
  ConditionPickerModal,
  ConfirmModal,
  DefensePickerModal,
  ResistirAtributoModal,
  SurgePickerModal,
  type TipoDefesa,
} from "./panels/AuxModals";
import { itensCompativeisComSlot, projectBodySlots, type BodySlotId } from "./slots";
import { ABAS, type AbaId } from "./tabs";
import type { ViewMode } from "./viewMode";
import { FOCO_MAX_W, FOCO_ALTURA_INICIAL } from "./geometry";
import { PainelRolagem, type PrefillRolagem } from "./panels/PainelRolagem";
import type { ConsoleApi, ConsolePin } from "./types";
import type { CharacterAttributes, InventoryItemInstance, ItemContent } from "../../../lib/character";

/** Estado do modal auxiliar aberto no momento (um por vez). */
type Aux =
  | { tipo: "rolagem"; prefill: PrefillRolagem }
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
  const [aba, setAba] = useState<AbaId>("personagem");
  /**
   * FOCO é o padrão de abertura: o Console abre na ficha do
   * personagem, não numa aba de gestão. Painel continua a um clique no
   * trilho, para quem quer as colunas fixas ao lado da aba ativa.
   */
  const [viewMode, setViewMode] = useState<ViewMode>("foco");
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

  /**
   * AVATAR. Até a 0104 isto era só `URL.createObjectURL(file)` — preview
   * em memória que morria ao fechar o console, porque não havia fluxo
   * de upload no projeto. Agora tem, e o avatar da ficha é a FONTE: o
   * token do personagem herda esta imagem quando não tem retrato
   * próprio (0105).
   *
   * O arquivo escolhido não sobe direto: passa pelo enquadramento
   * (`RecorteImagem`), porque o avatar é desenhado dentro de um
   * hexágono e foto retangular em hexágono corta rosto. O recorte
   * acontece ANTES do hash — o arquivo armazenado já é o que se vê.
   *
   * Ficha sem mesa (`api.mesa === null`) continua com preview local e
   * nada mais: o arquivo pertence à CAMPANHA (é dela a quota e o caminho
   * no Storage), e um rascunho pessoal não tem campanha a que pertencer.
   */
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarErro, setAvatarErro] = useState<string | null>(null);
  const [avatarParaRecortar, setAvatarParaRecortar] = useState<File | null>(null);
  const [avatarEnviando, setAvatarEnviando] = useState(false);
  const mesa = api.mesa;

  // A URL assinada do avatar já gravado. O id é coluna de `characters`
  // (não vem no payload do console), então quem resolve id → assinatura
  // é o servidor, numa ida só. Recarrega ao abrir e a cada 4 min — as
  // URLs valem 5.
  const campaignId = mesa?.campaignId ?? null;
  const characterId = mesa?.characterId ?? null;
  useEffect(() => {
    if (!aberto || !campaignId || !characterId) return;
    let vivo = true;
    const buscar = () => {
      void lerAvatarAssinadoAction(campaignId, characterId).then((r) => {
        if (vivo && r.ok && r.dados?.url) setAvatarUrl(r.dados.url);
      });
    };
    buscar();
    const timer = setInterval(buscar, 4 * 60 * 1000);
    return () => { vivo = false; clearInterval(timer); };
  }, [aberto, campaignId, characterId]);

  function onAvatarChange(file: File) {
    setAvatarErro(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setAvatarErro("Formato inválido — use PNG, JPEG ou WebP.");
      return;
    }
    // Teto do ORIGINAL, antes de decodificar. O recorte reduz muito, mas
    // um arquivo gigante trava o navegador antes de chegar lá.
    if (file.size > BYTES_ORIGINAL_MAXIMO) {
      setAvatarErro("Imagem grande demais — até 30 MB.");
      return;
    }
    if (!mesa) {
      // Sem mesa não há onde guardar; o preview local é o que sempre foi.
      setAvatarUrl(URL.createObjectURL(file));
      setAvatarErro("Esta ficha não está numa mesa — a imagem vale só nesta sessão.");
      return;
    }
    setAvatarParaRecortar(file);
  }

  async function enviarAvatarRecortado(recorte: { x: number; y: number; tamanho: number }) {
    const arquivo = avatarParaRecortar;
    if (!arquivo || !mesa) return;
    setAvatarEnviando(true);
    setAvatarErro(null);
    let reservaId: string | null = null;
    try {
      const preparada = await prepararRecorteQuadrado(arquivo, recorte);
      const reserva = await reservarUploadAction(
        mesa.campaignId, preparada.sha256, "avatar", null, mesa.characterId,
      );
      if (!reserva.ok || !reserva.dados) throw new Error(reserva.erro ?? "Não foi possível preparar o envio.");
      reservaId = reserva.dados.reservaId;

      if (reserva.dados.reutilizado) {
        // Mesma cara já está na campanha: liga direto, sem subir de novo.
        const r = await definirAvatarPersonagemAction(mesa.campaignId, mesa.characterId, reserva.dados.assetId);
        if (!r.ok) throw new Error(r.erro ?? "Não foi possível definir o avatar.");
      } else {
        await enviarParaUrlAssinada(reserva.dados.uploadUrl!, preparada.blob);
        const r = await finalizarUploadAvatarAction(
          mesa.campaignId, reserva.dados.reservaId!, preparada.sha256, mesa.characterId,
        );
        if (!r.ok) throw new Error(r.erro ?? "Não foi possível concluir o envio.");
      }

      // Mostra o recorte local na hora; a URL assinada chega logo em
      // seguida pelo efeito acima e substitui esta sem piscar.
      setAvatarUrl(preparada.previewUrl);
      setAvatarParaRecortar(null);
    } catch (e) {
      // Reserva viva sem uso prende quota até vencer; devolver aqui é
      // cortesia (a coleta resolve de qualquer jeito).
      if (reservaId && mesa) void cancelarUploadAction(mesa.campaignId, reservaId).catch(() => {});
      setAvatarErro(e instanceof ImagemRecusadaError || e instanceof Error
        ? e.message : "Não foi possível enviar a imagem.");
    } finally {
      setAvatarEnviando(false);
    }
  }

  const inventario = useMemo(() => api.character.inventario ?? [], [api.character.inventario]);
  const projecao = useMemo(
    () => projectBodySlots(inventario as InventoryItemInstance[], api.catalogo),
    [inventario, api.catalogo],
  );

  // Clicar num atributo ou numa perícia ABRE a ferramenta já
  // preenchida — não rola. Rolar é o botão: até apertá-lo dá pra
  // trocar a perícia, mexer no modificador e pôr uma CD.
  function rolarAtributo(id: keyof CharacterAttributes) {
    setAux({ tipo: "rolagem", prefill: { tipo: "atributo", atributoId: id } });
  }
  function rolarPericia(id: string) {
    setAux({ tipo: "rolagem", prefill: { tipo: "pericia", periciaId: id } });
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
  const NOME_DEFESA: Record<TipoDefesa, string> = { esquivar: "Esquivar", bloquear: "Bloquear", aparar: "Aparar", resistir: "Resistir" };
  function onEscolherDefesa(tipo: TipoDefesa) {
    if (tipo === "resistir") {
      setAux({ tipo: "resistir-atributo" });
      return;
    }
    // Regra "Reação": rolar qualquer defesa gasta 1 Reação — sem
    // sobra, a defesa ainda acontece, só que com a penalidade
    // cumulativa da rodada já aplicada na própria rolagem. Quem gasta
    // é o painel, no instante do clique em "Rolar" (`prepararDefesa`):
    // abrir a ferramenta e desistir não pode consumir Reação.
    setAux({ tipo: "rolagem", prefill: { tipo: "defesa", periciaId: PERICIA_DEFESA[tipo]!, acao: NOME_DEFESA[tipo] } });
  }
  function onEscolherResistir(periciaId: "vigor" | "mobilidade") {
    setAux({ tipo: "rolagem", prefill: { tipo: "defesa", periciaId, acao: NOME_DEFESA.resistir } });
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
        titlebarExtra={
          <>
            <VerNoMapaChip />
            <ModoChip modo={api.modo} onAlternar={api.definirModo} />
          </>
        }
        dockContent={<MinimizedDockContent api={api} avatarUrl={avatarUrl} />}
        tablist={<TabRail aba={aba} onChangeAba={escolherAba} viewMode={viewMode} onChangeViewMode={alternarViewMode} />}
        larguraMaximaFixa={viewMode === "foco" ? FOCO_MAX_W : undefined}
        alturaFallbackInicial={viewMode === "foco" ? FOCO_ALTURA_INICIAL : undefined}
        conteudoChave={`${viewMode}:${aba}`}
      >
        <FaixaEvolucao api={api} />
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
      {/* Enquadramento do avatar. Fica no mesmo ramo dos modais
          auxiliares (e não dentro do painel lateral) porque precisa de
          espaço: a janela de recorte tem 240 px e a coluna da esquerda
          não tem isso. */}
      {avatarParaRecortar && (
        <JanelaRecorte
          titulo="Enquadrar o avatar"
          codigo="Avatar"
          erro={avatarErro}
          arquivo={avatarParaRecortar}
          forma="hexagono"
          ocupado={avatarEnviando}
          rotuloConfirmar="Salvar avatar"
          onConfirmar={(r) => { void enviarAvatarRecortado(r); }}
          onCancelar={() => { setAvatarParaRecortar(null); setAvatarErro(null); }}
        />
      )}
      {aux?.tipo === "rolagem" && (
        // `key` pelo que foi pedido: sem backdrop, clicar noutra perícia
        // com a ferramenta aberta é um gesto normal — e ela tem que
        // REABRIR preenchida com a nova, não continuar mostrando a
        // anterior (o estado interno nasce do `prefill`).
        <PainelRolagem
          key={aux.prefill.tipo === "atributo" ? `a:${aux.prefill.atributoId}` : `${aux.prefill.tipo}:${aux.prefill.periciaId}`}
          api={api}
          prefill={aux.prefill}
          onFechar={() => setAux(null)}
        />
      )}

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
