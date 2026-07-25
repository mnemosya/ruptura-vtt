# Checkpoint — Correção: validação de rascunho bloqueava todo tipo de efeito além dos 6 do MVP

## Status

**Correção concluída e validada.** Bug crítico encontrado durante a rodada de aceite de browser das Etapas 4–10 — `validarEfeitosEditaveis` (`effectDraftValidation.ts`) ainda usava `isTipoEfeitoMvp` (só os 6 tipos originais da Etapa 4) como porta de entrada, em vez de `isTipoEfeitoEditavel` (os 22 tipos reais do catálogo, incluindo os 3 da Etapa 7, os 2 da Etapa 8, os 5 da Etapa 9 e os 6 da Etapa 10). Resultado: **desde que o primeiro tipo pós-MVP foi introduzido (Etapa 7), "Salvar rascunho" rejeitava incondicionalmente qualquer rascunho contendo `teste_resistencia`, `modificar_margem`, `alterar_dano_recebido`, `efeito_temporario`, `acao_reacao_adicional`, `modificar_instancia`, `conceder_item`, `consumir_item`, `alterar_preco`, `alterar_disponibilidade`, `companheiro`, `modificar_companheiro`, `acao_companheiro`, `programar_gatilho`, `parear` ou `acao_trama`** — mesmo que a UI permitisse escolhê-los, preenchê-los e mesmo que a serialização de publicação já os suportasse corretamente. Nenhum harness puro das Etapas 7–10 detectou isso porque todos testam `publishSerialization.ts`/`effectLegacySerialization.ts` diretamente, nunca o caminho real de salvamento de rascunho (`atualizarRascunho` → `validarCamposX` → `validarEfeitosEditaveis`).

Não reabre as Etapas 11 ou 12.

## Causa

`src/lib/contentSchema/effectDraftTypes.ts` já definia corretamente as duas listas desde a Etapa 10:
- `TIPOS_EFEITO_MVP`/`isTipoEfeitoMvp` — só os 6 tipos originais, com o comentário explícito: *"Para 'é um tipo que o Construtor sabe criar/serializar', use `TIPOS_EFEITO_EDITAVEL`."*
- `TIPOS_EFEITO_EDITAVEL`/`isTipoEfeitoEditavel` — todos os 22 tipos reais.

`effectDraftValidation.ts::validarEfeitosEditaveis` (Etapa 4, nunca atualizado nas Etapas 7–10) continuava chamando `isTipoEfeitoMvp` na porta de entrada:

```ts
if (!isTipoEfeitoMvp(efeito.tipo)) {
  erros.push(`${rotulo}: tipo de efeito inválido para o Construtor de Efeitos (só os 6 tipos do MVP são suportados).`);
  continue;
}
```

O `switch` logo abaixo só tem `case` para os 6 tipos MVP — sem `default` — então, para qualquer tipo pós-MVP, ele já passava incólume por ali (sem crash, sem checagem extra); o único problema era o gate de entrada.

## Correção

Uma troca de duas linhas — sem adicionar validação de campo nova para os 16 tipos pós-MVP (eles continuam recebendo só as checagens genéricas: id duplicado, ordem, gatilho/alvo obrigatórios, e a consistência do `modoAutomacao` via `diagnosticarEfeitoEditavel`, que já suporta todos os 22 tipos desde a Etapa 10):

```ts
import { RECURSOS_ALTERAR, isTipoEfeitoEditavel, type EfeitoEditavel } from "./effectDraftTypes";
...
if (!isTipoEfeitoEditavel(efeito.tipo)) {
  erros.push(`${rotulo}: tipo de efeito inválido para o Construtor de Efeitos (tipo não reconhecido no catálogo editável).`);
  continue;
}
```

Arquivo alterado: `src/lib/contentSchema/effectDraftValidation.ts`. Nenhum outro arquivo tocado por esta correção específica.

## Reprodução e correção ao vivo

Reproduzido em browser real, Supabase real: um rascunho de talento com 7 efeitos pós-MVP (`efeito_temporario`, `modificar_instancia`, `conceder_item`, `consumir_item`, `alterar_disponibilidade`, `companheiro`, `acao_trama`) foi corretamente preenchido na UI (todos os campos específicos renderizam e aceitam valores, `modoAutomacao` calculado corretamente por tipo), mas "Salvar rascunho" retornou 7 erros idênticos: `"tipo de efeito inválido para o Construtor de Efeitos (só os 6 tipos do MVP são suportados)"`. Aplicada a correção acima (hot-reload do `next dev`); o mesmo rascunho salvou sem erro na tentativa seguinte, e publicou com sucesso (`1.0.0`) com os 7 efeitos serializados corretamente (chaves reais confirmadas por leitura direta do payload publicado no Supabase — `pericias`/`acao`+`valor`/`identifica`+`max_unidades`/`acao`+`distancia_espacos`, exatamente como a correção da Etapa 10 §5 já documentava para a serialização).

## Impacto

Bloqueava, desde a Etapa 7, o salvamento de rascunho de QUALQUER conteúdo (spell/item/rune/talent) que usasse qualquer um dos 16 tipos de efeito pós-MVP — nas Etapas 7, 8, 9 e 10, o aceite de browser nunca tinha sido executado (bloqueio de esbuild), então esse defeito nunca havia sido exposto. Ele teria impedido, na prática, qualquer administrador de criar conteúdo real usando `teste_resistencia`, `efeito_temporario`, os 5 tipos de inventário da Etapa 9, ou os 6 tipos de companheiro/Trama da Etapa 10 — apesar de toda a lógica de serialização e schema estar correta.

## Verificação técnica

`npx tsc --noEmit` sem erros; `npm run build` sucesso; harnesses puros preexistentes reexecutados sem alteração de código e sem regressão: `validate-slug-collision.mjs` (46/46), `validate-editorial-drag.mjs` (6/6), `validate-import-export-book.mjs` (19/19). Nenhuma migration criada ou alterada.

## Status por etapa após esta correção

Ver as seções "Aceite de browser" adicionadas a cada checkpoint de Etapa 4–10 para o detalhamento item a item. Resumo:

| Etapa | Efeitos pós-MVP afetados | Confirmado ao vivo após a correção |
|---|---|---|
| 7 | `teste_resistencia` | Sim — spell com 2 resultados + efeito filho `dano`, publicado |
| 8 | `efeito_temporario` | Sim — item com modificador filho `modificar_teste`, publicado |
| 9 | `modificar_instancia`, `conceder_item`, `consumir_item`, `alterar_disponibilidade` | Sim — via talento (ver Etapa 10) |
| 10 | `companheiro`, `acao_trama` (e os 4 da Etapa 9 no mesmo rascunho) | Sim — talento com os 7 tipos publicado com sucesso |
