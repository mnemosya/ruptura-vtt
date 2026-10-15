# Plano — Conjuração automática de magias

Objetivo: conjurar uma magia pelo HUD ou pelo token e o VTT cuidar do resto. Ele posiciona a área ou escolhe os alvos, cobra o custo, rola os testes, aplica os efeitos e expira a duração. É o modelo do Foundry (templates + aplicação de efeitos), com `resolucao: "manual"` como saída para o que não der para automatizar.

## Estado atual (2026-10-13)

| Peça | Onde | Situação |
|---|---|---|
| 229 magias | `content/v12/db_magias_vertentes_v1_2.json` | Alcance, área e efeito só em texto. Todo `payload_automacao` é `narrativo`; `resolucao` é sempre `manual`. |
| Gerador | `scripts/dev/v12/gerar_magias_das_vertentes.ts` | Já interpreta custo e tempo. Não interpreta alcance, área, alvo nem efeito. |
| Áreas no mapa | `vtt/_dominio/areaEfeito.ts`, `_ferramentas/areasEstado.ts`, `_mapa/CamadaAreas.tsx` | Formas esfera, cone, linha, faixa, cubo, parede, aura e domo, com snap e persistência. Hoje só desenho manual. |
| Alvos | `vtt/_dominio/targets.ts`, `_shell/PainelAcaoToken.tsx` | Já existe "Conjurar" no painel de ação do token. |
| Efeitos | `src/lib/contentSchema/effectTypeRegistry.ts` | Tipos canônicos (dano, cura, condição, teste_resistencia, efeito_temporario…). O executor de magia é só "assistido": rola, mas não aplica. |
| Cobrança | `MagiasHud` → `onConjurar` | Já cobra mana e PA e trata as escolhas de mana e tempo. |

## Fase 1 — Dados estruturados

Novo bloco `estatisticas.alvo_area` gerado pelo parser:

```ts
alcance: { tipo: "pessoal" | "toque" | "metros" | "especial"; metros?: number; texto: string }
alvos?:  { qtd_min: number; qtd_max: number; restricao?: "voluntaria" | "hostil" | "objeto" | "maquina" | ...; linha_de_efeito?: boolean; inclui_conjurador?: boolean }
area?:   { forma: "esfera" | "cone" | "linha" | "faixa" | "cubo" | "parede" | "aura" | "domo"; raio_m?; comprimento_m?; largura_m?; altura_m?; aresta_m?; origem: "ponto" | "conjurador" | "toque" }
alternativas?: (mesma forma)[]   // "X ou (aura ⊙ ...)"
```

- O parser cobre os ~140 textos distintos de alcance (lista em `alcance.texto`). O que não casar vai para `excecoes`, e o build falha quando há exceção nova.
- As formas usam os mesmos nomes de `TipoArea` em `areaEfeito.ts`, para alimentar a ferramenta de áreas sem tradução.

`payload_automacao.efeitos` passa a ter efeitos reais, com os tipos do `EFFECT_TYPE_REGISTRY`:
- **Extração automática:** padrões em negrito nas descrições (`**1d8** à pool de **\`Percepção\`**`, `**2d6** de dano ...`, condições citadas).
- **Revisão:** uma tabela de sobreposição (`content/v12/magias_automacao_overrides.json`) por slug, revisada magia a magia. O que não for revisado fica `narrativo`.
- Uma magia só vira `resolucao: "automatica"` quando todos os efeitos dela são executáveis. Senão fica `"assistida"` (área e alvos automáticos, efeitos com botão) ou `"manual"`.

## Fase 2 — Mira no mapa

Fluxo iniciado por `onConjurar` (HUD) ou pelo `PainelAcaoToken`:

1. Escolhas prévias (mana, tempo, manifestação), que já existem.
2. **Mira**, nova fase em `areasEstado.ts`:
   - Com área: um template fantasma segue o cursor, preso ao alcance a partir do token do conjurador (anel de alcance desenhado). A origem `conjurador` (cone, aura) gira em volta do token. Clique confirma e Esc cancela.
   - Com alvos: seleção de tokens (de `qtd_min` a `qtd_max`), validando alcance, restrição e linha de efeito.
   - Toque: só tokens adjacentes.
3. Persiste a área como `areaPersistida`, já com cor da vertente e rótulo da magia, ligada à conjuração.
4. Cálculo de quem está dentro: hexes da área ∩ pegada dos tokens (`pegada.ts`, `hex.ts`).

## Fase 3 — Resolução

Server action `conjurarMagiaAction(campaignId, sceneId, conjuracao)`. Ela relê a magia publicada e a ficha (o cliente só manda slug, escolhas, alvos e área) e então:
- cobra mana e PA no servidor;
- para cada alvo, rola teste/resistência (CD do conjurador) e aplica os efeitos conforme sucesso ou falha (metade, zero…);
- grava um card `magia_conjurada` no chat com resultado por alvo e botões **Aplicar / Desfazer** para quem mestra (modo assistido) ou o registro do que foi aplicado (modo automático).

Executores novos de magia em `src/lib/character/spells.ts`: dano, cura, aplicar/remover condição, bônus de pool, alterar recurso.

## Fase 4 — Duração e concentração

- Efeito ativo com `duracao` ligada ao rastreador de turnos (`_turnos`) e ao tempo de campanha (`tempoCampanha.ts`).
- Expiração remove condições, bônus e a área do mapa.
- Encerrar manualmente pelo HUD ("magias ativas").

## Fase 5 — Casos especiais

- Alcances não espaciais (`Nível`, `Nó adjacente`, `Bloqueio adjacente`, sistemas e dispositivos): ficam `assistida`, sem mira.
- Magias com tabela (Modulação, Linha de Demolição): a área vem da opção escolhida.
- Reação: dispara pelo painel de reação, sem mira de turno.

## Perguntas de regra (precisam da autora)

1. Como a magia "acerta": teste do conjurador contra defesa, só resistência do alvo, ou os dois conforme o `tipo_magia`?
2. CD de resistência: de onde ela vem (atributo + nível da vertente?) e há tabela no Notion?
3. Linha de efeito: tokens bloqueiam ou só paredes e terreno?
4. Área atinge aliados sempre, ou o conjurador pode excluir alvos?
5. Quem confirma a aplicação: sempre o mestre, ou automático quando o alvo é do próprio jogador ou voluntário?
