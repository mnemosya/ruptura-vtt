# RUPTURA Agent

O corpus do agente é independente de `content_documents` e do Compêndio. O crawler só lê o Notion; nunca altera páginas, databases ou propriedades. As listas de Magias das Vertentes continuam canônicas; o database MAGIAS é referência.

## Componentes

- `ruptura_agent_sources`: snapshots normalizados, hashes, paths, roles e estado ativo.
- `ruptura_agent_jobs`: trabalho idempotente, claim atômico com `FOR UPDATE SKIP LOCKED`, lease de uma hora e retry.
- `ruptura_agent_findings`: evidência, confiança, revisão, deduplicação e ciclo de vida.
- `src/lib/ruptura-agent`: crawler, busca lexical, grafo, validators, modelo e worker reutilizável.
- `.github/workflows/ruptura-agent.yml`: agenda duas execuções diárias; a lógica está no worker.

As migrations em `supabase/migrations/20261007*_ruptura_agent_*.sql` devem ser revisadas e aplicadas explicitamente no ambiente desejado antes de qualquer comando `--write` ou ciclo. Os arquivos desta entrega **não aplicam schema remoto**.

## Configuração

Use `.env.local` localmente ou secrets/vars do GitHub Actions. Nunca versione valores reais.

| Variável | Uso |
| --- | --- |
| `NOTION_TOKEN` | Leitura do Notion. |
| `SUPABASE_URL` | Projeto que guarda o corpus. |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker e CLIs de escrita. |
| `MODEL_API_KEY` | API separada do provider semântico. |
| `MODEL_NAME` | ID do modelo na API. |

O adaptador inicial de modelo usa a Responses API da OpenAI e `store: false`. O núcleo do agente depende apenas da interface `AgentModel`, permitindo outro provider. A chave do modelo vai somente no cabeçalho da chamada HTTP; tokens do Notion e Supabase não entram no prompt, nas ferramentas ou nos findings.

## Comandos

```bash
npm run ruptura:agent:crawl -- --report
npm run ruptura:agent:crawl -- --write
npm run ruptura:agent:search -- "Ataque Secundário" --domain=rules
npm run ruptura:agent:auditar -- --report
npm run ruptura:agent:auditar -- --write
npm run ruptura:agent:processar-pendentes
npm run ruptura:agent:semantico -- <notion_id>
npm run ruptura:agent:semantico -- <notion_id> --write
npm run ruptura:agent:ciclo
npm run ruptura:agent:status
```

`--report` e o modo padrão de `semantico` não gravam fontes ou findings. O primeiro ciclo com corpus vazio faz apenas o bootstrap do corpus; jobs de auditoria passam a ser processados nos ciclos seguintes. Jobs de mudança só chamam o modelo quando a revisão ainda é a atual. Achados sem trecho verificável no bloco citado são rejeitados.

`processar-pendentes` drena jobs determinísticos já criados, sem reler o Notion. Recusa a execução quando existem jobs semânticos pendentes ou um crawl ativo; serve especialmente ao Bootstrap B antes de configurar o provider.

Busca normal exclui versões históricas e Patch Notes. `--domain=historical` as inclui explicitamente. O Guia Editorial tem papel próprio em questões editoriais; o Guia de Design, em questões de design. Fontes sem regra de precedência explícita permanecem referências, e conflitos são reportados.

## Validação

Os testes em `scripts/test-ruptura-agent*.ts` cobrem snapshots, topologia, roles, mudanças, ranking, grafo, validators, budgets, provider e bootstrap. `scripts/test-ruptura-agent-db.sql` roda em transação com `ROLLBACK` após aplicar as migrations num Postgres local; verifica jobs, retry, remoção, findings, stale e acesso sem papel admin. As migrations também foram reaplicadas nesse banco para verificar idempotência. `scripts/test-ruptura-agent-concurrency.sh` abre sessões Postgres paralelas: 12 upserts produziram uma fonte e um job, 12 claims retornaram jobs distintos, e dois crawlers concorrentes permitiram apenas um ativo. O benchmark de busca usa fixtures. Não foi criada busca vetorial, fila paralela, edição do Notion ou PR automático.

Em 07/10/2026, após autorização explícita, as quatro migrations do Agent foram aplicadas ao projeto Supabase `ruptura-vtt`. Seus arquivos locais usam as versões registradas no histórico remoto (`20261007232402`, `20261007232417`, `20261007232424`, `20261007232431`). A API retornou `200` para as três tabelas, e o teste SQL transacional passou com `ROLLBACK`; fontes, jobs e findings permaneceram vazios. O crawler e o worker não foram executados com escrita nessa validação.

Uma leitura integral somente leitura da raiz `RUPTURA (1.2)` em 07/10/2026 encontrou 623 fontes e percorreu 6.109 requisições. Incluiu páginas do livro, subpáginas de Ameaças e Vertentes, databases, data sources, rows e versões históricas. O relatório mostrou os títulos reais `GUIA EDITORIAL — RUPTURA v1.2` e `GUIA DE DESIGN — RUPTURA v1.2`; a classificação por papel foi ajustada para esses nomes e coberta por teste. Nenhum snapshot dessa leitura foi gravado no Supabase.

Em 08/10/2026, o Bootstrap A gravou 623 fontes e 623 jobs de criação no Supabase de produção. O Bootstrap B processou os 623 jobs sem retry ou incompletude; 78 fontes canônicas foram auditadas e não produziram findings determinísticos. Quatro consultas exatas do benchmark de busca encontraram Patrulheiro, Inquisidor Biótico, Exotraje Mosaico e Cenas de Combate; a consulta sobre tirar arma da mochila encontrou Inventário entre os primeiros resultados. A auditoria semântica inicial ainda depende da configuração de `MODEL_API_KEY` e `MODEL_NAME`.
