# Metaprompt — Rolagem com Dado de Sobrecarga: opções visuais e de experiência

Cole tudo abaixo da linha numa sessão nova do Claude Code, na raiz do repositório.

---

<objetivo>
O teste padrão de Ruptura mudou: o magista rola dois d10 ao mesmo tempo, o **Dado Normal** e o **Dado de Sobrecarga**. Preciso de **no mínimo 3 propostas** de visual e de experiência para essa rolagem, nas duas superfícies onde ela acontece:

1. **Os dados 3D na mesa** (`src/app/mesas/[campaignId]/vtt/_dados3d/`: `ArenaDados.tsx`, `MesaDadosOverlay.tsx`, `estilosDado.ts`).
2. **A janela "Rolar Dados"** (`RoladorDados.tsx`, `ResultadoRolagem.tsx`, `_tema/janela-dados.css`), mais o cartão que a rolagem deixa no Chat Log.

Esta rodada é só de design, mas **as propostas são protótipos navegáveis e quase prontos**, e não telas estáticas nem pranchetas. Eu preciso rolar, trocar, desfazer e sentir o tempo de cada uma antes de escolher. Entregue os protótipos e pare para eu escolher. Não portar nada para o VTT real e não mexer no motor de regras (`src/lib/dice/`) nem em arquivos existentes.
</objetivo>

<como_se_joga_com_um_vtt>
Isto é um **VTT de apoio a uma mesa de RPG**, e não um jogo de client. Desenhe para o jeito como a mesa realmente joga:

- **A mesa conversa por voz ou ao vivo.** O jogador diz "vou de Cinética, forço o impulso", o narrador responde "pode". Essa negociação acontece falando. **O software não modela a negociação**: nada de campo de texto para descrever a Vertente, nada de estado "aguardando o narrador", nada de fluxo de aprovação.
- **Rola-se o tempo todo.** Perícia, ataque, defesa, dezenas de vezes por sessão, pela janela, pelo Console da ficha e por comando no chat. A rolagem é um gesto de **alta frequência**. Isso pede um arremesso que seja **bom de repetir**: a carga de força, a queda, o peso e o material dos dados são parte do prazer de jogar e **recebem cuidado de design de verdade**. O que não pode é segurar o jogador depois que os dados assentam: nada de sequência cinematográfica que obrigue a esperar para ler o resultado ou agir.
- **Na maioria das rolagens o Dado de Sobrecarga não será usado.** O magista rola os dois sempre, mas escolhe a troca em poucos testes por sessão. Logo, o segundo dado não pode poluir os 90% das rolagens em que é ignorado, e precisa estar a **um clique** no momento em que o jogador decide usá-lo.
- **O resultado é um registro.** O que vale para a mesa é o cartão no Chat Log: todos precisam ler, de relance, qual dado foi usado, o total, a faixa e a margem, e **se houve Sobrecarga**. O desenho do cartão pós-troca importa tanto quanto o da janela.
- **O mapa continua clicável.** Os dados 3D são espetáculo de poucos segundos (`pointer-events: none`) e não podem cobrir nem bloquear a mesa.
- **Erro se corrige.** Cliquei sem querer, o narrador recusou, a mesa decidiu outra coisa: a troca precisa de um **desfazer** simples, restaurando o resultado do Dado Normal e devolvendo o ponto de Sobrecarga. Ações reversíveis são padrão neste projeto.
- **Os dados 3D são vistos por todos na mesa**, e não só por quem rolou. A exibição remota ainda não está implementada. Considere como a cena fica para quem observa, sem inventar telas só para isso.

A rolagem tem **dois momentos, e os dois importam**:
- **O arremesso**: carregar a força, soltar, ver dois dados diferentes caírem e rolarem. Com a Sobrecarga, o arremesso ganha algo novo: o jogador joga **dois dados de naturezas diferentes**, e isso precisa se sentir na mão (peso, brilho, material, som se houver, a forma como cada um gira e assenta). Cada proposta tem um conceito claro de **como o arremesso muda** com o Dado de Sobrecarga, e não só uma cor diferente no segundo dado.
- **A decisão**: olhar o veredito do Normal, ver o que o dado de Sobrecarga mostra, pesar o preço, trocar. É onde o jogador mais pensa, e onde a interface precisa ser mais clara.

O arremesso é frequente e a decisão é rara. Por isso o arremesso é caprichado **dentro de um orçamento de tempo curto**, e a decisão é caprichada **sem nunca prender a mesa**.
</como_se_joga_com_um_vtt>

<carga_do_botao_de_lancar>
**O botão de lançar dados carrega força, e isso fica.** Hoje o `RollButton` (`ResultadoRolagem.tsx`, variante `"f"` na janela) funciona assim: segurar carrega de 0 a 100% em 2 s (`CARGA_MAX_MS`), soltar lança com essa força, e um clique rápido ainda lança com o piso `FORCA_MINIMA`. Durante a carga há anéis de batimento que aceleram, brilho que cresce, tremor, "CARGA MÁXIMA" no topo e flash ao soltar. A cor da barra vem de `corDaCarga` (verde-azulado, dourado, âmbar, vermelho), e `onChargeChange` faz o conjunto de dados tremer junto. A força vira velocidade, giro e altura do arremesso em `lancamento.ts` (`parametrosDeLancamento`) e **nunca escolhe a face**.

Nos protótipos:
- Use o `RollButton` **real**, com sua carga, anéis, tremor, teclado e `prefers-reduced-motion`, e passe a força ao `PhysicsDiceArena` exatamente como hoje (`forca`). Não redesenhe esse comportamento nem o troque por clique simples. Pode mudar a pele do botão, mas carga, tempo e resposta da física ficam como estão.
- **Os dois dados participam da carga.** Os dois tremem juntos enquanto o botão carrega e saem juntos no lançamento. Se uma proposta quiser que o dado de Sobrecarga reaja de forma própria à carga (mais luz, mais tremor), tudo bem, mas sem tirar a leitura da força.
- **Colisão de cor também aqui.** A rampa da carga já passa por âmbar e vermelho. Diga, em cada proposta, como a identidade do Dado de Sobrecarga convive com ela: o âmbar do dado, o âmbar da carga e o âmbar das faixas limitadas são três usos para a mesma cor.
- O fluxo continua de alta frequência: segurar é opcional, e o clique rápido tem que seguir lançando na hora.
</carga_do_botao_de_lancar>

<regras_de_fonte>
Leia antes de desenhar, com a ferramenta de fetch do Notion:
1. **Capítulo 13, ROLANDO OS DADOS** (fonte principal): https://app.notion.com/p/ggcardoso/13-ROLANDO-OS-DADOS-fa20a1363552824d85ec012a4c167b44
2. **Capítulo 18, SOBRECARGA E RUPTURA**, só as seções "Usando a Sobrecarga", "Alcançando o limite", "Ultrapassando o limite" e "Resolvendo as consequências", mais "Como funciona" e "A Última Vontade" da Ruptura: https://app.notion.com/p/a4b0a136355282989dac812cb6b7d8a2 (ignore Surtos, Marcas e Traços).

Há uma página antiga, "ROLANDO OS DADOS — VERSÃO REVISADA (1d10)", ligada no fim do capítulo 13. **Está desatualizada: não use.**

O essencial da regra:
- Todo magista rola os dois d10 juntos, sempre, mesmo no limite de Sobrecarga ou acima. Quem não é magista rola só o Normal.
- O resultado oficial vem do Dado Normal. Depois de conhecer o resultado e antes de as consequências valerem, o magista pode usar o Dado de Sobrecarga **no lugar** do Normal (não soma). O total e a Margem de Impacto são recalculados e uma falha pode virar sucesso. **Uma substituição por ação.**
- Abaixo do limite, a troca custa **1 Sobrecarga**, sem dano psíquico. O limite começa em 3. A troca que **alcança** o limite causa uma Ruptura. A troca que **ultrapassa** o limite custa Integridade em progressão (1º ponto excedente 1d4, 2º 2d4, 3º 3d4...), e Integridade em 0 leva à Última Vontade.
- Faixas de margem: sucesso 0 a +2 limitado, +3 a +6 padrão, +7 ou mais crítico; falha –1 a –2 limitada, –3 a –6 padrão, –7 ou menos crítica.
- **Valor natural do dado não é crítico.** Um 10 pode dar sucesso padrão. Nenhuma proposta pode festejar o número do dado: a ênfase, quando existir, vem da faixa de margem.
- No teste contestado, quem troca compara de novo os resultados depois da substituição.

Use só termos e números destes capítulos. Em mockups, nomes de personagem e valores de exemplo podem ser fictícios, mas **regra, condição e efeito não**. Não crie termos de jogo.
</regras_de_fonte>

<estado_atual_do_codigo>
Confira estes pontos antes de propor:

- **O motor ainda é o antigo.** `src/lib/dice/rollRuptura.ts` rola `Nd8` e usa o maior (ou o menor), e as faixas de `classificarMargem` não batem com o Notion. Desenhe pela regra do Notion e, no final, liste em poucas linhas o que o motor precisaria mudar. Não altere o motor.
- **Já existe d10 na arena** (`createD10` em `ArenaDados.tsx`) e estilos de dado em `estilosDado.ts` (`atual`, `resina`, `vidro`, `metal`; padrão `metal`). Reaproveite onde servir.
- **Os dados somem sozinhos** depois de `TEMPO_LEITURA_MS` (1800 ms) em `MesaDadosOverlay.tsx`. A decisão do Sobrecarga acontece **na janela e no cartão do chat**, que persistem, e não depende de o dado ficar na mesa. Diga, em cada proposta, o que a mesa 3D faz (ou não faz) quando a troca acontece.
- **Conflito de cor para resolver às claras.** Em `ResultadoRolagem.tsx`, o âmbar (`ACCENTS.amber`, `#ff8a1f`) já é a cor de **sucesso limitado** e de **falha limitada**. Se o âmbar for a identidade do Dado de Sobrecarga, ele colide com essas faixas. Cada proposta declara como resolve isso.
- O Console da ficha reaproveita as peças de resultado de `ResultadoRolagem.tsx`. Diga se a proposta serve nos dois lugares.
</estado_atual_do_codigo>

<direcao_visual>
Paleta do VTT: **ciano** (`--rv-cy #00d4ff`, `--rv-cy-hi #6ff0ff`) como cor estrutural e **âmbar** (`#ff8a1f`) como contraste, sobre o fundo azul-petróleo (`--rv-ground #06121c`, painéis `#0c1f2b`). Explore ciano e âmbar como a linguagem da rolagem: o que é "capacidade própria" contra o que é "o arcano forçando o conduto". Você decide qual cor fica com qual dado e justifica.

Referências: jogos sci-fi AAA e clients de jogo competitivo (Valorant, Apex, Overwatch, Cyberpunk 2077, Control, Destiny 2, Deus Ex: Human Revolution, Mass Effect). **Extraia princípios de UI que cabem num painel pequeno e rápido**, como "recurso pronto", "recurso arriscado", cartão de resultado, indicador de custo, e não a escala de espetáculo deles. Estude pelo menos três e diga, em uma linha cada, o que levou de cada um. Se não conseguir ver uma referência, diga que não viu em vez de descrever de memória. Não copie arte nem marca.

Sci-fi aqui é **interface limpa e funcional**: chanfros, tipografia técnica, cor que carrega e esquenta quando o preço sobe. Cada elemento carrega informação ou estado. Nada de enfeite de HUD gratuito (a autora já rejeitou isso antes).
</direcao_visual>

<o_que_entregar>
**Pelo menos 3 propostas** que divirjam no **conceito de experiência**, e não só na cor. Eixos onde elas podem divergir:
- **Onde a troca é disparada**: no resultado dentro da janela, no cartão do Chat Log, ou nos próprios dados 3D.
- **Como o dado não usado aparece**: lado a lado e esmaecido, recolhido num chip, ou escondido até o clique.
- **Como o preço é mostrado**: no próprio botão, numa barra de carga, num selo que muda por faixa (abaixo do limite, alcança, ultrapassa).
- **Quanto de espaço o segundo dado ocupa** nas rolagens em que o jogador o ignora.
- **Como o arremesso muda** com dois dados distintos: material e luz de cada um, como o segundo reage à carga, como assentam, o que a mesa mostra enquanto eles ainda rolam.

Cada protótipo precisa permitir **percorrer o fluxo inteiro, de verdade, quantas vezes eu quiser**:
1. **Janela antes de rolar**: escolher Atributo, Perícia, CD e modificadores, como na janela real, para magista e para não magista.
2. **Rolar de verdade**: o botão, **com a carga de força**, lança os dois d10 na mesa 3D com física real, distinguíveis só pela aparência. A leitura de quem rola e a de quem observa são visíveis (um seletor "ver como").
3. **Resultado do Dado Normal com a opção de Sobrecarga disponível**, com o preço correto nas três situações: abaixo do limite, alcançando o limite (Ruptura) e ultrapassando (Integridade, com a progressão certa).
4. **Trocar**: o clique troca o dado, recalcula total, faixa e margem, atualiza o contador de Sobrecarga e acrescenta o **cartão no Chat Log** (um chat de mentira, na própria tela). Mostre o cartão antes e depois da troca.
5. **Desfazer**: restaura o Dado Normal, devolve o ponto e atualiza o cartão.
6. **Não magista**: rolagem de um dado só, que não pode parecer versão quebrada.
7. **Teste contestado**, em pelo menos uma proposta, com a comparação refeita depois da troca.

Um painel de bancada, fora do desenho da proposta (claramente separado e recolhível), controla o estado do personagem: magista ou não, Sobrecarga atual, limite, Integridade, Ruptura já sofrida. Ele também deixa **forçar os valores dos dados** (por exemplo, Normal 3 e Sobrecarga 8, o caso do exemplo do capítulo 13) para eu testar cada faixa e cada custo sem depender de sorte. Fora o modo forçado, os dados caem e assentam com valores aleatórios reais, lidos da física, e a regra aplicada é a do Notion.

Cada proposta vem também com uma ficha curta: nome, ideia em duas frases, referências que a inspiraram, como resolve a colisão do âmbar, o que a mesa 3D faz na troca, e **um ponto fraco honesto**. No fim, uma **recomendação**. Eu decido.
</o_que_entregar>

<como_entregar>
- **Protótipos em código real**, uma rota por proposta: `src/app/dev/rolagem-a`, `rolagem-b`, `rolagem-c` (e `-d`), mais um índice em `src/app/dev/rolagem` que liga as propostas, como o precedente de `src/app/dev/login-a`, `login-b`, `login-c`. Siga o padrão de `src/app/dev/dados/page.tsx`: `ProvedorMesaDados`, um `.rv-palco` simulado, `MesaDadosOverlay` e a janela, e a guarda `assertDevRouteAllowed`. Nada de HTML estático nem prancheta de canvas.
- **Construa sobre as peças reais** (`PhysicsDiceArena`, `MesaDadosOverlay`, `RollButton`, `Stepper`, `CampoCD`, as peças de `ResultadoRolagem.tsx`, o cartão de rolagem do Chat Log) para que escolher uma proposta signifique **portar**, e não refazer. Como não posso alterar arquivos existentes nesta rodada, onde uma peça precisar mudar, **copie-a para a pasta da proposta** e altere a cópia, dizendo quais.
- **Sem servidor nem banco.** Substitua as server actions (`registrarRolagemPericiaAction` e afins) por um estado local, e a ficha do personagem por dados de exemplo no painel de bancada. A regra de resolução (1d10 + Atributo + Perícia + modificadores, Margem de Impacto, as seis faixas, custo da troca) fica num módulo único e pequeno **dentro da pasta dos protótipos**, com teste de unidade cobrindo o exemplo da Ilya do capítulo 13 e os três cenários de custo.
- **Quase pronto quer dizer**: estados de hover, foco por teclado, desativado e carregando; fluxo todo operável por teclado; `prefers-reduced-motion` respeitado; janela na largura real (a do painel do VTT), sem estourar; sem quebra de layout com nomes longos ou totais de dois dígitos; 60 fps na queda dos dados. Nada de texto de enchimento nem botão que não faz nada.
- **Verifique clicando de verdade** no navegador integrado, **em aba própria e em segundo plano, sempre com `tabId`**, sem mexer na aba que já está aberta. Para cada protótipo, percorra o fluxo completo (rolar, trocar nas três faixas de custo, desfazer, não magista, contestado), meça o tempo das animações, confira o console e entregue capturas dos estados principais. Se algo não funcionar, diga, e não entregue como pronto.
</como_entregar>

<convencoes_do_projeto>
- Texto de interface sempre em português (pt-BR). Avisos dizem o fato e param; sem frase de consolo ou ressalva.
- Ícones: Lucide, sempre. Desenhar à mão só sem equivalente, avisando.
- Fontes pelas variáveis do app (`var(--font-chakra)`, `var(--font-oxanium)`, `var(--font-mono)`), nunca pelo nome da fonte. Nas pranchetas, `*{box-sizing:border-box}`.
- Bordas em elementos chanfrados usam camada dupla; não tire o chanfro de nada existente.
- Qualidade de designer profissional: respiro vertical, composição equilibrada, nada colado na borda. A referência de composição é o que já existe no VTT. Seleção ativa é bloco ciano cheio. O hover que sobe, onde existe, fica.
- **Motion**: leia `skills/skills-emilkowalski/skills/review-animations/STANDARDS.md` e `choreograph/SKILL.md` antes de animar. A rolagem é gesto de alta frequência: controles abaixo de 300 ms, curva de saída forte, sem `ease-in`. A **troca** do Sobrecarga é rara e pode ter um pouco mais de ênfase, mas sem segurar a mesa. Liste a linha do tempo em ms de cada proposta. Respeite `prefers-reduced-motion`.
- Reaproveite o que existe na janela (`RollButton`, `Stepper`, `CampoCD`, `SeletorVisibilidade`) e proponha componente novo só onde o fluxo exigir.
- **Não travar o jogador.** A troca fica disponível mesmo com o limite alcançado (a regra mantém o dado, com consequências), e "uma substituição por ação" é estado exibido, não bloqueio. Mostrar o preço informa e não impede.
</convencoes_do_projeto>

<limites>
- Nada de commit. Só arquivos novos dentro de `src/app/dev/rolagem*` (e capturas), sem alterar nenhum arquivo existente. Há mudanças não commitadas de outras sessões no working tree; não toque nelas.
- Faça os três protótipos com a mesma base (módulo de regra, painel de bancada, chat de mentira) para que a comparação seja justa e só o design varie. Se achar mais eficiente, trabalhe em subagentes, um por proposta, depois de a base estar pronta.
- Se a proposta exigir algo que as regras não definem, **sinalize como pergunta em aberto** em vez de inventar. Duas que já sei: (1) a regra diz que o narrador aceita ou recusa a intervenção, e as propostas assumem que isso se resolve falando, com **desfazer** como saída. Diga se alguma proposta precisaria de algo a mais e por quê. (2) O Surto de Foco rerrola o dado escolhido depois da troca, sem permitir nova substituição; diga se alguma proposta precisa tratar isso ou se fica fora desta rodada.
- Termine com: (a) as propostas, (b) a recomendação, (c) as perguntas em aberto, (d) o que o motor de regras e o overlay precisariam mudar para suportar a proposta escolhida. Responda em português.
</limites>
