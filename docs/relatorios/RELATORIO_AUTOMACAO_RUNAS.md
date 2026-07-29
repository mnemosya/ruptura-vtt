# Relatório — Automação de Runas instaladas (checkpoint v0.57)

Auditoria completa de `payload_automacao.efeitos` das 40 runas publicadas
(`content/db_runas_normalizado_v1_2.json`), feita antes de qualquer
implementação, conforme pedido. Cobre as 4 fases do checkpoint: Fase 1
(auditoria/classificação), Fase 2 (implementada), Fase 3 e Fase 4
(bloqueadas — este relatório).

## Fase 1 — Auditoria e classificação por `tipo`

| `tipo` (nº de runas) | Exemplo | Classificação | Motivo |
|---|---|---|---|
| `modificador` (12) | `runa_fogo_estabilidade`: `bonus:1, alvo_tags:["ataque_distancia"]` | **A** (1 runa) / **D** (11 runas) | Só 1 das 12 tem `bonus` numérico + `alvo_tags` sem nenhuma restrição adicional. As outras 11 descrevem um `efeito` **textual** sem número (`torna_ocultavel`, `ataques_sem_ruido`, `alvo_nao_recupera_pv`, `projetil_retorna`, `contorna_obstaculos_*`, `rastreia_alvo`, `penalidade_defesa_alvo` — este último mira o ALVO, não o portador) ou têm `restrito_a` (`runa_escudo_guarda`: bônus só em "Bloquear", contexto que o motor de rolagem atual não distingue). |
| `dano_modificador` (4) | `runa_cac_impeto`: `dado:"1d4"` | **C** | Precisa integrar com o sistema de dano de arma/ataque (`attack.ts`) — 2 delas também têm `usos`/`cadencia` (carga por dia), exigindo rastreamento de uso que não existe. |
| `efeito_com_resistencia` (4) | `runa_cac_clarao`: teste de Esquivar do ALVO, aplica Ofuscado em falha | **C** | Exige alvo estruturado (mapa/token) e resolução de resistência do alvo — sistema que o VTT não modela ainda (mesmo motivo de "resolução automática de resistência" documentado em `spells.ts`). |
| `aplicar_condicao` (5) | `runa_cac_flamejante`: aplica Queimando em crítico | **C** | Aplicar condição num ALVO exige o mesmo sistema de alvo estruturado acima. |
| `recurso` (4) | `runa_armadura_regeneracao`: recupera 1d6 PV abaixo da metade | **C** | Exige monitorar um gatilho de estado (PV abaixo da metade, início de cena) — sistema de evento/gatilho que não existe; alguns também têm `usos`/`cadencia`. |
| `protecao` (4) | `runa_armadura_isolante`: "concede resistência energética enquanto equipada" | **C** | Não é um modificador de ROLAGEM (o que `ActiveEffect` automatiza) — é redução de dano recebido, que exigiria integração com o pipeline de dano (inexistente: MIT/PD por região é pendência documentada desde `inventory.ts` v0.49). |
| `ataque_adicional` (3) | `runa_proj_ricochete`: segundo ataque ao acertar | **C** | Exige resolução de ataque/alvo adicional — sistema novo. |
| `economia_pa` (2) | `runa_cac_finta`: finta sem custo extra; `runa_cac_frenesi`: +2 PA ao eliminar inimigo | **C** | Exige integração com a economia de PA/ações (`actionConsole.ts`) e detecção de gatilhos narrativos ("eliminar inimigo") que o motor não rastreia. |
| `autorreparo` (2) | `runa_armadura_autorreparo`: recupera MIT total no descanso longo | **C** | Depende de um recurso MIT/PD que **não existe** no modelo atual (`rest.ts` só cobre PV/PE/Mana/Integridade). |
| `revelar` (1) | `runa_proj_batedora`: revela inimigos num raio ao atingir | **C** | Exige mapa/alvo. |
| `reacao` (1) | `runa_armadura_rebote`: reflete 50% do dano no primeiro ataque corpo a corpo por cena | **C** | Exige sistema de reação com rastreamento de dano recebido e cadência "por cena" — não existe. |
| `narrativo` (2) | `runa_proj_sombra`: "ataque não rastreável"; `runa_armadura_disfarce`: disfarce narrativo | **D** | Adjudicação do narrador por definição — nunca deveria virar mecânica automática. |

**Total**: 1 runa em Grupo A (implementada na Fase 2, commit `423e92d`), ~35 em
Grupo C (exigem sistema novo), ~4 em Grupo D (ambíguo/narrativo, permanecem
só leitura na Biblioteca).

## Fase 2 — Implementada

Commit `423e92d` (`feat: automate passive rune modifiers`): `runa_fogo_estabilidade`
(`+1 em ataque_distancia`) agora gera `ActiveEffect` quando instalada, pelo
mesmo motor de `activeEffects`/chips já usado por condições/talentos/escalpos.
`runa_escudo_guarda` (tem `restrito_a`) foi deliberadamente **excluída** —
mesmo critério de segurança usado em condições/escalpos: nunca aplicar um
modificador incondicional quando o payload declara uma restrição de contexto
que o motor não consegue verificar.

## Fase 3 — Runas ativáveis simples: BLOQUEADA (Grupo C)

Requisito da tarefa: "só implementar se o payload tiver ativação clara,
custo claro e efeito reversível" e "não implementar se exigir alvo, mapa,
propriedade crítica ou decisão pós-rolagem".

Candidata única examinada: `runa_cac_retratil` —
`{"tipo":"modificador","efeito":"torna_ocultavel","ativacao":"interagir_1pa"}`.
a primeira vista parece elegível (sem alvo, sem mapa, custo de PA nomeado).
Mas:

1. **O "efeito" em si não tem onde existir hoje.** `torna_ocultavel` descreve
   um ESTADO do item (visível ⇄ oculto/retraído) — não existe nenhum campo
   equivalente em `InventoryItemInstance`/`ItemContent` para representar
   "este item está oculto agora". Criar esse campo só para esta runa seria
   inventar um sistema de estado de item, não "reaproveitar o motor atual".
2. **Inconsistência mesmo dentro do mesmo `efeito`.** `runa_escudo_retratil`
   descreve o MESMO `efeito:"torna_ocultavel"` só que **sem** o campo
   `ativacao` — ou seja, nem o próprio payload é consistente sobre se essa
   runa tem custo de ativação ou é passiva. Automatizar uma e não a outra
   seria inventar uma regra para cobrir a lacuna.
3. **Reversibilidade ambígua.** O payload não diz se desativar (voltar a
   visível) tem o mesmo custo de 1 PA ou é de graça — presumir qualquer um
   dos dois seria inventar regra.
4. As outras 2 runas com `ativacao` (`runa_cac_flamejante`, `runa_cac_eletrizante`)
   empacotam a ativação junto com `dano_modificador`/`aplicar_condicao` —
   já classificadas Grupo C acima (exigem sistema de dano/alvo).

**Conclusão**: a única candidata minimamente elegível exige um sistema de
"estado de item" que não existe — isso é exatamente o critério de "exige
sistema novo" da tarefa. Parando aqui, sem implementar, conforme pedido.

## Fase 4 — Propriedades de item: BLOQUEADA (mesma causa-raiz da Fase 3)

Requisito da tarefa: "só implementar se o payload alterar propriedade
textual/estruturada do item **sem mexer em combate ainda**" — com o exemplo
explícito "marcar item como ocultável/retrátil **se isso já existir como
propriedade renderizável**".

`ItemContent`/`InventoryItemInstance` (`src/lib/character/inventory.ts`) não
têm nenhuma propriedade renderizável de "estado" (oculto, retraído, etc.) —
só `categoria`, `subtipo`, `estado` (loadout: equipado/empunhado/acesso
rápido/mochila), `quantidade`, `runasInstaladas`. Como a própria tarefa
condiciona a Fase 4 à propriedade **já existir**, e ela não existe, a Fase 4
fica bloqueada pela mesma causa-raiz da Fase 3.

## Schema recomendado (se o produto decidir avançar)

Se o time quiser desbloquear Fases 3/4 no futuro, o schema mínimo seria:

```ts
// InventoryItemInstance
estadoRuna?: {
  runeInstallationId: string;
  propriedade: "oculto" | /* outras a definir */;
  ativoDesde?: string;
}[];
```

E, no payload canônico das runas, seria necessário fechar a inconsistência
apontada no item 2 acima (todas as runas com `efeito:"torna_ocultavel"`
deveriam ter o mesmo campo `ativacao`, com custo de ativar E desativar
explícitos) antes de qualquer automação — sem isso, qualquer implementação
seria uma regra inventada pelo código, não pela fonte.

## Arquivos afetados quando a regra existir

- `src/lib/character/inventory.ts` (novo campo de estado de item)
- `src/lib/character/technicalEffects.ts` (ou novo módulo dedicado a
  ativações) para o toggle reversível
- `src/app/dev/character-sheet/components/InventoryTab.tsx` (UI de
  ativar/desativar)
- Testes puros equivalentes aos já existentes em `scripts/test-inventory.ts`
  / `scripts/test-technical-effects.ts`

## Commit

`docs: document technical automation gap` (só documentação — nenhum código
de Fase 3/4 foi criado).
