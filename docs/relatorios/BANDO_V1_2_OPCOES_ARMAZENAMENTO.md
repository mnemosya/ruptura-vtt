# Bando v1.2 — opções de armazenamento (Fase 8)

**Data:** 01/10/2026
**Fonte:** capítulo 10 (Bando Refratário) do Notion, editado em 22/09/2026.
**Decisão pendente:** pergunta aberta do plano: *"O estado do Bando ficará em entidade 1:1 própria ou no payload de campanha?"*

## 1. O que o capítulo pede para registrar

A seção "Registro do Bando" do capítulo lista estes campos para a ficha coletiva:

| Grupo | Campos | Natureza |
|---|---|---|
| Identidade | nome, símbolo/marca, princípio, contato inicial, inimigo ou dívida | texto, raramente muda |
| Reputação | Cobalto (≥ 0); Ranking derivado (F 0, E 3, D 7, C 12, B 18, A 25, S 35) | número, muda ao fim de cada operação (−2 a +3) |
| QG | tipo (5 tipos, com Capacidade e Segurança base), melhorias (8, cada uma com aprimoramento opcional, portátil ou fixa), Segurança máxima 3 | estrutura com regras de compra, troca e revenda |
| Especialistas | 7 tipos, com recrutamento, salário, área e situação de disponibilidade (dois intervalos sem salário encerram o contrato) | lista que muda a cada intervalo |
| Exposição | trilha de 0 a 6 ligada ao QG atual, **cada segmento com a pista de origem**; zera ao trocar de QG | lista de pistas, não só número |
| Alerta Imperial | trilha de 0 a 5 ligada ao bando, com identidades conhecidas e investigação ativa | número + texto |
| Operação | coberturas (3 tipos, com estado comprometido), projetos e preparações válidas | lista de curta duração |
| Caixa coletivo | aretz separados, opcional | número |

Além disso, há regras de processo: o **intervalo** tem uma sequência de 6 passos, com atividades por personagem e por especialista. As **complicações** são uma tabela 1d8.

O bando é **opcional** por campanha. Hoje a aba Bando do painel é só o inventário compartilhado (`campaign_inventory_items`, vazio no remoto), com transferência para personagens. Isso continua valendo nas duas opções.

## 2. Opções

### A. Tabela própria 1:1 (`campaign_crews`)

Uma linha por campanha que usa bando: colunas para os campos estáveis (nome, princípio, Cobalto, Exposição, Alerta) e `jsonb` para as listas (melhorias, especialistas, pistas, coberturas).

- **A favor:**
  - RLS própria, por exemplo jogadores lendo e só o narrador alterando Cobalto e Alerta;
  - revisão otimista própria (`revision`), como fichas e rascunhos;
  - realtime só desta tabela;
  - CHECKs no banco (Cobalto ≥ 0, Exposição 0–6, Alerta 0–5);
  - histórico de mudanças por gatilho, se quisermos;
  - não mexe na tabela `campaigns`, que já carrega a trilha de turnos e o controle de rodada.
- **Contra:** uma tabela, uma migration e RPCs a mais.
- **"Opcional" fica natural:** campanha sem linha é campanha sem bando.

### B. Coluna `jsonb` em `campaigns` (`crew_state`)

- **A favor:** menos peças. Lê junto com a campanha.
- **Contra:**
  - `campaigns` hoje só deixa o dono atualizar, e o update já é disputado pela trilha de turnos (`turn_track`, `turn_track_version`, `round_processing`). Qualquer escrita do bando passaria a competir com o controle de rodada ou exigiria uma RPC dedicada de qualquer forma.
  - A validação ficaria só no código.
  - O realtime da campanha passaria a disparar a cada mudança do bando.

### Recomendação

**A (tabela própria).** Pesam três coisas:

1. A concorrência com a trilha de turnos em `campaigns`.
2. A necessidade de permissões diferentes por campo: o jogador registra uma atividade, mas o narrador decide Cobalto e Alerta.
3. As trilhas com CHECK no banco.

Pela regra de segurança do plano, as mudanças de Cobalto, Exposição e Alerta passariam por RPCs que validam os limites do capítulo. Exemplos: variação de −2 a +3 por operação, e no máximo +2 de Exposição e +2 de Alerta por operação.

## 3. O que não depende da decisão

- O Ranking é sempre derivado do Cobalto, então não precisa ser salvo.
- As tabelas do capítulo (Rankings, QGs, melhorias, especialistas, coberturas, complicações) são conteúdo e podem virar um pacote `content/v12/db_bando_v1_2.json` como os de Investigação e Conflitos Sociais.
- O motor puro (Ranking por Cobalto, limites de variação, estágios de Exposição e Alerta, Capacidade e Segurança do QG) pode ser escrito e testado antes de existir o armazenamento.
