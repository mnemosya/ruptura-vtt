# Revisão do lote autônomo — 20/09/2026

Trabalho feito sem supervisão, a pedido. Este documento existe para você
**revisar decisões que tomei no seu lugar** e **responder o que só você pode
responder**. As duas primeiras seções são as que exigem sua atenção; o resto é
prestação de contas.

Nove tarefas do backlog, cinco commits, 21 arquivos. Tudo verificado em
navegador real contra o banco real, com fixtures criadas e revertidas.

---

## 1. Preciso explicitamente de você

Quatro itens. Os três primeiros são decisões que não tomei; o quarto é uma
decisão que **tomei e que contraria uma escolha registrada no código** — quero
que você confirme ou desfaça.

### 1.1 VIS-02 — não consegui localizar o alvo

A tarefa pede que "as linhas decorativas dos botões de rolagem" deixem de ser
cortadas. Procurei nos botões de rolagem do Console (`.rc-npr-defesa` e
família) e no painel de dados do VTT: nenhum tem linha decorativa sendo
cortada. A dúvida já registrada no backlog — "qual extensão exata e em quais
variantes de botão" — é decisão de design por cima disso.

**Preciso de:** um print, ou o nome da tela e do botão. Não mexi em nada.

### 1.2 DICE-01 — os dados agora cobrem tudo. Confirma?

A arena de dados saiu do palco e foi para cima de toda a interface (z 900),
com `pointer-events: none`. Isso é o que a tarefa pede, e resolve a queixa: o
dado que caía atrás de uma janela agora cai sobre ela.

**Mas contraria uma decisão registrada no código.** O comentário original dizia,
com todas as letras, que os dados "nunca tampam um controle, só a leitura do
mapa por um instante", e a faixa reservada à direita existia justamente para
isso. Eu troquei a escolha porque o backlog manda — mas foi uma escolha
deliberada de alguém, não um descuido.

Cobrir não é bloquear: o check clica num controle com a arena por cima e o
clique chega. Ainda assim, por ~2 segundos, os dados passam sobre a barra de
ferramentas e o painel.

**Pergunta ainda aberta no backlog, que não respondi:** os dados devem cobrir
também menus e tooltips do sistema? Hoje cobrem tudo que é DOM da página; menu
nativo do sistema operacional está fora do alcance de qualquer z-index.

### 1.3 CHAR-02 — dependência invertida

O critério de aceite diz "solicita somente nome", o que pressupõe que CHAR-01
(seletor de tipo PJ/PN/Aliado) já tenha tirado a escolha de tipo dali. **CHAR-01
está bloqueada**, esperando os contratos de CHAR-04 e CHAR-05.

Mantive a marcação "É um PN" no modal. Removê-la agora tiraria a única forma de
criar um PN. **Confirme** que prefere assim até CHAR-01 entrar.

### 1.4 Nome de janela que eu mudei

Em CONT-03 (sessão anterior) renomeei "Conteúdo da campanha" para **"Regras da
campanha"**, e o organizador narrativo entrou como **"Organizador"**. É decisão
de produto embutida numa tarefa técnica. Continua valendo, e continua fácil de
trocar.

---

## 2. Decisões que tomei seguindo o recomendado

Todas registradas no backlog, na tarefa correspondente. Aqui em resumo, para
você discordar rápido se for o caso.

| Onde | Pergunta em aberto | O que decidi | Por quê |
|---|---|---|---|
| AUTH-01 | Versão fixa ou vinda do build? | **Do `package.json`** | A interface dizia `v0.0.1` e o pacote estava em `0.1.0`. Versão exibida que não corresponde ao que roda é pior que nenhuma — é o que se usa para relatar bug. |
| VIS-01 | Caixa alta como conteúdo ou `text-transform`? | **`text-transform`** | O nome acessível continua sendo lido como palavra, não soletrado por leitor de tela. |
| CON-01 | Cursor HUD dentro do Console? | **Sim, mas um só por ponteiro** | O Console também roda sozinho em `/ficha`, onde precisa do próprio. |
| CON-01 | Qual raio exato? | **3px nos botões, 4px na janela** | 3px é o dos controles das janelas do painel do VTT — os dois conjuntos passam a coincidir. |
| INV-03 | Só aretz, ou também CDI? | **Aretz em destaque; CDI só com saldo** | Três zeros lado a lado dariam a impressão de três carteiras vazias, quando a pessoa só nunca encostou nas outras duas. |
| INV-03 | Jogador edita saldo? | **Não** | A mutação pertence aos fluxos de compra e recompensa; um campo ali seria uma quarta porta sem servidor validando. |
| DICE-01 | Escala por diâmetro, volume ou altura? | **Circunraio** | Altura depende de como o dado caiu; volume igual deixaria o d4 enorme, porque um tetraedro aproveita mal a esfera que o contém. |
| TOK-04 | "Virar" gira cada token ou a formação? | **Cada um no próprio eixo** | Virar é só o olhar e nunca move célula; girar a formação moveria tokens de célula — é operação de movimento, com colisão e autorização próprias. |
| TOK-04 | Duplicata mantém ficha? Bloquear é o quê? | **Mesma semântica do token único** | Um menu de lote com semântica própria faria o mesmo verbo significar duas coisas conforme quantos tokens estivessem marcados. |

---

## 3. Defeitos reais encontrados

Nenhum destes estava no backlog. Apareceram porque os testes exercitaram o
produto de verdade, em vez de conferir o DOM.

**1. Console maximizado ficava sem saída.** A janela (z 501) ficava sob o
cabeçalho de `/ficha` (z 510): os três controles não recebiam clique, e não
havia como restaurar nem fechar pelo botão. Só apareceu porque o teste tentou
clicar. *(CON-01)*

**2. Criação rápida duplicava personagens.** Confirmar duas vezes criava dois.
Quem fecha o diálogo é o chamador num `setState`, e o React só aplica ao DOM
depois da tarefa atual — os cliques rápidos acertam o mesmo botão ainda
presente. O teste clicou três vezes e nasceram três. A guarda ficou no próprio
diálogo, então vale também para criação de pasta. *(CHAR-02)*

**3. Cursor duplicado no Console.** Dois `HudCursor` perseguindo o mesmo
ponteiro com a mesma interpolação. *(CON-01)*

**4. Contraste abaixo de AA.** O subtítulo do menu lateral estava em 4.45:1 —
AA pede 4.5 para texto pequeno, e ele está em 10px. *(AUTH-01)*

**5. Versão exibida mentindo.** `v0.0.1` na tela, `0.1.0` no pacote. *(AUTH-01)*

**6. Três tipos de card do chat sem renderizador.** `attack_damage_applied`,
`turn_ended` e `turn_track_narrator_update` caíam no genérico. Não apareciam
como bug porque o fallback degrada com elegância: o card sai legível, só que
montado por despejo de campos em vez de frase. *(CHAT-01)*

**7. d10 54% maior que os outros.** Medido: circunraio de 0,82 (d12) a 1,265
(d10). Depois da normalização, variação zero. *(DICE-01)*

**8. `geo.scale()` do three não recomputa a esfera envolvente.** Quem lesse
`boundingSphere` depois receberia o raio anterior. *(DICE-01)*

**9. Personagem criado sumia na lista.** `executar()` descartava o retorno da
ação, então o narrador tinha de procurar quem acabara de nomear. *(CHAR-02)*

---

## 4. O que ficou incompleto

**TEST-01 — reparo dos checks defasados.** Tentei triar os 66 scripts em lote e
**parei no meio**, por um motivo que vale registrar: os checks defasados
**travam em vez de falhar**. `check-campanha-fase4-gameplay` ficou mais de meia
hora preso num seletor que não existe mais, porque cada espera do Playwright tem
timeout próprio e elas se somam. Uma triagem em lote precisa de teto de tempo
por script — e o `timeout` do GNU não existe no macOS, o que derrubou minha
primeira tentativa em silêncio. O padrão já conhecido: o commit
`0d3c30d` (14/09) removeu a rota `/mesas/[id]/vtt` e 32 scripts continuavam
navegando para lá; a migration 0135 mudou duas assinaturas de RPC e quatro
scripts chamavam as antigas. Isso foi corrigido na sessão anterior. O que
resta é dívida individual, e é maior do que parecia: `check-vtt-camadas-visuais`, por exemplo, procura
elementos de DOM que não existem mais (halo frontal, alça de rotação, rótulos
de PV). Cada um precisa ser julgado: **consertar ou apagar**, porque alguns
testam telas que já não existem.

**AUTH-02, CON-02, EQP-01, TOOL-01, CMB-01 — não comecei.** As quatro primeiras
dependem de escolhas visuais que não são minhas (qual superfície do VTT é a
referência, qual ícone substitui qual, como agrupar a aba Equipamentos).
CMB-01 precisa do arquivo e do node canônicos do Figma, que não tenho.

---

## 5. Erros meus, e o que eles ensinam

Registro porque mudam o quanto você deve confiar no meu "verificado".

**Quase entreguei uma conclusão falsa.** Em TOK-04, concluí que ocultar e
bloquear em lote não funcionavam. Cheguei a **remover os dois do menu** e a
escrever a justificativa no código. Era o meu teste dormindo 2,5 segundos
enquanto o lote fazia várias idas ao servidor. Esperando pela condição no banco
em vez de pelo relógio, tudo passa. Restaurei.

**Foi a terceira vez nesta sessão** que esperar por tempo fixo produziu uma
resposta errada — antes tinha acontecido com o estado otimista da preferência
de presença e com o foco do diálogo. O helper de espera por condição ficou
escrito no check, com a razão.

**Duas rodadas de falso positivo no varredor de tipos do chat.** Primeiro colhi
valores de `visibility` (`public`, `gm`) como se fossem tipos de log; depois,
valores de `source` dentro do payload (`end_own_turn`). Só depois passei a casar
a coluna `type` com o valor na posição dela.

**Escrevi um teste que não testava nada**, de novo: em TOK-04, o shift-clique
usava `page.mouse.click({modifiers})`, que não existe. O typecheck apontou — se
eu tivesse ignorado o aviso, o teste passaria "verificando" uma seleção de um
token só.

---

## 6. Como conferir

```bash
npx tsx scripts/dev/check-console-moldura.ts          # CON-01 — 8 critérios
npx tsx scripts/dev/check-carteira-inventario.ts      # INV-03 — 8
npx tsx scripts/dev/check-dados-camada.ts             # DICE-01 — 6
npx tsx scripts/dev/check-criacao-rapida-pj.ts        # CHAR-02 — 8
npx tsx scripts/dev/check-tokens-selecao-multipla.ts  # TOK-04 — 11
node scripts/dev/check-chat-catalogo.mjs              # CHAT-01 — falha se faltar card
```

Todos criam as próprias contas e campanhas e revertem no fim. Precisam do
servidor de desenvolvimento em `localhost:3000`.
