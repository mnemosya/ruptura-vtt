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
  autenticam de verdade via `dev/sessaoDeTeste.ts`. O quarto,
  `scripts/test-vtt-presets-objeto.ts`, não está registrado no
  `package.json` — é órfão, e vale decidir se entra ou sai;
- **nenhum outro script monta client anônimo e chama RPC**, que seria a
  outra forma de depender de `auth.uid()` sem ter;
- `validate:content` usa service role, mas só LÊ. Sem dependência de
  identidade.

**Conclusão: não restou nenhum teste a corrigir por esse motivo.**

## O que foi executado

Os 11 classificados como INERTES — não escrevem no banco e não abrem
navegador. Todos passam:

```
validate:content          test:content-read         test:action-console
test:reactions            test:end-round-conditions test:technical-library
test:realtime-publication test:ammunition           test:canonical-schema
check:scripts-de-teste    test:vtt-imagens
```

Somados aos 12 já exercitados ao longo desta frente de trabalho
(os três de storage/mesa corrigidos e os nove checks do catálogo de
cenas), são **23 dos 46 verificados**.

## O que NÃO foi executado, e por quê

Os 23 restantes não foram rodados porque **executá-los tem efeito sobre
o mundo** e a auditoria não consegue provar, lendo, que eles limpam o
que criam.

### Escrevem no banco (14 não verificados)

```
test:active-effects    test:end-round-indicators  test:collapse
test:escalpos          test:technical-effects     test:defense
test:integrity-fallback test:realtime-minimal     test:attack-resolution
test:talents           test:inventory             test:spells
test:console           check:vtt-imagens-servidor
```

**Ressalva importante:** essa marca segue o grafo de imports, e o grafo
passa por barris. `src/lib/character/index.ts` reexporta `storage.ts`,
então um teste que importe o barril só para usar uma função pura
aparece como "escreve" sem nunca escrever. `test:defense` é exatamente
isso — zero escrita própria, importa o barril por causa de
`resolveDamageWithMitPd`. Vários da lista devem ser o mesmo caso.

Distinguir exigiria análise de chamadas, não de imports. O erro é para
o lado seguro: manda conferir a mais, nunca a menos.

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

## O caminho para fechar isto

Por ordem de custo:

1. **Os falsos positivos de barril.** Conferir um a um quais dos 14 de
   fato escrevem. Os que não escrevem passam a INERTES e podem rodar
   sempre. Suspeita: a maioria.
2. **Os que escrevem de verdade.** Confirmar que cada um monta cenário
   descartável e limpa em `finally`, como os checks do catálogo de
   cenas fazem. Os que não limparem precisam disso antes de entrar em
   qualquer rotina automática.
3. **Os de navegador.** Decidir se rodam contra um ambiente
   descartável em vez da produção. Hoje não existe esse ambiente — o
   replay (`scripts/dev/replay-ambiente.sh`) chega perto, mas o stack
   de serviços não sobe nesta máquina (ver o cabeçalho daquele script).

Enquanto 1 e 2 não acontecerem, `npm run check:scripts-de-teste` é o
que garante o mínimo: que todos CONSEGUEM começar.

## Relacionado

- `docs/relatorios/PENDENCIA_CICLO_DE_VIDA_PERSONAGEM_SOLTO.md`
