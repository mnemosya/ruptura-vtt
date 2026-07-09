# Checkpoint pós-v0.61 — rodada de automação: farmácia, talentos, magia, sobrecarga, logs e guardrails

Data: 2026-07-09. Rodada de 10 checkpoints (CP1–CP10) executada em sequência,
um commit por checkpoint funcional, com browser check real em cada feature de UI
e `npm run build` verde antes de cada commit.

## Commits criados nesta rodada

| Commit | Mensagem | Checkpoint |
| --- | --- | --- |
| `a8d1728` | feat: support condition removal pharmacy items | CP1 |
| `48bcd21` | feat: add manual pharmacy effect prompts | CP2 |
| `15bf724` | feat: add second layer talent automation | CP3 |
| `d0dc88d` | feat: add spell resistance and overload flow | CP4 |
| `fa34dc8` | feat: add overload surge actions | CP5 |
| `b99cc44` | feat: add spell fusion prompt flow | CP6 |
| — | (CP7 bloqueado — sem commit, ver abaixo) | CP7 |
| `c4719a2` | feat: improve table log readability | CP8 |
| `503be53` | fix: improve persistence error handling | CP9 |
| (este) | docs: add vtt automation checkpoint report | CP10 |

## O que foi automatizado

- **CP1 — Remoção de condição por farmácia** (`itemUse.ts`): efeito
  `remover_condicao` detectado por payload (`condicao`, `remover_condicao`,
  `condicoes_possiveis`); remove UMA condição ativa compatível por uso
  (só condições com `conditionId` da Biblioteca — mesmo critério conservador
  do auto-heal); seletor no card quando há várias compatíveis ativas; uso
  BLOQUEADO sem consumo (carga/quantidade/PA) quando nenhuma compatível está
  ativa; PA só com `custo_pa` numérico (sem fallback de 1 PA nesses itens);
  `item_used.removedConditions` formatado na aba Mesa e no `/dev/table`;
  `removidaOrigem: "item_use"` novo no modelo de condição.
- **CP2 — Efeitos farmacológicos manuais** (`getItemUsePreview`): card com
  preview Automático/Manual calculado do payload; **estabilização de colapso
  aplicada de verdade** via helper canônico `stabilizeCollapse` quando há
  colapso ativo compatível (`pausa_marcador` físico→PV / mental→PE), bloqueio
  sem consumo quando não há; **cura com `gatilho`** (ex.: `descanso_curto`)
  deixou de ser aplicada na hora (era uma sobre-automação do estabilizador de
  humor) e vira lembrete; buffs/aplicar_condicao geram lembretes ricos
  (valores/duração/momento do payload) sem inventar duração.
- **CP3 — Segunda camada de talentos** (`talents.ts`): efeitos com
  `usos`+`cadencia` viram recurso limitado usável (contador em
  `talentos_estado`, bloqueio ao esgotar, PA só com `custo_pa` numérico,
  log `talent_used`); `toggle_condicional` vira estado ligado/desligado cujos
  modificadores estruturados de `beneficios`/`penalidades` valem como
  `ActiveEffect` enquanto ativo (chips na ficha + prompt de rolagem). Reset
  automático de cadência: "rodada" no Encerrar Rodada da ficha, "cena" no
  Encerrar Cena da mesa (`endScene.ts`), "dia" no descanso longo; demais
  cadências (combate/sessão/missão/sessao_malha) só têm reset manual.
- **CP4 — Magia: resistência e cartão de resolução**
  (`prepareSpellCastResolution`): dano rolado na conjuração (fórmula `dado`
  OU `valor` fixo — os payloads com `valor` eram ignorados antes); CD/ações de
  resistência exibidas; efeitos manuais descritos do payload (41
  aplicar_condicao, 5 curas em alvo, testes colaterais, recurso temporário,
  modificadores); log persistente `spell_cast` estruturado e formatado;
  conjurar passou a persistir o personagem automaticamente quando conectado.
- **CP5 — Surtos de sobrecarga data-driven** (`overload.ts`): máximo de
  cargas/dia, dado do dano psíquico e teste do último surto
  (perícia/CD/condição de falha) lidos da regra canônica
  `regras_personagem.sobrecarga` (fallbacks idênticos ao PRD); bloqueio sem
  carga; log canônico `overload_surge_used`; persistência automática do uso.
- **CP6 — Fusão de magias** (`castSpellWithFusion`): segunda magia aprendida
  escolhida na conjuração; **+1 Sobrecarga sempre** (regra conhecida),
  bloqueio sem carga; custos estruturados só da magia principal; efeitos da
  fundida viram lembretes (nunca soma números); atingir o máximo de
  Sobrecargas marca Ruptura pendente.
- **CP8 — Logs sem JSON cru**: fallback genérico legível (rótulo + personagem
  + campos escalares) na aba Mesa; `character_state_change` formatado;
  últimos `JSON.stringify` removidos dos dois clientes; 33 entradas de 8+
  tipos verificadas sem JSON cru na Mesa e no `/dev/table`.
- **CP9 — Guardrails de persistência**: os 17 catches best-effort de `addLog`
  agora avisam no log local que o evento ficou só no cliente; persistência
  automática do personagem já sinalizava erro via banner mantendo o estado
  local (validado com falha de rede simulada; sem retry infinito).

## O que continua manual (por decisão, não por falta)

- Dano de granada/explosivo, dano/condição/cura de magia em ALVO: teatro da
  mente — narrador resolve pelas ferramentas de `/dev/table`.
- Dano psíquico do surto: a regra declara `aplicar_dano_na_hora: true` mas
  NÃO estrutura o recurso-alvo — aplicar em PE seria regra inventada.
- Buff temporário de item/magia (soro, injetor, hiperforça): sem modelo
  canônico de buff com duração rastreada — lembretes ricos.
- Efeito mecânico dos talentos de usos limitados (promoção de margem,
  execução, etc.): o CONTADOR é automático; o efeito é lembrete.
- Cura vinculada a gatilho de descanso: consome o item e lembra; sem modelo
  de "efeito pendente de descanso".
- Teste de biologia dos kits de estabilização: estabiliza + lembrete do teste
  (mesmo precedente do medkit com `falha: "metade"`).

## Bloqueio real (CP7 — inventário do bando)

Não existe NENHUM modelo de inventário de campanha/bando no schema:
`campaigns` tem só `name`/`current_round`/`current_scene` (migrations 0003 e
0017). Implementar transferências exigiria migration nova (tabela ou coluna
JSONB) — proibido sem autorização explícita. Um inventário "local" na memória
de um navegador não seria compartilhado e fingiria a feature; nada foi
implementado. **Próximo passo sugerido**: autorizar uma migration
`campaign_inventory` (instâncias com os mesmos campos de
`Character.inventario[]`: cargas, munição, aljava) + RLS espelhando
`characters`, e então o fluxo de transferência preservando cargas/munição/
aljava com log `inventory_transfer`.

## Pendências reais (registradas durante a rodada)

1. **CP7** — inventário do bando (bloqueado por schema, acima).
2. **`nivel_vertente`** — a CD de resistência de 54 magias é
   `5 + nivel_vertente`, mas não existe nível de vertente modelado na ficha;
   o cartão avisa e o cálculo é manual.
3. **Recurso-alvo do dano psíquico** de surto não estruturado no conteúdo.
4. **Sobrecarga estruturada em magias**: nenhuma das 132 magias declara custo
   de sobrecarga em payload — nada a automatizar até o conteúdo existir.
5. **Lista de surtos na Biblioteca**: não existe; tipos de surto continuam
   rótulos de UI (v0.37), sem efeito mecânico próprio.
6. **Teste do 3º surto vs. Fusão**: a regra descreve o teste para SURTOS; a
   Fusão que atinge o máximo marca Ruptura pendente e deixa o teste a critério
   do narrador (lembrete no cartão).
7. **Uso de item em outro personagem** (kit de estabilização em aliado caído)
   não implementado — o kit bloqueia sem colapso próprio, com aviso explícito.
8. **Buff empilhável** (Berserker nível 1, `buff_empilhavel`) — rastreio de
   pilhas não implementado (só o toggle do nível 2 foi automatizado).
9. **Reset "cena" de talentos** depende do Encerrar Cena DA MESA; a ficha não
   tem encerramento de cena local (herdado do v0.44).
10. **Logs antigos `overload_surge`** permanecem com o payload antigo (sem
    `maxSurtos`/`danoDado`) — o formatter usa fallbacks 3/1d4; nada quebrado.

## Riscos técnicos

- Formatters da aba Mesa e do `/dev/table` são DUPLICADOS de propósito (sem
  import compartilhado entre as duas árvores) — qualquer novo tipo de log
  precisa ser adicionado nos dois; o fallback genérico (CP8) reduz o impacto
  de esquecer, mas não elimina a divergência.
- `CharacterSheetClient.tsx` passou de 3.600 linhas — extrair os handlers de
  item/talento/magia para hooks/módulos reduziria risco de regressão.
- Handlers que leem `character` (prop) em vez de `characterRef.current`
  (ex.: surto) processam cliques em rajada com estado defasado — inofensivo
  hoje (cada clique re-renderiza), mas vale padronizar em `characterRef`.
- O reset de talentos "cena" persiste personagem por personagem no
  `endScene.ts`; falha em um personagem específico o pula (mesmo padrão de
  skip já existente) — contador daquele personagem fica para reset manual.

## Próximos checkpoints recomendados

1. Migration autorizada para inventário do bando + transferências (CP7 adiado).
2. Modelo de "nível de vertente" na ficha → CD de resistência calculada.
3. Motor de ataque mágico (resolução "ataque", 5 magias) reaproveitando o
   fluxo de ataque contestado do v0.47.
4. Modelo canônico de buff temporário com duração (desbloqueia soro/injetor/
   hiperforça/buff empilhável e duração de toggles).
5. Efeitos pendentes de descanso (cura com gatilho `descanso_curto`).
6. Uso de item/estabilização em OUTRO personagem (alvo manual simples).
7. Consolidar formatters de log em módulo compartilhado entre Mesa e /dev/table.

## O que falta antes de chamar combate/inventário/magia de "fechados"

- **Combate**: ataque mágico; aplicação de dano em alvo pelo narrador ligada
  ao cartão de resolução; Colapso/Ruptura já cobertos.
- **Inventário**: inventário do bando (bloqueado); uso em outro personagem;
  efeito mecânico de runas além dos modificadores passivos.
- **Magia**: nível de vertente/CD; sustentação e duração; especializações
  alterando magias; conteúdo de sobrecarga por magia.

## Verificação

- `git status --short` limpo após cada commit; `next-env.d.ts` revertido
  sempre que o dev server o alterava (nunca commitado alterado).
- `npm run build` verde antes de todos os commits.
- Browser checks reais executados por checkpoint (antídoto/estimulante com
  seletor, bloqueios sem consumo, kits de estabilização com colapso real,
  medkit/granada sem regressão, talentos usáveis + toggle + resets por
  rodada, conjurações com resistência/dano/mana, fusão com +1 Sobrecarga e
  bloqueio, surtos 3/3 com teste de Vontade, varredura de JSON cru em 33
  logs, e falha de rede simulada para os guardrails).

Não há testes automatizados nesta rodada (regra do pedido).
