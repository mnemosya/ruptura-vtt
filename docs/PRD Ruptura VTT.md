# Ruptura VTT — Documento de Requisitos Consolidado

Versão de trabalho consolidada a partir do PRD principal e do caderno de automações/UX. As perguntas já respondidas foram incorporadas como decisão de produto. As pendências restantes ficam no final.

---

## 0. Visão e princípios

A plataforma existe para reduzir a carga operacional de um sistema crunch. O jogador já lida com atributos, perícias, vertentes, sobrecarga, colapso, condições, munição, mitigação, PA, reações e margem. A ferramenta assume cálculo, rastreio e organização, deixando para a mesa as decisões táticas e narrativas.

Princípios de produto:

1. **Cálculo automático.** Derivados, recuperação por descanso, penalidades de condição, gasto de munição, mitigação, bônus temporários e cadências de uso devem ser calculados pela plataforma.
2. **Automação reversível.** Todo efeito automático precisa ter override manual e desfazer. O estado base do personagem não deve ser destruído; efeitos funcionam como camadas ativas que podem ser ligadas, desligadas ou revertidas.
3. **Estado compartilhado.** A ficha, o chat, as rolagens, os efeitos públicos e o inventário compartilhado ficam na nuvem e atualizam para a mesa.
4. **Desktop first.** A primeira versão prioriza desktop. Mobile entra depois como adaptação, sem guiar a arquitetura inicial.
5. **Acessibilidade visual.** Cor de perfil deve ser reforçada por ícone, padrão ou outro marcador, para não depender só de cor.
6. **Conteúdo data-driven.** Itens, magias, talentos, condições, escalpos, runas, propriedades e automações de conteúdo devem vir de uma biblioteca administrável no banco, não de valores fixos no código.
7. **Nada invasivo em decisões narrativas.** Marca de Ruptura, Traço, cicatriz e distorção de identidade devem ser registráveis e sugeridos, mas nunca interromper a cena como trava obrigatória.

---

## 1. Papéis, contas e acesso

### 1.1 Narrador

- Possui cadastro e login.
- Pode criar várias mesas/campanhas na mesma conta.
- Cada mesa tem seu próprio link de convite.
- Administra perfis de jogadores, personagens, estado de mesa, logs, fichas e permissões.
- Pode liberar perfil bloqueado manualmente.
- Tem ferramentas privilegiadas de mesa: sussurro, rolagem oculta, aplicação de dano/condição, controle de rodada, controle de cena e visão geral dos personagens.

### 1.2 Jogador

- Entra por link, sem login próprio.
- O link leva à seleção do perfil associado.
- O narrador define um apelido ao gerar o link do jogador.
- Dentro do VTT, a presença do jogador aparece principalmente pelo nome do personagem ativo.
- Um perfil em uso fica bloqueado para evitar acesso duplicado.

### 1.3 Bloqueio e presença

- Usar heartbeat de presença.
- Se o jogador fechar a aba sem sair, o perfil é liberado após um tempo sem sinal.
- O narrador pode forçar a liberação a qualquer momento.

### 1.4 Link de convite

Decisão pendente. O modelo precisa ser apresentado de forma mais clara antes de fechar. Por enquanto, o requisito mínimo é: cada mesa possui um link de entrada. A opção de revogar e gerar novo link pode entrar como melhoria de segurança.

---

## 2. Arquitetura e persistência

Um backend é obrigatório. A plataforma precisa de contas de narrador, mesas persistentes, perfis bloqueáveis, chat e rolagens em tempo real, transferência de itens, inventário do bando e estado compartilhado.

Base recomendada:

- Supabase: Postgres, autenticação, storage e realtime.
- Firebase é alternativa válida, mas Supabase tende a encaixar melhor em dados relacionais densos como ficha, inventário, talentos, magias e estados.

Modelo de dados de alto nível:

```
Biblioteca do Sistema
 ├── Itens, armas, armaduras, escudos e explosivos
 ├── Magias, vertentes e especializações
 ├── Talentos
 ├── Condições e efeitos
 ├── Escalpos, runas, drones e robôs
 ├── Propriedades, tags e payloads de automação
 ├── Versões, status e changelog
 └── Importação/exportação de conteúdo

Campanha
 ├── Narrador
 ├── Links de convite / Perfis de acesso
 ├── Perfis
 │     └── Personagens
 │           ├── identidade
 │           ├── atributos
 │           ├── perícias
 │           ├── recursos atuais e máximos
 │           ├── PA, reações e turno
 │           ├── vertentes, magias e especializações
 │           ├── talentos
 │           ├── inventário
 │           ├── armas, armaduras, escudos e runas
 │           ├── escalpos
 │           ├── drones/robôs
 │           ├── sobrecarga, rupturas, marcas e traços
 │           ├── colapso e cicatrizes
 │           └── condições e efeitos ativos
 ├── Bando
 │     └── inventário compartilhado
 ├── Estado de combate
 │     ├── rodada
 │     ├── janela rápida/lenta
 │     ├── alternância PJ/PN
 │     └── turnos ativos
 └── Log da mesa
       ├── chat
       ├── rolagens públicas
       ├── rolagens privadas
       ├── cartões jogados na mesa
       └── alterações de estado
```

---

## 2.1 Administração de conteúdo e valores

O VTT deve tratar o conteúdo de Ruptura como dados administráveis. O código interpreta regras e payloads; a biblioteca guarda nomes, descrições, custos, raridade, tags, efeitos, ações e automações.

A administração de conteúdo precisa permitir trocar texto, preço, custo, dano, duração, requisito ou payload de automação sem alterar código-fonte.

### 2.1.1 Biblioteca do Sistema

A Biblioteca do Sistema é a fonte oficial de conteúdo dentro do VTT.

Conteúdos administráveis:

- itens;
- armas;
- armaduras;
- escudos;
- explosivos;
- farmácia;
- vertinas;
- ferramentas;
- dispositivos;
- magias;
- especializações;
- talentos;
- condições;
- escalpos;
- drones;
- robôs;
- runas;
- propriedades de arma;
- tags;
- custos;
- raridade;
- descrições;
- payloads de automação.

Cada registro da biblioteca deve possuir, no mínimo:

- ID interno;
- slug estável;
- nome;
- categoria;
- subtipo, quando aplicável;
- descrição curta;
- descrição longa;
- tags;
- status: rascunho, publicado ou arquivado;
- versão;
- data de criação;
- data de atualização;
- payload de automação, quando aplicável.

Exemplo de payload simplificado:

```json
{
  "id": "granada_choque",
  "nome": "Granada de Choque",
  "categoria": "Explosivo",
  "raridade": "Incomum",
  "preco": 350,
  "custoPA": 2,
  "alcance": "Arremesso",
  "area": "Raio de 3 m",
  "descricao": "Emite uma descarga elétrica em área, usada para incapacitar alvos e sobrecarregar dispositivos próximos.",
  "efeitos": [
    {
      "tipo": "dano",
      "dado": "1d6",
      "dano": "elétrico"
    },
    {
      "tipo": "condicao",
      "condicao": "Atordoado",
      "gatilho": "falha_resistencia"
    }
  ]
}
```

### 2.1.2 Painel administrativo

A plataforma deve ter um painel administrativo para gerenciar conteúdo.

Estrutura mínima:

```
Admin
 ├── Biblioteca do Sistema
 │    ├── Itens
 │    ├── Magias
 │    ├── Talentos
 │    ├── Condições
 │    ├── Escalpos
 │    ├── Runas
 │    ├── Propriedades
 │    └── Payloads de automação
 ├── Mesas
 ├── Personagens
 ├── Logs
 └── Importar/Exportar Conteúdo
```

Fluxo esperado para alterar a descrição de um item:

```
Admin → Biblioteca do Sistema → Itens → Item desejado → Editar descrição → Salvar rascunho → Publicar
```

A alteração publicada deve aparecer automaticamente nas fichas que consultam o modelo daquele item, salvo quando uma mesa estiver travada em uma versão anterior.

### 2.1.3 Modelos e instâncias

A plataforma deve separar modelo de conteúdo e instância em jogo.

**Modelo** é o registro oficial na biblioteca.

Exemplos:

- Pistola Vastrana;
- Granada de Choque;
- Fibra Explosiva;
- Atordoado;
- Aparar.

**Instância** é a cópia real em uso por personagem, inventário do bando, drone, robô ou mesa.

Exemplos:

- Pistola Vastrana específica no inventário de um personagem;
- escudo com PD atual reduzido;
- arma com runa instalada;
- item com nome customizado;
- granadas em quantidade específica.

Regra de atualização:

- texto, descrição, regra base, raridade, preço e payload padrão vêm do modelo;
- quantidade, munição, cargas, MIT atual, PD atual, runas instaladas, dano sofrido, customizações, apelidos e estado de uso ficam na instância.

Para armas de munição, a instância da arma guarda a munição atual do carregador/capacidade, o tipo de munição aceito e, quando relevante, o tipo de munição carregada. O estoque total de munição fica em itens quantitativos separados no inventário, sempre com tipo próprio: pistola, fuzil, escopeta, precisão, flecha, virote ou outro tipo publicado na biblioteca. Recarregar transfere munição compatível do estoque para a arma, consumindo apenas a quantidade transferida.

Arcos usam aljava. A aljava é uma instância de inventário com capacidade própria e pilhas de flechas agrupadas por tipo, como `Flecha simples (10)` e `Flecha flamejante (2)`. Ao atacar com arco, o jogador escolhe qual flecha da aljava será disparada. A flecha escolhida é consumida no ataque.

Exemplo de instância:

```json
{
  "itemId": "escudo_balistico",
  "instanceId": "item_9342",
  "pdAtual": 7,
  "pdMaximoOverride": null,
  "runasInstaladas": ["runa_reforco"],
  "nomeCustomizado": "Porta do Inferno"
}
```

### 2.1.4 Versões e publicação

Todo conteúdo administrável deve ter versão.

Fluxo recomendado:

```
Editar → Salvar como rascunho → Validar → Publicar → Registrar changelog
```

Estados:

- **Rascunho:** visível apenas no admin.
- **Publicado:** disponível para fichas e mesas.
- **Arquivado:** mantido por histórico, indisponível para novas seleções.

Changelog mínimo:

- conteúdo alterado;
- versão anterior;
- nova versão;
- campo alterado;
- autor da alteração;
- data;
- nota curta.

Durante playtest, a atualização pode ser global e automática. Em campanhas longas, a mesa deve poder travar uma versão da biblioteca ou aceitar atualização manualmente.

### 2.1.5 Conteúdo oficial, conteúdo de mesa e homebrew

A biblioteca deve suportar três níveis:

```
Biblioteca Oficial
- Conteúdo-base de Ruptura.
- Editável apenas por admin/desenvolvedor.

Biblioteca da Mesa
- Alterações do narrador.
- Homebrews.
- Variações locais.
- Pode sobrescrever conteúdo oficial apenas naquela mesa.

Instâncias de Personagem/Bando
- Objetos reais em uso.
- Guardam estado individual.
```

Exemplo:

```
Biblioteca Oficial:
Pistola Vastrana
Dano: 1d8
Preço: 900

Biblioteca da Mesa:
Pistola Vastrana — Mercado do Submundo
Dano: 1d8
Preço: 650
Propriedade: Instável
```

### 2.1.6 Payload de automação

Regras que afetam cálculo devem ficar em payload validado, preferencialmente JSONB no banco.

O payload pode gerar:

- ação;
- reação;
- custo de PA;
- custo de mana;
- teste;
- CD;
- resistência;
- dano;
- cura;
- condição;
- buff;
- debuff;
- duração;
- uso por cadência;
- modificação de margem;
- consumo de carga;
- consumo de munição;
- alteração de MIT/PD;
- prompt pós-rolagem;
- cartão no chat/log.

Exemplo:

```json
{
  "acoes": [
    {
      "nome": "Arremessar",
      "custoPA": 2,
      "teste": "Precisão",
      "efeitos": [
        {
          "tipo": "dano_area",
          "dado": "1d6",
          "dano": "elétrico"
        },
        {
          "tipo": "resistencia",
          "pericia": "Vigor",
          "cd": 7,
          "falha": {
            "aplicarCondicao": "Atordoado",
            "duracao": "1 rodada"
          }
        }
      ]
    }
  ]
}
```

Trocas simples de texto podem ser publicadas com validação leve. Trocas de dano, custo, condição, duração, cadência ou automação precisam passar por validação de schema antes de publicar.

### 2.1.7 Importação e exportação

Como o conteúdo do livro pode continuar sendo escrito fora do VTT, a plataforma deve aceitar importação por arquivo.

Formato recomendado:

- JSON para conteúdo com automação;
- CSV para cargas simples de loja ou listas preliminares;
- Markdown apenas para texto de referência, não como fonte primária de automação.

Fluxo:

```
Arquivo → Validador → Preview → Comparação de mudanças → Importar como rascunho → Publicar
```

Preview de importação deve informar:

```
32 itens encontrados
4 itens novos
21 itens alterados
7 sem mudança
2 erros de schema
```

A exportação deve permitir backup e migração da biblioteca em JSON.

### 2.1.8 Tabelas mínimas recomendadas

Estrutura inicial recomendada:

```
content_items
content_spells
content_talents
content_conditions
content_properties
content_escalpos
content_runes
content_drones
content_versions
content_changelog
campaign_content_overrides
character_item_instances
party_inventory_instances
active_effect_instances
```

Campos mínimos para `content_items`:

```
id
slug
nome
categoria
subtipo
raridade
preco
descricao_curta
descricao_longa
custo_pa
alcance
area
duracao
payload_automacao JSONB
tags
versao
status
created_at
updated_at
```

Regra central:

> Tudo que jogador consulta em jogo deve vir do banco. Tudo que altera cálculo deve passar por schema validado.

### 2.1.9 Biblioteca do Livro e conteúdo arrastável

A Biblioteca deve representar o livro completo de Ruptura dentro do VTT.

Ela não é apenas um catálogo de itens, magias ou talentos. Ela é a versão navegável, pesquisável e operacional do livro inteiro, incluindo regras, criação de personagem, combate, magia, equipamentos, talentos, condições, cenário, facções, narrador, mercado, submundo, lore e qualquer outro capítulo publicado.

A Biblioteca deve funcionar em duas camadas:

1. **Camada editorial**
   - o livro como texto completo;
   - capítulos, seções, subseções, tabelas, exemplos, notas e referências;
   - busca textual;
   - navegação por sumário;
   - links internos entre regras;
   - leitura direta pelo narrador e pelos jogadores.

2. **Camada operacional**
   - conteúdos estruturados extraídos do livro;
   - itens, armas, armaduras, munições, magias, talentos, condições, escalpos, runas, propriedades, ações e demais entidades de jogo;
   - cards, payloads e modelos publicados;
   - possibilidade de arrastar conteúdos estruturados para a ficha, inventário, mesa ou personagem.

A camada operacional deve nascer do livro, não existir como catálogo paralelo desconectado.

Exemplo:

- O capítulo de Mercado Noturno contém o texto completo sobre compra, contrabando, disponibilidade e preço.
- Dentro desse capítulo, uma Pistola Vastrana pode aparecer como referência estruturada.
- Essa referência abre o card do item publicado.
- O card pode ser arrastado para a ficha.
- Ao soltar, o VTT cria uma instância da Pistola Vastrana no inventário do personagem.

O texto continua sendo o livro. A automação vem do registro estruturado vinculado ao trecho do livro.

#### Escopo da Biblioteca

A Biblioteca deve conter o livro inteiro, incluindo, no mínimo:

- introdução;
- criação de personagem;
- atributos;
- perícias;
- combate;
- ações;
- condições;
- vida, estresse, mana, integridade, sobrecarga, ruptura e colapso;
- magia;
- vertentes;
- magias;
- talentos;
- inventário;
- armas;
- armaduras;
- escudos;
- munições;
- aljavas;
- explosivos;
- farmácia;
- vertinas;
- escalpos;
- runas;
- drones e robôs;
- mercado;
- submundo;
- bando refratário;
- Vosek;
- Braxus;
- Império Central;
- Casas-Vertente;
- facções;
- narrando Ruptura;
- construção de missões;
- qualquer capítulo futuro do livro.

Essa lista não deve ser tratada como limite. A regra é: se está no livro publicado de Ruptura, deve poder existir na Biblioteca.

#### Sumário e leitura

A Biblioteca deve ter uma navegação por sumário.

Cada capítulo deve preservar:

- título;
- ordem;
- hierarquia de seções;
- texto completo;
- tabelas;
- exemplos;
- caixas de regra;
- notas de narrador;
- referências internas;
- versão;
- status de publicação.

A experiência mínima deve permitir:

- abrir o livro;
- navegar por capítulo;
- pesquisar por termo;
- copiar referência;
- abrir cards estruturados vinculados ao texto;
- voltar ao trecho original de onde um card veio.

#### Conteúdo estruturado vinculado ao livro

Sempre que um trecho do livro descrever uma entidade de jogo, essa entidade deve poder ser vinculada a um registro estruturado.

Exemplos:

- A ação **Atacar** no capítulo de Combate aponta para o modelo estruturado da ação Atacar.
- A condição **Queimando** no capítulo de Condições aponta para o modelo estruturado da condição Queimando.
- A **Pistola Vastrana** no capítulo de equipamentos aponta para o modelo estruturado do item.
- Uma magia aponta para o modelo estruturado da magia.
- Um talento aponta para o modelo estruturado do talento.

O vínculo permite que o mesmo conteúdo seja lido como regra e usado como dado operacional pelo VTT.

#### Arrastar conteúdo do livro para a ficha

O usuário deve poder arrastar conteúdos estruturados diretamente a partir do livro.

Exemplos:

- arrastar uma arma do capítulo de equipamentos para o inventário da ficha;
- arrastar uma munição para o inventário;
- arrastar uma armadura para equipamentos defensivos;
- arrastar uma condição para efeitos ativos;
- arrastar uma magia para magias conhecidas, quando permitido;
- arrastar um talento para a ficha em Modo Evolução, quando permitido.

O drag não deve copiar texto bruto. Ele deve carregar uma referência segura ao modelo publicado.

Exemplo de payload de drag:

{
"type": "book_entity",
"contentId": "pistola_vastrana",
"sourceDocumentId": "mercado_noturno",
"sourceAnchor": "armas-de-fogo"
}

Ao soltar na ficha, o sistema deve:

1. validar o conteúdo no servidor;
2. buscar o modelo publicado;
3. criar a instância adequada;
4. aplicar os defaults do modelo;
5. salvar o personagem;
6. gerar log, se houver mesa conectada;
7. atualizar outras telas via Realtime.

#### Modelo e instância

A Biblioteca guarda o modelo oficial. A ficha recebe uma instância.

O texto, regra base, descrição, preço, dano, raridade, tags e payload padrão vêm do modelo publicado.

Quantidade, munição atual, cargas, MIT/PD atual, runas instaladas, dano sofrido, apelido, customização e estado de uso ficam na instância.

Arrastar um item do livro para a ficha nunca deve quebrar essa separação.

#### Visões operacionais da Biblioteca

Além da leitura por capítulos, a Biblioteca pode ter visões filtradas para facilitar uso em mesa.

Exemplos:

- Todos os Itens;
- Todas as Armas;
- Todas as Armaduras;
- Todas as Magias;
- Todos os Talentos;
- Todas as Condições;
- Todas as Ações.

Essas visões são índices do livro, não bibliotecas separadas.

Cada card operacional deve conseguir apontar de volta para o trecho do livro de onde veio.

#### Importação do Notion

Como o livro também existe no Notion, a plataforma deve futuramente aceitar importação a partir de exportações do Notion.

A importação deve preservar o livro completo como documento editorial e, quando possível, extrair entidades estruturadas.

Fluxo recomendado:

1. exportar o Notion como Markdown/CSV;
2. importar capítulos e seções como documentos do livro;
3. preservar hierarquia, títulos, tabelas e texto;
4. detectar ou mapear entidades estruturáveis;
5. importar entidades como rascunho;
6. validar schema;
7. mostrar preview de mudanças;
8. publicar na Biblioteca.

Markdown deve ser usado para preservar o texto do livro. Conteúdos que afetam cálculo ou automação devem ser convertidos para registros estruturados com payload validado.

#### Escopo da primeira entrega

A primeira entrega da Biblioteca do Livro deve focar em:

- importar ou cadastrar capítulos completos do livro;
- exibir sumário;
- permitir leitura por capítulo;
- permitir busca textual;
- exibir entidades estruturadas vinculadas ao texto;
- permitir drag de itens para o inventário da ficha;
- criar instâncias de itens a partir dos modelos publicados.

Fora da primeira entrega:

- importador completo do Notion;
- edição visual completa do livro;
- drag de todos os tipos de entidade;
- homebrew por mesa;
- versionamento avançado por campanha;
- automação completa de todos os payloads.

#### Prioridade

Esta feature deve ser priorizada depois que a ficha principal estiver funcional e estável.

A Biblioteca do Livro passa a ser uma das interfaces centrais do VTT: o lugar onde o usuário lê o sistema, consulta regras e transforma conteúdo publicado em elementos jogáveis na ficha.

## 3. Onboarding e criação de personagem

### 3.1 Primeiro acesso

No primeiro acesso de um perfil, a tela inicial chama o jogador para criar personagem. Depois disso, o perfil pode manter mais de um personagem salvo. O seletor de personagem fica disponível no perfil.

### 3.2 Assistente de criação

O assistente segue as etapas do capítulo de criação, com validação ao vivo, pontos restantes e navegação livre entre etapas.

**Etapa 1 — Conceito e identidade**

- Nome, alcunha, conceito, origem, idioma, afiliação e campos narrativos.
- Origem: Vastra, Beldran, Talesh, Kravus ou Torvash.
- Idioma regional + vastrano.

**Etapa 2 — Atributos**

- Corpo, Mente e Ânimo começam em 1.
- Distribui +3 pontos.
- Teto de 3 na criação.
- Derivados atualizam em tempo real: PV, PE, Mana, Integridade, Reações, Andar e Correr.

**Etapa 3 — Perícias**

- 25 pontos entre as 21 perícias.
- Teto de 3 na criação.
- Contador de pontos sempre visível.

**Etapa 4 — Vertentes**

- 3 pontos entre as 6 vertentes.
- Ao investir, a ficha libera magias/especializações daquele nível e calcula CD de resistência.
- Requisitos de atributo por nível devem ser validados.

**Etapa 5 — Talento inicial**

- 1 talento de nível 1.

**Etapa 6 — Inventário**

- 5.000 aretz para compras iniciais.
- Loja restrita a itens de raridade até incomum.
- Raros e muito raros bloqueados na criação.
- Saldo restante vira aretz inicial.

**Etapa 7 — Revisão**

- Resumo completo da ficha.
- PA base definido em 3.

### 3.3 Progressão

A progressão usa PM, investidos em atributo, perícia, vertente, talento ou PA. Enquanto os custos finais não estiverem fechados, a plataforma deve usar valores placeholder editáveis. Esses valores serão substituídos após playtest.

---

## 4. A ficha: dois modos

### 4.1 Modo Jogo

Visão padrão de sessão. Mantém editável apenas o que muda em jogo:

- PV, PE, Mana e Integridade atuais.
- PA gastos.
- Reações usadas.
- Sobrecarga.
- Colapso.
- Condições.
- Efeitos ativos.
- Munição.
- MIT e PD atuais.
- Cargas de item.
- Anotações.
- Rolagens.

Atributos, perícias, níveis de vertente, talentos e PA máximo ficam travados nesse modo.

### 4.2 Modo Evolução

Modo deliberado para alterações permanentes:

- atributos;
- perícias;
- vertentes;
- talentos;
- PA máximo;
- PM ganhos e gastos.

Ao subir atributo, derivados máximos e atuais sobem juntos na medida aplicável.

### 4.3 Histórico de evolução

Registrar PM recebidos, PM gastos, data/sessão e alteração feita. Esse histórico ajuda a auditar evolução e desfazer erros.

---

## 5. Estado de mesa, rodada, cena e descanso

A plataforma precisa entender quatro gatilhos de tempo:

| Gatilho         | Quem aciona | Uso principal                                                               |
| --------------- | ----------- | --------------------------------------------------------------------------- |
| Encerrar turno  | Jogador     | Finaliza a participação ativa do personagem                                 |
| Encerrar rodada | Narrador    | Resolve gatilhos de fim de rodada e reseta estruturas de rodada             |
| Encerrar cena   | Narrador    | Dispara Ruptura pendente, encerra efeitos por cena e zera cadências de cena |
| Descanso        | Jogador     | Aplica descanso curto ou longo ao próprio personagem                        |

O narrador deve ter override sobre esses gatilhos quando necessário.

---

## 6. Combate e iniciativa por janelas

### 6.1 Estrutura

Ruptura usa economia de turno por janelas, não iniciativa clássica fixa.

- **Turnos Rápidos:** ações de até 2 PA.
- **Turnos Lentos:** ações de 3+ PA.
- A rodada alterna entre PJ e PN dentro da janela.
- Entre jogadores sem consenso, desempate por Reflexos.
- O jogador não precisa declarar no início da rodada o que pretende fazer.
- Quando a mesa avança para Turnos Lentos, personagens que ainda não agiram nos Rápidos não devem voltar para a janela rápida.
- O narrador pode ter override para retornar a janela, mas isso é exceção operacional.

### 6.2 Interface de turno

A trilha de turno precisa ser visível para a mesa:

```
RODADA 3

RÁPIDOS — até 2 PA
[PJ disponível] → [PN disponível] → [PJ disponível]

LENTOS — 3+ PA
[PJ disponível] → [PN disponível]
```

Requisitos:

- Mostrar quem já agiu em Rápidos.
- Mostrar quem ainda pode agir.
- Mostrar o lado ativo da alternância: PJ ou PN.
- Permitir ao jogador escolher agir quando for uma janela válida para ele.
- Impedir gasto acima de 2 PA durante Turnos Rápidos.
- Permitir fragmentar PA dentro da rodada quando a regra permitir.
- Exibir PA gastos e PA restantes de forma clara.

### 6.3 PA como recurso visual

Os PA aparecem como fichas. Cada ação consome suas fichas. Em Turnos Rápidos, o console impede ações que elevem o gasto acima de 2 PA, exceto override do narrador.

### 6.4 Reações

- Reações por rodada = Mente.
- Defesas usam reação.
- Ao esgotar reações, novas defesas acumulam -1 na rodada.
- O contador de reações reseta ao encerrar rodada.
- Reações podem ser configuradas como:
  - **perguntar**;
  - **automática**;
  - **manual/desligada**.

---

## 7. Console de ação

A ficha funciona como console de ação. O jogador vê o catálogo de ações, custos, testes, margens, requisitos e efeitos.

### 7.1 Regra de visibilidade das ações

Por enquanto, Ruptura VTT não deve depender de mapa, token, alvo estruturado ou checagem automática de adjacência. O jogo está em modo teatro da mente.

Portanto:

- Ações principais de combate aparecem sempre no catálogo.
- A plataforma não deve esconder ações por ausência de alvo, ausência de token, distância, adjacência ou linha de visão.
- Requisitos como “alvo adjacente”, “alvo armado”, “linha de visão” e “alvo imobilizado” aparecem como texto de requisito, não como filtro obrigatório.
- Ações derivadas de condições podem aparecer apenas quando a condição existe, porque são respostas diretas de estado. Exemplos: Levantar, Escapar, apagar Queimando.
- Ações ligadas a equipamento devem aparecer no item/equipamento correspondente e também podem aparecer no catálogo geral com aviso de requisito.

### 7.2 Catálogo de ações

### Movimento

**Deslocar-se — 1 PA**

Formas:

- Andar: até 10 + Corpo metros.
- Correr: o dobro de Andar; pode pedir Mobilidade.
- Manobrar: 10 + Corpo metros, teste de Mobilidade, ignora terreno difícil; pode gerar vantagem/desvantagem.
- Saltar horizontal: distância por Corpo; Corpo 3+ pode forçar com Mobilidade.
- Saltar vertical: altura por Corpo; Corpo 3+ pode forçar com Mobilidade.

O deslocamento de uma mesma ação pode ser dividido ao longo do turno. O personagem pode se mover, realizar outra ação e continuar se movendo, desde que ainda tenha deslocamento restante da ação.

**Levantar — 1 PA**

- Remove Caído.
- Ação derivada de condição: aparece quando o personagem está Caído.

**Escapar — 2 PA**

- Usada contra Agarrado ou Imobilizado.
- Remove Agarrado/Imobilizado do personagem e Agarrando de quem o segurava.
- Ação derivada de condição: aparece quando o personagem está Agarrado ou Imobilizado.

**Fintar — 1 PA**

- Influência contra Percepção.
- Sucesso: +1 no próximo ataque corpo a corpo no mesmo turno.
- Crítico: força custo/penalidade defensiva conforme regra.
- O bônus vira modificador temporário rastreado.

**Interagir — 1 PA**

- Objetos, portas, alavancas, consumíveis, escalpos, cobertura improvisada.
- Se o item tiver custo próprio, usa o custo do item.

**Sacar/Guardar**

- 1 PA para acesso rápido.
- 2 PA para acesso difícil.

### Ofensivas

**Postura Ofensiva — 1 PA**

- Alternável.
- +1 em ações ofensivas e magias de Ataque.
- 1 em ações defensivas.
- Encerra com 1 PA.
- Efeito rastreado como modificador temporário.

**Atacar — 2 PA**

- Corpo a corpo: Luta; soma Corpo ao dano.
- Arremesso e disparo: Precisão; soma Corpo ao dano.
- Armas de fogo: Balística.
- Defensor escolhe Esquivar, Aparar ou Bloquear quando aplicável.
- Margem define região do corpo, dano e efeitos críticos.
- Armas de munição consomem munição ao atacar.
- Arcos exigem flecha disponível em aljava; antes da rolagem, o jogador escolhe qual flecha será usada. A flecha escolhida é consumida no disparo, acertando ou errando.

**Agarrar — 2 PA**

- Luta contra Resistir ou Desviar.
- Atacante ganha Agarrando.
- Margem:
  - limitado: aplica Agarrado e +1 para o alvo Escapar;
  - padrão: aplica Agarrado;
  - crítico: aplica Imobilizado.

**Estrangular — 2 PA**

- Requisito ficcional: alvo adjacente Imobilizado ou Atordoado.
- Luta contra Vigor.
- Margem define duração de Inconsciente e dano.

**Derrubar — 2 PA**

- Luta contra Resistir ou Desviar.
- Aplica Caído.

**Empurrar — 2 PA**

- Luta contra Resistir ou Desviar.
- Empurra metros pela margem.
- Crítico também aplica Caído.

**Desarmar — 2 PA**

- Luta contra Resistir ou Desviar.
- A arma cai ou voa conforme margem.

### Defensivas

**Postura Defensiva — 1 PA**

- Alternável.
- +1 em ações defensivas.
- 1 em ações ofensivas e magias de Ataque.
- Efeito rastreado como modificador temporário.

**Aparar — Reação**

- Teste de Luta.
- Requer arma com propriedade Aparar.
- Crítico deixa atacante exposto e concede bônus ao próximo ataque.

**Bloquear — Reação**

- Teste de Reflexos.
- Requer escudo ou proteção.
- Dano vai ao PD; excesso passa ao defensor.
- Pode proteger aliado conforme ficção.
- Crítico concede cobertura parcial.

**Esquivar — Reação**

- Reflexos.
- Crítico reposiciona 1 metro.

**Resistir — Reação**

- Vigor ou Mobilidade.
- Usado contra movimento forçado, queda, imobilização, paralisia e efeitos similares.
- Crítico dá +1 na próxima ação de Corpo.

### Diversas

**Mirar — 1 PA**

- Percepção.
- +1 no próximo disparo no mesmo alvo até o fim da rodada.
- Acumula até +2 se feito em sequência sem atacar.
- Acúmulo rastreado pela ficha.

**Recarregar — 1 PA**

- Exige arma que usa carregador/capacidade interna e estoque de munição compatível no inventário.
- Restaura apenas a munição que falta na arma, até o máximo do carregador/capacidade.
- Consome do estoque exatamente a quantidade carregada.
- Se o estoque compatível for menor que o necessário, a recarga é parcial.
- Se não houver estoque compatível, a ação é bloqueada.
- Se a arma já estiver cheia, a ação avisa que não há o que recarregar e não consome munição.
- Exige mão livre quando a regra exigir.
- Deve aparecer ligada a armas de munição, mostrando munição atual/máxima, tipo aceito, estoque compatível disponível e custo de PA.
- Quando automatizada, só gasta PA se pelo menos 1 munição for carregada.
- Arcos não usam esta ação para escolher flecha: a escolha da flecha acontece no próprio ataque, a partir da aljava.

**Acessar Trama — 2 PA**

- Executa Conectar para Deck Sináptico.
- Consome PA e RAM.
- Requisito mostrado, sem depender de mapa.

**Preparar Turno — 1 PA + PA da ação preparada + Reação**

- Define gatilho único.
- Exige reação disponível.
- Mana só é gasta se a ação preparada for executada.

**Usar Perícia — 1 PA**

- Usada para criar vantagem, impor desvantagem, ler o campo ou executar interação tática.

### Livres

**Falar**

- Livre.
- Pode virar Usar Perícia se tiver impacto tático/social relevante.

**Gestos rápidos**

- Livre.
- Inclui soltar quem está agarrando.
- Pode virar Interagir se exigir esforço, tempo ou precisão.

---

## 8. Prompt de rolagem, reação e resultado

### 8.1 Rolagem base

A regra central é:

```
maior dado entre (Atributo)d8 + Perícia + modificadores
```

O resultado usa o maior d8, não a soma dos dados.

### 8.2 Componentes do prompt

Ao acionar ação ou perícia, o prompt monta:

1. Atributo usado.
2. Pool de d8.
3. Bônus de perícia.
4. Modificadores ativos. Também pode ser adicionado manualmente.
5. Chips de fonte para cada modificador.
6. Botão de ligar/desligar modificador específico.
7. CD ou oposição.
8. Resultado.
9. Margem.

### 8.3 Modificadores rastreados

- Condições.
- Postura Ofensiva.
- Postura Defensiva.
- Mirar.
- Fintar.
- Cobertura.
- Terreno elevado.
- Iluminação, névoa, escuridão, chuva e outros fatores ambientais.
- Talentos.
- Escalpos.
- Vertinas.
- Itens.
- Runas.
- Ponto cego.

### 8.4 Explicador de modificador

Cada chip deve responder “por que esse modificador existe?”.

### 8.5 Decisões depois da rolagem

Algumas escolhas aparecem após o dado no chat/log:

- Surto de Foco.
- Surto de Desequilíbrio.
- Surto de Impacto.
- Região do corpo.
- Aplicação de propriedade crítica.
- Uso de reação.
- Uso de talento com gatilho pós-resultado.
- Escolha de cobertura atingida em falha, quando aplicável.

### 8.6 Console de próximo passo

Após cada rolagem, a plataforma oferece o desdobramento correto no log/chat:

- Acerto: aplicar dano, escolher região liberada, aplicar MIT, aplicar propriedade crítica.
- Crítico: oferecer efeitos de propriedade, dano adicional e região ampliada.
- Falha com cobertura: oferecer resolução de cobertura, se a regra se aplicar.
- Agarrar com sucesso: aplicar Agarrado no alvo e Agarrando no atacante.
- Bloquear: descontar PD e passar excesso.
- Cura: aplicar PV/PE e remover condições que somem com cura.
- Colapso: estabilizar, avançar marcador ou encerrar colapso.

### 8.7 Região do corpo

- A escolha de região é travada por margem por padrão.
- O prompt mostra apenas regiões permitidas pela margem.
- Deve existir botão de destravar/override.
- Padrão:
  - limitado: tronco, –1 de dano;
  - padrão: tronco, braços ou pernas;
  - crítico: inclui cabeça, +1 dado de dano e efeitos críticos.

### 8.8 Propriedades, dano e condições

Condições não devem ser sugeridas apenas pelo tipo de dano. Elas são aplicadas quando a propriedade da arma, magia, runa, item ou efeito diz que aplica.

Exemplo correto:

- Uma arma com Sangramento aplica Sangrando conforme sua propriedade.
- Uma magia que diga “aplica Queimando” aplica Queimando.
- Dano ígneo crítico sozinho não gera Queimando automaticamente, salvo regra específica do efeito.

---

## 9. Condições e efeitos ativos

### 9.1 Tags de rolagem

A ficha precisa taguear rolagens para aplicar efeitos corretamente:

- Ofensiva.
- Defensiva.
- Visão.
- Audição.
- Corpo.
- Perícia específica.
- Deslocamento.
- Fim de rodada.
- Conjuração.
- Magia de Ataque.
- Magia de Controle.
- Magia de Suporte.
- Movimento.
- Item.
- Reação.

### 9.2 Tabela de condições

| Condição     | Efeito                                                                             | Automação                                                                   |
| ------------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Agarrado     | -1 em ofensivas e defensivas; Deslocar-se = 0; exige Escapar                       | Aplica -1 nas tags ofensiva/defensiva, zera deslocamento e habilita Escapar |
| Agarrando    | -1 em ofensivas e defensivas; deslocamento à metade                                | Aplica -1, reduz deslocamento e permite soltar como gesto rápido            |
| Atordoado    | Sem ações ou reações                                                               | Trava console, exceto ações que removam a condição                          |
| Caído        | -1 nas próprias ofensivas; ataques contra o alvo recebem +1; deslocamento à metade | Aplica penalidades, marca alvo como vulnerável e habilita Levantar          |
| Cego         | Falha testes de visão; -2 nas ofensivas; ataques contra o alvo recebem +2          | Falha automática em visão e aplica modificadores                            |
| Contundido   | -1 em Luta, Mobilidade e Reflexos; dura até recuperar PV                           | Aplica -1 e remove ao recuperar pelo menos 1 PV                             |
| Envenenado   | -1 PA; fim de rodada Vigor CD 7 ou 1d4 tóxico; dura até recuperar PV               | Reduz PA, agenda teste de fim de rodada e remove com cura                   |
| Imobilizado  | Deslocamento 0; sem ofensivas nem defensivas; exige Escapar                        | Trava ofensivas/defensivas, zera deslocamento e habilita Escapar            |
| Inconsciente | Caído + sem ação ou reação                                                         | Trava console e aplica vulnerabilidade de Caído                             |
| Insaturado   | Vigor CD 7 ou Lento; magistas sofrem -1 em conjuração e +1 custo de mana           | Agenda teste e aplica penalidades de conjuração                             |
| Lento        | Deslocamento à metade; -1 em Reflexos e Mobilidade                                 | Reduz deslocamento e aplica -1                                              |
| Ofuscado     | -1 em testes de visão                                                              | Aplica -1 em rolagens com tag visão                                         |
| Queimando    | 1d4 ígneo no fim da rodada; Interagir apaga                                        | Agenda dano e habilita ação para apagar                                     |
| Sangrando    | Fim de rodada Vigor CD 7; falha 1d4 físico, sucesso metade; dura até recuperar PV  | Agenda teste/dano e remove com cura                                         |
| Saturado     | Vigor CD 7 ou Envenenado; magistas recebem -1 custo de mana e +1 conjuração        | Agenda teste e aplica bônus/efeito de conjuração                            |
| Sufocando    | -1 em testes de Corpo; 3 min Inconsciente; 5 min morte                             | Aplica -1 e rastreia cronômetro                                             |
| Surdo        | Falha testes de audição                                                            | Falha automática em audição                                                 |

### 9.3 Remoção automática por cura

Contundido, Envenenado e Sangrando somem quando o personagem recupera pelo menos 1 PV. A ficha remove a condição, exibe aviso e oferece desfazer.

### 9.4 Faixa de estados

A interface deve ter uma faixa de estados ativa, com:

- condições;
- buffs;
- debuffs;
- posturas;
- Mirar;
- Fintar;
- talentos ativos;
- vertinas;
- efeitos de item;
- cooldowns;
- usos por cena/rodada/sessão/dia.

Estados que exigem resolução no fim da rodada devem pulsar.

### 9.5 Duração por tempo de jogo

A duração não usa segundos reais. O cronômetro entende:

- turno;
- janela rápida;
- janela lenta;
- rodada;
- cena;
- descanso;
- sessão;
- dia.

---

## 10. PV, PE, Mana, Integridade, Sobrecarga, Ruptura e Colapso

### 10.1 Recursos

- PV = 10 + Corpo.
- PE = 10 + Mente.
- Mana = 10 + (Ânimo × 2).
- Integridade = 10 + (Ânimo × 2).
- Reações = Mente.
- Andar = 10 + Corpo.
- Correr = dobro de Andar.

### 10.2 PV temporário

PV temporário é uma camada consumida antes do PV normal e some no descanso longo. Fontes iguais de PV temporário não empilham, mas fontes diferentes somam PV temporário.

### 10.3 Mana temporária

Mana temporária é uma camada consumida antes da mana normal e some no descanso longo. Fontes iguais de mana temporária não empilham, mas fontes diferentes somam mana temporária.

### 10.4 Descanso

**Descanso curto — 30 min**

- Recupera metade da Mana máxima.
- Recupera recursos marcados como “descanso curto”.

**Descanso longo — 8h**

- PV recupera Corpo + 2.
- PE recupera Mente + 2.
- Mana volta ao máximo.
- Remove PV temporário.
- Remove Mana temporária.
- Reseta Sobrecarga.
- Recupera recursos marcados como “descanso longo”.

Recuperação paga por clínica, magista ou serviço similar não entra por enquanto.

### 10.5 Sobrecarga

Automação deve seguir o livro:

- Até 3 Surtos de Sobrecarga por dia.
- Só descanso longo recupera surtos.
- Cada surto causa 1d4 de dano psíquico imediato.
- No terceiro surto, ao fim da ação, rola Vontade CD 7.
- Falha no teste do terceiro surto deixa Atordoado por 1 rodada.
- Ruptura é resolvida separadamente no fim da cena.

Interface:

- três cargas de Sobrecarga;
- seletor do tipo de surto;
- dano psíquico aplicado na hora;
- prompt de Vontade CD 7 ao usar o terceiro;
- indicador de Ruptura pendente.

### 10.6 Ruptura

No fim de uma cena em que o personagem chegou a 3 sobrecargas:

1. Reduz Integridade em valor igual ao número da Ruptura.
2. Aumenta Mana em Ânimo + 2.
3. Oferece escolha de Marca.
4. Oferece escolha de Traço.

Marca e Traço podem ficar pendentes. A ficha registra o pendente e permite resolver depois.

### 10.6 Integridade

Faixas:

| Integridade | Estado           |
| ----------- | ---------------- |
| 7+          | íntegro          |
| 5–6         | 1 distorção      |
| 3–4         | 2 distorções     |
| 2           | 3 distorções     |
| 1           | eu em dissolução |
| 0           | fim da ficha     |

A 0, magista vira Vestígio. Casca fica registrada como regra para origem não-magista ou ficha de NPC, mas não é prioridade enquanto não houver criação de personagem não-magista.

Se a perda final veio de Ruptura, libera Última Vontade.

### 10.7 Colapso

- Um marcador de 3 segmentos.
- Dispara quando PV ou PE chega a 0.
- Personagem fica Inconsciente.
- Fim de rodada: teste simples de Corpo se foi PV; Mente se foi PE.
- Resultado abaixo de 7 avança segmento.
- No terceiro segmento, teste imediato: 8 mantém por mais uma rodada; falha encerra.
- PV: morte.
- PE: coma/fora de jogo.
- Dano adicional da mesma dimensão avança o marcador.
- Estabilizar interrompe avanço, mas não cura. Deve ter opção de estabilizar na interface.
- Cura de 1+ encerra colapso e desperta.
- Sobrevivência abre campo de cicatriz.

---

## 11. Blocos da ficha

### 11.1 Identidade

- Nome.
- Alcunha.
- Conceito.
- Origem.
- Idiomas.
- Afiliação.
- RPI.
- Cor/ícone/padrão do perfil.
- Campos narrativos.

### 11.2 Atributos

- Corpo.
- Mente.
- Ânimo.
- Valores de 1 a 5.
- Editáveis no Modo Evolução.
- Atualizam derivados.

### 11.3 Perícias

- Valores de 0 a 5.
- Bônus somado à rolagem.
- Cada perícia lista atributo primário e alternativos.
- Clique no atributo abre rolagem daquele atributo, com hint da ação no hover.
- Hover no nome da perícia mostra resumo.
- Condições entram por tag, com override.

### 11.4 Vertentes e magias

Fonte de verdade: capítulo atual de magia mantido no artefato externo usado no desenvolvimento. A database final deve ser importada dessa versão, não dos PDFs antigos quando houver divergência.

Requisitos de produto:

- mostrar apenas vertentes do personagem no Modo Jogo;
- permitir adicionar vertente no Modo Evolução;
- separar magias por vertente e nível;
- clicar abre modal completo;
- magias com dano têm atalho de dano;
- ao conjuradas, resumo delas aparece no log/chat;
- magias com resistência disparam prompt do alvo no log/chat;
- especializações aparecem associadas à vertente;
- custo de mana pode usar placeholder enquanto os valores finais não estiverem fechados.

### 11.5 Talentos

A ficha mostra apenas talentos que o personagem possui e no nível correto. Cada talento pode gerar:

- modificador;
- contador de uso;
- ação;
- reação;
- override de margem;
- bônus de companheiro;
- efeito em item;
- efeito em loja;
- efeito narrativo registrado.

### 11.6 Inventário e loja

Ver seção 13 para automações detalhadas.

### 11.7 Escalpos

Ver seção 13.9. Escalpos são bloco próprio, com custo de Integridade, espaços e efeitos ativos/passivos.

### 11.8 Drones e robôs

Ver seção 13.10. Entram como companheiros com mini-ficha.

### 11.9 Veículos

Prioridade baixa. Devem entrar como registro simples de item/capacidade. Sem automação de combate veicular por enquanto.

---

## 12. Talentos: automação por padrão

### 12.1 Padrões reutilizáveis

Implementar os padrões uma vez e reaplicar por talento.

| Padrão                           | Uso                                                                         |
| -------------------------------- | --------------------------------------------------------------------------- |
| Promoção de margem               | falha limitada vira sucesso limitado em rolagens específicas                |
| Piso/override de margem          | sucesso vira crítico, falha limitada vira padrão, acerto conta como crítico |
| Dado extra com gatilho           | Pistoleiro                                                                  |
| Buff empilhável                  | Fúria do Berserker                                                          |
| +X em testes específicos         | Guardião, Espadachim, Bricolagem etc.                                       |
| Reação grátis/gatilho            | Sentinela, Contra-medida, Ripostar, Protocolo de Emergência                 |
| Redução de PA                    | Ritmo de Campo, Estocar                                                     |
| Aplicar condição em margem menor | Hemorragia, Fincada                                                         |
| Contadores por cadência          | cena, rodada, combate, sessão, dia, descanso                                |
| Companheiro                      | Droneiro, Mecatrônico                                                       |
| Trama                            | Tecelão                                                                     |
| Economia/loja                    | Mercador                                                                    |
| Runas                            | Rúnico                                                                      |
| Troca de atributo                | Golpe Cirúrgico                                                             |

### 12.2 Catálogo de talentos

**Estrategista**

- Falcão: 1/cena, marca alvo/detalhe; próximo aliado recebe +2.
- Briefing de Campo: tokens de rerrolagem por aliado/perícia.
- Imposição de Ritmo: reação para aliado agir fora da alternância.

**Dissecador**

- Golpe Cirúrgico: Mente no lugar de Corpo em usos específicos; crítico contundente impõe penalidade.
- Fincada: troca dano por Lento ou Caído.
- Contra-medida: reação no erro inimigo corpo a corpo.

**Malabarista**

- Saque Fantasma: saque sem PA após arremesso leve; ignora -1 de Rajada com armas aplicáveis.
- Revoada: segundo arremesso 1/rodada.
- Espetáculo Mortal: multiataque 1/cena com margem travada conforme regra.

**Pistoleiro**

- Gatilho Quente: dados de gatilho.
- Bang Bang: dado adicional e segundo disparo.
- Showdown: gasto ampliado e efeitos por resultado.

**Atirador de Elite**

- 1 Tiro 1 Acerto: melhora Mirar.
- À Espreita: piso de margem contra alvo desavisado após Mirar.
- Headshot: acerto após Mirar crítico conta como crítico.

**Berserker**

- Fúria: buff empilhável após sofrer dano.
- Sede de Sangue: toggle condicionado a PV abaixo da metade.
- Último Fôlego: gatilho 1/cena ao cair a 0 PV.

**Guardião**

- Sentinela: Bloquear como reação grátis 1/rodada.
- Blindagem: bônus em Bloquear e anulação 1/cena.
- Muralha: Bloquear padrão concede cobertura.

**Manipulador**

- Olhar Penetrante: promoção de margem em Influência/Psicologia aplicáveis.
- Armistício: marcador narrativo 1/cena.
- Controle de Massas: rolagem social coletiva.

**Sorrateiro**

- Passo Fantasma: promoção de margem em Furtividade.
- Camuflagem Óptica: suporte narrativo de furtividade.
- Ataque Furtivo: sucesso ao sair da furtividade conta como crítico 1/cena.

**Rato de Rua**

- Zé da Esquina: contato 1/sessão.
- Gato de Telhado: abrigo 1/sessão.
- Saída dos Fundos: escape 1/sessão.

**Mercador**

- Garimpo de Rua: -20% no Mercado Noturno 1/dia.
- Caderneta de Dívida: compra fiada 1/sessão.
- Rede de Favores: recruta PN 1/sessão.

**Totem**

- Bênção: promoção de margem em suporte e token para aliado.
- Onda Solidária: estende efeito positivo a segundo aliado.
- Chama Redobrada: dobra efeito numérico ou duração 1/cena.

**Praga**

- Marca da Dor: aliado recebe +1 contra inimigo sob efeito negativo 1/rodada.
- Sangria Lenta: efeitos negativos duram +1 rodada.
- Contágio: espalha efeito negativo 1/cena.

**Artífice**

- Bricolagem: identifica ponto fraco e aplica +1.
- Toque de Midas: buff temporário de item 1/dia.
- Gambiarra Expressa: criação/modificação 1/sessão.

**Droneiro**

- Sinal Limpo: promoção de margem no controle de drone e comando grátis 1/cena.
- Script: gatilho automático do drone.
- Enxame: pareia drones idênticos.

**Mecatrônico**

- Chave de Arranque: promoção de margem e +1 no robô.
- Marcha Dupla: robô age duas vezes.
- Overclock: +1 PA por rodada para robô 1/cena.

**Rúnico**

- Gatilho Rúnico: ativa/desativa runa sem PA.
- Entalhe Rápido: instala/remove runa em 1 min.
- Sobregravação: +1 espaço de runa para o usuário.

**Tecelão**

- Olho de Botão: primeira entrada revela níveis da Trama.
- Bypass: comando sem teste 1/sessão.
- Agulha Fina: Apagar Rastros/Modificar Assinatura livre se Detecção não acionada.

**Paramédico**

- Pronto-Socorro: estabiliza aliado a 0 PV 1/cena.
- Ritmo de Campo: cura custa -1 PA, mínimo 1.
- Protocolo de Emergência: reação de cura quando aliado cai a 0 PV.

**Espadachim**

- Aparar: +1 em Aparar com lâminas; padrão vira crítico 1/rodada.
- Estocar: -1 PA em ataque com lâmina 1/combate.
- Ripostar: contra-ataque em crítico de Aparar.

**Assassino**

- Lâmina Oculta: promoção de margem contra alvo desavisado e reposicionamento.
- Hemorragia: reduz limiar de Sangrando e aumenta dado no crítico.
- Executar: execução 1/cena sob requisito.

---

## 13. Inventário, loja e itens

Inventário, loja e itens devem consumir modelos da Biblioteca do Sistema. A ficha nunca deve depender de uma lista hardcoded de itens. Cada item no inventário é uma instância ligada a um modelo publicado, com estado próprio para quantidade, cargas, munição, MIT, PD, runas, customizações e histórico.

### 13.1 Carteira

A ficha diferencia:

- **Aretz informal:** dinheiro fora do circuito oficial.
- **CDI:** Carteira Digital Imperial, oficial e rastreável, vinculada ao RPI/ID sináptico.
- **CDI Craqueada:** permite mover valor fora do rastreio imperial.

### 13.2 Loja do Mercado Noturno

Requisitos:

- busca por item;
- filtro por categoria;
- lista completa por padrão;
- preço do livro como padrão editável;
- compra múltipla;
- quantidade;
- munição como item quantitativo de estoque;
- tipo de munição explícito em cada item de munição;
- aljavas como itens de capacidade para flechas;
- raridade bloqueada na criação;
- aplicação de descontos/fiado do Mercador;
- envio para personagem ou inventário do bando.

Kits mínimos de munição publicados:

| Munição           | Compatibilidade | Kit        | Raridade | Preço |
| ----------------- | --------------- | ---------- | -------- | ----- |
| Flecha simples    | Arcos           | 10 flechas | Comum    | 50 Ⱥ  |
| Virotes           | Bestas          | 5 virotes  | Comum    | 50 Ⱥ  |
| Flecha flamejante | Arcos           | 5 flechas  | Incomum  | 200 Ⱥ |
| Flecha tóxica     | Arcos           | 5 flechas  | Incomum  | 200 Ⱥ |
| Flecha elétrica   | Arcos           | 5 flechas  | Incomum  | 300 Ⱥ |
| Flecha explosiva  | Arcos           | 5 flechas  | Raro     | 350 Ⱥ |

### 13.3 Loadouts e mochila

- Marcar item como equipado, empunhado, acesso rápido ou mochila.
- Atalhos de ação seguem o que está equipado.
- Itens na mochila continuam registrados, mas não entram como atalho principal.
- Troca de loadout pode ser melhoria posterior.

### 13.4 Armas

Automação:

- munição atual e máxima na instância da arma;
- tipo de munição aceito pela arma;
- estoque de munição compatível no inventário;
- aljava para arcos, com capacidade e flechas agrupadas por tipo;
- escolha de flecha da aljava ao atacar com arco;
- Recarregar consumindo apenas a munição efetivamente carregada;
- consumo de 1 munição por ataque padrão com arma de munição;
- Rajada (X);
- Corpo ao dano corpo a corpo e armas de arremesso/disparo;
- Balística para armas de fogo;
- Precisão para arremesso/disparo;
- Luta para corpo a corpo;
- propriedades em crítico;
- runas instaladas;
- kravita;
- atalhos de ataque.

Propriedades em crítico devem ser oferecidas apenas quando a arma/efeito possuir a propriedade.

#### 13.4.1 Tipos de munição, estoque e recarga

Munição não é genérica. Cada arma que usa munição deve possuir estado próprio na instância:

- munição atual;
- munição máxima/capacidade;
- tipos de munição aceitos;
- munição carregada, quando o tipo carregado for relevante;
- custo de recarga em PA, quando aplicável.

Cada item de munição no inventário deve possuir:

- tipo de munição;
- quantidade;
- compatibilidade;
- tamanho de kit;
- payload de automação, se for munição especial.

Tipos mínimos de munição:

| Tipo     | Uso                                                        |
| -------- | ---------------------------------------------------------- |
| flecha   | Arcos                                                      |
| virote   | Bestas                                                     |
| pistola  | Pistola de bolso, Revólver e Pistola pesada                |
| fuzil    | Submetralhadora, Carabina, Rifle de assalto e Metralhadora |
| escopeta | Escopeta curta e Espingarda                                |
| precisao | Rifle de precisão                                          |

A munição comprada fica no inventário como item quantitativo de estoque. A arma não cria munição por conta própria.

##### Armas de fogo e armas com carregador/capacidade

Regra de recarga:

1. Recarregar só pode ser executado se houver munição compatível no inventário.
2. A plataforma calcula quanto falta na arma:

```
faltante = munição máxima - munição atual
```

3. A quantidade carregada é:

```
carregada = mínimo entre faltante e estoque compatível disponível
```

4. A arma aumenta sua munição atual em `carregada`.
5. O estoque compatível diminui exatamente em `carregada`.
6. Se `carregada` for 0, nada é consumido.
7. Munição atual nunca passa do máximo.
8. Estoque nunca fica negativo.
9. Se o estoque compatível for insuficiente, a recarga é parcial.
10. Se não houver estoque compatível, Recarregar é bloqueado.
11. Se a arma já estiver cheia, Recarregar informa que não há o que recarregar e não consome PA nem munição.
12. Quando automatizada, a ação só consome PA se pelo menos 1 munição for carregada.

Exemplos:

- Arma 2/6 e estoque 10: carrega 4; arma fica 6/6; estoque fica 6.
- Arma 2/6 e estoque 3: carrega 3; arma fica 5/6; estoque fica 0.
- Arma 6/6 e estoque 10: carrega 0; arma fica 6/6; estoque fica 10.
- Arma 0/6 e estoque 0: Recarregar é bloqueado.

Ataque com arma de munição:

- Ataque padrão consome 1 munição atual da arma.
- Se a arma estiver com munição atual 0, o ataque é bloqueado antes de aplicar dano, MIT, PD, Colapso ou log de sucesso.
- Ataque sem arma selecionada preserva o comportamento manual atual.
- Armas corpo a corpo não consomem munição.
- Rajada, Dispersão, múltiplos tiros e munição especial ficam para automação própria, sem serem inferidos pela regra básica.

##### Aljavas e flechas

Arcos usam aljava. Ao comprar um arco, o personagem recebe automaticamente uma aljava e flechas simples iniciais conforme o modelo publicado do item. O padrão de produto, salvo definição diferente no modelo, é uma aljava com capacidade para 15 flechas e 1 kit inicial de 10 flechas simples.

A aljava é uma instância de inventário com capacidade própria. Ela guarda flechas em pilhas por tipo, não como flechas individuais. Flechas simples e flechas especiais ocupam 1 espaço cada.

Exemplo:

```
Aljava — 13/15
- Flecha simples: 10
- Flecha flamejante: 2
- Flecha elétrica: 1
```

Ao atacar com arco, o jogador escolhe qual flecha da aljava será disparada. A flecha escolhida é consumida no disparo, acertando ou errando. Se não houver flecha compatível na aljava, o ataque com arco é bloqueado.

Flechas especiais mantêm seu próprio modelo de conteúdo. O VTT deve exibir o efeito da flecha escolhida no resumo do ataque. A automação do efeito só deve ocorrer quando o payload for inequívoco. Quando o payload for textual ou incompleto, o efeito aparece como lembrete no log.

Kits de flechas:

| Flecha            | Efeito                                                     | Kit        | Raridade | Preço |
| ----------------- | ---------------------------------------------------------- | ---------- | -------- | ----- |
| Flecha simples    | Sem efeito especial                                        | 10 flechas | Comum    | 50 Ⱥ  |
| Flecha flamejante | +1d6 de dano ígneo; aplica Queimando em crítico            | 5 flechas  | Incomum  | 200 Ⱥ |
| Flecha tóxica     | Aplica Envenenado                                          | 5 flechas  | Incomum  | 200 Ⱥ |
| Flecha elétrica   | +1d6 de dano elétrico; aplica Atordoado em crítico         | 5 flechas  | Incomum  | 300 Ⱥ |
| Flecha explosiva  | Explode em raio de 1 m, causando 2d6 de dano ígneo em área | 5 flechas  | Raro     | 350 Ⱥ |

##### Virotes

Bestas usam virotes. Virotes ficam no inventário como item quantitativo de estoque ou em estojo próprio quando o modelo de equipamento trouxer esse suporte. O kit padrão é 5 virotes por 50 Ⱥ.

Se a besta possuir capacidade 1, Recarregar transfere 1 virote compatível do estoque para a besta. Se não houver virote compatível, Recarregar é bloqueado.

### 13.5 Armaduras

- MIT atual/máximo por região.
- Resistência física, energética ou híbrida.
- Dano absorvido reduz MIT.
- Ácido reduz 2 MIT.
- Perfuração ignora 1 MIT.
- Armadura pesada aplica -1 em Mobilidade e Reflexos.
- Sobreposição aplica maior MIT plausível.
- Runas de armadura entram como efeitos anexados.
- Kravita adiciona +2 MIT.

### 13.6 Escudos

- PD atual/máximo.
- Bloquear desconta PD.
- Excesso passa ao defensor.
- Resistência física/híbrida conforme regra.
- Runas de escudo entram como efeitos anexados.
- Kravita adiciona +3 PD.

### 13.7 Explosivos

Todos entram como ações de item com custo, área, teste, dano e condição.

- Granada de fumaça.
- Granada de luz.
- Granada de choque.
- Granada de ácido.
- Granada criogênica.
- Granada explosiva.
- Granada PEM.
- Granada irritante.
- Carga explosiva remota.
- Mina de proximidade.

A ficha gasta PA, rola dano, dispara resistência quando necessário, aplica condição e registra dano dobrado a estruturas quando a regra pedir.

### 13.8 Farmácia, vertinas, ferramentas e dispositivos

**Farmácia**

- Kit de estabilização PV/PE.
- Ansiolítico.
- Estimulante neuromotor.
- Antídoto.
- Medkit.
- Estabilizador de humor.
- Soro anti-psíquico.
- Injetor de adrenalina.
- Injetor nanocurativo.

A ficha rola cura, desconta usos, remove condição, agenda buff ou contrapartida.

**Vertinas**

- Manta.
- Beijo de bruxa.
- Lótus.
- Zênite.
- Relicário.
- Raio negro.
- Marola.
- Azulzinha.

A ficha aplica buff por tipo de magia, soma bônus e rastreia duração/usos.

**Ferramentas**

- Bateria rúnica.
- Máscara filtrante.
- Spray adesivo.
- Kit de contenção.
- Kit de lock picking.
- Kit de reparo.
- Kit de rastreamento.
- Detergente enzimático.
- Tinta rúnica invisível.
- Corda rúnica.
- Lanterna rúnica.

A ficha desconta cargas, rola testes e rastreia durações.

**Dispositivos**

- Kit de intrusão digital.
- Bloqueador de sinal.
- Escuta.
- Rastreador.
- Óculos RA.
- Scanner.
- Capa anti-óptica.
- Chip de dados.

### 13.9 Escalpos

Database completa será extraída em breve. Padrão de automação:

- custo de Integridade na instalação;
- espaços por categoria;
- bônus passivos;
- habilidades ativas com PA;
- MIT subdérmico;
- mana temporária;
- RAM;
- ignorar condição;
- acesso à Trama;
- movimento e queda;
- carteira/RPI;
- efeitos de identidade.

### 13.10 Drones e robôs

Mini-painel de companheiro:

- PV;
- MIT;
- deslocamento;
- PA;
- ações próprias;
- modo pilotado/autônomo;
- teste de Robótica;
- integração com Droneiro e Mecatrônico.

Ações típicas:

- Atacar;
- Deslocar-se;
- Transmitir;
- Reparar;
- Imobilizar;
- Primeiros Socorros;
- Emitir Alerta.

### 13.11 Veículos

Prioridade bem baixa. Entram como registro de item/capacidade. Sem mapa e sem combate veicular no roadmap inicial.

---

## 14. Dice tray

Requisitos:

- seleção múltipla de dados;
- modificadores fixos;
- `/r 1dX`;
- expressões compostas, como `/r 1d8+1d4-1`;
- rolagem pública ou privada;
- integração com perícias, dano, magia, item e talento;
- resultado com margem quando houver CD;
- histórico de rolagens;
- cartões clicáveis no log.

---

## 15. Chat, log e cartões

### 15.1 Chat

- Público por padrão.
- Sussurro para jogador específico.
- Canal/visão privilegiada do narrador.
- Rolagens ocultas do narrador.
- Rolagens privadas.

### 15.2 Log

Registra:

- rolagens;
- dano;
- cura;
- condições aplicadas/removidas;
- uso de talento;
- gasto de item;
- alteração de PV/PE/Mana/Integridade;
- sobrecarga;
- colapso;
- ruptura;
- compras;
- transferências.

### 15.3 Cartões jogáveis

Magias, itens, talentos, condições e resultados podem ser enviados ao chat como cartões. Cartões são clicáveis e abrem detalhe.

---

## 16. Ferramentas do narrador

Painel de narrador com:

- visão de todos os personagens;
- PV/PE/Mana/Integridade atuais;
- condições;
- efeitos ativos;
- PA e reações;
- botões para aplicar dano;
- botões para aplicar cura;
- aplicar/remover condição;
- pedir rolagem;
- disparar resistência;
- controlar rodada;
- avançar janela rápida/lenta;
- encerrar rodada;
- encerrar cena;
- override de turno;
- liberar perfil bloqueado;
- rolagem oculta;
- sussurro.

Sem mapa por enquanto. Ferramentas que dependem de alvo/mapa devem funcionar por seleção manual ou por aplicação direta na ficha.

---

## 17. Tabuleiro tático

Fora do roadmap inicial.

O jogo, por enquanto, será tratado como teatro da mente. Um tabuleiro hexagonal completo pode ser fase futura, com:

- hexágonos de 1 m;
- tamanhos de criatura;
- moldes de área;
- linha de visão;
- linha de efeito;
- cobertura;
- terreno;
- movimento medido.

Não entra antes da ficha, chat, turnos, condições, inventário, talentos e magia.

---

## 18. Roadmap

### Fase 0 — Esqueleto jogável

- Infra com Supabase.
- Conta de narrador.
- Mesas.
- Links/perfis.
- Bloqueio por presença.
- Estrutura inicial da Biblioteca do Sistema.
- Tabelas de conteúdo versionado.
- Payloads de automação em JSONB.
- Ficha Modo Jogo.
- Recursos atuais.
- Dice tray.
- Chat/log.
- Rolagem pública/privada.

### Fase 1 — Criação, evolução e condições

- Assistente de criação.
- Modo Evolução.
- Derivados automáticos.
- Condições.
- Efeitos ativos.
- Override/desfazer.
- Descanso curto/longo.

### Fase 2 — Combate operacional

- Trilha de turno em Rápidos/Lentos.
- Alternância PJ/PN.
- PA por janela.
- Reações.
- Prompt de rolagem.
- Console de próximo passo.
- Região do corpo por margem.
- Posturas, Mirar e Fintar como modificadores temporários.

### Fase 3 — Inventário e conteúdo

- Painel admin básico para Biblioteca do Sistema.
- Importação/exportação de conteúdo.
- Edição de descrição, preço, raridade, tags e payload.
- Fluxo rascunho/publicado/arquivado.
- Changelog de conteúdo.
- Loja.
- Inventário.
- Armas.
- Munição atual, estoque, tipos de munição, aljavas, flechas especiais, virotes e Recarregar.
- Armaduras.
- Escudos.
- Explosivos.
- Farmácia.
- Vertinas.
- Ferramentas.
- Dispositivos.
- Runas.
- Carteira: aretz/CDI/CDI Craqueada.
- Inventário do bando.
- Transferência de itens.

### Fase 4 — Talentos, escalpos e companheiros

- Talentos.
- Escalpos.
- Drones.
- Robôs.
- Mini-painel de companheiro.
- Efeitos por cadência.

### Fase 5 — Magia

- Importar fonte atual do sistema de magia.
- Vertentes.
- Magias.
- Especializações.
- Custos de mana finais.
- Atalhos de dano.
- Resistências.
- Surtos.
- Integração com sobrecarga e ruptura.

### Fase futura — Tabuleiro

- Hex grid.
- Tokens.
- Áreas.
- Linha de visão.
- Cobertura automática.
- Movimento medido.

---
