# Inventário do CSS

Gerado por `scripts/css-inventario.ts` — 13 folhas, 13000 declarações.

Este arquivo é SAÍDA DE SCRIPT: não edite à mão, rode o script de novo.

## 1. O que já passa por token

A coluna `token` é a fatia de declarações da família que usa `var(--…)`.
Onde ela é baixa, mudar o token muda pouca coisa — é ali que uma
padronização compensa antes de qualquer mudança de valor.

| família | declarações | token | literal |
| --- | ---: | ---: | ---: |
| espaço | 1486 | 1% | 1476 |
| cor | 1408 | 58% | 595 |
| medida | 992 | 0% | 990 |
| fundo | 895 | 35% | 584 |
| borda | 735 | 46% | 397 |
| tamanho-de-fonte | 603 | 0% | 601 |
| fonte | 482 | 93% | 32 |
| raio | 372 | 70% | 110 |
| entreletra | 321 | 0% | 320 |
| peso-de-fonte | 271 | 0% | 271 |
| transição | 271 | 17% | 225 |
| sombra | 198 | 38% | 123 |
| entrelinha | 142 | 0% | 142 |
| z-index | 108 | 0% | 108 |

## 2. Folhas

| folha | declarações |
| --- | ---: |
| `app/mesas/[campaignId]/vtt/vtt.css` | 5666 |
| `app/_design/console.css` | 1996 |
| `app/mesas/[campaignId]/vtt/_painel/painel.css` | 1924 |
| `app/_design/app.css` | 1208 |
| `app/_design/mesa.css` | 772 |
| `app/_design/auth.css` | 575 |
| `app/dev/estilos/galeria.css` | 509 |
| `app/_design/vtt-chassi.css` | 132 |
| `app/_design/motion.css` | 116 |
| `app/_design/cursor.css` | 46 |
| `app/dev/estilos/especime/especime.css` | 34 |
| `app/globals.css` | 22 |

## 3. Cores literais

506 valores distintos. As 40 mais usadas:

| cor | usos | onde (primeiras folhas) |
| --- | ---: | --- |
| `#35c7d8` | 79 | `app/dev/estilos/galeria.css`, `app/mesas/[campaignId]/vtt/_painel/painel.css`, `app/mesas/[campaignId]/vtt/vtt.css` |
| `#45b8c9` | 70 | `app/_design/console.css`, `app/_design/vtt-chassi.css`, `app/mesas/[campaignId]/vtt/_painel/painel.css` +1 |
| `#16233a` | 54 | `app/_design/console.css`, `app/_design/vtt-chassi.css`, `app/dev/estilos/especime/especime.css` +3 |
| `rgba(0,212,255,0.14)` | 50 | `app/_design/app.css`, `app/_design/console.css`, `app/_design/mesa.css` +1 |
| `#d6e4f5` | 45 | `app/_design/console.css`, `app/_design/vtt-chassi.css`, `app/mesas/[campaignId]/vtt/vtt.css` |
| `#4f6285` | 45 | `app/_design/console.css`, `app/_design/vtt-chassi.css`, `app/dev/estilos/galeria.css` +2 |
| `#7f95b3` | 32 | `app/_design/console.css`, `app/dev/estilos/especime/especime.css`, `app/dev/estilos/galeria.css` +2 |
| `#1c2b45` | 27 | `app/_design/console.css`, `app/_design/vtt-chassi.css`, `app/dev/estilos/galeria.css` +2 |
| `#ffb3bd` | 22 | `app/_design/console.css`, `app/_design/mesa.css`, `app/mesas/[campaignId]/vtt/vtt.css` |
| `rgba(0,212,255,0.3)` | 21 | `app/_design/app.css`, `app/_design/auth.css`, `app/_design/console.css` |
| `rgba(0,212,255,0.35)` | 20 | `app/_design/app.css`, `app/_design/auth.css`, `app/_design/console.css` +1 |
| `#0c1526` | 19 | `app/_design/console.css`, `app/mesas/[campaignId]/vtt/_painel/painel.css`, `app/mesas/[campaignId]/vtt/vtt.css` |
| `rgba(0,212,255,0.08)` | 18 | `app/_design/app.css`, `app/_design/auth.css`, `app/_design/console.css` +1 |
| `rgba(0,212,255,0.7)` | 17 | `app/_design/app.css`, `app/_design/auth.css` |
| `rgba(0,212,255,0.6)` | 15 | `app/_design/app.css`, `app/_design/auth.css`, `app/_design/console.css` +2 |
| `#0c1420` | 15 | `app/_design/console.css`, `app/mesas/[campaignId]/vtt/_painel/painel.css`, `app/mesas/[campaignId]/vtt/vtt.css` |
| `#c3d2e8` | 15 | `app/dev/estilos/especime/especime.css`, `app/dev/estilos/galeria.css`, `app/mesas/[campaignId]/vtt/vtt.css` |
| `rgba(255,255,255,.04)` | 15 | `app/mesas/[campaignId]/vtt/vtt.css` |
| `#123640` | 14 | `app/_design/app.css`, `app/_design/auth.css`, `app/_design/console.css` +3 |
| `rgba(0,0,0,0)` | 14 | `app/_design/app.css`, `app/_design/console.css`, `app/_design/mesa.css` |
| `#eaf7ff` | 13 | `app/_design/app.css`, `app/_design/console.css` |
| `#18263f` | 13 | `app/dev/estilos/galeria.css`, `app/mesas/[campaignId]/vtt/_painel/painel.css`, `app/mesas/[campaignId]/vtt/vtt.css` |
| `rgba(0,212,255,0.12)` | 12 | `app/_design/app.css`, `app/_design/auth.css`, `app/_design/console.css` +2 |
| `#fff` | 12 | `app/_design/console.css`, `app/mesas/[campaignId]/vtt/vtt.css` |
| `#e0a53a` | 12 | `app/mesas/[campaignId]/vtt/vtt.css` |
| `rgba(0,212,255,0.1)` | 11 | `app/_design/app.css`, `app/_design/auth.css`, `app/_design/mesa.css` |
| `rgba(0,0,0,.3)` | 11 | `app/_design/console.css`, `app/mesas/[campaignId]/vtt/vtt.css` |
| `#e0455f` | 11 | `app/mesas/[campaignId]/vtt/vtt.css` |
| `rgba(0,212,255,0.28)` | 10 | `app/_design/app.css`, `app/_design/auth.css`, `app/_design/mesa.css` +1 |
| `rgba(0,212,255,0.55)` | 10 | `app/_design/app.css`, `app/_design/auth.css`, `app/_design/console.css` +1 |
| `#5f7492` | 10 | `app/dev/estilos/galeria.css`, `app/mesas/[campaignId]/vtt/vtt.css` |
| `#14203a` | 10 | `app/dev/estilos/galeria.css` |
| `rgba(0,212,255,0.06)` | 9 | `app/_design/app.css`, `app/_design/auth.css`, `app/_design/console.css` |
| `rgba(0,212,255,0.18)` | 9 | `app/_design/app.css`, `app/_design/auth.css`, `app/_design/console.css` +1 |
| `#418292` | 9 | `app/_design/app.css`, `app/_design/auth.css`, `app/_design/console.css` |
| `#d3f4ff` | 9 | `app/_design/app.css`, `app/_design/auth.css`, `app/_design/console.css` +3 |
| `rgba(17,29,49,0.70)` | 9 | `app/_design/console.css` |
| `#108bac` | 9 | `app/_design/console.css`, `app/_design/mesa.css`, `app/mesas/[campaignId]/vtt/_painel/painel.css` +1 |
| `#080e19` | 9 | `app/_design/console.css`, `app/_design/vtt-chassi.css`, `app/mesas/[campaignId]/vtt/_painel/painel.css` +1 |
| `#b8d8e8` | 8 | `app/_design/app.css`, `app/_design/auth.css` |

### Famílias de cor quase idêntica

Grupos de tons a até 10 de distância no cubo RGB. Cada grupo é UMA decisão:
a primeira da lista é a mais usada, e serve de representante natural.

| usos | tons | representante |
| ---: | --- | --- |
| 81 | `#35c7d8` `#38c1d4` | `#35c7d8` |
| 79 | `#16233a` `#18263f` `#14203a` `#182338` | `#16233a` |
| 62 | `#0c1526` `#0c1420` `#0b1322` `#0a1120` `#0b1424` `#0e1620` `#0c1b27` `#0e1420` `#0e1524` `#121a2c` `#0d1a2c` `#0b1924` `#0a1220` | `#0c1526` |
| 56 | `#d6e4f5` `#cfeaf6` `#dbe6f5` `#cfe0f7` `#cfe6f2` | `#d6e4f5` |
| 47 | `#4f6285` `#4a5d80` | `#4f6285` |
| 44 | `#080e19` `#070d17` `#06121c` `#0a0e14` `#0d1219` `#070c16` `#060a12` `#0b1219` `#07121a` `#0b0f17` `#0d1119` `#080e1d` `#0a1019` `#071019` `#07101d` `#080f1e` `#0b1119` | `#080e19` |
| 32 | `#1c2b45` `#1b2a44` `#1a2942` `#22314a` `#1c2c44` | `#1c2b45` |
| 23 | `#ffb3bd` `#ffb4b4` | `#ffb3bd` |
| 22 | `#eaf7ff` `#eafcff` `#eef7fc` `#eaf6ff` | `#eaf7ff` |
| 16 | `#123640` `#0e3647` | `#123640` |
| 15 | `#0c1f2b` `#15212c` `#111d31` `#0e2431` `#0e2230` `#101b2e` `#12222d` | `#0c1f2b` |
| 13 | `#fff` `#ffffff` | `#fff` |
| 13 | `#2a3b58` `#2a3f5f` `#24405c` `#24365a` | `#2a3b58` |
| 5 | `#cdeaf6` `#c8e4f2` | `#cdeaf6` |
| 4 | `#07090f` `#050910` | `#07090f` |
| 4 | `#223351` `#243352` | `#223351` |
| 3 | `#d15068` `#c94f63` | `#d15068` |
| 2 | `#ff8ea0` `#ff8a97` | `#ff8ea0` |
| 2 | `#ff96a8` `#ff9aa8` | `#ff96a8` |
| 2 | `#ffdca0` `#ffd79a` | `#ffdca0` |
| 2 | `#0596b7` `#039abd` | `#0596b7` |
| 2 | `#f6dcae` `#f6d9ab` | `#f6dcae` |
| 2 | `#8ba3b4` `#8fa8b5` | `#8ba3b4` |
| 2 | `#7ce6ff` `#7ee2fb` | `#7ce6ff` |
| 2 | `#1c2a32` `#1c2b38` | `#1c2a32` |

### Literais que já têm token

O valor cravado é IDÊNTICO ao de um token existente: trocar não muda
um pixel, e passa aquele ponto a obedecer o token. É a mudança em bulk
mais barata que existe aqui.

| valor | token | usos |
| --- | --- | ---: |
| `#45b8c9` | `--jr-acento`, `--rv-cy`, `--rv-lado-cor` | 70 |
| `#16233a` | `--rc-line-soft`, `--jr-linha`, `--rv-line-2` | 54 |
| `#d6e4f5` | `--rc-text`, `--jr-tinta`, `--rv-ink` | 45 |
| `#4f6285` | `--jr-tinta-fraca`, `--rv-ink-faint` | 45 |
| `#7f95b3` | `--rc-dim`, `--jr-tinta-dim`, `--rv-ink-dim` | 32 |
| `#1c2b45` | `--rc-line`, `--jr-linha-forte`, `--rv-line-strong` | 27 |
| `#0c1420` | `--rv-panel` | 15 |
| `#eaf7ff` | `--rm-text-strong` | 13 |
| `#e0a53a` | `--rv-placa-cor`, `--rv-nota-cor` | 12 |
| `#b8d8e8` | `--rm-text` | 8 |
| `#070d17` | `--jr-fundo`, `--rv-sunken` | 7 |
| `#2a3b58` | `--rv-line-max` | 7 |
| `#6f83a3` | `--rv-slate` | 7 |
| `#00d4ff` | `--cy` | 6 |
| `#f5a200` | `--am`, `--rv-op-cor` | 6 |
| `#0a1120` | `--rv-ground-2` | 6 |
| `#cf9a3e` | `--rv-am` | 6 |
| `#111d31` | `--rv-panel-2` | 3 |
| `#060a12` | `--rv-ground` | 2 |
| `#182338` | `--rv-line` | 2 |
| `#d15068` | `--rc-danger`, `--jr-perigo`, `--rv-dg` | 2 |
| `#22d3aa` | `--rm-success` | 1 |
| `#243352` | `--rv-line-hover` | 1 |
| `#eaf6ff` | `--pn-txt-forte`, `--txt-forte` | 1 |

## 4. Tipografia

| família declarada | usos |
| --- | ---: |
| `var(--font-mono)` | 251 |
| `var(--rv-display)` | 119 |
| `var(--font-rajdhani)` | 34 |
| `inherit` | 29 |
| `var(--rv-body)` | 25 |
| `var(--font-orbitron)` | 15 |
| `var(--font-chakra)` | 5 |
| `var(--rv-mono)` | 1 |
| `system-ui` | 1 |
| `ui-monospace` | 1 |
| `ui-sans-serif` | 1 |

## Tamanhos de fonte

27 valores distintos.

| valor | usos |
| --- | ---: |
| `10px` | 186 |
| `11px` | 98 |
| `12px` | 79 |
| `10.5px` | 41 |
| `11.5px` | 37 |
| `13px` | 34 |
| `9px` | 21 |
| `9.5px` | 21 |
| `12.5px` | 19 |
| `14px` | 14 |
| `15px` | 7 |
| `13.5px` | 7 |
| `8.5px` | 7 |
| `16px` | 5 |
| `22px` | 5 |
| `20px` | 5 |
| `18px` | 3 |
| `19px` | 3 |
| `34px` | 1 |
| `32px` | 1 |
| `38px` | 1 |
| `52px` | 1 |
| `14.5px` | 1 |
| `26px` | 1 |
| `17px` | 1 |
| `8px` | 1 |
| `42px` | 1 |

## Espaços (padding, margin, gap)

41 valores distintos.

| valor | usos |
| --- | ---: |
| `8px` | 227 |
| `6px` | 197 |
| `10px` | 180 |
| `12px` | 157 |
| `4px` | 134 |
| `5px` | 83 |
| `2px` | 79 |
| `7px` | 74 |
| `16px` | 67 |
| `9px` | 64 |
| `3px` | 61 |
| `14px` | 43 |
| `1px` | 35 |
| `20px` | 32 |
| `24px` | 25 |
| `11px` | 19 |
| `18px` | 16 |
| `13px` | 10 |
| `22px` | 8 |
| `34px` | 7 |
| `40px` | 6 |
| `17px` | 5 |
| `32px` | 5 |
| `26px` | 4 |
| `28px` | 4 |
| `15px` | 4 |
| `56px` | 3 |
| `36px` | 3 |
| `30px` | 2 |
| `48px` | 2 |
| `42px` | 2 |
| `60px` | 1 |
| `70px` | 1 |
| `38px` | 1 |
| `8.5px` | 1 |
| `68px` | 1 |
| `64px` | 1 |
| `96px` | 1 |
| `150px` | 1 |
| `0px` | 1 |

## Raios

9 valores distintos.

| valor | usos |
| --- | ---: |
| `1px` | 27 |
| `2px` | 26 |
| `4px` | 9 |
| `999px` | 9 |
| `3px` | 8 |
| `6px` | 4 |
| `8px` | 1 |
| `111px` | 1 |
| `32px` | 1 |

## Entreletra

45 valores distintos.

| valor | usos |
| --- | ---: |
| `.1em` | 32 |
| `.08em` | 28 |
| `.06em` | 25 |
| `.14em` | 22 |
| `0.1em` | 20 |
| `.12em` | 19 |
| `0.08em` | 17 |
| `.16em` | 16 |
| `0.14em` | 15 |
| `0.06em` | 13 |
| `.2em` | 10 |
| `0.18em` | 9 |
| `1.6px` | 8 |
| `.04em` | 8 |
| `0.12em` | 7 |
| `0.22em` | 6 |
| `0.16em` | 5 |
| `0.04em` | 4 |
| `.18em` | 4 |
| `0.28em` | 3 |
| `0.2em` | 3 |
| `0.8px` | 3 |
| `0.05em` | 3 |
| `.22em` | 3 |
| `.05em` | 3 |
| `0.15em` | 2 |
| `.3em` | 2 |
| `.01em` | 2 |
| `0.19em` | 1 |
| `0.056em` | 1 |
| `0.4em` | 1 |
| `0.0625em` | 1 |
| `0.047em` | 1 |
| `0.17em` | 1 |
| `0.144em` | 1 |
| `0.21em` | 1 |
| `0.6px` | 1 |
| `0.02em` | 1 |
| `0.01em` | 1 |
| `.035em` | 1 |

## Medidas (largura/altura)

109 valores distintos.

| valor | usos |
| --- | ---: |
| `1px` | 41 |
| `4px` | 38 |
| `16px` | 31 |
| `24px` | 25 |
| `18px` | 23 |
| `6px` | 21 |
| `36px` | 19 |
| `14px` | 19 |
| `40px` | 18 |
| `30px` | 16 |
| `22px` | 15 |
| `26px` | 15 |
| `34px` | 12 |
| `8px` | 12 |
| `15px` | 12 |
| `10px` | 12 |
| `28px` | 11 |
| `12px` | 11 |
| `11px` | 11 |
| `2px` | 10 |
| `20px` | 10 |
| `32px` | 10 |
| `13px` | 10 |
| `9px` | 10 |
| `7px` | 8 |
| `5px` | 7 |
| `220px` | 7 |
| `560px` | 7 |
| `44px` | 6 |
| `3px` | 6 |
| `17px` | 6 |
| `348px` | 5 |
| `64px` | 5 |
| `54px` | 5 |
| `320px` | 5 |
| `190px` | 5 |
| `240px` | 4 |
| `460px` | 4 |
| `50px` | 4 |
| `200px` | 4 |
