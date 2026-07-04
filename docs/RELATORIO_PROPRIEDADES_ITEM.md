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
