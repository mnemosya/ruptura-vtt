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
- Berserker (Último Fôlego intercept), Guardião (anular dano/cobertura), Paramédico
  (Pronto-socorro, Protocolo), Espadachim (Estocar/Ripostar), Mago (Canalizar mana↔dano),
  Rúnico, e todos os subsistemas (Mirar/Furtividade, dados de gatilho, drone/robô/Trama,
  Mercado). Este parágrafo é um snapshot histórico anterior às Fases 1–2 (2026-07-12) —
  a tabela abaixo é a fonte de verdade atual, não esta lista.

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

Contagem: ✅ 0 · 🔵 46 · 🟡 0 · ⚙️ 19 · 📖 1.

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
| Berserker | Sede de Sangue | 2 | 🔵 Implementado (aguardando validação manual) |
| Berserker | Último Fôlego | 3 | 🔵 Implementado (aguardando validação manual) |
| Dissecador | Golpe Cirúrgico | 1 | 🔵 Implementado (aguardando validação manual) |
| Dissecador | Fincada | 2 | 🔵 Implementado (aguardando validação manual) |
| Dissecador | Contra-medida | 3 | 🔵 Implementado (aguardando validação manual) |
| Droneiro | Sinal Limpo | 1 | ⚙️ Infra pendente |
| Droneiro | Script | 2 | ⚙️ Infra pendente |
| Droneiro | Enxame | 3 | ⚙️ Infra pendente |
| Espadachim | Aparar | 1 | 🔵 Implementado (aguardando validação manual) |
| Espadachim | Estocar | 2 | 🔵 Implementado (aguardando validação manual) |
| Espadachim | Ripostar | 3 | 🔵 Implementado (aguardando validação manual) |
| Estrategista | Falcão | 1 | 🔵 Implementado (aguardando validação manual) |
| Estrategista | Briefing de Campo | 2 | 🔵 Implementado (aguardando validação manual) |
| Estrategista | Imposição de Ritmo | 3 | 🔵 Implementado (aguardando validação manual) |
| Guardião | Sentinela | 1 | 🔵 Implementado (aguardando validação manual) |
| Guardião | Blindagem | 2 | 🔵 Implementado (aguardando validação manual) |
| Guardião | Muralha | 3 | 🔵 Implementado (aguardando validação manual) |
| Mago de Batalha | Domínio Territorial | 1 | 🔵 Implementado (aguardando validação manual) |
| Mago de Batalha | Canalizar | 2 | 🔵 Implementado (aguardando validação manual) |
| Mago de Batalha | Ascensão | 3 | 🔵 Implementado (aguardando validação manual) |
| Malabarista | Saque Fantasma | 1 | 🔵 Implementado (aguardando validação manual) |
| Malabarista | Revoada | 2 | ⚙️ Infra pendente |
| Malabarista | Espetáculo Mortal | 3 | ⚙️ Infra pendente |
| Manipulador | Olhar Penetrante | 1 | 🔵 Implementado (aguardando validação manual) |
| Manipulador | Entrelinhas | 2 | 🔵 Implementado (aguardando validação manual) |
| Manipulador | Puxar os Fios | 3 | 🔵 Implementado (aguardando validação manual) |
| Mecatrônico | Chave de Arranque | 1 | ⚙️ Infra pendente |
| Mecatrônico | Marcha Dupla | 2 | ⚙️ Infra pendente |
| Mecatrônico | Overclock | 3 | ⚙️ Infra pendente |
| Mercador | Garimpo de Rua | 1 | 🔵 Implementado (aguardando validação manual) |
| Mercador | Caderneta de Dívida | 2 | ⚙️ Infra pendente |
| Mercador | Rede de Favores | 3 | ⚙️ Infra pendente |
| Paramédico | Pronto-socorro | 1 | 🔵 Implementado (aguardando validação manual) |
| Paramédico | Ritmo de Campo | 2 | 🔵 Implementado (aguardando validação manual) |
| Paramédico | Protocolo de Emergência | 3 | 🔵 Implementado (aguardando validação manual) |
| Pistoleiro | Gatilho Quente | 1 | 🔵 Implementado (aguardando validação manual) |
| Pistoleiro | Bang Bang | 2 | 🔵 Implementado (aguardando validação manual) |
| Pistoleiro | Showdown | 3 | ⚙️ Infra pendente |
| Praga | Marca da Dor | 1 | 🔵 Implementado (aguardando validação manual) |
| Praga | Sangria Lenta | 2 | 🔵 Implementado (aguardando validação manual) |
| Praga | Contágio | 3 | 🔵 Implementado (aguardando validação manual) |
| Rato de Rua | Zé da Esquina | 1 | ⚙️ Infra pendente |
| Rato de Rua | Gato de Telhado | 2 | ⚙️ Infra pendente |
| Rato de Rua | Saída dos Fundos | 3 | ⚙️ Infra pendente |
| Rúnico | Gatilho Rúnico | 1 | 🔵 Implementado (aguardando validação manual) |
| Rúnico | Entalhe Rápido | 2 | 🔵 Implementado (aguardando validação manual) |
| Rúnico | Sobregravação | 3 | 🔵 Implementado (aguardando validação manual) |
| Sorrateiro | Passo Fantasma | 1 | 🔵 Implementado (aguardando validação manual) |
| Sorrateiro | Camuflagem Óptica | 2 | 🔵 Implementado (aguardando validação manual) |
| Sorrateiro | Ataque Fatal | 3 | 🔵 Implementado (aguardando validação manual) |
| Tecelão | Olho de Botão | 1 | ⚙️ Infra pendente |
| Tecelão | Bypass | 2 | ⚙️ Infra pendente |
| Tecelão | Agulha Fina | 3 | ⚙️ Infra pendente |
| Totem | Benção | 1 | 🔵 Implementado (aguardando validação manual) |
| Totem | Onda Solidária | 2 | ⚙️ Infra pendente |
| Totem | Chama Redobrada | 3 | ⚙️ Infra pendente |

### Detalhe dos não-infra

- **🔵 Gatilho Rúnico (Implementado, aguardando validação manual)** — ativar/desativar
  runa instalada sem PA, refletido de fato no `ActiveEffect` (verificado nesta sessão:
  "modificador aplicado" some/volta, ActiveStateStrip mostra "Sem estados ativos" ao
  desativar e o buff ao reativar). Pendente: confirmação do usuário via teste manual
  próprio antes de virar ✅ Integral.
- **🔵 Entalhe Rápido (Implementado, aguardando validação manual — Fase 1, 2ª rodada)** —
  instalar E remover reais, 1 PA gasto, teste real de Engenharia, só aplica em SUCESSO
  (verificado: resultado 3 < CD 5 não instala; resultado 9 ≥ CD 5 instala — 0/4 → 1/4);
  falha preserva item/runa e não devolve o PA. **Corrigido nesta rodada**: a tentativa
  pendente (`entalheAttempts`) vivia só em `useState` local — um reload no meio do fluxo
  (PA já gasto, teste ainda não confirmado) perdia o registro sem devolver o PA e sem
  permitir confirmar depois. Movido para `Character.entalhe_rapido_tentativas`
  (persistido como qualquer outro estado de talento em andamento), com PA e tentativa
  aplicados num ÚNICO update atômico (nunca diverge). Preflight (bloqueia 2ª tentativa
  pendente + checa limite de slots antes de gastar PA) preservado.
- **🔵 Sobregravação (Implementado, aguardando validação manual — Fase 1, 2ª rodada)** —
  autorização real persistida na instância (`ownerCharacterId`/`instructedAllyIds`/
  `multiplicador`/`accessGrantedCharacterIds`): dono e aliados instruídos acessam os
  slots extra automaticamente; terceiro vê só o limite base até passar no teste de
  Tecnomagia/Arcanismo CD 8 (`getSlotsRunaMaxEfetivo` recalcula para quem está segurando
  o item AGORA); falha no teste bloqueia só o benefício, nunca as runas já instaladas.
  **Bug real encontrado e corrigido nesta rodada**: `canSplitInstanceQuantity` não
  incluía `sobregravacao` na lista de estados que forçam transferência da instância
  INTEIRA (só verificava `toqueDeMidas`) — um item com Sobregravação aplicada mas ainda
  sem runas instaladas podia ser dividido parcialmente, e a metade movida perdia a
  autorização silenciosamente (o `movedInstance` da divisão parcial não copia
  `sobregravacao`). Corrigido: Sobregravação agora bloqueia split parcial, mesmo
  critério de Toque de Midas.
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
- **🔵 Sede de Sangue (Implementado, aguardando validação manual — Fase 1, 2ª rodada)** —
  −1 defensivas real (toggle→efeito, já existia). **Concluído nesta rodada**: ativação
  agora exige de fato PV < metade do máximo (`isPvGatedToggleAllowedToActivate`, lido do
  `condicao_ativacao.tipo === "pv_abaixo_metade"` do payload — genérico, não hardcoded
  por talento); desliga sozinho quando o PV volta a ≥ metade, checado nos 3 pontos reais
  de mudança de PV (edição manual em Recursos, uso de item de cura, "Restaurar ao
  máximo" — `enforcePvGatedToggleDeactivation`); dobro de Corpo no dano corpo a corpo
  exposto como reminder EXATO em `/dev/table` ao resolver o ataque (`+X extra`, X = Corpo
  atual do personagem, lido ao vivo — nunca fixo), já que o sistema não tem uma
  calculadora de dano automática para dobrar por dentro (dano é sempre digitado pelo
  narrador). Fim de cena já herdado do `durationType: "scene"` genérico do toggle.
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
- **🔵 Saque Fantasma (Implementado, aguardando validação manual — Fase 1, 2ª rodada)** —
  "saque sem PA" já era de graça nesta engine (trocar/equipar item nunca teve custo de PA
  estruturado — nada a bypassar). A parte real que faltava era a penalidade de Rajada
  (−1): adicionado um checkbox genérico "Usar Rajada" na aba Rolagens (novo mecanismo de
  base, já que a propriedade Rajada não tinha NENHUM gancho no código antes) que aplica
  −1 ao teste; com Saque Fantasma adquirido, um segundo checkbox de confirmação ("é uma
  arma leve de Arremesso") cancela a penalidade — arma leve+Arremesso não é um booleano
  consultável no catálogo, então a confirmação é manual, mesmo critério de outras
  confirmações desta sessão.
- **🔵 Totem Benção (Implementado, aguardando validação manual — Fase 1, 2ª rodada)** —
  o payload não tem `pericias[]` (aplica a QUALQUER teste que aplique efeito positivo,
  não uma perícia fixa), então a promoção usa um checkbox avulso na aba Rolagens
  ("confirmo que este teste aplica um efeito positivo") em vez do mecanismo de
  `marginPromotions` por perícia. Segundo efeito (token 1/cena a um aliado) implementado
  de verdade: `Character.bencao_token_ativo` concedido a um aliado ATIVO da mesa (mesmo
  padrão cross-character de `useItemOnAlly` — persiste o alvo primeiro), consumido no
  PRIMEIRO teste do aliado depois da concessão (com ou sem promoção real, conforme o
  texto canônico).
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
- **🔵 Gatilho Quente (Pistoleiro N1, Implementado, aguardando validação manual — Fase
  7) + 🟡 Bang Bang (Parcial)** — recurso real de dados de gatilho:
  `getGatilhoQuenteAvailability` soma o total base (payload `dados: 3`) com qualquer
  `aumentar_recurso` de nível superior (Bang Bang, +1 → pool real vira 4, refletido
  automaticamente sem hardcode), contador de uso via `talentos_estado.usos` cadência
  "descanso_longo" (nova cadência canônica agora resetada em `handleApplyLongRest`, além
  de "dia"). Widget na aba Talentos: jogador informa o d8 físico rolado junto com o teste
  — resultado 8 soma dano extra igual à Balística ATUAL (lido de `character.pericias`,
  nunca fixo); qualquer outro resultado só consome o dado. Bang Bang permanece Parcial: o
  +1 dado (`aumentar_recurso`) já soma na pool real; o "segundo disparo com +1 PA e −1"
  (`segundo_disparo`) não foi implementado — exigiria detectar "usar o dado de gatilho E
  escolher o resultado dele no teste" no meio da resolução de ataque, não construído.
- **🔵 Garimpo de Rua (Mercador N1, Implementado, aguardando validação manual — Fase
  8)** — desconto real de -20% na Loja: toggle "Ativar desconto de hoje" (1/dia, cadência
  "dia" — mesma reset já usada por Toque de Midas/Novo Dia/descanso longo, nenhuma
  infraestrutura nova) recalcula `precoDe()` em TODOS os itens da loja enquanto ativo
  (percentual lido do payload `desconto_loja.percentual`, nunca hardcoded 20). "Sempre
  sabe onde/quando será o próximo Mercado Noturno" e "avaliar mercadoria sem teste"
  continuam sem gancho de automação (não há um sistema de "próximo mercado agendado" nem
  "adulteração de item" no conteúdo hoje) — só a parte de preço, que é a única
  estruturada com um valor numérico real, foi automatizada.
- **⚙️ Mercador › Caderneta de Dívida / Rede de Favores, Rato de Rua (todos os 3
  níveis) — não implementados nesta sessão.** Caderneta de Dívida exigiria um modelo de
  dívida novo (saldo devido, quem cobra, quando) que não existe no personagem hoje.
  Rede de Favores e as três habilidades de Rato de Rua (Zé da Esquina, Gato de Telhado,
  Saída dos Fundos) já são classificadas como "Narrativo rastreado" pelo motor genérico
  (`classifyTalentEffect`, têm botão + contador de uso automático), mas nenhuma ganhou o
  formulário estruturado específico (like Gambiarra Expressa's alvo/material/efeito) que
  o padrão desta sessão usa para contar como Implementado — permanecem no nível de
  infraestrutura genérica, não uma mecânica desta sessão.
- **⚙️ Droneiro, Mecatrônico, Tecelão (todos os 9 níveis) — auditados nesta sessão
  (Fase 9), não implementados.** Auditoria real de subsistema existente (não conclusão
  por botão genérico): buscado por qualquer traço de modelo de drone, robô ou Trama em
  `src/lib/character/types.ts` e em todo o motor de talentos — **não existe nenhum**.
  Droneiro/Mecatrônico inteiros dependem de um roster de drones/robôs (identidade, PV/PA
  próprios, estado de ativação, alvo de comandos) que simplesmente não tem campo nenhum
  no personagem hoje; Tecelão depende de um sistema de Trama/hacking (grid de Nós/
  Bloqueios, RAM, protocolos Sondar/Avançar/Apagar Rastros, estado de Detecção) igualmente
  inexistente. `classifyTalentEffect` já rotula os efeitos `familia: "companheiro"`/
  `"trama"` como "atividade" — isso é só a CATEGORIA de UI, não uma implementação; conectar
  de verdade exigiria primeiro construir o modelo de dados do zero (schema de
  drone/robô/Trama, CRUD, persistência, UI própria em `/dev/character-sheet` e
  possivelmente `/dev/table` para o narrador ver os companheiros) — um recurso novo do
  tamanho de um checkpoint próprio, não uma automação de talento sobre infraestrutura já
  existente como as demais 57 árvores desta sessão. Marcar qualquer um desses 9 níveis
  como Implementado sem esse modelo seria exatamente o tipo de "botão genérico" que a
  instrução desta sessão proibiu explicitamente.
- **Malabarista (todos os 3 níveis) — não implementados nesta sessão** (Fase 7). Saque
  Fantasma/Revoada/Espetáculo Mortal exigem detectar arma leve com propriedade
  "Arremesso" no ataque em curso e alterar o fluxo de ataque (saque sem PA, segundo
  ataque, sequência contra até 3 alvos) — nenhum desses ganchos existe hoje no fluxo de
  "Atacar" da ficha; permanecem ⚙️ Infra pendente.
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


---

## Entrega final — tabela 66/66 com colunas completas + checklist de validação manual

Gerada ao final das Fases 1–9 (2026-07-12). Todo talento marcado **🔵 Implementado**
abaixo está **aguardando confirmação do usuário via teste manual** — nenhum vira
✅ Integral sem essa confirmação explícita (regra dura do topo deste documento).
"Resultado da validação" começa como "Aguardando usuário" em toda a tabela.

| Árvore | Nível | Status | Fluxo real alterado | Arquivo principal | Estado persistido | Teste manual necessário | Validação |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Artífice | Bricolagem | 🔵 Implementado | Bônus +1 escopado ao teste de Engenharia/Robótica relacionado | `talentEngine.ts`, `RollsTab.tsx` | `Character.bricolagem_vulnerabilidade` | Registrar vulnerabilidade → rolar teste relacionado → confirmar chip +1 some após uso | Aguardando usuário |
| Artífice | Toque de Midas | 🔵 Implementado | +1 ataque/dano/MIT/PD-temp/teste, escopado à instância do item | `inventory.ts`, `InventoryTab.tsx`, `CharacterSheetClient.tsx` | `InventoryItemInstance.toqueDeMidas` | Aplicar em arma/armadura/escudo/ferramenta → verificar bônus na rolagem/MIT/PD → esperar expirar (1h) → confirmar some | Aguardando usuário |
| Artífice | Gambiarra Expressa | 📖 Narrativo rastreado | Atividade narrativa 1/sessão com formulário completo | `talentEngine.ts`, `TalentsTab.tsx` | `Character.gambiarra_expressa_ativa` | Registrar → encerrar → confirmar não pode reaquisitar na mesma sessão | Aguardando usuário |
| Assassino | Lâmina Oculta | 🔵 Implementado | 3m reposicionamento (sucesso padrão+); falha→limitada por julgamento do narrador | `TableClient.tsx` | Nenhum (reminders/log só) | Resolver ataque com alvo "não percebe" confirmado, banda standard+ → conferir reminder de reposicionamento | Aguardando usuário |
| Assassino | Hemorragia | 🔵 Implementado | Aplica Sangrando real no alvo (crítico usa 1d8) | `TableClient.tsx`, `gmActions.ts` | `ActiveCondition` no alvo (com autoria) | Atacar com arma com propriedade Sangramento, sucesso padrão+ → confirmar condição Sangrando aplicada | Aguardando usuário |
| Assassino | Executar | 🔵 Implementado | Força banda crítica, ignora MIT, 1/cena | `TableClient.tsx`, `talentEngine.ts` | `Character.talentos_estado` (atacante) | Confirmar requisito → resolver → confirmar MIT ignorado e crítico forçado; tentar de novo na mesma cena → confirmar bloqueado | Aguardando usuário |
| Atirador de Elite | 1 Tiro, 1 Acerto | 🔵 Implementado | +2/+3 no próximo disparo à distância após Mirar | `talentEngine.ts`, `RollsTab.tsx` | `Character.mirar_ativo` | Confirmar Mirar (sucesso/crítico) → atacar à distância → confirmar chip aplicado e consumido | Aguardando usuário |
| Atirador de Elite | À Espreita | 🔵 Implementado | Sucesso/falha limitada → sucesso padrão (alvo não ciente + Mirar) | `TableClient.tsx` | Nenhum (banda de resolução só) | Resolver ataque à distância com margem "limited" + confirmação → banda vira standard | Aguardando usuário |
| Atirador de Elite | Headshot | 🔵 Implementado | Acerto vira crítico (Mirar crítico confirmado) | `TableClient.tsx` | Nenhum | Resolver ataque à distância com acerto qualquer + confirmação de Mirar crítico → banda vira critical; testar um MISS → confirmar que NÃO vira acerto | Aguardando usuário |
| Berserker | Fúria | 🔵 Implementado | +1 Luta empilhável (até 3) ao sofrer dano real; duração corrigida (Fase 3) para manual — nunca mais aproxima para fim de rodada | `TableClient.tsx`, `talentEngine.ts`, `temporaryEffects.ts` | `Character.efeitos_temporarios` (stack) | Aplicar dano ao personagem com Fúria 2-3x seguidas → confirmar pilha soma até 3, não duplica registro; confirmar que "Encerrar Rodada" NÃO remove o stack sozinho | Aguardando usuário |
| Berserker | Sede de Sangue | 🔵 Implementado | −1 defensivas; PV-gate real na ativação; auto-desliga com PV ≥ metade; reminder de +Corpo no dano | `talentEngine.ts`, `CharacterSheetClient.tsx`, `TableClient.tsx` | `Character.efeitos_temporarios` (toggle) | Ativar só com PV<metade → confirmar bloqueado com PV≥metade; curar até metade → confirmar desliga sozinho; resolver ataque corpo a corpo → conferir reminder +Corpo | Aguardando usuário |
| Berserker | Último Fôlego | 🔵 Implementado | 1/cena, dano reduzido para parar em 1 PV em vez de cair a 0; +2 Luta e +1d6 dano corpo a corpo até fim de cena; força PV a 0 em "Encerrar Cena" se ainda de pé (cura não impede) | `talentEngine.ts`, `TableClient.tsx`, `endScene.ts` | `Character.ultimo_folego_ativo`, `efeitos_temporarios`, `talentos_estado` | Resolver ataque que zeraria o PV do alvo com Último Fôlego → confirmar PV para em 1, buffs aplicados; repetir na mesma cena → confirmar bloqueado; encerrar a cena sem curar → confirmar PV cai a 0 automaticamente | Aguardando usuário |
| Dissecador | Golpe Cirúrgico | 🔵 Implementado | Troca Corpo→Mente livre (dropdown já sem gate); −2 real no alvo (efeito temporário luta/precisão/balística) em crítico + dano contundente corpo a corpo, 1/rodada | `talentEngine.ts`, `TableClient.tsx` | `Character.efeitos_temporarios` (alvo) | Resolver ataque corpo a corpo contundente com margem crítica → marcar checkbox → confirmar efeito -2 no alvo; repetir na mesma rodada → confirmar bloqueado (1/rodada) | Aguardando usuário |
| Dissecador | Fincada | 🔵 Implementado | Reduz dano real em 1 (payload) para aplicar Lento/Caído no alvo, 1/rodada, só em acerto contundente corpo a corpo | `talentEngine.ts`, `TableClient.tsx` | `ActiveCondition` no alvo (com autoria) | Resolver ataque corpo a corpo contundente com acerto → escolher Lento ou Caído → confirmar dano reduzido em 1 e condição aplicada; repetir na mesma rodada → confirmar bloqueado | Aguardando usuário |
| Dissecador | Contra-medida | 🔵 Implementado | Consome 1 Reação real do defensor quando ataque corpo a corpo contra ele erra; contra-ataque em si resolvido pelo Atacar normal (desarmado/contundente por confirmação) | `talentEngine.ts`, `TableClient.tsx` | `Character.estado_jogo.reacoes_usadas` (defensor) | Resolver ataque corpo a corpo com margem "miss" contra personagem com Contra-medida → clicar botão → confirmar Reação consumida no defensor | Aguardando usuário |
| Droneiro | Sinal Limpo | ⚙️ Infra pendente | Nenhum (sem modelo de drone) | — | — | N/A | — |
| Droneiro | Script | ⚙️ Infra pendente | Nenhum (sem modelo de drone) | — | — | N/A | — |
| Droneiro | Enxame | ⚙️ Infra pendente | Nenhum (sem modelo de drone) | — | — | N/A | — |
| Espadachim | Aparar | 🔵 Implementado | +1 em Aparar; promoção 1/cena a sucesso crítico (habilita gatilho de Ripostar) | `TableClient.tsx`, `talentEngine.ts` | `Character.talentos_estado` (defensor) | Aparar com margem "standard" contra o atacante → promover a crítico (confirmar lâmina) → conferir "promovida a sucesso crítico" no painel | Aguardando usuário |
| Espadachim | Estocar | 🔵 Implementado | -1 PA real (mín. respeitado) num Atacar corpo a corpo com lâmina, 1/combate | `talentEngine.ts`, `CharacterSheetClient.tsx`, `ActionsTab.tsx` | `Character.talentos_estado` (cadência "combate" — reset manual, mesmo padrão já documentado no código para combate/sessão/missão) | Marcar Estocar, atacar com arma corpo a corpo → confirmar PA gasto 1 a menos que o normal; tentar de novo no mesmo combate → confirmar sem efeito | Aguardando usuário |
| Espadachim | Ripostar | 🔵 Implementado | 1/rodada, marca uso real do DEFENSOR ao obter crítico em Aparar (natural ou promovido) — contra-ataque em si via Atacar normal | `talentEngine.ts`, `TableClient.tsx` | `Character.talentos_estado` (defensor) | Aparar com margem "critical" (ou promover via Aparar N1) → clicar Ripostar → confirmar uso marcado; repetir na mesma rodada → confirmar bloqueado | Aguardando usuário |
| Estrategista | Falcão | 🔵 Implementado | +2 real (token) concedido pelo caster a um aliado ativo da mesa, 1/cena — aplicado por confirmação do recebedor no teste seguinte | `talentEngine.ts`, `CharacterSheetClient.tsx`, `TalentsTab.tsx`, `RollsTab.tsx` | `Character.falcao_token_ativo` (recebedor) | Conceder token a um aliado → aliado marca "confirmo" e rola → confirmar +2 somado e token consumido | Aguardando usuário |
| Estrategista | Briefing de Campo | 🔵 Implementado | Registra perícia designada em até 3 (ou 6 com Imposição de Ritmo) aliados; rerroll real (+1) na perícia designada, 1 uso | `talentEngine.ts`, `CharacterSheetClient.tsx`, `TalentsTab.tsx`, `RollsTab.tsx` | `Character.briefing_campo_ativo` (por aliado) | Registrar briefing em 1 aliado → aliado rola a perícia designada → clicar "Rerrolar" → confirmar +1 aplicado e consumido | Aguardando usuário |
| Estrategista | Imposição de Ritmo | 🔵 Implementado | Gasta 1 Reação real do caster; +1 PA real imediato a um aliado, 1/cena; eleva max_aliados do Briefing para 6 | `talentEngine.ts`, `CharacterSheetClient.tsx`, `TalentsTab.tsx` | `Character.estado_jogo` (caster e aliado), `talentos_estado` | Usar com aliado ativo → confirmar Reação do caster consumida e PA do aliado aumentado; repetir na mesma cena → confirmar bloqueado | Aguardando usuário |
| Guardião | Sentinela | 🔵 Implementado | Bloquear como Reação real GRATUITA (não gasta Reação), 1/rodada | `talentEngine.ts`, `TableClient.tsx` | `Character.talentos_estado` (defensor) | Rolar Bloquear com Sentinela disponível → confirmar Reações não diminuem; repetir na mesma rodada → confirmar volta a gastar Reação normal | Aguardando usuário |
| Guardião | Blindagem | 🔵 Implementado | +1 Bloquear real; anula 100% do dano, 1/cena, sem tocar PD | `TableClient.tsx`, `talentEngine.ts` | `Character.talentos_estado` (alvo) | Resolver ataque contra alvo com Blindagem, marcar "anular dano" → confirmar PV intacto e PD/escudo intocados | Aguardando usuário |
| Guardião | Muralha | 🔵 Implementado | Condição real "Cobertura Parcial" aplicada ao defensor + aliado escolhido em sucesso de Bloquear confirmado, sem limite de uso | `talentEngine.ts`, `TableClient.tsx` | `ActiveCondition` no defensor e no aliado (com autoria) | Rolar Bloquear, resolver o ataque confirmando sucesso, escolher aliado protegido → confirmar condição aplicada nos dois | Aguardando usuário |
| Mago de Batalha | Domínio Territorial | 🔵 Implementado | +50% alcance/área real no cartão E no log de conjuração | `talentEngine.ts`, `SpellsTab.tsx`, `CharacterSheetClient.tsx` | Nenhum (derivado do talento) | Conjurar magia de Ataque com o talento → confirmar alcance/área ajustados no cartão E no log | Aguardando usuário |
| Mago de Batalha | Canalizar | 🔵 Implementado | Potencializar (+1 dano/Mana) e Amortecer (−1 dano/Mana antes de MIT) real, 1/rodada compartilhado | `CharacterSheetClient.tsx`, `TableClient.tsx`, `talentEngine.ts` | `Character.talentos_estado`, `recursos_atuais.mana` | Usar Potencializar numa rodada → confirmar Amortecer bloqueado na MESMA rodada (e vice-versa) | Aguardando usuário |
| Mago de Batalha | Ascensão | 🔵 Implementado | Limite de Surtos 3→5 real + Ruptura especial idempotente | `talentEngine.ts`, `ResourcesTab.tsx` | `Character.ruptura_especial_ascensao` | Adquirir talento → confirmar Ruptura especial única → usar surtos até o 5º → confirmar limite | Aguardando usuário |
| Malabarista | Saque Fantasma | 🔵 Implementado | Ignora penalidade de Rajada (−1) com arma leve de Arremesso confirmada; saque já era de graça | `RollsTab.tsx`, `talentEngine.ts` | Nenhum (checkbox por rolagem) | Marcar "Usar Rajada" sem Saque Fantasma → −1 aplicado; marcar com confirmação de arma leve+Arremesso → −1 cancelado | Aguardando usuário |
| Malabarista | Revoada | ⚙️ Infra pendente | Nenhum | — | — | N/A | — |
| Malabarista | Espetáculo Mortal | ⚙️ Infra pendente | Nenhum | — | — | N/A | — |
| Manipulador | Olhar Penetrante | 🔵 Implementado | Falha limitada → sucesso limitado em Influência/Psicologia, com confirmação de contexto obrigatória | `talentEngine.ts`, `RollsTab.tsx` | Nenhum (promoção por rolagem) | Rolar Influência/Psicologia com CD, confirmar contexto certo → promoção aplica; testar SEM marcar a confirmação → promoção NÃO aplica | Aguardando usuário |
| Manipulador | Entrelinhas | 🔵 Implementado | +2 real no próximo teste de Influência do próprio caster contra a criatura marcada, 1/cena | `talentEngine.ts`, `CharacterSheetClient.tsx`, `TalentsTab.tsx`, `RollsTab.tsx` | `Character.entrelinhas_ativo` (caster) | Registrar descoberta contra uma criatura → rolar Influência confirmando o alvo → confirmar +2 somado e vulnerabilidade consumida | Aguardando usuário |
| Manipulador | Puxar os Fios | 🔵 Implementado | Registra abertura social real (1 de 5), 1/cena, exige Entrelinhas ativo na mesma criatura | `talentEngine.ts`, `CharacterSheetClient.tsx`, `TalentsTab.tsx` | `Character.talentos_estado` (caster) | Sem Entrelinhas ativo → confirmar bloqueado; com Entrelinhas ativo → confirmar sucesso → escolher abertura → confirmar registrado | Aguardando usuário |
| Mecatrônico | Chave de Arranque | ⚙️ Infra pendente | Nenhum (sem modelo de robô) | — | — | N/A | — |
| Mecatrônico | Marcha Dupla | ⚙️ Infra pendente | Nenhum (sem modelo de robô) | — | — | N/A | — |
| Mecatrônico | Overclock | ⚙️ Infra pendente | Nenhum (sem modelo de robô) | — | — | N/A | — |
| Mercador | Garimpo de Rua | 🔵 Implementado | −20% real em TODOS os preços da Loja enquanto ativo, 1/dia | `talentEngine.ts`, `InventoryTab.tsx` | `Character.talentos_estado` | Ativar desconto → confirmar preços da loja caem 20% → confirmar reset em Novo Dia/descanso longo | Aguardando usuário |
| Mercador | Caderneta de Dívida | ⚙️ Infra pendente | Nenhum (sem modelo de dívida) | — | — | N/A | — |
| Mercador | Rede de Favores | ⚙️ Infra pendente | Nenhum (infra genérica só) | — | — | N/A | — |
| Paramédico | Pronto-socorro | 🔵 Implementado | Estabiliza aliado ativo a 1 PV real, sem teste/custo, encerra colapso pela cura canônica; +1 PA opcional se ainda não agiu; 1/cena | `talentEngine.ts`, `CharacterSheetClient.tsx`, `TalentsTab.tsx` | `Character.recursos_atuais`/`colapso` (aliado), `talentos_estado` (caster) | Aliado a 0 PV → estabilizar → confirmar PV=1, colapso/Inconsciente encerrados, PA opcional aplicado; repetir na mesma cena → confirmar bloqueado | Aguardando usuário |
| Paramédico | Ritmo de Campo | 🔵 Implementado | -1 PA real (mín. respeitado) em ação do Console/item/magia de cura, "armado" por confirmação manual (sem tag "cura" estruturada no catálogo — blocker documentado resolvido por decisão do checkpoint) | `talentEngine.ts`, `CharacterSheetClient.tsx`, `TalentsTab.tsx` | `Character.estado_jogo.pa_gastos` | Armar Ritmo de Campo → usar item/ação/magia de cura → confirmar PA reduzido em 1 e armado desliga sozinho | Aguardando usuário |
| Paramédico | Protocolo de Emergência | 🔵 Implementado | Gasta 1 Reação real do caster, 1/cena; se o aliado está a 0 PV no momento da confirmação, PV vira 1 e colapso é encerrado pela cura canônica | `talentEngine.ts`, `CharacterSheetClient.tsx`, `TalentsTab.tsx` | `Character.estado_jogo` (caster), `recursos_atuais`/`colapso` (aliado), `talentos_estado` | Aliado a 0 PV → confirmar Protocolo → confirmar Reação do caster consumida e aliado com PV=1; repetir na mesma cena → confirmar bloqueado | Aguardando usuário |
| Pistoleiro | Gatilho Quente | 🔵 Implementado | Recurso real de dados de gatilho (d8), dano extra = Balística atual em resultado 8 | `talentEngine.ts`, `TalentsTab.tsx`, `CharacterSheetClient.tsx` | `Character.talentos_estado` | Usar dado de gatilho, informar resultado 8 → confirmar dano extra = Balística; usar outro resultado → confirmar só consome; usar os 3 → confirmar indisponível; descanso longo → confirmar reset | Aguardando usuário |
| Pistoleiro | Bang Bang | 🔵 Implementado | +1 dado de gatilho (pool vira 4); segundo disparo real (+1 PA, −1, mesmas regras) | `RollsTab.tsx`, `talentEngine.ts` | `Character.talentos_estado`, `estado_jogo.pa_gastos` | Rolar com dado de gatilho escolhido (maior dado) → confirmar segundo disparo disponível → gastar PA → rolar de novo com −1 pré-preenchido | Aguardando usuário |
| Pistoleiro | Showdown | ⚙️ Infra pendente | Nenhum | — | — | N/A | — |
| Praga | Marca da Dor | 🔵 Implementado | +1 real na margem do ataque quando o alvo tem efeito negativo autorado pelo próprio atacante, 1/rodada — resolvido lendo atacante+alvo juntos no momento da resolução (diferente de Muralha, que precisaria do lado do ATACANTE saber antecipado) | `talentEngine.ts`, `TableClient.tsx` | `Character.talentos_estado` (atacante) | Aplicar condição autorada pelo atacante no alvo → resolver ataque marcando Marca da Dor → confirmar +1 na margem/banda; repetir na mesma rodada → confirmar bloqueado | Aguardando usuário |
| Praga | Sangria Lenta | 🔵 Implementado (mecanismo real, sem dado hoje para agir) | Estende texto de duração round-based ("N rodadas") em +1 quando o autor tem o talento — `applyGmCondition` agora aceita e persiste `duracao`; NENHUMA condição do catálogo usa duração round-based hoje (`duracao_padrao` é sempre null/"enquanto_na_area"), então o mecanismo é real e testado mas não tem input para agir até o catálogo declarar uma duração assim — documentado explicitamente, não inventado | `talentEngine.ts`, `TableClient.tsx`, `gmActions.ts` | `ActiveCondition.duracao` | Sem teste manual possível hoje (nenhum conteúdo fornece duração "N rodadas") — validar quando/if o catálogo publicar uma condição com essa duração | Aguardando usuário |
| Praga | Contágio | 🔵 Implementado | Propaga condição autorada para até `maxAlvosMultiplicador` alvos adicionais confirmados manualmente (3m), 1/cena no autor — usa pela primeira vez `originalTargetId`/`applicationEventId` (campos existentes, nunca preenchidos antes) | `talentEngine.ts`, `TableClient.tsx`, `gmActions.ts` | `ActiveCondition` nos alvos adicionais (com autoria/origem preservadas) | Aplicar condição com autor → selecionar até N alvos adicionais → propagar → confirmar condição aplicada nos alvos com mesma autoria/duração; repetir na mesma cena → confirmar bloqueado | Aguardando usuário |
| Rato de Rua | Zé da Esquina | ⚙️ Infra pendente | Nenhum (infra genérica só) | — | — | N/A | — |
| Rato de Rua | Gato de Telhado | ⚙️ Infra pendente | Nenhum (infra genérica só) | — | — | N/A | — |
| Rato de Rua | Saída dos Fundos | ⚙️ Infra pendente | Nenhum (infra genérica só) | — | — | N/A | — |
| Rúnico | Gatilho Rúnico | 🔵 Implementado | Ativa/desativa runa instalada sem PA, ActiveEffect real | `inventory.ts`, `InventoryTab.tsx` | `InventoryItemInstance.runasInstaladas[].ativa` | Ativar/desativar runa → confirmar chip de bônus aparece/some | Aguardando usuário |
| Rúnico | Entalhe Rápido | 🔵 Implementado | Instalar/remover real com 1 PA + teste; tentativa pendente agora persistida (sobrevive a reload) | `inventory.ts`, `CharacterSheetClient.tsx`, `types.ts` | `Character.entalhe_rapido_tentativas`, `InventoryItemInstance.runasInstaladas[]` | Iniciar tentativa → recarregar a página → "Carregar" personagem → confirmar tentativa pendente ainda aparece para confirmar | Aguardando usuário |
| Rúnico | Sobregravação | 🔵 Implementado | Autorização real (dono/aliado/CD8) persistida na instância; split parcial agora bloqueado (bug corrigido) | `inventory.ts`, `InventoryTab.tsx`, `CharacterSheetClient.tsx` | `InventoryItemInstance.sobregravacao` | Aplicar → dono acessa slots extra → terceiro sem acesso vê limite base → terceiro testa CD8 e ganha acesso → transferir item e confirmar autorização preservada → tentar split parcial e confirmar bloqueado | Aguardando usuário |
| Sorrateiro | Passo Fantasma | 🔵 Implementado | Falha limitada → sucesso limitado em Furtividade | `talentEngine.ts`, `RollsTab.tsx` | Nenhum (promoção por rolagem) | Rolar Furtividade com CD, margem -1 → confirmar promovida para sucesso limitado | Aguardando usuário |
| Sorrateiro | Camuflagem Óptica | 🔵 Implementado | Furtividade não encerra automaticamente em exposição; requer confirmação de cobertura plausível | `talentEngine.ts`, `TalentsTab.tsx` | `Character.furtividade_ativa` | Entrar em Furtividade → confirmar cobertura plausível → confirmar Furtividade continua ativa | Aguardando usuário |
| Sorrateiro | Ataque Fatal | 🔵 Implementado | Acerto ao sair de Furtividade vira crítico; encerra Furtividade real | `TableClient.tsx`, `talentEngine.ts` | `Character.furtividade_ativa` | Entrar em Furtividade → atacar confirmando "saindo de Furtividade" → confirmar crítico forçado E Furtividade encerrada após | Aguardando usuário |
| Tecelão | Olho de Botão | ⚙️ Infra pendente | Nenhum (sem modelo de Trama) | — | — | N/A | — |
| Tecelão | Bypass | ⚙️ Infra pendente | Nenhum (sem modelo de Trama) | — | — | N/A | — |
| Tecelão | Agulha Fina | ⚙️ Infra pendente | Nenhum (sem modelo de Trama) | — | — | N/A | — |
| Totem | Benção | 🔵 Implementado | Promoção no próprio teste (checkbox avulso); token 1/cena a um aliado, consumido no primeiro teste dele | `RollsTab.tsx`, `TalentsTab.tsx`, `CharacterSheetClient.tsx` | `Character.bencao_token_ativo` (no aliado), `talentos_estado` (no concedente) | Marcar "efeito positivo" → falha limitada vira sucesso limitado; conceder token a aliado → aliado rola primeiro teste → confirmar token consumido | Aguardando usuário |
| Totem | Onda Solidária | ⚙️ Infra pendente | Nenhum | — | — | N/A | — |
| Totem | Chama Redobrada | ⚙️ Infra pendente | Nenhum | — | — | N/A | — |

### Checklist numerado de validação manual (80 itens)

Cobre os 20 talentos 🔵 Implementado (múltiplos itens cada, cenário completo) mais
checagens transversais de reload, modo local, logs e `/dev/table`. Todo item começa
"Implementado — aguardando validação manual"; marcar como fez ao testar (ex.: responder
"12 ok", "13 falhou: <descrição>").

**Artífice**
1. Bricolagem: registrar vulnerabilidade sem teste, form completo salva.
2. Bricolagem: bônus +1 aparece SÓ no teste relacionado, não em outros testes de Engenharia/Robótica.
3. Bricolagem: chip some após consumido; reload preserva estado consumido.
4. Toque de Midas: aplicar em arma → +1 ataque na rolagem real da arma certa (não em outra).
5. Toque de Midas: aplicar em armadura → MIT-base vs ajustado corretos na defesa.
6. Toque de Midas: aplicar em escudo → dano consome PD-temporário antes do PD-base.
7. Toque de Midas: efeito expira sozinho após 1h (ou ao usar "Novo dia") sem precisar reload.
8. Toque de Midas: transferir item ao bando e de volta preserva o efeito intacto.

**Assassino**
9. Lâmina Oculta: reminder de reposicionamento 3m aparece só em sucesso padrão+.
10. Hemorragia: só habilita com arma com propriedade Sangramento.
11. Hemorragia: crítico usa 1d8 no nome da condição corretamente.
12. Executar: bloqueado de fato sem confirmar o requisito.
13. Executar: MIT ignorado e crítico forçado mesmo com margem ruim digitada.
14. Executar: 1/cena — tentar de novo na mesma cena mostra "já usado".

**Atirador de Elite**
15. 1 Tiro 1 Acerto: +2 em sucesso, +3 em crítico, some após consumido.
16. À Espreita: só promove margem "limited"→"standard" com as duas confirmações marcadas.
17. Headshot: acerto vira crítico com Mirar crítico confirmado.
18. Headshot: miss NÃO vira acerto mesmo com a confirmação marcada.

**Berserker**
19. Fúria: sofrer dano real empilha +1 Luta.
20. Fúria: pilha não passa de 3 mesmo tomando mais dano.
21. Fúria: efeito expira ao fim da rodada seguinte (não antes, não nunca).

**Guardião**
22. Blindagem: dano zerado quando "anular" confirmado.
23. Blindagem: PD/escudo intocados após anular (nunca consumido).
24. Blindagem: 1/cena — segunda tentativa na mesma cena bloqueada.

**Mago de Batalha**
25. Domínio Territorial: alcance/área ajustados no cartão da aba Magias.
26. Domínio Territorial: MESMO ajuste aparece no log real de "Conjurado: ...".
27. Canalizar Potencializar: gasta Mana real, soma dano correto.
28. Canalizar Amortecer: reduz dano ANTES do MIT (não depois).
29. Canalizar: usar Potencializar bloqueia Amortecer na mesma rodada (e vice-versa).
30. Ascensão: Ruptura especial não reduz Integridade nem duplica ao readquirir.
31. Ascensão: limite de Surtos vai de 3 para 5 de fato.

**Manipulador**
32. Olhar Penetrante: promoção só aplica com a confirmação de contexto marcada.
33. Olhar Penetrante: sem marcar a confirmação, falha limitada continua falha limitada.

**Mercador**
34. Garimpo de Rua: ativar → preços da loja caem exatamente o percentual do payload.
35. Garimpo de Rua: reset ao usar "Novo dia" e também ao aplicar descanso longo.

**Pistoleiro**
36. Gatilho Quente: resultado 8 soma dano extra = Balística atual (não um valor fixo).
37. Gatilho Quente: qualquer outro resultado só consome o dado, sem bônus.
38. Gatilho Quente: pool esgota após usar todos os dados disponíveis.
39. Gatilho Quente: reset completo só no descanso longo (não em Novo Dia nem Encerrar Cena).
40. Bang Bang: pool vira 4 dados (não 3) quando os dois níveis estão adquiridos.

**Rúnico**
41. Gatilho Rúnico: ativar/desativar muda o ActiveEffect real (chip aparece/some).
42. Sobregravação: dono aplica ao próprio item → multiplicador correto do payload.
43. Sobregravação: aliado instruído acessa o espaço extra sem teste.
44. Sobregravação: terceiro sem acesso vê só o limite base (item ainda funciona).
45. Sobregravação: terceiro testa CD 8 e sucesso concede acesso persistido.
46. Sobregravação: transferir item preserva dono/aliados/multiplicador.
47. Entalhe Rápido: instalar só aplica em sucesso; falha preserva item/runa/PA.
48. Entalhe Rápido: remover runa funciona e preserva o resultado após reload.
49. Entalhe Rápido: tentar iniciar 2ª tentativa com uma pendente é bloqueado.

**Sorrateiro**
50. Passo Fantasma: falha limitada em Furtividade vira sucesso limitado.
51. Camuflagem Óptica: confirmar cobertura plausível mantém Furtividade ativa.
52. Ataque Fatal: acerto ao sair de Furtividade vira crítico.
53. Ataque Fatal: Furtividade é encerrada de verdade após o ataque (não antes).

**Transversais — reload/persistência**
54. Recarregar a página e clicar "Carregar" preserva Toque de Midas ativo.
55. Recarregar preserva Sobregravação (dono/aliados/multiplicador) na instância.
56. Recarregar preserva Furtividade ativa (Camuflagem Óptica).
57. Recarregar preserva Mirar ativo (1 Tiro 1 Acerto) dentro da rodada.
58. Recarregar preserva pilhas de Fúria no personagem alvo.
59. Recarregar preserva dados de gatilho usados (Pistoleiro).
60. Recarregar preserva desconto Garimpo de Rua ativo do dia.

**Transversais — modo local (sem mesa/Supabase)**
61. Toque de Midas funciona sem mesa conectada (só log local).
62. Sobregravação funciona sem mesa conectada.
63. Gatilho Quente funciona sem mesa conectada.
64. Garimpo de Rua funciona sem mesa conectada.

**Transversais — logs**
65. Cada ação acima gera uma linha de log local legível (não JSON cru).
66. Ações com mesa conectada também gravam em `table_logs` (verificar em `/dev/table`).
67. Reminders de talentos (À Espreita, Headshot, Lâmina Oculta, Ataque Fatal, Amortecer) aparecem no log de `attack_resolved`.

**Transversais — /dev/table (narrador)**
68. Checkbox de Hemorragia só aparece com arma com propriedade Sangramento.
69. Checkbox de Executar exige confirmação de requisito antes de habilitar aplicar.
70. Checkboxes de À Espreita/Headshot só aparecem para arma à distância (não corpo a corpo).
71. Checkbox de Ataque Fatal só aparece com o atacante EM Furtividade.
72. Painel de Blindagem/Amortecer lê o ALVO (não o atacante) corretamente.
73. Dois ataques resolvidos em sequência não misturam estado de talentos entre personagens diferentes.
74. Transferir item ao bando e depois para outro personagem preserva Sobregravação/Toque de Midas.

**Cobertura geral**
75. Todo talento marcado ⚙️ Infra pendente nesta tabela realmente não altera nenhum cálculo (conferir que não há bônus fantasma).
76. Todo talento marcado 🟡 Parcial faz A PARTE que está documentada como real (não mais, não menos).
77. Nenhum talento 🔵 aplica seu efeito a um personagem que NÃO tem o nível adquirido.
78. Remover um talento adquirido remove o efeito correspondente do fluxo real.
79. `npm run build` limpo e `git status` sem `next-env.d.ts` sujo (checagem final de higiene).
80. Revisar esta tabela linha a linha contra o capítulo canônico "11. TALENTOS" — apontar qualquer divergência de regra encontrada durante os testes.
