# Fontes editoriais do Ruptura

Esta pasta preserva os capítulos autoritativos usados como origem dos bancos
normalizados em `content/`.

Os arquivos daqui são material de referência e auditoria. O VTT não deve
consumi-los em runtime: a aplicação lê a Biblioteca do Sistema no Supabase
(`content_documents`), alimentada pelos JSONs normalizados.

## Organização

- Os nomes e IDs exportados pelo Notion foram preservados para manter
  rastreabilidade e links relativos entre páginas.
- O capítulo 19 conserva suas páginas filhas em `19 MERCADO NOTURNO/`.
- Links para capítulos que não fazem parte deste recorte continuam apontando
  para o Notion.

## Relação com os bancos normalizados

| Fonte | Bancos relacionados |
| --- | --- |
| `9 ATRIBUTOS …`, `10 PERÍCIAS …`, `12 VIDA, ESTRESSE E MANA …` | `db_regras_personagem_normalizado_v1_4.json` |
| `16 COMBATE …` | `db_acoes_combate_normalizado_v1_1.json`, `db_fluxo_combate_normalizado_v1_1.json`, `db_campo_combate_normalizado_v1_1.json` |
| `17 CONDIÇÕES …` | `db_condicoes_normalizado_v1_5.json` |
| `18 TECENDO A MALHA …` | Referência editorial para regras e conteúdos ligados à Malha |
| `19 MERCADO NOTURNO …` e páginas filhas | `db_equipamentos_normalizado_v1_2.json`, `db_propriedades_normalizado_v1.json`, `db_runas_normalizado_v1_2.json`, `db_escalpos_normalizado_v1_3.json` |

Os metadados `_meta.fonte` e `_meta.hash_sha256_origem` dos JSONs devem ser
atualizados sempre que uma fonte editorial mudar e um banco for regenerado.

## Assets ausentes

Alguns Markdown referenciam pastas de imagens do export do Notion, como
`16 COMBATE/`, `18 TECENDO A MALHA/`, `19 MERCADO NOTURNO/ARMAS E ARMADURAS/`
e equivalentes. Esses assets não estavam presentes nas pastas fornecidas e,
portanto, os links de imagem permanecem quebrados até que os arquivos
originais sejam disponibilizados.
