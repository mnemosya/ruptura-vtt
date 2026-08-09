# Checkpoint — Console do Personagem: janela, modos Painel/Foco e trilho de abas

**Data**: 2026-08-04
**Commit-base**: `d02e9e7`
**Escopo**: reformulação da "casca" da janela do Console (`ConsoleWindow.tsx`, `useConsoleWindow.ts`, `geometry.ts`), do trilho de abas (`TabRail.tsx`) e introdução dos modos de visualização **Painel** e **Foco**. Não inclui o conteúdo interno das abas (Equipamentos, Personagem) nem as regras de defesa/Reação — ver os outros dois checkpoints desta sessão.

---

## 1. Redesign estrutural da janela (spec "JANELA CONSOLE")

- Trilho de abas (`.rc-tabrail`) saiu de dentro do conteúdo rolável da janela e virou **irmão** de `.rc-window`, dentro de um novo wrapper `.rc-window-wrap` — antes ele era cortado ao redimensionar a janela para menos que o necessário; agora fica sempre visível, colado à borda direita, centralizado verticalmente (`align-items: center` no wrap).
- As custom properties de cor (`--cy`, `--am`, `--rc-line` etc.) subiram de `.rc-window` para `.rc-window-wrap`, já que agora precisam alcançar o trilho também (que não é mais descendente de `.rc-window`).
- Removidos os cortes decorativos nas diagonais (canto inferior-esquerdo/superior-direito) de `.rc-window` — retângulo reto.
- Fundo: SVG decorativo (`public/console/bg-console-do-personagem.svg`, copiado de `images/`) aplicado como segunda camada de `background` sobre a cor sólida.
- Scrollbar nativa do SO/navegador substituída por uma customizada e **sempre visível** quando há overflow (`scrollbar.tsx`, componente `<Scrollbar orientacao="horizontal"|"vertical">`) — nem `::-webkit-scrollbar` estilizado escapa do "esconder até rolar ativamente" do macOS, então a nativa é escondida (`scrollbar-width:none`) e uma barra própria é desenhada por cima, sincronizada via `scroll`/`ResizeObserver`, arrastável. Aplicada em `.rc-body` (via `ConsoleWindow.tsx`) e em `.rc-tabpanel` (via `CharacterConsole.tsx`).
- Canto de resize: reduzido de 26px para 18px; ganhou um segundo canto **espelhado no inferior-esquerdo** (`.rc-resize--esquerda`, cursor `nesw-resize`) além do original (`.rc-resize--direita`) — arrasta a borda esquerda mantendo a direita fixa (`redimensionarPelaEsquerda` em `geometry.ts`).

## 2. Janela não estica além do conteúdo natural (Painel)

Problema original: a janela sempre abria/redimensionava numa fração fixa da viewport (`~86vw × 84vh`), estourando bem além do necessário em telas grandes e, pior, ficando maior que a própria tela em telas pequenas quando o conteúdo natural (coluna 1) exigia mais espaço do que cabia.

Solução (`geometry.ts` + `useConsoleWindow.ts`):
- `ConsoleWindow.tsx` mede via `ResizeObserver` a altura natural de `.rc-aside` (coluna 1, que ganhou `align-self: start` em vez do `stretch` padrão do grid — sem isso a medição seria circular) e a largura natural de `.rc-grid` (que ganhou `align-self: start` em vez de `stretch`, e perdeu `min-height: 100%` — ver §5).
- Essas medições viram `alturaMaximaConteudo`/`larguraMaximaConteudo` no hook, convertidas para "altura/largura de janela equivalente" somando o chrome (`CHROME_VERTICAL = topbar 44 + borda/padding da janela 4 + padding de .rc-body 48`; `CHROME_HORIZONTAL` análogo sem a topbar).
- `tetoDeEixo()` (nova função pura em `geometry.ts`) sempre pega a **menor** entre uma fração de viewport (`86vw`/`90vh`) e o teto de conteúdo — essencial manter os dois: só o teto de conteúdo, numa tela pequena com coluna 1 naturalmente alta, empurrava a janela pra mais alta que a própria tela (bug real, corrigido depois de reproduzido).
- `geometriaInicial`, `redimensionar`, `redimensionarPelaEsquerda` e `geometriaMaximizada` (todas em `geometry.ts`) agora aceitam `alturaMaxima`/`larguraMaxima` opcionais — parâmetros aditivos, comportamento idêntico ao anterior para quem não passa (testes antigos em `scripts/test-console.ts` continuam válidos sem alteração).
- Um efeito de sincronização em `useConsoleWindow.ts` reaplica o teto sempre que o conteúdo medido muda (ex.: personagem ganhou mais um ponto de PA, mudando a altura da coluna 1) — nos dois sentidos (cresce e encolhe) até o primeiro resize manual do usuário; depois disso, só clampa pra baixo (não briga com o tamanho escolhido). Esse resync roda tanto em modo `normal` quanto `maximized` — sem cobrir o maximizado, clicar em Maximizar **antes** da 1ª medição terminar prendia a janela em tela cheia pra sempre (bug real, corrigido).
- `MIN_H`/`MIN_W` viraram só pisos de segurança (480/296), não mais os valores "reais" de mínimo.

## 3. Modos Painel e Foco

Novo arquivo `viewMode.ts` (`export type ViewMode = "painel" | "foco"`), estado vive em `CharacterConsole.tsx` (não em `useConsoleWindow`, que fica agnóstico de "view mode" e só recebe overrides numéricos).

- **Painel** (comportamento de sempre): colunas 1/2 fixas (`.rc-grid`) + conteúdo da aba ativa em `.rc-tabsarea-outer`.
- **Foco**: a janela mostra só a aba ativa, largura máxima fixa de **818px** (871px com o trilho — `FOCO_MAX_W`/`TABLIST_W` em `geometry.ts`), altura de partida de **726px** (`FOCO_ALTURA_INICIAL`) até a altura natural da aba ativa ser medida. As colunas 1/2 viram uma aba especial **"Personagem"**, reaproveitando os MESMOS componentes (`IdentityAside`, `VitalsRow`, `SkillsGrid`, `ConditionsPanel`, `PinsRow`) num layout novo lado-a-lado (`renderPersonagem`/`.rc-foco-personagem` em `CharacterConsole.tsx`), não uma cópia do conteúdo.
- Regras de troca de aba: entrar em Foco mantém a aba atual (não pula pra "Personagem" sozinho); "Personagem" só abre quando selecionada; voltar pro Painel com "Personagem" ativa restaura a última aba convencional (`ultimaAbaConvencionalRef`).
- `useConsoleWindow` ganhou `opts?: { larguraMaximaFixa, alturaFallbackInicial }` — quando `larguraMaximaFixa` está presente (Foco), ela **sempre** vence sobre a largura medida (que nem é medida nesse modo). Trocar de modo reseta as medições acumuladas (`alturaMaximaConteudo`/`larguraMaximaConteudo` voltam a `null`) e a flag de "redimensionada manualmente", forçando remedição limpa no novo layout.
- `ConsoleWindow.tsx` mede `.rc-foco-personagem` (não `.rc-foco-content`) para a altura no modo Foco — medir `.rc-foco-content` seria circular, já que ele passou a esticar (`flex:1`) pra dar altura definida às abas de navegação comuns (ver §5).

### Bug real: `EquipmentPanel` colapsava pra altura 0 dentro do Foco

`EquipmentPanel`/`.rc-eq-outer` etc. usam uma cadeia de `height: 100%` que, no Painel, resolve contra a altura da linha do grid — reaproveitados sem alteração dentro do Foco, essa cadeia não tinha base nenhuma pra resolver (o `.rc-foco-content` que os envolve não tinha altura própria) e colapsava pra 0. Corrigido dando `flex: 1; min-height: 0` a `.rc-foco-content` **só** quando o filho é `.rc-tabsarea-outer` (seletor `:has()`), preservando o comportamento de "hugar" o conteúdo quando o filho é `.rc-foco-personagem` (necessário pra medição de altura funcionar).

## 4. Trilho de abas reorganizado em grupos (spec "modos Painel e Foco")

- Estrutura em grupos separados no DOM (`.rc-tabrail-group`) com dividers reais (`.rc-tabrail-divider`, `height:1px; background:#0E3647`) — não mais gaps/margens simuladas. `gap: 8px` dentro de cada grupo, `gap: 12px` entre grupo/divider/grupo (no `.rc-tabrail` container).
- **Painel**: [navegação: Equipamentos, Mochila, Magias, Escalpos, Identidade, Ações] — divider — [modos: ícone Painel/Foco].
- **Foco**: [Personagem] — divider — [mesma navegação] — divider — [mesmos modos].
- Reordenado o grupo de navegação (Mochila antes de Magias) e renomeado "Características" → "Identidade" (`tabs.ts`).
- Botões de modo (`PanelsTopLeft`/`AppWindow` do Lucide) usam a MESMA base visual das abas (`.rc-tabrail-btn`), mas estado ativo deliberadamente mais discreto (`.rc-tabrail-btn--modo[aria-selected]`: só `border-left` + fundo, sem o `box-shadow` cheio das abas de conteúdo).
- Aba "Personagem" tem paleta âmbar própria (`.rc-tabrail-btn--personagem`, 3 estados com valores hex exatos de spec) e ícone customizado inline (pessoa num quadro, `stroke="currentColor"`, cor controlada por CSS por estado — não dois SVGs hardcoded como a spec sugeria, pra ficar consistente com o padrão dos demais ícones do trilho).

## 5. `.rc-grid` sem `min-height: 100%` — outro bug de padding perdido no scroll

Mesma classe de bug do §3 (Foco), reproduzida também no **Painel**: `.rc-grid` tinha `min-height: 100%`, prendendo sua própria altura à de `.rc-body` mesmo quando `.rc-aside` (item que ocupa as duas linhas via `grid-row: span 2`) precisava de mais espaço — as rows do grid (`auto 1fr`) não crescem pra acomodar um item spanning, então a coluna 1 "vazava" pra fora da grade via `overflow: visible` (padrão do grid). Isso fazia `.rc-body` perder o `padding-bottom` de 24px no fim do scroll — o usuário via o botão "Rolar defesa" cortado rente à borda da janela mesmo rolando até o fim. Corrigido removendo `min-height: 100%`, deixando a grade "hugar" o item mais alto de verdade — confirmado medindo `.rc-grid`/`.rc-aside`/`.rc-body` no fim do scroll (gap final de ~24.3px, batendo com o padding).

## 6. Testes

`scripts/test-console.ts` ganhou os blocos `4b` (teto de altura com teto de viewport — cobre especificamente o bug de janela maior que a tela), `4c` (teto de largura do grid) e `4d` (resize pelo canto esquerdo). Todos os 11 blocos passam.

## 7. Arquivos

**Criados**: `viewMode.ts`, `scrollbar.tsx`, `public/console/bg-console-do-personagem.svg`.
**Alterados**: `geometry.ts`, `useConsoleWindow.ts`, `ConsoleWindow.tsx`, `CharacterConsole.tsx`, `panels/TabRail.tsx`, `tabs.ts`, `src/app/_design/console.css`, `scripts/test-console.ts`.
