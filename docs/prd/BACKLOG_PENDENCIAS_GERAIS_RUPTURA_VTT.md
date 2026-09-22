# Backlog de pendências gerais — Ruptura VTT

**Data da triagem:** 2026-09-15

**Escopo:** área autenticada, campanha e mesa virtual

**Objetivo:** converter o levantamento de produto em tarefas implementáveis, explicitar dependências e impedir implementação baseada em regras ainda indefinidas.

## 1. Convenções deste backlog

### Status

- **Pronta:** há regra suficiente para implementação; dúvidas listadas podem ser resolvidas sem alterar a regra central.
- **Pronta após dependência:** a regra está definida, mas outra tarefa precisa ser concluída primeiro.
- **Bloqueada:** falta uma decisão de produto, regra de jogo, contrato de dados ou referência de design indispensável. Não implementar até as dúvidas bloqueadoras serem respondidas.
- **Em validação:** implementação entregue; verificações finais de interface ou integração ainda pendentes.

### Prioridade sugerida

- **P0 — crítica:** corrige estado enganoso, privacidade, autorização ou cria a fundação de várias outras tarefas.
- **P1 — alta:** fluxo principal, defeito de gameplay ou melhoria com impacto frequente.
- **P2 — média:** expansão importante, mas sem bloquear o núcleo atual.
- **P3 — baixa:** polimento ou capacidade que pode esperar pelas fundações.

### Critérios transversais

Além dos critérios específicos de cada tarefa:

- mutações devem ser autorizadas no servidor e respeitar RLS; esconder um botão não é autorização;
- estados compartilhados devem ter uma única fonte canônica, atualização em tempo real quando aplicável e degradação explícita quando a sincronização falhar;
- superfícies interativas devem funcionar com teclado, foco visível, rótulo acessível e redução de movimento;
- alterações de banco precisam de migration, tipos, política de acesso e teste de isolamento entre campanhas;
- não manter mocks silenciosos em fluxos de produto;
- cada entrega deve ter teste de domínio para regras e um check de interface para o caminho principal.

## 2. Leitura do estado atual do repositório

Esta triagem considera o código existente, não apenas a lista de desejos:

- `MesasDashboardClient.tsx` já possui modal de criação, mas chama `createCampaign(name)` e declara descrição, status online e contagem do hero como mocks.
- `presenceRealtime.ts` e `CampaignRealtimeProvider.tsx` já rastreiam quem está com uma campanha aberta. Isso é presença efêmera e decorativa; **não** equivale a uma sessão declarada online pelo narrador.
- `JanelaConteudo.tsx` hoje administra conteúdo de regras da mesa — oficial, override e homebrew. Ela não é ainda o organizador narrativo de sessões, NPCs, lugares e handouts pedido neste backlog.
- `JanelaConfiguracoes.tsx` hoje permite apenas renomear a campanha e registra as demais configurações como pendentes.
- o domínio de inventário já contém carteira, estados de loadout e uma regra parcial de mochila. Essas decisões precisam ser auditadas e aprovadas; a interface não deve assumir que a regra provisória é definitiva.
- o VTT já tem fundações de terreno, pathfinding, objetos, seleção em grupo, imagens, cenas, painel de participantes, chat e dados 3D. As tarefas abaixo devem estender esses contratos, evitando subsistemas paralelos.

### Resultado da triagem

| Recorte | Quantidade |
|---|---:|
| Total de tarefas | 72 |
| Prontas | 35 |
| Prontas após dependência | 3 |
| Bloqueadas por regra, contrato ou referência indispensável | 34 |
| Em validação | 0 |
| P0 | 14 |
| P1 | 42 |
| P2 | 15 |
| P3 | 1 |

## 3. Dependências críticas

```text
CAMP-01 ──> CAMP-02

SESS-01 ──> SESS-02 ──> DASH-01
    └──────> CONT-04 ──> COMP-02

PRES-01 ──> PRES-02 ──> DASH-01 / PART-01

CONT-01 ──> CONT-02 ──> CONT-03
                 ├────> CONT-04
                 └────> COMP-01 ──> COMP-02

INV-01 ──> INV-02 ──> EQP-02

TOK-02 ──> TOK-03

CHAT-02 ──> CHAT-03

TIME-01 ──> TIME-02
ROLLTAB-01 ──> ROLLTAB-02
IMG-01 ──> IMG-02
LIGHT-01 ──> LIGHT-02
PLOT-01 ──> PLOT-02
```

## 4. Área autenticada

### AUTH-01 — Remover traçado do identificador de versão

- **Status:** Pronta (concluída)
- **Andamento (2026-09-20):** a premissa não se aplica mais — não há `text-stroke` nem `text-shadow` no identificador; o computado dá `0px`/`none`, e o que parece contorno é a Orbitron 900 espaçada. Dois achados reais no lugar: o subtítulo estava em **4.45:1** de contraste, abaixo do 4.5 que AA pede para texto pequeno (e ele está em 10px) — corrigido para 7.11:1; e a interface dizia `v0.0.1` enquanto o `package.json` já estava em `0.1.0`. **Decisão tomada** sobre a dúvida em aberto: a versão passa a vir do `package.json` via `next.config`, porque versão exibida que não corresponde ao que roda é pior que nenhuma — é o que se usa para relatar bug.
- **Descrição:** remover o efeito de traçado aplicado a “RUPTURA VTT ENGINE V0.0.1” no menu lateral, preservando legibilidade e hierarquia.
- **Área afetada:** shell global autenticado; CSS de identidade visual.
- **Prioridade sugerida:** P2
- **Dependências:** nenhuma.
- **Critérios de aceite:** texto sem `text-stroke` ou sombra equivalente a contorno; contraste AA; aparência verificada com sidebar aberta e recolhida.
- **Dúvidas antes da implementação:** o texto e a versão devem continuar fixos ou passar a vir do `package.json`/build?

### AUTH-02 — Unificar linguagem visual da área autenticada com o VTT

- **Status:** Pronta (parte estática concluída)
- **Decisão tomada (2026-09-20)** sobre “qual superfície do VTT é a referência”: o **chassi** (`_design/vtt-chassi.css`). Não foi escolha de gosto — `console.css` já documenta os próprios tokens como espelho dos `--rv-*` do chassi, então ele já era a fonte de fato.
- **`clip-path` em controle não era estilo, era defeito de acessibilidade.** Ele recorta TODA a pintura do elemento, inclusive o contorno de foco; os controles da área autenticada desenham o foco com `outline-offset` positivo, isto é, **fora** da região recortada. O canto chanfrado apagava o único sinal de onde o teclado está. Saiu de `.ra-btn`, `.ra-iconbtn`, `.ra-switch` e dos campos de formulário, substituído por `border-radius: var(--ra-r)`. As **11 regras decorativas** (selo da marca, cards, modal, moldura, vazio) continuam com o chanfro: ali ele é identidade visual e não há foco para comer.
- Raio em token (`--ra-r`, `--ra-r-sm`), com o comentário apontando a origem no chassi — a área autenticada não carrega aquela folha, então os valores são repetidos com o nome dizendo de onde vieram.
- Cinco critérios estáticos em `scripts/dev/check-auth-tokens-visuais.mjs`. O verificador remove comentários antes de contar: contar menção em comentário já produziu falso positivo duas vezes neste repositório.
- **Complemento a pedido do usuário (2026-09-20):** o chanfro saiu de **toda** a área autenticada, não só dos controles — na mesma tela, cards chanfrados com botões arredondados dentro era pior que qualquer um dos dois estados. Saíram 11 no `app.css` e 1 no `auth.css`, mais **um inline no TSX** (`ContaClient`), que escapara por a varredura só olhar folhas de estilo. Continuam por `clip-path` apenas as **formas**: o glifo hexagonal do estado vazio, o avatar hexagonal do Console e a célula que anima o próprio recorte para revelar progresso — remover esses não tiraria um canto, mudaria a figura. O check passou a medir **chanfro** (polígono que começa em `0 0`) em vez da presença de `clip-path`, e a varrer também os `.tsx`.
- **Dois defeitos achados ao renderizar** (`scripts/dev/check-casca-autenticada.ts`, 5 critérios): a marca é um `<a>` sem reset, e o navegador desenhava **sublinhado e tinta de link** nela — os filhos sobrescreviam a cor do texto, mas não a do sublinhado, então a linha saía roxa sob texto ciano, embaixo da versão. E os **cantos decorativos da viewport** (`.ra-vp-*`) foram removidos a pedido; não constavam do backlog.
- **A “duplicação de paleta” foi MEDIDA e é quase inexistente (2026-09-21).** Eu vinha repetindo que “a paleta continua com literais dos dois lados”, e o número desmente: `app.css` tem 44 literais hex distintos, `vtt.css` tem 101, e **apenas 4 aparecem nos dois** — `#123640`, `#eafcff`, `#d3f4ff` e `#f5a200`, em 15 ocorrências no total.

  Dos quatro, três não têm token em lugar nenhum. O quarto, `#f5a200`, tem (`--am`), e **não deve** ser substituído: no VTT ele aparece como a cor da **vertente Material** e como o **âmbar do terreno difícil**. São cores semânticas que por acaso compartilham o valor do acento da interface. Trocá-las por `var(--am)` acoplaria coisas que só têm o hex em comum — se o acento mudar, a vertente Material seguiria junto sem motivo. É o mesmo erro que já aconteceu neste repositório com `--rc-skill-cor` (contextual, verde no Corpo e roxo na Mente), e foi revertido por isso.

  **Conclusão: não há trabalho de deduplicação de paleta a fazer aqui.** O que resta de AUTH-02 é a conferência visual das telas, não código.
- **Descrição:** inventariar cores, raios, botões e superfícies de `app.css` e do VTT; criar ou reutilizar tokens/primitivos compartilhados; remover `clip-path` dos botões da área autenticada sem remover recortes decorativos que não sejam botões.
- **Área afetada:** `src/app/_design`, shell global, dashboard, conta, personagens e compêndio globais.
- **Prioridade sugerida:** P1
- **Dependências:** AUTH-01 apenas para validação visual conjunta, sem bloqueio técnico.
- **Critérios de aceite:** paleta e border radius documentados em tokens; nenhum botão da área autenticada usa `clip-path`; estados hover/focus/disabled equivalentes aos do VTT; duplicação de estilos reduzida; regressão visual coberta nas rotas globais.
- **Dúvidas antes da implementação:** qual superfície do VTT é a referência principal — chassi, painel lateral ou console? Recortes decorativos em cards devem permanecer?

### CAMP-01 — Persistir metadados de campanha

- **Status:** Bloqueada
- **Descrição:** ampliar o contrato de campanha para armazenar descrição e arte de capa, incluindo upload, referência ao asset, substituição e limpeza segura. A capa deve reutilizar a infraestrutura de imagens quando isso não misturar permissões ou ciclo de vida incompatíveis.
- **Área afetada:** banco, storage de imagens, tipos `Campaign`, Server Actions e dashboard.
- **Prioridade sugerida:** P0
- **Dependências:** decisão sobre política de arte; auditoria da infraestrutura de `vtt_image_assets`.
- **Critérios de aceite:** migration reversível; descrição nullable com limite validado; capa autorizada apenas ao narrador; asset órfão tratado; leitura disponível no dashboard e na campanha; fallback determinístico para campanha sem capa.
- **Dúvidas antes da implementação:** formatos, tamanho e proporção da capa? Recorte manual? Uma capa é compartilhada com a biblioteca de imagens? A descrição aceita texto simples ou formatação?

### CAMP-02 — Concluir modal de criação de campanha

- **Status:** Pronta após dependência
- **Descrição:** substituir o formulário de nome único por nome, descrição, arte de capa e prévia fiel do card; criar tudo em uma operação coerente e redirecionar para a campanha criada.
- **Área afetada:** dashboard “Minhas Campanhas”, modal, criação de campanha.
- **Prioridade sugerida:** P1
- **Dependências:** CAMP-01, AUTH-02.
- **Critérios de aceite:** validações inline; prévia atualizada enquanto se digita e escolhe a arte; estado de envio impede duplicidade; falha parcial não deixa campanha/asset órfão; sucesso redireciona para `/mesas/{id}`; foco e fechamento acessíveis.
- **Dúvidas antes da implementação:** a prévia usa exatamente o hero ou o card compacto? A capa é obrigatória? O usuário pode criar sem descrição?

### SESS-01 — Criar modelo canônico de sessão online explícita

- **Status:** Pronta (concluída)
- **Andamento:** migration 0137 aplicada. Tabela canônica de sessões com histórico, índice único de sessão ativa por campanha e RPC exclusiva do narrador. Teste transacional no PostgreSQL passou para início/fim, repetição, histórico, autorização, isolamento e confirmação obsoleta. Validação entre dois navegadores reais concluída em 2026-09-20 (`scripts/dev/check-campanha-sessao-online-live.ts`).
- **Descrição:** separar “há usuários conectados” de “o narrador abriu uma sessão”. Criar entidade/estado persistente com campanha, início, encerramento, autor, status e timestamps, com uma única sessão ativa por campanha.
- **Área afetada:** banco, autorização, realtime, contratos de campanha.
- **Prioridade sugerida:** P0
- **Dependências:** nenhuma; é fundação para dashboard e registros de sessão.
- **Critérios de aceite:** só narrador inicia/encerra manualmente; operação idempotente e protegida contra duas sessões ativas; jogadores leem o estado; refresh/reconexão preserva o estado; encerramento registra data/hora; presença nunca inicia a sessão. Encerramento automático segue a regra aprovada abaixo.
- **Dúvidas antes da implementação:** resolvidas pelo usuário: iniciar após encerramento cria nova sessão e preserva o histórico. Regra atual de encerramento automático substitui a permanência online indefinida: após 30 minutos sem jogadores conectados à campanha, encerrar se o narrador estiver ausente; se presente, dar 10 minutos para confirmar em modal. Sem resposta, encerrar; “Continuar” reinicia os 30 minutos; retorno de jogador antes do vencimento cancela aviso/contagem.
- **Automação (2026-09-20):** migration 0138 aplicada; pg_cron verifica a cada minuto, mesmo sem navegadores. Heartbeats autenticados a cada 30 segundos, com tolerância de 2 minutos para perda de conexão. A tolerância antecede o prazo de ausência; a execução periódica pode acrescentar até um minuto. Não usa a presença decorativa como autoridade. Testes transacionais cobrem prazos, retorno de jogador, confirmação duplicada/expirada, isolamento e permissões; dados de teste revertidos.

### SESS-02 — Adicionar controles de iniciar e encerrar sessão

- **Status:** Pronta (concluída)
- **Andamento:** controle no menu da mesa, estado consultável por ambos os papéis, confirmação de encerramento vinculada ao ID da sessão, bloqueio de envio repetido e feedback de falha. Provider compartilhado relê a fonte canônica por eventos da campanha, reconexão e retorno de foco. TypeScript aprovado; validação entre navegadores concluída.
- **Descrição:** expor ao narrador, dentro da campanha, o controle explícito da sessão e comunicar o estado atual aos jogadores. Integrar a mudança à fonte canônica e ao realtime existente.
- **Área afetada:** chassi da campanha/VTT, provider de campanha, feedbacks e logs.
- **Prioridade sugerida:** P0
- **Dependências:** SESS-01.
- **Critérios de aceite:** controle aparece apenas para narrador; confirmação adequada ao encerrar; todos os clientes atualizam sem recarregar; erro de sincronização é visível; ações repetidas não duplicam sessão; horário exibido usa timezone/localização de forma consistente.
- **Dúvidas antes da implementação:** decisões de interface adotadas: controle no menu da mesa e confirmação ao encerrar; sessão pertence à campanha e pode iniciar sem cena ativa.
- **Aviso automático:** modal independente do menu, exclusivo do narrador, com prazo vindo do servidor, “Continuar” e “Encerrar”, estados de hover/foco/erro e bloqueio de confirmação vencida. Não altera as tags de Narrador/Jogador. Teste do componente real em Chromium com ações simuladas aprovado para foco, teclado, confirmação, erro, expiração e largura de 320px. Agendador remoto com execução bem-sucedida confirmada. Validação integrada em dois navegadores reais **concluída em 2026-09-20** por `scripts/dev/check-campanha-sessao-online-live.ts` (narrador + jogador, contas e campanha de fixture, revertidas ao fim), com 10 critérios aprovados: estado inicial OFFLINE nos dois; controle visível só para o narrador; início repetido vira ONLINE no jogador sem recarregar e sem duplicar sessão; horário derivado de `started_at` em pt-BR e idêntico nos dois papéis; confirmação antes de encerrar, com "Voltar" não encerrando; falha de sincronização visível e nunca disfarçada de OFFLINE, com recuperação; encerramento confirmado e repetido propaga e grava um único fim; novo início cria sessão nova preservando a anterior; refresh preserva o estado para os dois papéis.

### DASH-01 — Derivar hero e atividade da sessão online real

- **Status:** Pronta (concluída)
- **Andamento:** hero conectado à sessão ativa mais recentemente iniciada, com desempate por ID da campanha. Sem sessão ativa, todas as campanhas permanecem no grid. Atividade recente usa data/hora do último início; contagem e descrição simuladas removidas do hero. Atualização ao retornar à aba e a cada 30 segundos visível. **2026-09-20:** contador real e tooltip entregues. A migration `0139_campaign_session_presence.sql` acrescenta a RPC `read_campaign_session_presence`, que devolve sessão e presença numa consulta só, medida pelos batimentos autenticados de 0138 (tolerância de 2 minutos) — nunca por presença decorativa. Devolve contagem e presença do narrador, jamais nomes: nomes seguem exclusivos do narrador em `get_campaign_participant_info`. Oito critérios transacionais aprovados em `scripts/dev/check-campaign-session-presence.mjs` (narrador fora de `player_count`, tolerância, membro inativo, isolamento de conta de fora, leitura que não grava batimento), e as seis combinações do tooltip mais o caso desconhecido em `scripts/dev/check-dashboard-participantes.mjs`. Leitura que falha exibe “—” e diz que não sabe, nunca “ninguém online”. Migration 0139 aplicada ao Supabase pelo usuário em 2026-09-20; os oito critérios transacionais foram repetidos contra a função aplicada. Verificação em navegadores reais aprovada em `scripts/dev/check-dashboard-participantes-live.ts` (9 critérios): o número sobe porque os jogadores realmente abrem a mesa, não por escrita direta — sem sessão não há hero mesmo com gente conectada; narrador sozinho conta 1; um jogador conta 2 no singular; dois contam 3 no plural; o `aria-label` repete a frase e o número fica `aria-hidden`; o jogador vê a mesma contagem; e encerrar a sessão tira o hero ainda com gente conectada. **Decisão de interface (2026-09-20):** o chip conta PESSOAS na mesa — narrador mais jogadores — e o tooltip decompõe o número. O ícone de pessoas é o que comunica isso; o usuário revisou os três estados renderizados e aprovou manter assim. Não confundir com contagem de jogadores: “2” com “1 jogador conectado” é o comportamento pretendido, não defeito. A integração com “Aparecer offline” foi entregue em PRES-02 (migration 0140): a contagem passou a filtrar quem está invisível, nos dois pontos que já estavam marcados na RPC. DASH-01 não tem mais pendências.
- **Descrição:** remover mocks do dashboard; mostrar hero somente para campanha com sessão ativa; ordenar/selecionar de forma determinística; usar o último início de sessão em “Atividade recente”; acrescentar tooltip gramatical de participantes com narrador, singular e plural.
- **Área afetada:** dashboard, queries agregadas, status/tooltip.
- **Prioridade sugerida:** P0
- **Dependências:** SESS-01, SESS-02, PRES-02 para respeitar “Aparecer offline”; CAMP-01 para descrição/capa reais.
- **Critérios de aceite:** sem sessão ativa não há hero “online”; múltiplas campanhas ativas seguem regra de seleção definida; atividade usa `started_at`, não `campaign.updated_at`; contagem exclui quem aparece offline; tooltip cobre narrador presente/ausente, zero, um e vários jogadores; loading/erro não se apresenta como “ninguém online”.
- **Dúvidas antes da implementação:** se houver várias campanhas online, qual vira hero? O próprio usuário invisível entra na contagem que ele vê? Quando o narrador está offline mas a sessão segue ativa, o texto deve dizer isso explicitamente?

### PRES-01 — Definir semântica de “Aparecer offline”

- **Status:** Pronta (matriz aprovada em 2026-09-20)
- **Descrição:** produzir e aprovar uma matriz de comportamento para preferência global, sessão ativa, lista de participantes, Rede, contadores, convite, autoria de chat e ações do narrador. Separar privacidade visual de autorização e de conexão real.
- **Área afetada:** produto, privacidade, presença global e por campanha.
- **Prioridade sugerida:** P0
- **Dependências:** respostas do responsável de produto.
- **Critérios de aceite:** matriz aprovada para narrador e jogador; definição de persistência por conta; definição de quem ainda pode ver o status real, se alguém; regras para alteração durante uma sessão; texto de interface aprovado.
- **Dúvidas antes da implementação:** respondidas pelo responsável de produto em 2026-09-20; a matriz abaixo é a regra aprovada.

#### Matriz aprovada de “Aparecer offline”

O princípio: **a preferência filtra a projeção pública de presença, e nada além dela.** Não muda autorização, não muda vínculo com a campanha, não muda o que a pessoa pode fazer.

| Superfície | Com “Aparecer offline” ligado |
|---|---|
| Preferência em si | Global por conta, no menu superior. Vale em todas as campanhas, abas e dispositivos, com efeito imediato. |
| Conexão real (batimentos) | Inalterada. A pessoa continua batendo normalmente; o que muda é quem enxerga o resultado. |
| Quem vê o status real | **Ninguém**, nem o narrador. Não há exceção de moderação nesta versão; qualquer apuração é administrativa, fora do produto. |
| Lista de participantes da campanha | Continua aparecendo, **como offline**. Segue membro; nada some do elenco. |
| Rede (dashboard) | Mesma regra: presente, como offline. |
| Contadores (hero e `player_count`) | **Não conta**, nem para quem está invisível. Existe uma contagem só, a pública. |
| Encerramento automático da sessão | **Não segura o prazo.** Se só restam pessoas invisíveis, a sessão entra nos 30 minutos normalmente. |
| Convite e vínculo | Inalterados. Convite é autorização, não presença. |
| Autoria de chat | Inalterada. Quem fala aparece com o próprio nome — falar é uma escolha, e a mensagem revela a presença. |
| Ações do narrador (controle, ficha, token) | Inalteradas. Autorização nunca depende de presença; esconder alguém não o desautoriza nem o autoriza. |
| Alterar durante uma sessão ativa | Permitido a qualquer momento, com efeito imediato. Ligar a preferência pode iniciar o prazo de encerramento se não sobrar nenhum jogador visível. |
| O que a própria pessoa vê | A projeção pública (sem si mesma) mais um aviso de que está aparecendo offline. |

**Consequência aceita:** quem está invisível pode ver a sessão encerrar por inatividade enquanto assiste. É o preço de esconder de todos sem abrir um canal de inferência — como a presença invisível não segura o prazo, a visão do narrador e o encerramento automático concordam. O aviso de interface precisa dizer isso, não só que a pessoa está escondida.

**Texto de interface aprovado:**

- Menu superior: `Aparecer offline`
- Aviso na mesa, para quem está com a preferência ligada: `Você está aparecendo offline. Ninguém vê que você está aqui — nem o narrador — e sua presença não segura a sessão aberta.`

### PRES-02 — Implementar preferência global e filtro de presença

- **Status:** Pronta (concluída)
- **Andamento (2026-09-20):** migration `0140_aparecer_offline.sql` cria `user_presence_preferences` (uma linha por conta, RLS que só alcança a própria linha) e a função interna `presence_hidden`, não concedida a `authenticated` — saber quem está escondido nunca vira consulta que um cliente possa fazer sobre outra pessoa. `read_campaign_session_presence` passa a filtrar narrador e jogadores; `evaluate_campaign_session_timeout` deixa de contar jogadores invisíveis no prazo. O ramo do narrador continua medido pela conexão real de propósito: ele não projeta presença para ninguém, só decide se há alguém para confirmar “Continuar”, e um narrador invisível que perdesse o próprio aviso veria a sessão morrer sem ser perguntado. Interface: item `Aparecer offline` no menu de perfil, etiqueta do topo deixando de dizer “Online” fixo, e aviso na mesa com as duas frases da matriz. Dez critérios transacionais aprovados em `scripts/dev/check-aparecer-offline.mjs`, incluindo não-regressão do prazo com jogador visível. Migration 0140 aplicada ao Supabase pelo usuário em 2026-09-20 e os dez critérios transacionais repetidos contra ela. Verificação em navegadores reais aprovada em `scripts/dev/check-aparecer-offline-live.ts` (9 critérios): padrão desligado; ligar pelo menu grava e apaga a etiqueta do topo; a preferência já nasce ligada em outro navegador da mesma conta; o jogador escondido sai da contagem do narrador e da própria; o aviso na mesa diz as duas frases; quem está visível não recebe aviso; e desligar devolve a presença. As suítes de SESS-02 e DASH-01 foram repetidas sem regressão.
- **Descrição:** adicionar “Aparecer offline” ao menu superior, persistir por conta e aplicar a preferência às projeções públicas de Presence sem usar esse estado para autorização ou gameplay.
- **Área afetada:** conta/preferências, menu global, Supabase Presence, dashboard, participantes e Rede.
- **Prioridade sugerida:** P0
- **Dependências:** PRES-01.
- **Critérios de aceite:** preferência sincroniza entre dispositivos; ativar/desativar atualiza clientes conectados; projeções respeitam a matriz aprovada; nenhuma permissão muda; falhas não vazam presença real; testes cobrem múltiplas abas e campanhas.
- **Dúvidas antes da implementação:** respondidas em PRES-01.

### NET-01 — Tornar itens da Rede navegáveis para perfis

- **Status:** Pronta (concluída)
- **Correção de premissa (2026-09-20):** a dependência “localizar e extrair o abridor de perfil do VTT” partia de algo inexistente. Não havia perfil de usuário em lugar nenhum do projeto: o VTT só tinha a lista de “Jogadores e convites”, com nome, papel e remover, nada clicável. Não havia o que extrair; houve o que criar. O padrão de “modal com URL” foi reaproveitado da ficha (rota interceptada em `@modal`), em vez de inventado.
- **Decisões de produto (2026-09-20):** o perfil mostra nome, presença real, campanhas EM COMUM e os personagens da pessoa nelas — nada de biografia ou avatar, que exigiriam coluna, upload e moderação. A própria linha abre o próprio perfil, como os outros o veem, com atalho para “Conta e preferências”. O perfil tem URL própria e abre em modal dentro de /mesas.
- **Andamento:** migration `0141_perfil_de_usuario.sql` acrescenta `read_user_profile` e `read_network_presence`, ambas aditivas. A regra de quem vê quem mora na RPC: só se vê o perfil de quem compartilha ao menos uma campanha, e só as campanhas compartilhadas com quem pergunta aparecem — o perfil não vira índice das outras mesas da pessoa. E-mail não sai por ali; segue exclusivo do narrador em `get_campaign_participant_info`. A presença respeita “Aparecer offline”. O painel Rede deixa de mostrar “Online” fixo para a própria conta e “offline” fixo para o resto, e cada linha vira link de verdade. Dez critérios transacionais aprovados em `scripts/dev/check-perfil-de-usuario.mjs`. Migration 0141 aplicada ao Supabase pelo usuário em 2026-09-20 e os dez critérios transacionais repetidos contra ela. Verificação em navegadores reais aprovada em `scripts/dev/check-perfil-rede-live.ts` (11 critérios): a Rede lista com presença real; a própria conta aparece uma vez só, marcada; clicar abre modal com a URL mudando e o dashboard montado por baixo; o perfil traz campanha, papel, personagem e presença; voltar fecha; o mesmo endereço numa aba nova abre página cheia; o próprio perfil abre igual, com atalho para Conta; a linha inteira responde a Enter; “Aparecer offline” chega à Rede e ao perfil; e quem não compartilha campanha recebe recusa explícita, não um perfil vazio. As suítes de SESS-02, DASH-01 e PRES-02 foram repetidas sem regressão.
- **Descrição:** transformar cada pessoa em elemento interativo, mantendo a composição atual, com hover/focus claro e abertura do mesmo perfil usado pelo VTT.
- **Área afetada:** painel Rede do dashboard; modal/rota de perfil compartilhado.
- **Prioridade sugerida:** P1
- **Dependências:** localizar e extrair o abridor de perfil do VTT; PRES-02 para status exibido.
- **Critérios de aceite:** linha inteira clicável e acionável por Enter/Espaço; hover e focus visíveis sem mudar o layout; abre perfil correto; usuário atual segue regra definida; estado offline não impede abertura; sem duplicar modal ou query de perfil.
- **Dúvidas antes da implementação:** o próprio usuário deve abrir o próprio perfil ou a tela de conta? Perfis têm URL compartilhável ou devem continuar em modal?

## 5. Estrutura principal da mesa

### NAV-01 — Revisar arquitetura de informação do menu principal

- **Status:** Bloqueada
- **Descrição:** definir mapa de navegação, papel e destino de Personagens, Novo personagem, Bando, Compêndio, Participantes, Mercado, Livro, Jogadores e convites, Conteúdo da campanha e Configurações. O objetivo é remover sobreposição entre painel, janela e rota antes do redesenho visual.
- **Área afetada:** menu/chassi do VTT, painel lateral e janelas administrativas.
- **Prioridade sugerida:** P1
- **Dependências:** decisões de produto sobre Compêndio/Conteúdo (CONT-01 e COMP-01), Bando (BANDO-01) e Configurações (SET-01).
- **Critérios de aceite:** mapa por papel aprovado; cada item tem rótulo, ícone, destino, disponibilidade e comportamento responsivo; itens duplicados/conflitantes resolvidos; ordem e agrupamentos documentados.
- **Dúvidas antes da implementação:** quais itens ficam sempre visíveis para jogadores? “Novo personagem” é item permanente ou ação dentro de Personagens? Livro e Compêndio permanecem separados por qual função?

### NAV-02 — Tornar Mercado uma ferramenta geral da campanha

- **Status:** Bloqueada
- **Descrição:** desacoplar a abertura do Mercado de um personagem específico. A seleção de comprador/carteira, quando necessária, deve acontecer dentro do fluxo de compra e respeitar personagens controlados.
- **Área afetada:** Janela Mercado, menu principal, inventário e permissões.
- **Prioridade sugerida:** P1
- **Dependências:** INV-01 para regras definitivas de item; NAV-01 para posição no menu.
- **Critérios de aceite:** Mercado abre sem personagem ativo; catálogo pode ser consultado por papel autorizado; compra exige seleção explícita de destinatário e carteira; não permite operar personagem não controlado; logs identificam comprador e destinatário.
- **Dúvidas antes da implementação:** jogadores podem comprar sem sessão online? Narrador compra para qualquer personagem? Existe estoque/preço por campanha ou apenas catálogo global?

### SET-01 — Especificar configurações definitivas da mesa

- **Status:** Bloqueada
- **Descrição:** definir seções, campos, permissões, padrões e efeitos das configurações da mesa, partindo do único campo atual — nome — e incluindo ao menos criação de personagem, convites e preferências relacionadas às novas ferramentas.
- **Área afetada:** configurações, campanha, convites, permissões e VTT.
- **Prioridade sugerida:** P1
- **Dependências:** decisões do responsável de produto; resultados de NAV-01, SESS-01 e PRES-01.
- **Critérios de aceite:** especificação versionada; cada configuração tem dono, tipo, default, escopo e efeito; mudanças sensíveis têm confirmação/auditoria; migração de campanhas atuais definida.
- **Dúvidas antes da implementação:** jogadores podem criar PJ livremente? Quem pode convidar/remover? Quais ajustes são por campanha, cena, usuário ou dispositivo? Há configurações bloqueadas durante sessão online?

## 6. Conteúdo e memória da campanha

### CONT-01 — Definir taxonomia do organizador de campanha

- **Status:** Pronta (taxonomia aprovada em 2026-09-20)
- **Descrição:** especificar os tipos narrativos — sessão, anotação, handout, NPC, lugar, loja e “outros” — e separar esse domínio do conteúdo de regras oficial/override/homebrew já existente.
- **Área afetada:** produto, modelo de dados, Conteúdo da campanha e Compêndio.
- **Prioridade sugerida:** P0
- **Dependências:** aprovação do responsável de produto.
- **Critérios de aceite:** campos comuns e específicos por tipo; relações permitidas; política de anexos; estados de rascunho/publicação/arquivamento; busca, ordenação e categorias; estratégia de migração/convivência com `campaignContent` atual.
- **Dúvidas antes da implementação:** respondidas pelo responsável de produto em 2026-09-20; a especificação abaixo é a regra aprovada.

#### Taxonomia aprovada do organizador de campanha

**Achados do código que moldaram estas decisões:**

- `content_type` (0001) é enum de **regras** — item, magia, runa, talento, condição. O domínio narrativo não entra ali, e a separação que esta tarefa pedia já é natural: tabelas próprias, sem tocar `campaign_content_documents`.
- **Não existe entidade de loja.** O Mercado nunca foi tela nem catálogo: é a Loja do Mercado Noturno dentro da aba Inventário da ficha, operando sobre a carteira de um personagem. Não havia o que “referenciar”.
- **PN não é tabela separada:** é `characters` com `payload.metadados.tipo_personagem === "pn"`.
- Anexo de imagem já tem pipeline: bucket privado por campanha, WebP, teto de 10MB, SVG e GIF recusados por decisão explícita (0099).

**Tipos (cinco):** `sessao`, `anotacao`, `handout`, `npc`, `lugar`.

- **“Outros” não existe.** Tipo curinga vira maioria e deixa de classificar. O que não se encaixa é `anotacao` com **etiquetas livres** criadas pelo narrador (`regra-caseira`, `nomes`, `trilha`), e se filtra por etiqueta.
- **Loja fica de fora** e vira tarefa própria (ver SHOP-01). Loja de verdade quer catálogo, estoque, preço e vínculo com carteira — do tamanho de INV, não um tipo de texto.

**Campos comuns a todos os tipos:**

| Campo | Regra |
|---|---|
| `id`, `campaign_id` | Isolamento por campanha, como todo o resto. |
| `tipo` | Um dos cinco. Não muda depois de criado (mudar tipo é criar outro item). |
| `titulo` | Obrigatório, exceto em `handout`, que pode ser só a imagem. |
| `corpo` | Texto longo, opcional. |
| `etiquetas` | Lista livre de texto, criada pelo narrador. É o que substitui “outros”. |
| `estado` | `rascunho`, `publicado` ou `arquivado`. |
| `criado_por`, `criado_em`, `atualizado_em`, `arquivado_em` | Auditoria mínima. |

**Campos específicos por tipo:**

| Tipo | Específico |
|---|---|
| `sessao` | `acontecida_em` (data/hora, passada ou futura) e `online_session_id` opcional, apontando para `campaign_online_sessions` — é o encaixe que CONT-04 vai usar para gerar o registro automático. |
| `anotacao` | Nenhum. É o tipo genérico, e é de propósito que ele não tenha campo próprio. |
| `handout` | Título opcional; existe para carregar anexo. |
| `npc` | `character_id` opcional, apontando para uma ficha PN. Todo NPC é texto; quem merece ficha ganha o vínculo. |
| `lugar` | Nenhum. Hierarquia (bairro dentro de cidade) se resolve por relação, não por campo. |

**Relações:** muitos-para-muitos, **simétricas e sem papel** — qualquer item se relaciona com qualquer item, inclusive do mesmo tipo (`lugar` com `lugar` aninha; `npc` com `lugar` situa; `sessao` com qualquer coisa registra o que apareceu). Uma matriz de pares permitidos seria decorada por ninguém e viraria obstáculo na hora de anotar.

**Anexos:** só imagem, reusando inteiramente o pipeline do VTT — bucket privado por campanha, conversão para WebP, teto de 10MB, SVG e GIF recusados. Qualquer tipo pode ter anexo (um `lugar` com mapa), e `handout` é o tipo cujo sentido é o anexo. PDF e arquivo arbitrário ficam fora: PDF é formato ativo, como o SVG já recusado, e aceitá-lo exigiria bucket novo e refazer o raciocínio de segurança.

**Estados:**

- `rascunho` — só o narrador vê, sempre, independentemente de qualquer regra de visibilidade;
- `publicado` — sujeito à visibilidade que CONT-02 definir;
- `arquivado` — sai das listas, continua achável com filtro explícito, e volta atrás. Arquivar **não** apaga. Excluir de vez existe à parte, só para o narrador, com confirmação, e leva as relações junto.

**Busca, ordenação e categorias:**

- busca por título e corpo; filtros por tipo, etiqueta e estado;
- ordenação padrão por `atualizado_em` decrescente; alternativas por título e, em `sessao`, por `acontecida_em`;
- não há pastas. As “categorias” são os cinco tipos mais as etiquetas livres — duas formas de organizar já são uma a mais do que o necessário.

**Convivência com `campaignContent`:** domínios separados, sem migração de dados — nada de narrativo existe hoje, então não há o que converter. O organizador narrativo **não** entra em `content_type` nem em `campaign_content_documents`, e nesta primeira versão também não referencia conteúdo de regras: citar um item homebrew dentro de uma anotação fica para depois, quando houver demanda real.

### CONT-02 — Implementar armazenamento e autorização do conteúdo narrativo

- **Status:** Pronta (concluída)
- **Descrição:** criar o modelo persistente, queries e mutações para itens narrativos, relações, anexos e visibilidade, com isolamento entre campanhas.
- **Área afetada:** banco, RLS, Server Actions, realtime e storage.
- **Prioridade sugerida:** P0
- **Dependências:** CONT-01.
- **Nota (2026-09-20):** CONT-01 está concluída — a taxonomia deixou de ser o bloqueio. O que falta aqui são as dúvidas próprias listadas abaixo.
- **Critérios de aceite:** narrador cria/edita/arquiva; jogadores leem somente conteúdo revelado e suas próprias notas quando aplicável; mudança de visibilidade é atômica e auditável; anexos seguem a mesma autorização; testes negativos entre campanhas.
- **Dúvidas antes da implementação:** respondidas em 2026-09-20. **Visibilidade:** binária por padrão — publicado é da mesa toda — com exceção por jogador quando o narrador quer o segredo de um só. Não se inventou entidade “grupo”: ela não existe no projeto (“dividir o grupo”, 0118, é atribuição individual a cenas), e `campaign_members` já bastava. Isso responde também a parte de CONT-05. **Agendamento:** não existe; revelar é gesto da cena, não relojoaria. **Comentários:** o jogador PODE comentar, e as regras de autoria vão junto (abaixo).
- **Andamento (2026-09-20):** migration `0142_conteudo_narrativo.sql`, aditiva — cinco tabelas, dois enums e uma função, sem tocar em nada existente. Decisões que o schema aplica, e não apenas documenta:
  - **Uma pergunta, uma função:** `narrativa_pode_ver` é o único lugar onde “quem vê o quê” é decidido, e toda política daqui a consulta. Repetir o predicado por tabela é como as regras divergem (mesma lição da 0118). As Server Actions também não refiltram: filtrar de novo na aplicação seria uma segunda implementação da regra.
  - **Lista de exceções vazia = a mesa toda vê**, e não “ninguém vê”. Por isso revelar para todos é apagar as exceções, e não inserir uma linha por jogador: com linhas por jogador, quem entrasse na campanha depois ficaria de fora sem ninguém perceber.
  - **O jogador não lê a lista de exceções** — saber quem mais recebeu o segredo já é parte do segredo.
  - **Relação simétrica de verdade:** o par é guardado ordenado com `check (entry_a < entry_b)`, então (a,b) e (b,a) são a mesma linha. E só aparece quando os DOIS lados são visíveis, senão a ponta visível denunciaria a existência do rascunho do outro lado.
  - **Comentário:** comenta e lê quem enxerga o item. A autoria não vem do cliente (`autor_id = auth.uid()` no insert). O autor edita e apaga o que é seu; o narrador apaga qualquer um, porque a mesa é dele, mas **não edita** a fala de ninguém.
  - **Arquivar não apaga**, e `check ((estado = 'arquivado') = (arquivado_em is not null))` impede arquivado sem data.
  - Anexo é ponte para `vtt_image_assets` com FK composta `(id, campaign_id)` — sem bucket novo, sem mime novo, e sem aceitar imagem de outra campanha.
  - Quinze critérios transacionais aprovados em `scripts/dev/check-conteudo-narrativo.mjs`, incluindo recusa do tipo `loja` pelo enum, isolamento entre campanhas nos dois sentidos e os negativos de comentário.
  - **Correção durante a própria tarefa:** a 0142 deixava a troca de visibilidade a cargo do cliente — apagar as exceções e inserir as novas, em duas instruções. Falhar entre elas deixa a lista vazia, que nesta modelagem significa “a mesa toda vê”: a falha REVELAVA. A migration `0143_narrativa_visibilidade_atomica.sql` transforma as duas numa RPC só e acrescenta o histórico que o critério “atômica e auditável” pedia — quem mudou, quando, e de quê para quê, legível só pelo narrador, porque o histórico contém exatamente a lista que os jogadores não podem ver. Revelar para quem não é da campanha passou a ser recusa explícita, e a recusa preserva a exceção anterior em vez de esvaziar a lista.
  - Dezenove critérios transacionais no total, aprovados contra as migrations aplicadas.
  - Server Actions em `src/lib/campaign/narrativeActions.ts`, prontas para CONT-03.
- **Correção descoberta por CONT-03 (0145):** a política de leitura da 0142 chamava `narrativa_pode_ver(id)`, que relê a própria tabela. Num `INSERT ... RETURNING` — que é como o cliente cria e recebe a linha de volta — a linha em inserção ainda não está visível para uma subconsulta do mesmo comando: a função não a encontrava e a política concluía que ninguém podia vê-la. **O narrador era barrado da própria criação.** Os testes transacionais não pegaram porque inseriam sem RETURNING. A regra continua num lugar só: passou a viver em `narrativa_pode_ver_valores`, que recebe os valores da linha em vez de procurá-la, e `narrativa_pode_ver(id)` virou casca fina para as tabelas de relação, anexo e comentário, onde a busca é legítima porque a linha é de outra tabela. O check agora cria das duas formas — 21 critérios.
- **Concluída em 2026-09-20:** migrations 0142, 0143 e 0145 aplicadas; 21 critérios transacionais aprovados; Server Actions exercitadas de ponta a ponta pela interface de CONT-03.
- **Fora de escopo, registrado:** notificação de comentário novo não existe; o comentário aparece quando a pessoa abre o item. Se virar necessidade, é entrada própria.

### CONT-03 — Criar interface de organização para o narrador

- **Status:** Pronta (concluída)
- **Descrição:** substituir a lista genérica pela ferramenta de organização baseada na taxonomia aprovada, sem perder o editor técnico de regras já existente — ele deve ficar em destino explicitamente separado.
- **Área afetada:** janela Conteúdo da campanha, navegação interna, busca e editor.
- **Prioridade sugerida:** P1
- **Dependências:** CONT-01, CONT-02, NAV-01.
- **Critérios de aceite:** criar, editar, filtrar, relacionar, arquivar e localizar itens; estados de visibilidade evidentes; ação revelar/ocultar disponível na lista e no detalhe; confirmação para ações destrutivas; editor de regras continua acessível sem ambiguidade.
- **Decisões de produto (2026-09-20):** **lista com filtros** (tipo, etiqueta, estado, busca) e detalhe ao lado — não árvore, porque a taxonomia de CONT-01 não tem hierarquia e desenhar uma obrigaria a inventar um pai para cada item. **Sem modelos por tipo** no primeiro corte: os campos por tipo já guiam, e texto pré-preenchido é palpite sobre como o narrador escreve. **Sem ordenação manual**: por atualização, título ou data da sessão, como CONT-01 especificou. A pergunta sobre pastas já estava respondida em CONT-01 e não foi re-litigada.
- **Fatia de NAV-01 decidida aqui:** “Conteúdo da campanha” era o editor TÉCNICO de regras — biblioteca, homebrew, override, diff de três vias — e o nome não dizia isso. Com o organizador ao lado, a ambiguidade viraria engano toda vez. São **duas janelas com nomes distintos**: `Organizador` e `Regras da campanha`. Isso não resolve NAV-01, que segue bloqueada por COMP-01, BANDO-01 e SET-01 — resolve só a ambiguidade que CONT-03 criaria.
- **Andamento:** janela em `_painel/janelas/organizador/`, exclusiva do narrador. Criar os cinco tipos, editar com salvamento explícito, filtrar, buscar por título e corpo, relacionar, revelar à mesa ou só a pessoas escolhidas, arquivar, desarquivar e excluir com confirmação que distingue de arquivar. O selo de estado aparece em cada linha, não só no detalhe: o narrador vê rascunho e publicado na mesma lista, e sem o selo não dá para saber o que a mesa já leu. Dezesseis critérios aprovados em navegador real (`scripts/dev/check-organizador-live.ts`), incluindo que o editor de regras continua abrindo em janela própria e que o jogador não tem o organizador no menu. Suítes de SESS-02, NET-01 e PRES-02 repetidas sem regressão.
- **Defeito corrigido durante a tarefa:** a janela engolia os erros das ações — `agir` recarregava a lista logo depois, e o recarregamento limpava a mensagem antes de alguém ler. Foi o que escondeu o defeito de RLS acima por várias execuções. Agora a operação devolve a falha e o erro é gravado depois do recarregamento.

### CONT-04 — Gerar registro automático de sessão

- **Status:** Pronta (concluída)
- **Descrição:** ao iniciar uma sessão online, criar exatamente uma entrada narrativa de sessão; ao encerrar, completar datas e participantes efetivos segundo regra aprovada.
- **Área afetada:** sessão online, conteúdo narrativo, presença/roster e logs.
- **Prioridade sugerida:** P0
- **Dependências:** SESS-01, CONT-02, PRES-01.
- **Critérios de aceite:** criação idempotente; início/fim vinculados à sessão canônica; participantes registrados sem depender apenas do snapshot final; entrada não duplica em reconexão; correção manual pelo narrador fica auditada; privacidade respeita a regra de presença.
- **Decisões de produto (2026-09-20):** participante é **quem esteve conectado em qualquer momento**, com primeiro e último visto guardados — em vez de um tempo mínimo arbitrário decidir por quem passou rápido. **Quem está com “Aparecer offline” não entra**, por coerência com PRES-01: se a pessoa se escondeu de todos, o registro não pode contá-la depois, senão esconder-se ao vivo apenas adiaria a revelação até o fim da sessão. **O registro nasce rascunho**, revelado quando o narrador quiser.
- **O narrador entra sempre**, mesmo invisível, porque entra como AUTOR e não como presença — uma sessão sem narrador não aconteceu. Consequência registrada: se ele estiver invisível e depois revelar o registro, os jogadores saberão que estava lá. Como controla as duas pontas, a invisibilidade e a revelação, é escolha dele e não vazamento imposto.
- **Andamento:** migration `0146_registro_automatico_de_sessao.sql`. **Por que acumular em vez de fotografar no fim:** `campaign_session_heartbeats` guarda uma linha por pessoa, sobrescrita a cada batimento — depois que a sessão acaba, quem passou por ela não está em lugar nenhum, e uma foto do fim registraria só quem ficou até o fim, que é o que o critério proíbe. A participação passa a ser acumulada em `campaign_session_participants` a cada batimento. A entrada nasce dentro de `set_campaign_online_session`, e a unicidade é garantida por índice — não por disciplina de quem chama. Correção manual do narrador marca `origem = 'manual'` e escreve em `campaign_session_participants_log`: distinguir o que o sistema VIU do que alguém afirmou depois é o que dá valor ao registro. A lista segue a visibilidade da própria entrada, pela mesma `narrativa_pode_ver` — rascunho é só do narrador. Quinze critérios transacionais (`scripts/dev/check-registro-de-sessao.mjs`) e dez em navegador real (`scripts/dev/check-registro-sessao-live.ts`). Suítes de CONT-02, CONT-03 e SESS-02 repetidas sem regressão.
- **Defeito corrigido durante a tarefa:** a lista de participantes exibia “Conta sem nome” enquanto o elenco estava em trânsito. “Conta sem nome” é um nome REAL, que o servidor devolve para quem nunca escolheu um — dizê-lo sobre alguém que tem nome, só porque a resposta não chegou, é afirmar algo falso. O componente passou a distinguir “ainda não sei” de “não tem nome”.

### CONT-05 — Integrar material privado do narrador e material revelado

- **Status:** Bloqueada
- **Descrição:** permitir que o mesmo item tenha uma fonte privada do narrador e uma projeção controlada para jogadores, evitando cópias divergentes quando conteúdo é revelado ou ocultado.
- **Área afetada:** Conteúdo da campanha, Compêndio, autorização e versionamento.
- **Prioridade sugerida:** P1
- **Dependências:** CONT-01, CONT-02, COMP-01.
- **Critérios de aceite:** revelar não duplica o item; ocultar remove acesso futuro sem apagar histórico autorizado, conforme regra aprovada; alterações posteriores seguem política explícita; interface mostra exatamente o que cada público verá.
- **Dúvidas antes da implementação:** jogadores veem atualização automática depois da revelação? Ocultar remove acesso a um item já visto? O narrador pode revelar só parte de um item ou para jogadores selecionados?

### SHOP-01 — Especificar e implementar lojas da campanha

- **Status:** Bloqueada
- **Origem:** desdobrada de CONT-01 em 2026-09-20. “Loja” estava na lista de tipos narrativos, mas não havia entidade alguma para referenciar: o Mercado é a Loja do Mercado Noturno dentro da aba Inventário da ficha, operando sobre a carteira de um personagem — não é tela, catálogo nem cadastro. Tratar loja como texto criaria um tipo que parece funcional e não é, e que brigaria com a loja de verdade depois.
- **Descrição:** definir e implementar loja como entidade própria: catálogo de itens, estoque, preço, disponibilidade e a relação com inventário e carteira.
- **Área afetada:** banco, inventário, carteira, Mercado, organizador de campanha.
- **Prioridade sugerida:** P2
- **Dependências:** INV-01 (taxonomia e regras de mochila) e INV-02; a loja movimenta o inventário que essas tarefas definem.
- **Critérios de aceite:** narrador cria loja com catálogo próprio; preço e estoque são do narrador; compra debita carteira e credita inventário numa operação só; estoque esgotado é recusado no servidor; loja se relaciona com um `lugar` do organizador; isolamento entre campanhas testado.
- **Dúvidas antes da implementação:** estoque é finito ou ilimitado por padrão? Preço pode divergir do preço base do item? Jogador compra sozinho ou o narrador aprova? Loja pode vender item homebrew da campanha? Vender de volta existe, e a que preço?

### RT-01 — Terreno pintado não chega pelo Realtime

- **Status:** Pronta (concluída — causa encontrada e corrigida em 2026-09-20)
- **Prioridade:** era P1.

**O defeito.** Terreno pintado durante a sessão não chegava a ninguém além de quem pintou. Medido pelo caminho do produto — narrador pinta pela ferramenta Terreno, jogador com a mesa já aberta:

| quem | antes | depois |
|---|---|---|
| narrador (quem pintou) | vê em 502ms | vê |
| jogador, sessão já aberta | **não vê em 10s** | **vê em 1176ms** |
| jogador após recarregar | vê em 8ms | vê |

Era o pior arranjo: quem pinta vê, e por isso não desconfia. O narrador bloqueava um corredor, enxergava o bloqueio, e os jogadores seguiam movendo tokens por ali — a regra consultiva de movimento depende de um terreno que o cliente deles não tinha.

**A causa.** O Realtime recusa QUALQUER filtro em `vtt_scene_images`:

> `Unable to subscribe to changes with given parameters. Exception: ERROR P0001 (raise_exception) invalid column for filter scene_id`

O mesmo erro sai com `campaign_id`, então não é a coluna — é a tabela. As duas colunas existem, estão publicadas e a tabela tem replica identity FULL, o que aponta para o cache de esquema do serviço de Realtime, não para o banco.

**E o estrago não ficava nessa ligação.** Todas as assinaturas de `postgres_changes` do canal `campaign:<id>:vtt` vivem no MESMO canal, e uma ligação recusada derruba o canal inteiro: terreno, marcas, medições, áreas, objetos e cenas paravam juntos, sem erro visível em lugar nenhum.

**A correção.** A ligação de `vtt_scene_images` perde o filtro do servidor e passa a recortar a cena no cliente — o mesmo padrão que o handler de terreno já usava. Verificado: zero erros de assinatura, terreno em 1176ms e área em 319ms, sem reload. `check-vtt-pegada-reparo`: 35 ok, 0 falhas.

**Risco que fica registrado, e ainda não endereçado:** um canal único com nove ligações de `postgres_changes` é frágil por construção — qualquer ligação futura que o Realtime recuse volta a derrubar tudo, em silêncio. Vale separar por assunto, ou pelo menos afirmar num check que o canal assinou sem erro. Fica como candidato a tarefa própria.

### ALCA-01 — `check-vtt-alca-rotacao` verificava a coluna errada

- **Status:** Concluída (reescrito em 2026-09-21; os 3 critérios restantes fechados em 2026-09-22, e um deles era defeito de produto — ver CART-01)

**O que era.** O check afirmava, em 54 critérios, que a alça muda `orientacao` (a FORMA da pegada). Medido: depois de um clique, `orientacao=0` intacta e `direcao=1`. A revisão sobe, o que fazia parecer rotação salva e revertida.

**Decisão do usuário:** reescrever, não aposentar — a cobertura de undo/redo por gesto, teclado e alvo de toque não existe em nenhum outro lugar.

**O que a reescrita fez:**

1. Toda leitura do resultado do gesto passou para `direcao`, inclusive as escritas diretas que simulam "alguém mudou por fora". O halo lê `token.direcao` (`orientacaoExibida` em `MapaHex`), então é essa coluna que ele reflete.

2. **Seis critérios foram APOSENTADOS**, e não por ajuste de coluna: a alça **não tem mais estado inválido**. `MapaHex` monta o gesto com `valida: true` fixo, ao iniciar e a cada passo, e o comentário ao lado diz por quê — *"Nunca vermelho: virar não pode ser recusado"*. Eram os critérios de prévia inválida por colisão (10/10b), por borda (11/11b) e por terreno bloqueado (12/12b). Girar a FORMA continua podendo ser recusado, mas isso é ação de menu e quem cobre é `check-vtt-pegada-reparo`.

3. O critério 22-9 parou de **refazer a conta do produto**. Ele derivava o alvo como "origem + 2 passos" e comparava com o ângulo do halo; quando os dois discordavam não dava para saber quem errou. Agora lê `aria-valuenow` da alça — que é o que o app diz estar desenhando — e compara com isso.

4. `girarPorTecla` passou a devolver `gravou`. O teto de espera era 5s e, ao estourar, a função devolvia valores velhos calada: a comparação falhava com "revisão 3→3", que parece tecla ignorada pelo produto e era o teste desistindo de esperar.

**Resultado:** de 34 ok / 20 falhas para **43–46 ok / 2–5 falhas**, oscilando entre execuções.

**Os três que faltavam (fechados em 2026-09-22).** A oscilação entre execuções não era tempo — era o cartão de hover:

- **8 e 22-9** tinham a mesma causa, e era **defeito de produto**: o cartão de hover se posicionava em cima da alça de rotação e engolia o `pointerdown`. Está descrito em CART-01. Os dois critérios estavam certos e o produto estava errado; a intermitência vinha de o cartão cobrir ou não a alça conforme a orientação do token no momento.
- **22-15/16** media a coisa errada. O critério contava requisições de rede durante o hover e exigia zero, mas o cartão passou a LER os recursos do token no instante em que o ponteiro entra, de propósito ("os 420ms de espera do hover viram tempo de rede grátis"). Contar requisição não distingue leitura de escrita. O que o critério existe pra garantir é que passar o mouse não MUDE o token — agora é isso que ele mede, comparando a linha do token antes e depois.

**Resultado final:** 48 ok, 0 falhas, estável em execuções seguidas.

### CART-01 — Cartão de hover cobria a alça de rotação

- **Status:** Concluída (encontrada e corrigida em 2026-09-22)
- **Prioridade:** era P1.

**O defeito.** A alça de rotação fica além da aresta frontal do token; o cartão de hover é ancorado acima do disco. Quando o token olha pra cima, os dois ocupam o mesmo lugar — e o cartão é HTML `position: fixed` (z-index 60) sobre um mapa em SVG, então ele ganha sempre.

Com o cartão aberto, **girar aquele token com o mouse era impossível**: o `pointerdown` destinado à alça chegava no cartão. E como o cartão tem os botões de PV/PE/Mana, a pressão podia cair num deles e **mudar um recurso no lugar de girar o token**.

A regra já estava escrita em `VttClient` e só não valia para a alça: *"um gesto de mapa tira o cartão da frente na hora: ele é ajuda passiva, nunca obstáculo"*.

**A correção, em três partes** — há dois caminhos até a alça e eles falham diferente:

1. `CartaoTokenHover` não se posiciona mais em cima da alça: já escolhia entre acima/abaixo por espaço de tela, agora também desvia por colisão.
2. Pousar na alça fecha o cartão. Sem isso, chegar pela alça abria o cartão em cima dela, e o ponteiro passava a estar sobre o cartão — que se mantinha aberto sozinho.
3. Esse fechamento é imediato. A carência de 200ms existe pra deixar o ponteiro viajar do token até o cartão; num controle que está debaixo dele, 200ms basta pro clique ser comido — foi o que aconteceu na primeira tentativa de conserto.

**Como apareceu.** O critério 8 de `check-vtt-alca-rotacao` dizia "revisão 2→2", que se lê como a RPC de rotação não ter sido chamada. `elementFromPoint` no centro da alça devolvia `rv-cartao-token`.

**Fica registrado, sem tarefa aberta:** nenhum outro controle do mapa foi auditado contra o cartão. A alça foi a que apareceu porque tinha check; marcos de medição, alças de área e o menu contextual ocupam regiões parecidas.

### TEST-02 — `check-campanha-admin-fase5` precisa ser reescrito, não consertado

- **Status:** Bloqueada (precisa de decisão de design)
- **Prioridade sugerida:** P2
- **Origem:** tentativa de reparo em 2026-09-22, revertida de propósito.

**Por que não dá pra consertar mecanicamente.** O check afirma CONFORMIDADE DE DESIGN nas três telas de administração da campanha: a tabela de regras é `rm-table`, a busca do Livro é `rm-input`, os itens são `rm-doclist-item`, o capítulo abre em `rm-prose`. Isso fazia sentido quando eram PÁGINAS dentro da casca `rm-*`.

As três viraram JANELAS dentro da mesa, e ali o sistema de design é `rv-*`: a busca do Livro é `rv-cena-campo rv-cena-busca`, os itens são `rv-livro-item`, o capítulo é `rv-livro-texto`. Trocar classe por classe seria transcrever o CSS de hoje para dentro do teste — ele passaria a reprovar a cada ajuste de estilo sem que nada tivesse quebrado para quem usa.

**A pergunta de produto:** essas janelas devem conformar a um sistema de design verificável (e a qual), ou o que vale afirmar ali é só comportamento? A resposta muda o que o arquivo deve ser.

**O que já foi medido, pra quem for reescrever:**

- as janelas ABREM e funcionam — o caminho é o menu da mesa (`button[aria-label="Menu da mesa"]` → `[data-testid="vtt-menu-mesa"]` → o item);
- o `data-testid` do item vem do rótulo por `rotulo.toLowerCase().replace(/[^a-z]+/g, "-")`, **sem normalizar acento** — o acento é substituído, não removido, então "Compêndio" é `vtt-menu-comp-ndio` e "Configurações da mesa" é `vtt-menu-configura-es-da-mesa`;
- é preciso FECHAR a janela aberta (Esc) antes de abrir a próxima: ela cobre o botão do menu, e o clique fica esperando "visible, enabled and stable" até o timeout;
- as rotas antigas (`/biblioteca`, `/livro`, `/jogadores-e-convites`, `/configuracoes`) não existem: navegar pra elas dá 404 e o check reprovava em cascata com "rm-table=false", que é o que sobra quando não há página.

### SESS-01 — Provocar falha na sessão não produz mais o erro visível

- **Status:** Bloqueada (precisa de investigação — pode ser teste, pode ser produto)
- **Prioridade sugerida:** P1 se for produto, P2 se for só a técnica de teste.
- **Origem:** três critérios de `check-campanha-painel-turndock-fase3` falhando do mesmo jeito, em 2026-09-22.

**O padrão.** Três features diferentes, a mesma forma de falhar:

| critério | o que provoca | o que deveria aparecer | o que aparece |
|---|---|---|---|
| 9 | aborta a ação do roster | `EstadoErro` na aba Participantes | nada |
| 11 | aborta a ação do viewer | banner de erro | nada |
| 14 | aborta `refreshAccessToken` | `AvisoSincronizacao` na mesa | nada |

Nos três a interceptação FUNCIONA — os abortos foram contados (dois no 9, um no 14). E nos três o caminho de erro do `CampaignRealtimeProvider` está correto lendo o código: `reloadMembers`, `reloadViewer` e `renovarRealtimeAuth` têm `catch` que escreve o estado de erro, e os componentes renderizam nesse estado.

**As duas leituras possíveis, e por que não dá pra escolher sem medir:**

1. **É a técnica de teste.** Ao abortar um Server Action, o Next rejeita internamente em `fetchServerAction`, e essa rejeição pode não chegar em quem chamou — `check-vtt-modal-diagnostico` já documentou esse comportamento de outro ângulo. Se for isso, o caminho certo é fazer a AÇÃO falhar (erro do servidor), não a REQUISIÇÃO, e os três critérios voltam com outra provocação.

2. **É o produto.** E aí é sério, principalmente no 14: uma renovação que falha sem avisar é exatamente o silêncio que `AvisoSincronizacao` foi escrito pra quebrar — *"não há erro na tela, nada pisca; parece mesa parada, não conexão caída"*. A pessoa ficaria sem receber eventos e sem saber.

**Como decidir:** fazer a Server Action falhar de verdade (derrubar a dependência que ela usa, ou devolver erro do servidor) e ver se o estado de erro aparece. Se aparecer, é (1). Se não, é (2).

**Nota operacional, encontrada no caminho:** este check RENOVA o token de propósito (critério 13) e o critério 15 é quem regrava `.auth/admin-session.json` com o refresh token rotacionado. Um erro fatal entre os dois deixa a sessão salva com um token já consumido, e o próximo check autenticado falha com "Nenhuma campanha encontrada em /mesas" — que não parece sessão quebrada. Na maioria das vezes `npx tsx scripts/dev/refresh-admin-session.ts` recupera; se o refresh token tiver sido usado duas vezes, aí é login manual (`save-admin-session.ts`). O critério 14 passou a clicar no retry com timeout curto e tolerante justamente pra não derrubar o 15.

### FICHA-02 — O link "← Personagens" da ficha não vai para Personagens

- **Status:** Bloqueada (precisa de decisão de produto)
- **Prioridade sugerida:** P3
- **Origem:** encontrada em 2026-09-22 ao reparar `check-fichaheader-portal-fix`.

**O que é.** No cabeçalho da ficha, a migalha diz `← Personagens` e o link aponta para `/mesas/${campaignId}` — a mesa, não a lista de personagens (`FichaHeader.tsx`). Rótulo e destino discordam.

Não dá para saber qual dos dois está certo sem decidir o que a volta deve significar, e por isso está bloqueada em vez de corrigida:

- se a volta é "sair da ficha e voltar pra mesa de onde vim", o destino está certo e o **texto** é que envelheceu (viraria `← Mesa`, ou o nome da campanha);
- se a volta é "voltar pra lista de personagens", o texto está certo e o **destino** é que envelheceu — Personagens deixou de ser por campanha e virou global (`/mesas/personagens`).

**Por que é pequeno mas não é nada:** a migalha é a única saída anunciada da ficha em rota direta, e ela promete um lugar e entrega outro.

**Nota sobre o check:** `check-fichaheader-portal-fix` afirmava o destino `/personagens` e por isso reprovava. O critério foi reescrito para guardar o que ele realmente existe para guardar — que o clique não é engolido pelo `.rc-backdrop` —, e não para escolher um dos dois lados desta decisão.

### TEST-01 — Inventariar e reparar os checks defasados

- **Status:** Pronta
- **Origem:** descoberta em 2026-09-20 ao investigar duas funções que `check-migrations-vs-banco.mjs` acusava. As funções eram um problema pequeno (acentuação, corrigida na 0144); o problema grande apareceu ao rodar as suítes vizinhas para conferir regressão.
- **Descrição:** o repositório mudou e os checks não acompanharam. Dois vetores confirmados, ambos já corrigidos na parte mecânica:
  - **Rota morta:** o commit `0d3c30d` (14/09) — “a campanha É a mesa — a URL perde o /vtt” — removeu `/mesas/[campaignId]/vtt`, e **32 scripts** continuavam navegando para lá. Todos morriam antes da primeira asserção, por seis dias, sem ninguém notar.
  - **Assinatura mudada:** a 0135 acrescentou `direcao` e os medidores de PE/mana a `create_vtt_token` e `edit_vtt_token`; quatro scripts seguiam chamando a assinatura antiga.
  - Reparados e verificados: `check-vtt-gerenciamento-tokens` (de 1 ok / 2 falhas para **66 ok**), `check-vtt-objetos-servidor` (**29 ok**), `check-vtt-canal-forjado` (**24 ok**).
- **O que falta:** a rota era o bloqueio comum, não o único. Os checks de navegador acumularam outras defasagens — `check-console-abertura`, por exemplo, agora avança bastante e morre num `data-testid` que mudou de nome. São **59 scripts que dirigem navegador**, de 83 checks no total, e cada um tem dívida própria. A tarefa é passar por eles um a um: rodar, classificar e decidir. Alguns podem estar verificando telas que não existem mais — nesses, apagar é a resposta certa, não consertar.
- **Achado de 2026-09-20 (tentativa de triagem em lote):** os checks defasados **travam em vez de falhar**. `check-campanha-fase4-gameplay` ficou mais de meia hora preso num seletor inexistente, porque cada espera do Playwright tem timeout próprio e elas se somam. Uma triagem em lote portanto precisa de **teto de tempo por script**; e o `timeout` do GNU não existe no macOS, o que derrubou a primeira tentativa em silêncio (todo script saiu como “sem veredito”). O classificador também precisa reconhecer mais de um formato de saída: parte dos scripts imprime `N ok, M falha(s)` e parte imprime banners como `=== TODOS OS CHECKS PASSARAM ===`.

#### Alarme falso registrado (2026-09-20)

Cheguei a abrir uma tarefa P0 — "efeito incompleto é descartado em silêncio ao
salvar" — a partir de três checks que falhavam com "deveria persistir após
recarregar". Era falso. O app **recusa** o salvamento e diz exatamente o que
falta, nomeando efeito e campo:

> ✕ Efeitos: Efeito #1 (aplicar_condicao): gatilho obrigatório ausente.

A sonda que "provou" o silêncio procurava um cabeçalho "Erros" no painel. O
painel não tem cabeçalho: ele renderiza `✕ <mensagem>` direto. Procurar texto
de título onde só existe conteúdo já tinha produzido um engano igual no mesmo
dia (a seção "Efeitos preservados", que também não tem título). Quando a
asserção for sobre "a interface disse alguma coisa", o alvo é o `data-testid`
ou o texto da mensagem — nunca um título presumido.

Os três checks (`companions-trama`, `temporary-effects`,
`inventory-runes-market`) estão errados de verdade: adicionam um efeito e
salvam sem preencher os campos obrigatórios dele.

#### Triagem COMPLETA (94 scripts, 2026-09-20)

**38 passam · 55 falham · 1 trava.** Menos de 40% da suíte funciona. Resultado completo, script a script, em `docs/prd/TRIAGEM_CHECKS_2026-09-20.md`; executor em `scripts/dev/triar-checks.mjs` (teto de 180s por script, porque os defasados travam em vez de falhar).

Os que passam se concentram no que foi escrito ou reparado recentemente, mais os checks de segurança e autorização do VTT. A tarefa que resta não é “consertar 55 scripts”: é decidir, um a um, entre **consertar** (envelheceu), **apagar** (verifica tela que não existe mais) e **reescrever** (o comportamento mudou de forma). Um check morto que ninguém apaga é pior que nenhum — aparece na lista e dá impressão de cobertura.

**Resíduo:** matar script antes da limpeza dele deixa conta e campanha no banco. `scripts/dev/varrer-residuo-de-teste.ts` varre (lista sem `--apply`), identificando fixture pelo domínio reservado `@ruptura.dev` e ignorando o que tem menos de 20 minutos. Ao ser criada, a varredura encontrou **25 contas e 9 campanhas órfãs**, a mais antiga de julho — o problema que `limparCampanhaDeTeste.ts` documenta continuava acontecendo.

#### O bloco VTT, fechado (2026-09-21 e 22)

Os 35 checks `check-vtt-*` foram passados um a um. **Todos verdes.** Os números, pros que estavam quebrados:

| check | antes | depois |
|---|---|---|
| `alca-rotacao` | 43–46 ok, 2–5 falhas (oscilando) | **48 ok** |
| `camadas-visuais` | não rodava | **22 ok** |
| `ciclo-cena` | 32 ok, 7 falhas | **38 ok** |
| `dividir-grupo` | morria no meio | **36 ok** |
| `gerenciador-token-ux` | parava no critério 15 | **50 ok** |
| `integracao` | 26 ok, 4 falhas | **32 ok** |
| `invalidacao-concorrencia` | 7 ok, 2 falhas | **9 ok** |
| `modal-diagnostico` | morria no primeiro terço | **43 ok** |
| `painel` | morria no arrasto pra pasta | **75 ok** |
| `pastas` | 19 ok, 3 falhas | **27 ok** |
| `rolagem-real` | morria no clique do token | **17 ok** |
| `sincronizacao-live` | morria no primeiro vínculo | **30 ok** |
| `troca-ferramenta` | 13 ok, 2 falhas | **15 ok** |
| `apresentar-cena` | morria no bloco de cena | **13 ok** |
| `dividir-grupo-ui` | idem | **20 ok** |
| `janelas-ferramenta` | morria numa janela que não existe mais | **todas as janelas** |
| `arquivo-e-duplicacao` | 10 ok e morria depois de imprimir o veredito | **27 ok** |

**O que o bloco inteiro rendeu em defeito de produto: dois.** O 404 da textura dos cards de campanha (`parts.tsx` pedia `.png` num arquivo `.jpg`) e o cartão de hover cobrindo a alça de rotação (CART-01). O resto foi teste envelhecido.

**As causas, agrupadas** — vale mais que a lista de scripts, porque elas se repetem:

1. **Enquadramento e sobreposição.** Ponto fora da viewport, ou debaixo do painel da sessão que flutua sobre o mapa. Apareceu em sete checks. Sempre com a mesma assinatura: o gesto acontece sem erro nenhum, no vazio, e o critério seguinte acusa o produto de outra coisa. `scripts/dev/painelDaSessao.ts` existe por causa disso e resolve os dois casos.
2. **Corrida de leitura.** Ler o banco no instante seguinte ao clique que dispara a escrita. Quando perdida, produz "linhas=0" ou `null`, que se lê como "o produto não gravou".
3. **Assinatura de RPC que mudou** e foi DERRUBADA em vez de sobrecarregada (0129, 0132) — de propósito, porque duas funções de mesmo nome com aridades diferentes já quebrou `move_vtt_token` na 0094/0096.
4. **Seletor de peça que mudou de forma** — e, nos casos mais interessantes, de DESENHO: `.rv-escolha-posicao` que só existe no caso de erro, o HUD de token selecionado que virou cartão de hover, os "módulos" do cartão de rolagem que viraram faixa de resultado.
5. **Espera que não espera.** `arquivo-e-duplicacao` esperava "o botão do arquivo existir no DOM" para saber que a cena tinha sido arquivada. O botão passou a existir SEMPRE (desabilitado enquanto não há nada arquivado), então a espera voltava na hora e os dois critérios seguintes mediam o catálogo velho. É o terceiro caso desta família na sessão; o padrão que funciona é esperar pelo ESTADO que a ação produz, nunca pela presença do elemento.
6. **Alvo morto numa LISTA.** `janelas-ferramenta` percorria as janelas uma a uma e "Configurações da cena" já não existe (o que ela fazia mora no cartão do catálogo). O check clicava num botão inexistente, esperava 30s e morria — levando junto as janelas listadas DEPOIS dela, que funcionam. Um alvo morto numa lista não é neutro: ele mata os vizinhos.
7. **Critério que defendia uma decisão revogada.** A confirmação por nome ao excluir cena (removida na 0132), a preservação da cena ao apagar pasta (invertida na 0129), a barra de PV no token (removida porque vazava recurso não-público), "zero requisições no hover" (o cartão passou a ler recursos de propósito). Nestes o conserto certo é aposentar ou reescrever, nunca fazer o produto voltar.

#### O bloco NÃO-VTT, triado (62 scripts, 2026-09-22)

Varredura com teto de 200s por script e **veredito pelo código de saída**, não pela linha impressa — a diferença importa: `check-vtt-arquivo-e-duplicacao` imprimia "10 critérios ok, 0 falhas" e morria logo depois, e por duas varreduras passou por verde.

**41 passam · 20 falham · 1 trava.**

Vários dos que "passam" não imprimem `N ok, M falhas` — usam banners próprios. Isso não é problema de veredito (o código de saída resolve), mas atrapalha quem lê a saída no terminal.

Os que falham, agrupados pelo que aparentam:

| grupo | scripts | leitura |
|---|---|---|
| casca de campanha / sessão | `campanha-provider-fase1`, `campanha-presence-fase3b`, `campanha-painel-turndock-fase3`, `campanha-wizard-fase6`, `campanha-admin-fase5`, `campanha-casca-fase2`, `campaign-shell-drawer`, `campanha-fase4-gameplay` (trava) | superfícies inteiras que mudaram ou saíram — abas de sessão, dock de turno, wizard. Cada um precisa de decisão própria entre consertar, reescrever e apagar |
| console da ficha | `console-abertura`, `console-baseline`, `console-rolagem-visual` | o console foi bastante reescrito nesta rodada |
| resto | `admin-publication`, `dados-lado-direito`, `ficha-mesa-integracao`, `motion`, `realtime-auth-renovacao`, `redesign-densidade`, `replay-vs-remoto` | sem padrão comum aparente |

Já fechados desta lista: `console-modo-evolucao` (**10 ok** — era corrida de leitura, a gravação existia) e `fichaheader-portal-fix` (**15 ok** — ver FICHA-02).

**`check-residuo-de-fixtures` reprova por um motivo legítimo e é a única falha que NÃO é do check:** há resíduo real no banco. Quinze contas `@ruptura.dev` e seis campanhas ficaram para trás de execuções mortas no meio (parte delas desta sessão, ao usar teto de tempo na triagem, que é exatamente o cenário que `varrer-residuo-de-teste.ts` documenta). A varredura existe e está pronta:

```
npx tsx scripts/dev/varrer-residuo-de-teste.ts            # lista
npx tsx scripts/dev/varrer-residuo-de-teste.ts --apply    # apaga
```

Ela não foi executada com `--apply` de propósito: o `--apply` leva junto duas campanhas de julho e junho que o próprio check classifica como "arqueologia, não falha", e apagar coisa antiga de um banco alheio não é decisão de quem está só consertando teste.

#### Triagem parcial anterior (12 de 66) — amostra enviesada, mantida como registro

| script | veredito |
|---|---|
| `check-admin-biblioteca` | **passa** |
| `check-admin-composite-effects` | falha |
| `check-admin-content-drafts` | trava (timeout 10s) |
| `check-admin-companions-trama` | trava (timeout 30s) |
| `check-admin-effect-builder` | trava (timeout 10s) |
| `check-admin-inventory-runes-market` | falha (asserção) |
| `check-admin-legacy-conversion` | falha |
| `check-admin-publication` | falha |
| `check-admin-temporary-effects` | trava (timeout 30s) |
| `check-campaign-shell-drawer` | trava (timeout 30s) |
| `check-campanha-admin-fase5` | trava (timeout 30s) |
| `check-campanha-casca-fase2` | falha |

**Um em doze passa** — número que a triagem completa desmentiu. A amostra eram os doze primeiros em ordem alfabética, todos do bloco `check-admin-*`, que falham em conjunto. O real é 38 em 94. A leitura de fundo continua valendo: boa parte da suíte está morta.

- **Área afetada:** `scripts/dev/`, confiança em toda verificação de navegador.
- **Prioridade sugerida:** P1
- **Dependências:** nenhuma.
- **Critérios de aceite:** todo check em `package.json` ou roda verde, ou está removido com justificativa escrita; nenhum check falha por rota, assinatura de RPC ou `data-testid` obsoletos; o inventário registra, por script, se ele ainda descreve comportamento desejado.
- **Nota sobre o auditor existente:** `npm run check:scripts-de-teste` (`auditar-scripts-de-teste.mjs`) audita 60 scripts, mas é **estático de propósito** — percorre o grafo de imports sem executar, justamente para não deixar resíduo no Supabase real. Por isso não podia ver esta classe de apodrecimento: um script que importa tudo certo e navega para uma rota inexistente passa na auditoria dele e falha na primeira linha do teste. Fechar TEST-01 provavelmente pede uma segunda auditoria, de execução, com fixtures descartáveis — o que os checks desta sessão já fazem (criam conta e campanha próprias e revertem no fim).

## 7. Personagens e console

### CHAR-01 — Criar seletor de tipo em “+ Personagem”

- **Status:** Pronta após dependência
- **Descrição:** ao acionar “+ Personagem”, abrir menu acessível com PJ, PN e Aliado, filtrando as opções por papel antes de entrar no fluxo específico.
- **Área afetada:** aba Personagens, menu ancorado e permissões.
- **Prioridade sugerida:** P1
- **Dependências:** CHAR-04 e CHAR-05 precisam ter contratos aprovados; CHAR-02 e CHAR-03 definem os destinos de PJ.
- **Critérios de aceite:** jogador vê apenas opções autorizadas; narrador vê as três; menu tem foco, teclado, escape e retorno de foco; cada opção abre o fluxo correto; servidor continua validando autorização.
- **Dúvidas antes da implementação:** “Criar PJ” abre um segundo seletor rápida/guiada ou o mesmo menu já mostra quatro entradas? Qual opção é a padrão?

### CHAR-02 — Consolidar criação rápida de PJ

- **Status:** Pronta (concluída)
- **Andamento (2026-09-20):** o defeito sério não era a fonte — **confirmar duas vezes criava dois personagens**. Quem fecha o diálogo é o chamador, num `setState`, e o React só aplica isso ao DOM depois da tarefa atual: dois cliques rápidos acertam o mesmo botão ainda presente. O teste clicou três vezes e nasceram três. A guarda ficou no próprio `DialogoTexto`, então vale também para a criação de pasta. A fonte reduzida era real, mas `.rv-pn-input` é 11px porque serve aos seletores compactos dos filtros — a correção vale dentro do modal. E `executar()` descartava o retorno da ação, então o personagem recém-criado caía na lista e o narrador tinha de procurá-lo; agora é selecionado. Foco, Escape e devolução de foco já funcionavam. Oito critérios (`scripts/dev/check-criacao-rapida-pj.ts`).
- **Descrição:** manter o fluxo atual de nome único dentro de um modal definitivo, corrigir a fonte reduzida do input e padronizar loading, erros, foco e retorno à lista.
- **Área afetada:** `JanelaNovoPersonagem`, formulário e CSS do painel.
- **Prioridade sugerida:** P1
- **Dependências:** CHAR-01 para o novo ponto de entrada.
- **Critérios de aceite:** solicita somente nome; tipografia igual aos demais inputs; validação e erro do servidor visíveis; submit não duplica personagem; sucesso seleciona/mostra o personagem criado; modal acessível.
- **Dúvidas antes da implementação:** o nome precisa ser único na campanha? O novo PJ nasce controlado pelo criador automaticamente?

### CHAR-03 — Integrar criação guiada de PJ

- **Status:** Pronta após dependência
- **Correção de status (2026-09-20):** estava marcada como “Pronta”, contradizendo a própria linha de dependências — ela pede CHAR-01, que espera CHAR-04 e CHAR-05, as duas bloqueadas. Não é implementável hoje.
- **Descrição:** abrir o assistente completo já existente a partir do novo menu, preservando rascunho, validação canônica e retorno ao painel do VTT.
- **Área afetada:** `AssistenteDeCriacao`, painel Personagens e domínio de criação.
- **Prioridade sugerida:** P1
- **Dependências:** CHAR-01; auditoria do fluxo atual do wizard e da atribuição de controle.
- **Critérios de aceite:** o mesmo motor de validação é usado; fechar/reabrir segue política de rascunho existente; conclusão atualiza lista e controle sem reload; erros não descartam progresso; nenhum segundo wizard paralelo é criado.
- **Dúvidas antes da implementação:** jogador pode usar a criação guiada sem aprovação do narrador? O rascunho é por campanha e usuário?

### CHAR-04 — Definir e implementar criação de PN

- **Status:** Bloqueada
- **Descrição:** criar o fluxo exclusivo do narrador para personagem do narrador somente após definir ficha, controle, visibilidade, defaults e participação no combate.
- **Área afetada:** personagens, ficha, autorização, tokens e combate.
- **Prioridade sugerida:** P1
- **Dependências:** regras de PN; CHAR-01; CMB-01 para integração visual da trilha.
- **Critérios de aceite:** contrato aprovado antes do código; apenas narrador cria/edita; PN recebe tipo persistente inequívoco; criação pode gerar ou não token conforme regra; aparece no lado correto do combate.
- **Dúvidas antes da implementação:** PN usa a mesma ficha do PJ? Pode ser revelado aos jogadores? Pode ser controlado por jogador? Criar PN cria token automaticamente? Quais campos mínimos?

### CHAR-05 — Definir e implementar Aliado

- **Status:** Bloqueada
- **Descrição:** modelar Aliado como categoria explícita com comportamento de PN e facção de PJ no combate, sem inferir isso apenas por posição visual.
- **Área afetada:** personagens, permissões, tokens, combate e trilha de turnos.
- **Prioridade sugerida:** P1
- **Dependências:** CHAR-04, CMB-01 e regra de facções/controle.
- **Critérios de aceite:** tipo/facção persistidos; lado dos PJs deriva do domínio; permissões de edição e controle validadas; conversão entre PN/Aliado, se permitida, é explícita; logs e cards distinguem a categoria.
- **Dúvidas antes da implementação:** quem controla o Aliado? Ele conta para regras que mencionam PJ? Pode evoluir/usar inventário? Pode mudar de lado durante combate?

### CON-01 — Corrigir moldura e controles da janela do console

- **Status:** Pronta (concluída)
- **Andamento (2026-09-20):** tooltips e `aria-label` **já existiam** nos três controles. Dois defeitos reais apareceram: (1) **maximizada, a janela (z 501) ficava sob o cabeçalho de /ficha (z 510)** — os controles não recebiam clique e não havia como restaurar nem fechar pelo botão; só apareceu porque o teste clicou de verdade em vez de conferir o DOM; (2) **cursor duplicado**, porque o Console monta o próprio `HudCursor` e a casca da campanha monta outro. **Decisões tomadas:** o HUD continua dentro do Console, mas só um desenha por ponteiro, com registro de módulo e não contexto de React — o modal de ficha vive no slot `@modal`, fora da árvore da casca, e contexto não desceria até lá; raio de 3px nos botões, igual ao das janelas do painel do VTT; ciano atenuado para 0.62 (4.45:1, acima do 3.0 que AA pede para ícone). Oito critérios verificados em navegador (`scripts/dev/check-console-moldura.ts`).
- **Descrição:** eliminar cursor duplicado, arredondar bordas, atenuar ciano dos ícones e adicionar tooltips a minimizar, maximizar e fechar.
- **Área afetada:** `CharacterConsole`, `ConsoleWindow`, cursor e CSS do console.
- **Prioridade sugerida:** P1
- **Dependências:** AUTH-02 apenas para tokens visuais compartilhados.
- **Critérios de aceite:** apenas um cursor visual por ponteiro; bordas sem artefatos nos modos normal/maximizado; três controles têm tooltip, `aria-label` e foco; contraste adequado; tooltips não ficam cortados pela janela.
- **Dúvidas antes da implementação:** o cursor HUD deve existir dentro do console ou o cursor nativo é a referência? Qual raio exato deve ser adotado?

### CON-02 — Harmonizar paleta e tab rail do console

- **Status:** Em andamento
- **Andamento (2026-09-20):** o critério “tokens sem cores mágicas duplicadas” era mensurável e estava sendo violado em **73 lugares**: `#d6e4f5` aparecia 24 vezes e É `--rc-text`; `#1c2b45` nove vezes e É `--rc-line`. Trocados por token, mais quatro tokens novos para as recorrentes que não tinham nome (`--rc-text-forte`, `--rc-teal`, `--rc-surface-2`, `--rc-surface-3`).
- **Regressão introduzida e apanhada pela medição:** os tokens eram declarados em `.rc-window-wrap`, e o cabeçalho de `/ficha` é **irmão** da janela, não descendente — ao trocar literais por token, oito elementos do cabeçalho caíram na cor padrão do navegador. Só apareceu porque as cores computadas foram fotografadas antes e comparadas depois. Os tokens passaram a ser declarados também para o cabeçalho; o layout continua só na janela.
- **Segundo erro, sobre token contextual:** `--rc-skill-cor` vale verde em Corpo e roxo em Mente, e só recebe valor dentro de `.rc-skill`. Troquei por ele um `#0596B7` de `.rc-nric-badge`, que está fora desse escopo — o `var()` não resolveria ali, e o próprio arquivo já dizia que aquela era “cor PRÓPRIA”. Revertido, e o check passou a **ignorar tokens declarados com mais de um valor**: igualdade de valor não é duplicação quando o token é contextual.
- Cinco critérios em `scripts/dev/check-console-paleta.ts`.
- **Dúvida respondida pelo usuário (2026-09-20):** “o visual padrão que o Console deve seguir é o visual dentro da mesa”. Então não é só herdar tokens: a referência é o painel do VTT.
- **Raios alinhados:** o Console tinha **51 raios em número solto** enquanto o painel do VTT já usava token em 42 de 55 lugares. Passaram a `--rc-r-sm`/`--rc-r-lg`/`--rc-r`, que espelham `--rv-r-sm`/`--rv-r-lg`/`--rv-r` do chassi. Ficaram em número apenas `0` (canto reto deliberado, como a janela maximizada) e `999px` (pílula) — nenhum dos dois pertence à escala. Três valores fora de escala foram encaixados nela: dois `2px` que eu mesmo tinha introduzido no campo da carteira, e um `6px` do seletor do cabeçalho.
- **Tab rail alinhado (2026-09-20):** o trilho já citava `.rv-ferr-btn` como referência nos comentários, mas divergia dele em três pontos concretos. **Hover** substituía o fundo em vez de lavar por cima — substituindo, o botão perde a própria base (`#0c1526`) e fica translúcido sobre o que estiver atrás, o que em cima do mapa muda de cor conforme a cena; o VTT já trazia essa nota escrita. **Ativo** usava `#123640`, uma cor sólida fora da escala, que não guardava relação com o passo do hover; virou a lavagem de `.14` contra os `.09` do hover, a mesma hierarquia do VTT. E faltavam dois dos quatro estados que o critério pede: **pressionado** (lavagem de `.2`, sem brilho — o brilho diz “é esta”, e enquanto o dedo está em cima a informação é outra) e **desabilitado** (`opacity .35`, receita do VTT; hoje nenhuma aba desabilita, mas a regra existe para a primeira que precisar não inventar tratamento próprio).
- **Não tocado de propósito:** a aba **Personagem** tem paleta âmbar própria, documentada como diferenciação deliberada, e usa cor sólida em vez de lavagem. Alinhá-la seria apagar a distinção.
- **Acento do ícone ativo (2026-09-20):** o mesmo nome de variável valia coisas diferentes nos dois lugares — `--cy` é `var(--rv-cy)` (`#45b8c9`) no VTT e `#00d4ff` no Console. O código dos dois trilhos era idêntico (`color: var(--cy)`) e o resultado não, e o do Console puxava mais atenção. Como os dois trilhos ficam ombro a ombro quando o Console abre sobre a mesa, e ambos só dizem “está aqui”, o ícone ativo do trilho passou a usar o ciano do chassi, por um token próprio (`--rc-trilho-ativo`).
- **O que NÃO mudou, e por quê:** trocar o acento INTEIRO do Console já havia sido tentado e desfeito — está escrito em `.rc-window-wrap` que o `#00d4ff` é a identidade dele. A mudança foi contida à peça que fica lado a lado com o VTT, em vez de refazer um caminho já rejeitado. Decisão confirmada pelo usuário.
- **Colisão de nomes eliminada (2026-09-20, a pedido):** `--cy` valia `#00d4ff` no Console e `var(--rv-cy)` (`#45b8c9`) no VTT — **o mesmo nome, dois valores conforme o escopo**. Lendo o CSS dos dois lados via-se a mesma linha (`color: var(--cy)`) e concluía-se que estavam alinhados; foi assim que a diferença do ícone ativo passou despercebida. Pior: qualquer peça nova do Console usando `var(--cy)` nasceria com o acento errado, e dentro da mesa herdaria o do VTT sem aviso. O Console passou a usar **`--rc-cy` e `--rc-am`**, nomes próprios — 42 usos de um e 31 do outro. A troca foi verificada como **invisível**: 374 elementos fotografados antes e depois, zero diferenças. O check ganhou um critério que falha se `--cy`/`--am` voltarem a ser declarados ou usados aqui.
- **Assimetria registrada:** o trilho de ferramentas do VTT **não** define estado pressionado. Ele existe aqui porque CON-02 pede os quatro; se a intenção for que os dois sejam idênticos, falta acrescentá-lo lá.
- Sete critérios em `scripts/dev/check-console-paleta.ts`.
- **Descrição:** revisar cores de defesa, adicionar, pips, PV/mana e alinhar as tabs ao padrão das janelas de ferramentas/painel.
- **Área afetada:** CSS do console, recursos, ações e `TabRail`.
- **Prioridade sugerida:** P1
- **Dependências:** AUTH-02 para tokens; CON-01 para revisão visual conjunta.
- **Critérios de aceite:** tokens sem cores mágicas duplicadas; estados normal/hover/pressed/disabled definidos; recursos continuam distinguíveis sem depender só de cor; tab ativa e foco são claros; contraste verificado sobre o novo fundo.
- **Dúvidas antes da implementação:** tabs seguem exatamente o painel VTT ou apenas seus tokens? Cores de PV/mana têm semântica fixa de sistema?

### CON-03 — Ajustar sobrecarga e distorções de identidade

- **Status:** Bloqueada
- **Descrição:** corrigir o modal de surto de sobrecarga e adicionar bloco de distorções quando integridade for 6 ou menos; pips consumidos nesse estado exibem rachaduras vermelhas diagonais.
- **Área afetada:** aba Personagem, overload, integridade, pips e modal auxiliar.
- **Prioridade sugerida:** P1
- **Dependências:** regra visual/funcional de distorções aprovada; domínio de integridade existente.
- **Critérios de aceite:** limiar calculado a partir do estado real; bloco aparece/desaparece sem reload; rachadura só nos pips consumidos e não substitui semântica acessível; modal de surto não corta conteúdo e trata todos os estados; redução de movimento respeitada.
- **Dúvidas antes da implementação:** qual conteúdo e ação existem no bloco de distorções? O limiar inclui exatamente 6? A rachadura é apenas feedback ou altera interação/regra? Quais problemas atuais do modal devem ser considerados defeito de aceite?

### CON-04 — Criar seletor de conteúdo para espaço livre

- **Status:** Bloqueada
- **Descrição:** permitir clicar em slot livre e escolher conteúdo compatível — escalpo, magia, item, característica e extensões — usando um registro canônico de tipos, validação de compatibilidade e mutação existente.
- **Área afetada:** aba Personagem, slots, compêndio, inventário e ficha.
- **Prioridade sugerida:** P1
- **Dependências:** INV-01; regras de encaixe para magia/escalpo/característica; COMP-01 para navegador de conteúdo.
- **Critérios de aceite:** somente tipos compatíveis aparecem; seleção não ignora limites/requisitos; cancelamento não altera dados; sucesso atualiza ficha e log conforme regra; interface explica por que um conteúdo está indisponível.
- **Dúvidas antes da implementação:** o que cada “espaço” representa? Conteúdo é equipado, aprendido, copiado ou vinculado? Pode remover/substituir? Quais limites e custos por tipo?

### EQP-01 — Reorganizar a aba Equipamentos e ações rápidas

- **Status:** Pronta
- **Descrição:** redistribuir itens para eliminar o vazio, criar estados/feedback das ações de equipar, usar amarelo menos intenso e trocar o ícone da tab rail.
- **Área afetada:** `EquipmentPanel`, tab rail, inventário/loadout e CSS.
- **Prioridade sugerida:** P1
- **Dependências:** CON-02; levantamento dos estados de loadout já implementados.
- **Critérios de aceite:** layout utiliza a área disponível em tamanhos suportados; ação de equipar tem cor/hover aprovados; loading e erro por item; ícone novo reconhecível; navegação por teclado preservada.
- **Dúvidas antes da implementação:** qual ícone substitui o atual? O painel deve agrupar por slot, categoria ou estado? Quais janelas de equipar já podem usar a regra parcial existente?

### EQP-02 — Criar janelas e estados definitivos de itens equipados

- **Status:** Bloqueada
- **Descrição:** construir as janelas disparadas por “equipar” e a representação de itens já equipados somente depois do contrato definitivo de inventário/mochilas.
- **Área afetada:** Equipamentos, Inventário, defesa, carga e ações rápidas.
- **Prioridade sugerida:** P1
- **Dependências:** INV-01, INV-02, EQP-01.
- **Critérios de aceite:** slots e conflitos seguem regras aprovadas; troca é atômica; item equipado mostra estado, durabilidade/recursos aplicáveis e ações; nenhuma regra provisória é cristalizada na UI.
- **Dúvidas antes da implementação:** respondidas em INV-01, além de: equipar consome ação/tempo? Há comparação entre item atual e novo?

### INV-01 — Aprovar taxonomia, dados e regras de mochila

- **Status:** Bloqueada
- **Descrição:** revisar o domínio parcial existente e definir todos os tipos de item, campos por tipo, stack, carga, estados, capacidade, troca de mochila, excedente e relação com abrigo/equipamento.
- **Área afetada:** regras, schema canônico, `character/inventory.ts`, `carga.ts`, Mercado e console.
- **Prioridade sugerida:** P0
- **Dependências:** regras definitivas fornecidas pelo responsável do sistema.
- **Critérios de aceite:** matriz por tipo aprovada; invariantes e exemplos; compatibilidade com itens publicados auditada; plano de migração; decisões de mochila e excedente sem lacunas; regras de moeda incluídas ou referenciadas.
- **Dúvidas antes da implementação:** quais são todos os tipos? Quais empilham? Como se troca mochila e o que ocorre com excesso? Onde fica o abrigo? Peso/espaços coexistem? Quais itens podem ser equipados/empunhados/acesso rápido?

### INV-02 — Implementar inventário definitivo

- **Status:** Bloqueada
- **Descrição:** alinhar modelo, validações e interface ao contrato aprovado, migrando com segurança os estados parciais já existentes.
- **Área afetada:** domínio de personagem, banco/JSON canônico, console, Mercado e logs.
- **Prioridade sugerida:** P0
- **Dependências:** INV-01.
- **Critérios de aceite:** validação server-side das invariantes; migração sem perda; interface representa todos os tipos/estados; capacidade e excedente tratados; compra, mover, equipar e remover cobertos por testes.
- **Dúvidas antes da implementação:** respondidas em INV-01.

### INV-03 — Exibir carteira e saldo em aretz

- **Status:** Pronta (concluída)
- **Andamento (2026-09-20):** carteira lê o contrato `carteira` que já existia (PRD 13.1). **Mudança pedida pelo usuário em 2026-09-20:** o campo de aretz passou a ser **editável**. Aceita três formas, porque as três são gestos reais: o valor final (`900`), um delta (`+250`, `-150`) e **uma conta escrita por cima do que já estava lá** (`3000-555`).
- **Defeito corrigido na mesma volta:** a primeira versão só aceitava `+N` / `-N` isolados, e recusava justamente o caso mais provável. O campo abre **com o saldo dentro**, então clicar no valor e continuar digitando produz `0+3000` e `3000-555` naturalmente — foi o que o usuário reportou, com captura. Agora a conta é resolvida. O cursor abre **no fim, sem seleção**, de propósito: selecionar tudo faria o saldo desaparecer no primeiro caractere digitado, e quem digita `+500` poderia achar que perdeu o valor anterior — decisão do usuário depois de ver o comportamento. A soma é resolvida no envio contra o saldo do momento, e o que vai ao servidor é o valor absoluto — mandar o delta faria o resultado depender de quando a tela renderizou. A escrita usa `update_character_sheet_payload`, o mesmo caminho de qualquer alteração de ficha, que revalida controle e participação ativa no servidor: **nenhuma porta nova**. Saldo não fica negativo. Entrada inválida explica o formato em vez de recusar em silêncio. Onze critérios verificados.
- **Consequência de autorização, para você decidir:** por esse caminho, **quem controla o personagem pode editar o próprio saldo** — inclusive um jogador. Se a intenção era que só o narrador mexesse, isso pede um caminho diferente (RPC própria com `is_campaign_owner`), e vira tarefa nova.
- **Decisões anteriores mantidas:** aretz em destaque e CDI/CDI craqueada só quando há saldo, porque três zeros lado a lado dariam a impressão de três carteiras vazias quando a pessoa só nunca encostou nas outras duas; inteiro com separador de milhar pt-BR. Carteira ausente mostra traço, não zero — zero exibido antes de a ficha carregar é o número que alguém usa para decidir uma compra. Oito critérios em navegador (`scripts/dev/check-carteira-inventario.ts`).
- **Descrição:** criar área de carteira na aba Inventário usando o contrato de `carteira` já existente, com destaque para aretz e sem inventar mutação de saldo fora dos fluxos autorizados.
- **Área afetada:** Inventário, carteira e Mercado.
- **Prioridade sugerida:** P1
- **Dependências:** auditar se “aretz” do pedido equivale a `aretz_informal`; INV-01 apenas se a nomenclatura mudar.
- **Critérios de aceite:** saldo real e formatado; loading/ausência não aparecem como zero enganoso; atualização após compra sem reload; outras moedas, se existentes, seguem hierarquia aprovada; leitura acessível.
- **Dúvidas antes da implementação:** mostrar apenas aretz informal ou também CDI/CDI craqueada? Jogador pode editar saldo? Qual formatação e precisão?

### TAB-01 — Implementar aba Magias

- **Status:** Bloqueada
- **Descrição:** criar a experiência completa de visualizar, filtrar, preparar/usar e inspecionar magias do personagem, reaproveitando domínio e conteúdo canônico já existentes.
- **Área afetada:** console, magias, rolagens, recursos e chat.
- **Prioridade sugerida:** P1
- **Dependências:** regras de aquisição/preparo no console; CON-02; COMP-01 para detalhes compartilhados.
- **Critérios de aceite:** lista reflete estado real; detalhes e custos visíveis; uso valida requisitos e recursos no servidor; resultado gera feedback/log; vazios, erro e loading tratados.
- **Dúvidas antes da implementação:** “preparar” existe? Quais ações podem ser feitas diretamente nesta aba? Magias indisponíveis aparecem bloqueadas ou somem?

### TAB-02 — Implementar aba Escalpos

- **Status:** Bloqueada
- **Descrição:** criar a experiência completa de escalpos, incluindo estado, detalhes e ações permitidas pelo domínio atual.
- **Área afetada:** console, escalpos, efeitos e chat.
- **Prioridade sugerida:** P1
- **Dependências:** regras de aquisição/equipamento/uso; CON-02; COMP-01.
- **Critérios de aceite:** dados canônicos, estados e efeitos representados; ações autorizadas e registradas; requisitos explicados; vazios e falhas tratados; sem duplicar executor técnico.
- **Dúvidas antes da implementação:** escalpo ocupa slot? É ativado, equipado ou consumido? Jogadores veem origem/descrição completa? Quais ações pertencem à aba?

### TAB-03 — Implementar aba Identidade

- **Status:** Bloqueada
- **Descrição:** criar a aba definitiva de identidade após definir campos editáveis, visibilidade e relação com integridade/distorções.
- **Área afetada:** console, ficha e perfil narrativo do personagem.
- **Prioridade sugerida:** P1
- **Dependências:** regra de identidade; CON-03.
- **Critérios de aceite:** campos e permissões aprovados; autosave/submit com feedback; conteúdo privado respeitado; distorções integradas sem duplicação; histórico se exigido.
- **Dúvidas antes da implementação:** quais campos compõem Identidade? Quem edita e quem vê? Há versão privada ao narrador? Distorções alteram texto ou apenas estado visual?

### TAB-04 — Implementar aba Ações

- **Status:** Bloqueada
- **Descrição:** apresentar ações disponíveis do personagem e permitir executar as que já têm contrato, centralizando ataques, ações de conteúdo e custos sem duplicar a lógica do painel de rolagem.
- **Área afetada:** console, `actionConsole`, combate, rolagens e chat.
- **Prioridade sugerida:** P1
- **Dependências:** inventário definitivo para ações de itens; CON-02; CMB-01 para integração visual.
- **Critérios de aceite:** ações derivadas do estado atual; indisponibilidade tem motivo; execução reaproveita funções de domínio; custo/efeito é atômico; resultado aparece no chat; nenhuma ação sem regra é simulada.
- **Dúvidas antes da implementação:** a aba inclui ações genéricas do sistema, somente as do personagem ou ambas? Como agrupar ação, reação e ação rápida/lenta?

## 8. Chat, participantes e Bando

### CHAT-01 — Catalogar e padronizar cards do chat

- **Status:** Pronta (concluída)
- **Andamento (2026-09-20):** o inventário é **gerado do código**, não escrito à mão: tabela manual envelhece no primeiro tipo novo e ninguém descobre, porque `formatGenericLog` engole o desconhecido com elegância — o card sai legível, só que montado por despejo de campos em vez de frase. Documento em `docs/prd/CATALOGO_CARDS_DO_CHAT.md`, gerado por `scripts/dev/check-chat-catalogo.mjs --tabela`. **Três lacunas reais encontradas e corrigidas:** `attack_damage_applied`, `turn_ended` e `turn_track_narrator_update` eram escritos sem card próprio. Sem `--tabela`, o check **falha** quando o próximo aparecer. Limite escrito no documento: só enxerga escrita estática.
- **Descrição:** criar inventário de todos os `table_logs.type` e respectivos renderizadores/fallbacks; padronizar cabeçalho, autor, horário, visibilidade, corpo, ações e estados de erro.
- **Área afetada:** ChatTab, feed, `logPresentation` e geradores de log.
- **Prioridade sugerida:** P1
- **Dependências:** nenhuma; é pré-requisito de CHAT-03.
- **Critérios de aceite:** tabela tipo→card documentada; todo tipo conhecido tem renderização; tipo desconhecido degrada com segurança; cards seguem tokens comuns; visibilidade privada é inequívoca; snapshots/checks para cada família.
- **Dúvidas antes da implementação:** cards antigos precisam de migração visual específica? Quais eventos técnicos devem ficar ocultos do feed normal?

### CHAT-02 — Definir acesso às ações do card

- **Status:** Bloqueada
- **Descrição:** decidir entre menu contextual, botão de opções visível ou abordagem híbrida para excluir, destacar/fixar e futuras ações, considerando descoberta em touch e teclado.
- **Área afetada:** UX do chat e menu contextual.
- **Prioridade sugerida:** P1
- **Dependências:** decisão de produto/design.
- **Critérios de aceite:** padrão aprovado para mouse, teclado e touch; regras de visibilidade das ações por papel/autoria; confirmação e feedback definidos; comportamento de card fixado documentado.
- **Dúvidas antes da implementação:** botão direito pode ser único acesso? Autor pode excluir a própria mensagem? Narrador pode excluir qualquer card? Quantos cards podem ser fixados e onde aparecem?

### CHAT-03 — Implementar exclusão e fixação/destaque de cards

- **Status:** Bloqueada
- **Descrição:** adicionar mutações autorizadas e UI para excluir mensagens/rolagens e fixar/destacar cards conforme padrão aprovado.
- **Área afetada:** chat, tabela de logs, RLS, realtime e auditoria.
- **Prioridade sugerida:** P1
- **Dependências:** CHAT-01, CHAT-02.
- **Critérios de aceite:** autorização server-side; atualização em todos os clientes; exclusão segue política aprovada (soft/hard) e não quebra referências; fixação persiste e tem ordenação determinística; falha reverte otimista; ações auditáveis.
- **Dúvidas antes da implementação:** exclusão é permanente ou tombstone? Rolagens apagadas devem deixar vestígio para evitar trapaça? Fixação é uma por campanha, várias, ou por usuário?

### PART-01 — Melhorar painel e abrir detalhes em modal

- **Status:** Bloqueada
- **Descrição:** adicionar padding, hover/focus evidente e mover detalhes de participante para modal reutilizável, preservando presença e controles existentes.
- **Área afetada:** ParticipantesTab, perfil/controles e Dialogo.
- **Prioridade sugerida:** P1
- **Dependências:** PRES-02 para estado invisível; NET-01 para possível modal compartilhado.
- **Critérios de aceite:** itens comunicam clique; modal abre participante correto, retém/retorna foco e fecha por Escape; painel não expande internamente; ações de narrador mantêm autorização; presença indisponível não vira offline falso.
- **Dúvidas antes da implementação:** o modal é o mesmo perfil da Rede? Quais controles administrativos aparecem? Jogadores podem abrir detalhes de todos?

### BANDO-01 — Redesenhar Bando Refratário

- **Status:** Bloqueada
- **Descrição:** redesenhar dados, interface e fluxos do Bando somente depois de receber as regras definitivas; não estender a interface atual baseada em pressupostos provisórios.
- **Área afetada:** BandoTab, inventário do bando, transferências e regras de campanha.
- **Prioridade sugerida:** P1 após desbloqueio
- **Dependências:** regras definitivas de Bando Refratário; possível dependência de INV-01.
- **Critérios de aceite:** especificação aprovada; modelo e permissões migrados; interface cobre os fluxos definidos; transferências são atômicas; testes evitam duplicação/perda de itens.
- **Dúvidas antes da implementação:** composição, recursos, progressão, papéis, inventário, limites, controle e efeitos do Bando ainda precisam ser fornecidos.

## 9. Compêndio e anotações

### COMP-01 — Redefinir Compêndio como projeção da campanha

- **Status:** Bloqueada
- **Descrição:** transformar o Compêndio do VTT em biblioteca do que foi revelado na campanha — conteúdo narrativo, handouts e registros — sem confundi-lo com o compêndio global de regras.
- **Área afetada:** CompendioTab, conteúdo narrativo, navegação e permissões.
- **Prioridade sugerida:** P1
- **Dependências:** CONT-01, CONT-02, NAV-01; CONT-05 pode ser entregue depois sobre a mesma base.
- **Critérios de aceite:** abas internas e fontes de cada aba documentadas; jogadores só veem material autorizado; narrador tem prévia da visão de jogador; itens abrem detalhe consistente; busca/filtros não misturam catálogo global sem indicação.
- **Dúvidas antes da implementação:** conteúdos de regras revelados entram aqui ou apenas narrativos? Handouts têm aba própria? O narrador vê privados no Compêndio ou somente em Conteúdo da campanha?

### COMP-02 — Implementar anotações pessoais e registros automáticos

- **Status:** Bloqueada
- **Descrição:** criar bloco individual de anotações por jogador, separar notas livres de registros automáticos e representar cada entrada como item navegável dentro de abas apropriadas.
- **Área afetada:** Compêndio, notas, sessões e autorização por usuário.
- **Prioridade sugerida:** P1
- **Dependências:** COMP-01, CONT-04.
- **Critérios de aceite:** cada jogador cria/edita/exclui somente suas notas; narrador segue política de visibilidade aprovada; uma entrada automática por sessão, idempotente e com data; nota livre nunca é sobrescrita por automação; ordenação/busca e estados vazios definidos.
- **Dúvidas antes da implementação:** o narrador pode ler notas pessoais? Jogadores podem compartilhar uma nota? Registros automáticos incluem quais informações além de data e participantes? Podem ser editados?

## 10. Movimento, ferramentas e tempo

### MOVE-01 — Permitir travessia advertida de barreiras e terreno difícil

- **Status:** Bloqueada
- **Descrição:** ajustar pathfinding/arrasto para permitir atravessar áreas e tokens bloqueadores, destacando o trecho em vermelho, mostrando aviso, mantendo metros visíveis e aplicando custo de terreno difícil. Corrigir a perda da contagem ao passar sobre objeto.
- **Área afetada:** movimento, pathfinding, mapa tático, medição e feedback visual.
- **Prioridade sugerida:** P0
- **Dependências:** definir multiplicador/custo exato da travessia e se o movimento pode terminar sobre bloqueador.
- **Critérios de aceite:** rota não é interrompida nem perde metragem; cada trecho proibido é destacado; aviso acessível e não apenas por cor; custo calculado de modo determinístico para token multicelular; servidor aceita/rejeita pela mesma regra; testes com área, objeto e token bloqueador.
- **Dúvidas antes da implementação:** atravessar custa sempre 2×? É permitido terminar numa célula bloqueada/ocupada? Token aliado/inimigo tem regra diferente? O aviso exige confirmação antes de soltar?

### TOOL-01 — Atualizar iconografia da ferramenta de marcação

- **Status:** Pronta (concluída)
- **Andamento (2026-09-20):** **o conjunto não era escolha de interface** — são os quatro valores que `vtt_marks.sinal` aceita, e acrescentar um quinto é mudança de banco. Isso responde “quais marcas fazem parte do primeiro conjunto”.
- **Achado estrutural:** o mapeamento sinal→glifo existia em DUAS cópias — `PainelMarcar` e `MapaHex`. O próprio `MapaHex` trazia escrito que mapa e janela “nunca mostram desenhos diferentes pro mesmo sinal”, e mantinha a cópia ao lado assim mesmo. Unificado em `_dominio/sinaisDeMarca.ts`.
- **Decisão sobre os glifos** (a dúvida em aberto era Figma ou família nova): família nova, dentro do lucide que o projeto já usa. O critério foi a silhueta a 16–24px, onde o detalhe interno some: `Navigation` saiu de **rota** porque a seta é a forma do cursor, e a mesma silhueta em dois papéis é o que confunde num mapa cheio; `FileText` saiu de **nota** porque um documento com linhas, reduzido, vira um retângulo listrado difícil de separar de qualquer outro retângulo. Entraram `Route` (linha sinuosa) e `StickyNote` (quadrado com dobra). Os quatro passam a ter contornos distintos: círculo com cruz, triângulo, linha sinuosa, quadrado com dobra.
- Sete critérios verificados em `scripts/dev/check-iconografia-marcacao.ts`, incluindo que os quatro desenham geometrias diferentes no mapa e que abrir a ferramenta ou trocar de sinal não desloca a barra nem redimensiona o painel.
- **Descrição:** substituir os ícones atuais por um conjunto coerente e distinguível nos tamanhos reais, mantendo rótulos e atalhos.
- **Área afetada:** PainelMarcar, toolbar e ícones.
- **Prioridade sugerida:** P2
- **Dependências:** seleção/aprovação dos ícones.
- **Critérios de aceite:** cada ação é reconhecível a 16–24 px; estado ativo e tooltip claros; SVGs seguem cor por token; nenhum deslocamento na barra; contraste e foco preservados.
- **Dúvidas antes da implementação:** existe referência no Figma ou deve ser proposta uma família nova? Quais marcas fazem parte do primeiro conjunto?

### TOOL-02 — Criar ferramenta de desenho livre

- **Status:** Bloqueada
- **Descrição:** permitir traços sobre a cena com criação, preview, persistência, sincronização, seleção e remoção, usando a infraestrutura de objetos/camadas quando compatível.
- **Área afetada:** mapa, toolbar, camadas, realtime, banco e exportação de cena.
- **Prioridade sugerida:** P2
- **Dependências:** contrato de desenho e permissões; decisão de camada.
- **Critérios de aceite:** traço fluido e simplificado; cor/espessura conforme escopo aprovado; persistência por cena; sincronização sem eco; undo/remoção; jogadores seguem permissão; desempenho aceitável com volume limite.
- **Dúvidas antes da implementação:** jogadores podem desenhar? Há borracha, desfazer e seleção? Traço pertence a qual camada? Quais estilos/cores? Há desenho temporário?

### TOOL-03 — Criar ferramenta de texto no mapa

- **Status:** Bloqueada
- **Descrição:** inserir, editar, mover, estilizar e remover textos na cena, com autorização e sincronização consistentes com outras entidades do mapa.
- **Área afetada:** mapa, toolbar, camadas, realtime e banco.
- **Prioridade sugerida:** P2
- **Dependências:** decisões de texto/camada/permissão; fundação compartilhada com TOOL-02 quando aplicável.
- **Critérios de aceite:** criação e edição por teclado; posição persistente; renderização consistente em zoom; seleção/movimento/remoção; sanitização do conteúdo; jogadores só veem/editam conforme regra.
- **Dúvidas antes da implementação:** texto rico ou simples? Tamanho/cor/alinhamento editáveis? Pode ser exclusivo do narrador? Escala com mapa ou permanece tamanho de HUD?

### TIME-01 — Criar relógio e clima persistentes da campanha

- **Status:** Bloqueada
- **Descrição:** criar estado de dia, horário e condições climáticas editável pelo narrador e visível pelos jogadores, separado do relógio real e vinculado à campanha ou cena conforme decisão.
- **Área afetada:** ferramenta de tempo, banco, realtime, HUD e permissões.
- **Prioridade sugerida:** P2
- **Dependências:** definir calendário, escopo e relação com cenas/sessões.
- **Critérios de aceite:** narrador edita; jogadores leem em tempo real; estado persiste; timezone real não interfere; valores inválidos são rejeitados; histórico/log opcional segue decisão aprovada.
- **Dúvidas antes da implementação:** calendário gregoriano ou fictício? Estado é por campanha, cena ou sessão? O tempo avança automaticamente? Quais campos formam “condições climáticas”?

### TIME-02 — Sortear clima e condições

- **Status:** Bloqueada
- **Descrição:** oferecer ao narrador geração aleatória de clima somente depois de existir tabela/algoritmo e contexto de aplicação aprovados.
- **Área afetada:** ferramenta de tempo, tabelas aleatórias e log.
- **Prioridade sugerida:** P3
- **Dependências:** TIME-01; possivelmente ROLLTAB-02.
- **Critérios de aceite:** distribuição testável/determinística quando seedada; preview antes de aplicar; somente narrador sorteia; resultado aplicado ao estado canônico; log conforme regra.
- **Dúvidas antes da implementação:** quais tabelas, pesos, biomas, estações e transições? Sorteio altera hora/dia? Resultado é secreto até confirmação?

## 11. Tokens

### TOK-01 — Oferecer “Criar ficha” para token avulso

- **Status:** Bloqueada
- **Descrição:** adicionar a ação no menu contextual e no editor do token, criando/vinculando uma ficha sem duplicidade.
- **Área afetada:** GerenciadorToken, MenuContextual, criação de personagem e vínculo token–ficha.
- **Prioridade sugerida:** P1
- **Dependências:** definir tipo de ficha e valores herdados; CHAR-04/CHAR-05 se houver escolha PN/Aliado.
- **Critérios de aceite:** ação só aparece sem ficha vinculada; ambos os pontos abrem o mesmo fluxo; criação e vínculo são atômicos; nome/retrato herdados conforme regra; cancelar não altera token; autorização server-side.
- **Dúvidas antes da implementação:** ficha criada é PJ, PN ou escolha? Quais dados do token são copiados? O token passa a herdar atualizações da ficha? Jogador pode usar a ação?

### TOK-02 — Implementar visibilidade exclusiva do narrador

- **Status:** Bloqueada
- **Descrição:** adicionar estado persistente de visibilidade “somente narrador” ao token, com edição no controle segmentado e filtragem server-side/realtime para jogadores.
- **Área afetada:** token, mapa, RLS/RPCs, realtime, ferramentas do narrador.
- **Prioridade sugerida:** P0
- **Dependências:** definir se invisível também bloqueia colisão/interação e se narradores adicionais existem.
- **Critérios de aceite:** jogador não recebe dado sensível ou projeção do token; narrador distingue o estado; alternância sincroniza; seleção em grupo pode aplicar a ação; logs não vazam o token; testes negativos com cliente jogador.
- **Dúvidas antes da implementação:** token oculto ainda bloqueia movimento/visão? Seus efeitos aparecem no chat? “Narrador” significa apenas dono atual? O estado persiste entre cenas/duplicações?

### TOK-03 — Criar zona automática de tokens do narrador

- **Status:** Bloqueada
- **Descrição:** criar área na qual tokens colocados recebem automaticamente visibilidade exclusiva do narrador, com feedback antes e depois da mudança.
- **Área afetada:** mapa, áreas, ferramentas do narrador e token.
- **Prioridade sugerida:** P2
- **Dependências:** TOK-02; definição da geometria e persistência da zona.
- **Critérios de aceite:** entrada na zona aplica estado de forma idempotente; saída segue regra aprovada; criação/movimento em grupo funciona; área só aparece/edita para narrador; sincronização não pisca token para jogador.
- **Dúvidas antes da implementação:** sair da área torna o token visível automaticamente? Pode haver várias zonas? É uma região do mapa, uma bandeja fora do mapa ou uma camada HUD? A zona existe por cena?

### TOK-04 — Criar menu contextual para seleção múltipla

- **Status:** Pronta (concluída)
- **Andamento (2026-09-20):** menu de lote com virar, duplicar, ocultar/revelar, bloquear/desbloquear e remover, cada um com a quantidade no rótulo. **Decisões tomadas:** virar gira **cada token no próprio eixo**, não a formação — virar é só o olhar e nunca move célula (0135), enquanto girar a formação moveria tokens de célula, que é operação de movimento com colisão e autorização próprias; duplicar e bloquear mantêm exatamente a semântica da ação de token único, porque um menu de lote que inventasse semântica faria o mesmo verbo significar duas coisas conforme quantos tokens estivessem marcados. O valor pedido é **absoluto**, não alternância: numa seleção misturada, alternar mandaria metade para o lado oposto da outra. Falha é **nomeada**, não contada. Remover confirma listando nomes. Onze critérios (`scripts/dev/check-tokens-selecao-multipla.ts`).
- **Descrição:** ao clicar com botão direito numa seleção de vários tokens, oferecer duplicar, virar esquerda/direita, ocultar, bloquear e remover, operando o conjunto de forma coerente.
- **Área afetada:** seleção em grupo, MenuContextual, mutações de token e autorização.
- **Prioridade sugerida:** P1
- **Dependências:** TOK-02 para ocultar; auditar operações em grupo e RPC existente de movimento.
- **Critérios de aceite:** menu indica quantidade; ações indisponíveis têm motivo; operação é atômica ou relata falhas por token sem estado ambíguo; confirmação para remover; rotação preserva formação quando aplicável; jogador vê apenas ações autorizadas.
- **Dúvidas antes da implementação:** “virar” altera cada token no próprio eixo ou a formação inteira? Duplicatas mantêm ficha vinculada? Bloquear significa movimento, edição ou ambos?

### TOK-05 — Corrigir rotação do token colossal

- **Status:** Pronta (concluída)
- **Andamento:** migration `0136_vtt_projecao_direcao_token.sql` aplicada ao Supabase com autorização do usuário. Ela acrescenta `direcao` à projeção `read_vtt_scene_tokens`, que antes omitia o campo gravado pela rotação e fazia o cliente assumir zero ao reler. Definição remota conferida antes e depois da aplicação; leitura real validada contra os valores persistidos de 48 tokens, incluindo 4 colossais e 6 direções diferentes de zero, sem alterar os tokens. O teste de contrato e os oito testes de domínio de rotação passaram. A validação visual dos controles e da sincronização entre navegadores foi feita manualmente pelo usuário em 2026-09-20, com resultado aprovado; tarefa encerrada. Verificação remota reproduzível: `node scripts/dev/check-vtt-projecao-direcao-remoto.mjs` (sem `--apply`, somente leitura).
- **Descrição:** corrigir a regressão que impede girar tokens de tamanho colossal. Distinguir a direção visual do token da orientação de sua pegada simétrica: a pegada colossal pode continuar ocupando as mesmas células ao rotacionar, mas isso não deve bloquear a ação de virar nem a atualização da direção do token.
- **Área afetada:** menu contextual do token, atalhos de rotação, `VttClient`, apresentação do token, persistência de `direcao` e pegada colossal.
- **Prioridade sugerida:** P1
- **Dependências:** nenhuma.
- **Critérios de aceite:** token colossal pode virar para a esquerda e para a direita por todos os controles atualmente suportados; indicador/retrato muda para a direção escolhida; `direcao` persiste após recarregar e sincroniza em outros clientes; a pegada continua com 13 células válidas e não produz colisão falsa; tokens dos demais tamanhos não sofrem regressão; há teste específico para seis rotações consecutivas e para concorrência/revisão.
- **Dúvidas antes da implementação:** o defeito ocorre no menu contextual, nos atalhos Q/E, durante o posicionamento inicial ou em todos esses caminhos? A intenção é apenas virar a direção visual ou também oferecer novamente a ação separada “Girar a forma”?

## 12. Ajustes visuais do VTT

### VIS-01 — Padronizar switches e títulos da aba Camadas

- **Status:** Pronta (concluída)
- **Andamento (2026-09-20):** os títulos de grupo da aba Camadas **já eram** caixa alta (`.rv-fp-rotulo`). Faltavam os rótulos de interruptor e os nomes de camada. **Decisão tomada** sobre a dúvida em aberto: `text-transform`, não texto em maiúsculas no TSX — assim o nome acessível continua sendo lido como palavra, não soletrado. Nome de camada caiu de 12px para 11px porque caixa alta ocupa mais largura e a lista tem nomes longos que não podem truncar. “Fundo do mapa” virou “Mapa”; o rótulo homônimo em `PainelImagens` **não** mudou, porque ali significa outra coisa (papel da imagem: fundo vs peça).
- **Descrição:** trocar textos de switches pela fonte em caixa alta adotada no VTT; usar títulos em caixa alta na aba Camadas; renomear “Fundo do mapa” para “MAPA”.
- **Área afetada:** CSS VTT, PainelCamadas e componentes de switch.
- **Prioridade sugerida:** P2
- **Dependências:** tokens tipográficos de AUTH-02, se compartilhados.
- **Critérios de aceite:** todos os switches do VTT auditados; texto visual em caixa alta sem alterar nome acessível desnecessariamente; “MAPA” aplicado; sem truncamento; snapshots dos painéis afetados.
- **Dúvidas antes da implementação:** caixa alta deve ser conteúdo real ou `text-transform`? Há exceções para labels longos?

### VIS-02 — Permitir extravasamento das linhas de botões de rolagem

- **Status:** Pronta (concluída, com conferência visual pendente)
- **Alvo identificado pelo usuário (2026-09-20):** são os **anéis do botão de carga** (`RollButton`, “Solte para lançar”), do painel de rolagem do Console. Eles crescem 1,5× pela animação `rup-charge-ring` e nasciam dentro do próprio botão — qualquer ancestral que role (`.rc-body`, `.rv-dados-corpo`) recorta o que passa da borda.
- **Andamento:** os anéis passaram a ser desenhados no `body`, por portal, sobre a caixa medida do botão. O recorte deixa de existir por construção, e a camada inteira é `pointer-events: none`, então a área clicável não cresce. Mesma solução usada em DICE-01.
- **Pendente:** **conferência a olho.** Não consegui disparar a carga em teste automatizado — o botão só habilita com `rolarNaMesa` presente, que vem do provedor de dados da mesa, e o caminho até o Console aberto de dentro da campanha tem etapas demais para ser estável. O check cobre o que dá (o botão existe; a camada decorativa não rouba o clique) e diz isso explicitamente. Basta segurar o botão e ver se os anéis saem inteiros.
- **Descrição:** ajustar stacking/overflow para que linhas decorativas ultrapassem o container sem serem cortadas e sem ampliar a área clicável.
- **Área afetada:** botões e painéis de rolagem.
- **Prioridade sugerida:** P2
- **Dependências:** nenhuma.
- **Critérios de aceite:** linhas completas nos tamanhos suportados; não interceptam ponteiro; não criam scroll; foco continua visível; modais/painéis vizinhos mantêm clipping necessário.
- **Dúvidas antes da implementação:** qual extensão exata e em quais variantes de botão?

## 13. Dados e rolagens

### DICE-01 — Corrigir camada, área e escala dos dados 3D

- **Status:** Pronta (concluída)
- **Andamento (2026-09-20):** escala **medida**, não estimada: o circunraio ia de 0,82 (d12) a 1,265 (d10) — o d10 saía **54% maior** que o menor, confirmando a queixa. Depois da normalização, variação de 0,00%. **Decisão tomada** sobre a dúvida em aberto: a referência é o **circunraio**, não altura nem volume — altura depende de como o dado caiu, e volume igual deixaria o d4 enorme porque um tetraedro aproveita mal a esfera que o contém. A normalização mede e escala, em vez de usar fatores fixos, para valer a qualquer sólido futuro. Achado no caminho: `geo.scale()` do three não recomputa a esfera envolvente. A arena saiu do palco (que é `overflow: hidden`) para o `body`, por portal, em z 900 — a faixa reservada à direita existia para o dado não assentar embaixo da janela “Rolar Dados”, e acima de tudo o motivo desapareceu. **Isto contraria um comentário de projeto** que dizia que os dados nunca tampam um controle; `pointer-events: none` mantém a diferença entre cobrir e bloquear, e o check clica num controle com a arena por cima. **Confirmado pelo usuário em 2026-09-20.**
- **Dúvida respondida (2026-09-20):** os dados **devem** cobrir também menus e tooltips. Os do produto são DOM e já ficam por baixo da arena. Menu de contexto e tooltip **nativos do sistema operacional** são desenhados fora da página e nenhum `z-index` os alcança — limite físico, registrado para não virar bug reaberto.
- **Descrição:** renderizar a arena acima de modal, painéis e overlays; remover a restrição da área esquerda; calibrar a escala aparente por sólido, especialmente o d10.
- **Área afetada:** MesaDadosOverlay, ArenaDados, PolyDie, layout e z-index do VTT.
- **Prioridade sugerida:** P1
- **Dependências:** inventário de todos os stacking contexts e portais.
- **Critérios de aceite:** dados visíveis sobre toda superfície do VTT; arena cobre viewport utilizável sem bloquear controles após a rolagem; d4/d6/d8/d10/d12/d20 têm escala aparente coerente; resultado e física não mudam; teste em resoluções suportadas.
- **Dúvidas antes da implementação:** dados devem cobrir também menus do sistema/tooltip? Qual referência define a escala — diâmetro, volume ou altura visual?

### DICE-02 — Definir e implementar personalização de dados 3D

- **Status:** Bloqueada
- **Descrição:** especificar opções permitidas, persistência e limites de acessibilidade/desempenho antes de criar a personalização por jogador.
- **Área afetada:** preferências de conta, renderizador 3D, assets e sincronização de rolagem.
- **Prioridade sugerida:** P2
- **Dependências:** decisão de produto/design; DICE-01.
- **Critérios de aceite:** catálogo de propriedades aprovado; preferência persiste no escopo definido; outros jogadores veem ou não veem conforme regra; combinações mantêm legibilidade; fallback para hardware reduzido; nenhuma textura remota insegura.
- **Dúvidas antes da implementação:** personalizar cor, material, números, efeitos e/ou modelo? Os demais veem os dados do autor? Há upload de textura? Preferência é global ou por campanha/personagem?

### ROLL-01 — Adicionar modo MENOR à rolagem livre

- **Status:** Bloqueada
- **Descrição:** estender o seletor para `SOMAR | MAIOR | MENOR` e calcular/exibir o menor resultado com o mesmo contrato de logs e dados 3D.
- **Área afetada:** PainelDados/RoladorDados, domínio de rolagem e cards de chat.
- **Prioridade sugerida:** P1
- **Dependências:** CHAT-01 para apresentação padronizada.
- **Critérios de aceite:** modo persistido apenas se esse for o padrão atual; cálculo unitário testado; empate definido; card identifica MENOR; atalhos e teclado funcionam; dados 3D não alteram resultado.
- **Dúvidas antes da implementação:** MENOR escolhe um dado, soma os N menores ou aplica por grupo/termo? Modificadores entram antes ou depois da seleção?

### ROLLTAB-01 — Especificar tabelas de rolagem do narrador

- **Status:** Bloqueada
- **Descrição:** definir estrutura e comportamento de tabelas gerais, incluindo encontros aleatórios, antes de persistir ou executar resultados.
- **Área afetada:** produto, conteúdo da campanha, rolagens e chat.
- **Prioridade sugerida:** P2
- **Dependências:** decisões do responsável de produto; possível integração com CONT-01.
- **Critérios de aceite:** especificação de faixas/pesos, dados/fórmula, entradas, resultados compostos, visibilidade, edição, importação e histórico; exemplos com encontros aleatórios; permissões aprovadas.
- **Dúvidas antes da implementação:** d100 por faixa ou pesos genéricos? Resultado pode disparar macro/criar encontro ou só texto? Rolagem pode ser secreta? Tabelas pertencem à campanha, sistema ou usuário? Aceitam referência a conteúdo?

### ROLLTAB-02 — Implementar ferramenta de tabelas de rolagem

- **Status:** Bloqueada
- **Descrição:** criar editor, executor e histórico das tabelas aprovadas, restritos ao narrador e integrados ao chat/conteúdo quando definido.
- **Área afetada:** nova ferramenta VTT, banco, rolagens, chat e Conteúdo da campanha.
- **Prioridade sugerida:** P2
- **Dependências:** ROLLTAB-01, CHAT-01, CONT-02 se houver referências narrativas.
- **Critérios de aceite:** CRUD autorizado; validação detecta lacunas/sobreposição quando aplicável; sorteio testável; resultado público/privado conforme escolha; realtime e log; exportação/importação se aprovada.
- **Dúvidas antes da implementação:** respondidas em ROLLTAB-01.

## 14. Apresentação de imagens

### IMG-01 — Especificar experiência de apresentação aos jogadores

- **Status:** Bloqueada
- **Descrição:** definir o ciclo completo de uma apresentação inspirada no Roll20: origem da imagem, público, overlay, controles, duração, substituição e encerramento.
- **Área afetada:** produto, biblioteca de imagens, tokens, realtime e HUD dos jogadores.
- **Prioridade sugerida:** P1
- **Dependências:** política de seleção de jogadores; infraestrutura de imagem existente.
- **Critérios de aceite:** wireflow aprovado para narrador/jogador; estado canônico e efêmero/persistente decidido; permissões e fallback definidos; comportamento em reconexão e múltiplas apresentações especificado.
- **Dúvidas antes da implementação:** jogador pode fechar sozinho? Narrador sabe quem ainda está vendo? Uma apresentação substitui a anterior? Pode selecionar jogadores? Token apresenta retrato, imagem original ou escolha? Há zoom/download?

### IMG-02 — Implementar apresentação direta, de imagem e de token

- **Status:** Bloqueada
- **Descrição:** permitir apresentação sem colocar no mapa e adicionar “Apresentar aos jogadores” às interações de imagem da cena e token, todos apontando para o mesmo mecanismo.
- **Área afetada:** BibliotecaImagens, MenuContextual, imagem de cena, token, realtime e overlay.
- **Prioridade sugerida:** P1
- **Dependências:** IMG-01; TOK-02 para não vazar token exclusivo do narrador.
- **Critérios de aceite:** três pontos de entrada convergem; público autorizado recebe overlay; token oculto não é apresentado acidentalmente; nova apresentação/encerramento sincroniza; loading/erro de asset tratados; acesso ao arquivo respeita autorização.
- **Dúvidas antes da implementação:** respondidas em IMG-01.

## 15. Combate, iluminação e feedbacks

### CMB-01 — Substituir componentes de combate pelos componentes do Figma

- **Status:** Pronta após dependência
- **Descrição:** mapear os componentes de combate do Figma aos estados reais da trilha de turnos e substituir a camada visual atual, incluindo trilhas de PJ e PN, sem reescrever regras existentes.
- **Área afetada:** painel de rodadas, trilhas de facções, componentes e CSS de combate.
- **Prioridade sugerida:** P1
- **Dependências:** acesso/versão aprovada do Figma; CHAR-04/CHAR-05 para categorias novas quando entrarem.
- **Critérios de aceite:** matriz design→estado real documentada; todos os estados atuais representados; ações continuam autorizadas; responsividade nos breakpoints suportados; comparação visual com Figma; testes de transição de turno sem regressão.
- **Dúvidas antes da implementação:** qual arquivo/node e versão do Figma são canônicos? A troca é apenas visual ou altera interação? Como a trilha de Aliado é representada?

### LIGHT-01 — Especificar iluminação dinâmica

- **Status:** Bloqueada
- **Descrição:** detalhar fontes de luz, visão, paredes, permissões, desempenho e diferenças entre narrador/jogador; produzir modelo técnico e protótipo de desempenho antes do produto final.
- **Área afetada:** regras, mapa, tokens, paredes, renderização, realtime e configurações.
- **Prioridade sugerida:** P0 de descoberta; implementação posterior
- **Dependências:** regras definitivas e metas de hardware.
- **Critérios de aceite:** especificação de luz/visão/oclusão; matriz de permissões; formatos de dados; orçamento de desempenho; estratégia de fallback; protótipo mede cenas pequenas e grandes; interação com token oculto e áreas definida.
- **Dúvidas antes da implementação:** visão 360° ou cone? Escuridão global? Luz colorida/animada? Paredes são segmentos, polígonos ou derivadas de objetos? Cada token usa visão do controlador? O narrador vê tudo e/ou prévia do jogador? Quais limites de fontes/segmentos?

### LIGHT-02 — Implementar iluminação dinâmica

- **Status:** Bloqueada
- **Descrição:** construir editor de paredes/luzes, persistência, sincronização e renderização com base exclusiva na especificação aprovada e no protótipo de desempenho.
- **Área afetada:** VTT completo, mapa, tokens, ferramentas, banco e renderizador.
- **Prioridade sugerida:** P1 após desbloqueio
- **Dependências:** LIGHT-01, TOK-02.
- **Critérios de aceite:** critérios derivados da especificação; autorização server-side; visão por jogador correta; fallback funcional; sem vazamento visual de entidades ocultas; orçamento de frame/memória cumprido.
- **Dúvidas antes da implementação:** respondidas em LIGHT-01.

### FX-01 — Adicionar feedback acessível de estado crítico

- **Status:** Bloqueada
- **Descrição:** criar sistema extensível de feedbacks visuais, começando por vinheta vermelha pulsante em PV baixo, com opção de reduzir/desativar e alternativa não dependente de animação/cor.
- **Área afetada:** HUD do jogador, preferências, recursos do personagem e acessibilidade.
- **Prioridade sugerida:** P2
- **Dependências:** definir limiar e escopo; reaproveitar preferência de redução de movimento.
- **Critérios de aceite:** efeito deriva do estado real do personagem controlado; `prefers-reduced-motion` e preferência manual removem pulso; opção desativar persiste; há ícone/texto alternativo; não cobre modais nem interfere em interação; múltiplos personagens seguem regra aprovada.
- **Dúvidas antes da implementação:** qual limiar — percentual, valor fixo ou condição? Qual personagem determina o efeito quando há vários controlados? Narrador vê o efeito? Outros estados entram no primeiro corte?

## 16. Mecânicas bloqueadas e ferramenta de trama

### ACCESS-01 — Especificar e implementar ferramenta de Acesso

- **Status:** Bloqueada
- **Descrição:** não implementar até que as regras completas de fechaduras, senhas, rolagem oculta e descoberta de resultados sejam fornecidas. Depois disso, separar a entrega em modelo/desafio, interface do narrador, interface do jogador e auditoria de segredo.
- **Área afetada:** regras, rolagens secretas, VTT, chat e conteúdo de cena.
- **Prioridade sugerida:** P1 após desbloqueio
- **Dependências:** regras completas de Acesso.
- **Critérios de aceite:** regras versionadas; informação secreta nunca enviada ao cliente do jogador antes de descoberta; tentativas, sucesso/falha e reset definidos; testes de autorização e replay; UX para narrador e jogador aprovada.
- **Dúvidas antes da implementação:** dados, dificuldades, número de tentativas, pistas, consequências, quem participa, quando revelar, persistência do desafio e vínculo com objeto/token ainda precisam ser definidos.

### PLOT-01 — Especificar domínio e interação da ferramenta de trama

- **Status:** Bloqueada
- **Descrição:** definir o que são ícones e terrenos de trama, como se conectam e editam, qual o modelo de camada e como funciona a audiência global ou por jogadores selecionados.
- **Área afetada:** produto, mapa/canvas, permissões, realtime e storage.
- **Prioridade sugerida:** P2
- **Dependências:** regras/conteúdo visual de trama; sistema de seleção de audiência.
- **Critérios de aceite:** vocabulário de nós/terrenos/relações; operações de edição; visibilidade e seleção de público; persistência e versionamento; wireframe sobre mapa sem bloquear leitura; limites de desempenho.
- **Dúvidas antes da implementação:** trama é grafo, mapa simbólico ou desenho livre? O que “terreno” significa nesse modo? Usa coordenadas do mapa normal? Jogadores podem interagir ou só ver? Alterações privadas podem ser reveladas parcialmente?

### PLOT-02 — Implementar camada de trama

- **Status:** Bloqueada
- **Descrição:** criar a camada sobre o VTT, editor de ícones/terrenos, persistência e publicação por audiência conforme especificação aprovada.
- **Área afetada:** VTT, camadas, toolbar, realtime, banco e permissões.
- **Prioridade sugerida:** P2
- **Dependências:** PLOT-01; TOK-02/CONT-02 se reutilizar visibilidade seletiva.
- **Critérios de aceite:** alternância não descarrega nem obstrui o mapa; edição autorizada; jogadores recebem somente projeção destinada a eles; sincronização e reconexão corretas; volume limite mantém desempenho; exportação/duplicação de cena segue regra.
- **Dúvidas antes da implementação:** respondidas em PLOT-01.

## 17. Sequenciamento recomendado

### Onda 0 — decisões e contratos bloqueadores

1. PRES-01, CONT-01, INV-01, SET-01 e CHAT-02.
2. Regras curtas de SESS-01, MOVE-01, ROLL-01 e FX-01.
3. Referências/escopos de CMB-01, CHAR-04, CHAR-05, TAB-01–03 e TOK-01.
4. Especificações maiores ROLLTAB-01, IMG-01, LIGHT-01, ACCESS-01 e PLOT-01.

### Onda 1 — verdade de estado e fundações

1. CAMP-01 e CAMP-02.
2. SESS-01 e SESS-02.
3. PRES-02.
4. CONT-02 e CONT-04.
5. TOK-02.
6. CHAT-01.

### Onda 2 — fluxos principais

1. DASH-01, NET-01 e PART-01.
2. CONT-03, CONT-05, COMP-01 e COMP-02.
3. CHAR-01–05 conforme desbloqueio.
4. INV-02, INV-03, EQP-01 e EQP-02.
5. MOVE-01, TOK-01, TOK-04 e TOK-05.
6. CHAT-03 e CMB-01.

### Onda 3 — expansão e polimento

1. CON-01–04, TAB-01–04, VIS-01–02 e TOOL-01.
2. DICE-01–02, ROLL-01 e FX-01.
3. TOOL-02–03, TIME-01–02 e TOK-03.
4. ROLLTAB-02, IMG-02, LIGHT-02, ACCESS-01 e PLOT-02 conforme desbloqueio.

## 18. Itens que não devem entrar em implementação ainda

Até decisão explícita, permanecem bloqueados:

- semântica e implementação de “Aparecer offline”;
- configurações definitivas da mesa;
- taxonomia/visibilidade do conteúdo narrativo e Compêndio;
- PN, Aliado e slots livres sem regras completas;
- inventário/mochilas e janelas definitivas de equipado;
- Identidade, detalhes de Magias/Escalpos e Bando Refratário;
- padrão de ações de card do chat;
- desenho, texto e tempo/clima nas partes sem contrato;
- personalização de dados, tabelas de rolagem e apresentação de imagens;
- iluminação dinâmica, Acesso e ferramenta de trama.

Este bloqueio não impede pesquisa, auditoria do código, protótipos descartáveis de desempenho ou elaboração das especificações listadas. Ele impede migrations e funcionalidades de produto baseadas em suposição.
