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
