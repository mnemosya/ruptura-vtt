# Sincronização de Mochilas MK — 11/10/2026

Fontes canônicas consultadas:
- Inventário: https://www.notion.so/3dd0a136355280e58284df2de80021e0
- Mobilidade: https://www.notion.so/ac80a136355282d08fbd01cb30610de4
- Ferramentas e Utilidades: https://www.notion.so/4210a13635528285a61281d46315a915

## Divergências encontradas e corrigidas

- Luvas ainda pertenciam a Mobilidade; efeitos, raridade Comum, preço 120Ⱥ e custo de 1 espaço já estavam corretos. Categoria corrigida mantendo o slug e a identidade do registro.
- Slot `luvas` ainda existia nos tipos e mapeamentos. Removido; leitura de dados legados preserva a instância, remove a posição e guarda o item na Mochila.
- Mochilas MK ausentes do catálogo. Publicados modelos I/II/III, capacidades 10/15/20, raridades Comum/Incomum/Raro, preços 200/600/1500Ⱥ e 2 espaços vazias.
- Capacidade fixa em 10. Agora depende apenas da Mochila MK equipada; sem mochila equipada, a capacidade é zero. Equipado não consome armazenamento; modelos guardados consomem 2 espaços cada.
- Criação sem mochila explícita. MK-I gratuita incluída na criação mínima e v1.2; RPC preserva validações de preços e permite exatamente uma MK-I gratuita.
- Projeção possuía um pseudo-slot extra de Escudo. Unificado com Arma Secundária, mantendo defesa e chegando às 15 posições.

## Migração e preservação

Migração `20261011071411_notion_mochilas_mk.sql` aplicada ao banco após ensaio com rollback.
Os nove personagens receberam uma MK-I equipada, materializando a capacidade básica anteriormente implícita. Comparação pré/pós confirmou preservação de todos os IDs, slugs e quantidades originais, com exatamente uma instância adicionada por personagem.
A concessão é idempotente e não cria outra mochila quando já existe um modelo MK. Não desconta carteira.
O banco rejeita múltiplas mochilas equipadas e posições Luvas obsoletas. A troca na ficha respeita capacidade +2 e preserva inventários legados acima do limite, permitindo reduzir/organizar sua carga. Uma mochila equipada com conteúdo não pode ser guardada dentro dela mesma; a troca transfere a carga para o modelo substituto.

## Validação

- `scripts/test-backpacks.ts`: modelos, 15 slots, capacidade, criação gratuita, exclusividade, mochilas individuais, custos de armazenamento, troca e normalização legada.
- `scripts/test-market-notion-update.ts`: armas, munição, suportes, recarga, compatibilidade e Luvas como ferramenta.
- `scripts/test-console.ts`: projeção e compatibilidade.
- `scripts/test-ruleset-v12-criacao.ts`: mochila gratuita sem alteração de orçamento.
- TypeScript e `git diff --check`.
- Consultas no banco: quatro registros canônicos, uma mochila equipada por personagem, nenhuma posição Luvas; teste transacional de rejeição de mochila duplicada.
