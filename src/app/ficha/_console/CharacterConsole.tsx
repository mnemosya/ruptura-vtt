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
import { Eye } from "lucide-react";
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
import { InventarioPanel } from "./panels/InventarioPanel";
import { MagiasPanel } from "./panels/MagiasPanel";
import { EscalposPanel } from "./panels/EscalposPanel";
import { SkillsGrid } from "./panels/SkillsGrid";
import { TabRail } from "./panels/TabRail";
import { MinimizedDockContent } from "./panels/MinimizedDockContent";
import { PinsRow, ConditionsPanel } from "./panels/PinsAndConditions";
import { AvancoChip, CompletarCriacaoChip, DescansoChip, ModoChip, GravacaoChip } from "./panels/ModoEvolucao";
import { useJanelasDaMesa } from "../../mesas/[campaignId]/vtt/_shell/JanelasDaMesa";
import dynamic from "next/dynamic";
import { useConsoleCloseOverride } from "./ConsoleCloseContext";
import type { RankingV12 } from "../../../lib/rulesetV12";
// A Forja de evolução (e o forja.css) só carregam quando alguém evolui.
const JanelaEvolucao = dynamic(() => import("../../mesas/[campaignId]/vtt/_painel/janelas/JanelaEvolucao").then((m) => m.JanelaEvolucao), { ssr: false });
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
import { FOCO_MAX_W, FOCO_ALTURA_INICIAL } from "./geometry";
import { PainelRolagem, type PrefillRolagem } from "./panels/PainelRolagem";
import { AvisoRecarga, JanelaRecarga } from "./panels/JanelaRecarga";
import { JanelaBancada } from "./panels/JanelaBancada";
import type { Bancada } from "../../../lib/character/supportLoadout";
import type { FonteRecarga } from "../../../lib/character/reloadSources";
import { useRolarNaMesa } from "../../mesas/[campaignId]/vtt/_dados3d/ContextoMesaDados";
import type { ConsoleApi, ConsolePin } from "./types";
import { parseTerceiroSegmentoThreshold, pisoPeNegativo, type CharacterAttributes, type InventoryItemInstance, type ItemContent } from "../../../lib/character";

/** Estado do modal auxiliar aberto no momento (um por vez). */
type Aux =
  | { tipo: "rolagem"; prefill: PrefillRolagem }
  | { tipo: "surto" }
  | { tipo: "mochila"; slot: BodySlotId }
  | { tipo: "ataque"; instancia: InventoryItemInstance; modelo: ItemContent; slot: BodySlotId }
  | { tipo: "bancada"; instancia: InventoryItemInstance; bancada: Bancada }
  | { tipo: "recarga"; instancia: InventoryItemInstance; fontes: FonteRecarga[]; padraoId: string | null; municao: { atual: number; max: number } }
  | { tipo: "condicao" }
  | { tipo: "defesa" }
  | { tipo: "resistir-atributo" }
  | { tipo: "retorno-colapso"; recurso: "pv" | "pe"; valor: number; desfecho: "morte" | "coma" }
  | { tipo: "aviso"; titulo: string; mensagem: string }
  | { tipo: "avanco"; alvo: RankingV12 }
  | null;

export function CharacterConsole({ aberto, onClose, api, abaInicial }: { aberto: boolean; onClose: () => void; api: ConsoleApi; abaInicial?: AbaId }) {
  const [aba, setAba] = useState<AbaId>(abaInicial ?? "personagem");
  /**
   * FOCO é o padrão de abertura: o Console abre na ficha do
   * personagem, não numa aba de gestão. Painel continua a um clique no
   * trilho, para quem quer as colunas fixas ao lado da aba ativa.
   */
  const [aux, setAux] = useState<Aux>(null);
  const [avisoRecarga, setAvisoRecarga] = useState<{ ok: boolean; mensagem: string; desfazer?: () => void; seq: number } | null>(null);
  const fecharAvisoRecarga = useMemo(() => () => setAvisoRecarga(null), []);
  /**
   * Recarga: direta quando não há decisão (uma fonte só, ou a fonte
   * PADRÃO da arma disponível) — com aviso e Desfazer; a janela de
   * escolha só abre quando há mais de uma fonte e nenhuma é padrão.
   * Armas fora desse modelo (célula de energia, aljava) seguem o fluxo
   * antigo de `recarregar`.
   */
  function avisar(r: { ok: boolean; mensagem: string; desfazer?: () => void }) {
    setAvisoRecarga({ ...r, seq: Date.now() });
  }
  function iniciarRecarga(instancia: InventoryItemInstance) {
    // Cartucheira/aljava: "recarregar" é ABASTECER — abre a bancada.
    if (instancia.aljava) {
      const bancada = api.bancadaSuporte(instancia.id);
      if (bancada) { setAux({ tipo: "bancada", instancia, bancada }); return; }
    }
    const info = api.fontesRecarga(instancia.id);
    if (!info) { api.recarregar(instancia.id); return; }
    if (info.cheia) { avisar({ ok: false, mensagem: "A arma já está cheia." }); return; }
    if (info.fontes.length === 0) { avisar({ ok: false, mensagem: "Sem munição compatível fora do abrigo." }); return; }
    const direta = info.fontes.find((f) => f.id === info.padraoId) ?? (info.fontes.length === 1 ? info.fontes[0] : null);
    if (direta) { avisar(api.recarregarDe(instancia.id, direta.id)); return; }
    const modelo = api.catalogo.get(instancia.itemSlug);
    setAux({ tipo: "recarga", instancia, fontes: info.fontes, padraoId: info.padraoId,
      municao: { atual: instancia.municaoAtual ?? 0, max: modelo?.municaoMax ?? 0 } });
  }
  const rolarNaMesa = useRolarNaMesa();
  /**
   * O dano psíquico do surto rola nos dados 3D da mesa (cor do PE): as
   * faces que pararem SÃO o dano. Sem mesa (fora do VTT) ou com fórmula
   * que não for NdS(+M), cai no sorteio de sempre.
   */
  async function rolarSurto(tipo: string) {
    const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(api.dadoDoSurto.replace(/\s+/g, ""));
    if (!rolarNaMesa || !m) { api.usarSobrecarga(tipo); return; }
    const pedido = Array.from({ length: Number(m[1]) }, (_, i) => ({ id: `surto-${i}`, sides: Number(m[2]) }));
    const fisicos = await rolarNaMesa(pedido, "#8d62e8");
    const total = fisicos.reduce((soma, d) => soma + d.value, 0) + (m[3] ? Number(m[3]) : 0);
    api.usarSobrecarga(tipo, Math.max(0, total));
  }
  /**
   * Personagem RUPTURA v1.2: o avanço de Ranking é o caminho da progressão;
   * o Modo Evolução continua ao lado, só para corrigir Atributos e Perícias
   * definidos na criação (o banco confere os limites do Ranking).
   */
  const rankingV12 = (() => {
    const c = api.character as unknown as { progressao?: { ranking?: string } };
    return typeof c.progressao?.ranking === "string" ? c.progressao.ranking : null;
  })();
  /** Criado só com o nome ("+ Personagem"): ainda falta passar pelo assistente v1.2. */
  const criacaoPendente = (api.character as unknown as { criacao_pendente?: boolean }).criacao_pendente === true;
  const janelas = useJanelasDaMesa();
  const fecharConsole = useConsoleCloseOverride();
  /**
   * Na mesa, a Forja de evolução é uma janela da mesa: a ficha fecha e
   * reabre quando a Forja sai ou sela. Fora dela (Personagens), a ficha
   * abre a Forja por cima de si mesma.
   */
  const evoluir = (alvo: RankingV12) => {
    if (janelas.abrirEvolucao && api.mesa && fecharConsole) {
      janelas.abrirEvolucao({ characterId: api.mesa.characterId, alvo });
      fecharConsole();
    } else setAux({ tipo: "avanco", alvo });
  };
  const tabpanelRef = useRef<HTMLDivElement>(null);

  function escolherAba(id: AbaId) {
    setAba(id);
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

  /**
   * Tira o avatar do personagem. É o mesmo `set_character_avatar_image`
   * do envio, com `null` no lugar do id — a imagem em si continua na
   * biblioteca da campanha (pode estar em uso por outro personagem);
   * o que se desfaz aqui é só o vínculo.
   */
  async function removerAvatar() {
    if (!mesa || avatarEnviando) return;
    setAvatarEnviando(true);
    setAvatarErro(null);
    try {
      const r = await definirAvatarPersonagemAction(mesa.campaignId, mesa.characterId, null);
      if (!r.ok) throw new Error(r.erro ?? "Não foi possível remover o avatar.");
      setAvatarUrl(null);
    } catch (e) {
      setAvatarErro(e instanceof Error ? e.message : "Não foi possível remover o avatar.");
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
  // Só leitura: quem visualiza não rola pelo personagem — a perícia e
  // o atributo continuam com hover e dica, só o clique não abre nada.
  function rolarAtributo(id: keyof CharacterAttributes) {
    if (api.somenteLeitura) return;
    setAux({ tipo: "rolagem", prefill: { tipo: "atributo", atributoId: id } });
  }
  function rolarPericia(id: string) {
    if (api.somenteLeitura) return;
    setAux({ tipo: "rolagem", prefill: { tipo: "pericia", periciaId: id } });
  }
  function rolarTesteDecisivoColapso() {
    const tipo = api.character.colapso?.tipo;
    const gatilho = api.regras?.colapso?.gatilhos?.find((item) => item.recurso === tipo);
    const atributoId = gatilho?.teste_fim_rodada.atributo;
    const cd = parseTerceiroSegmentoThreshold(api.regras?.colapso);
    if ((atributoId !== "corpo" && atributoId !== "mente" && atributoId !== "animo") || cd == null) {
      setAux({ tipo: "aviso", titulo: "Teste de Colapso", mensagem: "A regra canônica do teste decisivo está incompleta." });
      return;
    }
    setAux({ tipo: "rolagem", prefill: { tipo: "colapso", atributoId, cd } });
  }
  function editarRecursoComConfirmacao(id: "pv" | "pe" | "mana", valor: number) {
    const colapso = api.character.colapso;
    const atual = api.character.recursos_atuais?.[id] ?? 0;
    const pisoPe = pisoPeNegativo(api.derivados.pe_max);
    const retornaDaMorte = id === "pv" && colapso?.desfecho === "morte" && atual <= 0 && valor >= 1;
    const retornaDoComa = id === "pe" && colapso?.desfecho === "coma" && atual <= pisoPe && valor >= pisoPe + 1;
    if (retornaDaMorte || retornaDoComa) {
      setAux({ tipo: "retorno-colapso", recurso: id, valor, desfecho: retornaDaMorte ? "morte" : "coma" });
      return;
    }
    api.editarRecurso(id, valor);
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
          {aba !== "equipamentos" && aba !== "mochila" && aba !== "magias" && aba !== "escalpos" && <DecoTop />}
          <div className="rc-tabpanel" role="tabpanel" ref={tabpanelRef}>
            {aba === "mochila" ? (
              <InventarioPanel api={api} />
            ) : aba === "magias" ? (
              <MagiasPanel api={api} />
            ) : aba === "escalpos" ? (
              <EscalposPanel api={api} />
            ) : aba === "equipamentos" ? (
              <EquipmentPanel
                slots={projecao.slots}
                api={api}
                onAbrirVazio={(slot) => setAux({ tipo: "mochila", slot })}
                onAbrirAtaque={(instancia, modelo, slot) => setAux({ tipo: "ataque", instancia, modelo, slot })}
                onUsarItem={(instancia, modelo) =>
                  setAux({
                    tipo: "aviso",
                    titulo: instancia.itemNome,
                    mensagem: modelo?.descricao_curta ?? "A ação definitiva deste item entra no lugar deste aviso.",
                  })
                }
                onRecarregar={iniciarRecarga}
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
          onAvatarRemover={() => { void removerAvatar(); }}
          avatarOcupado={avatarEnviando}
          onRolarAtributo={rolarAtributo}
          onEscolherSurto={() => setAux({ tipo: "surto" })}
          onRolarDefesa={() => setAux({ tipo: "defesa" })}
        />
        <div className="rc-foco-personagem-col2">
          <VitalsRow api={api} onEditarRecurso={editarRecursoComConfirmacao} onEstabilizar={api.estabilizarColapso} onTesteDecisivo={rolarTesteDecisivoColapso} />
          <div className="rc-center-lower">
            {/* Estados ANTES de Perícias: a coluna do meio é a leitura
                do corpo (vitais → estados) antes da leitura do que se
                sabe fazer. Condição ativa muda como toda rolagem da
                tabela abaixo se resolve; ler isso depois de escolher a
                perícia é tarde. */}
            <ConditionsPanel api={api} onAdicionar={onAdicionarCondicao} onDetalhes={onDetalhesCondicao} />
            <SkillsGrid api={api} onRolar={rolarPericia} />
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
            {api.somenteLeitura ? (
              <span className="rc-somente-leitura-chip" title="Você pode ver esta ficha, mas não alterá-la.">
                <Eye size={12} aria-hidden="true" /> Somente leitura
              </span>
            ) : (
              <GravacaoChip estado={api.gravacao.estado} erro={api.gravacao.erro} />
            )}
            {!api.somenteLeitura && criacaoPendente && api.mesa && (
              <CompletarCriacaoChip
                onAbrir={() => api.mesa && janelas.abrirCompletar({ characterId: api.mesa.characterId, nome: api.character.nome })}
              />
            )}
            {!api.somenteLeitura && !criacaoPendente && <DescansoChip character={api.character} derivados={api.derivados} onDescansar={api.descansar} />}
            {!api.somenteLeitura && !criacaoPendente && <ModoChip modo={api.modo} onAlternar={api.definirModo} v12={rankingV12 != null} />}
            {!api.somenteLeitura && !criacaoPendente && rankingV12 && api.mesa && (
              <AvancoChip ranking={rankingV12} onEscolher={(alvo) => evoluir(alvo)} />
            )}
          </>
        }
        dockContent={<MinimizedDockContent api={api} avatarUrl={avatarUrl} onEditarRecurso={editarRecursoComConfirmacao} />}
        tablist={<TabRail aba={aba} onChangeAba={escolherAba} />}
        larguraMaximaFixa={FOCO_MAX_W}
        alturaFallbackInicial={FOCO_ALTURA_INICIAL}
        conteudoChave={aba}
      >
        <div className="rc-foco-content">{aba === "personagem" ? renderPersonagem() : renderConteudoAba()}</div>
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
          centralizarNoConsole
          erro={avatarErro}
          arquivo={avatarParaRecortar}
          ocupado={avatarEnviando}
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
          key={aux.prefill.tipo === "pericia" || aux.prefill.tipo === "defesa" ? `${aux.prefill.tipo}:${aux.prefill.periciaId}` : `${aux.prefill.tipo}:${aux.prefill.atributoId}`}
          api={api}
          prefill={aux.prefill}
          onFechar={() => setAux(null)}
        />
      )}

      {aux?.tipo === "avanco" && api.mesa && (
        <JanelaEvolucao campaignId={api.mesa.campaignId} characterId={api.mesa.characterId} alvo={aux.alvo} onFechar={() => setAux(null)} />
      )}

      {aux?.tipo === "surto" && (
        <SurgePickerModal
          tipos={api.tiposDeSurto}
          onEscolher={(t) => {
            setAux(null);
            void rolarSurto(t);
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

      {aux?.tipo === "ataque" && (
        <AttackModal
          instancia={aux.instancia}
          modelo={aux.modelo}
          slot={aux.slot}
          api={api}
          // A rolagem de ataque entra pelo MESMO caminho de qualquer
          // outra do Console: o Painel de Rolagem, prefilhado com a
          // perícia da arma — nada de um motor paralelo aqui dentro.
          onRolarPericia={(periciaId) => setAux({ tipo: "rolagem", prefill: { tipo: "pericia", periciaId } })}
          onFechar={() => setAux(null)}
        />
      )}

      {aux?.tipo === "recarga" && (
        <JanelaRecarga
          arma={aux.instancia.itemNome}
          municao={aux.municao}
          fontes={aux.fontes}
          padraoId={aux.padraoId}
          onDefinirPadrao={(f) => api.definirFontePadrao(aux.instancia.id, f ? { local: f.local, contentSlug: f.contentSlug } : null)}
          onRecarregar={(f) => {
            avisar(api.recarregarDe(aux.instancia.id, f.id));
            setAux(null);
          }}
          onFechar={() => setAux(null)}
        />
      )}
      {aux?.tipo === "bancada" && (
        <JanelaBancada
          nome={aux.instancia.itemNome}
          bancada={aux.bancada}
          onGuardar={(alvo) => {
            const ok = api.abastecerSuporte(aux.instancia.id, alvo);
            avisar({ ok, mensagem: ok ? `${aux.instancia.itemNome} abastecida.` : "Não coube — confira a capacidade." });
            setAux(null);
          }}
          onFechar={() => setAux(null)}
        />
      )}
      {avisoRecarga && <AvisoRecarga aviso={avisoRecarga} onFechar={fecharAvisoRecarga} />}

      {aux?.tipo === "retorno-colapso" && (
        <ConfirmModal
          titulo="Retornar à atividade?"
          mensagem={aux.desfecho === "morte"
            ? `${api.character.nome || "Este personagem"} está morto. Recuperar PV para ${aux.valor} fará o personagem voltar à atividade. Confirmar?`
            : `${api.character.nome || "Este personagem"} está em coma. Recuperar PE para ${aux.valor} fará o personagem despertar e voltar à atividade. Confirmar?`}
          onConfirmar={() => {
            api.editarRecurso(aux.recurso, aux.valor, { confirmarRetorno: true });
            setAux(null);
          }}
          onFechar={() => setAux(null)}
        />
      )}

      {aux?.tipo === "condicao" && (
        <ConditionPickerModal
          disponiveis={api.condicoesDisponiveis}
          onAplicar={(condicoes) => {
            for (const c of condicoes) {
              api.adicionarCondicao({ conditionId: c.slug, nome: c.nome, descricao: "", origem: "Console", duracao: "" });
            }
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
