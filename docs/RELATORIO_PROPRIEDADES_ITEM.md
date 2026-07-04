# Relatório — Propriedades de item no fluxo de jogo

## Fase 1 — auditoria

Fonte auditada: `db_equipamentos_normalizado_v1_2.json`,
`db_propriedades_normalizado_v1.json` e
`db_acoes_combate_normalizado_v1_1.json`.

### Contratos encontrados

1. Armas referenciam propriedades canônicas por slug em
   `estatisticas.propriedades`.
2. As 14 propriedades publicadas possuem descrição, gatilhos e
   `payload_automacao.efeitos`.
3. Armaduras e escudos não usam o catálogo de propriedades; expõem
   `ocultavel:"sim"|"parcial"|"nao"` no próprio modelo.
4. Propriedades técnicas da instância e propriedades derivadas de runa
   continuam em camadas separadas e podem ser projetadas junto das
   propriedades do modelo.

### Classificação

| Grupo | Propriedades atuais | Decisão |
|---|---|---|
| A — renderizável/textual | nenhuma exclusivamente textual no catálogo; `ocultavel` do modelo e propriedades técnicas entram aqui | Exibir, sem mecânica |
| B — pré-requisito de ação | Aparar | Pode explicar disponibilidade da ação |
| C — modificador passivo seguro | nenhuma | Não automatizar |
| D — pós-rolagem/crítico sugerível | Atordoamento, Contusão, Desarme, Empurrão, Precisão, Queimadura, Sangramento | Apenas sugerir em crítico |
| E — exige sistema novo | Alcance, Arremesso, Dispersão, Perfuração, Rajada, Silencioso | Exibir; depende de alcance, modo de ataque, cobertura, MIT, munição ou contexto |
| F — ambígua | nenhuma no catálogo publicado | Payload malformado/desconhecido cai neste grupo defensivamente |

Nenhuma propriedade gera `ActiveEffect` ou altera combate nesta fase.

## Fase 2 — requisitos de ação

O Console de Ação interpreta somente contratos já presentes nas ações:

- `arma_com_propriedade` resolve a propriedade pelo catálogo e procura
  armas equipadas/empunhadas;
- `protecao_empunhada` procura escudos equipados/empunhados;
- `recarregar_arma` recebe o requisito informativo “arma com munição”
  quando o modelo possui `estatisticas.municao_max`.

O resultado é explicativo (“encontrado em…” ou “requisito não
encontrado”). Ele não altera `enabled`, não gasta PA/Reação, não rola
dados e não cria ações novas.

## Fase 3 — propriedades críticas

Classificação: **Caso B**. Atordoamento, Contusão, Desarme, Empurrão,
Precisão, Queimadura e Sangramento têm gatilho/texto crítico claros,
mas a resolução exige alvo, resistência, condição, deslocamento ou
alteração de dano.

O ataque contestado pode registrar explicitamente a instância de arma
usada. Quando a margem alcança o limiar canônico lido de
`combat_field.regiao_corpo_ataque` (sem fallback inventado), o resumo e
o log recebem lembretes das propriedades críticas daquela arma.
Nenhuma sugestão aplica dano, condição, resistência, MIT ou movimento.
