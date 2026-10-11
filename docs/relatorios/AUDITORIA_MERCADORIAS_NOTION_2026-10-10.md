# Auditoria das mercadorias — Notion → catálogo publicado → VTT

Consulta somente leitura em 10/10/2026. Nenhuma mercadoria, página do Notion ou registro do banco foi alterado. Os arquivos deste relatório são os únicos artefatos produzidos pela auditoria.

## Fontes e limites

- Snapshot local extraído em 2026-10-09T23:25:05.912Z.
- Páginas atuais do Notion consultadas pelo conector; catálogo publicado consultado com a chave pública do Supabase.
- Comparação automática de células comerciais por página, nome e tipo de tabela. Não interpreta automaticamente regras narrativas nem resolve correspondências ambíguas. Datas de página indicam alterações, mas não provam sozinhas alteração de cada mercadoria.
- O conector não forneceu indicadores de truncamento/blocos desconhecidos nas respostas. Não se afirma equivalência completa das narrativas.
- Inventários privados de personagens não foram consultados. Compatibilidade de slugs antigos é um risco a validar antes de migração.

## Catálogo publicado

| Tipo | Quantidade |
|---|---:|
| item | 273 |
| rune | 52 |
| companion_model | 10 |
| escalpo | 39 |

Todos os 273 itens possuem somente campos_tabela e espacos_texto em estatisticas. A geração atual preserva texto comercial, mas não popula os campos mecânicos lidos por normalizeItemContent. Isso é diferente de ausência de informação no Notion.

## Campos explícitos que não chegam à mecânica

| Campo técnico ausente | Itens com evidência na tabela |
|---|---:|
| regioes | 20 |
| mit_base | 20 |
| tipo_protecao | 26 |
| ocultavel | 94 |
| pd_max | 6 |
| dado_dano | 81 |
| propriedades | 81 |
| compatibilidade | 10 |
| cargas_max | 21 |
| municao_max | 35 |
| kit | 12 |

- As 20 armaduras ficam sem regiões e MIT normalizados. A regra itemCabeNoSlot exige categoria armadura e região técnica compatível.
- Os 6 escudos podem aparecer na mão secundária pela categoria, mas ficam sem PD e resistência normalizados.
- As 81 armas aparecem pela categoria, mas têm dano e propriedades apenas em texto. Ataques/recarga não recebem automaticamente esses valores.
- Cargas, kits, compatibilidade de munição e ocultabilidade também precisam de tradução explícita.
- Espacos_texto já é lido pelo VTT; não deve ser substituído por um valor genérico.
- Efeitos vazios com uso_manual não são classificados automaticamente como defeito: automação requer análise das regras e não deve ser inventada.

## Notion atual versus publicação

349 registros comparados com correspondência única; 9 sem correspondência; 16 ambíguos. 121 células divergentes em 96 registros. 6 linhas comerciais possivelmente novas.

| Mercadoria | Campo | Publicado | Notion atual |
|---|---|---|---|
| Adaga | Mãos | — | 1 |
| Alabarda | Mãos | — | 2 |
| Amplificação | Aplicação | — | Armas de energia |
| Arco curto | Mãos | — | 2 |
| Arco longo | Mãos | — | 2 |
| Flamejante | Aplicação | — | Armas brancas |
| AS-10 Overdrive (Pistola pesada) | Mãos | — | 1 |
| AS-127 Wrecker (Rifle antimaterial) | Mãos | — | 2 |
| AS-127 Wrecker (Rifle antimaterial) | Ocultável? |  | Não |
| AS-65 Runaway (Carabina) | Mãos | — | 2 |
| AS-65 Runaway (Carabina) | Ocultável? |  | Não |
| AS-762 Redshift (Rifle de assalto) | Mãos | — | 2 |
| AS-762 Redshift (Rifle de assalto) | Ocultável? |  | Não |
| AS-86 Terminal (Rifle de precisão) | Mãos | — | 2 |
| AS-86 Terminal (Rifle de precisão) | Ocultável? |  | Não |
| Atordoante | Aplicação | — | Armas de fogo |
| Bastão | Mãos | — | 2 |
| Batedora | Aplicação | — | Projéteis (disparo e arremesso) |
| Batedora | Preço (Ⱥ) | 500 | 800 |
| Batedora | Raridade | Comum | Incomum |
| BB-14 Sprawl (Espingarda) | Mãos | — | 2 |
| BB-14 Sprawl (Espingarda) | Ocultável? |  | Não |
| BB-30 Blight (Escopeta pesada) | Mãos | — | 2 |
| BB-30 Blight (Escopeta pesada) | Ocultável? |  | Não |
| BB-6 Claws (Escopeta curta) | Mãos | — | 1 |
| BB-6 Claws (Escopeta curta) | Ocultável? |  | Não |
| Besta leve | Mãos | — | 2 |
| Besta leve | Propriedades | Silencioso, Precisão | Perfuração, Silencioso, Precisão |
| Besta pesada | Dano | 1d12 perfurante | 2d8 perfurante |
| Besta pesada | Mãos | — | 2 |
| Cadência | Aplicação | — | Armas de fogo |
| Camuflagem | Aplicação | — | Projéteis (disparo e arremesso) |
| Camuflagem | Efeito | Projéteis tornam-se invisíveis e inimigos sofrem –1 ao defender. | Projéteis tornam-se invisíveis e inimigos sofrem –2 de desvantagem ao defender. |
| Canhão de plasma | Mãos | — | 2 |
| Carabina | Mãos | — | 2 |
| Carabina de feixe | Mãos | — | 2 |
| Clarão | Aplicação | — | Armas brancas |
| Contenção | Aplicação | — | Armas de energia |
| Corrente leve | Mãos | — | 1 |
| Crioagulha | Mãos | — | 1 |
| Criojetor | Mãos | — | 2 |
| Disruptor | Mãos | — | 2 |
| DL-21 Reaper (Submetralhadora) | Mãos | — | 2 |
| DL-21 Reaper (Submetralhadora) | Ocultável? |  | Não |
| DL-34 Ravage (Carabina) | Mãos | — | 2 |
| DL-34 Ravage (Carabina) | Ocultável? |  | Não |
| DL-47 Butcher (Rifle de assalto) | Mãos | — | 2 |
| DL-47 Butcher (Rifle de assalto) | Ocultável? |  | Não |
| DL-8 Cry Havoc (Pistola automática) | Mãos | — | 1 |
| Eficiência | Aplicação | — | Armas de energia |
| Eletrizante | Aplicação | — | Armas brancas |
| Escopeta curta | Mãos | — | 1 |
| Espada curta | Mãos | — | 1 |
| Espada longa | Mãos | — | 2 |
| Espingarda | Mãos | — | 2 |
| Finta | Aplicação | — | Armas brancas |
| FL-1 Razor (Adaga) | Mãos | — | 1 |
| FL-2 Edgelord (Espada longa) | Mãos | — | 2 |
| FL-5 Guillotine (Machado de guerra) | Mãos | — | 2 |
| Focalização | Aplicação | — | Armas de energia |
| Frenesi | Aplicação | — | Armas brancas |
| Fundidora | Mãos | — | 1 |
| Fuzil voltaico | Mãos | — | 2 |
| Ímpeto | Aplicação | — | Armas brancas |
| Incinerador | Mãos | — | 2 |
| KO-18 Jawbreaker (Manoplas) | Mãos | — | 2 |
| KO-40 Sledge (Manoplas) | Mãos | — | 2 |
| KO-7 Overreach (Manoplas) | Mãos | — | 2 |
| Lança-crio | Mãos | — | 2 |
| Machado de guerra | Mãos | — | 2 |
| Manoplas | Mãos | — | 2 |
| Martelo pesado | Mãos | — | 2 |
| Metralhadora | Mãos | — | 2 |
| Metralhadora de arco | Mãos | — | 2 |
| Ofuscador | Mãos | — | 1 |
| Pente Fantasma | Aplicação | — | Armas de fogo |
| Pistola de bolso | Mãos | — | 1 |
| Pistola de feixe | Mãos | — | 1 |
| Pistola pesada | Mãos | — | 1 |
| Pistola voltaica | Mãos | — | 1 |
| Potência | Aplicação | — | Armas de fogo |
| Rapieira | Mãos | — | 1 |
| Rastreadora | Aplicação | — | Armas de fogo |
| Recirculação | Aplicação | — | Armas de energia |
| Repetidora térmica | Mãos | — | 2 |
| Ressonador | Mãos | — | 2 |
| Ressonador de cerco | Mãos | — | 2 |
| Retornável | Aplicação | — | Projéteis (disparo e arremesso) |
| Retornável | Raridade | Comum | Incomum |
| Retrátil | Aplicação | — | Armas brancas |
| Revólver | Mãos | — | 1 |
| Rifle de assalto | Mãos | — | 2 |
| Rifle de feixe concentrado | Mãos | — | 2 |
| Rifle de precisão | Mãos | — | 2 |
| Ruína | Aplicação | — | Armas brancas |
| RV-12 Razorstar (Shuriken) | Espaços | 1 | 1 (kit de 3) |
| RV-12 Razorstar (Shuriken) | Mãos | — | 1 |
| RV-12 Razorstar (Shuriken) | Preço (Ⱥ) | 1.000 pelo conjunto | 1.000 por kit |
| RV-20 Grudge (Machado de mão) | Dano | Corpo + 1d8 | Corpo + 1d8 cortante |
| RV-20 Grudge (Machado de mão) | Mãos | — | 1 |
| RV-20 Grudge (Machado de mão) | Munição |  | — |
| RV-20 Grudge (Machado de mão) | Tipo | Cortante | — |
| RV-4 Shiv (Faca) | Mãos | — | 1 |
| RV-4 Shiv (Faca) | Propriedades | Arremesso, Silencioso | Arremesso, Silencioso, Rajada (2) |
| Saturação | Aplicação | — | Armas de energia |
| Shuriken | Dano | 1d4 cortante | Corpo + 1d4 cortante |
| Shuriken | Espaços | 1 (6 shurikens) | 1 (kit de 6) |
| Shuriken | Mãos | — | 1 |
| Shuriken | Propriedades | Arremesso, Silencioso, Rajada (3), | Arremesso, Sangramento, Silencioso, Rajada (3) |
| SK-24 Blue Hawk (Arco composto) | Mãos | — | 2 |
| SK-60 White Vulture (Arco longo) | Mãos | — | 2 |
| SK-7 Red Falcon (Arco curto) | Mãos | — | 2 |
| Soco-inglês | Mãos | — | 1 |
| Sombra | Aplicação | — | Projéteis (disparo e arremesso) |
| Submetralhadora | Mãos | — | 2 |
| SW-22 Spiral (Submetralhadora) | Mãos | — | 2 |
| SW-36 Crossfade (Carabina) | Mãos | — | 2 |
| SW-51 Deviant (Rifle de assalto) | Mãos | — | 2 |
| SW-9 Ghostline (Pistola pesada) | Mãos | — | 1 |
| Tonfa | Mãos | — | 1 |
| Voragem | Aplicação | — | Armas brancas |

### Novas linhas comerciais candidatas

- ARMAS: Facas de Arremesso — revisar associação antes de importar.
- ARMAS: SW-80 Widowmaker (Rifle de precisão) — revisar associação antes de importar.
- ARMAS: DL-66 Maelstrom (Metralhadora) — revisar associação antes de importar.
- FERRAMENTAS E UTILIDADES: Aljava — revisar associação antes de importar.
- FERRAMENTAS E UTILIDADES: Aljava Autoalimentadora — revisar associação antes de importar.
- FERRAMENTAS E UTILIDADES: Cartucheira — revisar associação antes de importar.

### Sem correspondência ou ambíguos

- ARMAS: Dardos (armas_dardos); candidatos: 0.
- ARMAS: DL-66 Widowmaker (Metralhadora) (armas_dl_66_widowmaker_metralhadora); candidatos: 0.
- ARMAS: SW-80 Parallax (Rifle de precisão) (armas_sw_80_parallax_rifle_de_precisao); candidatos: 0.
- MOBILIDADE: BAIA DE UNIDADES (mobilidade_baia_de_unidades); candidatos: 0.
- MOBILIDADE: COMPARTIMENTO OCULTO (mobilidade_compartimento_oculto); candidatos: 0.
- MOBILIDADE: MÓDULO-CLÍNICA (mobilidade_modulo_clinica); candidatos: 0.
- MOBILIDADE: MÓDULO DE TRANSPORTE (mobilidade_modulo_de_transporte); candidatos: 0.
- MOBILIDADE: MÓDULO-GERADOR (mobilidade_modulo_gerador); candidatos: 0.
- MOBILIDADE: MÓDULO-OFICINA (mobilidade_modulo_oficina); candidatos: 0.
- ARMAS: Silenciadora (armas_armas_corpo_a_corpo_silenciadora); candidatos: 2.
- ARMAS: Tóxica (armas_armas_corpo_a_corpo_toxica_137c82); candidatos: 2.
- ARMAS: Ricochete (armas_armas_de_arremesso_e_disparo_ricochete); candidatos: 2.
- ARMAS: Serpentina (armas_armas_de_arremesso_e_disparo_serpentina); candidatos: 2.
- ARMAS: Tóxica (armas_armas_de_arremesso_e_disparo_toxica_f5d0f7); candidatos: 2.
- ARMAS: Estabilidade (armas_armas_de_energia_estabilidade); candidatos: 2.
- ARMAS: Estabilidade (armas_armas_de_fogo_estabilidade); candidatos: 2.
- ARMAS: Ricochete (armas_armas_de_fogo_ricochete); candidatos: 2.
- ARMAS: Serpentina (armas_armas_de_fogo_serpentina); candidatos: 2.
- ARMAS: Silenciadora (armas_armas_de_fogo_silenciadora); candidatos: 2.
- ARMAS: Faca (armas_armas_corpo_a_corpo_faca); candidatos: 1.
- ARMAS: Faca (armas_armas_de_arremesso_e_disparo_faca); candidatos: 1.
- ARMAS: Lança (armas_armas_corpo_a_corpo_lanca); candidatos: 1.
- ARMAS: Lança (armas_armas_de_arremesso_e_disparo_lanca); candidatos: 1.
- ARMAS: Machado de mão (armas_armas_corpo_a_corpo_machado_de_mao); candidatos: 1.
- ARMAS: Machado de mão (armas_armas_de_arremesso_e_disparo_machado_de_mao); candidatos: 1.

## Mudanças de identidade e regras que exigem revisão

- Notion renomeou DISPOSITIVOS TECNOLÓGICOS para DISPOSITIVOS e FERRAMENTAS E UTILIDADES para FERRAMENTAS. O extrator compõe slug_sugerido a partir do título da página e do nome: uma nova extração sem aliases pode gerar slugs diferentes para mercadorias já compradas. Usar fonte_notion.linhaBlocoId como evidência de identidade; título não deve ser a única chave.
- As linhas atuais SW-80 Widowmaker e DL-66 Maelstrom parecem corresponder aos modelos publicados SW-80 Parallax e DL-66 Widowmaker. Confirmar identidade pelos IDs de origem antes de tratar como itens novos ou excluir os antigos.
- Aljava, Aljava Autoalimentadora e Cartucheira aparecem como novas linhas comerciais de ferramentas. Facas de Arremesso também não corresponde diretamente ao catálogo publicado. “Novo” nesta auditoria significa sem correspondência automática; não uma decisão de migração.
- Faca, Lança e Machado de mão possuem representações publicadas distintas que convergem para uma mesma linha atual. Foram removidas da contagem de divergências resolvidas e marcadas como ambíguas.
- Os seis módulos veiculares publicados não tiveram correspondência em tabela. Isso não comprova remoção: podem existir em verbetes narrativos, cuja equivalência não foi automatizada.
- No Notion atual, Exotraje pesado traz Cabeça na tabela, mas o verbete lista tronco, braços e pernas. Resolver essa divergência antes de definir regiões.
- Runa Isolante aparece Raro na tabela e Incomum no verbete. Não escolher automaticamente um dos valores.
- O Notion atual descreve posição independente de Trajes e compatibilidade com armaduras. A UI atual possui slots corporais para armaduras e não representa um slot independente de traje. Isso exige implementação de regra/interface, não apenas importação de texto.
- Capacidade de runas (1/2/3 por peso de armaduras e escudos) consta nas regras da página, mas slots_runa_max não está publicado. Validar contra a regra atual antes de preencher.

## Verificação com as funções reais do VTT

Executados normalizeItemContent e itemCabeNoSlot sobre a cópia somente leitura do catálogo publicado:

- 20 armaduras normalizadas; 0 aceitas em qualquer dos quatro encaixes corporais.
- 6 escudos com pdMax nulo.
- 81 armas com danoBase nulo.
- Traje urbano híbrido: regioes vazias, mitMax nulo e incompatível com tronco.

## Exemplo: Traje urbano híbrido

No Notion atual, a tabela e o verbete declaram Tronco, MIT 2, resistência híbrida, 2 espaços e preço 600. A publicação preserva esses textos, mas não tem regioes, mit_base e tipo_protecao. O problema de compatibilidade é na conversão, não no nome do traje.

## Publicação versus arquivos locais

Dois registros publicados diferem do JSON local apenas no subtipo: armas_flecha_simples (Flecha, local Tipo) e armas_virotes (Virote, local Tipo). Uma republicação cega do JSON local desfaria esses ajustes.

## Ordem recomendada de correção

1. Extrair o Notion atual para uma nova cópia de revisão, mantendo o snapshot anterior.
2. Resolver divergências de tabelas versus verbetes e associações ambíguas antes de importar.
3. Normalizar regiões, MIT, PD, resistência, dano, munição, kits e propriedades; conservar campos já preenchidos e sinalizar conflitos.
4. Preservar slugs e criar aliases explícitos quando houver mudança; não remover compras ou instalações existentes.
5. Validar catálogo novo em ambiente isolado, compra, equipar, ataques, recarga, cargas e persistência.
6. Publicar somente o diff aprovado, com backup e possibilidade de restauração.

## Páginas consultadas

- [ACESSÓRIOS](https://www.notion.so/3f10a1363552818da767c209228ed796) — edição indicada pelo Notion: 2026-10-08T22:19:18.330Z.
- [ARMAS](https://www.notion.so/9690a136355283c59bd8813acc4e4935) — edição indicada pelo Notion: 2026-10-10T23:05:27.326Z.
- [ARMADURAS E ESCUDOS](https://www.notion.so/3f00a136355280de9992cec6eca3f6b6) — edição indicada pelo Notion: 2026-10-10T22:06:38.868Z.
- [DISPOSITIVOS](https://www.notion.so/cb40a136355282bc88c38145b82d5de5) — edição indicada pelo Notion: 2026-10-10T20:42:52.636Z.
- [DRONES E ROBÔS](https://www.notion.so/7a00a13635528396b33501c34c719d2a) — edição indicada pelo Notion: 2026-10-08T22:19:48.347Z.
- [ESCALPOS](https://www.notion.so/3d50a13635528061bda3c10fbb32cf04) — edição indicada pelo Notion: 2026-10-08T22:20:53.317Z.
- [EXPLOSIVOS](https://www.notion.so/76c0a136355283b992130175879922e2) — edição indicada pelo Notion: 2026-10-08T22:19:32.574Z.
- [FARMÁCIA](https://www.notion.so/3e60a136355283b78291014a3b05205d) — edição indicada pelo Notion: 2026-10-08T22:19:42.796Z.
- [FERRAMENTAS](https://www.notion.so/4210a13635528285a61281d46315a915) — edição indicada pelo Notion: 2026-10-10T22:09:34.202Z.
- [MOBILIDADE](https://www.notion.so/ac80a136355282d08fbd01cb30610de4) — edição indicada pelo Notion: 2026-10-10T22:09:01.146Z.
- [TRAJES](https://www.notion.so/3f00a136355281a7a6d8d9cc819c7e5e) — edição indicada pelo Notion: 2026-10-08T22:18:58.373Z.
- [VERTINAS](https://www.notion.so/2200a136355282d5b49901ab965a0da0) — edição indicada pelo Notion: 2026-10-08T22:19:45.834Z.
