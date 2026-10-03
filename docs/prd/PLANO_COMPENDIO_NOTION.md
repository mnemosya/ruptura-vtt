# Plano — Compêndio sincronizado com o Notion

**Status:** Fases 0 a 5 entregues
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

### 02/10/2026 — Fase 2

- Aba Compêndio do painel trocada: índice do livro por seção, busca em capítulos e verbetes, "Abrir o livro". O diretório antigo (magias, itens, runas, condições, companheiros) e "Enviar ao Chat" saíram (`compendioModelo.ts`, `acoes/compendioPainel.ts`); cartões antigos `compendio_compartilhado` no chat continuam legíveis.
- O livro abre num modal com a moldura do Códex da Forja (`_compendio/LivroCodex.tsx`): índice à esquerda (subtítulos do capítulo aberto), verbetes recolhíveis, etiquetas de termo com link para o verbete (`Lento` → cap. 22), links entre capítulos, Anterior/Próximo, Voltar, busca no texto completo (carregado só na primeira busca).
- Esc: o painel tinha o próprio Esc em captura e engolia a tecla; o painel agora ignora Esc com um modal aberto e o livro escuta Esc em captura.
- Verificação: `scripts/dev/check-compendio.ts <campaignId>` (9 critérios, todos aprovados), `test-vtt-painel` com os testes K do modelo novo.

### 03/10/2026 — Fase 3 (adaptada)

- O VTT ainda não tem servidor público e o Supabase não alcança o app (`pg_net` ausente), então não há cron chamando uma rota. No lugar: **abrir o Compêndio dispara, em segundo plano (`after()`), uma checagem no Notion, no máximo a cada 12 horas** (duas vezes por dia, decisão de 03/10/2026; 15 minutos foi considerado frequente demais).
- Último horário e resultado guardados em `content_packs.manifest` (`ultimaVerificacao`, `ultimoResultado`).
- Botão "Sincronizar agora" no rodapé da aba, só para administradoras de conteúdo (`is_content_admin`).
- O aviso "este capítulo foi atualizado" para quem está lendo saiu: com checagem de 12 em 12 horas, o livro já abre sempre na versão mais nova.
- O cliente com chave de serviço ganhou a segunda exceção documentada (`lib/supabase/adminClient.ts`).
- Quando o VTT tiver servidor público: trocar o gatilho por uma Edge Function agendada (pg_cron), que roda mesmo sem ninguém abrir o livro.
- Verificação: `check-compendio` com 10 critérios aprovados (C10: Sincronizar agora).

### 03/10/2026 — Galerias e tipografia

- Bancos embutidos do Notion em galeria (VERTENTES no cap. 16, CLASSES no cap. 9) viram uma galeria de cards no Códex: imagem (a primeira da página da linha, como no Notion), ícone, nome, descrição (`Descrição`, ou o primeiro texto, ex.: `Papel`) e seleções como etiquetas (`Dificuldade`). A API não devolve a ordem da visualização: a galeria é alfabética.
- Cada linha é uma **subpágina** do livro (`paiPageId`): fora do índice e de Anterior/Próximo, dentro da busca e dos termos (o nome `BIÓTICA` vira link). Editar só uma Vertente faz o capítulo dela ser relido (`subpaginas` guarda a data de cada uma).
- Ícones nativos do Notion (ex.: Sináptica) não vêm como imagem pela API e ficam sem ícone.
- Sincronização forçada: 13 subpáginas criadas, capítulos 9, 16 e 27 atualizados, 18 imagens novas, 1.578 requisições.
- Tipografia: corpo de toda a Forja (telas e Códex) trocado de Rajdhani para Exo 2 Regular (`--fj-corpo`). O resto do VTT segue em Rajdhani por ora.

### 03/10/2026 — Fase 4

- Imagens: recomprimidas na cópia (`sharp`, até 1600px de largura, WebP qualidade 80); SVG e GIF ficam como vieram. Reprocessamento completo: **185,8 MB → 10,4 MB** em 89 imagens (ex.: Cinética 5 MB → 277 KB). O bucket ficou com 88 WebP e 5 SVG.
- Imagens órfãs (sem nenhum documento publicado apontando para elas) são removidas no fim de toda rodada sem falhas; sem nenhuma referência lida, não apaga nada.
- O livro reabre no último capítulo lido (por navegador, `localStorage`).
- "Enviar ao chat": botão no verbete aberto e no título da página. Grava o evento `compendio_compartilhado` com o texto relido no servidor (até 1.500 caracteres) e o destino; o cartão no chat tem "Abrir no livro", que abre o livro no verbete.
- Verificação: `check-compendio` com 12 critérios aprovados (C11 enviar, C12 voltar pelo chat).

### 03/10/2026 — Fase 5

- Manifesto `content/v12/revisao_notion.json`: 13 fontes (Condições, Ações de combate, Bando, Conflitos Sociais, Investigação, Trajetória e as 7 Classes), cada uma com a página de origem no livro e a data de revisão (último commit do arquivo). Magias, equipamentos e Ameaças ficam de fora enquanto estão em espera.
- Comparação: com `hashRevisado`, só avisa se o TEXTO da página mudou; sem ele (estado inicial), compara a data de edição no Notion com a revisão.
- Onde aparece: no fim de `npm run notion:sincronizar` e, para administradoras de conteúdo, no topo da aba Compêndio (atualiza também após "Sincronizar agora").
- Marcar como revisado: `npm run compendio:revisado -- <chave>` (ou `--todos`, `--listar`); grava o hash atual e a data no manifesto, que é commitado com a revisão.
- Primeira leitura: Classe Âncora (editada 02/10 11:51, revisão 02/10 00:31), Infiltrador e Vanguarda (editadas 02/10 ~00:20, revisão 01/10 01:32). Nenhuma foi marcada: a revisão é decisão editorial.
- Verificação: `test:compendio-converter` (cenário 6) e `check-compendio` com 13 critérios aprovados.

### 03/10/2026 — Compêndio da área autenticada

- `/mesas/compendio` (menu "Compêndio" da conta) deixou de ser o catálogo da Biblioteca por tipo (magias, talentos, itens…) e passou a mostrar o mesmo livro, em página inteira (`LivroPagina`). Fora da mesa: leitura para qualquer conta logada, sem "Enviar ao chat" e sem "Fechar". O editor administrativo continua em `/admin/biblioteca`.
