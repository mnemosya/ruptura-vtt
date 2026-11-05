# Mapa visual — VTT · Trilha compacta B · retratos

Fonte: terceiro board de `game UI.html`, **VTT · Trilha compacta B · retratos**. Comparação com a interface implementada em `src/app/mesas/[campaignId]/vtt`.

> Este mapa registra as divergências encontradas antes da implementação visual desta etapa. O estado aplicado está resumido no fim do documento.

## Escopo

Este documento trata **somente do redesign visual**. As coordenadas, o tamanho do quadro, a cena “Armazém do Cais”, os sete personagens e os dois marcadores são dados da demonstração. **Não são requisitos para a mesa real.** O VTT continua usando o tamanho da janela, a cena da campanha, os retratos cadastrados, as regras de combate, as permissões, os atalhos e o estado do painel de cada usuário.

**Único comportamento novo pedido:** cada nova mensagem/entrada do Chat Log deve gerar uma notificação no canto inferior direito; com o painel aberto, ela aparece ao lado dele.

**Fora do escopo visual:** janela de rolagem do HTML, cartão/modal de HUD do token do HTML e aba de personagem do HTML. O cartão de token do VTT permanece acionado por **clique**, sem adotar o hover do protótipo.

“Parcial” abaixo significa que há CSS ou componente equivalente, mas não uma cópia visual verificada. “Não aplicado” significa que o desenho daquele elemento do HTML ainda não foi transposto. A captura real enviada mostra exploração com o Chat aberto; o board de referência mostra combate com o Chat recolhido. É preciso comparar cada elemento no mesmo estado antes de julgar fidelidade.

## 1. Linguagem visual global

| Elemento | Aparência no HTML | Aparência/código atual | Situação visual |
| --- | --- | --- | --- |
| Fundo | Azul quase preto `#050d14`, pontos cianos regulares e discretos. | O VTT já usa fundo escuro e pontos cianos. | **Parcial:** contraste, escala dos pontos e separação entre fundo e mapa precisam de comparação lado a lado. |
| Paleta | Ciano `#00d4ff` para interface/PJ, rosa `#ff6b7d` para PN/perigo, âmbar `#f5a200` para Lentos/atenção, gelo `#cfeff4` para títulos. | Existem tokens equivalentes, mas vários componentes ainda usam variantes da Forja e bordas mais neutras. | **Parcial:** mapear cor por estado, sem trocar significado funcional. |
| Fontes | Teko em números e títulos grandes; Oxanium em botões e nomes; JetBrains Mono em dados/rótulos; Exo 2 em texto. | As quatro fontes existem no projeto; uso entre os componentes é irregular. | **Parcial:** aplicar a hierarquia visual do HTML nos elementos correspondentes. |
| Forma | Chapas de fundo retas, cortes chanfrados pontuais, ícones pequenos, linhas de 1–3 px, pouco arredondamento. | O VTT mistura chanfros da Forja, cantos arredondados e molduras próprias de cada peça. | **Parcial:** unificar contorno, raio e espessura sem alterar interações. |
| Animação | Entrada curta, brilho suave, pulso do ativo, varredura leve, deslocamentos pequenos no hover. | Algumas animações já existem, outras não foram portadas. | **Parcial:** copiar apenas feedback visual e respeitar movimento reduzido. |

## 2. Mapa e conteúdo sobre ele

| Elemento | Aparência no HTML | Aparência/código atual | Situação visual |
| --- | --- | --- | --- |
| Enquadramento | Mapa como superfície própria dentro do fundo pontilhado; bordas cortadas, vinheta interna e luz radial azul. | `<MapaHex>` e `.rv-palco` desenham a cena real, com outra moldura/iluminação. | **Parcial:** reproduzir tratamento de superfície, recorte, luz e sombra sem fixar largura ou posição do mapa. |
| Grade hexagonal | Traço ciano muito fino e baixo contraste sobre o gradiente radial. | Grade SVG da cena com cor/opacidade configuráveis. | **Parcial:** comparar o padrão visual padrão; preservar configurações da cena. |
| Objetos do mapa | Obstáculos escuros com contorno azul acinzentado e área cônica rosa tracejada. | O VTT já suporta objetos e áreas reais; a captura não contém os mesmos objetos da demo. | **Visual de referência:** copiar o tratamento de cor/linha para o tipo equivalente, sem inserir os objetos de demonstração. |
| Tokens | Retrato circular, aro colorido por lado, barra estreita de PV abaixo, nome discreto, anel de seleção e brilho para ação. | `<MapaHex>` usa retrato real quando há imagem; sem retrato mostra sigla. Anel, rótulo e seleção têm desenho próprio. | **Parcial:** comparar aro, tamanho relativo, barra, nome e brilho. Não trocar o sistema de seleção/movimento. |
| Medição e pinos | Medida âmbar com linha tracejada animada e pequena etiqueta; pino âmbar com pulso. | Existem ferramentas equivalentes com desenho próprio. | **Parcial:** revisar só traço, cor, tipografia e feedback visual. |

## 3. Cabeçalho e núcleo de combate

| Elemento | Aparência no HTML | Aparência/código atual | Situação visual |
| --- | --- | --- | --- |
| Identificação da cena | Marcador `◆ COMBATE`/`◆ EXPLORAÇÃO` pequeno acima do nome; nome em Teko grande; botão circular escuro de cenas. | O VTT usa o nome real da cena. `trilha-compacta.css` já tenta mover e reestilizar a peça. | **Parcial, sem validação visual:** conferir alinhamento, distância entre linhas, tipografia, botão e contraste nos dois modos. Não trocar o nome da cena nem o modo atual. |
| Placa da rodada | Faixa horizontal escura com chanfro trapezoidal e divisórias internas sutis. | `NucleoRodada` foi alterado para horizontal, ainda por cima de CSS antigo e do tema Forja. | **Parcial:** conferir forma, altura, espaçamento e sobreposições no combate real. |
| Número e rótulos | `RODADA` em mono pequeno; número em Teko grande; `RÁPIDOS` ciano e `LENTOS` âmbar, com estado atual preenchido. | Controles e rótulos existem. | **Parcial:** cor, texto, contraste, fonte e tamanho ainda precisam de comparação visual. |
| PA da janela | No HTML a placa lê **TETO 2 PA** nos Rápidos e **PISO 3 PA** nos Lentos. | O código atual lê **TETO LIVRE** nos Lentos. | **Divergência visual/textual concreta:** corrigir a apresentação para `PISO 3 PA`, preservando as regras do modelo. |

## 4. Trilhos de retratos PJ/PN

| Elemento | Aparência no HTML | Aparência/código atual | Situação visual |
| --- | --- | --- | --- |
| Colunas | Retratos quadrados em fileiras estreitas nas laterais, cabeçalho `◆ PJ` / `PN ◆`, ciano/rosa por lado. | `TrilhaFaccoes` possui colunas laterais e CSS novo de retratos quadrados; só é renderizada quando a trilha real está visível. | **Parcial:** conferir folgas, alinhamento, rolagem e convivência com painel aberto. Não exibir uma trilha fictícia na exploração. |
| Retrato | Arte preenchendo o quadrado, faixa escura em degradê na base e barra vertical colorida na borda externa. | Arte vem do token; CSS novo reproduz quadrado/degradê/barra. | **Parcial, sem validação visual:** imagens ausentes na campanha continuam sendo siglas, como já ocorre no produto. |
| Dados sobre o retrato | PA curto, barras muito finas de PV/PE e pequenos glifos de condições no alto. | PA e barras foram adicionados. Condições usam primeira letra, sempre rosa. | **Parcial:** copiar glifo e cor por condição; revisar legibilidade e privacidade dos recursos. |
| Estado de turno | Seleção com linha clara; quem age pulsa; quem já agiu perde saturação/opacidade; botão `AGIR` fica encaixado sob a foto. | Há estados equivalentes e regras reais. A posição dos controles R/L/Concluir/Passar difere. | **Parcial:** revisar apenas aparência e densidade. Os controles atuais devem continuar acessíveis e funcionar como antes. |
| Painel lateral do retrato | O HTML abre uma ficha curta de estado, declaração e PA ao passar o ponteiro. | Não portado. | **Excluído por pedido expresso.** Não usar o hover do protótipo como solução para os controles atuais. |

## 5. Rodapé e ferramentas

| Elemento | Aparência no HTML | Aparência/código atual | Situação visual |
| --- | --- | --- | --- |
| Tempo e clima | Hora Teko grande; data/clima mono em uma linha; botão circular escuro; sem cartão ao redor. | `TempoDaCampanha` usa dados reais; CSS novo remove a caixa. | **Parcial, sem validação visual:** comparar espaçamento, ordem visual, cor e peso. Não trocar data/clima reais. |
| Marcadores | Cards baixos e horizontais, anel segmentado com fração no centro, título Oxanium, subtítulo mono e carimbo ao concluir. | `FaixaMarcadores` recebeu contagem/card compacto; só aparece com marcadores da campanha. | **Parcial:** anel, borda, tipografia, carimbo e posição relativa ainda diferem. Não criar os dois marcadores da demo. |
| Barra de ferramentas | Uma faixa horizontal escura com fio ciano superior; botões chanfrados, ícones SVG próprios, letra do atalho no canto. | Foi movida por CSS, mas ainda usa Lucide, botões menores, outra ordem e controles adicionais do VTT. | **Parcial importante:** a mudança de direção sozinha não reproduz a referência. |
| Conjunto de ferramentas | O HTML mostra Interagir, Dados, Medir, Marcar, Anotar, Terreno, Objetos, Imagens, Áreas, Rodadas e Marcadores. | O VTT tem funções próprias, inclusive Desenhar e Texto separados, Menu, Camadas, Adicionar token, Desfazer/Refazer. | **Não alterar funções, atalhos ou permissões.** Integrar visualmente todos os controles reais; a lista da demo não é especificação de produto. |
| Zoom | Não aparece como controle fixo na captura do HTML. | O VTT mostra `+ / % / −`. | **Extra funcional a preservar.** Redesenhar ou posicionar para conviver com o rodapé, sem remover. |

## 6. Lateral direita e Chat Log

| Elemento | Aparência no HTML | Aparência/código atual | Situação visual |
| --- | --- | --- | --- |
| Abas superiores | Ícones pequenos em uma faixa horizontal no topo direito; aba ativa revela rótulo por expansão. | `PainelAbas` é horizontal com painel aberto e vertical quando recolhido. | **Grande diferença visual:** transpor a faixa horizontal mantendo todas as abas reais e a navegação por teclado. Não implementar o conteúdo da aba de personagem do protótipo. |
| Gaveta do painel | Fundo `#06121c`, fio ciano superior, entrada por recorte lateral; moldura discreta. | Painel redimensionável com borda inteira e visual Forja. | **Parcial:** copiar fundo, borda, recorte e alinhamento; preservar largura redimensionável, preferência aberta/recolhida e conteúdo real. |
| Cards do feed | O board do VTT só demonstra evento e rolagem em formato compacto. | O produto usa Chat Log completo e os 15 tipos de card do **board próprio** no mesmo `game UI.html`. | **Escopos distintos:** manter o conteúdo e comparar os cards com `Chat Log · os 15 tipos de card`, não substituir tudo pelos exemplos simplificados deste board. |
| Composer | Chips compactos de autoria/visibilidade, anexo, campo escuro e botão de enviar. | O composer real tem os mesmos grupos funcionais, mas outro desenho/ritmo. | **Parcial:** copiar o visual mantendo envio, menus, anexos, privacidade e atalhos atuais. |
| Notificação | Cartão escuro de borda ciana, hexágono com valor/ícone, autor e detalhe; aparece junto à borda direita ou ao lado do painel. | Implementação nova observa logs, mostra uma entrada por 7 s e calcula o recuo pelo painel real. | **Parcial, sem validação em execução:** testar nova mensagem com painel aberto/recolhido e múltiplas entradas seguidas. Este é o único comportamento novo autorizado. |

## 7. Comparações visuais necessárias

Comparar o HTML e o VTT no **mesmo estado**, com uma cena real que tenha retratos e marcadores suficientes para mostrar os elementos. Não forçar esse estado ao abrir a mesa:

1. Exploração, painel recolhido: fundo, mapa, cabeçalho, abas, relógio e ferramentas.
2. Exploração, painel aberto: aba ativa, gaveta, Chat, composer e convivência com mapa/zoom.
3. Combate nos Rápidos: núcleo, trilhos PJ/PN, tokens, marcadores e barra inferior.
4. Combate nos Lentos: texto `PISO 3 PA`, cor âmbar e retratos no estado correspondente.
5. Retrato selecionado, apto, agindo e já agiu: bordas, glifos, opacidade, barras e botões.
6. Nova entrada de Chat: toast com painel aberto e recolhido; checar aparição, alinhamento e texto.
7. Largura menor: preservar a hierarquia visual por adaptação responsiva, sem copiar as coordenadas fixas do HTML.

## 8. Arquivos por superfície

| Superfície | Arquivos principais |
| --- | --- |
| Chassi, mapa, ferramentas, cena e zoom | `VttClient.tsx`, `vtt.css`, `_tema/tema-forja.css`, `_turnos/trilha-compacta.css` |
| Núcleo e retratos | `_turnos/NucleoRodada.tsx`, `_turnos/TrilhaFaccoes.tsx`, `_turnos/trilha-compacta.css` |
| Tokens, grade, objetos e áreas | `_mapa/MapaHex.tsx`, `vtt.css` |
| Tempo e marcadores | `_shell/TempoDaCampanha.tsx`, `_shell/FaixaMarcadores.tsx` |
| Abas, gaveta, Chat e composer | `_painel/PainelAbas.tsx`, `_painel/PainelVtt.tsx`, `_painel/feed/Composer.tsx`, `_painel/painel.css` |
| Notificação | `_painel/PainelVtt.tsx`, `_painel/painel.css` |

## Critério de pronto

O código deve ser comparado com o HTML nos estados de exploração, combate, painel aberto/recolhido e janela estreita. Nenhuma regra, permissão, atalho, dado de campanha ou fluxo existente deve ser alterado para fazer o print parecer com a demo.

## Implementação aplicada nesta etapa

- Fundo pontilhado, luz radial do mapa, varredura e vinheta copiados da fonte; grade configurada pela campanha preservada.
- Cabeçalho da cena, núcleo da rodada, retratos de facção, relógio, marcadores e faixa inferior reestilizados em exploração e combate.
- SVGs dos 11 botões correspondentes da faixa e das quatro abas extraídos diretamente de `game UI.html`. Controles adicionais do VTT continuam acessíveis.
- Aro e barra de PV dos tokens aproximados da referência; barra restrita a PV público ou ao controlador do token. O cartão do token segue acionado por clique.
- Abas e composer reestilizados; o conteúdo real do painel continua o mesmo.
- Novas entradas projetadas no Chat Log entram em uma fila de notificações. Cada uma aparece por sete segundos; com painel aberto, o aviso fica ao lado dele.
- Verificações locais: TypeScript sem erros, CSS válido, 29 testes de trilha, 106 testes do feed e 65 testes do painel sem falhas.

O ambiente não permitiu captura visual do VTT em execução nesta etapa. Por isso, a equivalência de pixels com o HTML ainda não foi verificada por screenshot.
