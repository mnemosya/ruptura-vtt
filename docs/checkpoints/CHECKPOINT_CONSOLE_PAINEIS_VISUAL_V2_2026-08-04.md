# Checkpoint — Console do Personagem: redesenho visual v2 dos painéis (Vitals, Perícias, Pins/Condições, Equipamentos)

**Data**: 2026-08-04
**Commit-base**: `d02e9e7`
**Escopo**: redesenho visual, seguindo specs de Figma, dos painéis de conteúdo da coluna 2/3 do Console — Colapso/Recursos (`VitalsRow.tsx`), Perícias (`SkillsGrid.tsx`), Pins e Condições (`PinsAndConditions.tsx`) — mais ajustes de nomenclatura de slots de equipamento (`slots.ts`) e um retrabalho amplo de `EquipmentPanel.tsx`. Não inclui a casca da janela/modos (ver checkpoint de janela) nem o fluxo de defesa (ver checkpoint de Reação).

---

## 1. Colapso + Recursos (`VitalsRow.tsx`)

Reescrito para bater com a spec v2 do Figma, saindo do layout anterior (trilha inclinada via `clip-path`) para um sistema de card em 3 camadas igual ao já usado em Perícias (Card externo → Box título → Card interno):

- **Colapso** virou um card único: label, pips losangulares (`ColapsoPip`, mesma geometria de PA/Reações mas paleta vermelha `#FF5F74`), badge de morte/coma (`SkullIcon`, novo ícone SVG inline) e botão Estabilizar.
- **Recursos** (PV/PE/Mana): cada linha tem um badge de ícone, uma trilha de 3 segmentos e um valor editável com botões −/+ (`MinusIcon`/`PlusIcon`, novos SVGs inline, cor `#418292`).
- Trilha de recurso: célula (`BarCell`) sempre usa a MESMA peça SVG ("Meio" do prompt, path `BAR_D`) repetida — usar peças diferentes por posição (Primeiro/Meio/Último) fazia o entalhe entre células crescer da esquerda pra direita; a peça do meio tem entalhe simétrico nos dois lados, dando gap uniforme em qualquer posição. Cada célula empilha 2 camadas SVG (vazado embaixo, cheio em cima), a de cima recortada via `clip-path: inset()` na fração local — não `width`, que distorceria a forma da peça.
- Paleta por recurso: PV `#FF5F74`/vermelho, PE `#8B5CF6`/roxo, Mana `#00D4FF`/cyan — cada um com cor de texto, cor de barra (70% opacidade) e cor "vazado" (rgb base pra montar `rgba()` em várias opacidades) definidas em `RECURSOS`.
- Os botões −/+ do prompt são um atalho de ±1 em cima da mesma ação de edição já existente (`editarRecurso`, grava valor absoluto) — não uma lógica nova.

## 2. Perícias (`SkillsGrid.tsx`)

Redesenho v2 mantendo a mecânica (grade 3×7, ordem alfabética antes da distribuição — DOM já na ordem correta pra leitor de tela, 21 posições com células vazias desabilitadas se sobrar espaço):

- Estrutura em 3 camadas: Card externo (`.rc-skills-wrap`) → Box título "PERÍCIAS" (`.rc-skills-caption`, borda só em cima/direita/esquerda pra fundir visualmente com o card interno) → Card interno (`.rc-skills-card`) → grade de cards de perícia.
- Cada perícia ganhou um **ícone próprio** (novo arquivo `skillIcons.tsx`, mapa `SKILL_ICONS: Record<periciaId, IconComponent>`), no lugar do ícone genérico `Target` do Lucide repetido 21 vezes; fallback `HelpCircle` para qualquer perícia sem ícone mapeado.
- Cor do card por atributo governante via `data-attr` (verde=Corpo, roxo=Mente, cyan=Ânimo — reaproveita `--cy` já existente no design system).
- Adicionado o **valor da perícia** (`api.character.pericias[skill.id]`) ao `aria-label`, que antes só tinha o `Nd8` do atributo.
- Nenhuma perícia hardcoded: lista e atributo primário continuam vindo de `regras_personagem`.

## 3. Pins e Condições (`PinsAndConditions.tsx`)

- **Pins**: slot vazio trocou o ícone `Pin` (com opacidade reduzida) por `Plus` + texto "Espaço livre" (era "slot livre") — comunica affordance de clique em vez de só indicar vazio.
- **Condições**: reestruturado no mesmo padrão de card em 2 camadas dos outros painéis (`.rc-ncond-wrap` → `.rc-ncond-card`, era `.rc-panel` simples com `.rc-cond-head` separado). Tags de condição ativa (`.rc-ncond-tag`) e botão "Adicionar" (`.rc-ncond-add`) redesenhados com os novos nomes de classe (prefixo `rc-ncond-*`, substituindo `rc-cond-*`).

## 4. Slots de equipamento (`slots.ts`)

- Rótulos renomeados: `membro_superior` "Membro superior" → **"Braços"**, `membro_inferior` "Membro inferior" → **"Pernas"** (`BODY_SLOT_LABELS`).
- `itemCabeNoSlot`: o slot `arma_secundaria` passou a aceitar tanto `categoria === "arma"` quanto `categoria === "escudo"` (antes só arma, igual à primária). Isso representa a mão livre (a que não empunha a arma primária) — a mesma mão que pode segurar um escudo. No modelo de dados isso continua sendo duas flags independentes (`equipadoDefensivo` × `empunhado[1]`), mas na composição visual do Console os dois cabem no mesmo slot visual — sem essa mudança, "Equipar" a partir desse box só listava armas na mochila, escondendo escudos que deveriam aparecer ali também.

## 5. Equipamentos (`EquipmentPanel.tsx`) e suporte visual novo

Retrabalho amplo do painel de equipamentos (maior diff do grupo: ~560 linhas), incluindo:
- Nova silhueta de corpo interativa (`bodySilhouette.tsx`, novo arquivo) para posicionar os slots visualmente sobre o boneco, com assets em `public/humanbody/`.
- Novos ícones de atributo (`attrIcons.tsx`) e de avatar (`avatarIcons.tsx`), novos arquivos.
- Pips reutilizáveis extraídos para arquivo próprio (`pips.tsx`) — mesma geometria de losango usada em PA/Reações/Colapso, centralizada num único lugar em vez de reimplementada em cada painel.
- Script de apoio para popular um personagem de exemplo já com itens equipados, para testar o painel sem montar o estado manualmente: `scripts/dev/demo-equipped.mjs` (novo).

*(Este item cobre trabalho anterior ao trecho revisado em detalhe nesta sessão — os pontos acima refletem os arquivos tocados e a extração de responsabilidades observada no diff; para o detalhamento por decisão de design, ver o histórico de commits/diff de `EquipmentPanel.tsx`.)*

## 6. Arquivos

**Criados**: `skillIcons.tsx`, `attrIcons.tsx`, `avatarIcons.tsx`, `bodySilhouette.tsx`, `pips.tsx`, `scripts/dev/demo-equipped.mjs`, `public/humanbody/*`.
**Alterados**: `panels/VitalsRow.tsx`, `panels/SkillsGrid.tsx`, `panels/PinsAndConditions.tsx`, `panels/EquipmentPanel.tsx`, `slots.ts`, `src/app/_design/console.css`.
