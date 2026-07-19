/**
 * Classificação de impacto de uma publicação sobre instâncias já
 * existentes (Etapa 5). A publicação NUNCA altera estado mutável de
 * instância (o RPC só escreve em content_documents) — esta análise é
 * INFORMATIVA: ajuda a pessoa administradora a entender o alcance da
 * mudança antes de confirmar.
 *
 * A auditoria (Etapa 0) mostrou que personagens/inventário guardam dados
 * em `payload` JSONB próprio: valores mutáveis (munição, cargas, PV/PE,
 * runas instaladas, apelidos, usos, condições ativas) são cópia da
 * instância e nunca são sobrescritos por publicação. Definições lidas
 * dinamicamente por slug (mecânica de magia/talento, ficha técnica de
 * item) refletem a nova versão nas próximas leituras.
 */

import type { MudancaCampo } from "./publishDiff";

export type CategoriaImpacto =
  | "somente_texto"
  | "afeta_novas_aquisicoes"
  | "afeta_leitura_dinamica"
  | "pode_exigir_migracao"
  | "impacto_nao_determinado";

export interface ImpactoInstancias {
  categoria: CategoriaImpacto;
  motivo: string;
  caminhos: string[];
  /** Campos de instância que a publicação garante NÃO tocar. */
  estadoMutavelPreservado: string[];
}

const CAMPOS_MUTAVEIS_NUNCA_TOCADOS = [
  "munição/cargas atuais",
  "PV/PE/Mana/Integridade atuais",
  "MIT/PD atuais",
  "runas instaladas",
  "quantidade em inventário",
  "apelidos",
  "efeitos ativos e usos consumidos",
  "condições ativas",
  "estado de companheiros",
];

/** Caminhos considerados só de texto/apresentação. */
const PREFIXOS_TEXTO = ["nome", "descricao_curta", "descricao_longa", "tags", "categoria_label", "vertente_label", "raridade_label"];

/** Caminhos estruturais que mudam a mecânica lida dinamicamente. */
const PREFIXOS_ESTRUTURAIS = ["estatisticas", "efeitos", "payload_automacao", "niveis", "preco", "raridade", "vertente", "subtipo", "categoria"];

function classificaCaminho(caminho: string): "texto" | "estrutural" | "outro" {
  const topo = caminho.split(".")[0];
  if (PREFIXOS_TEXTO.includes(topo)) return "texto";
  if (PREFIXOS_ESTRUTURAIS.includes(topo)) return "estrutural";
  return "outro";
}

export function classificarImpacto(mudancas: MudancaCampo[], efeitosMudaram: boolean, isNovo: boolean): ImpactoInstancias {
  const caminhos = mudancas.map((m) => m.caminho);

  if (isNovo) {
    return {
      categoria: "afeta_novas_aquisicoes",
      motivo: "Conteúdo novo — só aparece em novas aquisições/leituras; não existe instância anterior para impactar.",
      caminhos,
      estadoMutavelPreservado: CAMPOS_MUTAVEIS_NUNCA_TOCADOS,
    };
  }

  const classes = new Set(mudancas.map((m) => classificaCaminho(m.caminho)));
  const temEstrutural = classes.has("estrutural") || efeitosMudaram;
  const temTexto = classes.has("texto");
  const temOutro = classes.has("outro");

  if (!temEstrutural && temTexto && !temOutro) {
    return {
      categoria: "somente_texto",
      motivo: "Só texto/apresentação mudou — nomes, descrições e tags. Nenhuma mecânica alterada.",
      caminhos,
      estadoMutavelPreservado: CAMPOS_MUTAVEIS_NUNCA_TOCADOS,
    };
  }

  if (temEstrutural) {
    return {
      categoria: "afeta_leitura_dinamica",
      motivo:
        "Mecânica/ficha técnica mudou (estatísticas, efeitos, custos ou níveis). Personagens/itens que leem a definição por slug refletem a nova versão nas próximas leituras; instâncias já adquiridas mantêm seu estado mutável intacto.",
      caminhos,
      estadoMutavelPreservado: CAMPOS_MUTAVEIS_NUNCA_TOCADOS,
    };
  }

  return {
    categoria: "impacto_nao_determinado",
    motivo: "Mudanças fora dos caminhos reconhecidos automaticamente — revise manualmente o alcance antes de publicar.",
    caminhos,
    estadoMutavelPreservado: CAMPOS_MUTAVEIS_NUNCA_TOCADOS,
  };
}
