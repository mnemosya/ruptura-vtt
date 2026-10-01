# Relatório de início da migração para RUPTURA v1.2

**Data:** 30/09/2026  
**Escopo:** baseline do banco e Fundação Mecânica

## Resultado

A primeira fatia técnica da migração foi iniciada sem alterar ou apagar dados remotos.

A tag local `ruptura-v1.2-migration-start` preserva o baseline `0505f20`, anterior às mudanças v1.2.

Foram implementadas as regras mecânicas que bloqueavam personagens com Atributo 0 ou negativo, a correção de Reações e a integração completa de Medicina nos contratos existentes.

## Implementado

### Pools de Atributo

O motor central agora resolve:

| Atributo | Pool | Seleção |
|---:|---:|---|
| 3 | 3d8 | maior |
| 1 | 1d8 | maior |
| 0 | 2d8 | menor |
| –1 | 3d8 | menor |
| –2 | 4d8 | menor |

`rollPericia()` e `resolverPericia()` compartilham `getRupturaPool()`. O resultado registra:

- `quantidadeDados`;
- `modoSelecao`;
- `dadoEscolhido`.

O campo `maiorDado` foi mantido temporariamente como alias do dado escolhido para não quebrar consumidores que ainda serão renomeados durante a migração.

### Rolagem física

O rolador do VTT:

- permite Atributo 0 e negativo;
- cria a quantidade canônica de corpos físicos;
- envia as faces para o servidor;
- tem sua contagem revalidada contra o Atributo persistido;
- exibe “maior dado” ou “menor dado” conforme o pool;
- registra a semântica no log da mesa.

### Reações

Reações por rodada passaram de `Mente` para `Mente + 1` em:

- conteúdo canônico de regras de personagem;
- conteúdo de fluxo de combate;
- fallback TypeScript;
- normalização do fluxo de combate;
- migration preparada para o fallback SQL do HUD.

### Medicina

O registro de Medicina já existia no array principal de Perícias, mas não estava em todos os enums. Foram atualizados:

- enum de Perícias das regras de personagem;
- schema das regras de personagem;
- schema de ações de combate;
- schema de magias;
- schema de propriedades;
- serialização legada de efeitos;
- mapa de ícones da ficha.

## Validação executada

- `scripts/test-dice-ruptura.ts`: 13 cenários aprovados;
- `scripts/test-reactions.ts`: aprovado;
- `scripts/test-vtt-painel-feed.ts`: aprovado;
- `scripts/validate-content-import.ts`: aprovado;
- parse dos JSONs alterados: aprovado;
- compilação da aplicação: aprovada;
- checagem TypeScript: aprovada após remover o import duplicado de `cancelarTurno` em `scripts/test-trilha-ruptura.ts`;
- contratos v1.2: aprovados, incluindo referências cruzadas e rejeição de payload incompleto.

## Baseline de drift

Na primeira execução, `npm run db:drift` encontrou:

- 184 funções definidas no repositório;
- 174 iguais ao banco remoto;
- 10 divergentes;
- nenhuma função presente apenas no repositório;
- nenhuma função remota sem definição no repositório;
- uma troca de assinatura classificada como limitação do verificador.

Funções divergentes:

1. `publish_content_draft`;
2. `publish_campaign_content_draft`;
3. `remove_campaign_content_override`;
4. `archive_campaign_homebrew`;
5. `update_vtt_area`;
6. `mutate_unlinked_vtt_token_hud`;
7. `update_linked_vtt_hud_character`;
8. `set_vtt_scene_camadas`;
9. `set_vtt_scene_config`;
10. `present_vtt_scene`.

As dez divergências tinham a mesma causa: a migration `0155_sem_serialization_failure.sql` reescreve dinamicamente funções existentes, trocando `serialization_failure` por `check_violation`. O verificador analisava apenas declarações `create function` e não modelava a transformação feita dentro do bloco `DO`.

O verificador foi corrigido para aplicar essa transformação no ponto correspondente do replay estático. Depois da correção:

- 184 funções são definidas pelo repositório;
- 183 correspondem ao banco remoto;
- uma diverge: `vtt_hud_derived`;
- essa divergência é esperada, pois pertence à nova migration de Reações v1.2, ainda não aplicada no remoto.

Portanto, não restou drift funcional conhecido entre as funções anteriores à migração v1.2.

## Contratos canônicos v1.2 iniciados

Foram adicionados contratos e validadores puros para:

- Classe e progressão F–S+;
- Subclasse e características E/C/A;
- Antecedente;
- Qualidade;
- Complicação;
- personagem `schema_version: 2` e `ruleset_version: "1.2"`.

Os validadores conferem os orçamentos canônicos de Trajetória, a exigência de Subclasse a partir do Ranking E, PA e limite de Perícia por Ranking, perfis iniciais de Atributo e referências bidirecionais entre Classe e Subclasse.

Também foi preparada uma migration local para os tipos `class`, `subclass`, `background`, `quality` e `complication`. Ela não foi aplicada remotamente.

## Replay local concluído

Em 01/10/2026, o engine do Docker Desktop foi recuperado. Como o stack completo do Supabase falhou na inicialização do Realtime em Apple Silicon, o replay foi executado num PostgreSQL Supabase 17.6 descartável com um bootstrap local mínimo para os objetos de plataforma referenciados pelas migrations.

As 160 migrations foram aplicadas do zero. Tabelas e colunas, RLS, policies, índices, constraints, enums, funções, gatilhos, grants e publicação Realtime ficaram equivalentes ao remoto. A única divergência inicial era textual (`≠` no replay e `<>` no remoto) na mensagem de conflito de `publish_content_draft`; ela foi registrada numa migration idempotente, sem mudança de regra ou SQLSTATE.

Nenhuma escrita remota foi feita durante esta verificação.

## Próximo passo

1. obter um snapshot recuperável antes do corte destrutivo;
2. concluir condições, ações de combate e o catálogo editorial de magias da Fase 6;
3. preparar e revisar o script explícito do corte de personagens e drafts incompatíveis da Fase 7.
