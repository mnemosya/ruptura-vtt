# Plano — Compêndio sincronizado com o Notion

**Status:** em implementação (Fases 0 e 1 entregues)
**Criado em:** 02/10/2026
**Versão deste documento:** 0.1

## 1. Objetivo

Ter o livro de RUPTURA v1.2 dentro do VTT, como um compêndio de leitura, sempre igual ao Notion. A autora edita no Notion; em poucos minutos o VTT mostra a versão nova. O visual segue o Códex da Forja de Refratário.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Fonte | Só a página **RUPTURA (1.2)** do Notion. As cópias antigas do workspace (RUPTURA (1), (1.1.1), Alfa, v1.0.0, Beta) ficam de fora. |
| O que entra | Os 28 capítulos, nas seções "Sob a Sombra do Império Central" e "O Jogo em Movimento". Também os Patch Notes. |
| O que não entra | A seção "Versões anteriores" e toda a seção "Outros" (Guia Editorial, Guia de Design, Luara Venn, PULSE, SCRUX, Decisões de Design, banco MAGIAS). |
| Quem vê | Todos: jogadores e narrador veem todos os capítulos, inclusive "Narrando RUPTURA" e "Ameaças e Antagonistas". |
| Direção | Só Notion → VTT. O compêndio não é editável no VTT. |
| Dados de regra | Não são extraídos automaticamente do texto. Os arquivos revisados (`content/v12/`) continuam sendo a fonte do motor. A sincronização só **avisa** quando um capítulo mudou depois da última revisão (Fase 5). |
| Aba Compêndio atual | Substituída pela janela nova. |
| Magias | Continua valendo a regra: a fonte canônica é a lista de magias dentro de cada capítulo de Vertente. O banco MAGIAS do Notion não é lido. |

## 3. Como o Notion está organizado (levantamento de 02/10/2026)

- A página raiz lista os capítulos como subpáginas, em ordem, separados por títulos de seção (`###`).
- Cada capítulo é uma página com texto corrido, seguindo um padrão editorial consistente:
  - verbetes em **blocos recolhíveis** (toggle) com o nome em maiúsculas (ex.: cada condição no capítulo 22);
  - "**Efeito:**" em negrito e níveis em lista ("Nível 1", "Nível 2"…);
  - termos de jogo como código inline: `Lento`, `Vigor`, `1 PA`;
  - citações em itálico para texto de ambientação;
  - links "Anterior / Próximo" no fim (callouts com menção de página);
  - tabelas, imagens e callouts.
- Os links de imagem do Notion **expiram em minutos**: as imagens precisam ser copiadas.

## 4. Arquitetura

```
Notion (RUPTURA 1.2)
   │  API oficial (integração só de leitura)
   ▼
Sincronizador  ──►  imagens copiadas para o Storage do VTT
   │  converte blocos → formato do compêndio
   ▼
content_documents (content_type = "capitulo")   ◄── já existe no banco
   │
   ▼
Janela "Compêndio" no VTT (visual do Códex da Forja)
```

### 4.1 Formato guardado

Cada capítulo vira um documento `capitulo` com:

- `slug` estável, derivado do ID da página no Notion (renomear o capítulo não quebra links);
- `numero`, `titulo`, `secao`, `ordem`;
- `blocos`: uma lista **própria** (não o JSON cru do Notion), com só os tipos que o compêndio sabe desenhar: título, parágrafo, lista, citação, verbete recolhível, callout, tabela, imagem, divisor;
- texto com marcas: negrito, itálico, **termo** (o código inline), link interno (menção a outra página do livro);
- `notion_page_id` e `notion_editado_em`, para saber o que mudou;
- `hash` do conteúdo convertido: se não mudou, não publica.

Um tipo de bloco que o compêndio não conhece vira um aviso no relatório da sincronização, nunca some em silêncio.

### 4.2 Termos de jogo

O código inline (`Lento`, `Vigor`, `1 PA`) vira uma etiqueta no visual da Forja. Quando o termo bate com algo conhecido, a etiqueta vira link:

- condição → verbete da condição no capítulo 22;
- perícia, atributo → capítulo 14 / 13;
- custo (`1 PA`, `2 Mana`) → só etiqueta.

O índice de termos é montado pela própria sincronização, a partir dos títulos dos verbetes recolhíveis.

## 5. Fases

### Fase 0 — Acesso ao Notion (com a autora)

- Criar uma integração interna só de leitura em notion.so/profile/integrations.
- Compartilhar a página **RUPTURA (1.2)** com ela (as subpáginas herdam o acesso).
- Guardar a chave em `.env.local` como `NOTION_TOKEN` (fica só no projeto, nunca no repositório).

**Pronto quando:** um script de teste lista os 28 capítulos.

### Fase 1 — Sincronizador (linha de comando)

- `scripts/notion/sincronizar.ts`: lê a raiz, identifica seções e capítulos, percorre os blocos (inclusive filhos de toggles e listas) e converte para o formato do §4.1.
- Copia as imagens para o Storage (bucket próprio do compêndio, público para leitura), com nome pelo hash do arquivo (a mesma imagem não sobe duas vezes).
- Grava em `content_documents` só o que mudou (`hash`), com registro no `content_changelog`, como uma publicação do editor.
- Modos: `--seco` (só mostra o que mudaria) e normal.
- Relatório no fim: capítulos novos, alterados, inalterados, blocos desconhecidos, imagens copiadas.
- Teste com fixtures (blocos de exemplo salvos em arquivo), sem depender do Notion na suíte.

**Pronto quando:** `--seco` mostra os 28 capítulos; uma rodada real grava todos; uma segunda rodada não grava nada.

### Fase 2 — Janela do Compêndio no VTT

- Nova janela da mesa, aberta pelo painel. **Substitui** a aba Compêndio atual (lista de itens/magias/condições), decisão de 02/10/2026.
- Visual do Códex da Forja (`_forja/Codex.tsx`, `forja.css`): mesma moldura, tipografia (Oxanium / Chakra Petch), etiquetas e motion.
- Índice lateral por seção e capítulo; leitura com os blocos do §4.1; verbetes recolhíveis abrem e fecham; "Anterior / Próximo".
- Busca por título de capítulo, verbete e texto.
- Links internos e etiquetas de termo navegam dentro da janela, com voltar.
- Funciona para jogador e narrador, sem diferença de acesso.

**Pronto quando:** dá para ler o livro inteiro, buscar "Sangrando" e cair no verbete do capítulo 22.

### Fase 3 — Sincronização automática

- Rota do servidor que roda o sincronizador, protegida por segredo.
- Agendamento a cada 15 minutos (cron do Supabase ou do host do VTT). Cada rodada só lê os capítulos cujo `notion_editado_em` mudou, então é barata.
- Botão "Sincronizar agora" para a autora (só administradora de conteúdo), com o relatório da Fase 1.
- Os clientes abertos recebem a versão nova pelo realtime que o VTT já usa; quem está lendo um capítulo vê um aviso "este capítulo foi atualizado".

**Pronto quando:** editar um parágrafo no Notion aparece no VTT sem nenhuma ação manual em até 15 minutos.

### Fase 4 — Polimento

- Âncoras por verbete (link direto para "Sangrando"), lembrando a última posição de leitura.
- "Enviar ao chat" de um verbete, como a aba Compêndio já faz com itens.
- Imagens órfãs (removidas do Notion) apagadas do Storage.

### Fase 5 — Aviso de regras desatualizadas

- Cada arquivo de `content/v12/` passa a dizer de qual capítulo veio (ex.: condições → capítulo 22).
- Quando o capítulo muda no Notion depois da última revisão do arquivo, o relatório e o painel do Editor mostram: "capítulo 22 mudou desde a revisão das condições".
- Nenhuma alteração automática nas regras: a decisão de atualizar continua com a autora.

## 6. Riscos

| Risco | Mitigação |
|---|---|
| Limite da API do Notion (≈3 requisições/s) | Ler só capítulos alterados; fila com espera entre chamadas. |
| Bloco novo que o compêndio não desenha | Aviso no relatório e um bloco "conteúdo não suportado" no lugar, nunca sumir. |
| Página movida ou renomeada no Notion | Identificação pelo ID da página, não pelo título. |
| Capítulo apagado no Notion | Arquivado no VTT (não apagado), com aviso no relatório. |
| Sincronização quebrar no meio | Cada capítulo é gravado sozinho; uma falha não afeta os outros, e a próxima rodada tenta de novo. |
| Chave do Notion vazar | Só no `.env.local` e nos segredos do servidor; integração só de leitura. |

## 7. Fora deste plano

- Extrair automaticamente regras do texto (condições, Classes, magias) para o motor.
- Editar o livro dentro do VTT.
- Conteúdo homebrew de campanha no compêndio (sai junto com a aba atual; volta em plano próprio se fizer falta).

## 8. Registro

### 02/10/2026 — Fases 0 e 1

- Conexão "Ruptura VTT" criada no Notion (só leitura), token em `.env.local`.
- Primeira sincronização: 29 páginas (28 capítulos e Patch Notes 1.1.0), 76 imagens no bucket `compendio`, 515 kB de texto convertido. Capítulo 22 com os 18 verbetes de condição.
- Leitura completa: ≈6 min e 863 requisições. Rodada sem mudanças: 91 requisições (só a data de cada página).
- Tipos adicionados depois do ensaio: `heading_4` (as condições do cap. 22 são títulos de 4º nível recolhíveis) e `link_to_page`.
- Limite do bucket subiu de 10 para 50 MB: uma imagem do capítulo 23 passa de 10 MB. Reduzir o peso das imagens fica para a Fase 4.
