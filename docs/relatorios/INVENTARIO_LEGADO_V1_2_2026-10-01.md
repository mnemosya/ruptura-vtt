# Inventário do legado e dependências — migração v1.2

**Data:** 01/10/2026
**Escopo:** Fase 0 (inventário dos conteúdos que serão substituídos ou removidos) e Fase 9 (características de Classe que dependem de Investigação e Conflitos Sociais).
**Método:** só leitura no banco remoto e nos pacotes `content/v12/`. Nada foi alterado.

## 1. Conteúdo canônico (`content_documents`)

| Tipo | Publicados | Versões | Situação v1.2 | Destino |
|---|---|---|---|---|
| `class`, `subclass` | 7, 24 | 1.2 | v1.2 | mantém |
| `background`, `quality`, `complication` | 15, 24, 28 | 1.2 | v1.2 | mantém |
| `condition` | 18 | 1.2.0 | v1.2 | mantém |
| `combat_action` | 29 (+1 arquivada) | 1.0.0 e 1.2.0 | revisada contra o capítulo 21 | mantém; Apagar fogo já arquivada |
| `spell` | 132 | 1.3.0 | legado (`somatica`) | substituir pelo catálogo dos capítulos das Vertentes (em espera) |
| `talent` | 22 | 1.0.0 | não existe na v1.2 | arquivar no corte (Fase 7) |
| `item` | 120 | 1.2.0 | a revisar | equipamentos em espera |
| `escalpo` | 58 | 1.0.0 e 1.3.0 | a revisar | em espera, junto com equipamentos |
| `rune` | 45 | 1.0.0 e 1.2.0 | a revisar | em espera, junto com equipamentos |
| `property` | 14 | 1.0.0 | a revisar | em espera, junto com equipamentos |
| `companion_model` | 10 | 1.0.0 | a revisar | conferir contra o Domador (Caçador) |
| `character_rule` | 1 | 1.4.0 | parcialmente usado na v1.2 | perícias e derivados gerais continuam; point-buy, PM e Talentos saem |
| `combat_field`, `combat_flow`, `master_table` | 1 cada | 1.0.0 e 1.1.0 | a revisar | conferir contra os capítulos 21 e "Rolando os Dados" |

Nenhuma campanha tem conteúdo próprio (`campaign_content_documents` vazio). Por isso o corte não precisa migrar homebrew.

## 2. Personagens e rascunhos

| Item | Quantidade |
|---|---|
| Campanhas | 44 |
| Personagens v1 (schema 1) | 121, todos ativos |
| Personagens v1 com token em mapa | 32 |
| Personagens v1 com magias aprendidas | 5 |
| Personagens v1 com Talentos adquiridos | 4 |
| Personagens v1 com nível em `somatica` | 0 |
| Personagens v2 | 1 (Hilda Norren) |
| Rascunhos de criação | 3 (1 v2, 2 v1) |

Pelo plano, os personagens v1 e os rascunhos v1 serão apagados no corte da Fase 7, depois do snapshot. Isso conta 121 personagens e 2 rascunhos hoje. Os 32 tokens ligados a esses personagens também precisam de decisão: remover os tokens ou desvinculá-los.

## 3. Características de Classe ligadas a Investigação e Conflitos Sociais

| Característica | Onde | Ligação | Observação |
|---|---|---|---|
| Dossiê, Montar o Perfil, Caso Encerrado | Perito (Caçador), E/C/A | Investigação | Usa **Pistas** (até 3 no Dossiê). O capítulo 20 fala em **Evidências** e não define Pista. Não está claro se Pista é um registro próprio do Perito ou o mesmo que Evidência. |
| Manobras Sociais | Face, F | Conflitos Sociais | Transforma o sucesso num **Teste de Interação** em Arrancar, Comprometer, Desviar, Expor etc. O capítulo 19 fala em **Concessão** e não usa "Teste de Interação". A Face tem uma característica própria "Testes de Interação" com essas regras. |
| Reserva de Confiança | Face, F | Conflitos Sociais | Recurso consumido pelas Manobras Sociais. |
| Movimento | Ícone (Face), A | Conflitos Sociais | Fala em Concessões de um público; depende do mesmo vocabulário. |

### Pendências editoriais

1. **Pista × Evidência:** definir se a Pista do Perito é uma Evidência registrada no Dossiê ou um marcador separado.
2. **Teste de Interação × teste social:** alinhar o termo da Face com o capítulo 19 e dizer como Manobras Sociais combinam com as Concessões por impacto.
3. A página "AJUSTES APÓS O CAPÍTULO DE INVESTIGAÇÃO e LACUNAS PRIORIZADAS" no Notion já lista dúvidas sobre o Perito e o Procurar Brecha. Esta lista não substitui aquela página.

Implementar essas características na mesa depende dessas definições e da interface de Investigação. Por enquanto elas continuam como texto na ficha.
