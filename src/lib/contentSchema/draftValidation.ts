/**
 * Validação de campos editáveis do rascunho (Etapa 3). Complementa —
 * nunca substitui — `validarConteudo` (Etapa 1), que continua validando
 * os efeitos preservados/somente-leitura. Separa erros bloqueantes de
 * avisos, como pedido no checkpoint.
 */

import { getContentDocument } from "../content/queries";
import type { ContentType } from "../content/types";
import { findDraftBySlug } from "./draftQueries";
import type { CamposCapitulo, CamposComuns, CamposItem, CamposMagia, CamposRuna, CamposTalento, ContentDraftRow, DraftContentType } from "./draftTypes";
import { validarEfeitosEditaveis } from "./effectDraftValidation";
import { isValidSlug } from "./slug";
import type { ResultadoValidacao } from "./types";

function mesclarValidacao(erros: string[], avisos: string[], infos: string[], origem: ResultadoValidacao, prefixo: string): void {
  erros.push(...origem.erros.map((e) => `${prefixo}: ${e}`));
  avisos.push(...origem.avisos.map((a) => `${prefixo}: ${a}`));
  infos.push(...origem.infos.map((i) => `${prefixo}: ${i}`));
}

async function existeSlugColidindo(contentType: DraftContentType, slug: string, ignorarDraftId?: string): Promise<boolean> {
  const publicado = await getContentDocument(contentType as ContentType, slug);
  if (publicado) return true;

  const draftExistente = await findDraftBySlug(contentType, slug);
  if (draftExistente && draftExistente.id !== ignorarDraftId) return true;

  return false;
}

function validarCamposComuns(campos: CamposComuns, erros: string[], avisos: string[]): void {
  if (!campos.nome || campos.nome.trim() === "") erros.push("Nome é obrigatório.");
  if (!campos.slug || campos.slug.trim() === "") {
    erros.push("Slug é obrigatório.");
  } else if (!isValidSlug(campos.slug)) {
    erros.push('Slug inválido — use letras minúsculas, números e "_", começando por letra (ex.: "rajada_ignea").');
  }
  if (!campos.descricaoCurta) avisos.push("Sem descrição curta.");
}

function validarCustoNaoNegativo(valor: number | undefined, nomeCampo: string, erros: string[]): void {
  if (valor != null && valor < 0) erros.push(`${nomeCampo} não pode ser negativo.`);
}

async function validarRequisitos(requisitos: { tipoConteudo: string; slug: string }[], erros: string[]): Promise<void> {
  for (const req of requisitos) {
    if (req.tipoConteudo === "desconhecido") continue;
    const encontrado = await getContentDocument(req.tipoConteudo as ContentType, req.slug).catch(() => null);
    if (!encontrado) erros.push(`Referência inexistente: ${req.tipoConteudo}:${req.slug}.`);
  }
}

export interface ValidacaoCamposResultado extends ResultadoValidacao {}

export async function validarCamposMagia(campos: CamposMagia, draftId?: string): Promise<ValidacaoCamposResultado> {
  const erros: string[] = [];
  const avisos: string[] = [];
  const infos: string[] = [];

  validarCamposComuns(campos, erros, avisos);
  if (campos.slug && isValidSlug(campos.slug) && (await existeSlugColidindo("spell", campos.slug, draftId))) {
    erros.push(`Já existe conteúdo publicado ou outro rascunho com o slug "${campos.slug}".`);
  }
  validarCustoNaoNegativo(campos.custoPa, "Custo de PA", erros);
  validarCustoNaoNegativo(campos.custoMana, "Custo de Mana", erros);
  validarCustoNaoNegativo(campos.custoSobrecarga, "Custo de Sobrecarga", erros);
  if (!campos.vertente) avisos.push("Sem vertente definida.");
  if (!campos.nivel) avisos.push("Sem nível definido.");
  await validarRequisitos(campos.requisitos, erros);

  mesclarValidacao(erros, avisos, infos, await validarEfeitosEditaveis(campos.efeitos), "Efeitos");

  return { valido: erros.length === 0, erros, avisos, infos };
}

export async function validarCamposItem(campos: CamposItem, draftId?: string): Promise<ValidacaoCamposResultado> {
  const erros: string[] = [];
  const avisos: string[] = [];
  const infos: string[] = [];

  validarCamposComuns(campos, erros, avisos);
  if (campos.slug && isValidSlug(campos.slug) && (await existeSlugColidindo("item", campos.slug, draftId))) {
    erros.push(`Já existe conteúdo publicado ou outro rascunho com o slug "${campos.slug}".`);
  }
  validarCustoNaoNegativo(campos.preco, "Preço", erros);
  validarCustoNaoNegativo(campos.custoPa, "Custo de PA", erros);
  validarCustoNaoNegativo(campos.quantidadePadrao, "Quantidade padrão", erros);
  validarCustoNaoNegativo(campos.cargasPadrao, "Cargas padrão", erros);

  for (const propriedadeSlug of campos.propriedades) {
    const encontrada = await getContentDocument("property", propriedadeSlug).catch(() => null);
    if (!encontrada) erros.push(`Propriedade referenciada não encontrada: "${propriedadeSlug}".`);
  }

  mesclarValidacao(erros, avisos, infos, await validarEfeitosEditaveis(campos.efeitos), "Efeitos");

  return { valido: erros.length === 0, erros, avisos, infos };
}

const SLOTS_POSSIVEIS_VALIDOS = new Set(["arma", "armadura", "escudo"]);

export async function validarCamposRuna(campos: CamposRuna, draftId?: string): Promise<ValidacaoCamposResultado> {
  const erros: string[] = [];
  const avisos: string[] = [];
  const infos: string[] = [];

  validarCamposComuns(campos, erros, avisos);
  if (campos.slug && isValidSlug(campos.slug) && (await existeSlugColidindo("rune", campos.slug, draftId))) {
    erros.push(`Já existe conteúdo publicado ou outro rascunho com o slug "${campos.slug}".`);
  }
  validarCustoNaoNegativo(campos.preco, "Preço", erros);

  if (campos.slotsPossiveis.length === 0) {
    erros.push("Runa precisa de ao menos um slot possível (arma, armadura ou escudo).");
  }
  for (const s of campos.slotsPossiveis) {
    if (!SLOTS_POSSIVEIS_VALIDOS.has(s)) erros.push(`Slot possível "${s}" não é reconhecido (use arma, armadura ou escudo).`);
  }
  if (campos.restricaoSubtipo && !campos.slotsPossiveis.includes("arma")) {
    avisos.push("Restrição de subtipo só faz sentido quando \"arma\" está entre os slots possíveis.");
  }

  mesclarValidacao(erros, avisos, infos, await validarEfeitosEditaveis(campos.efeitos), "Efeitos");

  return { valido: erros.length === 0, erros, avisos, infos };
}

export async function validarCamposTalento(campos: CamposTalento, draftId?: string): Promise<ValidacaoCamposResultado> {
  const erros: string[] = [];
  const avisos: string[] = [];
  const infos: string[] = [];

  validarCamposComuns(campos, erros, avisos);
  if (campos.slug && isValidSlug(campos.slug) && (await existeSlugColidindo("talent", campos.slug, draftId))) {
    erros.push(`Já existe conteúdo publicado ou outro rascunho com o slug "${campos.slug}".`);
  }

  campos.niveis.forEach((nivel, indice) => {
    if (!nivel.nomeNivel || nivel.nomeNivel.trim() === "") avisos.push(`Nível ${indice + 1}: sem nome ainda.`);
  });

  for (const [indice, nivel] of campos.niveis.entries()) {
    await validarRequisitos(nivel.requisitos, erros);
    mesclarValidacao(erros, avisos, infos, await validarEfeitosEditaveis(nivel.efeitos), `Nível ${indice + 1} — Efeitos`);
  }

  return { valido: erros.length === 0, erros, avisos, infos };
}

/**
 * Valida os blocos editoriais de um capítulo (Etapa 11, correção do
 * drag) — é AQUI, no servidor, que o drop é validado de verdade, nunca
 * confiando no que o client arrastou:
 *   - bloco de texto precisa de texto não vazio;
 *   - bloco de entidade precisa existir de verdade na Biblioteca
 *     publicada (nunca aceita uma referência a conteúdo inexistente);
 *   - um capítulo não pode referenciar A SI MESMO (referência circular
 *     mínima real: capitulo:slug apontando para capitulo:slug);
 *   - a mesma entidade não pode aparecer duas vezes no mesmo capítulo
 *     (duplicação proibida, pedido explicitamente pelo escopo do drag).
 */
export async function validarCamposCapitulo(campos: CamposCapitulo, draftId?: string): Promise<ValidacaoCamposResultado> {
  const erros: string[] = [];
  const avisos: string[] = [];
  const infos: string[] = [];

  validarCamposComuns(campos, erros, avisos);
  if (campos.slug && isValidSlug(campos.slug) && (await existeSlugColidindo("capitulo", campos.slug, draftId))) {
    erros.push(`Já existe conteúdo publicado ou outro rascunho com o slug "${campos.slug}".`);
  }

  const chavesVistas = new Set<string>();
  for (const [indice, bloco] of campos.blocos.entries()) {
    const rotulo = `Bloco ${indice + 1}`;
    if (bloco.tipo === "texto") {
      if (!bloco.texto || bloco.texto.trim() === "") erros.push(`${rotulo}: texto vazio.`);
      continue;
    }
    if (bloco.tipo === "entidade") {
      const { contentType, slug } = bloco.entidade;
      if (!contentType || !slug) {
        erros.push(`${rotulo}: referência incompleta.`);
        continue;
      }
      if (contentType === "capitulo" && slug === campos.slug) {
        erros.push(`${rotulo}: um capítulo não pode referenciar a si mesmo.`);
        continue;
      }
      const chave = `${contentType}:${slug}`;
      if (chavesVistas.has(chave)) {
        erros.push(`${rotulo}: referência duplicada a ${chave} — já vinculada em outro bloco deste capítulo.`);
        continue;
      }
      chavesVistas.add(chave);
      const encontrada = await getContentDocument(contentType as ContentType, slug).catch(() => null);
      if (!encontrada) erros.push(`${rotulo}: referência inexistente na Biblioteca (${chave}).`);
      continue;
    }
    erros.push(`${rotulo}: tipo de bloco desconhecido.`);
  }

  return { valido: erros.length === 0, erros, avisos, infos };
}

/** Confere se a linha do rascunho ainda existe/está íntegra antes de operações destrutivas — não é validação de negócio, é sanidade. */
export function garantirDraftEncontrado(draft: ContentDraftRow | null, id: string): asserts draft is ContentDraftRow {
  if (!draft) throw new Error(`Rascunho ${id} não encontrado (ou sem permissão de acesso).`);
}
