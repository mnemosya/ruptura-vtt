# ADITIVO AO PRD — EDITOR UNIVERSAL DA BIBLIOTECA E CONSTRUTOR DE AUTOMAÇÕES

**Projeto:** Ruptura VTT  
**Versão:** 1.0  
**Data:** 14 de julho de 2026  
**Status:** Requisito de produto e plano incremental de implementação  
**Documento-base:** `PRD Ruptura VTT.md`

---

## 1. FINALIDADE DESTE ADITIVO

Este documento detalha a implementação de uma interface administrativa capaz de criar, editar, duplicar, validar, publicar e arquivar conteúdos da Biblioteca do Sistema sem exigir edição de código ou manipulação direta de JSON.

Neste documento, **conteúdo** significa qualquer registro administrável usado pelo VTT ou pelo livro digital, incluindo:

- perícias;
- atributos e derivados administráveis;
- vertentes;
- especializações;
- magias;
- árvores e níveis de talentos;
- condições;
- ações;
- armas;
- armaduras;
- escudos;
- munições;
- Aljava;
- consumíveis;
- explosivos;
- ferramentas;
- dispositivos;
- runas;
- propriedades;
- escalpos;
- drones;
- robôs;
- veículos simples;
- regras estruturadas;
- capítulos e referências editoriais;
- demais tipos publicados futuramente.

A interface deve permitir que uma pessoa administradora descreva a regra por meio de campos, seletores e blocos de efeito. O VTT transforma essas escolhas em dados estruturados, valida o resultado e o disponibiliza aos fluxos operacionais compatíveis.

Exemplo mínimo esperado:

1. selecionar o tipo **Magia**;
2. informar nome, vertente, nível, custo de PA, custo de Mana e alcance;
3. adicionar um efeito **Dano**;
4. informar `1d8`;
5. selecionar o tipo de dano **Fogo**;
6. selecionar o gatilho **Ao acertar**;
7. salvar como rascunho;
8. validar;
9. publicar;
10. conjurar a magia no VTT usando o motor existente de magia e dano.

A pessoa administradora não deve precisar abrir o Table Editor do Supabase, editar arquivos do repositório ou escrever um payload manualmente.

---

## 2. RELAÇÃO COM O PRD PRINCIPAL

Este aditivo expande os requisitos de:

- Biblioteca do Sistema;
- administração de conteúdo e valores;
- payloads de automação;
- modelos e instâncias;
- versões, publicação e changelog;
- conteúdo oficial, conteúdo de mesa e homebrew;
- importação e exportação;
- Biblioteca do Livro.

As regras do PRD principal continuam válidas. Em caso de conflito, prevalecem, nesta ordem:

1. decisão canônica mais recente sobre a regra de Ruptura;
2. este aditivo para requisitos específicos do editor;
3. PRD consolidado;
4. comportamento legado do código ou dos payloads.

O editor deve refletir o conteúdo canônico. Um formato legado presente no banco não passa a definir a regra apenas por existir.

---

## 3. PROBLEMA DE PRODUTO

O VTT já consome grande parte do conteúdo de forma data-driven, mas a administração prática ainda depende de conhecimento técnico.

Problemas que este aditivo resolve:

- criação de conteúdo depende de arquivos, seeds, scripts ou edição direta de banco;
- automações ficam representadas por JSONB difícil de editar com segurança;
- conceitos semanticamente iguais podem usar formatos diferentes;
- alguns conteúdos possuem campos próprios, mas compartilham efeitos;
- não existe uma interface unificada para conteúdo;
- não existe validação amigável antes da publicação;
- não existe preview consistente da regra e da automação;
- uma alteração errada pode quebrar consumidores existentes;
- campos desconhecidos podem ser perdidos por editores incompletos;
- a relação entre texto, registro estruturado e executor mecânico não é visível para a pessoa administradora.

O produto precisa permitir manutenção frequente durante o playtest. Alterar dano, custo, descrição, duração, condição, cadência ou requisito deve ser uma operação editorial, desde que a mecânica já pertença ao catálogo de efeitos reconhecido pelo motor.

---

## 4. OBJETIVOS

### 4.1 Objetivo principal

Disponibilizar um **Editor Universal de Conteúdo** que use a mesma base para diferentes tipos de registro e um **Construtor de Automações** formado por efeitos reutilizáveis.

### 4.2 Objetivos específicos

- criar e editar conteúdo sem código;
- reutilizar tipos de efeito entre magias, talentos, condições, itens, ações e demais registros;
- impedir que a pessoa administradora precise escrever JSON;
- validar dados antes de publicar;
- indicar o grau de automação de cada efeito;
- preservar compatibilidade com conteúdo existente;
- permitir edição gradual dos payloads legados;
- separar modelo oficial de instância em jogo;
- registrar versões e mudanças;
- permitir expansão futura sem criar um editor inteiramente novo para cada categoria;
- deixar claro quando uma regra será automática, assistida, apenas informativa ou narrativa;
- manter campos desconhecidos durante a transição;
- impedir publicação de referências inválidas;
- permitir preview humano e preview técnico do conteúdo.

### 4.3 Resultados esperados

Após a implementação completa deste aditivo, deve ser possível criar sem código, entre outros:

- magia que causa `1d8` de fogo;
- item que cura `2d6` PV;
- talento que concede `+1 em Luta` durante uma rodada;
- condição que causa `1d4` no fim da rodada;
- magia que exige resistência e aplica Atordoado em falha;
- arma com dano, tipo de dano, perícia e propriedades;
- consumível que remove uma condição específica;
- runa que adiciona um modificador enquanto estiver ativa;
- ação que gasta PA e altera um recurso;
- atividade narrativa com cadência e registro em log.

---

## 5. PRINCÍPIOS DO EDITOR

### 5.1 Um editor, diferentes perfis de conteúdo

A interface deve usar uma estrutura comum e revelar seções conforme o tipo escolhido.

Exemplo:

- **Perícia:** atributos associados, descrição e tags;
- **Magia:** vertente, nível, ativação, custos, alcance, duração e efeitos;
- **Talento:** árvore, nível, gatilhos, cadência, requisitos e efeitos;
- **Arma:** categoria, preço, raridade, dano, munição, propriedades e efeitos;
- **Condição:** duração, gatilhos, modificadores e efeitos recorrentes.

A implementação pode dividir internamente o editor em módulos. Para a pessoa usuária, o fluxo deve continuar coeso.

### 5.2 Efeitos reutilizáveis

Dano, cura, condição, resistência, modificador, consumo e alteração de recurso devem ser blocos reutilizáveis.

Uma magia e uma granada podem usar o mesmo bloco **Dano**.  
Um talento e uma postura podem usar o mesmo bloco **Modificar teste**.  
Um antídoto e uma magia podem usar o mesmo bloco **Remover condição**.

### 5.3 Automação transparente

Cada efeito deve informar seu modo de execução:

- **Automático:** o sistema possui dados e executor suficientes para resolver o efeito;
- **Assistido:** o sistema prepara a operação e pede uma confirmação ou seleção;
- **Lembrete:** o sistema registra e exibe a regra, sem alterar automaticamente o estado;
- **Narrativo rastreado:** o sistema registra uso, escolhas, duração e log, deixando a resolução ao narrador.

A pessoa administradora deve ver essa classificação antes de publicar.

### 5.4 Dados canônicos e referências seguras

Relações entre conteúdos devem usar referências estáveis. Quando uma magia aplica Atordoado, o editor deve oferecer a condição publicada da Biblioteca, em vez de aceitar apenas texto livre.

Texto livre pode existir como observação, mas não deve substituir referência estruturada quando o conteúdo relacionado já existir.

### 5.5 Preservação de dados

O editor não pode descartar silenciosamente campos que não reconhece.

Ao abrir conteúdo legado:

- campos reconhecidos aparecem nos controles normais;
- campos desconhecidos são preservados;
- o editor informa que existem dados legados;
- a publicação é bloqueada quando a alteração destruiria informação;
- a conversão para o formato canônico exige ação explícita quando não for direta.

### 5.6 Modelo e instância

O editor altera o **modelo da Biblioteca**.

O editor não deve alterar diretamente:

- munição atual de uma arma específica;
- cargas restantes;
- MIT ou PD atuais;
- runas instaladas em uma instância;
- pilhas de flechas de uma Aljava específica;
- apelidos e customizações de um personagem;
- efeitos temporários ativos;
- usos já consumidos;
- dívida, dano ou estado atual de uma instância.

Esses dados pertencem às instâncias em jogo.

### 5.7 Implementação incremental

O editor deve crescer por etapas. O primeiro release não precisa representar todas as regras de Ruptura.

O MVP precisa resolver bem os casos comuns e informar com clareza os casos que ainda não podem ser editados ou automatizados.

---

## 6. PERFIS DE USUÁRIO E PERMISSÕES

### 6.1 Administrador da Biblioteca Oficial

Pode:

- criar conteúdo oficial;
- editar rascunhos;
- publicar;
- arquivar;
- duplicar registros;
- alterar schema versionado;
- consultar changelog;
- exportar;
- importar como rascunho;
- ver diagnóstico de automação;
- acessar o modo técnico de inspeção, quando necessário.

### 6.2 Narrador

Em fase futura, pode:

- criar conteúdo de mesa;
- duplicar conteúdo oficial para uma variação local;
- editar homebrew da própria mesa;
- publicar apenas para a própria campanha;
- consultar diferenças entre conteúdo oficial e override local.

O MVP pode restringir o editor à Biblioteca Oficial e ao administrador.

### 6.3 Jogador

Não acessa o editor administrativo.

Pode consultar conteúdo publicado conforme permissões da Biblioteca e da mesa.

### 6.4 Segurança mínima

As ações de criar, editar, publicar e arquivar devem ocorrer no servidor e validar a permissão do usuário.

A interface não deve usar service role no cliente.


---

## 7. ESTRUTURA GERAL DA INTERFACE

A experiência administrativa deve ter, no mínimo:

```text
Admin
└── Biblioteca
    ├── Lista de conteúdos
    ├── Criar conteúdo
    ├── Editar conteúdo
    ├── Duplicar conteúdo
    ├── Preview
    ├── Validação
    ├── Publicação
    ├── Arquivados
    └── Histórico
```

### 7.1 Lista de conteúdos

A lista deve permitir:

- busca por nome, slug e texto;
- filtro por tipo;
- filtro por status;
- filtro por versão;
- filtro por tags;
- filtro por origem ou pack;
- filtro por grau de automação;
- ordenação;
- indicação de erros de validação;
- indicação de conteúdo legado;
- abertura do registro;
- duplicação;
- arquivamento, quando permitido;
- acesso ao trecho do livro relacionado, quando houver vínculo.

Cada linha ou card deve mostrar:

- nome;
- tipo;
- subtipo;
- status;
- versão;
- data da última alteração;
- origem;
- grau de automação;
- alertas.

### 7.2 Criar conteúdo

O botão **Adicionar conteúdo** abre o editor vazio.

Primeira decisão:

- tipo do conteúdo.

Depois da seleção, o editor monta as seções aplicáveis.

### 7.3 Editar conteúdo

Ao editar:

- carregar o registro completo;
- identificar schema e formato;
- exibir campos reconhecidos;
- preservar campos desconhecidos;
- mostrar versão publicada e rascunho atual;
- indicar alterações ainda não salvas;
- permitir cancelar sem mutar o registro;
- permitir comparar rascunho com publicado.

### 7.4 Modal ou página

A implementação pode usar modal, drawer ou página dedicada.

Requisito de produto:

- conteúdos simples podem ser editados sem navegação excessiva;
- conteúdos grandes não podem ficar presos em um modal pequeno;
- o editor precisa suportar muitos efeitos, requisitos e relações;
- a solução deve funcionar bem em desktop;
- a pessoa usuária não deve perder alterações ao navegar entre seções do editor.

A equipe pode escolher modal responsivo, página dedicada ou uma combinação.

---

## 8. SEÇÕES DO EDITOR UNIVERSAL

### 8.1 Identificação

Campos-base:

- tipo de conteúdo;
- nome;
- slug;
- ID interno, somente leitura quando gerado;
- categoria;
- subtipo;
- descrição curta;
- descrição completa;
- tags;
- idioma, quando aplicável;
- origem;
- pack;
- referência ao capítulo ou documento;
- status;
- versão;
- schema version.

Regras:

- slug deve ser estável;
- alteração de slug publicado exige aviso e análise de referências;
- nome pode ser alterado sem alterar o slug;
- tipo de conteúdo publicado não deve ser alterado livremente;
- duplicar conteúdo cria novo ID e novo slug.

### 8.2 Classificação

Campos exibidos conforme o tipo:

- nível;
- árvore de talento;
- vertente;
- especialização;
- atributo principal;
- atributos alternativos;
- raridade;
- categoria de arma;
- categoria de item;
- grupo de condição;
- tipo de ação;
- tipo de companheiro;
- grupo editorial;
- conteúdo-pai;
- ordem de exibição.

### 8.3 Texto e apresentação

- nome de exibição;
- descrição curta;
- descrição longa;
- texto de regra;
- texto de ficção;
- observação do narrador;
- instrução de uso;
- texto de log;
- ícone;
- imagem, futuramente;
- labels e chips;
- conteúdo relacionado.

O texto não deve ser usado como fonte exclusiva de cálculo quando houver campos estruturados.

### 8.4 Requisitos

O editor deve permitir uma lista de requisitos.

Tipos iniciais:

- atributo mínimo;
- perícia mínima;
- nível de vertente;
- talento anterior;
- nível anterior da árvore;
- conteúdo adquirido;
- tag;
- equipamento;
- propriedade;
- condição presente;
- condição ausente;
- recurso mínimo;
- raridade máxima ou mínima;
- confirmação manual;
- texto narrativo.

Cada requisito deve indicar:

- quem é avaliado;
- operador;
- valor;
- referência;
- momento da validação;
- comportamento em falha;
- mensagem exibida.

### 8.5 Ativação

Opções iniciais:

- passivo;
- ação;
- reação;
- ação livre;
- toggle;
- gatilho automático;
- atividade própria;
- atividade narrativa;
- efeito de equipamento;
- efeito de condição;
- efeito de propriedade.

Campos relacionados:

- custo de PA;
- custo de Mana;
- custo de Reação;
- custo de Sobrecarga;
- custo de RAM;
- consumo de carga;
- consumo de munição;
- consumo de item;
- tempo narrativo;
- sustentação;
- possibilidade de cancelamento;
- refund em cancelamento, quando aplicável.

### 8.6 Alvo, alcance e área

Campos:

- origem;
- alvo:
  - próprio;
  - aliado;
  - inimigo;
  - criatura;
  - item;
  - arma;
  - área;
  - ponto;
  - drone;
  - robô;
  - Trama;
  - qualquer registro compatível;
- quantidade de alvos;
- alcance;
- unidade;
- área;
- forma da área;
- seleção manual;
- confirmação de distância;
- confirmação de adjacência;
- confirmação de linha de visão;
- filtro por tags;
- filtro por condições.

Como Ruptura permanece em teatro da mente, distância, adjacência e linha de visão podem operar em modo assistido.

### 8.7 Duração

Opções iniciais:

- instantâneo;
- até fim do turno;
- até fim do próximo turno;
- até fim da rodada;
- quantidade de rodadas;
- cena;
- combate;
- minuto;
- hora;
- dia;
- descanso curto;
- descanso longo;
- sessão;
- missão;
- enquanto equipado;
- enquanto ativo;
- até ser consumido;
- manual;
- texto narrativo.

A duração deve separar:

- unidade;
- valor;
- gatilho de expiração;
- possibilidade de encerramento manual;
- persistência;
- comportamento no reload.

Não converter automaticamente dia em descanso longo nem turno em rodada.

### 8.8 Usos e cadência

Campos:

- possui limite;
- quantidade de usos;
- cadência;
- compartilhamento de uso entre opções;
- recarga;
- reset automático;
- reset manual;
- escopo:
  - personagem;
  - item;
  - alvo;
  - cena;
  - campanha;
- chave de uso;
- comportamento em aquisição posterior.

Cadências iniciais:

- rodada;
- turno;
- cena;
- combate;
- dia;
- descanso curto;
- descanso longo;
- sessão;
- missão;
- sessão de Malha;
- manual.

### 8.9 Efeitos

Seção repetível com:

- botão **Adicionar efeito**;
- seleção do tipo de efeito;
- edição do bloco;
- duplicação;
- reordenação;
- ativação/desativação no rascunho;
- remoção;
- preview;
- validação individual;
- indicação do executor;
- indicação do modo de automação.

Um registro pode ter múltiplos efeitos em sequência.

### 8.10 Relações

Permitir relacionar conteúdo com:

- condições;
- propriedades;
- magias;
- talentos;
- vertentes;
- especializações;
- itens;
- runas;
- ações;
- regras;
- capítulos;
- conteúdos derivados;
- conteúdo substituído;
- conteúdo requerido.

Referências quebradas devem bloquear publicação quando forem necessárias à execução.

### 8.11 Mercado e aquisição

Campos opcionais:

- preço;
- moeda;
- raridade;
- disponibilidade;
- restrições;
- estoque;
- quantidade inicial;
- inclui outro conteúdo;
- item criado automaticamente;
- peso ou capacidade, quando adotado;
- categoria de loja;
- pode ser comprado na criação;
- limite de compra;
- tags de mercado.

### 8.12 Equipamento e instância

Campos de modelo:

- slots;
- capacidade;
- dano-base;
- tipo de dano;
- perícia de ataque;
- atributo de ataque;
- munição aceita;
- capacidade do carregador;
- propriedades;
- MIT-base;
- PD-base;
- regiões;
- cargas máximas;
- runas permitidas;
- estado inicial.

O editor deve mostrar uma nota clara:

> Esses valores definem defaults do modelo. Estado atual de instâncias existentes é preservado conforme as regras de migração e atualização.

### 8.13 Preview

O preview deve ter, no mínimo:

- card como aparecerá na Biblioteca;
- resumo operacional;
- custos;
- requisitos;
- efeitos em ordem;
- grau de automação;
- referências;
- warnings;
- payload técnico somente em modo avançado;
- diferenças entre rascunho e publicado.

---

## 9. CONSTRUTOR UNIVERSAL DE EFEITOS

### 9.1 Estrutura comum de um efeito

Todo efeito deve possuir uma estrutura comum conceitual, ainda que a implementação escolha nomes e organização diferentes.

Campos comuns:

- identificador interno do efeito;
- tipo;
- nome opcional;
- ordem;
- habilitado;
- gatilho;
- alvo;
- condições;
- modo de automação;
- duração;
- usos ou cadência específica;
- acúmulo;
- prioridade;
- dependências;
- payload específico;
- texto de log;
- texto de lembrete;
- comportamento de erro.

### 9.2 Gatilhos iniciais

- ao usar;
- ao ativar;
- ao desativar;
- ao equipar;
- ao desequipar;
- ao acertar;
- ao errar;
- ao causar dano;
- ao sofrer dano;
- ao curar;
- ao receber cura;
- ao obter uma faixa de margem;
- ao obter crítico;
- ao falhar em resistência;
- ao passar em resistência;
- ao aplicar condição;
- ao remover condição;
- ao iniciar turno;
- ao encerrar turno;
- ao iniciar rodada;
- ao encerrar rodada;
- ao iniciar cena;
- ao encerrar cena;
- ao chegar a 0 PV;
- ao consumir item;
- ao gastar recurso;
- após confirmação;
- manualmente.

Gatilhos que o motor ainda não detecta devem ser marcados como assistidos ou lembrete.

### 9.3 Condições do efeito

O editor deve permitir combinar condições simples.

Exemplos:

- PV abaixo da metade;
- PV igual a zero;
- possuir condição;
- não possuir condição;
- usar arma corpo a corpo;
- usar arma à distância;
- arma com propriedade;
- tipo de dano específico;
- teste de uma perícia;
- ação com determinada tag;
- sucesso crítico;
- alvo não percebe o atacante;
- estar em Furtividade;
- recurso mínimo;
- uso ainda disponível;
- confirmação manual.

O MVP pode começar com combinação por **todas as condições**. Combinações avançadas com grupos `E`/`OU` podem entrar depois, desde que o schema já permita evolução.

### 9.4 Modos de automação

#### Automático

Usar quando o executor possui todos os dados necessários.

Exemplo:

- reduzir 2 de Mana;
- rolar `1d8`;
- aplicar condição com duração estruturada;
- conceder +1 em Luta por uma rodada.

#### Assistido

Usar quando falta uma decisão de mesa.

Exemplo:

- confirmar adjacência;
- escolher alvo;
- confirmar que o alvo não percebe o atacante;
- selecionar qual condição remover;
- informar MIT manual.

#### Lembrete

Usar quando o motor ainda não possui executor suficiente.

Exemplo:

- avançar 15 espaços em um subsistema ainda sem movimentação operacional;
- alterar um elemento narrativo sem estado estruturado;
- resolver um efeito raro ainda não implementado.

#### Narrativo rastreado

Usar para atividades cuja principal consequência é narrativa.

Exemplo:

- criar um contato;
- encontrar abrigo;
- realizar uma gambiarra;
- obter um favor.

### 9.5 Ordem e atomicidade

Os efeitos devem possuir ordem explícita.

Exemplo:

1. validar custo;
2. gastar Mana;
3. rolar ataque;
4. aplicar dano;
5. pedir resistência;
6. aplicar condição em falha;
7. registrar log.

A execução deve validar requisitos e custos antes de mutar estado.

Quando múltiplos efeitos alterarem registros diferentes, a implementação deve reduzir o risco de persistência parcial e informar qualquer falha de forma clara.


---

## 10. CATÁLOGO DE EFEITOS

Os tipos abaixo formam o catálogo-alvo. O roadmap define quais entram em cada entrega.

### 10.1 Dano

Campos:

- fórmula:
  - valor fixo;
  - dados;
  - dados mais modificador;
- quantidade de dados;
- faces;
- modificador;
- tipo de dano;
- dano principal ou adicional;
- alvo;
- gatilho;
- metade em sucesso;
- zero em sucesso;
- ignora MIT;
- ignora PD;
- perfurante;
- região;
- tipo de ataque;
- crítico;
- multiplicador;
- origem do dano;
- aplicação automática ou envio para resolução do narrador.

Validações:

- quantidade e faces positivas;
- tipo de dano publicado;
- fórmula válida;
- alvo compatível;
- flags conflitantes identificadas;
- efeito de dano exige momento de aplicação.

### 10.2 Cura

Campos:

- recurso;
- fórmula;
- alvo;
- limite pelo máximo;
- pode ultrapassar máximo;
- valor temporário;
- gatilho;
- condição necessária;
- remover condição associada;
- estabilizar colapso;
- custo;
- preview.

Recursos iniciais:

- PV;
- PE;
- Mana;
- Integridade;
- PD;
- recurso customizado validado.

### 10.3 Aplicar condição

Campos:

- condição da Biblioteca;
- alvo;
- gatilho;
- duração;
- intensidade;
- acumulável;
- máximo de pilhas;
- substituir duração;
- autoria;
- resistência;
- CD;
- efeito em sucesso;
- efeito em falha;
- confirmação;
- texto de log.

### 10.4 Remover condição

Campos:

- condição específica;
- grupo de condições;
- lista de condições possíveis;
- quantidade removida;
- escolha manual;
- remover todas;
- origem permitida;
- alvo;
- gatilho;
- bloqueio sem condição compatível;
- consumo somente após validação.

### 10.5 Modificar teste

Campos:

- valor;
- bônus ou penalidade;
- vantagem ou desvantagem;
- atributo;
- perícia;
- ação;
- defesa;
- tags;
- arma;
- item;
- alvo;
- duração;
- acumulável;
- máximo;
- consumo no próximo teste;
- confirmação de contexto;
- origem visível.

### 10.6 Alterar recurso

Campos:

- recurso;
- operação:
  - somar;
  - reduzir;
  - definir;
  - conceder temporariamente;
  - aumentar máximo;
  - reduzir máximo;
- valor;
- fórmula;
- mínimo;
- máximo;
- alvo;
- gatilho;
- duração;
- refund;
- bloqueio por insuficiência;
- ordem de consumo.

Recursos iniciais:

- PV;
- PE;
- Mana;
- Integridade;
- PA;
- Reações;
- Sobrecarga;
- RAM;
- cargas;
- munição;
- dados de gatilho.

### 10.7 Teste ou resistência

Campos:

- tipo;
- atributo;
- perícia;
- CD fixa;
- CD derivada;
- referência para CD;
- quem testa;
- momento;
- resultado em sucesso;
- resultado em falha;
- resultado em crítico;
- resultado em falha limitada;
- repetição;
- frequência;
- efeitos filhos por resultado.

Este tipo precisa suportar efeitos compostos.

### 10.8 Efeito temporário

Campos:

- nome;
- alvo;
- duração;
- modificadores;
- efeitos recorrentes;
- acúmulo;
- máximo de pilhas;
- renovação;
- expiração;
- encerramento manual;
- origem;
- ícone;
- texto;
- comportamento no reload;
- comportamento ao transferir item;
- comportamento no fim de cena/rodada.

### 10.9 Consumo

Campos:

- tipo:
  - item;
  - quantidade;
  - carga;
  - munição;
  - flecha;
  - uso de talento;
  - dado;
  - recurso;
- quantidade;
- momento do consumo;
- condição para consumir;
- refund em cancelamento;
- prioridade;
- fonte;
- estoque compatível.

### 10.10 Modificação de margem

Campos:

- faixa de origem;
- faixa de destino;
- ação;
- perícia;
- contexto;
- confirmação;
- requisito;
- consumo;
- duração;
- uma vez por cadência;
- comportamento em crítico ou erro.

### 10.11 Alterar dano recebido

Campos:

- reduzir;
- anular;
- multiplicar;
- fórmula;
- tipo de dano;
- antes ou depois de MIT;
- antes ou depois de PD;
- custo;
- alvo;
- gatilho;
- limite;
- uso;
- log.

### 10.12 Ação, reação ou ataque adicional

Campos:

- ação gerada;
- custo;
- custo substituído;
- alvo;
- arma;
- penalidade;
- momento;
- limite;
- consome Reação;
- consome PA;
- gratuito;
- resultado independente;
- vínculo com o evento original.

### 10.13 Inventário e equipamento

Campos:

- conceder item;
- consumir item;
- criar instância;
- modificar instância;
- instalar runa;
- remover runa;
- ativar runa;
- desativar runa;
- recarregar;
- selecionar munição;
- alterar MIT;
- alterar PD;
- alterar capacidade;
- efeito temporário em item;
- transferência;
- autorização.

### 10.14 Mercado

Campos:

- desconto percentual;
- desconto fixo;
- multiplicador;
- permitir saldo insuficiente;
- criar dívida;
- limitar raridade;
- alterar disponibilidade;
- alterar preço;
- registrar fornecedor;
- duração;
- cadência;
- escopo da compra.

### 10.15 Companheiro

Campos:

- tipo de companheiro;
- conceder PA;
- alterar PA máximo;
- executar ação;
- programar gatilho;
- conceder modificador;
- ação adicional;
- parear unidades;
- compartilhar comando;
- duração;
- estado;
- alvo.

### 10.16 Trama

Campos:

- ação de Trama;
- custo de PA;
- custo de RAM;
- teste;
- ignorar teste;
- alterar Detecção;
- alterar Rastro;
- revelar Nó;
- revelar Bloqueio;
- alterar alcance de Avançar;
- criar presença;
- modificar assinatura;
- duração;
- cadência.

### 10.17 Registro narrativo

Campos:

- título da atividade;
- campos personalizados;
- cadência;
- duração;
- alvo;
- escolhas;
- texto de resultado;
- estado ativo;
- encerramento;
- custo;
- log;
- observações.

---

## 11. PERFIS DE CONTEÚDO

Os perfis abaixo definem seções esperadas. Eles não obrigam a implementação a criar componentes totalmente separados.

### 11.1 Perícia

Seções:

- identificação;
- descrição;
- atributo principal;
- atributos alternativos;
- tags;
- exemplos de uso;
- ordem;
- relações;
- publicação.

Normalmente não possui custos ou efeitos próprios. O schema deve permitir efeitos futuros quando necessário.

### 11.2 Magia

Seções:

- identificação;
- vertente;
- nível;
- tipo;
- pré-requisitos;
- ativação;
- PA;
- Mana;
- Sobrecarga, quando houver;
- alcance;
- área;
- alvo;
- duração;
- sustentação;
- teste;
- resistência;
- efeitos;
- especializações relacionadas;
- publicação.

### 11.3 Talento

Seções:

- identificação;
- árvore;
- nível;
- pré-requisitos;
- padrão operacional;
- ativação;
- gatilho;
- usos;
- cadência;
- duração;
- efeitos;
- relações com níveis anteriores;
- publicação.

### 11.4 Condição

Seções:

- identificação;
- grupo;
- descrição;
- duração padrão;
- acúmulo;
- modificadores;
- efeitos recorrentes;
- ações liberadas;
- formas de remoção;
- relações;
- publicação.

### 11.5 Item ou equipamento

Seções:

- identificação;
- categoria;
- subtipo;
- mercado;
- raridade;
- preço;
- aquisição;
- ativação;
- cargas;
- consumo;
- equipamento;
- efeitos;
- propriedades;
- instância;
- publicação.

### 11.6 Arma

Extende item com:

- categoria;
- ataque;
- perícia;
- atributo;
- dano;
- tipo de dano;
- propriedades;
- alcance;
- munição;
- carregador;
- recarga;
- Aljava ou estoque, quando aplicável;
- região e crítico;
- efeitos.

### 11.7 Armadura ou escudo

Extende item com:

- MIT;
- PD;
- regiões;
- capacidade;
- desgaste;
- propriedades;
- runas;
- efeitos.

### 11.8 Runa ou propriedade

Seções:

- identificação;
- compatibilidade;
- requisito;
- ativação;
- espaços;
- efeitos;
- restrições;
- publicação.

### 11.9 Ação

Seções:

- identificação;
- janela;
- custo;
- requisitos;
- alvo;
- teste;
- efeitos;
- condições relacionadas;
- logs;
- publicação.

### 11.10 Drone ou robô

Seções:

- identificação;
- modelo;
- mini-ficha;
- PA;
- ações;
- estados;
- equipamento;
- efeitos;
- programação;
- publicação.

### 11.11 Regra ou conteúdo editorial

Seções:

- identificação;
- capítulo;
- hierarquia;
- texto;
- tabelas;
- referências;
- entidades vinculadas;
- status;
- versão.

Pode não possuir automação.

---

## 12. EXEMPLOS COMPLETOS

### 12.1 Magia de ataque com 1d8 de fogo

#### Dados básicos

- Tipo: Magia
- Nome: Rajada Ígnea
- Slug: `rajada_ignea`
- Vertente: Energética
- Nível: 1
- Tipo da magia: Ataque
- PA: 2
- Mana: 2
- Alcance: 15 metros
- Duração: Instantânea
- Teste: Precisão

#### Efeito

- Tipo: Dano
- Fórmula: 1d8
- Tipo de dano: Fogo
- Alvo: Alvo principal
- Gatilho: Ao acertar
- Automação: Automática ou assistida conforme o fluxo de ataque mágico disponível

#### Resultado esperado

- a magia aparece no catálogo;
- personagens elegíveis podem aprendê-la;
- conjurar valida PA e Mana;
- acertar disponibiliza ou aplica `1d8` de fogo;
- log registra magia, custo, rolagem e dano;
- o payload técnico é gerado pelo editor.

### 12.2 Item que cura 2d6 PV

#### Dados básicos

- Tipo: Consumível
- Nome: Selante Regenerativo
- Raridade: Incomum
- Preço: 400
- PA: 1
- Cargas: 1

#### Efeito

- Tipo: Cura
- Fórmula: 2d6
- Recurso: PV
- Alvo: Próprio ou aliado
- Gatilho: Ao usar
- Limite: PV máximo
- Automação: Assistida para seleção de alvo

#### Resultado esperado

- o item pode ser comprado;
- cria instância com carga;
- usar valida PA e carga;
- cura o alvo;
- consome carga somente depois da validação;
- gera log.

### 12.3 Talento que concede +1 em Luta por uma rodada

#### Dados básicos

- Tipo: Talento
- Nome: Impulso Marcial
- Árvore: exemplo
- Nível: 1
- Ativação: Ação livre
- Usos: 1
- Cadência: Cena

#### Efeito

- Tipo: Efeito temporário
- Duração: 1 rodada
- Alvo: Próprio
- Modificador interno:
  - Tipo: Modificar teste
  - Perícia: Luta
  - Valor: +1

#### Resultado esperado

- ativar cria efeito temporário;
- o chip aparece;
- Luta recebe +1;
- expira no momento configurado;
- uso permanece consumido até o reset de cena.

### 12.4 Condição que causa 1d4 no fim da rodada

#### Dados básicos

- Tipo: Condição
- Nome: Corroído
- Acumulável: Não
- Duração padrão: 3 rodadas

#### Efeito

- Tipo: Dano
- Fórmula: 1d4
- Tipo de dano: Ácido
- Alvo: Portador
- Gatilho: Fim da rodada
- Automação: Automática ou assistida conforme o dano periódico disponível

#### Resultado esperado

- aplicar condição cria estado ativo;
- fim de rodada prepara ou aplica o dano;
- duração reduz;
- condição expira;
- logs identificam autoria e fonte.

### 12.5 Magia com resistência e condição em falha

#### Dados básicos

- Tipo: Magia
- Nome: Pulso Neural
- Vertente: Sináptica
- Nível: 2
- PA: 2
- Mana: 3
- Alcance: 10 metros

#### Efeito principal

- Tipo: Teste ou resistência
- Quem testa: Alvo
- Perícia: Vontade
- CD: CD da vertente do conjurante

#### Resultado em falha

- Tipo: Aplicar condição
- Condição: Atordoado
- Duração: 1 rodada

#### Resultado em sucesso

- Nenhum efeito adicional

#### Resultado esperado

- o cartão informa resistência;
- a CD usa a regra canônica;
- o alvo ou narrador resolve;
- falha aplica Atordoado;
- sucesso não aplica;
- log registra resultado.


---

## 13. SCHEMA CANÔNICO E COMPATIBILIDADE

### 13.1 Requisito de schema versionado

Conteúdos editáveis devem declarar uma versão de schema.

A implementação deve definir uma estrutura canônica para:

- registro de conteúdo;
- ativação;
- requisito;
- alvo;
- duração;
- uso;
- efeito;
- referência;
- publicação.

Este aditivo não fixa nomes de propriedades TypeScript ou a divisão exata entre tabelas. A equipe deve escolher a organização após auditar o repositório e os payloads existentes.

#### Requisitos invariáveis

- um conceito deve possuir uma representação canônica;
- conteúdo novo deve usar a versão canônica;
- validação deve ocorrer no servidor;
- consumidores devem saber qual schema estão lendo;
- versões antigas devem ter adaptadores ou diagnóstico;
- conversão não pode perder dados silenciosamente.

### 13.2 Estratégia para conteúdo legado

O editor deve suportar transição gradual.

Fluxo recomendado:

1. carregar registro legado;
2. identificar versão e padrões;
3. adaptar campos reconhecidos para a visão do editor;
4. preservar o payload original;
5. mostrar alertas;
6. permitir edição dos campos seguros;
7. gerar preview de conversão;
8. converter ao salvar somente quando a transformação for segura;
9. exigir confirmação para conversão ambígua;
10. impedir publicação quando houver perda de informação.

Classificação dos legados:

- conversão direta;
- conversão com confirmação;
- somente leitura;
- incompatível até novo tipo de efeito;
- inválido.

### 13.3 Campos desconhecidos

Campos desconhecidos devem permanecer associados ao rascunho.

O modo avançado pode exibir uma lista técnica somente leitura com:

- caminho;
- valor;
- origem;
- motivo de não representação.

A edição direta de JSON não faz parte do fluxo principal.

### 13.4 Slugs e referências

- slug publicado é identificador estável;
- mudança de slug exige varredura de dependências;
- referências devem apontar para ID ou slug conforme o padrão escolhido;
- apagar conteúdo referenciado deve ser bloqueado;
- arquivar pode ser permitido sem quebrar instâncias existentes;
- duplicar gera novas referências somente quando explicitamente escolhido.

---

## 14. PUBLICAÇÃO E VERSIONAMENTO

### 14.1 Estados

#### Rascunho

- visível no admin;
- pode estar incompleto;
- não entra nas consultas normais do jogo;
- pode ser validado e visualizado.

#### Publicado

- disponível aos consumidores autorizados;
- possui versão;
- passou por validação;
- gera changelog.

#### Arquivado

- mantido para histórico e instâncias existentes;
- não aparece para novas aquisições;
- pode ser restaurado ou duplicado;
- referências existentes continuam resolvíveis conforme a política adotada.

### 14.2 Fluxo

```text
Criar ou editar
→ salvar rascunho
→ validar
→ corrigir erros
→ revisar preview
→ comparar com publicado
→ publicar
→ registrar versão e changelog
```

### 14.3 Validação

A validação deve separar:

- erros bloqueantes;
- warnings;
- informações.

Erros bloqueantes incluem:

- campo obrigatório ausente;
- fórmula inválida;
- referência inexistente;
- efeito incompatível com o conteúdo;
- duração inválida;
- custo negativo;
- schema não reconhecido;
- perda de campo legado;
- automação marcada como automática sem executor disponível;
- combinação contraditória.

Warnings incluem:

- efeito assistido;
- reset manual;
- referência arquivada;
- texto sem vínculo estruturado;
- executor parcial;
- alteração com impacto em instâncias futuras;
- conteúdo sem descrição.

### 14.4 Changelog

Cada publicação deve registrar:

- conteúdo;
- ID;
- slug;
- versão anterior;
- nova versão;
- autor;
- data;
- campos alterados;
- resumo;
- impacto;
- observações;
- origem do rascunho;
- mudança de automação.

### 14.5 Impacto em instâncias

Antes de publicar alteração de modelo, o editor deve informar:

- afeta apenas novas instâncias;
- afeta leitura dinâmica de instâncias existentes;
- exige migração de instâncias;
- mantém overrides;
- pode alterar cálculo;
- pode alterar texto;
- pode alterar disponibilidade.

Munição atual, cargas, MIT/PD atuais, runas instaladas, nome customizado e demais estados individuais não devem ser sobrescritos por publicação comum.

---

## 15. PREVIEW E DIAGNÓSTICO

O editor deve produzir duas visões.

### 15.1 Preview humano

Mostra o conteúdo como usuário verá:

- card;
- texto;
- custo;
- alcance;
- duração;
- requisitos;
- efeitos;
- tags;
- grau de automação;
- warnings.

### 15.2 Diagnóstico técnico

Mostra, sem exigir edição:

- schema;
- adaptador usado;
- executores reconhecidos;
- efeitos sem executor;
- referências;
- campos desconhecidos;
- campos derivados;
- validações;
- diferenças do payload publicado;
- impacto esperado.

O diagnóstico técnico ajuda a equipe durante o desenvolvimento e o playtest, mas não substitui a interface amigável.

---

## 16. IMPORTAÇÃO E EXPORTAÇÃO

### 16.1 Exportação

O sistema deve permitir exportar:

- registro individual;
- seleção;
- tipo completo;
- pack;
- versão da Biblioteca.

Formato principal:

- JSON validado.

A exportação deve incluir:

- schema version;
- referências;
- metadata;
- conteúdo;
- efeitos;
- status;
- versão;
- checksum, quando adotado.

### 16.2 Importação

Fluxo futuro:

1. selecionar arquivo;
2. identificar schema;
3. validar;
4. comparar;
5. exibir novos, alterados, iguais e inválidos;
6. preservar campos;
7. importar como rascunho;
8. revisar;
9. publicar.

Importação nunca publica automaticamente no MVP.

### 16.3 Markdown e livro

Markdown pode alimentar a camada editorial.

Automações devem ser extraídas ou mapeadas para registros estruturados antes de entrar no motor.

---

## 17. PROCESSO INCREMENTAL DE IMPLEMENTAÇÃO

A implementação deve ocorrer em checkpoints. Cada checkpoint precisa preservar o funcionamento existente, atualizar documentação e registrar limitações reais.

A equipe ou o agente de código decide:

- arquivos;
- componentes;
- hooks;
- serviços;
- schemas;
- bibliotecas de formulário;
- bibliotecas de validação;
- tabelas;
- migrations;
- divisão de módulos;
- estratégia de cache.

Este aditivo define resultado, sequência e critérios de aceite.

---

# ETAPA 0 — AUDITORIA E PLANO TÉCNICO

## Objetivo

Conhecer o sistema atual antes de criar schema, migration ou interface.

## Trabalho esperado

- inventariar `content_type`;
- contar registros;
- mapear packs;
- mapear campos comuns;
- mapear campos específicos;
- mapear formatos de efeito;
- identificar executores;
- identificar payloads legados;
- identificar conteúdos ausentes como registros próprios;
- identificar queries e normalizadores;
- identificar tabelas de versão e changelog;
- identificar permissões;
- identificar relação entre documentos editoriais e entidades;
- analisar como instâncias preservam estado;
- propor estratégia de compatibilidade.

## Entregas

- auditoria de tipos;
- auditoria de efeitos;
- matriz tipo × seção;
- matriz efeito × executor;
- proposta de schema canônico;
- plano de migration;
- riscos;
- divisão das etapas seguintes.

## Critérios de aceite

- nenhum conteúdo publicado alterado;
- nenhuma migração aplicada;
- nenhuma regra inventada;
- exemplos reais do repositório;
- todos os tipos atuais classificados;
- lacunas explicitadas.

---

# ETAPA 1 — CAMADA CANÔNICA DE DEFINIÇÕES E VALIDAÇÃO

## Objetivo

Criar a base que descreve tipos, campos e efeitos.

## Trabalho esperado

- definir registro de tipos de conteúdo;
- definir registro de tipos de efeito;
- definir campos comuns;
- definir extensões por tipo;
- definir schema versionado;
- definir validação;
- definir normalização;
- definir adaptadores de leitura;
- definir preservação de campos desconhecidos;
- definir diagnóstico de executor.

## Entregas

- schemas;
- tipos;
- catálogo inicial;
- validadores;
- fixtures ou exemplos permanentes;
- documentação.

## Critérios de aceite

- magia de `1d8` pode ser representada;
- item de cura pode ser representado;
- talento com modificador temporário pode ser representado;
- condição periódica pode ser representada;
- resistência com efeito em falha pode ser representada;
- registros legados continuam legíveis;
- nenhum consumidor existente é quebrado.

---

# ETAPA 2 — LISTA ADMINISTRATIVA E INSPEÇÃO

## Objetivo

Disponibilizar acesso administrativo seguro ao conteúdo atual antes de permitir escrita.

## Trabalho esperado

- rota administrativa;
- listagem;
- busca;
- filtros;
- paginação ou carregamento adequado;
- tela de detalhe;
- status;
- versão;
- origem;
- diagnóstico;
- indicação de legado;
- visualização de referências.

## Entregas

- interface read-only;
- controle de acesso;
- preview;
- diagnóstico.

## Critérios de aceite

- administrador encontra qualquer conteúdo;
- filtros funcionam;
- conteúdo publicado é exibido sem perda;
- tipos desconhecidos não quebram a tela;
- payload não aparece como JSON bruto no fluxo principal;
- acesso indevido é bloqueado.

---

# ETAPA 3 — EDITOR UNIVERSAL DE CAMPOS BÁSICOS

## Objetivo

Criar e editar metadados e campos simples sem automação complexa.

## Tipos iniciais

- magia;
- talento;
- item/equipamento.

## Campos iniciais

- identificação;
- classificação;
- descrição;
- tags;
- requisitos simples;
- custos;
- alcance;
- duração;
- usos;
- mercado;
- status.

## Entregas

- criar;
- editar;
- duplicar;
- cancelar;
- salvar rascunho;
- preview;
- validação.

## Critérios de aceite

- criar rascunho de magia;
- criar rascunho de talento;
- criar rascunho de item;
- reabrir e editar;
- duplicar sem reutilizar ID;
- campos inválidos são explicados;
- conteúdo publicado não muda ao salvar rascunho.

---

# ETAPA 4 — CONSTRUTOR DE EFEITOS MVP

## Objetivo

Permitir automações comuns sem JSON.

## Efeitos do MVP

1. dano;
2. cura;
3. aplicar condição;
4. remover condição;
5. modificar teste;
6. alterar recurso.

## Trabalho esperado

- adicionar efeito;
- selecionar tipo;
- renderizar campos;
- reordenar;
- duplicar;
- remover;
- validar;
- mostrar modo de automação;
- preview;
- gerar payload canônico;
- conectar executores disponíveis.

## Critérios de aceite

- criar magia `1d8` de fogo;
- criar item `2d6` de cura;
- criar talento `+1 Luta`;
- criar consumível que remove Envenenado;
- criar magia que reduz Mana;
- salvar e reabrir sem perder dados;
- publicar somente quando válido;
- consumidores compatíveis interpretam o conteúdo.


---

# ETAPA 5 — PUBLICAÇÃO, VERSÕES E CHANGELOG

## Objetivo

Fechar o ciclo editorial.

## Trabalho esperado

- validar no servidor;
- publicar rascunho;
- criar versão;
- registrar changelog;
- arquivar;
- comparar versões;
- impedir publicação concorrente silenciosa;
- informar impacto em instâncias.

## Critérios de aceite

- rascunho não aparece no jogo;
- publicação aparece no catálogo;
- versão é incrementada;
- changelog registra alteração;
- arquivado deixa de aparecer para nova aquisição;
- instâncias existentes mantêm estado;
- edição simultânea gera aviso ou bloqueio controlado.

---

# ETAPA 6 — ADAPTADORES E EDIÇÃO DE LEGADOS

## Objetivo

Permitir que o conteúdo atual seja editado gradualmente.

## Trabalho esperado

- adaptar payloads existentes;
- classificar conversões;
- abrir legado no editor;
- preservar desconhecidos;
- converter com preview;
- impedir perda;
- registrar schema novo ao salvar.

## Critérios de aceite

- registros atuais abrem;
- dados desconhecidos permanecem;
- conversão direta funciona;
- conversão ambígua pede confirmação;
- somente leitura é claramente identificado;
- publicação não destrói campos.

---

# ETAPA 7 — TESTE, RESISTÊNCIA E EFEITOS COMPOSTOS

## Objetivo

Adicionar automações com resultados condicionais.

## Tipos novos

- teste;
- resistência;
- efeito por faixa;
- efeitos filhos;
- modificação de margem;
- alteração de dano recebido.

## Critérios de aceite

- criar magia com resistência;
- configurar efeito em falha;
- configurar efeito em sucesso;
- configurar CD derivada;
- representar promoção de margem;
- representar anulação de dano;
- preview mostra a árvore de resolução.

---

# ETAPA 8 — EFEITOS TEMPORÁRIOS, CADÊNCIAS E CONSUMOS

## Objetivo

Cobrir buffs, debuffs, usos e recursos.

## Tipos novos

- efeito temporário;
- pilhas;
- duração;
- consumo;
- uso por cadência;
- reset;
- ação ou reação adicional.

## Critérios de aceite

- criar efeito temporário com modificador;
- configurar máximo de pilhas;
- configurar expiração;
- configurar 1/cena;
- configurar consumo de carga;
- configurar consumo de munição;
- configurar reação.

---

# ETAPA 9 — INVENTÁRIO, RUNAS E MERCADO

## Objetivo

Cobrir operações de instância e economia.

## Tipos novos

- modificar instância;
- instalar ou remover runa;
- alterar MIT/PD;
- recarregar;
- conceder item;
- desconto;
- dívida;
- disponibilidade.

## Critérios de aceite

- criar item com carga;
- criar runa com efeito;
- criar desconto;
- criar compra fiada;
- preservar instância;
- impedir edição de modelo de destruir estado individual.

---

# ETAPA 10 — DRONES, ROBÔS E TRAMA

## Objetivo

Expor automações dos subsistemas já existentes ou futuros.

## Tipos novos

- companheiro;
- PA de companheiro;
- ação programada;
- ação adicional;
- pareamento;
- operações de Trama;
- RAM;
- Detecção;
- Rastro.

## Critérios de aceite

- editor mostra apenas campos suportados;
- automação parcial é indicada;
- efeitos operacionais alteram o subsistema;
- lembretes são classificados corretamente;
- nenhuma automação é anunciada como completa sem executor.

---

# ETAPA 11 — IMPORTAÇÃO, EXPORTAÇÃO E BIBLIOTECA DO LIVRO

## Objetivo

Conectar manutenção externa e conteúdo editorial.

## Trabalho esperado

- exportação JSON;
- importação como rascunho;
- preview de diferenças;
- vínculos com capítulos;
- retorno ao trecho de origem;
- drag de conteúdo estruturado, conforme o PRD.

## Critérios de aceite

- exportar e reimportar sem perda;
- importação nunca publica automaticamente;
- preview identifica diferenças;
- vínculo editorial permanece;
- entidade pode apontar para o capítulo.

---

# ETAPA 12 — CONTEÚDO DE MESA E HOMEBREW

## Objetivo

Permitir variações por campanha.

## Trabalho esperado

- duplicar conteúdo oficial;
- criar override de mesa;
- indicar origem;
- comparar com oficial;
- resolver atualização;
- preservar instâncias;
- limitar acesso ao narrador.

## Critérios de aceite

- override afeta somente a mesa;
- oficial permanece intacto;
- jogadores da mesa veem a versão correta;
- conflitos de atualização são apresentados;
- remover override restaura a versão oficial de forma controlada.

---

## 18. REQUISITOS NÃO FUNCIONAIS

### 18.1 Integridade

- validação no servidor;
- writes autorizados;
- prevenção de persistência parcial;
- mensagens de erro acionáveis;
- nenhuma perda silenciosa;
- rollback ou recuperação de rascunho;
- detecção de edição concorrente.

### 18.2 Segurança

- admin autenticado;
- RLS compatível;
- sem service role no cliente;
- sem secrets em logs;
- sem payload arbitrário executável;
- referências e enums validados;
- sanitização de texto;
- limites de tamanho;
- rate limit quando necessário.

### 18.3 Performance

- lista paginada ou eficiente;
- busca adequada;
- carregamento de opções sob demanda;
- referências grandes com pesquisa;
- não carregar a Biblioteca inteira em cada modal;
- cache com invalidação após publicação.

### 18.4 Acessibilidade

- labels;
- navegação por teclado;
- foco gerenciado;
- erros associados ao campo;
- contraste;
- ícone e texto, sem depender apenas de cor;
- reordenação de efeitos acessível;
- confirmação clara para ações destrutivas.

### 18.5 Observabilidade

Registrar:

- criação;
- edição;
- publicação;
- arquivamento;
- falha de validação;
- falha de persistência;
- conversão de legado;
- executor ausente;
- referência quebrada;
- conflito de versão.

Não exibir JSON cru para usuários comuns.

---

## 19. FORA DO MVP

O primeiro release pode deixar de fora:

- todos os tipos de conteúdo;
- todos os efeitos;
- homebrew por mesa;
- edição visual completa do livro;
- importador completo do Notion;
- rollback avançado;
- grupos lógicos complexos de condições;
- scripting livre;
- editor de fórmulas arbitrárias;
- automação completa de drones, robôs e Trama;
- alteração em massa;
- tradução;
- workflow com múltiplos revisores.

O MVP precisa documentar essas limitações.

---

## 20. REGRAS DE EVOLUÇÃO DO CATÁLOGO DE EFEITOS

Quando uma nova mecânica surgir:

1. verificar se pode ser composta com efeitos existentes;
2. evitar criar um tipo novo por conteúdo individual;
3. definir o efeito de forma genérica;
4. definir campos;
5. definir validação;
6. definir preview;
7. definir executor;
8. definir compatibilidade;
9. adicionar ao catálogo;
10. permitir uso por todos os tipos compatíveis.

Exemplo:

Uma magia e um talento precisam “copiar o último efeito usado”. A equipe deve avaliar um efeito reutilizável de cópia. Não criar uma implementação exclusiva com o nome da magia.

---

## 21. CRITÉRIOS GERAIS DE CONCLUSÃO

O aditivo estará completamente atendido quando:

- todos os conteúdos planejados podem ser encontrados no admin;
- tipos comuns podem ser criados sem código;
- automações comuns podem ser montadas sem JSON;
- efeitos exibem seu grau de automação;
- rascunho, validação, publicação e arquivamento funcionam;
- changelog e versão funcionam;
- conteúdo legado é preservado;
- referências são seguras;
- modelo e instância permanecem separados;
- conteúdo publicado é consumido pelo VTT;
- alterações de modelo não destroem estado de jogo;
- o catálogo pode crescer por novos efeitos reutilizáveis;
- a pessoa administradora consegue criar a magia `1d8` de fogo do início ao fim;
- a documentação explica limitações reais.

---

## 22. PROCESSO ESPERADO PARA O CLAUDE CODE

Ao usar este documento como base de implementação, o Claude Code deve:

1. ler o PRD e este aditivo;
2. auditar o repositório antes de propor tabelas ou componentes;
3. identificar o que já existe;
4. propor um plano para a etapa atual;
5. implementar somente a etapa autorizada;
6. preservar payloads e conteúdo publicado;
7. usar o motor existente quando compatível;
8. documentar automações parciais;
9. evitar hardcode de catálogos que pertencem à Biblioteca;
10. rodar build e verificações acordadas;
11. criar commits coerentes;
12. atualizar checkpoint;
13. não avançar automaticamente para a etapa seguinte sem que o checkpoint atual esteja consistente.

O Claude Code possui liberdade para decidir a organização interna. As decisões devem respeitar:

- requisitos deste aditivo;
- compatibilidade;
- segurança;
- manutenção;
- separação modelo/instância;
- conteúdo data-driven;
- expansão por tipos de efeito reutilizáveis.

---

## 23. PRIMEIRO PASSO RECOMENDADO

O primeiro trabalho deve ser a **Etapa 0 — Auditoria e plano técnico**.

A auditoria precisa responder, com dados do repositório:

- quais conteúdos existem;
- onde estão;
- quais são os formatos reais;
- quais efeitos existem;
- quais executores existem;
- quais estruturas são legadas;
- quais conteúdos não possuem `content_type` próprio;
- quais tabelas e queries devem ser preservadas;
- qual estratégia de schema e migration é mais segura;
- qual recorte exato do MVP.

Somente depois dessa auditoria deve começar a implementação do editor.

---

## 24. DECISÕES DE PRODUTO CONSOLIDADAS

- “Conteúdo” abrange regras e entidades, não apenas itens de mercado.
- O editor será universal, com seções condicionais.
- Efeitos serão reutilizáveis entre diferentes tipos de conteúdo.
- A pessoa administradora não escreverá JSON no fluxo normal.
- O código continuará necessário para criar uma categoria mecânica nova no motor.
- Uma categoria mecânica implementada passa a ficar disponível para qualquer conteúdo compatível.
- Conteúdo legado será migrado gradualmente.
- Campos desconhecidos serão preservados.
- O MVP começa com magia, talento e item/equipamento.
- O MVP começa com dano, cura, aplicar condição, remover condição, modificar teste e alterar recurso.
- Publicação exige validação.
- Rascunho não afeta o jogo.
- Instâncias preservam estado.
- O grau de automação será visível.
- O Claude Code decide a arquitetura técnica após auditoria.
