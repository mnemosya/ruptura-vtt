# Levantamento canônico — magias e mercadorias v1.2

**Leitura:** 09/10/2026, API oficial do Notion, integração somente leitura.  
**Estado:** substituição publicada. Em 09/10/2026, os 365 documentos legados de `spell`, `item`, `rune`, `escalpo` e `companion_model` foram removidos de `content_documents` a pedido da autora. Em seguida, foram publicados **607 documentos novos** do pacote `ruptura-notion-v12`: 233 magias e 374 mercadorias. A consulta posterior confirmou que todos os registros publicados desses cinco tipos pertencem ao pacote novo. Um rascunho antigo de `energetica_bola_de_fogo` também foi removido; o rascunho de teste independente `zz_e2e_efeito_temporario` permanece. Nenhum personagem foi alterado.

## Fontes e mudança de escopo

- Magias: `17. MAGIA E VERTENTES` (`bd50a1363552821ab3e581b50e481954`) → galeria `VERTENTES` → página de cada Vertente → bloco `LISTA DE MAGIAS` → cinco seções `MAGIAS DE NÍVEL 1–5`. O banco separado `MAGIAS` não foi usado.
- Mercadorias: `25. MERCADO NOTURNO` (`44c0a1363552821db82681a393ce7fb8`) → `LISTA DE MERCADORIAS` → 12 páginas filhas. A exportação em `docs/fontes/` ainda representa a estrutura antiga de nove páginas.
- As fontes mantêm IDs de página e bloco e datas de edição, para identificar alterações posteriores.

## Magias

| Vertente | Níveis 1 / 2 / 3 / 4 / 5 | Total |
|---|---:|---:|
| Biótica | 7 / 12 / 8 / 7 / 7 | 41 |
| Cinética | 8 / 8 / 9 / 2 / 3 | 30 |
| Cognitiva | 8 / 9 / 10 / 7 / 4 | 38 |
| Energética | 8 / 12 / 8 / 6 / 2 | 36 |
| Material | 9 / 9 / 9 / 6 / 5 | 38 |
| Sináptica | 13 / 13 / 13 / 6 / 5 | 50 |
| **Total** | | **233** |

Todos os 233 verbetes têm `Nível`, `Tipo`, `Alcance`, `Duração` e `Pré-requisito` no corpo. O título fornece Mana e tempo de conjuração: 230 custos fixos, um intervalo e dois variáveis; 207 conjurações em PA, 14 Reações, 11 tempos em minutos/horas e um tempo variável. O corpo integral e suas marcações foram preservados.

As quatro escolhas especiais têm representação estruturada, conferida contra as tabelas/texto do Notion: **Esferas de Impacto** (3–6 Mana), **Modulação** (níveis 1–5 custam 1/3/5/7/9 Mana), **Mergulho** (investimento livre que gera RAM, sem mínimo inferido) e **Linha de Demolição** (escala pequena/média/grande: 1/10/60 minutos). O novo catálogo publica o texto e os custos; a ficha bloqueia a ação automática das 29 magias com custo variável, Reação ou tempo fora de PA, sem gastar recursos. As outras 204 podem descontar PA e Mana fixos. Os efeitos das 233 magias são narrativos conforme a descrição canônica, sem aplicação automática em alvos.

**Decisão editorial de 09/10/2026:** `COMANDO` da Cognitiva vale como **nível 4**, conforme confirmação da autora. O verbete foi corrigido no Notion; seção e corpo agora declaram nível 4. `PALCO VIRTUAL` da Sináptica contém uma nota de decisão editorial no próprio corpo; ela também foi preservada.

**Direção de substituição confirmada pela autora:** as 233 magias do capítulo de cada Vertente substituem integralmente o catálogo anterior. Não há reaproveitamento editorial ou mecânico das 132 magias legadas. A transcrição necessária é somente do Notion para o formato lido pelo VTT.

## Mercadorias

| Página | Registros |
|---|---:|
| Acessórios | 6 |
| Armas | 131 |
| Armaduras e Escudos | 39 |
| Dispositivos Tecnológicos | 6 |
| Drones e Robôs | 15 |
| Escalpos | 92 |
| Explosivos | 10 |
| Farmácia | 10 |
| Ferramentas e Utilidades | 14 |
| Mobilidade | 37 |
| Trajes | 6 |
| Vertinas | 8 |
| **Total** | **374** |

O Notion tem 371 linhas em tabelas comerciais e seis módulos veiculares com preço em verbetes. Três linhas da tabela técnica de **Deck Sináptico** repetem as versões Civil, Corporativo e Imperial já listadas na tabela comercial: seus dados técnicos e IDs foram anexados aos três produtos, chegando a **374 mercadorias distintas**. Cada registro guarda categoria, seção, colunas originais, preço textual e numérico, ID de origem e texto detalhado quando foi possível vinculá-lo. Há 60 mercadorias sem verbete individual correspondente por título, em especial módulos de escalpo e munições; os dados dessas linhas continuam no rascunho. Nomes repetidos em seções distintas são identificados pelo ID do bloco, e uma colisão de slug `Tóxica` recebeu sufixos de ID provisórios.

As 374 mercadorias já foram convertidas em payloads publicados dos tipos `item`, `rune`, `escalpo` e `companion_model`. Preço, raridade, descrição, colunas da tabela, origem e vínculos sugeridos estão no payload. Os efeitos e a instalação de módulos permanecem manuais nesta primeira transcrição; atributos de combate ainda não foram automatizados a partir do texto. O formato de edição da Biblioteca e os schemas antigos ainda exigem atualização para os novos campos e categorias.

**Leitura na ficha:** a consulta pública com a chave anônima retornou 233 magias, 273 itens, 52 runas, 39 escalpos e 10 modelos de companheiro. O Mercado da aba Inventário reúne as **374 mercadorias** com busca, categoria, preço e descrição: os 273 itens mantêm a compra para a mochila; as 52 runas, 39 escalpos e 10 modelos de drone/robô aparecem para consulta, com aviso de que sua compra ainda não é registrada pela ficha. Runas e escalpos também são lidos nas áreas técnicas da ficha, e modelos de drone/robô no seletor de companheiro. A renderização atual mantém quebras de linha do texto extraído, mas ainda mostra marcações Markdown literalmente em alguns trechos; tabelas e estilos ricos precisam de renderizador próprio. A compra de item continua uma ação de inventário básica, sem instalar runa, implante ou módulo automaticamente.

### Classificação estrutural inicial

O arquivo `classificacao_mercadorias_v1_2_rascunho.json` atribui um tipo proposto a cada uma das 377 linhas, sem esconder as lacunas do schema atual:

| Situação | Quantidade | Encaminhamento |
|---|---:|---|
| Mapeável ao tipo existente | 291 | 190 itens de categorias já conhecidas, 52 runas, 39 escalpos e 10 modelos de drone/robô. Ainda faltam transcrição mecânica e validação. |
| Categoria nova de item | 35 | Acessórios (6), venenos (4), equipamentos de mobilidade (13), módulos veiculares (6) e trajes (6). Ampliar o enum e o comportamento correspondente. |
| Modelo de módulo de escalpo | 48 | As linhas marcadas com `↳` são módulos instalados em um escalpo-base. A classificação já guarda o implante-base sugerido pela posição na tabela; os três módulos de Deck Sináptico apontam para suas três versões. Compatibilidade e capacidade ainda precisam de contrato na ficha. |

O tipo proposto é `item` para 225 registros, `rune` para 52, `escalpo` para 39 e `companion_model` para 10; 48 módulos ficam com tipo a definir. **Decisão editorial da autora:** CDI Craqueada é um item separado vinculado ao RPI; foi classificada como dispositivo, com o vínculo registrado para modelagem. Os três níveis de RPI Forjado continuam classificados como escalpo de identidade conforme a fonte. O valor `Módulo` na coluna `Raridade` das 48 linhas é um marcador de tipo no Notion, não uma raridade publicável. Essas quantidades são classificação de armazenamento, não aprovação de efeitos.

**Direção de substituição confirmada pela autora:** as 374 mercadorias distintas do Mercado Noturno substituem integralmente o catálogo anterior. Não há aproveitamento de preço, raridade, descrição ou efeito antigo. Os vínculos por slug de personagens e capítulos precisam de tratamento na troca do catálogo, para que referências existentes não fiquem sem destino.

## Arquivos e reprodução

- Fontes extraídas: `content/v12/fontes_notion/magias.json` e `content/v12/fontes_notion/mercadorias.json`.
- Rascunhos estruturados: `content/v12/db_magias_v1_2_vertentes_rascunho.json`, `content/v12/db_mercadorias_v1_2_rascunho.json` e `content/v12/classificacao_mercadorias_v1_2_rascunho.json`.
- Catálogos publicados: `content/v12/db_magias_vertentes_v1_2.json`, `content/v12/db_mercado_itens_v1_2.json`, `content/v12/db_mercado_runas_v1_2.json`, `content/v12/db_mercado_escalpos_v1_2.json` e `content/v12/db_mercado_companheiros_v1_2.json`; manifesto `content/v12/notion_catalog_manifest.json`.
- Extração: `node --import tsx scripts/notion/extrair-catalogos-v12.ts` (requer `NOTION_TOKEN` em `.env.local`).
- Regeneração local: `node --import tsx scripts/dev/v12/gerar_magias_das_vertentes.ts`, `node --import tsx scripts/dev/v12/gerar_mercadorias_do_mercado.ts`, `node --import tsx scripts/dev/v12/classificar_mercadorias_v12.ts`, `node --import tsx scripts/dev/v12/gerar_catalogo_magias_v12.ts` e `node --import tsx scripts/dev/v12/gerar_catalogo_mercadorias_v12.ts`.
- Seed filtrado: `SEED_CONTENT_TYPES=spell,item,rune,escalpo,companion_model MANIFEST_FILE=v12/notion_catalog_manifest.json node --import tsx scripts/seed-content.ts` (adicione `SEED_DRY_RUN=1` para simular).

Os arquivos anteriores `db_magias_v1_2_metadados.json` e `crosswalk_magias_v1_3_para_v1_2.json` vieram do banco de magias desatualizado; não alimentam estes catálogos. `scripts/seed-content.ts` deixou de importar os cinco tipos legados. O manifesto `ruptura_core_manifest_v0_1.json` e os JSONs antigos permanecem como histórico; o manifesto antigo ainda descreve as coleções anteriores, mas o pacote novo tem manifesto próprio.
