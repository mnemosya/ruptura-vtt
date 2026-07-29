# ADITIVO AO PRD — CONTAS, CAMPANHAS, CONVITES E ACESSO A PERSONAGENS

**Produto:** Ruptura VTT  
**Status:** decisão de produto  
**Escopo:** autenticação, entrada em campanhas, convites, participantes, personagens, menu geral da conta e navegação da campanha  
**Documento-base:** `PRD Ruptura VTT.md`

---

## ÍNDICE

- [1. OBJETIVO](#1-objetivo)
- [2. PRECEDÊNCIA SOBRE O PRD PRINCIPAL](#2-precedência-sobre-o-prd-principal)
- [3. MODELO CONCEITUAL](#3-modelo-conceitual)
  - [3.1 Conta](#31-conta)
  - [3.2 Campanha](#32-campanha)
  - [3.3 Participação na campanha](#33-participação-na-campanha)
  - [3.4 Personagem](#34-personagem)
  - [3.5 Controle de personagem](#35-controle-de-personagem)
- [4. AUTENTICAÇÃO E PÁGINA INICIAL](#4-autenticação-e-página-inicial)
  - [4.1 Login](#41-login)
  - [4.2 Página após o login](#42-página-após-o-login)
  - [4.3 Menu geral da conta](#43-menu-geral-da-conta)
- [5. CRIAÇÃO DE CAMPANHA](#5-criação-de-campanha)
  - [5.1 Menu da campanha para jogadores](#51-menu-da-campanha-para-jogadores)
  - [5.2 Menu da campanha para narradores](#52-menu-da-campanha-para-narradores)
  - [5.3 Regras gerais de navegação da campanha](#53-regras-gerais-de-navegação-da-campanha)
- [6. CONVITE ASSOCIADO A E-MAIL](#6-convite-associado-a-e-mail)
  - [6.1 Criação](#61-criação)
  - [6.2 Link personalizado](#62-link-personalizado)
  - [6.3 Entrada normal sem usar o link](#63-entrada-normal-sem-usar-o-link)
- [7. CONVITE LIMPO](#7-convite-limpo)
  - [7.1 Definição](#71-definição)
  - [7.2 Comportamento](#72-comportamento)
  - [7.3 Gestão](#73-gestão)
- [8. PAINEL DO NARRADOR — JOGADORES E CONVITES](#8-painel-do-narrador-jogadores-e-convites)
- [9. PERSONAGENS DA CAMPANHA](#9-personagens-da-campanha)
  - [9.1 Página do narrador](#91-página-do-narrador)
  - [9.2 Acesso do narrador](#92-acesso-do-narrador)
  - [9.3 Acesso do jogador](#93-acesso-do-jogador)
  - [9.4 Abertura da ficha](#94-abertura-da-ficha)
- [10. ENTRADA NA CAMPANHA E SELEÇÃO DE PERSONAGEM](#10-entrada-na-campanha-e-seleção-de-personagem)
  - [10.1 Jogador com um personagem](#101-jogador-com-um-personagem)
  - [10.2 Jogador com vários personagens](#102-jogador-com-vários-personagens)
  - [10.3 Jogador sem personagem](#103-jogador-sem-personagem)
  - [10.4 Narrador entrando na campanha](#104-narrador-entrando-na-campanha)
- [11. CRIAÇÃO E ATRIBUIÇÃO DE PERSONAGEM](#11-criação-e-atribuição-de-personagem)
  - [11.1 Criação pelo narrador](#111-criação-pelo-narrador)
  - [11.2 Criação pelo jogador](#112-criação-pelo-jogador)
  - [11.3 Atribuição pelo narrador](#113-atribuição-pelo-narrador)
  - [11.4 Personagem ativo](#114-personagem-ativo)
- [12. PRESENÇA E ACESSO CONCORRENTE](#12-presença-e-acesso-concorrente)
- [13. REQUISITOS DE UX](#13-requisitos-de-ux)
  - [13.1 Princípios](#131-princípios)
  - [13.2 Terminologia obrigatória na interface](#132-terminologia-obrigatória-na-interface)
  - [13.3 Feedback e redirecionamento](#133-feedback-e-redirecionamento)
  - [13.4 Limite de escopo da ficha](#134-limite-de-escopo-da-ficha)
  - [13.5 Heurísticas de Nielsen](#135-heurísticas-de-nielsen)
  - [13.6 Qualidade visual e sistema de interface](#136-qualidade-visual-e-sistema-de-interface)
  - [13.7 Arquitetura de informação e redução de complexidade](#137-arquitetura-de-informação-e-redução-de-complexidade)
  - [13.8 Acessibilidade](#138-acessibilidade)
  - [13.9 Estados e feedback](#139-estados-e-feedback)
  - [13.10 Salvamento automático](#1310-salvamento-automático)
  - [13.11 Desfazer e refazer alterações na ficha](#1311-desfazer-e-refazer-alterações-na-ficha)
  - [13.12 Desempenho percebido](#1312-desempenho-percebido)
  - [13.13 Validação de usabilidade](#1313-validação-de-usabilidade)
- [14. REQUISITOS DE SEGURANÇA](#14-requisitos-de-segurança)
- [15. MODELO DE DADOS DE ALTO NÍVEL](#15-modelo-de-dados-de-alto-nível)
- [16. CRITÉRIOS DE ACEITE](#16-critérios-de-aceite)
  - [16.1 Autenticação e dashboard](#161-autenticação-e-dashboard)
  - [16.2 Convite por e-mail](#162-convite-por-e-mail)
  - [16.3 Convite limpo](#163-convite-limpo)
  - [16.4 Personagens](#164-personagens)
  - [16.5 Segurança e isolamento](#165-segurança-e-isolamento)
  - [16.6 UX](#166-ux)
  - [16.7 Navegação](#167-navegação)
  - [16.8 Qualidade de UX e UI](#168-qualidade-de-ux-e-ui)
  - [16.9 Salvamento automático e histórico de alterações](#169-salvamento-automático-e-histórico-de-alterações)
- [17. DECISÕES AINDA PENDENTES](#17-decisões-ainda-pendentes)
- [18. STATUS FINAL DO ADITIVO](#18-status-final-do-aditivo)

---

## 1. OBJETIVO

Este aditivo redefine o fluxo de entrada no Ruptura VTT.

O modelo anterior, baseado em perfil de mesa escolhido por link e jogador sem login próprio, é substituído por um modelo de:

- conta global autenticada por e-mail e senha;
- campanhas associadas à conta;
- convites por e-mail ou por link limpo;
- participação da conta em uma ou mais campanhas;
- personagens pertencentes à campanha;
- controle de personagens concedido aos jogadores;
- acesso irrestrito do narrador aos personagens da própria campanha.

O objetivo é eliminar fluxos técnicos e confusos como:

- criar perfil;
- selecionar perfil;
- vincular personagem manualmente;
- liberar perfil bloqueado;
- entrar novamente para trocar de personagem.

A interface deve trabalhar com conceitos compreensíveis para a pessoa usuária:

- **Conta**
- **Campanha**
- **Jogador**
- **Convite**
- **Personagem**
- **Controle de personagem**

---

## 2. PRECEDÊNCIA SOBRE O PRD PRINCIPAL

Este aditivo substitui os requisitos anteriores que definem:

- jogador entrando sem login próprio;
- seleção de perfil ao abrir o link da mesa;
- perfil como identidade principal dentro da campanha;
- link individual como única forma de acesso;
- bloqueio de perfil para impedir acesso duplicado;
- vínculo entre perfil e personagem como etapa exposta ao usuário;
- primeiro acesso baseado em um “perfil” ainda sem personagem.

Continuam válidos:

- uma conta poder participar de várias campanhas;
- o narrador administrar participantes, personagens, permissões e estado da mesa;
- cada campanha possuir formas próprias de convite;
- presença em tempo real;
- seletor de personagem para quem controla mais de um personagem;
- assistente de criação de personagem;
- permissões privilegiadas do narrador.

Em caso de conflito, este aditivo prevalece nas áreas de autenticação, campanha, convite, participante e personagem.

---

## 3. MODELO CONCEITUAL

### 3.1 Conta

A conta é a identidade global da pessoa no Ruptura VTT.

Campos de produto:

- e-mail;
- senha gerenciada pelo provedor de autenticação;
- nome de exibição;
- avatar, quando disponível;
- preferências pessoais;
- data de criação;
- último acesso.

Identificadores internos, comparação de e-mails e confirmação de propriedade do endereço são detalhes técnicos do sistema de autenticação e não devem aparecer como campos ou etapas na interface.

Uma mesma conta pode ser:

- narradora em uma campanha;
- jogadora em outra;
- participante de várias campanhas;
- controladora de mais de um personagem.

A conta não pertence a uma campanha específica.

### 3.2 Campanha

A campanha é o espaço persistente de jogo.

Ela possui:

- um ou mais narradores autorizados;
- jogadores;
- convites;
- personagens;
- conteúdo de campanha;
- estado de mesa;
- inventário do bando;
- logs;
- configurações;
- permissões.

### 3.3 Participação na campanha

A participação representa a relação entre uma conta e uma campanha.

Campos conceituais mínimos:

- campanha;
- conta;
- função;
- estado;
- permissões adicionais;
- data de entrada;
- último acesso à campanha.

Funções iniciais:

- **Narrador**
- **Jogador**

Estados iniciais:

- **Pendente**, quando existe convite por e-mail ainda sem conta correspondente;
- **Ativo**
- **Removido**

Não deve existir uma entidade de “perfil” separada para o jogador selecionar depois do login.

### 3.4 Personagem

O personagem pertence à campanha.

O personagem não deve ser propriedade exclusiva e inseparável da conta que o criou. O controle é uma permissão concedida separadamente.

Isso permite:

- personagem criado pelo narrador antes da entrada do jogador;
- personagem ainda sem jogador;
- troca de jogador sem mover ou duplicar a ficha;
- controle compartilhado, quando permitido;
- PNs e personagens de apoio;
- acesso administrativo do narrador;
- arquivamento sem apagar histórico.

### 3.5 Controle de personagem

O controle define quais jogadores podem abrir e operar determinado personagem.

Requisitos:

- o narrador pode atribuir ou remover controle;
- um jogador pode controlar um ou mais personagens;
- um personagem pode ficar sem jogador;
- o narrador acessa todos os personagens da campanha sem precisar ser atribuído como controlador;
- a interface deve distinguir personagem controlado de personagem apenas visível, quando houver permissões parciais.

---

## 4. AUTENTICAÇÃO E PÁGINA INICIAL

### 4.1 Login

Jogadores e narradores usam o mesmo sistema de autenticação:

- e-mail;
- senha;
- recuperação de senha;
- verificação de e-mail quando necessária;
- encerramento de sessão.

Não existe login separado de narrador e jogador. A função é definida em cada campanha.

### 4.2 Página após o login

Depois de entrar, a pessoa é levada para **Minhas Campanhas**.

A página mostra todas as campanhas associadas à conta autenticada.

Cada campanha deve apresentar, no mínimo:

- nome;
- imagem ou marcador visual;
- função da pessoa: Narrador ou Jogador;
- personagem utilizado mais recentemente, quando houver;
- quantidade de personagens controlados, quando relevante;
- data ou indicador de atividade recente;
- ação principal para entrar.

Exemplo:

```text
MINHAS CAMPANHAS

Ecos de Vosek
Narradora · 12 personagens
[ Entrar na campanha ]

Cinzas de Braxus
Jogadora · Mara Venn
[ Abrir campanha ]
```

Estados vazios:

- conta sem campanha;
- convite pendente associado ao e-mail;
- campanha removida ou indisponível;
- conta sem personagem controlado naquela campanha.

### 4.3 Menu geral da conta

O menu geral existe fora das campanhas e representa somente ações da conta.

Estrutura mínima:

```text
Conta
├── Minhas Campanhas
├── Criar Campanha
├── Conta e preferências
└── Sair
```

Requisitos:

- **Minhas Campanhas** é a entrada principal depois do login;
- **Criar Campanha** permite que qualquer conta crie uma campanha e se torne Narradora nela;
- **Conta e preferências** reúne nome de exibição, avatar e demais preferências pessoais;
- **Sair** encerra a sessão;
- personagens, convites, Biblioteca, Mercado e configurações de campanha não aparecem no menu geral da conta;
- quando a pessoa estiver dentro de uma campanha, a interface deve manter uma forma simples de voltar para **Minhas Campanhas** ou trocar de campanha.

---

## 5. CRIAÇÃO DE CAMPANHA

Uma conta pode criar várias campanhas.

Ao criar uma campanha, a conta se torna narradora dela.

Campos mínimos:

- nome;
- descrição opcional;
- imagem opcional;
- configurações iniciais;
- permissões de criação de personagem;
- configuração dos convites.

Depois da criação, a interface leva ao painel da campanha como Narrador.

### 5.1 Menu da campanha para jogadores

O jogador vê somente as áreas de jogo e consulta:

```text
Campanha
├── Mesa
├── Personagens
├── Bando
├── Mercado
└── Biblioteca
```

#### Mesa

Área de entrada da sessão e do estado compartilhado da campanha.

#### Personagens

Mostra somente os personagens controlados pela conta naquela campanha.

#### Bando

Reúne inventário e recursos compartilhados do grupo.

#### Mercado

Reúne loja, compra de itens e envio para personagem ou inventário do bando.

#### Biblioteca

Reúne regras e conteúdo publicado disponível naquela campanha.

### 5.2 Menu da campanha para narradores

O narrador vê as mesmas áreas de jogo e uma seção adicional de gerenciamento:

```text
Campanha

JOGO
├── Mesa
├── Personagens
├── Bando
├── Mercado
└── Biblioteca

GERENCIAR
├── Jogadores e convites
└── Configurações
```

Requisitos:

- **Jogadores e convites** aparece somente para narradores;
- **Configurações** aparece somente para narradores;
- **Personagens** abre a lista completa de personagens da campanha para o narrador;
- o narrador não precisa assumir controle de um personagem para abrir sua ficha;
- a interface do narrador deve ampliar a interface de campanha, sem criar um produto ou layout completamente separado.

### 5.3 Regras gerais de navegação da campanha

- campanha e função atual devem permanecer identificáveis na interface;
- jogador e narrador compartilham a mesma estrutura-base de campanha;
- opções administrativas são adicionadas conforme a função;
- rotas administrativas não devem ser exibidas nem acessíveis a jogadores;
- clicar em **Personagens** nunca deve levar a uma tela de perfis ou vínculos técnicos;
- o menu da campanha não deve tentar reproduzir a organização interna da ficha.

---

## 6. CONVITE ASSOCIADO A E-MAIL

### 6.1 Criação

Na área **Jogadores e convites**, o narrador pode informar um e-mail e convidar essa pessoa para a campanha.

Ao associar o e-mail:

- é criado um convite vinculado à campanha e ao e-mail informado;
- a função inicial é Jogador;
- se já existir uma conta com esse e-mail, a participação pode ser ativada diretamente;
- se ainda não existir conta, o convite permanece pendente;
- quando a pessoa criar ou acessar uma conta com o mesmo e-mail, a participação é ativada automaticamente.

Não deve existir uma confirmação adicional de “aceitar convite” depois que a identidade por e-mail for validada.

### 6.2 Link personalizado

O narrador pode copiar ou enviar um link personalizado daquele convite.

O link contém um token opaco. O e-mail não deve ser usado como credencial e não precisa aparecer diretamente na URL.

Ao abrir o link:

#### Pessoa sem conta

- a tela de criação de conta é exibida;
- o e-mail convidado já aparece preenchido;
- o e-mail não pode ser silenciosamente trocado por outro;
- depois da criação e validação da conta, a pessoa entra automaticamente na campanha.

#### Pessoa com conta correta

- faz login, quando necessário;
- entra automaticamente na campanha.

#### Pessoa autenticada com outro e-mail

- recebe uma explicação clara de que o convite pertence a outro e-mail;
- pode sair e entrar com a conta correta;
- não pode reivindicar o convite com a conta atual.

### 6.3 Entrada normal sem usar o link

O link personalizado é uma conveniência, não uma exigência.

Se o e-mail já estiver associado à campanha, a pessoa pode:

1. entrar normalmente no Ruptura VTT;
2. acessar **Minhas Campanhas**;
3. encontrar a campanha associada;
4. entrar nela.

---

## 7. CONVITE LIMPO

### 7.1 Definição

O convite limpo não é associado previamente a um e-mail.

Qualquer pessoa com o link pode entrar ou criar uma conta e ser adicionada automaticamente à campanha como Jogador.

Fluxo:

```text
Abrir convite
→ Entrar ou criar conta
→ Ser adicionado à campanha
→ Entrar na campanha
```

Não existe:

- aprovação posterior;
- seleção de perfil;
- reivindicação manual;
- etapa separada de aceitar convite;
- exigência de o narrador associar o e-mail depois.

### 7.2 Comportamento

O link limpo:

- pertence a uma campanha;
- concede a função Jogador;
- pode ser reutilizável;
- continua válido até ser revogado ou substituído;
- pode ser copiado novamente pelo narrador;
- deve ser armazenado de forma segura por token opaco;
- nunca concede função de Narrador.

Depois da autenticação, a entrada na campanha deve ocorrer automaticamente.

### 7.3 Gestão

Na área **Jogadores e convites**, o narrador pode:

- copiar o convite limpo;
- revogar;
- gerar um novo;
- ver se está ativo;
- desativar temporariamente, caso essa opção seja implementada.

Revogar o link impede novas entradas. Não remove jogadores que já entraram.

---

## 8. PAINEL DO NARRADOR — JOGADORES E CONVITES

Esta é uma área exclusiva do narrador. A campanha deve ter uma área única chamada **Jogadores e convites**.

Ela substitui interfaces separadas ou técnicas de:

- perfis;
- memberships;
- vínculos;
- sessões de perfil;
- associação manual de personagem fora do contexto da campanha.

A tela deve mostrar:

### Jogadores ativos

- nome de exibição;
- e-mail;
- função;
- presença;
- personagens controlados;
- último acesso;
- ações administrativas.

### Convites por e-mail pendentes

- e-mail;
- data do convite;
- estado;
- copiar link personalizado;
- reenviar;
- cancelar.

### Convite limpo

- estado ativo ou revogado;
- copiar link;
- revogar;
- gerar novo.

### Ações do narrador

- convidar por e-mail;
- criar ou copiar convite limpo;
- atribuir personagem;
- remover controle;
- alterar função, quando permitido;
- remover participante da campanha.

A interface não deve expor IDs internos, regras de banco ou nomes técnicos.

---

## 9. PERSONAGENS DA CAMPANHA

### 9.1 Página do narrador

O narrador deve ter acesso direto a uma página **Personagens** dentro da campanha.

A página precisa permitir:

- criar quantos personagens forem necessários;
- buscar por nome;
- filtrar;
- ordenar;
- abrir qualquer ficha;
- identificar o jogador controlador;
- identificar personagens sem jogador;
- atribuir ou remover controle;
- duplicar;
- arquivar;
- restaurar, quando aplicável;
- excluir com confirmação e regras de segurança.

Filtros mínimos recomendados:

- Todos;
- Jogadores;
- Sem jogador;
- PNs;
- Arquivados.

Cada card ou linha deve mostrar:

- retrato ou marcador;
- nome;
- alcunha, quando houver;
- tipo ou classificação;
- jogador ou jogadores controladores;
- estado resumido;
- última alteração;
- ação **Abrir ficha**.

### 9.2 Acesso do narrador

O narrador:

- pode abrir todos os personagens da campanha;
- pode editar todos os personagens;
- pode criar personagens ilimitados;
- não precisa ser adicionado como controlador;
- pode acessar personagens de jogadores;
- pode acessar personagens sem jogador;
- pode trocar o personagem atualmente visualizado sem sair da campanha.

Esse acesso decorre da função de Narrador na campanha.

### 9.3 Acesso do jogador

O jogador:

- vê os personagens que controla;
- abre apenas personagens autorizados;
- pode trocar entre personagens controlados;
- não precisa sair ou autenticar novamente;
- não vê fichas privadas de outros jogadores sem permissão explícita.

### 9.4 Abertura da ficha

Ao selecionar **Abrir ficha**, a interface deve abrir diretamente a ficha operacional do personagem.

A referência de produto para essa ficha é o protótipo:

`Ruptura — Console do Refratário.html`

Nesta fase, o PRD estabelece apenas que:

- a ficha é apresentada como um **Console do Refratário**;
- ela é uma interface operacional própria, não uma sequência de páginas do menu da campanha;
- o menu da campanha continua oferecendo retorno fácil para **Personagens**;
- o narrador consegue trocar rapidamente entre fichas da campanha;
- o jogador consegue trocar entre os personagens que controla;
- a estrutura interna, abas, painéis e hierarquia visual da ficha serão especificadas em uma fase própria.

Não definir neste aditivo uma divisão obrigatória da ficha em páginas como “Jogo”, “Inventário”, “Magia”, “Talentos” ou “Histórico”.

---

## 10. ENTRADA NA CAMPANHA E SELEÇÃO DE PERSONAGEM

### 10.1 Jogador com um personagem

Quando o jogador controla apenas um personagem, a campanha pode abrir diretamente esse personagem.

A interface deve evitar uma tela de seleção desnecessária.

### 10.2 Jogador com vários personagens

Quando controla mais de um personagem:

- o sistema pode abrir o último utilizado;
- deve existir um seletor de personagem persistente e fácil de encontrar;
- a troca ocorre dentro da campanha;
- a seleção não altera os vínculos;
- a conta continua a mesma.

### 10.3 Jogador sem personagem

Quando o jogador entra numa campanha sem controlar nenhum personagem, a interface mostra um estado vazio claro.

Exemplo:

```text
Você ainda não controla um personagem nesta campanha.
```

As ações exibidas dependem da configuração da campanha:

- **Criar personagem**, quando jogadores puderem criar;
- informação de que o narrador precisa atribuir um personagem, quando a criação não estiver liberada.

Não deve existir um botão genérico de “vincular personagem” para o jogador.

### 10.4 Narrador entrando na campanha

O narrador não precisa escolher um personagem para entrar.

Ele deve chegar ao painel da campanha, com acesso rápido a:

- Mesa;
- Personagens;
- Bando;
- Mercado;
- Biblioteca;
- Jogadores e convites;
- Configurações.

Ao abrir a ficha de um personagem, deve continuar fácil voltar à lista de personagens ou trocar para outro.

---

## 11. CRIAÇÃO E ATRIBUIÇÃO DE PERSONAGEM

### 11.1 Criação pelo narrador

O narrador pode criar personagens diretamente na página **Personagens**.

Ao iniciar:

- escolhe criar um personagem novo;
- abre o assistente de criação;
- o personagem já nasce dentro da campanha;
- pode ficar sem jogador;
- pode ser atribuído durante ou depois da criação.

Não deve existir uma etapa posterior obrigatória de mover o personagem para a campanha.

### 11.2 Criação pelo jogador

Quando a campanha permitir criação por jogadores:

- o jogador sem personagem recebe a ação **Criar personagem**;
- o assistente já conhece a campanha;
- ao concluir, o personagem pertence à campanha;
- o jogador recebe controle automaticamente;
- a ficha é aberta;
- não existe uma etapa posterior de vínculo.

### 11.3 Atribuição pelo narrador

Na página **Personagens**, o narrador pode atribuir controle por meio de uma ação contextual simples:

```text
Atribuir jogador
```

A interface lista os jogadores ativos da campanha.

A atribuição deve:

- conceder acesso ao personagem;
- atualizar a listagem de jogadores;
- atualizar a listagem de personagens;
- manter o personagem na mesma campanha;
- não duplicar a ficha.

### 11.4 Personagem ativo

“Personagem ativo” significa somente o personagem atualmente aberto por aquela conta na campanha.

Não representa propriedade, vínculo exclusivo ou bloqueio permanente.

---

## 12. PRESENÇA E ACESSO CONCORRENTE

O heartbeat continua útil para:

- mostrar quem está online;
- indicar presença na campanha;
- registrar último acesso;
- limpar indicadores obsoletos.

Ele não deve bloquear a conta nem impedir entrada porque existe outra aba ou dispositivo aberto.

O modelo antigo de “perfil em uso” e “liberar perfil” deixa de ser requisito de produto.

Conflitos de edição devem ser tratados por:

- atualizações em tempo real;
- operações atômicas;
- revisão ou versão do estado;
- avisos de conflito quando necessário;
- permissões de escrita.

Presença não deve ser usada como substituto de autorização.

---

## 13. REQUISITOS DE UX

### 13.1 Princípios

Os fluxos devem seguir estas regras:

1. A conta autenticada identifica a pessoa; não pedir seleção de perfil.
2. A campanha deve ser o principal contexto de navegação.
3. Personagem pertence à campanha e controle é uma permissão.
4. O sistema deve escolher automaticamente o caminho quando só existe uma opção válida.
5. A interface deve revelar decisões apenas quando elas forem necessárias.
6. Termos técnicos internos não aparecem para jogadores ou narradores.
7. Toda tela vazia deve explicar o estado e oferecer a próxima ação válida.
8. O usuário sempre deve saber em qual campanha e personagem está.
9. Trocar de personagem não exige sair da campanha.
10. O narrador deve acessar jogadores e personagens em no máximo um nível a partir do painel da campanha.
11. O menu geral da conta não deve misturar conteúdo de uma campanha específica.
12. Jogador e narrador compartilham o mesmo menu-base de campanha; o narrador recebe a seção adicional **Gerenciar**.
13. A navegação da campanha não deve impor a organização interna da ficha.
14. A implementação deve seguir boas práticas consolidadas de UX e produzir uma interface visualmente coerente, legível e razoavelmente bem-acabada.
15. As heurísticas de usabilidade de Nielsen devem orientar as decisões sempre que forem adequadas ao contexto e não conflitarem com uma regra específica de Ruptura.
16. A interface não deve reproduzir diretamente a estrutura do banco, das rotas, dos payloads ou dos serviços internos.
17. Clareza, previsibilidade e velocidade de uso têm prioridade sobre ornamentação visual.
18. Alterações persistentes devem ser salvas automaticamente; a interface não deve depender de botão **Salvar**.
19. Alterações reversíveis da ficha devem oferecer desfazer e refazer por teclado.

### 13.2 Terminologia obrigatória na interface

Usar:

- Conta
- Campanha
- Jogador
- Narrador
- Convite
- Personagem
- Personagem controlado
- Atribuir jogador
- Minhas Campanhas
- Jogadores e convites

Evitar:

- Perfil
- Membership
- Owner ID
- Vínculo de personagem
- Reivindicar perfil
- Liberar perfil
- Sessão de perfil
- Associar registro
- Personagem órfão

### 13.3 Feedback e redirecionamento

Depois de ações bem-sucedidas:

- login normal → **Minhas Campanhas**;
- convite por e-mail → campanha correspondente;
- convite limpo → campanha correspondente;
- criação de campanha → painel da campanha;
- criação de personagem por jogador → ficha do personagem;
- criação de personagem por narrador → ficha ou lista de personagens, conforme origem da ação;
- atribuição de personagem → permanecer no contexto atual com confirmação clara.

### 13.4 Limite de escopo da ficha

Este aditivo não define o redesenho interno da ficha.

A ficha deve ser tratada como o **Console do Refratário**, tomando o arquivo `Ruptura — Console do Refratário.html` como referência inicial de direção visual e operacional.

Uma fase posterior deve especificar:

- arquitetura de informação interna;
- agrupamento de recursos e estados;
- ações e rolagens;
- comportamento do Modo Jogo e do Modo Evolução;
- densidade, responsividade e acessibilidade;
- integração com chat, log e estado de mesa.

Até essa fase, não converter a ficha em um conjunto arbitrário de páginas baseado apenas nos módulos técnicos do backend.

### 13.5 Heurísticas de Nielsen

A interface deve aplicar, quando pertinentes, as dez heurísticas de Nielsen:

1. **Visibilidade do estado do sistema:** ações, carregamentos, salvamentos, erros, convites, presença e alterações devem apresentar retorno perceptível.
2. **Correspondência com o mundo real:** usar linguagem de mesa e de jogo, evitando termos técnicos de implementação.
3. **Controle e liberdade:** permitir cancelar, voltar, desfazer e sair de fluxos sem perder trabalho válido.
4. **Consistência e padrões:** elementos equivalentes devem manter nome, posição, aparência e comportamento coerentes.
5. **Prevenção de erros:** bloquear ou explicar ações inválidas antes que provoquem perda de dados ou estados incoerentes.
6. **Reconhecimento em vez de memorização:** opções, contexto, personagem e campanha atuais devem permanecer visíveis quando necessários.
7. **Flexibilidade e eficiência:** oferecer caminhos rápidos para usuários experientes sem comprometer a compreensão de quem está aprendendo.
8. **Estética e design minimalista:** mostrar primeiro o que é relevante para a tarefa atual e reduzir ruído visual.
9. **Reconhecimento e recuperação de erros:** mensagens devem explicar o problema, seu impacto e a ação possível para corrigir.
10. **Ajuda e documentação:** oferecer instruções contextuais nos pontos em que a interface ou a regra exigirem explicação.

As heurísticas devem orientar o projeto, não ser aplicadas mecanicamente. Quando duas heurísticas entrarem em tensão, a decisão deve favorecer a tarefa principal, a frequência de uso e o risco do erro.

### 13.6 Qualidade visual e sistema de interface

A UI deve possuir um sistema visual consistente, ainda que simples.

Requisitos mínimos:

- hierarquia tipográfica clara;
- escala consistente de espaçamento;
- componentes reutilizáveis;
- estados visuais definidos para hover, foco, ativo, desabilitado, carregando, sucesso e erro;
- contraste suficiente entre texto, fundo e controles;
- alinhamento e densidade coerentes;
- ícones acompanhados de rótulo ou explicação quando o significado não for universal;
- ações primárias e destrutivas visualmente distinguíveis;
- áreas clicáveis com tamanho adequado;
- ausência de controles improvisados ou visualmente incompatíveis entre páginas;
- uso disciplinado de cor, sem depender somente dela para comunicar estado;
- acabamento visual compatível com uma aplicação utilizável, evitando aparência de protótipo técnico cru.

O sistema visual pode adotar a direção estética de Ruptura, mas ambientação e ornamentação não podem reduzir legibilidade, contraste ou compreensão.

### 13.7 Arquitetura de informação e redução de complexidade

Cada tela deve possuir:

- objetivo principal identificável;
- ação principal evidente;
- informações agrupadas por tarefa;
- hierarquia entre conteúdo essencial, secundário e avançado;
- navegação previsível;
- estados vazios, de carregamento, erro e indisponibilidade;
- textos curtos que expliquem a próxima ação quando necessário.

Usar divulgação progressiva para opções raras, avançadas ou administrativas. Não apresentar todas as capacidades do sistema simultaneamente apenas porque elas existem no backend.

### 13.8 Acessibilidade

A interface deve buscar conformidade com WCAG 2.2 nível AA nas áreas principais.

Requisitos mínimos:

- navegação por teclado;
- foco visível;
- rótulos acessíveis em campos e botões;
- estrutura semântica adequada;
- contraste de texto e controles;
- mensagens de erro associadas ao campo correspondente;
- avisos dinâmicos comunicados por regiões apropriadas;
- não depender apenas de cor, posição ou animação;
- respeitar preferência por redução de movimento;
- modais com foco controlado e retorno ao elemento de origem;
- alvos de interação suficientemente grandes.

A primeira versão continua desktop first, mas não deve criar barreiras desnecessárias para ampliação de texto, telas menores ou tecnologias assistivas.

### 13.9 Estados e feedback

Toda operação assíncrona ou persistente deve comunicar seu estado.

Estados mínimos:

- carregando;
- salvando;
- salvo;
- falha ao salvar;
- vazio;
- sem permissão;
- indisponível;
- convite inválido ou revogado;
- sessão expirada;
- conflito de edição, quando aplicável.

Não usar silêncio como resposta para falha. Mensagens devem ser específicas e, sempre que possível, oferecer tentativa novamente ou caminho de recuperação.

### 13.10 Salvamento automático

Toda alteração persistente deve ser salva automaticamente.

Requisitos:

- não usar botão genérico **Salvar** em fichas, formulários, configurações ou edições comuns;
- salvar alterações em segundo plano depois da interação, com atraso curto quando necessário para evitar requisições excessivas;
- apresentar estados discretos de **Salvando**, **Salvo** e **Falha ao salvar**;
- manter a interface responsiva enquanto a persistência acontece;
- preservar alterações ao navegar entre áreas da aplicação;
- tentar concluir alterações pendentes antes de fechar ou trocar de página;
- avisar a pessoa apenas quando houver risco real de perda por falha de persistência;
- permitir nova tentativa quando o salvamento falhar;
- evitar sobrescrever silenciosamente uma versão mais recente em caso de conflito;
- salvar automaticamente rascunhos do assistente de criação e permitir retomada posterior;
- manter a separação entre estado local temporário, estado persistido e estado compartilhado da campanha.

A ausência de botão **Salvar** não elimina ações semânticas que representam uma decisão própria, como:

- **Criar campanha**;
- **Concluir personagem**;
- **Publicar conteúdo**;
- **Comprar**;
- **Enviar convite**;
- **Arquivar**;
- **Excluir**;
- **Encerrar rodada**;
- **Encerrar cena**.

Essas ações não são salvamento manual. Elas confirmam operações específicas, transações ou mudanças de estado deliberadas.

### 13.11 Desfazer e refazer alterações na ficha

Alterações reversíveis realizadas na ficha devem poder ser desfeitas pelo teclado.

Atalhos obrigatórios:

- **Ctrl + Z** no Windows e Linux;
- **Cmd + Z** no macOS;
- **Ctrl + Shift + Z** ou **Ctrl + Y** para refazer no Windows e Linux;
- **Cmd + Shift + Z** para refazer no macOS.

Requisitos:

- desfazer a alteração reversível mais recente aplicada ao personagem atualmente aberto;
- refazer uma alteração desfeita enquanto nenhuma nova alteração incompatível tiver sido realizada;
- salvar automaticamente o estado resultante do desfazer ou refazer;
- manter uma pilha de histórico por ficha e por sessão de edição;
- preservar a funcionalidade nativa de desfazer texto quando o foco estiver dentro de um campo textual;
- fora de campos textuais, aplicar o atalho ao histórico global da ficha;
- oferecer também uma ação contextual **Desfazer** após mudanças relevantes, quando isso melhorar a recuperação de erro;
- registrar reversões compartilhadas de maneira auditável quando elas alterarem estado de campanha;
- não permitir que um jogador desfaça mudanças para as quais não possui permissão;
- não remover silenciosamente registros históricos importantes, como rolagens já publicadas ou logs da mesa;
- quando uma ação produzir vários efeitos inseparáveis, desfazê-los como uma única operação.

Exemplos de alterações reversíveis:

- ajuste manual de PV, PE, Mana ou Integridade;
- aplicação ou remoção de condição;
- gasto ou recuperação de PA e reações;
- alteração de munição, cargas, MIT ou PD;
- equipar, guardar ou mover item;
- mudança manual em campos da ficha;
- aplicação de dano, cura ou efeito que ainda possa ser revertido pelas regras de permissão.

Ações destrutivas ou transacionais podem exigir confirmação e não precisam entrar na mesma pilha de desfazer quando a reversão gerar inconsistência. Isso inclui, por exemplo, excluir personagem, efetuar compra já registrada, remover participante ou publicar conteúdo.

### 13.12 Desempenho percebido

A UX deve considerar desempenho percebido:

- resposta visual imediata ao clique;
- evitar mudanças bruscas de layout;
- usar carregamento localizado em vez de bloquear a página inteira quando possível;
- preservar contexto ao voltar;
- evitar recarregamentos completos desnecessários;
- manter filtros, busca e seleção durante a navegação quando isso reduzir retrabalho;
- não exigir etapas adicionais apenas para refletir limitações internas da implementação.

### 13.13 Validação de usabilidade

Fluxos centrais devem ser validados em navegador real, não apenas por inspeção de código.

Fluxos mínimos:

- criar conta e entrar;
- visualizar campanhas associadas;
- criar campanha;
- convidar por e-mail;
- entrar por convite limpo;
- acessar campanha como jogador;
- acessar campanha como narrador;
- criar personagem;
- atribuir personagem;
- abrir e trocar de personagem;
- retornar da ficha para a campanha.

A validação deve observar:

- quantidade de etapas;
- clareza dos rótulos;
- presença de becos sem saída;
- erros recuperáveis;
- duplicação de decisões;
- exposição de conceitos técnicos;
- compreensão do estado atual;
- consistência visual.

Não considerar um fluxo aprovado apenas porque ele funciona tecnicamente.

---

## 14. REQUISITOS DE SEGURANÇA

- Convite associado a e-mail só pode ser ativado pela conta autenticada com o mesmo e-mail.
- Convites usam tokens opacos e não previsíveis.
- Token bruto não deve ser persistido quando for possível armazenar somente hash.
- O convite limpo nunca concede permissão de Narrador.
- A autorização deve ser validada no servidor.
- O cliente não pode conceder a si mesmo participação, função ou controle.
- O narrador só administra campanhas em que possui essa função.
- Jogador não acessa personagem sem permissão de controle ou visualização.
- Narrador acessa todos os personagens da própria campanha, mas não de campanhas alheias.
- Revogação de convite impede novos usos.
- Remover jogador da campanha revoga seu acesso aos personagens daquela campanha.
- Trocar ou remover controle não apaga o personagem.

---

## 15. MODELO DE DADOS DE ALTO NÍVEL

O desenho físico pode aproveitar tabelas existentes, mas o comportamento deve representar estas relações:

```text
Conta
└── Participações em campanhas
    ├── função
    ├── estado
    └── permissões

Campanha
├── Participantes
├── Convites por e-mail
├── Convite limpo
├── Personagens
│   └── Controles concedidos a participantes
├── Estado de mesa
└── Logs
```

Entidades conceituais recomendadas:

- `accounts` ou identidade fornecida pelo provedor de autenticação;
- `campaigns`;
- `campaign_memberships`;
- `campaign_invites`;
- `characters`;
- `character_controllers`.

A implementação pode reutilizar tabelas ou nomes internos já existentes, desde que:

- não exponha o modelo antigo na interface;
- não preserve fluxos redundantes;
- mantenha integridade de autorização;
- remova ou recrie livremente os dados usados apenas durante o desenvolvimento.

Não há requisito de migração de dados de produção nesta fase, pois o VTT ainda não foi utilizado por jogadores reais.

---

## 16. CRITÉRIOS DE ACEITE

### 16.1 Autenticação e dashboard

- Jogador e narrador entram com e-mail e senha.
- A página inicial mostra somente campanhas associadas à conta.
- A função da conta é exibida por campanha.
- A conta pode ser narradora e jogadora em campanhas diferentes.
- Conta sem campanhas recebe estado vazio útil.

### 16.2 Convite por e-mail

- Narrador informa um e-mail.
- O sistema cria convite ou associação pendente.
- Conta existente com o mesmo e-mail recebe acesso.
- Conta nova recebe o e-mail preenchido no cadastro pelo link personalizado.
- Depois de autenticar, entra automaticamente na campanha.
- Conta com e-mail diferente não usa o convite.
- A campanha também aparece no login normal da conta convidada.
- Narrador pode cancelar ou reenviar.

### 16.3 Convite limpo

- Narrador copia um link limpo.
- Pessoa sem conta cria conta pelo link.
- Pessoa com conta entra pelo link.
- A conta é adicionada automaticamente como Jogador.
- A pessoa entra diretamente na campanha.
- Não existe confirmação adicional.
- O link pode ser reutilizado enquanto estiver ativo.
- Narrador pode revogar e gerar outro.
- Link revogado não aceita novos jogadores.

### 16.4 Personagens

- Narrador cria vários personagens na campanha.
- Narrador vê todos em uma lista central.
- Narrador abre qualquer ficha.
- Narrador atribui personagem a jogador sem duplicá-lo.
- Jogador vê apenas personagens autorizados.
- Jogador com um personagem entra diretamente nele.
- Jogador com vários troca pelo seletor.
- Jogador sem personagem recebe orientação clara.
- Criação autorizada pelo jogador já cria e atribui o personagem.
- Não existe etapa de “vincular personagem” para o jogador.

### 16.5 Segurança e isolamento

- Jogador de uma campanha não vê outra campanha sem associação.
- Jogador não acessa personagem não autorizado.
- Narrador não administra campanha alheia.
- Convite por e-mail exige correspondência com o e-mail da conta autenticada.
- Convite limpo concede somente função Jogador.
- Revogar convite não remove participantes já ativos.
- Remover participante revoga seus controles naquela campanha.

### 16.6 UX

- Nenhuma tela pede seleção de perfil.
- Nenhuma tela expõe membership ou IDs internos.
- Campanha atual permanece visível na navegação.
- Personagem atual permanece visível quando uma ficha está aberta.
- Narrador chega a Personagens e Jogadores e convites diretamente pelo painel.
- Fluxos com apenas uma opção avançam sem etapa intermediária.
- Erros informam o problema e a próxima ação possível.

### 16.7 Navegação

- O menu geral apresenta **Minhas Campanhas**, **Criar Campanha**, **Conta e preferências** e **Sair**.
- O menu do jogador apresenta **Mesa**, **Personagens**, **Bando**, **Mercado** e **Biblioteca**.
- O menu do narrador apresenta as mesmas áreas e adiciona **Jogadores e convites** e **Configurações** em uma seção de gerenciamento.
- Jogadores não veem nem acessam as rotas administrativas.
- **Personagens** mostra apenas personagens controlados para o jogador e todos os personagens para o narrador.
- Abrir um personagem leva diretamente ao **Console do Refratário**.
- A navegação da campanha permite voltar facilmente da ficha para a lista de personagens.
- O aditivo não impõe uma arquitetura interna de páginas para a ficha.

### 16.8 Qualidade de UX e UI

- Os fluxos centrais seguem as heurísticas de Nielsen quando aplicáveis.
- Cada tela possui objetivo e ação principal identificáveis.
- A interface apresenta feedback para carregamento, salvamento, sucesso e erro.
- Estados vazios orientam a próxima ação.
- A UI mantém tipografia, espaçamento, componentes e estados visuais consistentes.
- Ações destrutivas são distinguíveis e exigem confirmação proporcional ao risco.
- A interface não expõe conceitos técnicos do backend.
- Navegação por teclado e foco visível funcionam nas rotas principais.
- Cor não é o único meio de comunicar estado.
- A interface possui contraste suficiente nas áreas principais.
- Fluxos não são aprovados apenas por funcionarem tecnicamente; devem ser compreensíveis e utilizáveis em navegador real.
- A aparência final não pode permanecer como protótipo técnico cru ou conjunto inconsistente de componentes.

### 16.9 Salvamento automático e histórico de alterações

- Alterações persistentes são salvas automaticamente sem botão genérico **Salvar**.
- A interface informa discretamente os estados **Salvando**, **Salvo** e **Falha ao salvar**.
- Falhas de persistência permitem nova tentativa e não são ocultadas.
- Rascunhos da criação de personagem são salvos automaticamente e podem ser retomados.
- Navegar pela aplicação não descarta alterações já realizadas.
- **Ctrl + Z** e **Cmd + Z** desfazem alterações reversíveis na ficha.
- Os atalhos correspondentes de refazer restauram alterações desfeitas.
- Desfazer e refazer também são persistidos automaticamente.
- O desfazer nativo de texto continua funcionando dentro de campos textuais.
- Operações compostas são revertidas como uma unidade coerente.
- Permissões impedem que uma pessoa reverta alterações que não pode editar.
- Rolagens publicadas e logs históricos não são apagados silenciosamente pelo desfazer.

---

## 17. DECISÕES AINDA PENDENTES

Este aditivo não fixa definitivamente:

1. se jogadores podem criar personagens livremente, somente com aprovação ou apenas quando o narrador permitir;
2. se um personagem pode ser controlado simultaneamente por mais de um jogador em todas as campanhas ou apenas quando habilitado;
3. se haverá funções intermediárias, como assistente de narrador;
4. se o convite por e-mail terá expiração obrigatória;
5. se o convite limpo terá opção de limite de usos;
6. quais dados do jogador serão visíveis aos demais participantes;
7. como serão tratados personagens secretos ou fichas parcialmente visíveis;
8. qual será a política final de edição concorrente da mesma ficha.

Essas decisões podem ser acrescentadas sem reintroduzir o modelo de perfis.

---

## 18. STATUS FINAL DO ADITIVO

O fluxo-alvo passa a ser:

### Entrada normal

```text
Login com e-mail e senha
→ Minhas Campanhas
→ Abrir campanha
→ Abrir personagem controlado ou painel do narrador
```

### Convite por e-mail

```text
Narrador convida e-mail
→ Pessoa abre link ou entra normalmente
→ Cria conta ou faz login com o mesmo e-mail
→ Participação é ativada
→ Entra na campanha
```

### Convite limpo

```text
Pessoa abre o link
→ Cria conta ou faz login
→ É adicionada automaticamente
→ Entra na campanha
```

### Gestão do narrador

```text
Campanha
→ Personagens
→ Criar, abrir ou atribuir qualquer personagem
```

### Navegação

```text
Conta
→ Minhas Campanhas
→ Campanha
→ Mesa, Personagens, Bando, Mercado ou Biblioteca
```

Para narradores:

```text
Campanha
→ Gerenciar
→ Jogadores e convites ou Configurações
```

Ao abrir um personagem:

```text
Personagens
→ Console do Refratário
```

A estrutura interna do Console do Refratário será definida em uma fase própria.

Todas as alterações persistentes são salvas automaticamente, sem botão genérico **Salvar**. Alterações reversíveis da ficha podem ser desfeitas e refeitas por teclado, com o resultado novamente persistido de forma automática.

O conceito de perfil deixa de ser parte da experiência de usuário. A conta autenticada identifica a pessoa; a participação liga essa conta à campanha; e o controle liga o jogador aos personagens que pode operar.
