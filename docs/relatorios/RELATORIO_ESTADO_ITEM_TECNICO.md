# Relatório — Estado/propriedades técnicas de item

Checkpoint posterior a `1d0cbf4`, classificado como **Caso B**.

## Auditoria da fonte

- `runa_cac_retratil` declara
  `tipo:"modificador"`, `efeito:"torna_ocultavel"` e
  `ativacao:"interagir_1pa"`.
- `runa_escudo_retratil` declara o mesmo `efeito:"torna_ocultavel"`,
  mas não declara `ativacao`.
- Armaduras e escudos usam o campo de modelo
  `ocultavel:"sim"|"parcial"|"nao"`.
- Armas referenciam propriedades canônicas por slug em
  `estatisticas.propriedades`; o catálogo de propriedades não define
  estado atual de item.
- Nenhum payload auditado define estado atual, valores de alternância ou
  custo separado para ativar e desativar.

Há, portanto, vocabulário suficiente para uma propriedade textual
renderizável, mas não para inferir uma máquina de estados completa.

## Decisão implementada

A instância de item aceita `propriedadesTecnicas` e `estadosTecnicos`.
Ambos rastreiam fonte, chave estável e rótulo; estados também guardam
`active` e podem carregar custo apenas informativo. A normalização é
defensiva e preserva campos desconhecidos.

Runas instaladas cujo payload contém exatamente
`tipo:"modificador"` + `efeito:"torna_ocultavel"` derivam a propriedade
passiva **Ocultável**. A derivação não gera `ActiveEffect`, não altera
rolagem/combate e desaparece quando a instalação é removida.

## Fase 3 — toggle não implementado

O toggle derivado de runa continua bloqueado pela fonte:

1. duas runas com o mesmo efeito divergem sobre a existência de
   `ativacao`;
2. `interagir_1pa` não informa se recolher, expandir ou ambos custam
   1 PA;
3. o payload não define os estados canônicos (`oculto/visível`,
   `retraído/expandido`) nem o estado inicial.

O helper genérico de estado pode alternar uma instância já definida sem
consumir PA, mas nenhuma runa recebe estado/toggle automaticamente até
o conteúdo fechar esse contrato.
