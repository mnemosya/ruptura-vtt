"use server";

/**
 * Resolvedor genérico e reutilizável da árvore de "teste ou resistência"
 * (Etapa 7 do Editor Universal) — não é exclusivo de nenhuma magia,
 * talento ou item. Segue o mesmo padrão de pureza de
 * `conditionEffectExecutor.ts` (Etapa 4): valida TUDO antes de mutar
 * qualquer coisa, nunca persiste sozinho (quem chama decide persistência
 * e confirmação), e nunca deixa estado parcial — se uma validação falha
 * no meio, nada do que já foi preparado é aplicado.
 *
 * Ruptura continua em teatro da mente: este módulo NUNCA resolve
 * distância/linha de visão/adjacência, e nunca decide sozinho qual foi
 * o resultado do teste — quem chama (a mesa) informa `faixaInformada`
 * depois de rolar/decidir manualmente. A única automação real aqui é:
 * (a) identificar o ramo certo da árvore a partir do resultado informado;
 * (b) aplicar de verdade os efeitos filhos que já têm executor genérico
 *     (hoje: `aplicar_condicao`, via `executarAplicarCondicao`);
 * (c) preparar (sem mutar) uma descrição legível dos demais efeitos
 *     filhos (dano/cura/remover_condicao/modificar_margem/alterar_dano_
 *     recebido), no mesmo padrão que magias/itens já usam hoje
 *     (`spells.ts`/`itemUse.ts`: rola/descreve, aplicação final é manual).
 *
 * Passos (sempre nesta ordem):
 *   1. valida a árvore (tem ao menos um resultado configurado);
 *   2. valida ator, quando `quemTesta` exige um;
 *   3. valida alvo, quando `quemTesta` exige um;
 *   4. identifica o ramo pela faixa informada pela mesa (ou "manual");
 *   5. prepara TODOS os efeitos filhos do ramo — se algum efeito com
 *      executor real (aplicar_condicao) falhar a própria validação,
 *      aborta a preparação inteira antes de aplicar qualquer coisa;
 *   6. devolve preview (o que seria aplicado) + o personagem já mutado
 *      EM MEMÓRIA (nunca persistido por esta função) + log.
 */

import { executarAplicarCondicao, type AutoriaCondicao } from "./conditionEffectExecutor";
import type { Character } from "./types";
import type { EfeitoEditavel, EfeitoFilho, FaixaResultadoTeste, ResultadoTeste } from "../contentSchema/effectDraftTypes";

export interface PrepararResolucaoArvoreInput {
  arvore: Extract<EfeitoEditavel, { tipo: "teste_resistencia" }>;
  ator: Character | null;
  alvo: Character | null;
  faixaInformada: FaixaResultadoTeste;
  nowIso: string;
  autoria?: AutoriaCondicao;
}

export interface EfeitoFilhoPreparado {
  tipo: EfeitoFilho["tipo"];
  rotulo: string;
  acao: "aplicado" | "pendente_manual";
  descricao: string;
}

export interface PrepararResolucaoArvoreResultado {
  ok: boolean;
  motivo?: string;
  faixaResolvida?: FaixaResultadoTeste;
  efeitosPreparados?: EfeitoFilhoPreparado[];
  /** Personagem-alvo já com os efeitos de executor real aplicados EM MEMÓRIA — quem chama decide se/quando persistir. */
  alvoAtualizado?: Character;
  logTexto?: string;
}

const EXIGE_ATOR: ReadonlySet<string> = new Set(["usuario", "atacante", "portador"]);
const EXIGE_ALVO: ReadonlySet<string> = new Set(["alvo", "defensor"]);

function encontrarResultado(resultados: ResultadoTeste[], faixa: FaixaResultadoTeste): ResultadoTeste | undefined {
  return resultados.find((r) => r.faixa === faixa) ?? resultados.find((r) => r.faixa === "manual");
}

function descreverEfeitoFilho(efeito: EfeitoFilho): string {
  switch (efeito.tipo) {
    case "aplicar_condicao":
      // Nunca chega aqui em runtime — o loop principal trata "aplicar_condicao"
      // separadamente (executor real, `executarAplicarCondicao`). Caso exista
      // por segurança de tipos: mesma descrição textual dos demais.
      return `Aplicar condição ${efeito.campos.condicaoSlug || "(sem condição)"}.`;
    case "dano": {
      const c = efeito.campos;
      const formula = c.tipoFormula === "fixo" ? String(c.valorFixo ?? 0) : `${c.quantidadeDados ?? 0}d${c.faces ?? 0}${c.modificador ? (c.modificador >= 0 ? `+${c.modificador}` : c.modificador) : ""}`;
      return `Dano ${formula} (${c.tipoDano || "tipo não definido"}${c.subtipoDano ? `/${c.subtipoDano}` : ""})${c.metadeEmSucesso ? " — metade em sucesso" : ""} — rolar e aplicar manualmente.`;
    }
    case "cura": {
      const c = efeito.campos;
      const formula = c.tipoFormula === "fixo" ? String(c.valorFixo ?? 0) : `${c.quantidadeDados ?? 0}d${c.faces ?? 0}`;
      return `Cura ${formula} de ${c.recurso.toUpperCase()} — aplicar via fluxo de cura existente.`;
    }
    case "remover_condicao":
      return `Remover condição ${efeito.campos.condicaoSlug ?? (efeito.campos.removerTodas ? "(todas)" : "(seleção manual)")} — aplicar via ferramentas existentes.`;
    case "modificar_teste":
      return `Modificar teste: ${efeito.campos.modo}${efeito.campos.valor != null ? ` ${efeito.campos.valor}` : ""} — aplicar manualmente no próximo teste relevante.`;
    case "alterar_recurso":
      return `Alterar recurso ${efeito.campos.recurso}: ${efeito.campos.operacao} ${efeito.campos.valorFixo ?? "?"} — aplicar manualmente.`;
    case "modificar_margem":
      return `Modificar margem (${efeito.campos.operacao}, ${efeito.campos.pericias.join(", ") || "sem perícia"}) — a pessoa jogadora confirma o contexto antes de aplicar na rolagem.`;
    case "alterar_dano_recebido":
      return `Alterar dano recebido: ${efeito.campos.operacao} ${efeito.campos.valorFixo ?? efeito.campos.multiplicador ?? "?"} (${efeito.campos.momento}) — sem executor automático ainda, aplicar manualmente.`;
    case "efeito_temporario": {
      const d = efeito.campos.duracao;
      const duracaoTexto = d.tipo === "rounds" ? `${d.rodadas ?? 1} rodada(s)` : d.tipo === "scene" ? "cena" : d.tipo === "rest" ? "descanso longo" : "manual";
      return `Aplicar efeito temporário (${efeito.campos.modificadores.length} modificador(es), ${duracaoTexto}) — criar via fluxo existente de efeito temporário (buff_temporario).`;
    }
    case "acao_reacao_adicional":
      return `Conceder ${efeito.campos.tipo} adicional (× ${efeito.campos.quantidade}) — sem executor automático ainda, aplicar manualmente.`;
  }
}

export async function prepararResolucaoArvoreTesteResistencia(input: PrepararResolucaoArvoreInput): Promise<PrepararResolucaoArvoreResultado> {
  const { arvore, ator, alvo, faixaInformada, nowIso, autoria } = input;

  // 1. valida a árvore.
  if (!arvore.campos.resultados || arvore.campos.resultados.length === 0) {
    return { ok: false, motivo: "Árvore sem nenhum resultado configurado — nada a resolver." };
  }

  // 2/3. valida ator/alvo conforme quem testa.
  const quemTesta = arvore.campos.quemTesta;
  if (quemTesta && EXIGE_ATOR.has(quemTesta) && !ator) {
    return { ok: false, motivo: `Falta o ator (quem testa é "${quemTesta}").` };
  }
  if (quemTesta && EXIGE_ALVO.has(quemTesta) && !alvo) {
    return { ok: false, motivo: `Falta o alvo (quem testa é "${quemTesta}").` };
  }

  // 4. identifica o ramo pela faixa informada pela mesa (nunca resolvido sozinho).
  const resultado = encontrarResultado(arvore.campos.resultados, faixaInformada);
  if (!resultado) {
    return { ok: false, motivo: `Nenhum resultado configurado para a faixa "${faixaInformada}" (nem um resultado "manual" de reserva).` };
  }

  // 5. prepara TODOS os efeitos filhos — aborta tudo se algum executor real falhar.
  const efeitosPreparados: EfeitoFilhoPreparado[] = [];
  let alvoAtualizado = alvo ?? undefined;
  const logs: string[] = [];

  for (const filho of resultado.efeitos) {
    if (!filho.habilitado) continue;
    if (filho.tipo === "aplicar_condicao") {
      if (!alvoAtualizado) {
        return { ok: false, motivo: `Efeito "aplicar_condicao" no resultado "${resultado.faixa}" precisa de um alvo, mas nenhum foi informado.` };
      }
      const resultadoCondicao = await executarAplicarCondicao(alvoAtualizado, filho.campos.condicaoSlug, nowIso, undefined, autoria);
      if (!resultadoCondicao.ok) {
        // Nunca aplica parcialmente — aborta a preparação inteira antes de devolver qualquer coisa.
        return { ok: false, motivo: `Efeito "aplicar_condicao" (${filho.campos.condicaoSlug}) falhou: ${resultadoCondicao.motivo}` };
      }
      alvoAtualizado = resultadoCondicao.character;
      efeitosPreparados.push({ tipo: "aplicar_condicao", rotulo: filho.nomeOpcional || "Aplicar condição", acao: "aplicado", descricao: resultadoCondicao.logTexto ?? "" });
      if (resultadoCondicao.logTexto) logs.push(resultadoCondicao.logTexto);
      continue;
    }
    efeitosPreparados.push({ tipo: filho.tipo, rotulo: filho.nomeOpcional || filho.tipo, acao: "pendente_manual", descricao: descreverEfeitoFilho(filho) });
  }

  // 6. preview + personagem em memória (nunca persistido aqui) + log.
  const logTexto = `Teste/resistência resolvido — ramo "${resultado.faixa}"${resultado.textoResultado ? ` (${resultado.textoResultado})` : ""}.${logs.length > 0 ? ` ${logs.join(" ")}` : ""}`;
  return { ok: true, faixaResolvida: resultado.faixa, efeitosPreparados, alvoAtualizado, logTexto };
}
