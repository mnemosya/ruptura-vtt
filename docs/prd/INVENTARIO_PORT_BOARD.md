# Inventário de port — board "Minhas Campanhas — game UI" → código real

_Atualizado em 02/11/2026. Board de design: artifact `30cb859e` (pranchetas `.dc.html`)._

## Conclusão que muda o método

**Quase todo o board já está implementado no código.** As pranchetas não são
telas por construir — são uma **iteração de design sobre telas que já existem e
funcionam** (várias até mais rigorosas que a prancheta, porque carregam dados,
realtime e snapshots reais). Prova: `MesasDashboardClient.tsx` abre citando a
própria `Main.dc.html` como origem do layout.

Portanto, "passar o board pro código" **não é portar do zero**. É uma passada
disciplinada de **reconciliação de delta visual**, tela por tela: comparar o que
o código já faz com a última prancheta aprovada e aplicar **só a diferença** — na
camada de apresentação. (Foi exatamente o caso do Chat Log: avatar redondo para
fora, mensagem própria à direita, mais respiro — e nada mais.)

## Mapa prancheta → código

| Prancheta | Alvo no código | Estado | Delta provável | Risco |
|---|---|---|---|---|
| **Main** (V1 Seco) | `src/app/mesas/MesasDashboardClient.tsx` (+ `vtt-chassi.css`/`_design`) | **Já existe** (cita a prancheta) | só conferir paridade com a última versão | Baixo |
| **VazioCampanhasB** (Narrar ou Jogar) | `MesasDashboardClient.tsx` → `VazioCampanhas` (`data-testid=dash-vazio`) | **Já existe** | paridade | Baixo |
| **ChatLogCards** (15 tipos) | `vtt/_painel/feed/*` (`contratos.ts`, `CartaoBase`, renderers) | **Já existe** (robusto) | avatar/token fora, self à direita, espaço — _já desenhado na prancheta, falta no código_ | Médio (CabeçalhoPersonagem é compartilhado: continuação + selo de privacidade) |
| **TempoA** (Tempo e clima, interativo) | `vtt/_shell/TempoDaCampanha.tsx` + `_dominio/tempoCampanha.ts` | **Já existe** (a lógica da prancheta saiu daqui) | deltas visuais (agenda de eventos, contexto enxuto, botões fixos) | Baixo-médio |
| **ConsoleA** (ficha tática) | `src/app/ficha/_console/*` (`CharacterConsole.tsx` + `panels/*`) | **Já existe** (extenso) | caso a caso por painel | Médio (muitos painéis) |
| **BandoConsole** (redesign 3 abas) | `vtt/_painel/BandoTab.tsx` + `_painel/bando.css` | **Já existe** (inventário real) | a prancheta é redesign visual; conferir se as 3 abas batem com o modelo real | Médio |
| **CompendioConsole** (índice) | `vtt/_painel/CompendioTab.tsx` + `_compendio/LivroCodex.tsx` | **Já existe** (índice Notion + livro) | ver [[forja-compendio-nao-refazer]]: do novo, **só o efeito de virar página** vai pro real | Baixo (escopo pequeno) |
| **VttTrilhaB** (trilha compacta, retratos) | `vtt/VttClient.tsx` + `vtt/_shell/*` + `vtt/_mapa/*` | **Já existe** | trilha/retratos e deltas de HUD | Alto (tela-núcleo, muitos painéis acoplados) |

## Pendências de port já conhecidas (das decisões anteriores)

- **Vanguarda — telas de classe** aprovadas e **ainda não portadas pro VTT**
  (ver [[vanguarda-direcoes-aprovadas]]: A1 Núcleo, BK2, CC1/CC4, CL2, GD2).
- **Especialistas — card "split angular", Conceito C** aprovado; próximo passo é
  portar pro VTT (ver [[especialistas-card-split-angular]]).
- **Compêndio** — do redesign, portar **apenas** a transição de virar página
  (ver [[forja-compendio-nao-refazer]]).

## Ordem recomendada (por risco crescente)

1. **Camada compartilhada primeiro** — tokens e primitivos, antes de qualquer
   tela. Cor, fonte, espaçamento, chanfro, `CartaoBase`, botões, chips, moldura
   de janela. Hoje vivem em `src/app/_design/*` (`console.css`, `vtt-chassi.css`),
   `vtt/vtt.css`, `vtt/_painel/painel.css`, `feed/ui/*` e `_dados3d/ResultadoRolagem`.
   Consolidar o que a prancheta mudou aqui faz a mudança propagar sem hardcode por
   tela.
2. **Telas de baixo acoplamento**: Main / VazioCampanhas (paridade), Compêndio
   (só a transição).
3. **Chat Log** (delta já definido) e **Tempo e clima**.
4. **Ficha (ConsoleA)** — um painel por PR.
5. **Bando**.
6. **VTT (VttTrilhaB)** por último — é a tela-núcleo; Vanguarda e Especialistas
   entram aqui.

## Método por tela (o "com cuidado")

1. **Congelar a versão** da prancheta no início do PR (o board continua mudando).
2. **Só apresentação.** Não tocar dados/projeção/domínio: `logPresentation.ts`,
   projetores de `contratos.ts`, `tempoCampanha.ts`, modelos. Risco fica no view.
3. **Reusar, nunca forkar.** O que é compartilhado muda no token/primitivo
   (ex.: `ResultadoRolagem` serve ferramenta de dados + Console + Chat — "uma
   leitura só pro mesmo evento"). Quando o **código estiver à frente** da
   prancheta, **alinhar a prancheta ao código**.
4. **A prancheta é spec, não código.** Os `.dc.html` são protótipo (binding DC
   próprio) — reimplementar em React/CSS **medindo lado a lado**, não "de olho"
   (ver [[portar-prancheta-literal]]).
5. **Verificação lado a lado** nos harnesses que já existem em `src/app/dev/*`
   (ex.: `dev/character-sheet` usa `logPresentation`), com antes/depois.
6. **Rede de segurança por PR**: `tsc` + lint + testes existentes
   (há `data-testid`, ex. `painel-feed-modificadores`, `dash-vazio`);
   acessibilidade (aria, `prefers-reduced-motion`); realtime e os **snapshots
   "como estava no momento"** (magia/referência) sem quebrar.
7. **PR pequeno por prancheta**, com screenshot antes/depois.

## Riscos transversais

- **Primitivos compartilhados**: `CartaoBase`/`CabecalhoPersonagem` (continuação +
  privacidade), `ResultadoRolagem` (3 telas) — mudar lá reverbera; é vantagem se
  feito no token, armadilha se copiado.
- **Estados que a prancheta não cobre**: o código tem mais do que os exemplos
  (`EstadoAtaque`, `FaseColapso`, `EstadoMagia`) — portar o visual sem regredir.
- **CSS**: box-sizing, chanfro/`clip-path` com borda, estilo inline vencendo
  `:hover` (ver [[dc-artboard-gotchas]], [[artboard-box-sizing]],
  [[chanfro-borda-sem-corte]]).
- **O board é a referência, mas muda**: só portar as direções escolhidas; o que
  foi apagado do canvas não entra.
