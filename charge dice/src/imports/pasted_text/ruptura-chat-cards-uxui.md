Você é um product designer especializado em interfaces de Virtual Tabletops, RPGs táticos e sistemas diegéticos sci-fi/fantasy.

Crie uma proposta de UX/UI para os CARDS DO CHAT LOG do VTT de RUPTURA.

IMPORTANTE:
- Este trabalho é SOMENTE um protótipo visual de UX/UI.
- Não implemente backend, regras reais, banco de dados ou lógica funcional.
- Não tente desenvolver a versão definitiva do sistema.
- O objetivo é explorar visualmente como diferentes conteúdos de Ruptura aparecem dentro do chat durante uma sessão.
- Use dados fictícios apenas para demonstrar hierarquia, estados e comportamento visual.
- Não invente sistemas complexos além do necessário para demonstrar a interface.

As imagens fornecidas servem como duas referências diferentes:

1. As capturas do Foundry mostram o TIPO DE INTERAÇÃO e a ideia de cards enviados para um chat log:
   - informação compacta;
   - cabeçalho;
   - resultados;
   - pequenos metadados;
   - descrição expansível;
   - ações diretamente no card;
   - leitura rápida durante combate.

2. As telas do VTT de Ruptura representam a REFERÊNCIA VISUAL CANÔNICA.
   A aparência dos cards deve parecer parte desse mesmo software.

Não copie a aparência do Foundry.

Adapte a função dos cards para a identidade visual de Ruptura.

---

# OBJETIVO

Projetar um sistema visual consistente para seis tipos de cards enviados ao Chat Log:

- Magia
- Condição
- Efeito
- Item
- Arma
- Talento

Eles devem claramente pertencer ao mesmo design system, mas cada categoria deve possuir sinais visuais suficientes para ser identificada rapidamente durante uma sessão.

Crie também exemplos dos cards dentro de uma coluna de chat realista, para avaliar densidade, legibilidade e diferenciação.

---

# DIREÇÃO VISUAL — RUPTURA

A estética principal deve vir das telas canônicas fornecidas.

Ruptura possui uma linguagem visual de:

- terminal militar;
- interface de sistema imperial;
- cyberpunk industrial;
- arcanepunk;
- tecnologia tecnomágica;
- instrumentos táticos;
- HUDs discretos;
- equipamentos de campo;
- software operacional.

A interface deve parecer um software funcional existente dentro do próprio universo.

Não transformar em uma interface neon exagerada.

Evitar:
- excesso de glow;
- hologramas genéricos;
- estética synthwave;
- gradientes muito saturados;
- excesso de transparência;
- cards arredondados modernos estilo aplicativo mobile;
- visual genérico de dashboard SaaS;
- estética fantasy medieval;
- ornamentação arcana excessiva.

Preferir:
- fundo azul-marinho quase preto;
- superfícies ligeiramente mais claras que o fundo;
- bordas finas;
- linhas técnicas;
- divisórias geométricas;
- pequenos recortes ou detalhes angulares;
- cyan como cor estrutural principal;
- cyan luminoso apenas em elementos importantes;
- âmbar para destaque secundário;
- vermelho/magenta para perigo, dano e estados negativos;
- roxo quando associado ao Arcano;
- verde pontualmente para estados positivos ou confirmação;
- pequenos indicadores luminosos;
- microtipografia técnica;
- iconografia linear;
- pequenas marcações, códigos e sinais de sistema.

Use textura, ruído e scanlines somente de maneira extremamente sutil.

O resultado deve continuar limpo e legível.

---

# ARCANE PUNK

Além da camada cyberpunk, Ruptura possui magia integrada à tecnologia.

Incorpore o aspecto arcanepunk através de detalhes pequenos:

- glyphs;
- símbolos abstratos;
- linhas de energia;
- diagramas mínimos;
- pequenos padrões rúnicos;
- formas geométricas associadas às Vertentes;
- interferências visuais controladas.

Esses elementos devem parecer componentes de uma interface técnica capaz de interpretar fenômenos mágicos.

Não transforme os cards em pergaminhos digitais.

A camada arcana deve estar DENTRO da linguagem tecnológica.

---

# CONTEXTO: CHAT LOG

Projete os cards para funcionar em uma coluna de chat lateral semelhante à encontrada em VTTs.

Considere aproximadamente:

- 360–430 px de largura;
- cards empilhados verticalmente;
- espaços pequenos entre mensagens;
- rolagem constante;
- leitura frequente durante combate;
- vários cards visíveis simultaneamente.

A prioridade é:

1. identificar quem executou a ação;
2. identificar o tipo de conteúdo;
3. identificar o que aconteceu;
4. encontrar os valores mecanicamente importantes;
5. acessar informações secundárias;
6. executar uma ação relacionada ao card.

O card não pode exigir leitura completa para entender o evento principal.

---

# SISTEMA BASE DO CARD

Crie um componente estrutural compartilhado pelos seis tipos.

Sugestão de arquitetura:

[ SPEAKER / PERSONAGEM ]                      [ tempo ]

[ ÍCONE ]  NOME DO CONTEÚDO
           categoria • subtipo • tags

[ informação mecânica principal ]

[ metadados relevantes ]

[ descrição / efeito ]

[ ações contextuais ]

Não é necessário seguir exatamente essa disposição se uma solução melhor surgir.

A estrutura deve favorecer leitura vertical e compacta.

---

# SPEAKER

Todo card deve mostrar discretamente quem originou a mensagem.

Exemplo:

MARA VENN
Combatente • Acrobata

ou simplesmente:

MARA VENN

Pode existir:
- pequeno retrato/token;
- ícone;
- nome;
- indicação visual de jogador/personagem.

Isso deve ocupar pouco espaço.

A informação principal continua sendo o conteúdo enviado.

---

# HIERARQUIA

Evite transformar cada card em uma mini ficha.

Os dados mais importantes devem ser grandes ou imediatamente visíveis.

Informações secundárias devem usar:

- badges;
- pequenos labels;
- linhas de metadados;
- tooltips simulados;
- áreas recolhíveis.

Os cards podem ter estado:

- compacto;
- expandido.

No estado compacto, mostrar apenas o necessário.

No expandido, revelar descrição completa e informações adicionais.

---

# 1. CARD DE MAGIA

Crie um card para uma magia de Ruptura.

Exemplo de conteúdo fictício:

BOLA DE FOGO
Energética • Nível 3 • Ataque

Mostrar visualmente:

- ícone da magia;
- nome;
- Vertente;
- nível;
- tipo;
- Mana;
- PA;
- alcance;
- alvo/área;
- resultado ou consequência principal;
- descrição curta.

Exemplo:

MANA 6
PA 2
ALCANCE 25 m
ÁREA ⊙ 3 m

Caso exista teste ou defesa, reservar uma área visual clara para isso.

Exemplo:

DESVIAR
CD 14

ou

ALVO: GRAVEKNIGHT
SUCESSO PADRÃO

Criar um botão principal contextual como:

CONJURAR

ou, caso represente uma magia já lançada:

APLICAR EFEITO

A identidade da Vertente pode alterar discretamente:
- ícone;
- barra lateral;
- cor de detalhe;
- glyph.

Não pintar o card inteiro com a cor da Vertente.

---

# 2. CARD DE CONDIÇÃO

Crie um card especializado em condições como:

SANGRANDO

O card deve deixar evidente:

- condição;
- alvo;
- origem;
- duração, quando houver;
- efeito resumido;
- intensidade ou contador, quando aplicável.

Exemplo:

SANGRANDO
Condição

ALVO
Graveknight

ORIGEM
Lâmina Cinética

DURAÇÃO
2 rodadas

Efeito:
Sofre 1d8 de dano conforme a regra da condição.

Visualmente, condições negativas podem utilizar vermelho/magenta de maneira controlada.

Não fazer um grande painel vermelho.

O card deve poder mostrar ações como:

REMOVER
VER CONDIÇÃO

---

# 3. CARD DE EFEITO

Diferencie visualmente EFEITO de CONDIÇÃO.

Condição representa um estado definido do sistema.

Efeito representa uma modificação temporária proveniente de:
- magia;
- talento;
- equipamento;
- característica;
- habilidade;
- outro efeito de jogo.

Exemplo fictício:

CAMPO CINÉTICO
Efeito

ORIGEM
Telecinese

ALVO
Mara Venn

DURAÇÃO
Até o início do próximo turno

EFEITO
+1 vantagem em...

Criar um pequeno indicador de duração.

Exemplos:

1 RODADA

ou

EXPIRA: INÍCIO DO TURNO

Pode possuir um pequeno elemento gráfico semelhante a um status monitorado pelo sistema.

Ações possíveis:

REMOVER
VER ORIGEM

---

# 4. CARD DE ITEM

Card para compartilhar ou utilizar um item.

Exemplo:

INJETOR DE EMERGÊNCIA
Consumível • Médico

Mostrar:

- ícone ou pequeno thumbnail;
- nome;
- categoria;
- raridade, caso pertinente;
- quantidade;
- informações essenciais;
- descrição curta.

Exemplo:

QUANTIDADE 2
USO 1 PA

Efeito:
Descrição curta fictícia.

Ações possíveis:

USAR
VER ITEM

Quando usado, o mesmo card pode possuir um estado visual posterior:

UTILIZADO

Esse estado deve ser discreto e não exigir criar outro layout completamente diferente.

---

# 5. CARD DE ARMA

Esse é um dos cards mecanicamente mais densos e precisa ter excelente hierarquia.

Exemplo:

LÂMINA CINÉTICA

Tags:
Corpo a Corpo
Cortante
Uma Mão

Mostrar claramente:

ATAQUE

e

DANO

como dois blocos visuais principais.

Exemplo fictício:

ATAQUE
14 vs DEF

DANO
2d6+3

Também mostrar discretamente:

Precisão/Luta ou perícia relacionada;
atributo;
alcance;
propriedades;
tipo de dano.

Caso represente uma rolagem já realizada, mostrar o resultado de forma dominante:

GRAVEKNIGHT

SUCESSO PADRÃO
Margem 4

ou:

SUCESSO CRÍTICO

ou:

FALHA LIMITADA

Criar uma faixa de resultado visualmente muito fácil de escanear.

Evite ocupar metade do card com uma cor sólida.

Utilize borda, indicador lateral, pequeno painel ou iluminação localizada.

Ação contextual:

APLICAR DANO

Caso o ataque ainda não tenha sido realizado:

ATACAR

---

# 6. CARD DE TALENTO

Talentos possuem menos números imediatos e precisam ser tratados como conteúdo textual estruturado.

Exemplo:

CORREÇÃO DO GOLPE
Talento • Manobra

Mostrar:

- ícone;
- nome;
- origem/categoria;
- custo;
- gatilho;
- efeito.

Exemplo:

CUSTO
1 Dado de Manobra

GATILHO
Depois de realizar um teste de acerto...

EFEITO
Adicione o resultado...

A hierarquia deve separar claramente:

GATILHO

CUSTO

EFEITO

sem parecer uma ficha burocrática.

Possíveis ações:

ATIVAR
VER TALENTO

---

# RESULTADOS DE TESTES

Alguns cards podem conter resultados.

Crie uma linguagem visual consistente para:

SUCESSO CRÍTICO
SUCESSO PADRÃO
SUCESSO LIMITADO
FALHA LIMITADA
FALHA

Esses resultados precisam ser reconhecíveis rapidamente sem depender exclusivamente de cor.

Use combinação de:

- texto;
- ícone;
- padrão;
- pequena faixa;
- borda;
- marca gráfica.

Não criar seis layouts diferentes.

Eles devem ser variantes do mesmo componente de resultado.

---

# BADGES

Use badges com moderação.

Eles podem representar:

- Vertente;
- dano;
- alcance;
- categoria;
- raridade;
- nível;
- tipo de ação;
- condição;
- propriedade.

Os badges devem seguir o design visual do VTT de Ruptura:

- pequenos;
- angulares;
- compactos;
- tipografia técnica;
- baixo contraste quando secundários.

Evitar dezenas de pills arredondadas.

---

# BOTÕES

Os cards podem conter ações contextuais.

Exemplos:

ATACAR
APLICAR DANO
CONJURAR
USAR
ATIVAR
REMOVER
VER DETALHES

Não colocar vários botões grandes no mesmo card.

Regra visual:

1 ação principal
+
no máximo 1 ou 2 ações secundárias discretas.

O CTA principal deve parecer um comando do sistema de Ruptura.

Algo próximo da linguagem dos botões CONJURAR e ENTRAR NA CAMPANHA das referências fornecidas.

---

# EXPANSÃO DO CARD

Projete uma interação simples:

ESTADO COMPACTO

mostra:
- nome;
- tipo;
- principais números;
- resultado;
- ação principal.

ESTADO EXPANDIDO

mostra também:
- descrição;
- propriedades;
- origem;
- duração;
- detalhes mecânicos;
- ações secundárias.

Use um pequeno controle de expandir/recolher.

A mudança de estado não deve alterar excessivamente a posição dos elementos importantes.

---

# DENSIDADE

Um dos principais objetivos é evitar o problema comum de VTTs em que cada rolagem ocupa quase toda a coluna.

Priorize densidade.

Um usuário deve conseguir observar aproximadamente 3–5 eventos recentes ao mesmo tempo em uma coluna de chat desktop, dependendo do tipo dos cards.

Cards simples como Condição ou Efeito podem ser menores.

Arma e Magia podem ser maiores.

---

# MICROINTERAÇÕES

Como é um protótipo visual, demonstre estados de UI como:

- hover;
- botão ativo;
- card expandido;
- card recolhido;
- ação já executada;
- elemento expirado;
- resultado crítico;
- resultado falho;
- item consumido.

Use efeitos discretos:

- linha acendendo;
- mudança sutil de borda;
- glow localizado;
- indicador de sistema;
- alteração de opacidade.

Não usar animações extravagantes.

---

# ACESSIBILIDADE E LEGIBILIDADE

Apesar da estética escura:

- textos precisam ter contraste adequado;
- números importantes devem ser facilmente identificáveis;
- não usar apenas cor para transmitir estado;
- manter áreas clicáveis suficientemente grandes;
- evitar fontes excessivamente decorativas no corpo do texto.

Use a tipografia futurista/geometrizada principalmente em:
- títulos;
- labels;
- comandos;
- números importantes.

Use uma fonte altamente legível para descrições mais longas.

---

# COMPOSIÇÃO PARA A APRESENTAÇÃO

Monte um frame principal mostrando uma coluna completa de CHAT LOG dentro da linguagem visual de Ruptura.

Inclua vários cards misturados, como se fossem eventos de uma sessão real:

1. Mara Venn usa uma magia.
2. Assis realiza um ataque com uma arma.
3. Graveknight recebe Sangrando.
4. Um efeito temporário é aplicado.
5. Um personagem usa um item.
6. Um talento é ativado.

Não precisa construir toda a mesa do VTT.

O foco absoluto deve permanecer na coluna do Chat Log e nos cards.

Depois, crie uma área de COMPONENT SHOWCASE mostrando separadamente:

MAGIA
CONDIÇÃO
EFEITO
ITEM
ARMA
TALENTO

Para cada um, mostrar pelo menos:
- versão compacta;
- versão expandida.

Também crie uma pequena seção com:
- variantes de resultado;
- badges;
- botões;
- indicadores de duração;
- estados de hover/disabled/consumido/expirado.

---

# RESULTADO ESPERADO

O resultado deve parecer:

“Se o Foundry tivesse sido projetado especificamente para Ruptura.”

A funcionalidade e a rapidez de leitura de um chat de VTT devem permanecer reconhecíveis, mas toda a interface deve pertencer visualmente ao ecossistema já estabelecido de Ruptura.

Prioridades finais:

1. leitura rápida;
2. densidade;
3. hierarquia mecânica;
4. consistência entre categorias;
5. identidade visual de Ruptura;
6. cyberpunk + arcanepunk;
7. sensação de software tático real;
8. beleza sem sacrificar funcionalidade.

Não redesenhe as telas canônicas fornecidas.
Não redesenhe o VTT inteiro.
Não crie uma nova direção de arte.

Projete especificamente o sistema de cards do Chat Log como uma extensão natural da interface existente.