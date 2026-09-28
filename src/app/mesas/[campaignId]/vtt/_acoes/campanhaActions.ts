"use server";

/**
 * O QUE ERA PÁGINA, agora chamável de dentro da mesa.
 *
 * Mercado, Configurações, Livro e Conteúdo da campanha eram rotas
 * próprias — cada uma um Server Component que lia do `lib/` e
 * renderizava. Sair da mesa pra abrir qualquer uma delas custava a
 * sessão inteira: mapa, câmera, chat, janelas abertas. A mesa é a
 * única tela, então as telas viraram janelas e os Server Components
 * viraram estas ações.
 *
 * Nenhuma regra nova mora aqui: é a mesma leitura que as páginas
 * faziam, com a mesma guarda de acesso (`resolveCampaignAccess`, e
 * `narrator` onde a rota exigia narrador) e o mesmo formato de
 * resultado das outras ações do VTT — erro vira valor, nunca exceção
 * atravessando a fronteira.
 */

import "server-only";
import { resolveCampaignAccess } from "../../../../../lib/campaign/access";
import { listCharactersForNarratorCampaign, listControlledCharacters } from "../../../../../lib/character/storage";
import { renameCampaign } from "../../../../../lib/table/storage";
import { getCharacterRules } from "../../../../../lib/content";
import { listItemsEffective, listSpellsEffective, listTalentsEffective } from "../../../../../lib/campaignContent";
import {
  normalizeItemContent,
  normalizeSpellContent,
  normalizeTalentContent,
  type CharacterRulesPayload,
  type ItemContent,
  type SpellContent,
  type TalentContent,
} from "../../../../../lib/character";
import { RARIDADES_PERMITIDAS_NA_CRIACAO } from "./tiposDeConteudo";
import { compararTresVias, type ComparacaoTresVias } from "../../../../../lib/campaignContent/campaignContentDiff";
import { getContentDocument } from "../../../../../lib/content/queries";
import { getOpcoesDeRegras, type OpcoesDeRegras } from "../../../../../lib/contentSchema/characterRuleOptions";
import { construirDraftViewModel, type BaseDocumentoStatus, type DraftEfeitosPreservados } from "../../../../../lib/contentSchema/draftView";
import type { ContentDraftRow } from "../../../../../lib/contentSchema/draftTypes";
import { listConditions } from "../../../../../lib/content/queries";
import {
  getCampaignContentDocumentById,
  getCampaignDraftById,
  listCampaignDrafts,
  listCapitulosEffective,
  resolveEffectiveList,
  type CampaignContentDocumentRow,
  type CampaignContentDraftRow,
  type ConteudoEfetivo,
} from "../../../../../lib/campaignContent";
import { TIPOS_DE_CONTEUDO } from "./tiposDeConteudo";

export interface ResultadoAcao<T = undefined> {
  ok: boolean;
  erro?: string;
  dados?: T;
}

async function exigirAcesso(campaignId: string) {
  const acesso = await resolveCampaignAccess(campaignId);
  if (acesso.kind !== "ok") {
    return { erro: acesso.kind === "no_session" ? "Sessão expirada." : "Você não tem acesso a esta campanha." };
  }
  return { acesso };
}

/** As janelas de administração são do narrador, como as rotas eram. */
async function exigirNarrador(campaignId: string) {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return v;
  if (v.acesso!.role !== "narrator") return { erro: "Só o narrador acessa esta área." };
  return v;
}

// ── Mercado ──────────────────────────────────────────────────────────
/**
 * Quem tem carteira. A LOJA não está aqui e nunca esteve: ela vive na
 * aba Inventário da ficha, e a página `/mercado` era só este seletor
 * na frente dela. A janela faz o mesmo e abre o Console na aba certa.
 */
export interface PersonagemDaMesa {
  id: string;
  nome: string;
  arquivado: boolean;
}

export async function listarPersonagensDaMesaAction(
  campaignId: string,
): Promise<ResultadoAcao<PersonagemDaMesa[]>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    // O narrador vê todos; o jogador, só os que controla — exatamente o
    // que a página fazia, e a mesma razão: a lista é a resposta a "de
    // quem é a carteira que eu posso abrir".
    const lista = v.acesso!.role === "narrator"
      ? await listCharactersForNarratorCampaign(campaignId)
      : await listControlledCharacters(campaignId);
    return {
      ok: true,
      dados: lista
        .filter((c) => !c.archived_at)
        .map((c) => ({ id: c.id, nome: c.name, arquivado: c.archived_at !== null })),
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao listar os personagens." };
  }
}

// ── Configurações da mesa ────────────────────────────────────────────
export async function renomearCampanhaAction(
  campaignId: string,
  nome: string,
): Promise<ResultadoAcao<{ nome: string }>> {
  const v = await exigirNarrador(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  if (!nome.trim()) return { ok: false, erro: "O nome da campanha não pode ficar vazio." };
  try {
    const campanha = await renameCampaign(campaignId, nome);
    return { ok: true, dados: { nome: campanha.name } };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao renomear a mesa." };
  }
}

// ── Livro ────────────────────────────────────────────────────────────
export interface CapituloDoLivro {
  slug: string;
  nome: string;
  descricaoCurta?: string;
  categoria?: string;
  tags: string[];
}

/**
 * O sumário. Só `published`: rascunho é do narrador e mora no Conteúdo
 * da campanha — o Livro é leitura, e para os dois papéis.
 */
export async function listarCapitulosAction(
  campaignId: string,
): Promise<ResultadoAcao<CapituloDoLivro[]>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    const docs = await listCapitulosEffective(campaignId);
    const capitulos = docs
      .filter((doc) => (doc.payload as { status?: string }).status === "published")
      .map((doc) => {
        const p = doc.payload as { nome?: string; descricao_curta?: string; categoria?: string; tags?: string[] };
        return {
          slug: doc.slug,
          nome: p.nome ?? doc.slug,
          descricaoCurta: p.descricao_curta,
          categoria: p.categoria,
          tags: Array.isArray(p.tags) ? p.tags : [],
        };
      });
    return { ok: true, dados: capitulos };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao carregar o Livro." };
  }
}

export interface BlocoDoCapitulo {
  id: string;
  tipo: string;
  texto?: string;
  entidade?: { tipo_conteudo: string; slug: string };
}

export interface CapituloAberto {
  slug: string;
  nome: string;
  descricaoCurta?: string;
  corpo?: string;
  blocos: BlocoDoCapitulo[];
  /** Vizinhos na ordem alfabética — a mesma paginação que o leitor tinha. */
  anterior: { slug: string; nome: string } | null;
  proximo: { slug: string; nome: string } | null;
  /** Nome de cada capítulo, pra resolver os blocos que apontam pra outro. */
  nomesPorSlug: Record<string, string>;
}

/** Um capítulo inteiro, com os vizinhos — o leitor da janela. */
export async function lerCapituloAction(
  campaignId: string,
  slug: string,
): Promise<ResultadoAcao<CapituloAberto>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    const docs = await listCapitulosEffective(campaignId);
    const publicados = docs
      .filter((doc) => (doc.payload as { status?: string }).status === "published")
      .map((doc) => ({
        slug: doc.slug,
        nome: (doc.payload as { nome?: string }).nome ?? doc.nome ?? doc.slug,
        payload: doc.payload as {
          descricao_curta?: string;
          corpo?: string;
          blocos?: BlocoDoCapitulo[];
        },
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome));

    const i = publicados.findIndex((c) => c.slug === slug);
    if (i === -1) return { ok: false, erro: "Capítulo não encontrado." };
    const atual = publicados[i];
    const vizinho = (c: (typeof publicados)[number] | undefined) => (c ? { slug: c.slug, nome: c.nome } : null);

    return {
      ok: true,
      dados: {
        slug: atual.slug,
        nome: atual.nome,
        descricaoCurta: atual.payload.descricao_curta,
        corpo: atual.payload.corpo,
        blocos: Array.isArray(atual.payload.blocos) ? atual.payload.blocos : [],
        anterior: vizinho(publicados[i - 1]),
        proximo: vizinho(publicados[i + 1]),
        nomesPorSlug: Object.fromEntries(publicados.map((c) => [c.slug, c.nome])),
      },
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao abrir o capítulo." };
  }
}

// ── Conteúdo da campanha ─────────────────────────────────────────────
export interface ConteudoDaCampanha {
  /** A lista EFETIVA, na forma que a tabela já sabe desenhar. */
  efetivos: ConteudoEfetivo[];
  rascunhos: CampaignContentDraftRow[];
  rascunhosErro: string | null;
}

/**
 * A lista EFETIVA (oficial + override + homebrew) dos quatro tipos
 * editáveis, mais os rascunhos. Devolve a MESMA forma que a página
 * montava — a tabela é o componente de lá, reaproveitado inteiro.
 *
 * Os rascunhos falham À PARTE, como na página: a lista efetiva é o
 * conteúdo principal, e degradá-la a vazio faria uma falha técnica
 * virar a afirmação "esta campanha não tem conteúdo".
 */
export async function lerConteudoDaCampanhaAction(
  campaignId: string,
): Promise<ResultadoAcao<ConteudoDaCampanha>> {
  const v = await exigirNarrador(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    const listas = await Promise.all(TIPOS_DE_CONTEUDO.map((t) => resolveEffectiveList(campaignId, t.id)));
    const efetivos = listas.flat();

    let rascunhos: CampaignContentDraftRow[] = [];
    let rascunhosErro: string | null = null;
    try {
      rascunhos = await listCampaignDrafts(campaignId);
    } catch (e) {
      rascunhosErro = e instanceof Error ? e.message : "Erro ao carregar os rascunhos abertos.";
    }

    return { ok: true, dados: { efetivos, rascunhos, rascunhosErro } };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao carregar o conteúdo da campanha." };
  }
}

/**
 * A COMPARAÇÃO DE TRÊS VIAS de um override — o que a sub-rota
 * `/biblioteca/comparar/[docId]` montava.
 *
 * `getContentDocument` distingue os dois casos e é por isso que não há
 * `.catch(() => null)` aqui: ele devolve `null` quando o oficial de
 * fato não existe mais publicado, e LANÇA quando a leitura falha.
 * Colapsar os dois faria o diff ser calculado contra `{}`, mostrando o
 * oficial tendo removido TUDO — informação errada numa tela cuja
 * função é embasar a decisão de manter ou descartar o override.
 */
export interface ComparacaoAberta {
  doc: CampaignContentDocumentRow;
  comparacao: ComparacaoTresVias;
  oficialExiste: boolean;
  oficialVersaoAtual: string | number | null;
}

export async function lerComparacaoAction(
  campaignId: string,
  docId: string,
): Promise<ResultadoAcao<ComparacaoAberta>> {
  const v = await exigirNarrador(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    const doc = await getCampaignContentDocumentById(docId);
    if (!doc || doc.campaign_id !== campaignId || doc.origin_type !== "override") {
      return { ok: false, erro: "Documento não encontrado nesta campanha." };
    }
    const oficialAtual = await getContentDocument(doc.content_type as Parameters<typeof getContentDocument>[0], doc.slug);
    const comparacao = compararTresVias(
      doc.official_snapshot ?? {},
      (oficialAtual?.payload as Record<string, unknown>) ?? {},
      doc.payload,
    );
    return {
      ok: true,
      dados: {
        doc,
        comparacao,
        oficialExiste: Boolean(oficialAtual),
        oficialVersaoAtual: oficialAtual?.version ?? null,
      },
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao comparar com o oficial." };
  }
}

/** Um rascunho aberto para edição — o que `/biblioteca/rascunho/[draftId]` montava. */
export interface RascunhoAberto {
  draft: CampaignContentDraftRow;
  efeitosPreservados: DraftEfeitosPreservados[];
  baseDocumentoStatus: BaseDocumentoStatus;
  opcoes: OpcoesDeRegras;
  condicoesDisponiveis: { slug: string; nome: string }[];
}

export async function lerRascunhoAction(
  campaignId: string,
  draftId: string,
): Promise<ResultadoAcao<RascunhoAberto>> {
  const v = await exigirNarrador(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };
  try {
    const draft = await getCampaignDraftById(draftId);
    if (!draft || draft.campaign_id !== campaignId) {
      return { ok: false, erro: "Rascunho não encontrado nesta campanha." };
    }
    const paraViewModel = {
      ...draft,
      base_document_id: draft.base_official_document_id,
    } as unknown as ContentDraftRow;

    const [viewModel, opcoes, condicoes] = await Promise.all([
      construirDraftViewModel(paraViewModel),
      getOpcoesDeRegras(),
      listConditions(),
    ]);

    return {
      ok: true,
      dados: {
        draft,
        efeitosPreservados: viewModel.efeitosPreservados,
        baseDocumentoStatus: viewModel.baseDocumentoStatus,
        opcoes,
        condicoesDisponiveis: condicoes.map((c) => ({ slug: c.slug, nome: c.nome ?? c.slug })),
      },
    };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Falha ao abrir o rascunho." };
  }
}

// ── Criação de personagem ────────────────────────────────────────────
/**
 * Os catálogos do ASSISTENTE de criação — o que a rota
 * `/personagens/novo` lia antes de montar o wizard.
 *
 * Os três catálogos falham POR RECURSO, não em vazio silencioso, e a
 * razão é forte: os três têm um "vazio de verdade" legítimo (mesa nova,
 * Biblioteca sem nada publicado — o wizard até diz "avance sem
 * preencher"). Colapsar falha de leitura no mesmo `[]` faria alguém
 * fechar um personagem acreditando que a mesa não tem talento nenhum,
 * quando na verdade a consulta quebrou.
 */
export interface CatalogosDaCriacao {
  regras: CharacterRulesPayload | null;
  talentos: TalentContent[];
  talentosErro: string | null;
  magias: SpellContent[];
  magiasErro: string | null;
  itensLoja: ItemContent[];
  itensLojaErro: string | null;
}

export async function lerCatalogosDaCriacaoAction(
  campaignId: string,
): Promise<ResultadoAcao<CatalogosDaCriacao>> {
  const v = await exigirAcesso(campaignId);
  if (v.erro) return { ok: false, erro: v.erro };

  let regras: CharacterRulesPayload | null = null;
  try {
    const doc = await getCharacterRules();
    regras = (doc?.payload as CharacterRulesPayload | undefined) ?? null;
  } catch {
    regras = null;
  }

  let talentos: TalentContent[] = [];
  let talentosErro: string | null = null;
  try {
    const docs = await listTalentsEffective(campaignId);
    talentos = docs.map((d) => normalizeTalentContent(d.payload)).filter((t) => t.status === "published");
  } catch (e) {
    talentosErro = e instanceof Error ? e.message : "Erro ao carregar talentos.";
  }

  let magias: SpellContent[] = [];
  let magiasErro: string | null = null;
  try {
    const docs = await listSpellsEffective(campaignId);
    magias = docs.map((d) => normalizeSpellContent(d.payload)).filter((m) => m.status === "published");
  } catch (e) {
    magiasErro = e instanceof Error ? e.message : "Erro ao carregar magias.";
  }

  let itensLoja: ItemContent[] = [];
  let itensLojaErro: string | null = null;
  try {
    const docs = await listItemsEffective(campaignId);
    itensLoja = docs
      .map((d) => normalizeItemContent(d.payload))
      .filter((i) => i.raridade != null && RARIDADES_PERMITIDAS_NA_CRIACAO.has(i.raridade));
  } catch (e) {
    itensLojaErro = e instanceof Error ? e.message : "Erro ao carregar itens da loja.";
  }

  return { ok: true, dados: { regras, talentos, talentosErro, magias, magiasErro, itensLoja, itensLojaErro } };
}
