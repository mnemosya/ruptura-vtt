# Importação de Conteúdo — Ruptura VTT (Biblioteca do Sistema)

Pipeline para carregar o pacote `ruptura-core` no Supabase/Postgres usando
arquitetura **JSONB-first**: cada documento de conteúdo é guardado inteiro em
`content_documents.payload` (JSONB). As mecânicas **não** são normalizadas em
tabelas separadas — as colunas escalares são apenas projeções para indexar e
filtrar.

## Arquivos

| Arquivo | Função |
| --- | --- |
| `supabase/migrations/0001_content_library.sql` | Cria `content_packs`, `content_documents`, `content_changelog`, o enum `content_type`, índices, triggers de `updated_at` e RLS. |
| `scripts/seed-content.ts` | Lê o manifesto e os DBs, quebra coleções, gera `id`, faz upsert e grava changelog (apenas quando há mudança real). |
| `scripts/validate-content-import.ts` | Confere contagens mínimas e checagens estruturais/integridade. |
| `package.json` / `tsconfig.json` | Dependências (`@supabase/supabase-js`, `tsx`, `typescript`) e atalhos `npm run seed:content` / `npm run validate:content`. |

## Modelo de dados

**`content_packs`** — um registro por pacote (ex.: `ruptura-core`); guarda o
manifesto inteiro em `manifest` (JSONB).

**`content_documents`** — um registro por documento. Colunas:
`id`, `content_type`, `slug`, `nome`, `categoria`, `subtipo`, `status`,
`version`, `source_pack_id`, `source_pack_version`, `payload`,
`payload_hash`, `created_at`, `updated_at`.

- `id` segue o formato **`<content_type>:<slug>`** (ex.: `spell:cinetica_controle`).
- `payload` contém o registro canônico completo, intacto.
- `payload_hash` é um sha256 do payload (chaves canonicalizadas), usado para
  detectar se uma reimportação realmente mudou algo (ver changelog abaixo).

**`content_changelog`** — trilha de auditoria. Guarda `payload_before` /
`payload_after` para cada mudança real (ver política abaixo).

### Tipos de conteúdo

`master_table`, `character_rule`, `combat_field`, `combat_flow`,
`combat_action`, `condition`, `property`, `item`, `rune`, `escalpo`,
`talent`, `spell`.

## Política de versão (decisão explícita)

**Opção escolhida: A — "última versão vence".**

`content_documents` é uma tabela de **estado atual**, não um histórico. A
chave natural do documento é `(content_type, slug)` — existe no máximo um
registro vivo por par, com constraint `unique(content_type, slug)`.
Reimportar uma versão nova do pacote **sobrescreve** o documento existente
via upsert por `id`. A versão anterior do payload não fica acessível por
query direta em `content_documents`; ela só é recuperável via
`content_changelog.payload_before` (gravado a cada mudança real).

Isso é adequado para uma **biblioteca de sistema** (regras/conteúdo base do
jogo, não conteúdo de campanha individual): só faz sentido jogar contra a
versão vigente do pacote, de forma análoga a atualizar uma dependência — a
versão antiga não convive em produção com a nova.

**Por que não a Opção B** (múltiplas versões coexistindo, com
`unique(content_type, slug, source_pack_version)`)? B é mais correta para
campanhas que precisam congelar numa versão antiga do conteúdo, mas exige que
toda leitura resolva "qual versão vale aqui" — overhead real sem necessidade
comprovada neste estágio do projeto.

### Migrando para B no futuro, se necessário

1. Trocar a constraint: `unique(content_type, slug)` →
   `unique(content_type, slug, source_pack_version)`.
2. Mudar o formato do `id` para incluir a versão (ex.:
   `<content_type>:<slug>@<source_pack_version>`) ou adotar uma PK surrogate
   (`uuid`) com o unique acima como constraint separada.
3. Em `seed-content.ts`: o `id` deixa de ser puramente `content_type:slug`.
4. Em `validate-content-import.ts`: as contagens mínimas passam a ser
   aplicadas **sempre** filtrando por `source_pack_version` (hoje isso já
   existe como filtro opcional via `PACK_VERSION`, mas é só uma checagem
   auxiliar sob a Opção A).
5. Decidir como o motor/app resolve "versão ativa" para uma campanha em
   andamento (ex.: campanha referenciando uma `source_pack_version`
   específica).

A migration `0001_content_library.sql` traz esse mesmo raciocínio comentado
diretamente no SQL, junto à definição da constraint.

## Mapeamento DB JSON → content_type

| Arquivo | content_type | Modo | Origem dos registros |
| --- | --- | --- | --- |
| `db_regras_personagem_normalizado_v1_4.json` | `character_rule` | singleton | arquivo inteiro |
| `db_campo_combate_normalizado_v1_1.json` | `combat_field` | singleton | arquivo inteiro |
| `db_fluxo_combate_normalizado_v1_1.json` | `combat_flow` | singleton | arquivo inteiro |
| `db_acoes_combate_normalizado_v1_1.json` | `combat_action` | coleção | `acoes[]` |
| `db_condicoes_normalizado_v1_5.json` | `condition` | coleção | `condicoes[]` |
| `db_propriedades_normalizado_v1.json` | `property` | coleção | `propriedades[]` |
| `db_equipamentos_normalizado_v1_2.json` | `item` | coleção | `itens[]` |
| `db_runas_normalizado_v1_2.json` | `rune` | coleção | `runas[]` |
| `db_escalpos_normalizado_v1_3.json` | `escalpo` | coleção | `escalpos[]` |
| `db_talentos_normalizado_v1_3.json` | `talent` | coleção | `talentos[]` |
| `db_magias_normalizado_v1_3.json` | `spell` | coleção | `magias[]` |
| `db_tabelas_mestre_normalizado_v1.json` | `master_table` | singleton | arquivo inteiro |

Para coleções, `slug = elemento.slug ?? elemento.id`. As colunas `categoria` e
`subtipo` são copiadas diretamente quando presentes no registro (nem todos os
tipos têm ambas — `talent`, por exemplo, não tem `categoria`/`subtipo`; o dado
permanece consultável via `payload`).

> **Nota:** `db_tabelas_mestre_normalizado_v1.json` **não** está listado no
> manifesto `ruptura-core`; o seed o trata como singleton à parte.

## Política de changelog

- **`created`** — gravado quando o `id` (`content_type:slug`) não existia
  antes desta execução do seed.
- **`updated`** — gravado apenas quando o documento já existia **e** o
  payload mudou de fato (`payload_hash` novo ≠ `payload_hash` armazenado).
- **Nenhuma entrada é gravada quando o payload é idêntico** ao já
  armazenado. Reimportar o mesmo pacote sem mudanças não escreve em
  `content_documents` nem em `content_changelog` para esses documentos —
  evita ruído no histórico e upserts desnecessários.

A comparação usa `payload_hash` (sha256 do payload com chaves
canonicalizadas), calculado pelo seed antes de cada upsert e recalculado pelo
validador para conferir consistência.

## Política de RLS (Row Level Security)

Implementada na migration (habilitada e com policies, não apenas comentada):

- **Leitura pública** (`anon`, `authenticated`): liberada em
  `content_packs` (metadados do pacote) e em `content_documents` **somente
  para `status = 'published'`**. Documentos em rascunho ou depreciados não
  ficam visíveis fora do `service_role`.
- **Escrita**: nenhuma policy de insert/update/delete é criada para
  `anon`/`authenticated` — com RLS habilitado e sem policy correspondente,
  essas roles simplesmente não conseguem escrever. Apenas o `service_role`
  (usado pelo seed) escreve, pois ele ignora RLS por padrão no Supabase.
- **`content_changelog`**: sem policy de leitura pública — é uma trilha de
  auditoria interna, visível apenas via `service_role`.

## Pré-requisitos

- Supabase project (ou Postgres com extensão `pgcrypto`).
- Node 18+.
- Manifesto e todos os `db_*.json` numa pasta (`CONTENT_DIR`).

## Instalação

```bash
npm install
```

## Passo a passo

### 1. Rodar a migration

```bash
supabase db push
# ou aplicar manualmente:
psql "$DATABASE_URL" -f supabase/migrations/0001_content_library.sql
```

### 2. Rodar o seed

```bash
export SUPABASE_URL="https://<projeto>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
export CONTENT_DIR="./content"          # pasta com manifesto + db_*.json
# export MANIFEST_FILE="ruptura_core_manifest_v0_1.json"   # opcional

npm run seed:content
```

O seed:

1. Lê o manifesto.
2. Faz upsert do `content_pack`.
3. Lê cada DB JSON.
4. Quebra as coleções em registros individuais.
5. Gera `id` no formato `content_type:slug`.
6. Calcula `payload_hash` e salva o registro completo em `payload` (JSONB).
7. Compara com o estado atual: classifica cada documento como novo, mudado
   ou inalterado.
8. Faz upsert em `content_documents` **apenas** para documentos novos ou
   mudados.
9. Registra changelog (`created` / `updated`) **apenas** para esses casos.
10. Imprime a contagem final por `content_type` (incluindo quantos foram
    `created`, `updated` e `sem_mudanca`).

> Use a **service role key** apenas em ambiente de servidor/CI — nunca no
> cliente. Ela ignora RLS.

### 3. Validar

```bash
npm run validate:content

# opcional: restringir a uma versão de pacote específica
PACK_VERSION=0.1.0 npm run validate:content
```

Contagens mínimas verificadas:

| content_type | mínimo |
| --- | --- |
| `combat_action` | 28 |
| `condition` | 17 |
| `property` | 14 |
| `item` | 119 |
| `rune` | 40 |
| `escalpo` | 58 |
| `talent` | 22 |
| `spell` | 132 |
| `character_rule` | 1 |
| `combat_field` | 1 |
| `combat_flow` | 1 |
| `master_table` | 1 |

O validador sai com código `!= 0` se qualquer contagem ficar abaixo do
mínimo, ou se alguma checagem estrutural falhar: `id` fora do formato,
`payload` vazio, `payload_hash` ausente ou inconsistente com o payload
armazenado, `source_pack` inexistente, ou colisão de `(content_type, slug)`
(segunda camada de sanidade além da constraint do banco).

## Reimportação

O seed é idempotente e incremental: roda upsert por `id` apenas onde o
payload mudou. Reexecutar sem alterações nos JSONs de origem não gera
escritas nem entradas de changelog.

## Consultando o payload (JSONB)

```sql
-- Todas as magias da vertente cinética (campo dentro do payload):
select id, nome
from content_documents
where content_type = 'spell'
  and payload->>'vertente' = 'cinetica';

-- Armas corpo a corpo (campo estatisticas.tipo_arma dentro do payload):
select id, nome
from content_documents
where content_type = 'item'
  and payload->'estatisticas'->>'tipo_arma' = 'corpo_a_corpo';
```

## Escopo (o que este pipeline NÃO faz)

- Não cria frontend.
- Não normaliza mecânicas em tabelas separadas (tudo fica em `payload`).
- Não inventa regras nem reescreve mecânica já presente no payload.
- Não implementa a Opção B de versionamento (múltiplas versões
  coexistindo) — ver seção "Política de versão" para o caminho de migração,
  caso isso venha a ser necessário.
