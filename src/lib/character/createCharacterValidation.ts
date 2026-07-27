/**
 * Validação server-side do orçamento de criação (checkpoint pós-v0.94,
 * rodada de consolidação — achado do Cenário 3 "payload hostil").
 *
 * Antes de jogadores poderem criar o próprio personagem (fase 2), só o
 * narrador — já plenamente confiável no modelo de ameaça deste app —
 * chamava `createCharacterForCampaign`/`insertCharacterScoped`, que
 * nunca validou o CONTEÚDO do payload (só a RLS decide QUEM pode
 * inserir). Com criação autônoma, um jogador autenticado pode chamar a
 * Server Action diretamente (fora do wizard) com atributos/perícias
 * fora do orçamento — por isso esta validação passou a ser necessária
 * e é aplicada só no caminho de criação do PRÓPRIO jogador
 * (`createCharacterFromWizard`), nunca no caminho já aceito do
 * narrador (`createCharacterForCampaign` continua sem essa checagem,
 * de propósito — o narrador já pode ajustar valores livremente).
 *
 * Vertentes ("3 pontos entre as 6 vertentes", PRD 3.2 Etapa 4) não têm
 * contrato em `regras.criacao_personagem` ainda — o mesmo número usado
 * no wizard (`PONTOS_VERTENTE_CRIACAO`) é reaplicado aqui.
 */

import type { Character, CharacterAttributes, CharacterRulesPayload } from "./types";

export const PONTOS_VERTENTE_CRIACAO = 3;

export interface CreationBudgetValidation {
  ok: boolean;
  reason?: string;
}

export function validateCreationBudget(
  character: Pick<Character, "atributos" | "pericias" | "niveis_vertente">,
  regras: CharacterRulesPayload,
): CreationBudgetValidation {
  const criacao = regras.criacao_personagem;
  const valorInicialAtributo = criacao?.atributos?.valor_inicial ?? 1;
  const pontosAtributoAdicionais = criacao?.atributos?.pontos_adicionais ?? 3;
  const atributoTeto = criacao?.atributos?.maximo_na_criacao ?? 3;

  for (const def of regras.atributos) {
    const valor = character.atributos[def.id as keyof CharacterAttributes];
    if (typeof valor !== "number" || !Number.isFinite(valor)) {
      return { ok: false, reason: `Atributo "${def.id}" ausente ou inválido.` };
    }
    if (valor < valorInicialAtributo || valor > atributoTeto || valor > def.valor_maximo || valor < def.valor_minimo) {
      return { ok: false, reason: `Atributo "${def.nome}" fora do intervalo permitido na criação (${valorInicialAtributo}–${atributoTeto}).` };
    }
  }
  const pontosAtributoGastos = regras.atributos.reduce(
    (soma, def) => soma + ((character.atributos[def.id as keyof CharacterAttributes] ?? valorInicialAtributo) - valorInicialAtributo),
    0,
  );
  if (pontosAtributoGastos !== pontosAtributoAdicionais) {
    return { ok: false, reason: `Pontos de atributo devem somar exatamente ${pontosAtributoAdicionais} (recebido: ${pontosAtributoGastos}).` };
  }

  const periciaPontosTotais = criacao?.pericias?.pontos_totais ?? 25;
  const periciaTeto = criacao?.pericias?.maximo_na_criacao ?? 3;
  let pontosPericiaGastos = 0;
  for (const def of regras.pericias) {
    const valor = character.pericias[def.id] ?? 0;
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
      return { ok: false, reason: `Perícia "${def.nome}" com valor inválido.` };
    }
    if (valor > periciaTeto || valor > def.valor_maximo) {
      return { ok: false, reason: `Perícia "${def.nome}" acima do teto de criação (${periciaTeto}).` };
    }
    pontosPericiaGastos += valor;
  }
  // Também rejeita valores em `character.pericias` que não correspondem a
  // nenhuma perícia publicada (chave forjada) — nunca confia em chave livre.
  for (const key of Object.keys(character.pericias ?? {})) {
    if (!regras.pericias.some((def) => def.id === key)) {
      return { ok: false, reason: `Perícia desconhecida no payload: "${key}".` };
    }
  }
  if (pontosPericiaGastos > periciaPontosTotais) {
    return { ok: false, reason: `Pontos de perícia (${pontosPericiaGastos}) acima do orçamento de criação (${periciaPontosTotais}).` };
  }

  const niveisVertente = character.niveis_vertente ?? {};
  const pontosVertenteGastos = Object.values(niveisVertente).reduce((soma, v) => soma + (typeof v === "number" ? v : 0), 0);
  if (Object.values(niveisVertente).some((v) => typeof v !== "number" || v < 0)) {
    return { ok: false, reason: "Nível de vertente inválido no payload." };
  }
  if (pontosVertenteGastos > PONTOS_VERTENTE_CRIACAO) {
    return { ok: false, reason: `Pontos de vertente (${pontosVertenteGastos}) acima do orçamento de criação (${PONTOS_VERTENTE_CRIACAO}).` };
  }

  return { ok: true };
}
