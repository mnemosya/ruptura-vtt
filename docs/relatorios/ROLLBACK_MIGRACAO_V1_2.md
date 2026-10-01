# Rollback da migração RUPTURA v1.2

**Data:** 01/10/2026
**Escopo:** como desfazer cada passo aplicado no banco remoto durante a migração v1.2, do mais seguro (desfazer um item) ao mais drástico (restaurar o banco inteiro).

## 1. Ponto de restauração completo

Antes do corte de personagens (Fase 7) foi feito um `pg_dump` completo do banco:

- arquivo: `~/ruptura-backups/ruptura_pre_corte_v12_20261001_152726.dump` (2,2 MB, formato custom);
- sha256: `eca60c15c865…`; o valor completo está no plano;
- restauração testada num PostgreSQL 17.6 descartável (imagem Supabase), com contagens iguais às do remoto.

**Restaurar tudo** volta o banco ao estado anterior ao corte. Isso traz de volta os 121 personagens v1 e os tokens deles, mas **desfaz também tudo o que foi feito depois**: Bando, personagens pendentes e todas as migrations seguintes. É a última opção.

```bash
docker run --rm --network host -v ~/ruptura-backups:/b --entrypoint sh public.ecr.aws/supabase/postgres:17.6.1.167 \
  -c 'pg_restore --clean --if-exists --no-owner -d "$SUPABASE_DB_URL" /b/ruptura_pre_corte_v12_20261001_152726.dump'
```

Os erros sobre schemas gerenciados pelo Supabase (`graphql_public`, `auth` etc.) são esperados. Confira depois com `node scripts/dev/v12/contagem_banco.mjs`.

## 2. Desfazer um item específico

Ordem do mais recente para o mais antigo. Cada linha diz o que reverter e o que se perde.

| Migration / passo | O que fez | Como reverter | Efeito colateral |
|---|---|---|---|
| Talentos arquivados (seed) | 22 Talentos com `status: archived` | Voltar `status` para `published` em `content/db_talentos_normalizado_v1_3.json` e rodar `npm run seed:content` | Nenhum (o Compêndio também precisaria da categoria de volta, no código) |
| `20261001210000_ruptura_v12_recusa_personagem_v1` | CHECK `characters_payload_schema_v2`; remove `complete_character_creation`; trava na v2 | `alter table characters drop constraint characters_payload_schema_v2;` A RPC v1 tem a última definição em `0060_display_names_tipo_personagem_protection.sql`. A trava é inofensiva e pode ficar | Sem o CHECK, volta a ser possível gravar personagem v1 |
| `20261001200000_ruptura_v12_bando_transferir_aretz` | RPC `transfer_crew_aretz` | `drop function transfer_crew_aretz(uuid, uuid, integer, boolean);` | Some a transferência na Ficha do Bando |
| `20261001190000_ruptura_v12_bando_edicao_participantes` | `save_campaign_crew` aceita participantes | Reaplicar a função de `20261001180000` (só narrador) | Jogadores deixam de editar o bando |
| `20261001180000_ruptura_v12_bando` | Tabela `campaign_crews` e RPC | `drop table campaign_crews cascade;` | **Perde o estado de todos os bandos** |
| `20261001170000_ruptura_v12_personagem_pendente` | `create_pending_character_v2`, `p_character_id` na criação e proteção de `criacao_pendente` | Reaplicar a versão de `complete_character_creation_v2` de `20261001034830` e a de `update_character_sheet_payload` de `20261001160000`; `drop function create_pending_character_v2(uuid, text, boolean);` | "+ Personagem" quebra até o código voltar |
| `20261001160000_ruptura_v12_correcao_atributos_pericias` | Ficha libera Atributos e Perícias com limites | Reaplicar `update_character_sheet_payload` de `20261001120000` | "Ajustar" deixa de gravar para jogadores |
| `20261001120000_ruptura_v12_protecao_ranking` | `advance_character_ranking_v2` e proteção da progressão | `drop function advance_character_ranking_v2(uuid, jsonb);` e reaplicar `update_character_sheet_payload` de `0092_update_character_sheet_payload_narrador.sql` (com a permissão por controlador de `0151`) | Avanço de Ranking quebra até o código voltar |
| Corte de personagens (Fase 7) | 121 personagens v1, 46 tokens e 2 rascunhos apagados | Só pelo dump da seção 1 (`pg_restore` seletivo das tabelas `characters`, `vtt_tokens`, `character_controllers`, `campaign_character_placements`, `character_creation_drafts`) | Exige retirar antes o CHECK v2 |
| Seeds de conteúdo v1.2 | Classes, Subclasses, Trajetória, Condições, Ações | Documentos com `status: archived`; os anteriores estão no dump | Personagens v1.2 dependem desses documentos |
| `20261001034830`, `20261001033923`, `20261001024345`, `20261001024158` | Fundação v1.2 (tipos de conteúdo, reações, criação, fórmulas) | Não reverter isoladamente: toda a v1.2 depende deles | Usar a seção 1 |

## 3. Código

Todo o trabalho está na branch `migracao-ruptura-v1-2` (PR mnemosya/ruptura-vtt#3), ainda não mesclada. Reverter o código é não mesclar o PR, ou fazer `git revert` de commits específicos. O banco remoto, porém, já tem as migrations: o código da `main` antiga **não funciona** com o CHECK v2 nem sem a RPC v1. Para voltar a `main` antiga, é preciso restaurar o banco pela seção 1.

## 4. Como conferir depois de um rollback

- `node scripts/dev/v12/contagem_banco.mjs`: contagens de usuários, campanhas, personagens, v1, tokens, cenas e bandos;
- `npx tsx scripts/dev/v12/testar_rpc_avanco.ts` e `npx tsx scripts/dev/v12/testar_bando.ts`: falham de forma esperada nos itens revertidos;
- `npm run seed:content:dry`: mostra divergência entre arquivos e banco.
