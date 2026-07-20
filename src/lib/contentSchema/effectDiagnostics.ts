/**
 * Diagnóstico dinâmico de automação por efeito editável (Etapa 4).
 *
 * A pessoa administradora NUNCA escolhe o modo de automação — este
 * módulo deriva a partir de (a) o teto estático do catálogo da Etapa 1
 * (`effectTypeRegistry.ts` — "o executor sequer existe para este
 * tipo?") e (b) o quão completa/executável está a configuração
 * preenchida agora. O resultado nunca ultrapassa o teto do catálogo —
 * só pode ficar igual ou mais conservador.
 */

import { getEfeitoTipoDefinition } from "./effectTypeRegistry";
import { MAX_MODIFICADORES_EFEITO_TEMPORARIO, type EfeitoEditavel } from "./effectDraftTypes";
import type { ModoAutomacao } from "./types";

export interface DiagnosticoEfeitoEditavel {
  modoAutomacao: ModoAutomacao;
  executor?: string;
  motivo: string;
}

function formulaPreenchida(tipoFormula: string, quantidadeDados?: number, faces?: number, valorFixo?: number): boolean {
  if (tipoFormula === "fixo") return valorFixo != null;
  return (quantidadeDados ?? 0) > 0 && (faces ?? 0) > 0;
}

const RANK: Record<ModoAutomacao, number> = { automatico: 4, assistido: 3, lembrete: 2, narrativo_rastreado: 1, sem_executor: 0 };

/** Nunca deixa o resultado passar do teto do catálogo (Etapa 1) para aquele `tipo`. */
function limitarAoTeto(modo: ModoAutomacao, teto: ModoAutomacao): ModoAutomacao {
  return RANK[modo] <= RANK[teto] ? modo : teto;
}

/** Pior caso entre dois modos — usado para agregar a árvore de teste/resistência (Etapa 7): nunca fica melhor que o ramo menos automatizado. */
function pior(a: ModoAutomacao, b: ModoAutomacao): ModoAutomacao {
  return RANK[a] <= RANK[b] ? a : b;
}

export function diagnosticarEfeitoEditavel(efeito: EfeitoEditavel): DiagnosticoEfeitoEditavel {
  const definicaoCatalogo = getEfeitoTipoDefinition(efeito.tipo);
  const teto = definicaoCatalogo.executor.modo;

  if (!efeito.habilitado) {
    return { modoAutomacao: "lembrete", motivo: "Efeito desabilitado no rascunho — não será considerado quando (se) publicado." };
  }
  if (!efeito.gatilho) {
    return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Sem gatilho definido — configuração incompleta." };
  }

  switch (efeito.tipo) {
    case "dano": {
      const { tipoFormula, quantidadeDados, faces, valorFixo, tipoDano } = efeito.campos;
      if (!formulaPreenchida(tipoFormula, quantidadeDados, faces, valorFixo) || !tipoDano) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Fórmula ou tipo de dano incompletos." };
      }
      return {
        modoAutomacao: limitarAoTeto("assistido", teto),
        executor: "src/lib/character/spells.ts, itemUse.ts, endRoundConditions.ts",
        motivo: "Rola a fórmula; aplicação ao alvo em magia/item ainda depende de confirmação manual (dano em condição de fim de rodada já aplica sozinho).",
      };
    }
    case "cura": {
      const { tipoFormula, quantidadeDados, faces, valorFixo, recurso } = efeito.campos;
      if (!formulaPreenchida(tipoFormula, quantidadeDados, faces, valorFixo) || !recurso) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Fórmula ou recurso incompletos." };
      }
      if (!efeito.alvo) {
        return { modoAutomacao: limitarAoTeto("assistido", teto), motivo: "Falta alvo definido — requer seleção antes de aplicar." };
      }
      return { modoAutomacao: limitarAoTeto("automatico", teto), executor: "src/lib/character/itemUse.ts (applyGmHealing)", motivo: "Fórmula, recurso e alvo definidos — executor real já aplica e limita ao máximo." };
    }
    case "aplicar_condicao": {
      const { condicaoSlug, confirmacaoManual } = efeito.campos;
      if (!condicaoSlug) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Sem condição referenciada da Biblioteca." };
      }
      if (confirmacaoManual || !efeito.alvo || efeito.alvo === "selecionado_manualmente") {
        return {
          modoAutomacao: limitarAoTeto("assistido", teto),
          executor: "src/lib/character/conditionEffectExecutor.ts (executarAplicarCondicao)",
          motivo: "Executor genérico existe, mas exige seleção/confirmação manual de alvo (ou foi marcado como exigindo confirmação).",
        };
      }
      return {
        modoAutomacao: limitarAoTeto("automatico", teto),
        executor: "src/lib/character/conditionEffectExecutor.ts (executarAplicarCondicao)",
        motivo: "Condição referenciada e alvo resolvido — executor genérico valida e aplica.",
      };
    }
    case "remover_condicao": {
      const { condicaoSlug, removerTodas, selecaoManual } = efeito.campos;
      if (!condicaoSlug && !removerTodas && !selecaoManual) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Nenhuma condição, seleção manual ou remoção total configurada." };
      }
      if (selecaoManual) {
        return { modoAutomacao: limitarAoTeto("assistido", teto), motivo: "Seleção manual da condição a remover no momento da resolução." };
      }
      return { modoAutomacao: limitarAoTeto("automatico", teto), executor: "src/lib/character/itemUse.ts, actionConsole.ts", motivo: "Remove automaticamente quando a condição está ativa no alvo." };
    }
    case "modificar_teste": {
      const { modo, valor, tags, pericia, acao, confirmacaoDeContexto } = efeito.campos;
      const exigeValor = modo === "bonus" || modo === "penalidade";
      if (exigeValor && valor == null) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: `Modo "${modo}" exige um valor numérico.` };
      }
      if (tags.length === 0 && !pericia && !acao) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Sem tags/perícia/ação alvo — não há como o motor saber onde aplicar." };
      }
      if (confirmacaoDeContexto) {
        return { modoAutomacao: limitarAoTeto("assistido", teto), motivo: "Marcado como dependente de confirmação de contexto." };
      }
      return {
        modoAutomacao: limitarAoTeto("automatico", teto),
        executor: "src/lib/character/activeEffects.ts, talents.ts, technicalEffects.ts",
        motivo: "Modificador simples com alvo de teste definido — mesmo padrão já automatizado hoje.",
      };
    }
    case "alterar_recurso": {
      const { recurso, operacao, valorFixo, formula } = efeito.campos;
      if (valorFixo == null && !formula) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Sem valor fixo nem fórmula definidos." };
      }
      if (recurso === "pa" && efeito.gatilho === "ao_encerrar_rodada" && operacao === "reduzir") {
        return { modoAutomacao: limitarAoTeto("automatico", teto), executor: "src/lib/character/endRoundConditions.ts (reduzir_pa)", motivo: "Único caso hoje com executor automático real (redução de PA em fim de rodada)." };
      }
      return {
        modoAutomacao: limitarAoTeto("assistido", teto),
        motivo: `Recurso "${recurso}" reconhecido, mas ainda sem executor automático genérico fora do caso de PA em fim de rodada — depende de ação manual do narrador ou de outro fluxo específico.`,
      };
    }
    case "modificar_margem": {
      const { pericias, contexto, faixaOrigem, faixaDestino, operacao } = efeito.campos;
      if (pericias.length === 0 || (operacao !== "definir" && (!faixaOrigem || !faixaDestino))) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Faltam perícias afetadas ou faixas de origem/destino." };
      }
      return {
        modoAutomacao: limitarAoTeto("assistido", teto),
        executor: "src/lib/character/talentEngine.ts (getMarginPromotions)",
        motivo: `Reconhecido para "${contexto}" — a pessoa jogadora ainda confirma que o contexto da rolagem bate antes de aplicar (nunca automático).`,
      };
    }
    case "alterar_dano_recebido": {
      const { operacao } = efeito.campos;
      if (operacao === "reduzir" && efeito.campos.valorFixo == null) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Operação \"reduzir\" exige um valor fixo." };
      }
      if (operacao === "multiplicar" && efeito.campos.multiplicador == null) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Operação \"multiplicar\" exige um multiplicador." };
      }
      return { modoAutomacao: limitarAoTeto("lembrete", teto), motivo: "Nenhum executor real aplica alteração de dano recebido automaticamente ainda — sempre lembrete para o narrador aplicar manualmente." };
    }
    case "teste_resistencia": {
      const { pericia, cd, resultados, quemTesta } = efeito.campos;
      if (!pericia && !efeito.campos.atributo) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Sem perícia/atributo — não há quem testa contra o quê." };
      }
      if (!cd) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Sem CD definida (fixa ou derivada)." };
      }
      if (resultados.length === 0) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Sem nenhum resultado configurado — árvore vazia." };
      }
      // Agrega o pior caso entre TODOS os efeitos filhos de TODOS os resultados —
      // a árvore nunca é classificada acima do seu ramo menos automatizado.
      let piorFilho: ModoAutomacao = "automatico";
      for (const r of resultados) {
        if (r.faixa === "manual") piorFilho = pior(piorFilho, "assistido");
        for (const filho of r.efeitos) {
          piorFilho = pior(piorFilho, diagnosticarEfeitoEditavel(filho).modoAutomacao);
        }
      }
      const baseAssistida = quemTesta === "selecionado_manualmente" || efeito.campos.confirmacaoManual;
      const modoFinal = pior(baseAssistida ? "assistido" : "automatico", piorFilho);
      return {
        modoAutomacao: limitarAoTeto(modoFinal, teto),
        executor: "src/lib/character/testResistanceTreeExecutor.ts",
        motivo: `Modo agregado da árvore (pior caso entre ${resultados.length} resultado(s) e seus efeitos filhos) — nunca acima do ramo menos automatizado.`,
      };
    }
    case "efeito_temporario": {
      const { duracao, modificadores, acumulavel, maximoPilhas, pilhasIniciais } = efeito.campos;
      if (!duracao || (duracao.tipo === "rounds" && !(duracao.rodadas! > 0))) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Duração ausente ou inválida (rodadas deve ser > 0 quando tipo = rounds)." };
      }
      if (modificadores.length === 0 && !efeito.textoLembrete) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Efeito temporário sem conteúdo — precisa de ao menos um modificador ou um texto de lembrete." };
      }
      if (modificadores.length > MAX_MODIFICADORES_EFEITO_TEMPORARIO) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: `Efeito temporário com mais de ${MAX_MODIFICADORES_EFEITO_TEMPORARIO} modificadores — acima do limite documentado.` };
      }
      if (acumulavel && maximoPilhas != null && pilhasIniciais != null && pilhasIniciais > maximoPilhas) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Pilhas iniciais não podem superar o máximo de pilhas." };
      }
      if (!acumulavel && maximoPilhas != null && maximoPilhas > 1) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Efeito não acumulável não pode ter máximo de pilhas maior que 1." };
      }
      const piorModificador = modificadores.reduce<ModoAutomacao>(
        (acc, m) => pior(acc, diagnosticarEfeitoEditavel(m).modoAutomacao),
        "automatico",
      );
      const modoFinal = pior("assistido", piorModificador);
      return {
        modoAutomacao: limitarAoTeto(modoFinal, teto),
        executor: "src/lib/character/temporaryEffects.ts",
        motivo: "Criação sempre exige uma ação (usar item/lançar magia/ativar talento) — nunca automático puro; expiração e modificadores de rolagem já aplicam sozinhos depois de criado, quando o executor real reconhece o payload (item).",
      };
    }
    case "acao_reacao_adicional": {
      const { quantidade, tipo: tipoConcedido, limite } = efeito.campos;
      if (!(quantidade > 0)) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Quantidade concedida precisa ser maior que zero." };
      }
      if (limite != null && limite <= 0) {
        return { modoAutomacao: limitarAoTeto("sem_executor", teto), motivo: "Limite de ações encadeadas, quando definido, precisa ser maior que zero (evita loop)." };
      }
      return {
        modoAutomacao: limitarAoTeto("lembrete", teto),
        motivo: `Concede ${tipoConcedido} adicional — nenhum executor real aplica isso automaticamente ainda, sempre lembrete para o narrador.`,
      };
    }
  }
}
