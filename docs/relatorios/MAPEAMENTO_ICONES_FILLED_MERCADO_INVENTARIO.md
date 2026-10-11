# Mapeamento de ícones filled — mercado e inventário

Fonte: `icones/filled icons/`. Levantamento em 11/10/2026: 24 SVGs originais, mais `kinetics.svg` adicionado posteriormente. As trocas diretas e as distinções de armas abaixo estão implementadas no componente compartilhado. Estrutura dorsal usa `DorsalStructureIcon`. Flechas, aljava e poções usam regras restritas de categoria e nome canônico. `kinetics.svg` está disponível nos dados, sem associação a uma categoria de mercado/inventário definida.

## Vínculo atual

MercadoHud, InventarioHud e EquipamentoHud importam `src/app/_design/itemIcons.tsx`, que expõe `ItemCategoryIcon`. Armas são resolvidas por `weaponIconMapping.ts` e desenhadas por `WeaponIcon`; categorias usam a tabela `ICONS`. A substituição deve ocorrer nesse ponto compartilhado.

O mercado fornece categoria, grupo e nome nas artes dos produtos. O inventário fornece categoria e `weaponName ?? nome`. Portanto, uma regra nova baseada em grupo ou subtipo precisa receber os mesmos dados nas duas telas. Algumas chamadas menores do mercado fornecem apenas categoria: continuam exibindo o ícone genérico até receberem o nome/metadados do produto.

## Armas: correspondências por tipo

| Item/tipo atual | Ícone atual | Novo SVG | Tratamento |
| --- | --- | --- | --- |
| Faca e adaga | `knife` | `dagger.svg` | Compartilhar para ambas; é a correspondência semântica disponível para faca |
| Facas de arremesso | `knife` | `throwing knife.svg` | Separar da faca comum |
| Soco inglês | `knuckles` | `knuckles.svg` | Troca direta |
| Rapieira | `rapier` | `rapier.svg` | Troca direta |
| Espada curta | `sword` | `sword.svg` | Troca direta |
| Espada longa | `great sword` | `longsword.svg` | Troca por tipo, preservando o vínculo com espada longa |
| Machado de mão | `handaxe` | `axe.svg` | Separar do machado de guerra |
| Machado de guerra | `handaxe` | `battleaxe.svg` | Separar do machado de mão |
| Alabarda | `spear` | `halberd.svg` | Separar da lança |
| Lança | `spear` | `lance.svg` | Troca direta |
| Shuriken | `shuriken` | `shuriken.svg` | Troca direta |
| Arcos curto, longo e composto | `bow` | `bow.svg` | Compartilhar entre os três |
| Bestas leve e pesada | `crossbow` | `crossbow.svg` | Compartilhar entre as duas |
| Revólver | `pistol` | `revolver.svg` | Separar das pistolas; manter o ícone atual das pistolas |

As versões especiais continuam herdando o tipo entre parênteses, conforme a regra existente em `weaponIconForName`.

## Categorias e equipamentos

| Categoria/uso | Ícone atual | Novo SVG | Tratamento |
| --- | --- | --- | --- |
| Arma / Armas (genérico) | `Swords` | `sword.svg` | Usar como fallback e cabeçalho, sem sobrepor o desenho específico da arma |
| Armadura / Armaduras / Armaduras e escudos | `ArmorIcon` | `armor.svg` | Troca direta; o grupo misto continua usando armadura |
| Escudo / Escudos | `ShieldHalf` | `shield.svg` | Troca direta |
| Acessório / Acessórios / slots 1 e 2 | `Headphones` | `acessory.svg` | Troca direta; conservar a grafia do arquivo ou renomeá-lo na integração |
| Traje / Trajes | `Shirt` | `suit.svg` | Troca direta; não substituir automaticamente o ícone anatômico de tronco |
| Mochila equipada | `Backpack` | `backpack.svg` | Troca direta |
| Estrutura dorsal | `DorsalStructureIcon` | Sem equivalente neste pacote | Ícone próprio de armação já implementado, distinto da mochila; não usar `backpack.svg` |
| Explosivo / Explosivos | `Bomb` | `explosive.svg` | Troca direta |
| Munição genérica e balística | `AmmoIcon` | `bullets.svg` | Troca genérica possível; preferir regra específica para munições balísticas |
| Flechas e virotes | `AmmoIcon` via categoria munição | `arrows.svg` | Nova regra por família/subtipo; virotes compartilham por aproximação |
| Aljava / suporte de flechas | Sem entrada própria em `ICONS`; fallback por categoria | `quiver.svg` | Nova regra para aljava; não aplicar a todo suporte de munição |
| Poções / frascos consumíveis | Sem entrada própria para poção | `potion.svg` | Condicional: usar somente para itens identificados como poções/frascos; não substituir toda farmácia, veneno ou vertina |

Todos os 24 arquivos novos têm um destino possível acima. `arrows`, `quiver` e `potion` precisam de identificação semântica adicional; os demais podem ser vinculados às categorias ou tipos já mapeados.

## Sem versão filled correspondente neste pacote

Manoplas, tonfa, martelo pesado, bastão, corrente leve, pistolas, submetralhadora, carabina, rifles, escopetas, metralhadora e armas de energia conservam seus desenhos atuais. Dispositivos, drones/robôs, escalpos/módulos, ferramentas, veículos/mobilidade, vertinas e partes anatômicas também não têm substitutos diretos. Estrutura dorsal já usa o desenho próprio `DorsalStructureIcon`, com eixo central e suportes laterais; mochila equipada conserva `Backpack`.

## Integração implementada e verificação

1. Criar um renderer compartilhado para os SVGs filled, preservando proporção, tamanho e `currentColor`. Não reutilizar a compensação de traço do `WeaponIcon` sem adaptá-la: ela foi feita para os desenhos antigos de contornos expandidos.
2. Atualizar os tipos de arma individualmente, evitando trocar globalmente `knife`, `handaxe`, `spear` ou `pistol`, pois cada chave antiga atende itens que agora precisam de desenhos diferentes.
3. Atualizar a tabela de categorias em `itemIcons.tsx` para as trocas diretas.
4. Para flechas, aljava e poção, resolver a identidade visual com metadados canônicos e fornecer os mesmos campos no mercado e no inventário; evitar regras locais em cada tela.
5. Conferir a mesma mercadoria nas listas e detalhes das duas telas e nos equipamentos, nos tamanhos existentes de 16 a 150 px. Os paths da pasta de origem estão incorporados em `filledIconData.ts` e renderizados por `FilledIcon`, sem contorno adicional. Atualizações nos SVGs precisam regenerar esses dados.
