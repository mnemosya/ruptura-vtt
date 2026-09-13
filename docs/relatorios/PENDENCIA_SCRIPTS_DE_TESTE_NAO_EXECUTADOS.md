# Pendência — scripts de teste ainda não executados

**Estado:** aberta.
**Aberta em:** 2026-09-13, após a varredura de dependência de `auth.uid()`.
**Ferramenta:** `npm run check:scripts-de-teste`

## O que a varredura procurou, e o que achou

O gatilho foi um defeito concreto: dois testes de mesa apontavam
`SUPABASE_ANON_KEY` para a service role key. Isso dá **privilégio** e
não dá **identidade** — `auth.uid()` fica nulo, e toda RPC que confere
identidade recusa. Como os caminhos exercitados gravam log em modo
best-effort, as recusas sumiam dentro de um `catch` e os testes
afirmavam coisas que nunca aconteceram.

A varredura foi atrás de mais casos do mesmo. Resultado, sobre os 46
scripts de `test:` / `check:` / `validate:`:

- **o padrão literal não existe em mais nenhum lugar.** Só os dois
  testes de mesa o usavam, e os dois foram corrigidos;
- **apenas 4 scripts atravessam a camada de storage do app**
  (`getScopedTableClient`), e os 3 registrados no `package.json` já
  autenticam de verdade via `dev/sessaoDeTeste.ts`. O quarto era
  `scripts/test-vtt-presets-objeto.ts`, órfão — conferido, válido (19
  critérios, todos passando) e registrado como
  `test:vtt-presets-objeto`. Ele só toca `sceneStorage.ts` por um
  `import type`, apagado em runtime;
- **nenhum outro script monta client anônimo e chama RPC**, que seria a
  outra forma de depender de `auth.uid()` sem ter;
- `validate:content` usa service role, mas só LÊ. Sem dependência de
  identidade.

**Conclusão: não restou nenhum teste a corrigir por esse motivo.**

## O que foi executado

**37 dos 47 verificados.** Em três levas:

- os 12 INERTES (não escrevem, não abrem navegador) — todos passam;
- os 13 que a auditoria marcava como escrita e a análise de chamadas
  inocentou — todos passam (ver abaixo);
- os 12 já exercitados ao longo desta frente (os três de storage/mesa
  corrigidos e os nove checks do catálogo de cenas).

Mais `check:vtt-imagens-servidor`, executado depois de conferir a
limpeza: **35 de 35** depois dos consertos descritos abaixo.

## O que NÃO foi executado, e por quê

Os 10 de navegador. Executá-los tem efeito sobre o mundo **através da
interface**, e não há ambiente descartável onde rodá-los.

### Escrevem no banco — RESOLVIDO

A análise de chamadas foi feita sobre os 14. O sinal decisivo não é o
import: é se o script **constrói um client do Supabase**. Sem client
não há conexão, e sem conexão não há escrita.

**13 dos 14 não constroem client nenhum.** Importam só funções puras
(`normalize*`, `derive*`, `resolve*`, `install*`) de
`src/lib/character` e `src/lib/content`. Eram todos falsos positivos de
barril, como se suspeitava.

Dois pareceram suspeitos numa segunda passada e não eram:
`tableRealtime.ts` e `derived.ts` casavam com a busca por causa de
`seen.delete(existing)` e `resolving.delete(id)` — `Set.delete()`, não
escrita em tabela.

Os 13 foram executados. **Todos passam.**

O único que escreve de verdade é `check:vtt-imagens-servidor`. A
limpeza dele foi conferida antes de executar: roda num `.finally()` da
cadeia principal, apaga campanhas e usuários criados, e não toca no
storage (trabalha só no nível do banco). Executado — e ver abaixo.

### Dirigem navegador (10 não verificados)

```
check:admin-biblioteca   check:admin-content-drafts  check:admin-effect-builder
check:admin-publication  check:admin-legacy-conversion
check:admin-composite-effects check:admin-temporary-effects
check:admin-inventory-runes-market check:admin-companions-trama
check:motion
```

Estes escrevem **através da interface** — criar rascunho, publicar
conteúdo — e precisam do dev server mais a sessão salva por
`auth:save-session`. Rodá-los às cegas contra a produção publicaria
conteúdo de verdade.

Vale notar que `check:admin-biblioteca` não importa `playwright`
diretamente: importa `authSession.ts`, que importa. Um classificador
que olhasse só a primeira camada o chamaria de inofensivo.

## Fechado: os critérios 26 e 27 de `check:vtt-imagens-servidor`

**Resolvido.** O check está em 35 de 35. Ver a seção seguinte para o
que estava errado — e para o defeito de banco que ele revelou.

## O que estava errado nos critérios 26 e 27 (histórico)

O check estava travando no critério 3 — "jogador reserva retrato do
PRÓPRIO token" — com "Sem permissão sobre este token". A causa era o
FIXTURE, não o código: ele nunca criava linha em `vtt_campaign_stage`.
Desde a 0111 "onde o jogador está" é o palco, e a 0112 plantou
`vtt_pode_interagir_cena` dentro de `can_move_vtt_token`. Sem palco, o
jogador não está em cena nenhuma e perde permissão até sobre o próprio
token. Nada no caminho de imagens havia mudado.

Criada a linha de palco, o check foi de "trava no 3" para **32 ok, 1
falha**.

A falha que resta é o critério 26: esconder a colocação (`visivel =
false`) deveria tirar a assinatura do jogador, e não tira.

A primeira hipótese — de que o arquivo tinha dois usos e o ramo do
retrato seguia concedendo — estava ERRADA. Isolar os assets não
consertou nada, o que a derrubou.

A causa real: **o RPC que esconde a colocação estava sendo RECUSADO, e
o caso não conferia o erro.** A colocação seguia visível e o critério
media o estado anterior, reportando como se tivesse testado a guarda.

A recusa vem de um defeito no banco: a 0110 acrescentou uma sobrecarga
de `atualizar_vtt_scene_image` com 13 parâmetros (`p_centro_q`,
`p_centro_r`) e **a de 11, da 0100, nunca foi removida**. Chamar com 11
faz o PostgREST responder "Could not choose the best candidate
function". O app sempre manda os 13, então nunca esbarrou — ver a
pendência abaixo.

Três consertos, todos pedidos e todos verificados:

1. **assets separados** para o fundo e o retrato do token. O arquivo de
   fundo é criado pelo caminho real (reserva + finalize como tile) e a
   colocação temporária é removida, deixando um arquivo existente e sem
   uso — que é o que o caso 18 precisa. Sem isso, o critério media a
   SOMA de dois caminhos de concessão, não a guarda que nomeia;
2. **o caso 27 MESCLA `camadas`** em vez de substituir o JSON. A versão
   anterior apagava todas as outras camadas junto — inclusive a de
   tokens — e passava por efeito somado;
3. **um critério 26a novo** confere que a colocação REALMENTE ficou
   escondida antes de julgar a assinatura. É o que teria denunciado o
   problema no dia em que ele apareceu.

Sensibilidade verificada nos dois: neutralizando a guarda de cada um
(não esconder a colocação; não esconder a camada), o critério
correspondente falha.

## Aberto: sobrecarga duplicada de `atualizar_vtt_scene_image`

A 0100 criou a função com 11 parâmetros; a 0110 criou uma com 13 e
deixou a primeira viva. O PostgREST não escolhe entre as duas quando a
chamada traz só os 11 comuns:

```
Could not choose the best candidate function between:
  atualizar_vtt_scene_image(… 11 parâmetros)
  atualizar_vtt_scene_image(… 13 parâmetros)
```

**O produto não está quebrado:** `imageActions.ts` sempre manda os 13,
então resolve sem ambiguidade. Quem quebra é qualquer chamador que
omita `p_centro_q`/`p_centro_r` — foi o que aconteceu com este teste,
por dois meses, em silêncio.

O conserto é uma migration de uma linha:

```sql
drop function if exists public.atualizar_vtt_scene_image(
  uuid, integer, numeric, numeric, numeric, numeric, text, integer,
  boolean, boolean, boolean);
```

Não foi aplicado: é mudança de schema em produção, e derrubar uma
função é irreversível sem recriá-la. Fica para decisão.

## Bloqueados: os 10 testes de navegador

```
check:admin-biblioteca             check:admin-content-drafts
check:admin-effect-builder         check:admin-publication
check:admin-legacy-conversion      check:admin-composite-effects
check:admin-temporary-effects      check:admin-inventory-runes-market
check:admin-companions-trama       check:motion
```

**Estado: BLOQUEADOS por falta de ambiente descartável.** Não foram
executados e não devem ser executados contra produção: escrevem através
da interface — criar rascunho, publicar conteúdo — e o que publicarem
fica publicado.

O que falta para desbloquear é um ambiente onde errar não custe nada.
`scripts/dev/replay-ambiente.sh` chega perto: monta um Postgres com
todas as migrations aplicadas. Mas os checks precisam do app inteiro
respondendo em `localhost:3000` contra esse banco, e para isso o stack
de serviços do Supabase teria de subir — o que não acontece nesta
máquina (o Node das imagens de serviço dá SIGSEGV sob o Docker Desktop
29.7.2 em arm64; ver o cabeçalho do `replay-ambiente.sh`).

Caminhos possíveis, nenhum barato:

1. destravar o stack local — trocar a versão do Docker Desktop ou as
   imagens, e conferir se o segfault some;
2. um projeto Supabase descartável na nuvem, com as migrations
   aplicadas, e um `.env` alternativo para os checks;
3. aceitar que são checks manuais, rodados de propósito contra um
   ambiente escolhido a dedo, e tirá-los da expectativa de automação.

`npm run check:scripts-de-teste` garante o mínimo continuamente: que
todos CONSEGUEM começar, e o que cada um faz com o mundo.

## Relacionado

- `docs/relatorios/PENDENCIA_CICLO_DE_VIDA_PERSONAGEM_SOLTO.md`
