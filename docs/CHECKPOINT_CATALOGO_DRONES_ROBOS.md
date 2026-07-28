# Checkpoint — Catálogo oficial de drones e robôs consumido pela ficha

## Escopo

Publica o catálogo oficial de drones e robôs na Biblioteca do Sistema
(pipeline oficial/homebrew/override já existente, `content_type`
genérico) e conecta a ficha (Droneiro/Mecatrônico) a ele. **Não**
inclui formulário de criação/edição dedicado no admin
(`CamposCompanionModelSection.tsx`) — fica para uma fase posterior; a
edição via draft genérico do Editor Universal (`CamposEditaveis`)
também não foi estendida a este tipo, por não ter draft-form ainda.

A execução bespoke dos talentos (`registerDrone`, `registerRobo`,
`pairDronesEnxame`, `activateOverclock`) continua com a mesma lógica de
sempre — este checkpoint só troca "texto livre digitado pelo jogador"
por "seleção a partir de um catálogo real", e corrige o modelo de dados
do bônus de Sinal Limpo.

**Fonte dos dados**: `docs/fontes/DRONES E ROBÔS 7a00a13635528396b33501c34c719d2a.md`
(versionado nesta fase) — 5 modelos de drone, 5 de robô, 5 runas
específicas.

## 1. `companion_model` no Editor Universal

- `supabase/migrations/0050_add_companion_model_content_type.sql` —
  `alter type content_type add value if not exists 'companion_model'`,
  aplicada ao projeto Supabase real.
- `src/lib/content/types.ts` — `companion_model` na união `ContentType`.
- `src/lib/contentSchema/contentTypeRegistry.ts` — nova entrada
  (`modoArmazenamento: "collection"`, `colecaoChave:
  "modelos_companheiros"`, `secoesAplicaveis: ["identificacao",
  "classificacao", "texto", "mercado"]`, `statusAdapter: "implementado"`,
  com observação explícita sobre a ausência do formulário admin nesta
  fase).
- `src/lib/contentSchema/adapters/companionModel.ts` (novo) +
  dispatch em `adapters/index.ts` — projeta o payload bruto
  (`slug/nome/categoria/raridade/preco/alcance_controle/cd_operar/
  atributos/pd_maximo/pa_maximo/acoes/cd_ser_percebido/
  habilidade_especial/descricao_curta`) para o envelope canônico
  (`classificacao`), sem interpretar `acoes[]` como efeito mecânico —
  o catálogo é só fonte de dados para a UI preencher, nunca um
  executor.
- `src/lib/campaignContent/resolveEffectiveContent.ts` —
  `listCompanionModelsEffective(campaignId)`, mesmo padrão de
  `listRunesEffective`/`listCapitulosEffective` (oficial > override de
  campanha > homebrew, cai para oficial puro sem `campaignId`).

### Ajuste de tipos necessário para suportar override/homebrew

`DraftContentType` (5 tipos com formulário de rascunho: spell/talent/
item/rune/capitulo) não inclui `companion_model` — corretamente, já
que não há draft-form para este tipo nesta fase. Mas
`CampaignContentDocumentRow.content_type`/`CampaignContentChangelogRow.
content_type`/`ConteudoEfetivo.contentType` (lado de LEITURA) estavam
tipados como `DraftContentType`, o que impediria `companion_model` de
passar pelo resolvedor efetivo (override/homebrew). Esses 3 campos e
as funções de leitura correspondentes (`listCampaignContentDocumentsPublic`,
`getCampaignContentDocumentPublic`, `listCampaignContentDocumentsForOwner`,
`listCampaignChangelog`) foram alargados para o `ContentType` amplo —
puramente um ajuste de tipo (as funções já faziam só comparação de
string, sem branch por tipo). `findCampaignDraftBySlug` (rascunho,
tipo-acoplado ao formulário) permanece `DraftContentType`, sem mudança.
2 sites que comparavam `e.contentType`/`doc.content_type` contra
funções de rascunho (`BibliotecaCampanhaClient.tsx`,
`campaignContentServerActions.ts`) precisaram de um cast explícito de
volta a `DraftContentType` — são páginas/ações que só operam sobre os 5
tipos com draft-form mesmo, então o cast é seguro (nunca alcançável com
`companion_model` na prática).

## 2. Runas — só informativas (declarado, não um "quase automático")

`content/db_runas_drones_robos_v1.json` — 5 runas (Autorreparo,
Camuflagem, Alcance, Interferência, Energia), reaproveitando
`content_type: "rune"` (schema já existente) — não é um pacote de
schema novo. `restricao_subtipo: "drone_robo"` é um campo REAL e já
existente em `CHAVES_TOPO_MAPEADAS` de `adapters/rune.ts` (não uma
propriedade ignorada). `payload_automacao.efeitos: []`
DELIBERADAMENTE — aparecem na Biblioteca, mas não têm instalação nem
execução automática em nenhuma instância de drone/robô; puramente
referência textual para o narrador aplicar manualmente. Slugs
prefixados `runa_drone_*` (nunca colidem com as runas de arma/armadura
existentes).

## 3. Catálogo de modelos — tabela de conferência fonte → payload

Todos os campos abaixo foram transcritos lendo o documento fonte na
íntegra — nenhum valor estimado, nenhum campo ausente na fonte foi
inventado.

| Campo | Origem na fonte | Observação |
|---|---|---|
| `nome`/`categoria`/`raridade`/`preco` | Tabela-resumo + cabeçalho de cada modelo | 1:1, todos os 10 |
| `cd_operar` | "(CD N)" no cabeçalho | 1:1 |
| `alcance_controle` | "Alcance: X" | Texto (m/km) |
| `atributos.mente`/`.corpo` | "Mente: N"/"Corpo: N" | `.corpo` só em robôs |
| `pd_maximo` | "PD: N" | 1:1 — fonte não define PV nem MIT do drone/robô; **não fazem parte do schema** |
| `pa_maximo` | "Ações (3 PA)"/"(5 PA)" | **Só existe nos 5 robôs** — drones não têm esse stat na fonte, campo ausente, nunca zerado |
| `acoes[].nome/custoPA/descricao` | Lista "Ações:" (deslocamento embutido na própria ação) | Ações do tipo "Esquivar (Reação)" não têm custo de PA na fonte — `custoPA` omitido nesses itens, nunca inventado como 0 |
| `cd_ser_percebido` | "CD para ser percebido: 10" | **Só Drone Mosca** |
| `habilidade_especial` | "Frenesi das Lâminas (1x por cena)" | **Só Robô Ceifador** — modifica a ação Atacar, não é uma ação própria com custo de PA |
| `descricao_curta` | Parágrafo descritivo abaixo do nome de cada modelo | Transcrito literalmente, não é resumo editorial novo |

`content/db_companion_models_v1.json` — 10 entradas (5 drones: Mosca,
Reconhecimento, Reparador, Assalto Leve, Assalto Pesado; 5 robôs:
Carga, Patrulha, Suporte, Combate, Ceifador).

## 4. Seed idempotente

`scripts/seed-content.ts`: `"companion_model"` adicionado à união local
`ContentType` + 2 entradas em `SOURCES` (companion_model → `
modelos_companheiros`; rune adicional → `runas_drones_robos`, mesmo
`content_type` "rune" da fonte principal, arquivo/coleção diferentes).

Rodado **duas vezes** contra o Supabase real
(projeto `yvxoijexyhjjipjktfuu`):

- 1ª execução: `created=15` (10 companion_model + 5 rune), `updated=0`.
- 2ª execução: `created=0`, `updated=0`, `sem_mudanca=450` — confirma
  idempotência (nenhum changelog novo gerado ao reimportar sem
  mudança).
- Verificado por SQL direto (não só a contagem do script): os 10
  slugs de `companion_model` e os 5 `runa_drone_*` existem,
  `status='published'`, `dup_count=1` cada (sem duplicata por
  `(content_type, slug)`).
- `get_advisors` (security): nenhuma novidade associada a
  `companion_model`/`content_documents` — a migration é só `ALTER
  TYPE`, sem impacto de RLS/policy.

## 5. Redesenho do bônus de Sinal Limpo (achado técnico confirmado por leitura do payload real)

Payload real (`content/db_talentos_normalizado_v1_3.json`,
`droneiro_sinal_limpo`) tem 2 efeitos independentes: `promocao_margem`
(Robótica: falha limitada → sucesso limitado — **já tratado**
genericamente por `getMarginPromotions`, não tocado nesta fase) e
`companheiro_pa_bonus` (`alvo: "drone_sob_controle"`, `pa_bonus: 1`,
`duracao: "rodada_atual"`, 1x/cena).

O 2º efeito é o que mudou de lugar. Antes: `applySinalLimpoBonus`
gravava `+1` direto em `DroneInstance.paAtual`/`paMaximo` — mas drone
nunca teve PA próprio de verdade (confirmado por leitura de TODOS os
consumidores: só 2 pontos de escrita, 1 de leitura só-exibição; o PA
checado de verdade sempre foi `estado_jogo.pa_gastos` do PERSONAGEM).

**Redesenho**: `DroneInstance` perde `paAtual`/`paMaximo` por completo
(nunca existiram de verdade). `Character` ganha
`sinal_limpo_bonus_ativo?: { droneId: string } | null` — mesmo padrão
de "token ativo" já usado por `bencao_token_ativo`/`falcao_token_ativo`.

- `applySinalLimpoBonus`: grava o uso em `talentos_estado.usos` (sem
  mudança) e seta `sinal_limpo_bonus_ativo: { droneId }` — nunca mais
  toca em `character.drones`.
- `expireDroneRoundBonuses` → renomeado `expireSinalLimpoBonus`: limpa
  `sinal_limpo_bonus_ativo` para `null`, devolve `expiredDroneNome`
  (busca o nome do drone pelo id antes de limpar, só para preservar a
  mesma mensagem de log). Call site em `CharacterSheetClient.tsx`
  ajustado (variável renomeada, log condicional em vez de `.map` sobre
  array).

**Limitação explícita, documentada e verificada como tal**: não existe
hoje (nem esta fase cria) um executor de ações de controle de drone —
por isso a garantia de "não pode ser usado em outro drone"/"não paga
ação comum" é só de EXIBIÇÃO (o bônus aparece vinculado ao `droneId`
certo, nunca misturado ao pool de PA do personagem). O gasto em si
continua **assistido/manual**. A verificação abaixo confirma o ESTADO
(token existe, contém o `droneId` certo, não altera `DroneInstance`,
não altera `pa_gastos`, expira, não acumula, 1x/cena) — não confirma
bloqueio mecânico de uso indevido, que não existe para confirmar.

## 6. `modeloSlug` como identidade real

Único consumidor de igualdade por `.modelo` em todo o código:
`pairDronesEnxame` (`talentEngine.ts`). Alterado para comparar
`(d.modeloSlug ?? d.modelo)` dos dois lados — usa o slug estável quando
presente, cai para o nome textual só em instâncias antigas sem
`modeloSlug`.

`modeloSlug` é o único campo que garante identidade/pareamento;
`modelo`/`acoes` da instância são um SNAPSHOT materializado no momento
do registro (preenchido a partir do catálogo, mas editável) — renomear
o modelo PUBLICADO depois não atualiza instâncias já registradas
(comportamento esperado, não testado como bug) nem quebra a referência
por `modeloSlug`.

## 7. UI — `TalentsTab.tsx`

- `DroneRosterWidget`/`RoboRosterWidget` ganham prop `companionModels`
  (filtrada por categoria em `TalentsTab`) — `<select>` no lugar do
  `<input>` de modelo; ao escolher, grava `modeloSlug` + `modelo`
  (nome do catálogo) e preenche `acoes` formatado (`nome (custoPA
  PA): descrição`, sem `(N PA)` para reações sem custo definido na
  fonte) — texto continua editável depois de preenchido.
- Drone: **nenhum campo/exibição de PA** em lugar nenhum (formulário e
  roster). Robô: `paMaximo` pré-preenchido a partir do catálogo
  (`pa_maximo`), exibido no próprio `<option>` do select.
- Indicador do Sinal Limpo (`sinal_limpo_bonus_ativo`) aparece só na
  linha do drone certo: "⚡ Sinal Limpo ativo — +1 PA do operador
  disponível para controlar este drone nesta rodada."
- Plumbing: `CharacterSheetView.tsx` busca
  `listCompanionModelsEffective(campaignId)` (mesmo padrão de
  `listRunesEffective`) → normaliza via `normalizeCompanionModel`
  (novo, `src/lib/character/companionModels.ts`) →
  `CharacterSheetClient.tsx` → `TalentsTab`.

## 8. Verificação em navegador real (não só leitura de código)

Fixture: personagem novo em `/dev/character-sheet`, Modo Evolução,
talentos **Sinal Limpo** (Droneiro N1) e **Chave de Arranque**
(Mecatrônico N1) adquiridos de verdade pela UI.

- Select de drone popula com os 5 modelos reais (`Drone Mosca`, `Drone
  de Reconhecimento`, `Drone Reparador`, `Drone de Assalto Leve`,
  `Drone de Assalto Pesado`); select de robô com os 5 reais, cada
  `<option>` mostrando `(PA N)` vindo do catálogo (`Robô de Carga (PA
  3)` ... `Robô Ceifador (PA 5)`).
- Registrado drone "Zangão" com modelo "Drone Mosca": ações
  auto-preenchidas ("Deslocar-se (1 PA): 12 m, caminhada e voo;
  Transmitir (1 PA): imagem e som"); roster mostra "Zangão (Drone
  Mosca) — inativo/ativo" **sem nenhum campo de PA** em lugar nenhum.
- Assumido controle do drone (estado → "ativo").
- Aplicado Sinal Limpo: indicador "⚡ Sinal Limpo ativo — +1 PA do
  operador disponível para controlar este drone nesta rodada"
  apareceu vinculado à linha do Zangão; "Sinal Limpo já usado nesta
  cena (+1 PA)" (1x/cena respeitado); aba Recursos confirmou **PA:
  3/3** inalterado (o bônus nunca entra no pool bruto de PA do
  personagem, só é exibido como recurso restrito).
- "Encerrar Rodada Manual": rodada avançou de 1→2, log mostrou "Sinal
  Limpo: +1 PA de Zangão expirou no fim da rodada" (nome do drone
  preservado corretamente por `expiredDroneNome`); indicador some da
  UI; "Sinal Limpo já usado nesta cena" permanece (não reseta por
  rodada, só por cena — correto).
- `npx tsc --noEmit` e `npm run build`: limpos, antes e depois de
  todas as mudanças de tipo.

### Não verificado em navegador nesta rodada (limitação documentada)

- Registro de robô de fato (só o select/PA pré-preenchido foi
  confirmado visualmente; o fluxo completo de `onRegisterRobo` já
  segue o mesmo caminho testado do drone, sem lógica nova além do
  `modeloSlug`/`paMaximo` vindos do catálogo).
- Pareamento de Enxame por `modeloSlug` com 2+ drones reais (exige
  registrar múltiplos drones do mesmo modelo) e resolução de
  override/homebrew de campanha (exige fixture de campanha com
  narrador e draft — infraestrutura mais pesada) — verificados por
  leitura de código (comparação `d.modeloSlug ?? d.modelo` nos dois
  lados; resolvedor efetivo genérico já testado para os outros 4
  tipos), não por interação real em navegador nesta rodada.

## Commits desta fase

- Migration + registry/adapter/resolver + seed JSONs + wiring de
  `seed-content.ts` + ajuste de tipos de campaign content.
- Tipos de personagem (`DroneInstance`/`RoboInstance`/
  `sinal_limpo_bonus_ativo`) + `talentEngine.ts` + normalizador
  `companionModels.ts` + plumbing View→Client→TalentsTab + UI dos
  widgets.
- Documental: versiona `docs/fontes/DRONES E ROBÔS....md` (fonte dos
  10 modelos + 5 runas) e este checkpoint.

## Status

Catálogo oficial de drones e robôs publicado e consumido pela ficha —
execução bespoke dos talentos inalterada, Sinal Limpo redesenhado para
viver no operador (nunca no drone), `modeloSlug` como identidade
estável para pareamento. Limitações explícitas: sem formulário
admin dedicado para este tipo; enforcement mecânico do gasto de Sinal
Limpo continua assistido/manual (depende de um futuro executor de
ações de controle de drone); Enxame/override não exercitados em
navegador nesta rodada (só por leitura de código).
