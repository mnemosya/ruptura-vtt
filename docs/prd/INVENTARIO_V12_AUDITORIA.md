# Inventário v1.2 — auditoria de conteúdo e decisões do VTT

Fonte editorial: [12. INVENTÁRIO](https://app.notion.com/p/3dd0a136355280e58284df2de80021e0). Fonte local auditada em 2026-10-30: `content/v12/db_mercado_itens_v1_2.json`.

## Conteúdo do pacote local

Há **280 itens, com 280 slugs distintos e preço numérico em todos**. As categorias são:

| Categoria | Itens | Espaços ausentes |
|---|---:|---:|
| Arma | 78 | 0 |
| Munição | 16 | 0 |
| Armadura | 23 | 0 |
| Escudo | 6 | 0 |
| Traje | 6 | 0 |
| Acessório | 6 | 0 |
| Ferramenta | 21 | 0 |
| Mobilidade | 12 | 0 |
| Dispositivo | 7 | 0 |
| Explosivo | 10 | 0 |
| Farmácia | 11 | 0 |
| Veneno | 4 | 0 |
| Vertina | 8 | 0 |
| Módulo de escalpo | 48 | 0 |
| Veículo | 18 | 18 |
| Módulo veicular | 6 | 6 |

As Mochilas MK-I, MK-II e MK-III possuem capacidade publicada de 10, 15 e 20 espaços. A v1.2 define uma única Mochila MK equipada e uma localização única por item: Equipado, Mochila, Abrigo ou Inventário do Bando. O acesso rápido aceita um item ou conjunto de até um espaço em cada uma das duas posições. O suporte de munição guardado ocupa seu espaço próprio e os espaços da munição nele contida.

## Decisão explícita para este VTT

Em 2026-10-30, o usuário confirmou que **compras e trocas podem exceder a capacidade da Mochila sem limite**. A interface continua a mostrar capacidade e ocupação. A regra editorial de até dois espaços extras não é aplicada como bloqueio nesses fluxos. Esta decisão também vale para a implementação de INV-02, EQP-02 e Mercado.

## Lacunas observadas

1. Os 24 veículos e módulos veiculares não têm `estatisticas.espacos_texto`. O Notion trata objetos incompatíveis com a Mochila como **Carga**, transportada separadamente sob limitações definidas pelo narrador. O domínio atual usa `estado: "mochila"` como padrão na compra e `espacosDoItem` atribui um espaço quando o campo falta; isso representa mal esses 24 itens. Precisa de estado/registro de Carga ou destino inicial no Abrigo, sem converter ausência de dado em espaço fictício.
2. `setItemLoadoutState`, `setItemEmEncaixe` e `purchaseItem` operam sobre o personagem no cliente; a RPC de gravação valida controle e alguns atributos, mas ainda não valida todas as invariantes de inventário. A migração precisa preservar instâncias, quantidades, munição, runas, recursos e IDs existentes.
3. Módulos de escalpo têm preço e Espaços publicados, mas a ficha ainda não registra quais instâncias foram instaladas em qual escalpo nem aplica a capacidade do hospedeiro.

## Migração segura do legado

- Preservar `id`, `itemSlug`, quantidade e estado de cada instância; não recriar itens a partir do modelo.
- Ao introduzir Carga, classificar apenas instâncias com evidência de incompatibilidade com Mochila; manter os demais estados até que uma ação explícita as mova.
- Não reduzir nem descartar excedente legado. A sobrecarga ilimitada é decisão do usuário para o VTT.
- Validar a transformação em cópia de payloads antigos e conferir contagens de itens antes/depois. Aplicar migration de banco apenas após essa verificação.
