# Revisão do Mercado Noturno — Notion atual

Preparada em 10/10/2026. O catálogo candidato ainda não foi publicado. A retirada dos quatro registros ausentes foi autorizada pela autora e aplicada no banco por arquivamento. A fonte anterior e os dados do Notion permanecem intactos.

## Resultado

- 374 registros candidatos: 273 itens, 52 runas, 39 escalpos e 10 modelos de companheiros.
- 370 identidades existentes preservadas; o critério de cada correspondência está em diff-revisao.json. Foram usados ID de origem, slug existente, nome + aplicação na mesma página e código + tipo do modelo de arma. Correspondências sem ID devem ser conferidas antes de publicar.
- Armas seguem Armas brancas, Armas de disparo, Armas de fogo e Armas de energia. Runas respeitam a seção própria e sua Aplicação.
- Dados técnicos explícitos de armaduras/escudos e dano simples são normalizados. Campos técnicos existentes e efeitos de automação são preservados.
- Nenhuma exclusão automática é preparada.

## Linhas novas

- Facas de Arremesso — armas_facas_de_arremesso.
- Aljava — ferramentas_aljava.
- Aljava Autoalimentadora — ferramentas_aljava_autoalimentadora.
- Cartucheira — ferramentas_cartucheira.

## Registros antigos sem correspondência direta

A autora confirmou que retirou essas mercadorias. Os quatro registros foram arquivados no banco e deixaram o catálogo publicado; nenhuma instância de personagem foi apagada ou remapeada.

- Faca — armas_armas_de_arremesso_e_disparo_faca.
- Lança — armas_armas_de_arremesso_e_disparo_lanca.
- Machado de mão — armas_armas_de_arremesso_e_disparo_machado_de_mao.
- Dardos — armas_dardos.

## Renomeações preservadas

- SW-80 Parallax (Rifle de precisão) → SW-80 Widowmaker (Rifle de precisão); slug preservado: armas_sw_80_parallax_rifle_de_precisao; critério: codigo_do_modelo_e_tipo_da_arma.
- DL-66 Widowmaker (Metralhadora) → DL-66 Maelstrom (Metralhadora); slug preservado: armas_dl_66_widowmaker_metralhadora; critério: codigo_do_modelo_e_tipo_da_arma.

## Pontos pendentes

- armas_facas_de_arremesso: Dano requer tradução: Corpo + 1d6 perfurante (arremesso); Corpo + 1d4 perfurante (corpo a corpo)
- armas_carabina: Raridade diverge entre tabela e verbete; revisar antes da publicação.
- armas_escopeta_curta: Raridade diverge entre tabela e verbete; revisar antes da publicação.
- armas_crioagulha: Propriedade sem contrato mecânico: congelamento
- armas_ofuscador: Propriedade sem contrato mecânico: ofuscamento
- armas_disruptor: Propriedade sem contrato mecânico: disrupcao
- armas_criojetor: Propriedade sem contrato mecânico: congelamento
- armas_lanca_crio: Propriedade sem contrato mecânico: congelamento
- armas_pente_fantasma: Raridade diverge entre tabela e verbete; revisar antes da publicação.
- armas_armas_de_fogo_serpentina: Raridade diverge entre tabela e verbete; revisar antes da publicação.
- armaduras_e_escudos_isolante: Raridade diverge entre tabela e verbete; revisar antes da publicação.

- Recarga e compatibilidade de munição precisam de vínculo explícito ao item de munição; preencher só a capacidade poderia ativar um modo de carregador errado.
- Alcance, empunhadura de duas mãos, capacidade de runas, slot independente de Trajes e efeitos especiais exigem integração com as regras correspondentes. Esta etapa não promete automação desses efeitos.
- Aljava, Aljava Autoalimentadora e Cartucheira são candidatos novos; compra/armazenamento possui contratos antigos específicos que precisam de adaptação.
- O Exotraje pesado veio com tabela e verbete consistentes na extração nova (quatro regiões); a divergência constatada na auditoria anterior foi corrigida na fonte.

## Arquivos

- fontes_notion/mercadorias.json: cópia atual, com IDs e organização.
- publicado-antes.json: cópia pública anterior usada na comparação; não contém personagens ou credenciais.
- catalogo-candidato.json: resultado isolado com os slugs preservados.
- diff-revisao.json: identidades, novos, ausentes e avisos.
- Os db_mercado_*.json intermediários usam slugs sugeridos, não devem ser publicados diretamente. O artefato correto para a revisão é catalogo-candidato.json.

## Reproduzir a preparação

~~~sh
node --import tsx scripts/notion/extrair-catalogos-v12.ts --mercadorias --saida content/v12/NOVA_REVISAO/fontes_notion
node --import tsx scripts/dev/v12/preparar_revisao_mercadorias.ts content/v12/NOVA_REVISAO content/v12/revisao-2026-10-10/publicado-antes.json
~~~

Antes de uma publicação futura, obter novamente a cópia publicada e verificar conflitos; a cópia salva aqui é somente o ponto de partida desta revisão.

## Retirada autorizada

Os quatro registros acima foram confirmados com status archived após a alteração. O registro da operação está em retiradas-aplicadas.json. Nenhuma outra mercadoria foi publicada por esta operação.
