# Triagem da suíte de verificação — 20/09/2026 (TEST-01)

Gerada por `node scripts/dev/triar-checks.mjs`, teto de 180s por script.

## Resultado

| | |
|---|---:|
| **Passam** | 38 |
| **Falham** | 55 |
| **Travam** | 1 |
| **Total** | 94 |

**Menos de 40% da suíte funciona.** Não é "alguns checks defasados": a maior
parte da verificação automatizada deste projeto não verifica nada hoje.

Correção de um número que dei antes: cheguei a relatar "1 em 12". Aquela amostra
eram os doze primeiros em ordem alfabética, todos do bloco `check-admin-*`, que
falham em conjunto. O quadro real é bem melhor que 8% — e ainda assim ruim.

## Quem passa (38)

Os que passam se concentram no que foi escrito ou reparado recentemente. Todos
os 16 checks criados nesta leva de trabalho estão aqui, e também os de segurança
e autorização do VTT, que são os mais antigos a nunca terem quebrado.

- `check-admin-biblioteca.ts`
- `check-aparecer-offline-live.ts`
- `check-aparecer-offline.mjs`
- `check-campaign-online-session.mjs`
- `check-campaign-session-timeout-ui.mjs`
- `check-campaign-session-timeout.mjs`
- `check-campanha-sessao-online-live.ts`
- `check-carteira-inventario.ts`
- `check-charge-aneis.ts`
- `check-chat-catalogo.mjs`
- `check-console-modo-evolucao.ts`
- `check-console-moldura.ts`
- `check-criacao-rapida-pj.ts`
- `check-dados-camada.ts`
- `check-dashboard-participantes-live.ts`
- `check-dashboard-participantes.mjs`
- `check-iconografia-marcacao.ts`
- `check-migrations-vs-banco.mjs`
- `check-organizador-live.ts`
- `check-perfil-de-usuario.mjs`
- `check-perfil-rede-live.ts`
- `check-reconciliacao-posicao-token.ts`
- `check-refresh-token-dedup.ts`
- `check-registro-de-sessao.mjs`
- `check-registro-sessao-live.ts`
- `check-residuo-de-fixtures.ts`
- `check-session-refresh-middleware.ts`
- `check-vtt-areas-desempenho.ts`
- `check-vtt-areas-seguranca-rpc.mjs`
- `check-vtt-autorizacao.ts`
- `check-vtt-canal-forjado.ts`
- `check-vtt-cenas-seguranca.mjs`
- `check-vtt-coleta-confirmacao.ts`
- `check-vtt-gerenciamento-tokens.ts`
- `check-vtt-imagens-servidor.ts`
- `check-vtt-medicoes.ts`
- `check-vtt-objetos-servidor.ts`
- `check-vtt-projecao-direcao-remoto.mjs`

## Quem trava (1)

`check-campanha-fase4-gameplay.ts` — esperando um `data-testid` que não existe
mais. Este é o que motivou o teto de tempo: ficou mais de meia hora preso antes
de eu interromper, porque cada espera do Playwright tem timeout próprio e elas
se somam.

## Quem falha (55)

- `check-admin-companions-trama.ts` — falha (código 1)
- `check-admin-composite-effects.ts` — falha
- `check-admin-content-drafts.ts` — falha
- `check-admin-effect-builder.ts` — falha
- `check-admin-inventory-runes-market.ts` — falha (AssertionError [ERR_ASSERTION]: Raridade deveria persistir a)
- `check-admin-legacy-conversion.ts` — falha
- `check-admin-publication.ts` — falha
- `check-admin-temporary-effects.ts` — falha (código 1)
- `check-campaign-session-presence.mjs` — falha (AssertionError [ERR_ASSERTION]: Expected values to be strict)
- `check-campaign-shell-drawer.ts` — falha
- `check-campanha-admin-fase5.ts` — falha
- `check-campanha-casca-fase2.ts` — falha
- `check-campanha-painel-turndock-fase3.ts` — falha
- `check-campanha-presence-fase3b.ts` — falha (código 1)
- `check-campanha-provider-fase1.ts` — falha
- `check-campanha-wizard-fase6.ts` — falha
- `check-console-abertura.ts` — falha (código 1)
- `check-console-baseline.ts` — falha (código 1)
- `check-console-rolagem-visual.ts` — falha (código 1)
- `check-conteudo-narrativo.mjs` — falha (AssertionError [ERR_ASSERTION]: Dono de outra campanha não v)
- `check-dados-lado-direito.ts` — falha (código 1)
- `check-ficha-mesa-integracao.ts` — falha (código 1)
- `check-fichaheader-portal-fix.ts` — falha
- `check-motion.ts` — falha
- `check-realtime-auth-renovacao.ts` — falha
- `check-redesign-densidade.ts` — falha (código 1)
- `check-replay-vs-remoto.mjs` — falha
- `check-tokens-selecao-multipla.ts` — falha (10 ok, 1 falha)
- `check-vtt-alca-rotacao.ts` — falha
- `check-vtt-animacao-movimento.ts` — falha
- `check-vtt-apresentar-cena.ts` — falha (código 1)
- `check-vtt-areas-cor-opacidade.ts` — falha (código 1)
- `check-vtt-areas-ux-r5.ts` — falha (código 1)
- `check-vtt-areas.ts` — falha
- `check-vtt-arquivo-e-duplicacao.ts` — falha (código 1)
- `check-vtt-camadas-visuais.ts` — falha
- `check-vtt-catalogo-cenas.ts` — falha (código 1)
- `check-vtt-ciclo-cena.ts` — falha (código 1)
- `check-vtt-dividir-grupo-ui.ts` — falha (código 1)
- `check-vtt-dividir-grupo.ts` — falha (public)
- `check-vtt-gerenciador-token-ux.ts` — falha (código 1)
- `check-vtt-integracao.ts` — falha
- `check-vtt-invalidacao-concorrencia.ts` — falha (public)
- `check-vtt-janelas-ferramenta.ts` — falha (código 1)
- `check-vtt-modal-diagnostico.ts` — falha (código 1)
- `check-vtt-movimento-consultivo.ts` — falha (11 ok, 1 falha)
- `check-vtt-painel.ts` — falha
- `check-vtt-pastas-ui.ts` — falha (código 1)
- `check-vtt-pastas.ts` — falha (código 1)
- `check-vtt-pegada-reparo.ts` — falha
- `check-vtt-posicionamento-visual.ts` — falha (código 1)
- `check-vtt-rodadas.ts` — falha
- `check-vtt-rolagem-real.ts` — falha (código 1)
- `check-vtt-sincronizacao-live.ts` — falha (código 1)
- `check-vtt-troca-ferramenta.ts` — falha (código 1)

## Como ler os motivos

`código 1` e `falha` sem detalhe significam que o script terminou com erro sem
imprimir contagem reconhecível — a maioria morre numa asserção ou num seletor
que mudou de nome, e o detalhe está na saída completa de cada um.

## O que fazer com isto

A tarefa não é "consertar 55 scripts". É passar por eles decidindo, um a um,
entre **três** destinos:

1. **Consertar** — o comportamento verificado ainda é desejado e o check só
   envelheceu (rota, seletor, assinatura de RPC).
2. **Apagar** — verifica tela ou fluxo que não existe mais. Um check morto que
   ninguém apaga é pior que nenhum: ele aparece na lista e dá a impressão de
   cobertura.
3. **Reescrever** — o comportamento mudou de forma e o check descreve a versão
   antiga.

Sem essa triagem individual, `npm run check:*` continua sendo um conjunto onde
não se sabe o que é regressão e o que é ruína.

## Cuidado operacional

Matar um script antes da limpeza dele deixa contas e campanhas no Supabase. Esta
execução não deixou resíduo (varredura confirmou zero), mas isso foi sorte da
ordem em que as coisas morreram. Depois de qualquer triagem:

```bash
npx tsx scripts/dev/varrer-residuo-de-teste.ts --apply
```
