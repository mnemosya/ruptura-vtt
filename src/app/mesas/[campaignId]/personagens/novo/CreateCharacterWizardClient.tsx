"use client";

/**
 * Assistente de criação de personagem — checkpoint v0.41 (PRD 3.2),
 * concluído no checkpoint pós-v0.94 (fase 3): vertentes/magias, talento
 * inicial e inventário agora usam os motores reais já existentes
 * (`learnSpell`, `acquireTalentLevel`, `purchaseItem` — nenhum
 * reimplementado), não mais placeholders de texto.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Spinner } from "../../../../_design/icons";
import {
  createCharacterFromWizard,
  loadCharacterCreationDraft,
  saveCharacterCreationDraft,
  deleteCharacterCreationDraft,
  type LoadDraftResult,
} from "../../../../../lib/character/storage";
import type { Campaign } from "../../../../../lib/table";
import {
  learnSpell,
  acquireTalentLevel,
  purchaseItem,
  removeItemFromInventory,
  type Character,
  type CharacterRulesPayload,
  type TalentContent,
  type SpellContent,
  type ItemContent,
} from "../../../../../lib/character";
import { PONTOS_VERTENTE_CRIACAO } from "../../../../../lib/character/createCharacterValidation";
import type { DraftPayload, DraftItemEscolhido } from "../../../../../lib/character/draftValidation";
import { logError } from "../../../../../lib/logger";

/** ~800ms — janela do autosave por debounce (rede de segurança; troca de etapa e "Salvar e sair" salvam imediatamente). */
const AUTOSAVE_DEBOUNCE_MS = 800;

const ETAPAS = [
  { id: 1, nome: "Conceito e identidade" },
  { id: 2, nome: "Atributos" },
  { id: 3, nome: "Perícias" },
  { id: 4, nome: "Vertentes" },
  { id: 5, nome: "Talento inicial" },
  { id: 6, nome: "Inventário" },
  { id: 7, nome: "Revisão" },
] as const;

const ORIGENS = ["Vastra", "Beldran", "Talesh", "Kravus", "Torvash"] as const;

interface Identidade {
  nome: string;
  alcunha: string;
  conceito: string;
  origem: string;
  idioma: string;
  afiliacao: string;
}

export default function CreateCharacterWizardClient({
  campaign,
  regras,
  talentos,
  talentosErro,
  magias,
  magiasErro,
  itensLoja,
  itensLojaErro,
}: {
  campaign: Campaign;
  regras: CharacterRulesPayload;
  talentos: TalentContent[];
  /** Falha REAL na leitura do catálogo — distinta de "nenhum talento publicado ainda" (auditoria pós-Fase-6). */
  talentosErro: string | null;
  magias: SpellContent[];
  magiasErro: string | null;
  itensLoja: ItemContent[];
  itensLojaErro: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [identidade, setIdentidade] = useState<Identidade>({
    nome: "",
    alcunha: "",
    conceito: "",
    origem: ORIGENS[0],
    idioma: "Vastrano",
    afiliacao: "",
  });

  const criacao = regras.criacao_personagem;
  const atributoValorInicial = criacao?.atributos?.valor_inicial ?? 1;
  const atributoPontosAdicionais = criacao?.atributos?.pontos_adicionais ?? 3;
  const atributoTeto = criacao?.atributos?.maximo_na_criacao ?? 3;
  const periciaPontosTotais = criacao?.pericias?.pontos_totais ?? 25;
  const periciaTeto = criacao?.pericias?.maximo_na_criacao ?? 3;
  const aretzIniciais = criacao?.inventario?.aretz_iniciais ?? 5000;

  const [atributos, setAtributos] = useState<Record<string, number>>(() =>
    Object.fromEntries(regras.atributos.map((a) => [a.id, atributoValorInicial])),
  );
  const [pericias, setPericias] = useState<Record<string, number>>(() =>
    Object.fromEntries(regras.pericias.map((p) => [p.id, 0])),
  );
  const [niveisVertente, setNiveisVertente] = useState<Record<string, number>>({});
  const [magiasEscolhidas, setMagiasEscolhidas] = useState<Set<string>>(new Set());
  const [talentoNivelIdEscolhido, setTalentoNivelIdEscolhido] = useState<string>("");
  const [carteira, setCarteira] = useState({ aretz_informal: aretzIniciais, cdi: 0, cdi_craqueada: 0 });
  const [inventario, setInventario] = useState<NonNullable<Character["inventario"]>>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  // Chave estável de idempotência (migration 0044) — gerada por
  // montagem do wizard OU recuperada de um draft persistente existente
  // (checkpoint draft persistente): se um draft for restaurado, reusa a
  // MESMA chave gravada nele, para que um retry de finalização após
  // fechar/reabrir a aba continue idempotente (nunca duplica).
  const [creationRequestId, setCreationRequestId] = useState(() => crypto.randomUUID());

  // ---------------------------------------------------------------
  // Draft persistente — Fase 1 (revisão 4): chave é (campaign_id,
  // owner_id) — sempre ativo para quem quer que esteja criando (não
  // depende mais de "perfil conhecido", já que não existe mais perfil;
  // a conta que cria sempre recebe controle automaticamente).
  // ---------------------------------------------------------------
  const [itensEscolhidos, setItensEscolhidos] = useState<DraftItemEscolhido[]>([]);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [loadState, setLoadState] = useState<"loading" | "error" | "confirm_discard" | "ready">("loading");
  const [loadMessage, setLoadMessage] = useState<string | null>(null);
  const [itensRemovidosAoRestaurar, setItensRemovidosAoRestaurar] = useState(0);
  const [salvandoESaindo, setSalvandoESaindo] = useState(false);

  const revisionRef = useRef(0);
  const savingRef = useRef(false);
  const savingPromiseRef = useRef<Promise<void> | null>(null);
  const pendingRef = useRef(false);
  const finalizingRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSnapshotRef = useRef<DraftPayload | null>(null);

  const pontosAtributoGastos = regras.atributos.reduce((soma, a) => soma + ((atributos[a.id] ?? atributoValorInicial) - atributoValorInicial), 0);
  const pontosAtributoRestantes = atributoPontosAdicionais - pontosAtributoGastos;
  const atributosValidos =
    pontosAtributoRestantes === 0 && regras.atributos.every((a) => (atributos[a.id] ?? 0) <= atributoTeto && (atributos[a.id] ?? 0) >= atributoValorInicial);

  const pontosPericiaGastos = Object.values(pericias).reduce((soma, v) => soma + v, 0);
  const pontosPericiaRestantes = periciaPontosTotais - pontosPericiaGastos;
  const periciasValidas = pontosPericiaRestantes >= 0 && regras.pericias.every((p) => (pericias[p.id] ?? 0) <= periciaTeto && (pericias[p.id] ?? 0) >= 0);

  // Etapa 4 (Vertentes) — nunca lista hardcoded: as 6 (ou quantas a
  // Biblioteca tiver publicado) vertentes vêm dos slugs distintos das
  // magias publicadas para esta mesa.
  const vertentesDisponiveis = useMemo(() => {
    const porSlug = new Map<string, string>();
    for (const magia of magias) {
      if (!porSlug.has(magia.vertente)) porSlug.set(magia.vertente, magia.vertente_label ?? magia.vertente);
    }
    return [...porSlug.entries()].map(([slug, label]) => ({ slug, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [magias]);
  const pontosVertenteGastos = Object.values(niveisVertente).reduce((soma, v) => soma + v, 0);
  const pontosVertenteRestantes = PONTOS_VERTENTE_CRIACAO - pontosVertenteGastos;
  const vertentesValidas = pontosVertenteRestantes === 0;

  // Etapa 4b (Magias) — só elegível magia de uma vertente com nível
  // investido >0 e cujo `estatisticas.nivel` não ultrapasse o nível
  // investido (PRD 3.2: "libera magias daquele nível"; nunca permite
  // magia acima do nível).
  function magiaElegivel(magia: SpellContent): boolean {
    const nivelInvestido = niveisVertente[magia.vertente] ?? 0;
    return nivelInvestido > 0 && magia.estatisticas.nivel <= nivelInvestido;
  }
  const magiasElegiveis = useMemo(() => magias.filter(magiaElegivel), [magias, niveisVertente]);
  // Uma magia escolhida deixa de ser elegível se o jogador reduzir o
  // nível da vertente depois — nunca contada na revisão/gravação.
  const magiasEscolhidasValidas = [...magiasEscolhidas].filter((slug) => magiasElegiveis.some((m) => m.slug === slug));

  // Etapa 5 (Talento inicial) — só nível 1, achatado a partir do
  // conteúdo publicado (nunca lista hardcoded).
  const talentoOptions = useMemo(
    () =>
      talentos.flatMap((talento) =>
        talento.niveis
          .filter((n) => n.nivel === 1)
          .map((n) => ({ nivelId: n.id, talentoId: talento.id, nome: `${talento.nome} — ${n.nome}`, descricaoCurta: n.descricao_curta })),
      ),
    [talentos],
  );
  const talentoSelecionado = talentoOptions.find((t) => t.nivelId === talentoNivelIdEscolhido) ?? null;

  const podeFinalizar =
    atributosValidos &&
    periciasValidas &&
    vertentesValidas &&
    identidade.nome.trim().length > 0;

  // ---------------------------------------------------------------
  // Draft persistente — montagem do payload mínimo (nunca carteira/
  // inventário derivados, ver draftValidation.ts) e ciclo de save.
  // ---------------------------------------------------------------
  function buildDraftPayload(stepOverride?: number): DraftPayload {
    return {
      schema_version: 1,
      step: stepOverride ?? step,
      identidade,
      atributos,
      pericias,
      niveisVertente,
      magiasEscolhidas: [...magiasEscolhidas],
      talentoNivelIdEscolhido,
      itensEscolhidos,
    };
  }

  // Mantém `latestSnapshotRef` sempre atualizado com o estado do
  // render mais recente — é o que permite ao autosave por debounce (e
  // à cadeia de saves encadeados dentro de `triggerSave`) nunca enviar
  // um payload de uma etapa/estado já superado.
  useEffect(() => {
    latestSnapshotRef.current = buildDraftPayload();
  });

  /** Reconstrói `carteira`/`inventario` a partir de escolhas mínimas — nunca lidos direto do draft (podem estar desatualizados: item arquivado/preço mudado). */
  async function replayItensEscolhidos(itens: DraftItemEscolhido[]): Promise<void> {
    const nowIso = new Date().toISOString();
    let charAcc: Character = {
      nome: "",
      atributos: { corpo: 1, mente: 1, animo: 1 },
      pericias: {},
      metadados: { schema_version: 1, criado_em: nowIso, atualizado_em: nowIso },
      estado_jogo: { pa_gastos: 0, reacoes_usadas: 0 },
      carteira: { aretz_informal: aretzIniciais, cdi: 0, cdi_craqueada: 0 },
      inventario: [],
    };
    let removidos = 0;
    const validos: DraftItemEscolhido[] = [];
    for (const escolha of itens) {
      const item = itensLoja.find((i) => i.slug === escolha.itemSlug);
      if (!item) {
        removidos += 1;
        continue;
      }
      const resultado = purchaseItem({ character: charAcc, item, quantidade: escolha.quantidade, walletId: "aretz_informal", nowIso });
      if (!resultado.ok) {
        removidos += 1;
        continue;
      }
      charAcc = resultado.character;
      validos.push(escolha);
    }
    setCarteira(charAcc.carteira ?? { aretz_informal: aretzIniciais, cdi: 0, cdi_craqueada: 0 });
    setInventario(charAcc.inventario ?? []);
    setItensEscolhidos(validos);
    setItensRemovidosAoRestaurar(removidos);
  }

  async function applyLoadResult(result: LoadDraftResult): Promise<void> {
    if (result.kind === "none") {
      revisionRef.current = 0;
      setLoadState("ready");
      setDraftHydrated(true);
      return;
    }
    if (result.kind === "network_error") {
      setLoadMessage(result.message);
      setLoadState("error");
      return;
    }
    if (result.kind === "invalid") {
      setLoadMessage(result.message);
      setLoadState("confirm_discard");
      return;
    }
    // "found"
    const { payload } = result;
    setCreationRequestId(result.creationRequestId);
    revisionRef.current = result.revision;
    setStep(payload.step);
    setIdentidade(payload.identidade);
    setAtributos(Object.fromEntries(regras.atributos.map((a) => [a.id, payload.atributos[a.id] ?? atributoValorInicial])));
    setPericias(Object.fromEntries(regras.pericias.map((p) => [p.id, payload.pericias[p.id] ?? 0])));
    setNiveisVertente(
      Object.fromEntries(Object.entries(payload.niveisVertente).filter(([slug]) => vertentesDisponiveis.some((v) => v.slug === slug))),
    );
    setMagiasEscolhidas(new Set(payload.magiasEscolhidas));
    setTalentoNivelIdEscolhido(payload.talentoNivelIdEscolhido);
    await replayItensEscolhidos(payload.itensEscolhidos);
    setLoadState("ready");
    setDraftHydrated(true);
  }

  /** Descarta o draft inválido explicitamente confirmado pelo jogador e começa do zero. */
  async function handleDescartarDraftInvalido() {
    try {
      await deleteCharacterCreationDraft(campaign.id);
    } catch (err) {
      logError("wizard.draft.discardInvalid", err);
    }
    revisionRef.current = 0;
    setLoadState("ready");
    setDraftHydrated(true);
  }

  async function handleTentarCarregarNovamente() {
    setLoadState("loading");
    const result = await loadCharacterCreationDraft(campaign.id);
    await applyLoadResult(result);
  }

  // Carregamento inicial — uma vez, para qualquer conta que abra o wizard.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const result = await loadCharacterCreationDraft(campaign.id);
      if (!cancelado) await applyLoadResult(result);
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Única função que grava o draft — autosave por debounce, troca de
   * etapa e "Salvar e sair" chamam esta mesma função. Fila
   * single-flight: nunca dispara duas gravações concorrentes; uma
   * mudança que chegue enquanto uma gravação está em voo é marcada em
   * `pendingRef` e reenviada (com o estado MAIS recente) assim que a
   * gravação em voo terminar. Devolve a MESMA promise em voo para quem
   * chamar durante uma gravação já em andamento — permite que "Salvar e
   * sair" espere a cadeia inteira (não só a próxima gravação) antes de
   * navegar.
   */
  function triggerSave(overridePayload?: DraftPayload): Promise<void> {
    if (finalizingRef.current || loadState !== "ready") return Promise.resolve();
    if (savingRef.current) {
      pendingRef.current = true;
      return savingPromiseRef.current ?? Promise.resolve();
    }
    savingRef.current = true;
    const promise = (async () => {
      try {
        const payloadToSave = overridePayload ?? latestSnapshotRef.current;
        if (payloadToSave) {
          const result = await saveCharacterCreationDraft(campaign.id, payloadToSave, creationRequestId, revisionRef.current);
          if ("conflict" in result) {
            await handleConflitoDeRevisao();
          } else {
            revisionRef.current = result.revision;
          }
        }
      } catch (err) {
        // Autosave nunca deve travar o wizard — falha de rede aqui é
        // best-effort; "Salvar e sair" mostra erro explícito ao jogador
        // se a gravação final falhar (ver handleSalvarESair).
        logError("wizard.draft.save", err);
      } finally {
        savingRef.current = false;
      }
      if (pendingRef.current) {
        pendingRef.current = false;
        await triggerSave();
      }
    })();
    savingPromiseRef.current = promise;
    return promise;
  }

  /** Outra aba/sessão já salvou uma revisão mais nova — resincroniza a partir do servidor (aceita perder a edição local não salva desta aba). */
  async function handleConflitoDeRevisao() {
    setErrorMessage("Este rascunho foi atualizado em outra aba ou sessão — recarregando o estado salvo mais recente.");
    const result = await loadCharacterCreationDraft(campaign.id);
    await applyLoadResult(result);
  }

  // Autosave por debounce — rede de segurança para o caso comum.
  useEffect(() => {
    if (!draftHydrated || loadState !== "ready") return;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      void triggerSave();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftHydrated, loadState, identidade, atributos, pericias, niveisVertente, magiasEscolhidas, talentoNivelIdEscolhido, itensEscolhidos]);

  /** Troca de etapa salva IMEDIATAMENTE (sem esperar o debounce) — cobre o caso de o jogador fechar a aba logo depois de mudar de etapa. */
  function irParaEtapa(novaEtapa: number) {
    setStep(novaEtapa);
    void triggerSave(buildDraftPayload(novaEtapa));
  }

  async function handleSalvarESair() {
    // `/mesas/[campaignId]` é a mesa do NARRADOR (guard owner-only) —
    // quem está criando pode não ter acesso a ela ainda, então volta
    // para o dashboard geral (`/mesas`, acessível a qualquer conta
    // autenticada).
    setSalvandoESaindo(true);
    setErrorMessage(null);
    try {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      await triggerSave();
      router.push("/mesas");
    } catch {
      setErrorMessage("Não foi possível salvar o rascunho agora — tente novamente antes de sair.");
    } finally {
      setSalvandoESaindo(false);
    }
  }

  async function handleCancelarCriacao() {
    if (!window.confirm("Cancelar a criação e apagar o rascunho salvo? Esta ação não pode ser desfeita.")) return;
    finalizingRef.current = true;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    try {
      await deleteCharacterCreationDraft(campaign.id);
    } catch (err) {
      logError("wizard.draft.cancel", err);
    }
    router.push("/mesas");
  }

  function ajustarAtributo(id: string, delta: number) {
    setAtributos((prev) => {
      const atual = prev[id] ?? atributoValorInicial;
      const novo = Math.max(atributoValorInicial, Math.min(atributoTeto, atual + delta));
      return { ...prev, [id]: novo };
    });
  }

  function ajustarPericia(id: string, delta: number) {
    setPericias((prev) => {
      const atual = prev[id] ?? 0;
      const novo = Math.max(0, Math.min(periciaTeto, atual + delta));
      return { ...prev, [id]: novo };
    });
  }

  function ajustarVertente(slug: string, delta: number) {
    setNiveisVertente((prev) => {
      const atual = prev[slug] ?? 0;
      const novo = Math.max(0, atual + delta);
      if (delta > 0 && pontosVertenteRestantes <= 0) return prev;
      return { ...prev, [slug]: novo };
    });
  }

  function toggleMagia(slug: string) {
    setMagiasEscolhidas((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  /** Monta o personagem-em-construção com o que já foi escolhido até aqui — usado só para alimentar os motores reais (purchaseItem/learnSpell/acquireTalentLevel), nunca gravado como está. */
  function personagemParcial(): Character {
    return {
      nome: identidade.nome.trim() || "(sem nome)",
      atributos: { corpo: atributos.corpo ?? 1, mente: atributos.mente ?? 1, animo: atributos.animo ?? 1 },
      pericias,
      metadados: { schema_version: 1, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString() },
      estado_jogo: { pa_gastos: 0, reacoes_usadas: 0 },
      carteira,
      inventario,
    };
  }

  function handleComprarItem(item: ItemContent) {
    setErrorMessage(null);
    const nowIso = new Date().toISOString();
    const resultado = purchaseItem({
      character: personagemParcial(),
      item,
      quantidade: 1,
      walletId: "aretz_informal",
      nowIso,
    });
    if (!resultado.ok) {
      setErrorMessage(resultado.reason ?? "Não foi possível comprar este item.");
      return;
    }
    setCarteira(resultado.character.carteira ?? carteira);
    setInventario(resultado.character.inventario ?? []);
    // Escolha mínima para o draft persistente (nunca preço/nome derivado, ver draftValidation.ts).
    setItensEscolhidos((prev) => [...prev, { itemSlug: item.slug, quantidade: 1 }]);
  }

  function handleRemoverItem(instanceId: string) {
    const instancia = inventario.find((i) => i.id === instanceId);
    const reembolso = instancia?.precoPago ?? 0;
    const proximo = removeItemFromInventory(personagemParcial(), instanceId);
    setInventario(proximo.inventario ?? []);
    if (reembolso > 0) {
      setCarteira((prev) => ({ ...prev, aretz_informal: prev.aretz_informal + reembolso }));
    }
    // Best-effort: remove a escolha mais recente do mesmo item do
    // registro do draft — não há mapeamento 1:1 perfeito entre
    // instância removida e clique de compra original quando o motor
    // empilha/desempilha (munição, aljava); a validação canônica em
    // `complete_character_creation` continua sendo a autoridade real,
    // esta escolha só afeta a conveniência da restauração do rascunho.
    if (instancia) {
      setItensEscolhidos((prev) => {
        const idxInverso = [...prev].reverse().findIndex((e) => e.itemSlug === instancia.itemSlug);
        if (idxInverso === -1) return prev;
        const idx = prev.length - 1 - idxInverso;
        return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
    }
  }

  async function finalizar() {
    // Guard client-side (defesa em profundidade — a proteção real é a
    // RPC transacional/idempotente, migration 0044): dois cliques
    // disparados no MESMO tick veem `criando` ainda `false` (setState
    // é assíncrono), então isso sozinho não bastaria sem o backend
    // idempotente.
    if (!podeFinalizar || criando) return;
    // Fecha a corrida "autosave atrasado recria o draft depois da
    // conclusão" do lado do client (a RPC de save também rejeita se já
    // existir personagem — defesa autoritativa, ver migration 0047):
    // trava novos autosaves, cancela o debounce pendente e espera
    // qualquer gravação já em voo terminar antes de prosseguir.
    finalizingRef.current = true;
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    if (savingPromiseRef.current) {
      try {
        await savingPromiseRef.current;
      } catch {
        // ignorado — só precisamos que a gravação em voo termine antes de continuar
      }
    }
    setCriando(true);
    setErrorMessage(null);
    try {
      const nowIso = new Date().toISOString();
      let character: Character = {
        nome: identidade.nome.trim(),
        atributos: { corpo: atributos.corpo ?? 1, mente: atributos.mente ?? 1, animo: atributos.animo ?? 1 },
        pericias,
        metadados: {
          schema_version: 1,
          criado_em: nowIso,
          atualizado_em: nowIso,
          alcunha: identidade.alcunha || undefined,
          conceito: identidade.conceito || undefined,
          origem: identidade.origem || undefined,
          idioma: identidade.idioma || undefined,
          afiliacao: identidade.afiliacao || undefined,
        },
        estado_jogo: { pa_gastos: 0, reacoes_usadas: 0 },
        niveis_vertente: niveisVertente,
        carteira,
        inventario,
      };

      // Etapa 4b — cada magia elegível escolhida é APRENDIDA de verdade
      // (learnSpell, não um rótulo) — a vertente "conhecida" é derivada
      // disso, nunca gravada à parte.
      for (const spellSlug of magiasEscolhidasValidas) {
        character = learnSpell(character, spellSlug, nowIso);
      }

      // Etapa 5 — talento inicial aplicado pelo motor real (acquireTalentLevel).
      if (talentoSelecionado) {
        character = acquireTalentLevel(character, {
          talentoId: talentoSelecionado.talentoId,
          nivelId: talentoSelecionado.nivelId,
          nivel: 1,
          nowIso,
        });
      }

      // RPC transacional `complete_character_creation` (migration 0054,
      // Fase 1 revisão 4): insere o personagem E concede controle
      // (`character_controllers`) à conta que criou, na MESMA transação
      // — nunca duas chamadas separadas. `creationRequestId` torna a
      // chamada idempotente (duplo clique/retry devolvem o mesmo
      // personagem).
      const created = await createCharacterFromWizard(campaign.id, character, regras, { creationRequestId });
      // Reforço best-effort — a exclusão AUTORITATIVA já aconteceu
      // dentro da mesma transação da RPC; se esta chamada falhar (aba
      // fechando, rede), não há problema — não bloqueia a navegação.
      deleteCharacterCreationDraft(campaign.id).catch((err) => {
        logError("wizard.draft.cleanupBestEffort", err);
      });
      // A conta que criou sempre recebe controle automaticamente — vai
      // direto para a própria ficha (caminho mínimo da Fase 1).
      router.push(`/ficha?campaignId=${campaign.id}&characterId=${created.id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erro desconhecido ao criar personagem.");
      setCriando(false);
      // Criação falhou — libera o autosave de novo (o jogador pode
      // corrigir e tentar de novo sem perder a persistência do draft).
      finalizingRef.current = false;
    }
  }

  if (loadState === "loading") {
    return (
      <main className="rm-page" style={{ maxWidth: 720 }}>
        <Link href={`/mesas/${campaign.id}/vtt`} className="rv-focusable" style={{ color: "var(--cy)", fontSize: 12 }}>← {campaign.name}</Link>
        <h1 className="rm-page-title" style={{ margin: "8px 0 16px" }}>Novo personagem</h1>
        <p role="status" className="rm-faint">Restaurando rascunho…</p>
      </main>
    );
  }

  if (loadState === "error") {
    return (
      <main className="rm-page" style={{ maxWidth: 720 }}>
        <Link href={`/mesas/${campaign.id}/vtt`} className="rv-focusable" style={{ color: "var(--cy)", fontSize: 12 }}>← {campaign.name}</Link>
        <h1 className="rm-page-title" style={{ margin: "8px 0 16px" }}>Novo personagem</h1>
        <p role="alert" className="rm-erro" style={{ marginBottom: 12 }}>
          Não foi possível verificar se você tem um rascunho salvo: {loadMessage}
        </p>
        <button onClick={handleTentarCarregarNovamente} className="rm-btn rm-btn-ghost rv-focusable">Tentar novamente</button>
      </main>
    );
  }

  if (loadState === "confirm_discard") {
    return (
      <main className="rm-page" style={{ maxWidth: 720 }}>
        <Link href={`/mesas/${campaign.id}/vtt`} className="rv-focusable" style={{ color: "var(--cy)", fontSize: 12 }}>← {campaign.name}</Link>
        <h1 className="rm-page-title" style={{ margin: "8px 0 16px" }}>Novo personagem</h1>
        <p role="alert" className="rm-note rm-note--warn" style={{ marginBottom: 12 }}>
          Não foi possível restaurar seu rascunho anterior (formato incompatível). Deseja descartá-lo e começar do zero?
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={handleDescartarDraftInvalido} className="rm-btn rm-btn-ghost rv-focusable">Descartar e começar do zero</button>
          <button onClick={handleTentarCarregarNovamente} className="rm-btn rm-btn-ghost rv-focusable">Tentar carregar de novo</button>
        </div>
      </main>
    );
  }

  return (
    <main className="rm-page" style={{ maxWidth: 720 }}>
      <Link href={`/mesas/${campaign.id}/vtt`} className="rv-focusable" style={{ color: "var(--cy)", fontSize: 12 }}>← {campaign.name}</Link>
      <h1 className="rm-page-title" style={{ margin: "8px 0 16px" }}>Novo personagem</h1>

      {errorMessage && <p role="alert" className="rm-erro" style={{ marginBottom: 16 }}>Erro: {errorMessage}</p>}
      {itensRemovidosAoRestaurar > 0 && (
        <p className="rm-note rm-note--warn" style={{ marginBottom: 16 }}>
          {itensRemovidosAoRestaurar} item(ns) do rascunho não estão mais disponíveis e foram removidos do inventário restaurado.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {/* `data-pending` + `aria-busy` + spinner: os três saem do MESMO
            booleano que já controla `disabled`, então o estado visual
            nunca diverge do anunciado ao leitor de tela. O rótulo
            continua legível — a regra é "mostrar que está em curso", não
            "esconder o que era". */}
        <button
          onClick={handleSalvarESair}
          disabled={salvandoESaindo}
          data-pending={salvandoESaindo}
          aria-busy={salvandoESaindo}
          className="rm-btn rm-btn-ghost rv-focusable"
        >
          {salvandoESaindo && <Spinner size={13} strokeWidth={2} className="mo-spin" aria-hidden="true" />}
          {salvandoESaindo ? "Salvando…" : "Salvar e sair"}
        </button>
        <button onClick={handleCancelarCriacao} className="rm-btn rm-btn-danger rv-focusable">Cancelar criação</button>
      </div>

      {/* NÃO é `role="tablist"`/`role="tab"` de propósito (auditoria da
          Fase 6): isso anunciaria o padrão ARIA de abas — que exige
          `tabpanel`, `aria-controls`, roving `tabIndex` e navegação por
          setas, nenhum implementado aqui — para leitores de tela.
          Etapas de wizard livremente pulável não são abas: são um
          indicador de progresso/navegação, o mesmo caso já resolvido
          pro trilho da campanha (correção #8 do plano — `aria-current`,
          nunca `aria-selected`, pra navegação que não é um conjunto de
          abas de conteúdo). `aria-current="step"` é o valor do padrão
          feito exatamente para isto. */}
      <nav className="rm-pills" aria-label="Etapas da criação" style={{ marginBottom: 24 }}>
        {ETAPAS.map((e) => (
          <button
            key={e.id}
            aria-current={step === e.id ? "step" : undefined}
            onClick={() => irParaEtapa(e.id)}
            className="rm-pill rv-focusable"
            data-testid={`wizard-etapa-${e.id}`}
          >
            {e.id}. {e.nome}
          </button>
        ))}
      </nav>

      {/*
        `mo-panel-in` em cada etapa: a troca de passo é uma troca de
        PAINEL (a moldura — título, pills de etapa, rodapé — não muda),
        então leva o degrau curto de 200ms/6px, nunca o de rota. Sem
        isto, pular de etapa trocava o conteúdo seco e não havia sinal
        nenhum de que o painel abaixo das pills tinha sido substituído.

        Cada `<section>` já remonta sozinha na troca (o slot anterior
        vira `false` e o novo monta), então a animação dispara pela
        montagem — sem `key` artificial e sem estado de transição.
      */}
      {step === 1 && (
        <section className="mo-panel-in">
          <h2 className="rm-section-title">Etapa 1 — Conceito e identidade</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 480 }}>
            <label className="rm-field">
              <span className="rm-field-label">Nome *</span>
              <input data-testid="wizard-nome" value={identidade.nome} onChange={(e) => setIdentidade({ ...identidade, nome: e.target.value })} className="rm-input rv-focusable" />
            </label>
            <label className="rm-field">
              <span className="rm-field-label">Alcunha</span>
              <input value={identidade.alcunha} onChange={(e) => setIdentidade({ ...identidade, alcunha: e.target.value })} className="rm-input rv-focusable" />
            </label>
            <label className="rm-field">
              <span className="rm-field-label">Conceito</span>
              <input value={identidade.conceito} onChange={(e) => setIdentidade({ ...identidade, conceito: e.target.value })} className="rm-input rv-focusable" />
            </label>
            <label className="rm-field">
              <span className="rm-field-label">Origem</span>
              <select data-testid="wizard-origem" value={identidade.origem} onChange={(e) => setIdentidade({ ...identidade, origem: e.target.value })} className="rm-select rv-focusable">
                {ORIGENS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </label>
            <label className="rm-field">
              <span className="rm-field-label">Idioma (regional + vastrano)</span>
              <input value={identidade.idioma} onChange={(e) => setIdentidade({ ...identidade, idioma: e.target.value })} className="rm-input rv-focusable" />
            </label>
            <label className="rm-field">
              <span className="rm-field-label">Afiliação</span>
              <input value={identidade.afiliacao} onChange={(e) => setIdentidade({ ...identidade, afiliacao: e.target.value })} className="rm-input rv-focusable" />
            </label>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="mo-panel-in">
          <h2 className="rm-section-title">Etapa 2 — Atributos</h2>
          <p data-testid="wizard-atributos-pontos-restantes" style={{ fontSize: 13, marginBottom: 12, color: pontosAtributoRestantes === 0 ? "var(--rm-success)" : "var(--am)" }}>
            Pontos restantes: {pontosAtributoRestantes} / {atributoPontosAdicionais} (teto de criação: {atributoTeto})
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {regras.atributos.map((a) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 80, fontSize: 13 }}>{a.nome}</span>
                <button data-testid={`wizard-atributo-${a.id}-menos`} onClick={() => ajustarAtributo(a.id, -1)} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable">-</button>
                <span data-testid={`wizard-atributo-${a.id}-valor`} style={{ width: 24, textAlign: "center" }}>{atributos[a.id] ?? atributoValorInicial}</span>
                <button data-testid={`wizard-atributo-${a.id}-mais`} onClick={() => ajustarAtributo(a.id, 1)} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable">+</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="mo-panel-in">
          <h2 className="rm-section-title">Etapa 3 — Perícias</h2>
          <p data-testid="wizard-pericias-pontos-restantes" style={{ fontSize: 13, marginBottom: 12, color: pontosPericiaRestantes >= 0 ? "var(--rm-success)" : "var(--rm-danger)" }}>
            Pontos restantes: {pontosPericiaRestantes} / {periciaPontosTotais} (teto de criação: {periciaTeto})
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 8 }}>
            {regras.pericias.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, fontSize: 12 }}>{p.nome}</span>
                <button data-testid={`wizard-pericia-${p.id}-menos`} onClick={() => ajustarPericia(p.id, -1)} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable">-</button>
                <span data-testid={`wizard-pericia-${p.id}-valor`} style={{ width: 20, textAlign: "center" }}>{pericias[p.id] ?? 0}</span>
                <button data-testid={`wizard-pericia-${p.id}-mais`} onClick={() => ajustarPericia(p.id, 1)} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable">+</button>
              </div>
            ))}
          </div>
        </section>
      )}

      {step === 4 && (
        <section className="mo-panel-in">
          <h2 className="rm-section-title">Etapa 4 — Vertentes e magias</h2>
          {magiasErro ? (
            <div className="rm-note rm-note--danger" role="alert" data-testid="wizard-magias-erro">
              Não foi possível carregar as magias publicadas nesta mesa: {magiasErro}{" "}
              <button type="button" onClick={() => router.refresh()} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable" style={{ marginLeft: 6 }}>
                Tentar de novo
              </button>
            </div>
          ) : vertentesDisponiveis.length === 0 ? (
            <p className="rm-faint">
              Nenhuma magia publicada nesta mesa ainda — não há vertentes para investir. Avance sem preencher nada.
            </p>
          ) : (
            <>
              <p data-testid="wizard-vertentes-pontos-restantes" style={{ fontSize: 13, marginBottom: 12, color: pontosVertenteRestantes === 0 ? "var(--rm-success)" : "var(--am)" }}>
                Pontos restantes: {pontosVertenteRestantes} / {PONTOS_VERTENTE_CRIACAO}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {vertentesDisponiveis.map((v) => (
                  <div key={v.slug} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 140, fontSize: 13 }}>{v.label}</span>
                    <button data-testid={`wizard-vertente-${v.slug}-menos`} onClick={() => ajustarVertente(v.slug, -1)} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable">-</button>
                    <span data-testid={`wizard-vertente-${v.slug}-valor`} style={{ width: 24, textAlign: "center" }}>{niveisVertente[v.slug] ?? 0}</span>
                    <button data-testid={`wizard-vertente-${v.slug}-mais`} onClick={() => ajustarVertente(v.slug, 1)} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable">+</button>
                    {(niveisVertente[v.slug] ?? 0) > 0 && (
                      <span className="rm-faint">CD de resistência: {6 + (niveisVertente[v.slug] ?? 0)}</span>
                    )}
                  </div>
                ))}
              </div>

              <h3 className="rm-section-title">Magias liberadas pelo nível investido</h3>
              {magiasElegiveis.length === 0 ? (
                <p className="rm-faint">Invista pontos numa vertente para liberar magias.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {magiasElegiveis.map((magia) => (
                    <label key={magia.slug} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="checkbox"
                        data-testid={`wizard-magia-${magia.slug}`}
                        checked={magiasEscolhidas.has(magia.slug)}
                        onChange={() => toggleMagia(magia.slug)}
                      />
                      {magia.nome} <span className="rm-faint">({magia.vertente_label ?? magia.vertente}, nível {magia.estatisticas.nivel})</span>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {step === 5 && (
        <section className="mo-panel-in">
          <h2 className="rm-section-title">Etapa 5 — Talento inicial</h2>
          {talentosErro ? (
            <div className="rm-note rm-note--danger" role="alert" data-testid="wizard-talentos-erro">
              Não foi possível carregar os talentos publicados nesta mesa: {talentosErro}{" "}
              <button type="button" onClick={() => router.refresh()} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable" style={{ marginLeft: 6 }}>
                Tentar de novo
              </button>
            </div>
          ) : talentoOptions.length > 0 ? (
            <>
              <p className="rm-faint" style={{ marginBottom: 8 }}>Escolha 1 talento de nível 1 (da Biblioteca).</p>
              <select
                data-testid="wizard-talento-select"
                value={talentoNivelIdEscolhido}
                onChange={(e) => setTalentoNivelIdEscolhido(e.target.value)}
                className="rm-select rv-focusable"
                style={{ maxWidth: 420 }}
              >
                <option value="">— nenhum —</option>
                {talentoOptions.map((t) => (
                  <option key={t.nivelId} value={t.nivelId}>{t.nome}</option>
                ))}
              </select>
            </>
          ) : (
            <p className="rm-faint">
              Nenhum talento de nível 1 publicado nesta mesa ainda. Avance sem escolher.
            </p>
          )}
        </section>
      )}

      {step === 6 && (
        <section className="mo-panel-in">
          <h2 className="rm-section-title">Etapa 6 — Inventário</h2>
          <p style={{ fontSize: 13, marginBottom: 12 }}>
            Aretz: <strong data-testid="wizard-aretz-restante">{carteira.aretz_informal}</strong> / {aretzIniciais}
          </p>
          <p className="rm-faint" style={{ marginBottom: 12 }}>
            Loja restrita a itens de raridade até incomum na criação (PRD 3.2) — raros e muito raros liberados só em jogo.
          </p>
          {itensLojaErro ? (
            <div className="rm-note rm-note--danger" role="alert" data-testid="wizard-itens-erro" style={{ marginBottom: 20 }}>
              Não foi possível carregar os itens da loja desta mesa: {itensLojaErro}{" "}
              <button type="button" onClick={() => router.refresh()} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable" style={{ marginLeft: 6 }}>
                Tentar de novo
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 8, marginBottom: 20 }}>
              {itensLoja.map((item) => (
                <div key={item.slug} className="rm-card rm-card-row">
                  <span style={{ fontSize: 12 }}>{item.nome} — {item.preco} aretz</span>
                  <button data-testid={`wizard-comprar-${item.slug}`} onClick={() => handleComprarItem(item)} className="rm-btn rm-btn-primary rm-btn-sm rv-focusable">Comprar</button>
                </div>
              ))}
            </div>
          )}

          {/* "Inventário inicial" é sobre itens JÁ comprados (estado do
              cliente) — nunca afetado por uma falha na leitura do
              catálogo da loja, continua visível independente dela. */}
          <h3 className="rm-section-title">Inventário inicial ({inventario.length})</h3>
          {inventario.length === 0 ? (
            <p className="rm-faint">Nenhum item comprado ainda.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {inventario.map((instancia) => (
                <div key={instancia.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                  <span>{instancia.itemNome} × {instancia.quantidade}</span>
                  <button data-testid={`wizard-remover-${instancia.id}`} onClick={() => handleRemoverItem(instancia.id)} className="rm-btn rm-btn-ghost rm-btn-sm rv-focusable">Remover</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {step === 7 && (
        <section className="mo-panel-in">
          <h2 className="rm-section-title">Etapa 7 — Revisão</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, marginBottom: 16 }}>
            <span><strong>Nome:</strong> {identidade.nome || "(vazio)"}</span>
            <span><strong>Alcunha:</strong> {identidade.alcunha || "—"}</span>
            <span><strong>Conceito:</strong> {identidade.conceito || "—"}</span>
            <span><strong>Origem:</strong> {identidade.origem}</span>
            <span><strong>Idioma:</strong> {identidade.idioma || "—"}</span>
            <span><strong>Afiliação:</strong> {identidade.afiliacao || "—"}</span>
            <span>
              <strong>Atributos:</strong>{" "}
              {regras.atributos.map((a) => `${a.nome} ${atributos[a.id] ?? atributoValorInicial}`).join(" · ")}
            </span>
            <span>
              <strong>Perícias investidas:</strong>{" "}
              {regras.pericias.filter((p) => (pericias[p.id] ?? 0) > 0).map((p) => `${p.nome} ${pericias[p.id]}`).join(" · ") || "nenhuma"}
            </span>
            <span>
              <strong>Vertentes:</strong>{" "}
              {vertentesDisponiveis
                .filter((v) => (niveisVertente[v.slug] ?? 0) > 0)
                .map((v) => `${v.label} ${niveisVertente[v.slug]}`)
                .join(" · ") || "nenhuma"}
            </span>
            <span>
              <strong>Magias conhecidas:</strong>{" "}
              {magiasEscolhidasValidas.map((slug) => magiasElegiveis.find((m) => m.slug === slug)?.nome ?? slug).join(" · ") || "nenhuma"}
            </span>
            <span><strong>Talento inicial:</strong> {talentoSelecionado?.nome ?? "nenhum"}</span>
            <span><strong>Inventário:</strong> {inventario.map((i) => `${i.itemNome} ×${i.quantidade}`).join(" · ") || "nenhum item"}</span>
            <span><strong>Aretz restante:</strong> {carteira.aretz_informal} / {aretzIniciais}</span>
          </div>

          {!vertentesValidas && vertentesDisponiveis.length > 0 && (
            <p role="alert" className="rm-erro" style={{ marginBottom: 8 }}>
              Vertentes inválidas — volte à Etapa 4 e distribua exatamente {PONTOS_VERTENTE_CRIACAO} pontos.
            </p>
          )}

          {!atributosValidos && (
            <p role="alert" className="rm-erro" style={{ marginBottom: 8 }}>
              Atributos inválidos — volte à Etapa 2 e distribua exatamente {atributoPontosAdicionais} pontos (teto {atributoTeto}).
            </p>
          )}
          {!periciasValidas && (
            <p role="alert" className="rm-erro" style={{ marginBottom: 8 }}>
              Perícias inválidas — volte à Etapa 3 (máximo {periciaPontosTotais} pontos, teto {periciaTeto} por perícia).
            </p>
          )}
          {!identidade.nome.trim() && (
            <p role="alert" className="rm-erro" style={{ marginBottom: 8 }}>Nome é obrigatório (Etapa 1).</p>
          )}

          <button
            data-testid="wizard-finalizar-button"
            onClick={finalizar}
            disabled={!podeFinalizar || criando}
            data-pending={criando}
            aria-busy={criando}
            className="rm-btn rm-btn-primary rv-focusable"
          >
            {criando && <Spinner size={13} strokeWidth={2} className="mo-spin" aria-hidden="true" />}
            {criando ? "Criando…" : "Criar personagem"}
          </button>
        </section>
      )}
    </main>
  );
}
