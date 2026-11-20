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
 * A janela mostra só a aba ativa; as colunas de identidade, vitais e
 * perícias vivem na aba especial "Personagem" (`renderPersonagem`).
 *
 * O estado do avatar (preview local — o projeto ainda não tem fluxo de
 * upload real, ver limitações) vive AQUI, não dentro de `IdentityAside`,
 * porque o console minimizado precisa mostrar a MESMA imagem.
 */

import { enviarAvatarPessoalAction, lerAvatarPessoalAction, removerAvatarPessoalAction } from "../../mesas/[campaignId]/vtt/_acoes/avatarPessoalActions";
import { useConsoleDaMesa } from "../../mesas/[campaignId]/_shell/ConsoleDaMesa";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Eye } from "lucide-react";
import {
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
import { EnvioImagem } from "./EnvioImagem";
import { ConsoleWindow } from "./ConsoleWindow";
import { Scrollbar } from "./scrollbar";
import { DecoTop } from "./deco";
import { IdentityAside } from "./panels/IdentityAside";
import { VitalsRow } from "./panels/VitalsRow";
import { EquipmentPanel } from "./panels/EquipmentPanel";
import { InventarioPanel } from "./panels/InventarioPanel";
import { MagiasPanel } from "./panels/MagiasPanel";
import { IdentityPanel } from "./panels/IdentityPanel";
import { ClassPanel } from "./panels/ClassPanel";
import { RupturaPanel } from "./panels/RupturaPanel";
import { EscalposPanel } from "./panels/EscalposPanel";
import { AcoesPanel } from "./panels/AcoesPanel";
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
  ConditionDetailModal,
  ConditionPickerModal,
  ConfirmModal,
  DefensePickerModal,
  ResistirAtributoModal,
  SurgePickerModal,
  type TipoDefesa,
} from "./panels/AuxModals";
import { itensCompativeisComSlot, projectBodySlots, type BodySlotId } from "./slots";
import { ABAS, type AbaId } from "./tabs";
import { LARGURA_INICIAL_MAX, ALTURA_INICIAL_FALLBACK } from "./geometry";
import { PainelRolagem, type PrefillRolagem } from "./panels/PainelRolagem";
import { AvisoRecarga, JanelaRecarga } from "./panels/JanelaRecarga";
import { JanelaBancada } from "./panels/JanelaBancada";
import type { Bancada } from "../../../lib/character/supportLoadout";
import type { FonteRecarga } from "../../../lib/character/reloadSources";
import { useRolarNaMesa } from "../../mesas/[campaignId]/vtt/_dados3d/ContextoMesaDados";
import type { ConsoleApi, ConsolePin } from "./types";
import { GlossarioDoConsole } from "./TextoComRegras";
import { parseTerceiroSegmentoThreshold, pisoPeNegativo, type CharacterAttributes, type InventoryItemInstance, type ItemContent } from "../../../lib/character";

/** Estado do modal auxiliar aberto no momento (um por vez). */
type Aux =
  | { tipo: "rolagem"; prefill: PrefillRolagem }
  | { tipo: "surto" }
  | { tipo: "mochila"; slot: BodySlotId }
  | { tipo: "ataque"; instancia: InventoryItemInstance; modelo: ItemContent; slot: BodySlotId }
  | { tipo: "bancada"; instancia: InventoryItemInstance; bancada: Bancada }
  | { tipo: "recarga"; instancia: InventoryItemInstance; fontes: FonteRecarga[]; municao: { atual: number; max: number } }
  | { tipo: "condicao" }
  | { tipo: "condicao-detalhe"; id: string }
  | { tipo: "defesa" }
  | { tipo: "resistir-atributo" }
  | { tipo: "retorno-colapso"; recurso: "pv" | "pe"; valor: number; desfecho: "morte" | "coma" }
  | { tipo: "aviso"; titulo: string; mensagem: string }
  | { tipo: "avanco"; alvo: RankingV12 }
  | null;

/**
 * Onde a tela de uma aba se divide em blocos, pra quem não tem lista em
 * `BLOCOS_DA_ABA`: desce pelo primeiro filho enquanto houver um só, e
 * devolve os filhos do primeiro nível que tiver dois ou mais. Camadas
 * de fundo (absolutas) e o que não ocupa espaço ficam de fora.
 */
function blocosDaTela(raiz: HTMLElement): HTMLElement[] {
  let no = raiz;
  for (let nivel = 0; nivel < 8; nivel++) {
    const filhos = ([...no.children] as HTMLElement[]).filter((f) => {
      const r = f.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return false;
      const posicao = getComputedStyle(f).position;
      return posicao !== "absolute" && posicao !== "fixed";
    });
    if (filhos.length >= 2) return filhos.slice(0, 12);
    if (!filhos.length) break;
    no = filhos[0];
  }
  return no === raiz ? [] : [no];
}

/** Atraso de cada bloco na troca de aba: encolhe a cada um, e o grupo fecha em ~300ms. */
const ATRASOS_DA_TROCA = [0, 25, 45, 60, 70, 80];

/** Blocos que entram em sequência na troca de aba, nas abas em que a divisão automática não serve. */
const BLOCOS_DA_ABA: Partial<Record<AbaId, string>> = {
  personagem: ".rc-nric-card, .rc-npr-card, .rc-vitals, .rc-ncond-wrap, .rc-skills-wrap, .rc-pins",
  ruptura: ".rp-anel, .rp-hero-lado, .rp-trilho, .rp-escada",
  magias: ".rc-inv > .hx-grade > div:not(.hx-scan) > div > *",
};

export function CharacterConsole({ aberto, onClose, api, abaInicial, comandoAberto }: { aberto: boolean; onClose: () => void; api: ConsoleApi; abaInicial?: AbaId; comandoAberto?: { familia: "a" | "m"; id: string } | null }) {
  const [aba, setAba] = useState<AbaId>(abaInicial ?? "personagem");
  // Pedido de aba com o Console já aberto (ex.: roda tática → Ações).
  useEffect(() => { if (abaInicial) setAba(abaInicial); }, [abaInicial]);
  /**
   * FOCO é o padrão de abertura: o Console abre na ficha do
   * personagem, não numa aba de gestão. Painel continua a um clique no
   * trilho, para quem quer as colunas fixas ao lado da aba ativa.
   */
  const [aux, setAux] = useState<Aux>(null);
  const consoleDaMesa = useConsoleDaMesa();
  const [avisoRecarga, setAvisoRecarga] = useState<{ ok: boolean; mensagem: string; desfazer?: () => void; seq: number } | null>(null);
  const fecharAvisoRecarga = useMemo(() => () => setAvisoRecarga(null), []);
  /**
   * Recarga: direta quando há uma fonte só; com mais de uma, abre a
   * janela de escolha.
   * Armas fora desse modelo (célula de energia, aljava) seguem o fluxo
   * antigo de `recarregar`.
   */
  function avisar(r: { ok: boolean; mensagem: string; desfazer?: () => void }) {
    // Recarga que deu certo não precisa de aviso; só a falha aparece.
    if (r.ok) return;
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
    const direta = info.fontes.length === 1 ? info.fontes[0] : null;
    if (direta) { avisar(api.recarregarDe(instancia.id, direta.id)); return; }
    const modelo = api.catalogo.get(instancia.itemSlug);
    setAux({ tipo: "recarga", instancia, fontes: info.fontes,
      municao: { atual: instancia.municaoAtual ?? 0, max: modelo?.municaoMax ?? 0 } });
  }
  const rolarNaMesa = useRolarNaMesa();
  /**
   * O dano psíquico do surto rola nos dados 3D da mesa (cor do PE): as
   * faces que pararem SÃO o dano. Sem mesa (fora do VTT) ou com fórmula
   * que não for NdS(+M), cai no sorteio de sempre.
   */
  async function rolarSurto(tipo: string, pontos = 1) {
    const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(api.dadoDoSurto.replace(/\s+/g, ""));
    if (!rolarNaMesa || !m) { api.usarSobrecarga(tipo, undefined, pontos); return; }
    // Todos os pontos rolam juntos (3 pontos de 1d4 → 3d4 de uma vez).
    const porSurto = Number(m[1]);
    const pedido = Array.from({ length: porSurto * pontos }, (_, i) => ({ id: `surto-${i}`, sides: Number(m[2]) }));
    const fisicos = await rolarNaMesa(pedido, "#8d62e8");
    const mod = m[3] ? Number(m[3]) : 0;
    const danos = Array.from({ length: pontos }, (_, i) =>
      Math.max(0, fisicos.slice(i * porSurto, (i + 1) * porSurto).reduce((soma, d) => soma + d.value, 0) + mod));
    api.usarSobrecarga(tipo, danos, pontos);
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
  const classeId = (api.character as { progressao?: { classe_id?: string } }).progressao?.classe_id;
  const temClasse = !!classeId;
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

  // TROCA DE ABA — um método só, pra todas, nos limites das skills do
  // Emil Kowalski (`skills/skills-emilkowalski`: review-animations e
  // choreograph). Troca de aba é gesto de alta frequência, então:
  // - nada espera: o conteúdo novo entra no clique, sem saída do antigo
  //   segurando a troca;
  // - os BLOCOS da aba sobem em sequência, mas o grupo inteiro termina em
  //   ~300ms: 220ms cada, na curva de saída forte, com atrasos que
  //   ENCOLHEM (0, 25, 45, 60, 70, 80ms) em vez de um passo uniforme;
  // - o primeiro bloco anda mais (10px) que os seguintes (6px);
  // - é decoração: não bloqueia clique nem foco enquanto toca.
  // De onde vêm os blocos:
  // - Identidade e Ações: da própria folha de estilo, no mesmo ritmo;
  // - abas com lista em `BLOCOS_DA_ABA`: dali;
  // - o resto (Classe, que tem uma tela por classe, e Inventário):
  //   `blocosDaTela` desce pela aba até achar onde ela se divide;
  // - Equipamentos e Escalpos: coreografia própria (varredura, montagem)
  //   na PRIMEIRA visita desde que o Console montou; nas voltas,
  //   `data-revisita` a zera (console.css) e entram por blocos também.
  //   O atributo sai depois de 1,5s, mais que a entrada mais longa, pra
  //   nada do que já terminou recomeçar.
  // É Web Animations, e não CSS, porque os cartões de Personagem têm
  // animações de estado em CSS: uma `animation` de entrada na folha
  // recomeçaria toda vez que uma delas terminasse.
  const focoRef = useRef<HTMLDivElement>(null);
  const abasVisitadas = useRef(new Set<string>());
  const primeiraAba = useRef(true);
  useLayoutEffect(() => {
    const revisita = abasVisitadas.current.has(aba);
    abasVisitadas.current.add(aba);
    const el = focoRef.current;
    const primeira = primeiraAba.current;
    primeiraAba.current = false;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const longa = !!el.querySelector(".hx-eq-motion, .hs-motion");
    el.toggleAttribute("data-revisita", revisita && longa);
    el.toggleAttribute("data-troca", !primeira);
    if (!primeira) t = setTimeout(() => { el.removeAttribute("data-revisita"); el.removeAttribute("data-troca"); }, 1500);
    // A primeira aba entra com a própria janela (`rc-in`); só as trocas animam aqui.
    const cascataPropria = !!el.querySelector(".hi-painel, .ha") || (longa && !revisita);
    if (!primeira && !cascataPropria && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const seletor = BLOCOS_DA_ABA[aba];
      const blocos = seletor ? [...el.querySelectorAll<HTMLElement>(seletor)] : blocosDaTela(el);
      // Ordem de leitura: de cima pra baixo, e da esquerda pra direita na mesma linha.
      const pos = new Map(blocos.map((b) => [b, b.getBoundingClientRect()]));
      blocos.sort((a, b) => Math.round((pos.get(a)!.top - pos.get(b)!.top) / 24) || pos.get(a)!.left - pos.get(b)!.left);
      blocos.forEach((b, n) => b.animate([{ opacity: 0, transform: `translateY(${n === 0 ? 10 : 6}px)` }, { opacity: 1, transform: "none" }],
        { duration: 220, delay: ATRASOS_DA_TROCA[Math.min(n, ATRASOS_DA_TROCA.length - 1)], easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "backwards" }));
    }
    return () => { if (t) clearTimeout(t); };
  }, [aba]);

  useEffect(() => {
    if (aba === "classe" && !temClasse) setAba("caracteristicas");
  }, [aba, temClasse]);

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
  /** Modal de envio aberto; `arquivo` quando a imagem já veio solta no avatar. */
  const [envioAvatar, setEnvioAvatar] = useState<{ arquivo: File | null } | null>(null);
  const [avatarEnviando, setAvatarEnviando] = useState(false);
  const mesa = api.mesa;

  // A URL assinada do avatar já gravado. O id é coluna de `characters`
  // (não vem no payload do console), então quem resolve id → assinatura
  // é o servidor, numa ida só. Recarrega ao abrir e a cada 4 min — as
  // URLs valem 5.
  const campaignId = mesa?.campaignId ?? null;
  const characterId = mesa?.characterId ?? null;
  const soltoId = mesa ? null : api.personagemSoltoId ?? null;
  // Personagem solto: o avatar mora na conta do dono e sai por uma rota versionada.
  useEffect(() => {
    if (!aberto || !soltoId) return;
    let vivo = true;
    void lerAvatarPessoalAction(soltoId).then((r) => { if (vivo) setAvatarUrl(r.url ?? null); });
    return () => { vivo = false; };
  }, [aberto, soltoId]);
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

  function abrirEnvioAvatar(arquivo?: File) {
    setAvatarErro(null);
    setEnvioAvatar({ arquivo: arquivo ?? null });
  }

  /** Envio do recorte escolhido no modal. Devolve se deu certo (o modal só fecha então). */
  async function enviarAvatarRecortado(arquivo: File, recorte: { x: number; y: number; tamanho: number }): Promise<boolean> {
    if (!mesa && soltoId) {
      setAvatarEnviando(true);
      setAvatarErro(null);
      try {
        const preparada = await prepararRecorteQuadrado(arquivo, recorte);
        const dados = new FormData();
        dados.set("arquivo", new File([preparada.blob], "avatar.webp", { type: "image/webp" }));
        const r = await enviarAvatarPessoalAction(soltoId, dados);
        if (!r.ok) throw new Error(r.erro ?? "Não foi possível enviar a imagem.");
        setAvatarUrl(r.url ?? preparada.previewUrl);
        return true;
      } catch (e) {
        setAvatarErro(e instanceof Error ? e.message : "Não foi possível enviar a imagem.");
        return false;
      } finally {
        setAvatarEnviando(false);
      }
    }
    if (!mesa) {
      // Sem mesa não há onde guardar; a prévia local vale nesta sessão.
      try { setAvatarUrl((await prepararRecorteQuadrado(arquivo, recorte)).previewUrl); return true; }
      catch (e) { setAvatarErro(e instanceof Error ? e.message : "Não foi possível processar a imagem."); return false; }
    }
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
      return true;
    } catch (e) {
      // Reserva viva sem uso prende quota até vencer; devolver aqui é
      // cortesia (a coleta resolve de qualquer jeito).
      if (reservaId && mesa) void cancelarUploadAction(mesa.campaignId, reservaId).catch(() => {});
      setAvatarErro(e instanceof ImagemRecusadaError || e instanceof Error
        ? e.message : "Não foi possível enviar a imagem.");
      return false;
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
  async function removerAvatar(): Promise<boolean> {
    if (!mesa && soltoId) {
      if (avatarEnviando) return false;
      setAvatarEnviando(true);
      setAvatarErro(null);
      const r = await removerAvatarPessoalAction(soltoId).catch(() => ({ ok: false, erro: undefined }));
      setAvatarEnviando(false);
      if (!r.ok) { setAvatarErro(r.erro ?? "Não foi possível remover o avatar."); return false; }
      setAvatarUrl(null);
      return true;
    }
    if (!mesa) { setAvatarUrl(null); return true; }
    if (avatarEnviando) return false;
    setAvatarEnviando(true);
    setAvatarErro(null);
    try {
      const r = await definirAvatarPersonagemAction(mesa.campaignId, mesa.characterId, null);
      if (!r.ok) throw new Error(r.erro ?? "Não foi possível remover o avatar.");
      setAvatarUrl(null);
      return true;
    } catch (e) {
      setAvatarErro(e instanceof Error ? e.message : "Não foi possível remover o avatar.");
      return false;
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
    setAux({ tipo: "condicao-detalhe", id });
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
  function onEscolherDefesa(tipo: TipoDefesa, periciaResistir?: "vigor" | "mobilidade") {
    if (tipo === "resistir") {
      if (periciaResistir) onEscolherResistir(periciaResistir);
      else setAux({ tipo: "resistir-atributo" });
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

  /** Conteúdo da aba de NAVEGAÇÃO ativa. */
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
          {aba !== "equipamentos" && aba !== "mochila" && aba !== "magias" && aba !== "escalpos" && aba !== "caracteristicas" && aba !== "classe" && aba !== "acoes" && aba !== "ruptura" && <DecoTop />}
          <div className="rc-tabpanel" role="tabpanel" ref={tabpanelRef}>
            {aba === "mochila" ? (
              <InventarioPanel api={api} onGerenciarSuporte={(id) => {
                const instancia = api.character.inventario?.find((i) => i.id === id);
                if (instancia?.aljava) iniciarRecarga(instancia);
              }} />
            ) : aba === "magias" ? (
              <MagiasPanel api={api} magiaInicial={comandoAberto?.familia === "m" ? comandoAberto.id : null} />
            ) : aba === "escalpos" ? (
              <EscalposPanel api={api} />
            ) : aba === "acoes" ? (
              <AcoesPanel
                api={api}
                acaoInicial={comandoAberto?.familia === "a" ? comandoAberto.id : null}
                onRolar={(prefill) => { if (!api.somenteLeitura) setAux({ tipo: "rolagem", prefill }); }}
                onAtacar={(instanceId) => {
                  if (api.somenteLeitura) return;
                  // Mesmo caminho do Atacar de Equipamentos: na mesa, alvo no mapa; fora, a janela da arma.
                  if (instanceId && api.mesa && consoleDaMesa?.atacarCom(api.mesa.characterId, instanceId)) return;
                  const slot = projecao.slots.find((s) => s.instance && s.instance.id === instanceId);
                  const modelo = slot?.instance ? api.catalogo.get(slot.instance.itemSlug) : undefined;
                  if (slot?.instance && modelo) setAux({ tipo: "ataque", instancia: slot.instance, modelo, slot: slot.id });
                  else setAux({ tipo: "aviso", titulo: "Atacar", mensagem: "Empunhe uma arma em Equipamentos para atacar com ela, ou role Luta para um ataque desarmado." });
                }}
              />
            ) : aba === "caracteristicas" ? (
              <IdentityPanel api={api} avatarUrl={avatarUrl} onCompletar={criacaoPendente && api.mesa ? () => api.mesa && janelas.abrirCompletar({ characterId: api.mesa.characterId, nome: api.character.nome }) : undefined} onEvoluir={!criacaoPendente && api.mesa ? evoluir : undefined} />
            ) : aba === "classe" ? (
              <ClassPanel api={api} />
            ) : aba === "ruptura" ? (
              <RupturaPanel api={api} />
            ) : aba === "equipamentos" ? (
              <EquipmentPanel
                slots={projecao.slots}
                api={api}
                onAbrirVazio={(slot) => setAux({ tipo: "mochila", slot })}
                onAbrirAtaque={(instancia, modelo, slot) => {
                  // Na mesa, Atacar segue o fluxo do atalho (alvo no mapa → rolagem → chat);
                  // fora dela (ou sem token na cena), a janela da arma.
                  if (api.mesa && consoleDaMesa?.atacarCom(api.mesa.characterId, instancia.id)) return;
                  setAux({ tipo: "ataque", instancia, modelo, slot });
                }}
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

  /** Conteúdo da aba especial "Personagem" — identidade, vitais,
      estados e perícias lado a lado (`.rc-foco-personagem`). */
  function renderPersonagem() {
    return (
      <div className="rc-foco-personagem">
        <IdentityAside
          api={api}
          avatarUrl={avatarUrl}
          avatarErro={avatarErro}
          onAvatarAbrir={abrirEnvioAvatar}
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
    <GlossarioDoConsole.Provider value={api.glossario}>
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
        tablist={<TabRail aba={aba} onChangeAba={escolherAba} temClasse={temClasse} classeId={classeId} alertas={{ ruptura: api.character.ruptura_pendente === true }} />}
        larguraInicialMax={LARGURA_INICIAL_MAX}
        alturaInicialFallback={ALTURA_INICIAL_FALLBACK}
        conteudoChave={aba}
      >
        <div className="rc-foco-content" ref={focoRef}>{aba === "personagem" ? renderPersonagem() : renderConteudoAba()}</div>
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
      {envioAvatar && (
        <EnvioImagem
          centralizarNoConsole
          titulo="AVATAR DA FICHA"
          contexto={api.character.nome ? `FICHA · ${api.character.nome.toUpperCase()}` : undefined}
          canal="UPLOAD://AVATAR"
          forma="circulo"
          previaToken="#45b8c9"
          atual={avatarUrl}
          arquivoInicial={envioAvatar.arquivo}
          erro={avatarErro}
          enviando={avatarEnviando}
          aviso={mesa || soltoId ? null : "Esta ficha não está numa mesa: a imagem vale só nesta sessão."}
          onUsar={(arquivo, recorte) => recorte ? enviarAvatarRecortado(arquivo, recorte) : false}
          onRemover={removerAvatar}
          fechar={() => { setEnvioAvatar(null); setAvatarErro(null); }}
        />
      )}
      {aux?.tipo === "rolagem" && (
        // `key` pelo que foi pedido: sem backdrop, clicar noutra perícia
        // com a ferramenta aberta é um gesto normal — e ela tem que
        // REABRIR preenchida com a nova, não continuar mostrando a
        // anterior (o estado interno nasce do `prefill`).
        <PainelRolagem
          key={aux.prefill.tipo === "pericia" || aux.prefill.tipo === "defesa" || aux.prefill.tipo === "acao" ? `${aux.prefill.tipo}:${aux.prefill.periciaId}` : `${aux.prefill.tipo}:${aux.prefill.atributoId}`}
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
          usada={api.character.sobrecarga_usada_dia ?? 0}
          limite={api.limiteSobrecarga}
          dado={api.dadoDoSurto}
          marcas={(api.character.historico_ruptura ?? []).map((entrada) => entrada.marcaId).filter((id): id is string => !!id)}
          onEscolher={(t, pontos) => {
            setAux(null);
            // Cada ponto é um surto na trilha (cap. 18); os dados rolam juntos, num card só.
            void rolarSurto(t, pontos);
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
          dano={(() => { const m = api.catalogo.get(aux.instancia.itemSlug); return m ? [m.danoBase, m.subtipoDano ?? m.tipoDano].filter(Boolean).join(" ") || null : null; })()}
          fontes={aux.fontes}
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
          ativas={new Map((api.character.condicoes_ativas ?? []).filter((c) => c.ativa && c.conditionId).map((c) => [c.conditionId as string, c.nivel ?? 1]))}
          onAplicar={(condicoes) => {
            for (const c of condicoes) {
              api.adicionarCondicao({ conditionId: c.slug, nome: c.nome, descricao: "", origem: "Console", duracao: "" });
            }
            setAux(null);
          }}
          onFechar={() => setAux(null)}
        />
      )}

      {aux?.tipo === "defesa" && <DefensePickerModal api={api} onEscolher={onEscolherDefesa} onFechar={() => setAux(null)} />}

      {aux?.tipo === "resistir-atributo" && <ResistirAtributoModal onEscolher={onEscolherResistir} onFechar={() => setAux(null)} />}

      {aux?.tipo === "condicao-detalhe" && (() => {
        const ativa = (api.character.condicoes_ativas ?? []).find((x) => x.id === aux.id);
        if (!ativa) return null;
        return (
          <ConditionDetailModal
            condicao={ativa}
            regra={ativa.conditionId ? api.condicoesDisponiveis.find((c) => c.slug === ativa.conditionId) : undefined}
            onRemover={api.somenteLeitura ? undefined : () => { api.removerCondicao(ativa.id); setAux(null); }}
            onFechar={() => setAux(null)}
          />
        );
      })()}

      {aux?.tipo === "aviso" && (
        <ConfirmModal titulo={aux.titulo} mensagem={aux.mensagem} onConfirmar={() => setAux(null)} onFechar={() => setAux(null)} />
      )}
      </div>
    </GlossarioDoConsole.Provider>
  );
}
