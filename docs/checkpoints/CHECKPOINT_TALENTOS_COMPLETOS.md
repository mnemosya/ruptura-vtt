# Checkpoint — Talentos operacionais (status real de integração)

Trabalho de operacionalização dos 66 talentos (22 árvores × 3 níveis) sobre o
capítulo canônico `docs/fontes/11 TALENTOS 7610a1363552827da5f001dccc05111e.md`.

## Status REAL de integração mecânica (honesto — não confundir categoria de UI com implementação)

A classificação por padrão (abaixo) é infraestrutura de UI. O que segue é o estado
de integração MECÂNICA REAL nos fluxos do VTT, apurado por auditoria dos fluxos
(`applyMarginBasedAttackDamage`/`/dev/table`, `resolveDamageWithMitPd`, `getActionCost`,
`useOverloadSurge`, `castSpell`, `inventario[]`):

**Mecânica real já integrada (altera valor/estado real):**
- **12 talentos "Automático" com `modificador`** — o bônus numérico já entra na
  rolagem real via `deriveActiveEffectsFromTalents` → `ActiveEffect` (mesmo pipeline
  de condições). Ex.: Aparar +1 em Aparar, Blindagem +1 em Bloquear, Olhar Penetrante,
  Passo Fantasma, Sede de Sangue (toggle → efeito temporário com modificador). Estes
  alteram o prompt de rolagem de verdade.
- **Domínio Territorial (Mago N1)** — multiplica de fato o alcance/área exibido das
  magias de ataque (+50%), verificado no browser (10 → 15 metros).
- **Ascensão (Mago N3)** — eleva de fato o limite diário de Surtos de Sobrecarga de 3
  para 5 (data-driven), no gate real de uso e no display; verificado no browser (3 → 5).
  Decisão canônica: a Ruptura acompanha o novo limite (5º surto).

**Ainda infraestrutura (categoria + botão + cadência + log/oportunidade, SEM regra
específica conectada ao fluxo) — pendente de integração real:**
- Assassino (Hemorragia/Executar/Lâmina Oculta), Dissecador, Berserker (Fúria auto-stack,
  Último Fôlego intercept), Guardião (anular dano/cobertura), Paramédico (Pronto-socorro,
  Protocolo), Espadachim (Estocar/Ripostar), Mago (Canalizar mana↔dano), Artífice
  (Toque de Midas na instância), Rúnico, e todos os subsistemas (Mirar/Furtividade,
  dados de gatilho, drone/robô/Trama, Mercado).

### Blockers de correção encontrados (por que não foi feito em massa sem inventar regra)

1. ~~Combate é resolvido no lado do narrador...~~ — **RESOLVIDO**: `talentsIniciais` e
   `itemsIniciais` agora chegam em `/dev/table` (Hemorragia/Executar provam o padrão);
   cada árvore restante (Dissecador/Berserker/Espadachim/Guardião/Paramédico) ainda precisa
   da integração específica no painel, mas a infraestrutura cross-record já existe.
2. **Ações de cura não têm tag `cura` no conteúdo** (`db_acoes_combate`), então Ritmo de
   Campo não pode identificar "ação de cura" sem inventar taxonomia.
3. **Limite de Sobrecarga está acoplado ao gatilho de Ruptura do 3º surto** em
   `useOverloadSurge` (`terceiro = indice >= maxPerDay`); Ascensão elevar o limite a 5
   moveria a Ruptura do 3º para o 5º surto — alteração de regra não confirmada pelo capítulo.

Esses pontos precisam ou de desacoplamento cuidadoso por fluxo ou de esclarecimento
canônico — não de uma engine genérica.

---

## Tabela 66/66 — status REAL de implementação mecânica

Legenda: **✅ Integral** (validado pelo usuário — só aplicável após confirmação
explícita de testes manuais, nunca autodeclarado) · **🔵 Implementado** (aguardando
validação manual — mecânica-núcleo conectada ao fluxo real, mas ainda sem
confirmação do usuário) · **🟡 Parcial** (parte da mecânica real feita, resto
pendente) · **📖 Narrativo rastreado** (atividade com formulário/estado/log) ·
**⚙️ Infra pendente** (só classificação/badge/botão/cadência/log/lembrete — SEM
regra específica no fluxo).

> **Regra dura**: nenhum talento é marcado ✅ Integral sem confirmação explícita do
> usuário sobre testes manuais realizados. Em 2026-07-12 esta tabela foi corrigida:
> vários itens antes marcados ✅ Integral por autodeclaração do assistente foram
> rebaixados para 🔵 Implementado ou 🟡 Parcial, conforme o caso.

Contagem: ✅ 0 · 🔵 18 · 🟡 6 · ⚙️ 41 · 📖 1.

| Árvore | Nível | Nº | Status real |
| --- | --- | --- | --- |
| Artífice | Bricolagem | 1 | 🔵 Implementado (aguardando validação manual) |
| Artífice | Toque de Midas | 2 | 🔵 Implementado (aguardando validação manual) |
| Artífice | Gambiarra Expressa | 3 | 📖 Narrativo rastreado |
| Assassino | Lâmina Oculta | 1 | 🔵 Implementado (aguardando validação manual) |
| Assassino | Hemorragia | 2 | 🔵 Implementado (aguardando validação manual) |
| Assassino | Executar | 3 | 🔵 Implementado (aguardando validação manual) |
| Atirador de Elite | 1 Tiro, 1 Acerto | 1 | 🔵 Implementado (aguardando validação manual) |
| Atirador de Elite | À Espreita | 2 | 🔵 Implementado (aguardando validação manual) |
| Atirador de Elite | Headshot | 3 | 🔵 Implementado (aguardando validação manual) |
| Berserker | Fúria | 1 | 🔵 Implementado (aguardando validação manual) |
| Berserker | Sede de Sangue | 2 | 🟡 Parcial |
| Berserker | Último Fôlego | 3 | ⚙️ Infra pendente |
| Dissecador | Golpe Cirúrgico | 1 | ⚙️ Infra pendente |
| Dissecador | Fincada | 2 | ⚙️ Infra pendente |
| Dissecador | Contra-medida | 3 | ⚙️ Infra pendente |
| Droneiro | Sinal Limpo | 1 | ⚙️ Infra pendente |
| Droneiro | Script | 2 | ⚙️ Infra pendente |
| Droneiro | Enxame | 3 | ⚙️ Infra pendente |
| Espadachim | Aparar | 1 | 🟡 Parcial |
| Espadachim | Estocar | 2 | ⚙️ Infra pendente |
| Espadachim | Ripostar | 3 | ⚙️ Infra pendente |
| Estrategista | Falcão | 1 | ⚙️ Infra pendente |
| Estrategista | Briefing de Campo | 2 | ⚙️ Infra pendente |
| Estrategista | Imposição de Ritmo | 3 | ⚙️ Infra pendente |
| Guardião | Sentinela | 1 | ⚙️ Infra pendente |
| Guardião | Blindagem | 2 | 🔵 Implementado (aguardando validação manual) |
| Guardião | Muralha | 3 | ⚙️ Infra pendente |
| Mago de Batalha | Domínio Territorial | 1 | 🔵 Implementado (aguardando validação manual) |
| Mago de Batalha | Canalizar | 2 | 🔵 Implementado (aguardando validação manual) |
| Mago de Batalha | Ascensão | 3 | 🔵 Implementado (aguardando validação manual) |
| Malabarista | Saque Fantasma | 1 | 🟡 Parcial |
| Malabarista | Revoada | 2 | ⚙️ Infra pendente |
| Malabarista | Espetáculo Mortal | 3 | ⚙️ Infra pendente |
| Manipulador | Olhar Penetrante | 1 | 🔵 Implementado (aguardando validação manual) |
| Manipulador | Entrelinhas | 2 | ⚙️ Infra pendente |
| Manipulador | Puxar os Fios | 3 | ⚙️ Infra pendente |
| Mecatrônico | Chave de Arranque | 1 | ⚙️ Infra pendente |
| Mecatrônico | Marcha Dupla | 2 | ⚙️ Infra pendente |
| Mecatrônico | Overclock | 3 | ⚙️ Infra pendente |
| Mercador | Garimpo de Rua | 1 | ⚙️ Infra pendente |
| Mercador | Caderneta de Dívida | 2 | ⚙️ Infra pendente |
| Mercador | Rede de Favores | 3 | ⚙️ Infra pendente |
| Paramédico | Pronto-socorro | 1 | ⚙️ Infra pendente |
| Paramédico | Ritmo de Campo | 2 | ⚙️ Infra pendente |
| Paramédico | Protocolo de Emergência | 3 | ⚙️ Infra pendente |
| Pistoleiro | Gatilho Quente | 1 | ⚙️ Infra pendente |
| Pistoleiro | Bang Bang | 2 | ⚙️ Infra pendente |
| Pistoleiro | Showdown | 3 | ⚙️ Infra pendente |
| Praga | Marca da Dor | 1 | ⚙️ Infra pendente |
| Praga | Sangria Lenta | 2 | ⚙️ Infra pendente |
| Praga | Contágio | 3 | ⚙️ Infra pendente |
| Rato de Rua | Zé da Esquina | 1 | ⚙️ Infra pendente |
| Rato de Rua | Gato de Telhado | 2 | ⚙️ Infra pendente |
| Rato de Rua | Saída dos Fundos | 3 | ⚙️ Infra pendente |
| Rúnico | Gatilho Rúnico | 1 | 🔵 Implementado (aguardando validação manual) |
| Rúnico | Entalhe Rápido | 2 | 🟡 Parcial |
| Rúnico | Sobregravação | 3 | 🟡 Parcial |
| Sorrateiro | Passo Fantasma | 1 | 🔵 Implementado (aguardando validação manual) |
| Sorrateiro | Camuflagem Óptica | 2 | 🔵 Implementado (aguardando validação manual) |
| Sorrateiro | Ataque Fatal | 3 | 🔵 Implementado (aguardando validação manual) |
| Tecelão | Olho de Botão | 1 | ⚙️ Infra pendente |
| Tecelão | Bypass | 2 | ⚙️ Infra pendente |
| Tecelão | Agulha Fina | 3 | ⚙️ Infra pendente |
| Totem | Benção | 1 | 🟡 Parcial |
| Totem | Onda Solidária | 2 | ⚙️ Infra pendente |
| Totem | Chama Redobrada | 3 | ⚙️ Infra pendente |

### Detalhe dos não-infra

- **🔵 Gatilho Rúnico (Implementado, aguardando validação manual)** — ativar/desativar
  runa instalada sem PA, refletido de fato no `ActiveEffect` (verificado nesta sessão:
  "modificador aplicado" some/volta, ActiveStateStrip mostra "Sem estados ativos" ao
  desativar e o buff ao reativar). Pendente: confirmação do usuário via teste manual
  próprio antes de virar ✅ Integral.
- **🟡 Entalhe Rápido (Parcial)** — 1 PA real gasto (verificado 0→1), prepara teste real
  de Engenharia, só aplica a instalação em SUCESSO (verificado: resultado 3 < CD 5 não
  instala; resultado 9 ≥ CD 5 instala — 0/4 → 1/4); falha preserva item/runa e não
  devolve o PA. **Falta para ser integral**: fluxo de remoção de runa instalada, garantia
  de que um reload após falha de persistência não deixa PA/item/runa divergentes
  (preflight antes de gastar PA + mutar estado), e confirmação de que o reload da página
  preserva corretamente o resultado em todos os casos (não só o caminho feliz testado).
- **🟡 Sobregravação (Parcial)** — o modelo anterior calculava o multiplicador de slots
  ao vivo a partir dos talentos do personagem ATUAL a cada render (`multiplicador_espacos_extra`
  do payload), o que a validação manual rejeitou como implementação insuficiente: não
  distinguia dono/aliado instruído/terceiro, não sobrevivia a transferência do item entre
  personagens, e não exigia o teste de Tecnomagia/Arcanismo CD 8 para terceiros. Rework
  em andamento: campo `InventoryItemInstance.sobregravacao` (`ownerCharacterId`,
  `instructedAllyIds`, `appliedAt`) já adicionado ao tipo; falta a lógica de autorização
  (`getSlotsRunaMaxEfetivo`/ação de aplicar Sobregravação/confirmação de teste CD 8 para
  terceiro) e a atualização do display em `InventoryTab.tsx`.
- **🔵 1 Tiro, 1 Acerto (Implementado, aguardando validação manual)** — estado real de
  Mirar (Character.mirar_ativo), bônus lido do payload (+2/+3, escopado a
  precisao/balistica). Confirmar sucesso/crítico cria o estado; o próximo "Atacar" com
  arma à distância injeta a tag mirar:ativo na rolagem real (verificado: chip "1 Tiro, 1
  Acerto (sucesso) +2", Total 5+0+2=7) e marca consumido (widget mostra "Já usado nesta
  rodada"). Corrige, no caminho, um bug real: armas à distância sem `atributoAtaque` no
  catálogo caíam num ramo de fallback que perdia TODAS as tags escopadas (inclusive o +1
  de Toque de Midas em arma à distância) — agora as duas ramificações preservam as tags.
  Pendente: confirmação do usuário; À Espreita/Headshot (níveis seguintes da mesma
  árvore) ainda não implementados.
- **🔵 Passo Fantasma + Olhar Penetrante (ambos Implementado, aguardando validação
  manual — Fase 3)** — mecanismo genérico real de promoção de margem
  (`rollPericia.promocaoMargem`, data-driven de `promocao_margem.pericias[]` do payload).
  Passo Fantasma aplica direto (contexto "testes de Furtividade" já delimitado pela
  própria perícia). Olhar Penetrante agora exige confirmação EXPLÍCITA do contexto antes
  de aplicar: `getMarginPromotions` passa a expor o texto literal de `efeito.contexto`
  do payload ("Influência para distorcer percepções, convencer ou manipular" /
  "Psicologia para identificar vulnerabilidades e motivações exploráveis") e a aba
  Rolagens só soma a promoção quando o jogador marca um checkbox confirmando que O TESTE
  ATUAL se encaixa nesse contexto — não mais automática em qualquer teste de
  Influência/Psicologia. Resolve o gap identificado ("falta contexto canônico
  obrigatório"): agora é mecânica real data-driven, não hardcoded por talento (o mesmo
  checkbox de confirmação também aparece para Passo Fantasma, sem custo prático já que
  "testes de Furtividade" é sempre verdadeiro quando a perícia rolada é Furtividade).
- **🔵 À Espreita + Headshot (Atirador de Elite N2/N3, Implementado, aguardando
  validação manual — Fase 3, cross-record)** — integrados em `/dev/table`
  (`AttackResolutionPanel`), mesmo padrão de Hemorragia/Executar: leem os talentos do
  ATACANTE, checkbox só aparece quando a arma do log é à distância (`periciaAtaque`
  precisao/balistica ou desconhecida — nunca bloqueia por incerteza). À Espreita: com
  confirmação do narrador (alvo não ciente + após sucesso em Mirar), sucesso/falha
  limitada (banda "limited" do sistema de resolução de dano) sobe para banda "standard"
  (Tronco/Braços/Pernas liberados, sem modificador). Headshot: com confirmação de Mirar
  crítico, qualquer ACERTO (banda ≠ miss) vira banda "critical" (todas as regiões, +1
  dado); miss continua miss, nunca vira acerto. Compostas com Executar via
  `applyMarginBandOverrides` (função única reaproveitada nos dois pontos de cálculo —
  preview do painel e persistência real — para nunca divergir entre o que o narrador vê
  e o que é salvo).
- **🔵 Camuflagem Óptica + Ataque Fatal (Sorrateiro N2/N3, Implementado, aguardando
  validação manual — Fase 3)** — novo estado real `Character.furtividade_ativa` (active/
  source/enteredAt/plausibleCoverConfirmed/detected/exitReason), com widget na aba
  Talentos (Entrar/Encerrar Furtividade) ancorado em Passo Fantasma (N1). Camuflagem
  Óptica: botão "Confirmar ponto de cobertura plausível" marca
  `plausibleCoverConfirmed` SEM encerrar Furtividade — a linha de visão/movimento
  exposto nunca encerra automaticamente (fiel ao capítulo, que não define isso como
  gatilho de encerramento). Ataque Fatal: integrado em `/dev/table` junto com À
  Espreita/Headshot — checkbox "atacante saindo de Furtividade" força banda crítica no
  acerto (miss continua miss) e, ao aplicar o dano, encerra a Furtividade do ATACANTE de
  verdade (`endFurtividade`, persistido separadamente do alvo, mesmo padrão do consumo
  de Executar). Sem limite por cena inventado (o capítulo não declara um).
- **🔵 Hemorragia + Executar (Assassino N2/N3, Implementado, aguardando validação
  manual — cross-record)** — primeira integração REAL no lado do narrador
  (`/dev/table`), lendo os talentos do ATACANTE (talentsIniciais agora carregado em
  TableClient/page.tsx) cruzados com o alvo escolhido na resolução. Hemorragia: detecta a
  propriedade "Sangramento" na arma real do atacante (`ItemContent.propertySlugs`),
  habilita o checkbox só quando margem ≥ sucesso padrão, aplica "Sangrando" no ALVO de
  verdade via `applyGmCondition` (verificado: PV 11→5 e "Condições ativas: Sangrando" no
  personagem real). Executar: força a banda de resolução para crítica (regiões
  liberadas, MIT ignorado) mesmo com margem naturalmente "limited" (verificado: MIT 99
  digitado → dano final ainda 6; região Cabeça liberada; log "margem crítica"), exige
  confirmação manual do requisito, consome 1/cena no atacante e persiste (verificado:
  reabrir o painel mostra "já usado nesta cena", checkbox desabilitado). Setup de teste
  cruzou 2 personagens reais via 2 perfis de mesa nesta sessão — nada simulado, mas
  ainda falta a confirmação do usuário de que o bloqueio SEM requisito atendido também
  funciona corretamente (não testado explicitamente) antes de virar ✅ Integral.
- **🔵 Lâmina Oculta (Assassino N1, Implementado, aguardando validação manual — Fase 4,
  cross-record)** — integrado no mesmo painel de resolução de `/dev/table`. Reposicionamento
  (3m, sem custo de PA) em sucesso padrão+: reminder real no log quando o narrador confirma
  "alvo não percebe a presença" e a banda resultante é standard/critical — mecânica bem
  definida, sem ambiguidade. Promoção falha_limitada→sucesso_limitado: o sistema de bandas
  de dano (`resolveMarginBand`) só distingue "miss" (margem negativa) de "limited" (margem
  0–1) — não separa falha_limitada de falha_crítica dentro do miss (essa granularidade não
  existe no capítulo de Combate codificado). Em vez de inventar um corte numérico não
  confirmado, a segunda confirmação ("esta falha é limitada, não crítica") é um julgamento
  explícito do narrador — mesmo critério já usado para "alvo não percebe presença" em
  outros talentos — e só então promove a banda de miss para limited (Tronco liberado, -1
  no dano). Nenhum limite de uso por cena/rodada foi inventado (o capítulo não declara um).
- **🔵 Bricolagem (Implementado, aguardando validação manual)** — atividade "Examinar
  ponto vulnerável" real: formulário (tipo/alvo/
  falha/perícia) sem teste; bônus consumível escopado por tag sintética `bricolagem:<id>`,
  só aplicado no teste disparado pelo botão "Rolar teste relacionado" (com confirmação
  "este teste explora a falha?"), nunca em outra rolagem (verificado: chip some ao trocar
  perícia manualmente; chip aparece e soma +1→9 no teste correto; some por completo após
  consumido). **Correção de bug encontrada e corrigida**: o modificador +1 desse nível
  seria pego pelo pipeline INCONDICIONAL de `deriveActiveEffectsFromTalents` (aplicaria
  sempre, a qualquer teste de Engenharia/Robótica) — excluído explicitamente quando o
  nível também declara `detectar_falha_sem_teste` (payload-driven, não hardcoded por nome).
- **📖 Gambiarra Expressa** — atividade narrativa 1/sessão real: formulário completo
  (alvo/material/criação-modificação/efeito/duração/observações), registra os 5 minutos e
  ausência de teste estendido, cria estado ativo com Encerrar manual, gate 1/sessão
  (reset manual do narrador — sem gatilho canônico de nova sessão) verificado bloqueando
  reaquisição mesmo após encerrar o efeito ativo.
- **🔵 Domínio Territorial (Implementado, aguardando validação manual — Fase 5)** —
  multiplica alcance/área na aba Magias (+50%, já existia) E agora também no LOG real de
  conjuração (`handleCastSpell`/`handleCastSpellWithFusion`): quando o multiplicador do
  talento ≠ 1, o log mostra "alcance X (Domínio Territorial, base Y)" — fecha o gap
  anterior ("falta usar o valor ajustado... nos logs de conjuração"). Reaproveita
  `applyRangeAreaMultiplierToText` (mesma função já usada no cartão da aba Magias) — nunca
  duplica a lógica de reescala.
- **🔵 Toque de Midas (Implementado, aguardando validação manual)** — efeito real na
  instância (1/dia — controlado por timestamp de aplicação/ação manual "Novo dia (só
  talentos)", **não** equiparado automaticamente a descanso longo — não há regra
  canônica confirmada dessa equivalência para este talento especificamente; 1h de
  duração). Arma: +1 ataque entra de fato na rolagem de "Atacar" via tag sintética
  `item:<instanceId>` (verificado: chip "Toque de Midas — Adaga +1", total somado 8→9),
  escopado só a ESSA arma (desarmado/outra arma não recebe). Armadura: MIT-base vs MIT
  ajustado exibidos e usados (4→6). Escudo: PD-base e PD-temporário são POOLS
  SEPARADOS — `applyShieldDamage` consome o temporário primeiro (verificado: dano 4 →
  3 do temporário + 1 do base). Ferramenta/dispositivo: perícia escolhida na aplicação,
  +1 entra na rolagem real via o mesmo mecanismo de tag (verificado: chip "+1", perícia
  auto-selecionada). `isItemTemporaryEffectActive` ignora o efeito IMEDIATAMENTE ao
  vencer (mesmo antes de `expireItemTemporaryEffects` rodar) — confirmado por script:
  MIT volta a 4 no instante do vencimento, `active:false` só depois da limpeza, PD/MIT-
  base nunca tocados. Expiração agora também verificada ao preparar ataque
  (`handleRollAction`), além de ao carregar personagem, com log. Transferência ao
  bando/retorno preserva o campo (spread completo da instância; `canSplitInstanceQuantity`
  bloqueia split parcial com efeito ativo, força instância inteira). Verificado nesta
  sessão: aplicar→salvar→reload de página real→"Carregar"→4 cards intactos. Pendente:
  confirmação do usuário via teste manual próprio antes de virar ✅ Integral.
- **🔵 Ascensão (Implementado, aguardando validação manual)** — limite de Surtos 3→5
  real + Ruptura especial idempotente ao adquirir (não reduz Integridade, não conta em
  cálculos futuros), exibida à parte e logada. Pendente: confirmação do usuário.
- **🔵 Canalizar (Implementado, aguardando validação manual — Fase 5)** — Potencializar
  real (gasta Mana, +1 dano/Mana, 1/rodada, já existia). Amortecer agora também real,
  integrado em `/dev/table` (`handleResolveAttackDamage`, cross-record): o narrador
  digita quanto Mana o ALVO gasta, reduz o dano BRUTO 1:1 ANTES de MIT/PD (nunca depois),
  respeita o gate 1/rodada COMPARTILHADO com Potencializar (`CANALIZAR_USAGE_KEY` —
  usar um bloqueia o outro na mesma rodada, como o payload descreve "1 das opções
  abaixo"), clampa ao Mana real disponível do alvo e persiste a dedução no MESMO
  `updateCharacter` que aplica o dano. **Limitação conhecida**: só integrado no painel de
  ataque FÍSICO; o painel de resolução de dano MÁGICO (`SpellAttackResolutionPanel`) tem
  handler próprio e ainda não recebeu o mesmo Amortecer — dano mágico contra um alvo com
  Canalizar não amortece ainda.
- **Árvore Mago de Batalha, em geral** — as 3 níveis (Domínio Territorial, Canalizar,
  Ascensão) estão agora 🔵 Implementado (aguardando validação manual).
- **🔵 Blindagem (Implementado, aguardando validação manual — Fase 5)** — +1 em Bloquear
  real (já existia). "Anular todo o dano" agora real, integrado em `/dev/table`
  (`handleResolveAttackDamage`): checkbox do lado do ALVO zera o dano bruto ANTES de
  qualquer outro cálculo (inclusive Amortecer, que fica irrelevante quando já não há
  dano), 1/cena, nunca toca PD/escudo nem consome Mana — exatamente "nada é aplicado ao
  escudo, ao defensor ou ao aliado" do capítulo.
- **🟡 Sede de Sangue** — −1 defensivas real (toggle→efeito, já existia); **ainda falta**
  dobrar o bônus de Corpo no dano corpo a corpo (o sistema não tem um cálculo automático
  de "dano + bônus de Corpo" para dobrar — dano é sempre digitado manualmente pelo
  narrador, então dobrar exigiria ou uma calculadora nova de dano corpo a corpo, ou um
  lembrete com o valor exato a somar; nenhum dos dois foi feito ainda) e monitorar PV
  (auto-desligar ao passar de 50%).
- **🔵 Fúria (Implementado, aguardando validação manual — Fase 5)** — efeito temporário
  empilhável real agora GANHA pilha automaticamente ao sofrer dano de verdade
  (`handleResolveAttackDamage`, `finalDamage > 0` → `+1 Luta`, até o máximo do payload,
  `stackingMode: "stack"` nunca duplica registro). Duração usa `durationType: "rounds"`
  com 1 rodada restante como a aproximação mais fiel disponível a "até o fim do PRÓXIMO
  turno" — o sistema só rastreia duração por RODADA (fim de rodada global), não por turno
  individual por personagem; não foi inventado um rastreador de turno novo só para este
  talento.
- **⚙️ Espadachim › Aparar (parte manual pendente)** — +1 em Aparar continua real via
  ActiveEffect (já existia). A promoção manual 1/cena (sucesso padrão em Aparar → sucesso
  crítico) tem os helpers prontos (`getApararPromocaoAvailability`/
  `markApararPromocaoUsed`, `lib/character/talentEngine.ts`) mas AINDA NÃO estão
  conectados a nenhuma UI — Aparar é resolvido como `DefenseType` dentro do fluxo de
  defesa de `/dev/table` (`handleRollDefense`), um caminho de código diferente do usado
  pelas outras promoções de margem desta sessão; conectar exige entender esse fluxo
  específico, não feito ainda por tempo. Infra pronta, não é implementação real ainda —
  status intencionalmente não elevado.
- **⚙️ Paramédico › Pronto-socorro (parte manual pendente)** — mesma situação do Aparar:
  helpers prontos (`getProntoSocorroAvailability`/`markProntoSocorroUsed`) mas não
  conectados a uma ação real de estabilizar aliado a 0 PV — isso exigiria integrar com o
  sistema existente de colapso/estabilização (`character.colapso`, `regras?.colapso`) que
  não foi auditado nesta sessão. Não promovido.
- **🟡 Saque Fantasma / Totem Benção** — parte passiva real; promoção de margem pendente.
- **Infraestrutura de autoria estruturada (Fase 6)** — `ActiveCondition` ganhou
  `sourceCharacterId`/`sourceTalentId`/`sourceType`/`originalTargetId`/`applicationEventId`
  (todos opcionais — condições antigas/manuais continuam válidas sem eles).
  `applyGmCondition` aceita um 4º parâmetro `authorship` opcional para gravar essa
  autoria; Hemorragia (`/dev/table`) já foi migrada para usá-lo. **Ainda não usado por**
  Praga (Sangria Lenta/Contágio) — ambos exigiriam também um MODELO DE DURAÇÃO numérico
  em `ActiveCondition` (hoje `duracao` é texto livre, "não é contador automático" por
  design — não há campo para "+1 rodada" incrementar), que é uma mudança de schema maior
  do que esta sessão cobriu. Marca da Dor (Praga N1) exigiria o ATACANTE consultar as
  condições do ALVO antes de rolar o teste de ataque — a rolagem de ataque acontece na
  ficha do próprio jogador (`RollsTab`), que hoje não lê o estado de OUTROS personagens;
  automatizar isso exigiria um seletor de alvo na tela de rolagem, não construído.
- **Manipulador › Entrelinhas/Puxar os Fios, Totem › Onda Solidária/Chama Redobrada,
  Estrategista (todos os 3 níveis) — não implementados nesta sessão.** Entrelinhas
  poderia reaproveitar o MESMO padrão de tag sintética de Bricolagem/Toque de Midas (bônus
  +2 escopado ao próximo teste de Influência contra o alvo descoberto), mas não houve
  tempo nesta sessão para construir o formulário/estado/wiring completo — permanece
  ⚙️ Infra pendente, não Parcial (nada foi de fato conectado ao fluxo real ainda).



## Como cada talento opera

Todo nível adquirido é classificado pela engine (`classifyTalentEffect`,
`src/lib/character/talentEngine.ts`) em um dos 4 padrões, direto do payload
canônico — nunca de lista manual:

- **Automático** — modificador de rolagem / troca de atributo / modificador
  estrutural aplicado direto no fluxo (soma no prompt de rolagem via
  `ActiveEffect`, mesmo mecanismo de condições/defesa).
- **Contextual** — dispara em gatilho de evento (sofrer dano, crítico, inimigo
  erra, chegar a 0 PV, aplicar efeito). Surge como oportunidade rastreada,
  resolvida com o narrador; buffs/toggles estruturados viram `TemporaryEffect`.
- **Atividade própria** — botão "Usar talento" com usos/cadência canônica, custo
  de PA e log; o efeito mecânico é resolvido manualmente (nunca inventado).
- **Narrativo rastreado** — atividade narrativa com contador de cadência, logada
  e resolvida com o narrador.

Nenhum talento permanece só como descrição. Passivos não têm botão, mas aparecem
marcados como operacionais e alteram o fluxo aplicável.

## Contagem por padrão

| Padrão | Níveis |
| --- | --- |
| Automático | 12 |
| Contextual | 27 |
| Atividade própria | 27 |
| Narrativo rastreado | 10 |

(Total de marcações > 66 porque níveis com efeitos mistos recebem mais de um padrão.)

## Tabela final (66 níveis)

| Árvore | Nível | Nº | Padrão(ões) operacional(is) |
| --- | --- | --- | --- |
| Artífice | Bricolagem | 1 | Automático |
| Artífice | Toque de Midas | 2 | Atividade própria |
| Artífice | Gambiarra Expressa | 3 | Narrativo rastreado |
| Assassino | Lâmina Oculta | 1 | Contextual |
| Assassino | Hemorragia | 2 | Contextual |
| Assassino | Executar | 3 | Atividade própria |
| Atirador de Elite | 1 Tiro, 1 Acerto | 1 | Contextual |
| Atirador de Elite | À Espreita | 2 | Contextual |
| Atirador de Elite | Headshot | 3 | Contextual |
| Berserker | Fúria | 1 | Contextual |
| Berserker | Sede de Sangue | 2 | Contextual |
| Berserker | Último Fôlego | 3 | Contextual |
| Dissecador | Golpe Cirúrgico | 1 | Automático + Contextual |
| Dissecador | Fincada | 2 | Contextual |
| Dissecador | Contra-medida | 3 | Contextual |
| Droneiro | Sinal Limpo | 1 | Contextual + Atividade própria |
| Droneiro | Script | 2 | Contextual |
| Droneiro | Enxame | 3 | Atividade própria |
| Espadachim | Aparar | 1 | Automático + Atividade própria |
| Espadachim | Estocar | 2 | Atividade própria |
| Espadachim | Ripostar | 3 | Contextual |
| Estrategista | Falcão | 1 | Narrativo rastreado |
| Estrategista | Briefing de Campo | 2 | Narrativo rastreado |
| Estrategista | Imposição de Ritmo | 3 | Automático + Contextual |
| Guardião | Sentinela | 1 | Automático + Contextual |
| Guardião | Blindagem | 2 | Automático + Atividade própria |
| Guardião | Muralha | 3 | Automático |
| Mago de Batalha | Domínio Territorial | 1 | Atividade própria |
| Mago de Batalha | Canalizar | 2 | Atividade própria |
| Mago de Batalha | Ascensão | 3 | Atividade própria |
| Malabarista | Saque Fantasma | 1 | Automático |
| Malabarista | Revoada | 2 | Atividade própria |
| Malabarista | Espetáculo Mortal | 3 | Atividade própria |
| Manipulador | Olhar Penetrante | 1 | Contextual |
| Manipulador | Entrelinhas | 2 | Narrativo rastreado |
| Manipulador | Puxar os Fios | 3 | Narrativo rastreado |
| Mecatrônico | Chave de Arranque | 1 | Contextual + Atividade própria |
| Mecatrônico | Marcha Dupla | 2 | Atividade própria |
| Mecatrônico | Overclock | 3 | Atividade própria |
| Mercador | Garimpo de Rua | 1 | Atividade própria |
| Mercador | Caderneta de Dívida | 2 | Narrativo rastreado |
| Mercador | Rede de Favores | 3 | Narrativo rastreado |
| Paramédico | Pronto-socorro | 1 | Atividade própria |
| Paramédico | Ritmo de Campo | 2 | Automático |
| Paramédico | Protocolo de Emergência | 3 | Contextual |
| Pistoleiro | Gatilho Quente | 1 | Atividade própria |
| Pistoleiro | Bang Bang | 2 | Automático + Atividade própria |
| Pistoleiro | Showdown | 3 | Atividade própria |
| Praga | Marca da Dor | 1 | Contextual |
| Praga | Sangria Lenta | 2 | Contextual |
| Praga | Contágio | 3 | Contextual |
| Rato de Rua | Zé da Esquina | 1 | Narrativo rastreado |
| Rato de Rua | Gato de Telhado | 2 | Narrativo rastreado |
| Rato de Rua | Saída dos Fundos | 3 | Narrativo rastreado |
| Rúnico | Gatilho Rúnico | 1 | Atividade própria |
| Rúnico | Entalhe Rápido | 2 | Atividade própria |
| Rúnico | Sobregravação | 3 | Atividade própria |
| Sorrateiro | Passo Fantasma | 1 | Automático + Contextual |
| Sorrateiro | Camuflagem Óptica | 2 | Automático |
| Sorrateiro | Ataque Fatal | 3 | Contextual |
| Tecelão | Olho de Botão | 1 | Atividade própria |
| Tecelão | Bypass | 2 | Atividade própria |
| Tecelão | Agulha Fina | 3 | Atividade própria |
| Totem | Benção | 1 | Contextual + Atividade própria |
| Totem | Onda Solidária | 2 | Contextual |
| Totem | Chama Redobrada | 3 | Contextual |
