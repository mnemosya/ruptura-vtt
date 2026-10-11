# Mapeamento de ícones filled — mercado e inventário

Fonte: `icones/filled icons/`, `icones/energy/` e `icones/legacy/`. Atualizado em 11/10/2026. Trocas integradas no componente compartilhado; estrutura dorsal mantém `DorsalStructureIcon`. A fonte da pistola de bolso foi preservada em `legacy` após a substituição da pasta filled.

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

Os arquivos do pacote original têm um destino possível acima. `arrows`, `quiver` e `potion` precisam de identificação semântica adicional; os demais podem ser vinculados às categorias ou tipos já mapeados.

## Sem versão filled correspondente neste pacote

Manoplas, tonfa, martelo pesado, bastão, corrente leve, escopetas, metralhadora e as armas de energia sem associação abaixo conservam seus desenhos atuais. Dispositivos, drones/robôs, escalpos/módulos, ferramentas, veículos/mobilidade, vertinas e partes anatômicas também não têm substitutos diretos. Estrutura dorsal já usa o desenho próprio `DorsalStructureIcon`, com eixo central e suportes laterais; mochila equipada conserva `Backpack`.

## Integração implementada e verificação

1. Criar um renderer compartilhado para os SVGs filled, preservando proporção, tamanho e `currentColor`. Não reutilizar a compensação de traço do `WeaponIcon` sem adaptá-la: ela foi feita para os desenhos antigos de contornos expandidos.
2. Atualizar os tipos de arma individualmente, evitando trocar globalmente `knife`, `handaxe`, `spear` ou `pistol`, pois cada chave antiga atende itens que agora precisam de desenhos diferentes.
3. Atualizar a tabela de categorias em `itemIcons.tsx` para as trocas diretas.
4. Para flechas, aljava e poção, resolver a identidade visual com metadados canônicos e fornecer os mesmos campos no mercado e no inventário; evitar regras locais em cada tela.
5. Conferir a mesma mercadoria nas listas e detalhes das duas telas e nos equipamentos, nos tamanhos existentes de 16 a 150 px. Execute `python3 scripts/dev/generate-filled-icons.py` para regenerar os dados. Os paths das pastas de origem estão incorporados em `filledIconData.ts` e renderizados por `FilledIcon`, sem contorno adicional. Atualizações nos SVGs precisam regenerar esses dados.


## Complemento: armas convencionais e de energia

| Tipo | SVG integrado |
| --- | --- |
| Pistola de bolso | `legacy/pocket gun.svg` |
| Pistola pesada / automática | `filled icons/pistol.svg` |
| Submetralhadora | `filled icons/smg.svg` |
| Carabina | `filled icons/rifle.svg` |
| Rifle de assalto | `filled icons/assault rifle.svg` |
| Rifle de precisão | `filled icons/sniper 1.svg` |
| Rifle antimaterial | `filled icons/sniper 2.svg` |
| Pistola de feixe | `energy/noun_Blaster_4232599.svg` (nº 12) |
| Pistola voltaica | `energy/noun_Blaster_4232589.svg` (nº 2) |
| Crioagulha | `energy/noun_Blaster_4232591.svg` (nº 4) |
| Ofuscador | `energy/noun_Blaster_4232597.svg` (nº 10) |
| Fundidora | `energy/noun_Blaster_4232590.svg` (nº 3) |
| Carabina de feixe | `filled icons/pistol.svg` (nº 8; compartilhado com pistolas balísticas) |
| Repetidora térmica | `energy/noun_Blaster_4232588.svg` (nº 1) |
| Fuzil voltaico | `energy/noun_Blaster_4232594.svg` (nº 7) |
| Disruptor | `energy/noun_LaserGun_4232600.svg` (nº 13) |
| Ressonador | `energy/noun_LaserGun_4232596.svg` (nº 9) |
| Incinerador | `energy/noun_Blaster_4232601.svg` (nº 14) |

Os três últimos desenhos enviados por imagem (rifle de feixe concentrado, criojetor e nova pistola voltaica com raio) ainda não estão nas pastas fornecidas. Permanecem os ícones anteriores desses tipos, exceto a pistola voltaica, que usa o nº 2 disponível.

`noun_Motion_8334488.svg` está incorporado sem associação a arma. `kinetics.svg` foi removido da pasta substituída e não tinha associação de item.

Créditos: SVGs de energia de iconcheese / Noun Project, conforme os arquivos de origem. O desenho Motion é de Adrien Coquet / Noun Project. Os SVGs originais preservam os créditos; a arte renderizada usa a geometria da área de ícone.
