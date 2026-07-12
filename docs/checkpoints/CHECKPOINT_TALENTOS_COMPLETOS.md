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

1. **Combate é resolvido no lado do narrador** (`/dev/table`, `handleResolveAttackDamage`)
   com separação atacante/alvo; talentos de margem/condição do ATACANTE exigem passar a
   lista de talentos + propriedades da arma do atacante para o painel do alvo — integração
   cross-record, não edição local.
2. **Ações de cura não têm tag `cura` no conteúdo** (`db_acoes_combate`), então Ritmo de
   Campo não pode identificar "ação de cura" sem inventar taxonomia.
3. **Limite de Sobrecarga está acoplado ao gatilho de Ruptura do 3º surto** em
   `useOverloadSurge` (`terceiro = indice >= maxPerDay`); Ascensão elevar o limite a 5
   moveria a Ruptura do 3º para o 5º surto — alteração de regra não confirmada pelo capítulo.

Esses pontos precisam ou de desacoplamento cuidadoso por fluxo ou de esclarecimento
canônico — não de uma engine genérica.

---

## Tabela 66/66 — status REAL de implementação mecânica

Legenda: **✅ Integral** (mecânica-núcleo conectada ao fluxo real) · **🟡 Parcial**
(parte da mecânica real feita, resto pendente) · **📖 Narrativo rastreado** (atividade
com formulário/estado/log) · **⚙️ Infra pendente** (só classificação/badge/botão/
cadência/log/lembrete — SEM regra específica no fluxo).

Contagem: ✅ 1 · 🟡 8 · ⚙️ 57 · 📖 0.

| Árvore | Nível | Nº | Status real |
| --- | --- | --- | --- |
| Artífice | Bricolagem | 1 | ⚙️ Infra pendente |
| Artífice | Toque de Midas | 2 | ⚙️ Infra pendente |
| Artífice | Gambiarra Expressa | 3 | ⚙️ Infra pendente |
| Assassino | Lâmina Oculta | 1 | ⚙️ Infra pendente |
| Assassino | Hemorragia | 2 | ⚙️ Infra pendente |
| Assassino | Executar | 3 | ⚙️ Infra pendente |
| Atirador de Elite | 1 Tiro, 1 Acerto | 1 | ⚙️ Infra pendente |
| Atirador de Elite | À Espreita | 2 | ⚙️ Infra pendente |
| Atirador de Elite | Headshot | 3 | ⚙️ Infra pendente |
| Berserker | Fúria | 1 | 🟡 Parcial |
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
| Guardião | Blindagem | 2 | 🟡 Parcial |
| Guardião | Muralha | 3 | ⚙️ Infra pendente |
| Mago de Batalha | Domínio Territorial | 1 | 🟡 Parcial |
| Mago de Batalha | Canalizar | 2 | 🟡 Parcial |
| Mago de Batalha | Ascensão | 3 | ✅ Integral |
| Malabarista | Saque Fantasma | 1 | 🟡 Parcial |
| Malabarista | Revoada | 2 | ⚙️ Infra pendente |
| Malabarista | Espetáculo Mortal | 3 | ⚙️ Infra pendente |
| Manipulador | Olhar Penetrante | 1 | ⚙️ Infra pendente |
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
| Rúnico | Gatilho Rúnico | 1 | ⚙️ Infra pendente |
| Rúnico | Entalhe Rápido | 2 | ⚙️ Infra pendente |
| Rúnico | Sobregravação | 3 | ⚙️ Infra pendente |
| Sorrateiro | Passo Fantasma | 1 | ⚙️ Infra pendente |
| Sorrateiro | Camuflagem Óptica | 2 | ⚙️ Infra pendente |
| Sorrateiro | Ataque Fatal | 3 | ⚙️ Infra pendente |
| Tecelão | Olho de Botão | 1 | ⚙️ Infra pendente |
| Tecelão | Bypass | 2 | ⚙️ Infra pendente |
| Tecelão | Agulha Fina | 3 | ⚙️ Infra pendente |
| Totem | Benção | 1 | 🟡 Parcial |
| Totem | Onda Solidária | 2 | ⚙️ Infra pendente |
| Totem | Chama Redobrada | 3 | ⚙️ Infra pendente |

### Detalhe dos não-infra

- **🟡 Domínio Territorial** — multiplica alcance/área na aba Magias (+50%); **falta** usar o
  valor ajustado nos cartões operacionais e nos logs de conjuração para ser integral.
- **✅ Ascensão** — limite de Surtos 3→5 real + Ruptura especial idempotente ao adquirir
  (não reduz Integridade, não conta em cálculos futuros), exibida à parte e logada.
- **🟡 Canalizar** — Potencializar real (gasta Mana, +1 dano/Mana, 1/rodada); **falta
  Amortecer** (fluxo de dano recebido, lado narrador — Fase E).
- **🟡 Aparar** — +1 em Aparar real via ActiveEffect; **falta** a promoção 1/cena.
- **🟡 Blindagem** — +1 em Bloquear real; **falta** anular todo o dano sem consumir PD.
- **🟡 Sede de Sangue** — −1 defensivas real (toggle→efeito); **falta** dobrar bônus de
  Corpo no dano e monitorar PV.
- **🟡 Fúria** — efeito temporário empilhável existe; **falta** ganhar pilha automática
  ao sofrer dano (lado narrador).
- **🟡 Saque Fantasma / Totem Benção** — parte passiva real; promoção de margem pendente.



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
