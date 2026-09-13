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
limpeza: 32 de 33 critérios.

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

## Aberto: o critério 26 de `check:vtt-imagens-servidor`

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

A explicação provável é que o mesmo arquivo tem DOIS usos — ele é o
retrato do token do jogador (critério 12) e também o fundo da cena
(critério 18). `vtt_asset_assinavel_para` (0114) tem um ramo para
retrato de token visível, com a justificativa escrita na própria
migration: "ver o token é ver a cara dele". Escondido o fundo, esse
ramo continuaria concedendo — e o critério 26 assumiria que a colocação
é o único caminho até o arquivo.

**Mas há uma inconsistência que impede fechar o diagnóstico:** o
critério 27, que esconde a CAMADA inteira, devolve `false`. Se o ramo
do retrato concedesse sempre, 27 falharia junto. Suspeita: o `update`
do 27 substitui o objeto `camadas` inteiro
(`{ imagemFundo: { … } }`), apagando a configuração da camada de
tokens junto — e 27 estaria passando pela razão errada.

Resolver exige decidir a intenção: um retrato de token deve continuar
assinável quando a colocação dele na cena é escondida? A 0114 diz que
sim. Se for isso, o critério 26 é que está velho. Não mexi porque é
julgamento sobre intenção, não sobre mecânica.

## O caminho para fechar o resto

1. **Os de navegador (10).** Decidir se rodam contra um ambiente
   descartável em vez da produção. Hoje não existe esse ambiente — o
   replay (`scripts/dev/replay-ambiente.sh`) chega perto, mas o stack
   de serviços não sobe nesta máquina (ver o cabeçalho daquele script).
2. **O critério 26**, acima.

`npm run check:scripts-de-teste` garante o mínimo continuamente: que
todos CONSEGUEM começar, e o que cada um faz com o mundo.

## Relacionado

- `docs/relatorios/PENDENCIA_CICLO_DE_VIDA_PERSONAGEM_SOLTO.md`
