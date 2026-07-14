/**
 * Validação dos efeitos editáveis de um rascunho (Etapa 4). Complementa
 * `validarCamposMagia/Item/Talento` (Etapa 3) — chamada de dentro delas
 * para os 6 tipos do MVP. Efeitos preservados/somente-leitura (Etapa 1)
 * continuam validados por `validarConteudo`, sem mudança.
 */

import { getContentDocument } from "../content/queries";
import { diagnosticarEfeitoEditavel } from "./effectDiagnostics";
import { RECURSOS_ALTERAR, isTipoEfeitoMvp, type EfeitoEditavel } from "./effectDraftTypes";
import type { ResultadoValidacao } from "./types";

const RECURSOS_CURA_VALIDOS = new Set(["pv", "pe", "mana", "integridade", "pd"]);
const RECURSOS_ALTERAR_VALIDOS = new Set<string>(RECURSOS_ALTERAR);

function formulaValida(tipoFormula: string, quantidadeDados: number | undefined, faces: number | undefined, valorFixo: number | undefined): string | null {
  if (tipoFormula === "fixo") {
    if (valorFixo == null) return "Valor fixo ausente.";
    if (valorFixo < 0) return "Valor fixo não pode ser negativo.";
    return null;
  }
  if (quantidadeDados == null || quantidadeDados <= 0) return "Quantidade de dados precisa ser positiva.";
  if (faces == null || faces <= 0) return "Faces do dado precisam ser positivas.";
  return null;
}

export async function validarEfeitosEditaveis(efeitos: EfeitoEditavel[]): Promise<ResultadoValidacao> {
  const erros: string[] = [];
  const avisos: string[] = [];
  const infos: string[] = [];

  const ordensVistas = new Set<number>();
  const idsVistos = new Set<string>();

  for (const [indice, efeito] of efeitos.entries()) {
    const rotulo = `Efeito #${indice + 1} (${efeito.tipo}${efeito.nomeOpcional ? `, "${efeito.nomeOpcional}"` : ""})`;

    if (!isTipoEfeitoMvp(efeito.tipo)) {
      erros.push(`${rotulo}: tipo de efeito inválido para o Construtor de Efeitos (só os 6 tipos do MVP são suportados).`);
      continue;
    }
    if (idsVistos.has(efeito.id)) erros.push(`${rotulo}: ID de efeito duplicado ("${efeito.id}") — reordenar/duplicar não deveria repetir IDs.`);
    idsVistos.add(efeito.id);

    if (ordensVistas.has(efeito.ordem)) erros.push(`${rotulo}: ordem duplicada (${efeito.ordem}).`);
    if (efeito.ordem < 0 || !Number.isInteger(efeito.ordem)) erros.push(`${rotulo}: ordem inválida (${efeito.ordem}).`);
    ordensVistas.add(efeito.ordem);

    if (!efeito.gatilho) erros.push(`${rotulo}: gatilho obrigatório ausente.`);
    if (!efeito.alvo) erros.push(`${rotulo}: alvo obrigatório ausente.`);

    switch (efeito.tipo) {
      case "dano": {
        const c = efeito.campos;
        const erroFormula = formulaValida(c.tipoFormula, c.quantidadeDados, c.faces, c.valorFixo);
        if (erroFormula) erros.push(`${rotulo}: ${erroFormula}`);
        if (!c.tipoDano) erros.push(`${rotulo}: tipo de dano obrigatório.`);
        if (c.ignoraMit && c.ignoraPd) avisos.push(`${rotulo}: ignora MIT e PD ao mesmo tempo — confirme se é intencional.`);
        break;
      }
      case "cura": {
        const c = efeito.campos;
        const erroFormula = formulaValida(c.tipoFormula, c.quantidadeDados, c.faces, c.valorFixo);
        if (erroFormula) erros.push(`${rotulo}: ${erroFormula}`);
        if (!RECURSOS_CURA_VALIDOS.has(c.recurso)) erros.push(`${rotulo}: recurso de cura inválido ("${c.recurso}").`);
        break;
      }
      case "aplicar_condicao": {
        const c = efeito.campos;
        if (!c.condicaoSlug) {
          erros.push(`${rotulo}: referência de condição obrigatória.`);
        } else {
          const condicao = await getContentDocument("condition", c.condicaoSlug).catch(() => null);
          if (!condicao) erros.push(`${rotulo}: condição "${c.condicaoSlug}" não encontrada/publicada na Biblioteca.`);
        }
        if (c.maximoDePilhas != null && c.maximoDePilhas < 1) erros.push(`${rotulo}: máximo de pilhas precisa ser ao menos 1.`);
        break;
      }
      case "remover_condicao": {
        const c = efeito.campos;
        if (!c.condicaoSlug && !c.removerTodas && c.condicoesPossiveis.length === 0 && !c.selecaoManual) {
          erros.push(`${rotulo}: bloquear sem condição compatível é o comportamento padrão — configure uma condição, lista, seleção manual ou "remover todas".`);
        }
        if (c.condicaoSlug) {
          const condicao = await getContentDocument("condition", c.condicaoSlug).catch(() => null);
          if (!condicao) erros.push(`${rotulo}: condição "${c.condicaoSlug}" não encontrada/publicada na Biblioteca.`);
        }
        for (const slug of c.condicoesPossiveis) {
          const condicao = await getContentDocument("condition", slug).catch(() => null);
          if (!condicao) erros.push(`${rotulo}: condição possível "${slug}" não encontrada/publicada na Biblioteca.`);
        }
        break;
      }
      case "modificar_teste": {
        const c = efeito.campos;
        const exigeValor = c.modo === "bonus" || c.modo === "penalidade";
        if (exigeValor && c.valor == null) erros.push(`${rotulo}: modo "${c.modo}" exige um valor numérico.`);
        if (!exigeValor && c.valor != null) avisos.push(`${rotulo}: modo "${c.modo}" não usa valor numérico — será ignorado.`);
        if (c.tags.length === 0 && !c.pericia && !c.acao) erros.push(`${rotulo}: defina ao menos uma tag, perícia ou ação alvo.`);
        break;
      }
      case "alterar_recurso": {
        const c = efeito.campos;
        if (!RECURSOS_ALTERAR_VALIDOS.has(c.recurso)) erros.push(`${rotulo}: recurso inválido ("${c.recurso}").`);
        if (c.valorFixo == null && !c.formula) erros.push(`${rotulo}: informe valor fixo ou fórmula.`);
        if (c.valorFixo != null && c.valorFixo < 0 && c.operacao !== "definir") avisos.push(`${rotulo}: valor negativo com operação "${c.operacao}" — confirme se é intencional.`);
        if (c.minimo != null && c.maximo != null && c.minimo > c.maximo) erros.push(`${rotulo}: mínimo maior que máximo.`);
        break;
      }
    }

    // Guarda-corrente: modoAutomacao é sempre recalculado na exibição — aqui só confirmamos
    // que a configuração atual não afirma mais automação do que o diagnóstico permite.
    const diagnostico = diagnosticarEfeitoEditavel(efeito);
    if (diagnostico.modoAutomacao === "sem_executor") avisos.push(`${rotulo}: configuração ainda incompleta para qualquer automação (${diagnostico.motivo}).`);
    else if (diagnostico.modoAutomacao === "lembrete" && efeito.habilitado) avisos.push(`${rotulo}: ${diagnostico.motivo}`);
  }

  return { valido: erros.length === 0, erros, avisos, infos };
}
