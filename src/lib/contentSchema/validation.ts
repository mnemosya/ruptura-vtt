/**
 * Validação do envelope canônico (aditivo §14.3). Separa erros
 * bloqueantes de avisos e informações — não decide sozinha se algo pode
 * ser publicado (isso é Etapa 5); só relata o estado do documento.
 */

import { getEfeitoTipoDefinition } from "./effectTypeRegistry";
import type { CampoDesconhecido, ConteudoCanonico, ResultadoValidacao } from "./types";

const FORMULA_DADO = /^\d+d\d+$/i;

function validarFormulaDado(valor: unknown): boolean {
  return typeof valor === "string" && FORMULA_DADO.test(valor.trim());
}

export function validarConteudo(doc: ConteudoCanonico, camposDesconhecidos: CampoDesconhecido[] = []): ResultadoValidacao {
  const erros: string[] = [];
  const avisos: string[] = [];
  const infos: string[] = [];

  if (!doc.slug || doc.slug.trim() === "") erros.push("slug ausente ou vazio.");
  if (!doc.nome || doc.nome.trim() === "") erros.push("nome ausente ou vazio.");
  if (!doc.schemaVersion) erros.push("schemaVersion ausente — todo documento canônico precisa declarar a versão do schema.");

  if (doc.efeitos.length === 0) {
    infos.push("Documento sem efeitos — válido para tipos majoritariamente narrativos/editoriais.");
  }

  const idsVistos = new Set<string>();
  for (const efeito of doc.efeitos) {
    if (idsVistos.has(efeito.id)) erros.push(`id de efeito duplicado: "${efeito.id}".`);
    idsVistos.add(efeito.id);

    const definicao = getEfeitoTipoDefinition(efeito.tipo);
    if (efeito.tipo === "outro") {
      avisos.push(`Efeito "${efeito.id}" ainda não foi canonicalizado (tipo legado preservado em payloadEspecifico.tipoLegado).`);
    }

    if (efeito.modoAutomacao !== definicao.executor.modo) {
      erros.push(
        `Efeito "${efeito.id}" declara modoAutomacao="${efeito.modoAutomacao}" divergente do catálogo ("${definicao.executor.modo}") — automação não pode ser autodeclarada.`,
      );
    }
    if (efeito.modoAutomacao === "sem_executor") {
      avisos.push(`Efeito "${efeito.id}" (tipo "${efeito.tipo}") não tem executor conhecido — publicação deve deixar isso visível no preview.`);
    }
    if (efeito.modoAutomacao === "lembrete") {
      avisos.push(`Efeito "${efeito.id}" (tipo "${efeito.tipo}") é lembrete — não altera estado de jogo automaticamente.`);
    }

    if (efeito.tipo === "dano" || efeito.tipo === "cura") {
      const dado = efeito.payloadEspecifico.dado;
      const valorFixo = efeito.payloadEspecifico.valorFixo;
      if (dado !== undefined && !validarFormulaDado(dado)) {
        erros.push(`Efeito "${efeito.id}": fórmula de dado inválida ("${String(dado)}") — esperado formato "NdM".`);
      }
      if (dado === undefined && valorFixo === undefined) {
        erros.push(`Efeito "${efeito.id}" (${efeito.tipo}) precisa de "dado" ou "valorFixo".`);
      }
    }

    if (efeito.tipo === "aplicar_condicao" || efeito.tipo === "remover_condicao") {
      const condicao = efeito.payloadEspecifico.condicao;
      if (efeito.tipo === "aplicar_condicao" && (condicao == null || (typeof condicao === "object" && !("slug" in (condicao as object))))) {
        erros.push(`Efeito "${efeito.id}" (aplicar_condicao) precisa de uma referência de condição válida.`);
      }
    }
  }

  for (const referencia of doc.referencias) {
    if (!referencia.slug) {
      erros.push("Referência sem slug — referências quebradas bloqueiam publicação quando necessárias à execução (aditivo §8.10/§13.4).");
    }
    if (referencia.tipoConteudo === "desconhecido") {
      avisos.push(`Referência "${referencia.slug}" sem content_type resolvido.`);
    }
  }

  if (camposDesconhecidos.length > 0) {
    avisos.push(`${camposDesconhecidos.length} campo(s) legado(s) preservado(s) sem representação canônica (ver camposDesconhecidos).`);
  }

  return { valido: erros.length === 0, erros, avisos, infos };
}
