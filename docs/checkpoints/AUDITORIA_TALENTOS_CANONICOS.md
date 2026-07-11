# Auditoria canônica dos talentos (CP0)

Reconciliação entre o capítulo canônico **`docs/fontes/11 TALENTOS 7610a1363552827da5f001dccc05111e.md`**
(fonte oficial, prevalece sobre payloads, PRD e código) e o banco normalizado
**`content/db_talentos_normalizado_v1_3.json`** (importado em `content_documents`,
`content_type = "talent"`).

## Método

Para cada um dos 66 níveis foram comparados: nome, slug, árvore, nível, descrição,
cadência, tipo de efeito, requisitos, gatilhos, modificadores, condições, recursos,
duração e usos.

## Resultado global

O banco `db_talentos_normalizado_v1_3.json` foi **gerado a partir deste mesmo
capítulo** — `_meta.fonte = "talentos.md"`, `_meta.versao_schema = "1.3.0"`,
`_meta.hash_sha256_origem` registrado, `total_talentos = 22`, `total_niveis = 66`.
A auditoria confirmou **alinhamento total**: nomes, slugs, árvores, níveis,
cadências, durações, gatilhos e valores numéricos batem com o capítulo.

- **Nenhuma correção de valor foi necessária** — não houve divergência de cadência
  (`Fúria` usa `fim_do_proximo_turno`, não `rodada`; `Muralha`/`1 Tiro` usam
  `fim_da_rodada`; `Toque de Midas` usa `dia`/`1 hora`), duração, bônus ou usos.
- **Slugs preservados** no formato `{arvore}_{talento}` — nenhum remapeamento de
  slug legado é necessário; personagens que já armazenam `nivelId` continuam
  resolvendo o mesmo nível.
- **Observação registrada, sem alteração:** `Tecelão › Bypass` e `Tecelão › Agulha
  Fina` usam a cadência `sessao_malha` (enum válido). O capítulo diz "uma vez por
  Sessão"; ambas as cadências resetam manualmente hoje (sem gatilho canônico de fim
  de sessão), então a semântica não é alterada. Mantido `sessao_malha` para não
  alterar cadência já publicada; documentado aqui para rastreabilidade.

Os payloads já expõem o tipo estruturado de efeito por nível, o que habilita os
checkpoints seguintes (CP2–CP13) a operar cada talento sem inventar regras.

## Padrões operacionais

Cada nível cai em um dos 4 padrões-alvo:

- **Automático (A)** — modificador/troca/promoção de margem aplicada direto no fluxo.
- **Contextual (C)** — dispara em gatilho de evento (reação, dano sofrido, crítico).
- **Atividade própria (P)** — botão com usos/cadência (recurso, ataque extra, item).
- **Narrativo rastreado (N)** — atividade narrativa logada e resolvida com o narrador.

## Tabela (66 níveis)

| Árvore | Nome | Nível | Slug canônico | Estado do payload anterior | Correção realizada | Padrão operacional | Dependências |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Artífice | Bricolagem | 1 | `artifice_bricolagem` | Alinhado (`detectar_falha_sem_teste` + `modificador` Engenharia/Robótica) | Nenhuma | A + N (detecção sem teste, +1 aplicado no fluxo) | Rolagem de perícia |
| Artífice | Toque de Midas | 2 | `artifice_toque_de_midas` | Alinhado (`aprimorar_item_temporario`, 1/dia, 1h) | Nenhuma | P | Item/equipamento, efeito temporário |
| Artífice | Gambiarra Expressa | 3 | `artifice_gambiarra_expressa` | Alinhado (`acao_narrativa`, 1/sessão) | Nenhuma | N | Inventário/material base |
| Assassino | Lâmina Oculta | 1 | `assassino_lamina_oculta` | Alinhado (`promocao_margem` + `reposicionamento_pos_acerto`) | Nenhuma | C | Estado "alvo não percebe", ataque |
| Assassino | Hemorragia | 2 | `assassino_hemorragia` | Alinhado (`aplicar_condicao_em_margem` Sangrando + `1d8` no crítico) | Nenhuma | C | Propriedade Sangramento, condições |
| Assassino | Executar | 3 | `assassino_executar` | Alinhado (`declarar_execucao`, 1/cena) | Nenhuma | P + C | PV do alvo, condições Imobilizado/Atordoado |
| Atirador de Elite | 1 Tiro, 1 Acerto | 1 | `atirador_de_elite_1_tiro_1_acerto` | Alinhado (`substituir_bonus_acao` Mirar, +2/+3) | Nenhuma | C | Estado Mirar (CP4) |
| Atirador de Elite | À Espreita | 2 | `atirador_de_elite_a_espreita` | Alinhado (`piso_margem`) | Nenhuma | C | Estado Mirar, "alvo não percebe" |
| Atirador de Elite | Headshot | 3 | `atirador_de_elite_headshot` | Alinhado (`forcar_margem` crítico) | Nenhuma | C | Estado Mirar (CP4) |
| Berserker | Fúria | 1 | `berserker_furia` | Alinhado (`buff_empilhavel` +1..+3, `fim_do_proximo_turno`) | Nenhuma | C | Efeito temporário, gatilho sofrer dano |
| Berserker | Sede de Sangue | 2 | `berserker_sede_de_sangue` | Alinhado (`toggle_condicional` < metade PV) | Nenhuma (migrado em 8f6faf1) | C | PV, efeito temporário |
| Berserker | Último Fôlego | 3 | `berserker_ultimo_folego` | Alinhado (`gatilho_prevenir_zero_pv`, 1/cena) | Nenhuma (migrado em 8f6faf1) | C | PV, fim de cena |
| Dissecador | Golpe Cirúrgico | 1 | `dissecador_golpe_cirurgico` | Alinhado (`trocar_atributo` Corpo→Mente + `penalidade_pos_critico`) | Nenhuma | A + C | Atacar/Desviar, arma contundente |
| Dissecador | Fincada | 2 | `dissecador_fincada` | Alinhado (`trocar_dano_por_condicao`, 1/rodada) | Nenhuma | P + C | Dano corpo a corpo contundente, condições |
| Dissecador | Contra-medida | 3 | `dissecador_contra_medida` | Alinhado (`reacao_gatilho` erro do inimigo) | Nenhuma | C | Reação, ataque desarmado/contundente |
| Droneiro | Sinal Limpo | 1 | `droneiro_sinal_limpo` | Alinhado (`promocao_margem` + `companheiro_pa_bonus` 1/cena) | Nenhuma | A + P | Modelo de drone (CP12) |
| Droneiro | Script | 2 | `droneiro_script` | Alinhado (`companheiro_script`, gatilho salvo) | Nenhuma | P + C | Modelo de drone, gatilho |
| Droneiro | Enxame | 3 | `droneiro_enxame` | Alinhado (`companheiro_grupo_coordenado`, 1/dia) | Nenhuma | P | Modelo de drone (CP12) |
| Espadachim | Aparar | 1 | `espadachim_aparar` | Alinhado (`modificador` +1 + `promocao_margem_manual` 1/cena) | Nenhuma | A + P | Arma de lâmina, Aparar |
| Espadachim | Estocar | 2 | `espadachim_estocar` | Alinhado (`reduzir_custo_pa`, 1/combate) | Nenhuma | P | Custo de PA, ataque de lâmina |
| Espadachim | Ripostar | 3 | `espadachim_ripostar` | Alinhado (`contra_ataque_sem_pa`, 1/rodada) | Nenhuma | C | Reação, crítico em Aparar |
| Estrategista | Falcão | 1 | `estrategista_falcao` | Alinhado (`marcar_alvo_ou_detalhe`, 1/cena) | Nenhuma | P + N | Marca sobre alvo/detalhe, bônus a aliado |
| Estrategista | Briefing de Campo | 2 | `estrategista_briefing_de_campo` | Alinhado (`briefing_pre_cena`, 3 aliados) | Nenhuma | N | Aliados, rerrolagem |
| Estrategista | Imposição de Ritmo | 3 | `estrategista_imposicao_de_ritmo` | Alinhado (`override_turno_aliado` + `modificar_talento_existente` → Briefing 6) | Nenhuma | P + meta | Ordem de turno, Briefing |
| Guardião | Sentinela | 1 | `guardiao_sentinela` | Alinhado (`reacao_gratuita` Bloquear + `alterar_alcance_protecao`) | Nenhuma | C | Reação, aliados protegidos (1m) |
| Guardião | Blindagem | 2 | `guardiao_blindagem` | Alinhado (`modificador` +1 + `anular_dano_bloqueado` 1/cena) | Nenhuma | C | Bloquear |
| Guardião | Muralha | 3 | `guardiao_muralha` | Alinhado (`conceder_cobertura_pos_bloqueio`, `fim_da_rodada`) | Nenhuma | C | Bloquear, cobertura direcional |
| Mago de Batalha | Domínio Territorial | 1 | `mago_de_batalha_dominio_territorial` | Alinhado (`multiplicar_alcance_area_magia` ×1.5) | Nenhuma | A | Magia de ataque |
| Mago de Batalha | Canalizar | 2 | `mago_de_batalha_canalizar` | Alinhado (`canalizar_mana`, 1/rodada) | Nenhuma | P | Mana, dano de magia |
| Mago de Batalha | Ascensão | 3 | `mago_de_batalha_ascensao` | Alinhado (`ruptura_imediata_sem_perda_integridade` + limite sobrecarga 5) | Nenhuma | A + N | Integridade, Surto/Sobrecarga |
| Malabarista | Saque Fantasma | 1 | `malabarista_saque_fantasma` | Alinhado (`saque_sem_pa` + `ignorar_penalidade` Rajada) | Nenhuma | A + C | Arma leve de Arremesso |
| Malabarista | Revoada | 2 | `malabarista_revoada` | Alinhado (`ataque_extra`, 1/rodada) | Nenhuma | C | Acerto com arma leve arremessada |
| Malabarista | Espetáculo Mortal | 3 | `malabarista_espetaculo_mortal` | Alinhado (`sequencia_arremessos`, 1/cena, 3 armas) | Nenhuma | P | 3 armas leves de arremesso |
| Manipulador | Olhar Penetrante | 1 | `manipulador_olhar_penetrante` | Alinhado (`promocao_margem` Influência/Psicologia) | Nenhuma | A | Influência/Psicologia |
| Manipulador | Entrelinhas | 2 | `manipulador_entrelinhas` | Alinhado (`ler_vulnerabilidade_social`, 1/cena) | Nenhuma | N | Psicologia, marca de vulnerabilidade |
| Manipulador | Puxar os Fios | 3 | `manipulador_puxar_os_fios` | Alinhado (`forcar_abertura_social`, requer Entrelinhas) | Nenhuma | N | Entrelinhas, Influência |
| Mecatrônico | Chave de Arranque | 1 | `mecatronico_chave_de_arranque` | Alinhado (`promocao_margem` + `companheiro_bonus_primeiro_teste`) | Nenhuma | A + P | Modelo de robô (CP12) |
| Mecatrônico | Marcha Dupla | 2 | `mecatronico_marcha_dupla` | Alinhado (`companheiro_acao_extra`, 1/cena) | Nenhuma | P | Modelo de robô |
| Mecatrônico | Overclock | 3 | `mecatronico_overclock` | Alinhado (`companheiro_pa_por_rodada`, 1/dia) | Nenhuma | P | Modelo de robô (CP12) |
| Mercador | Garimpo de Rua | 1 | `mercador_garimpo_de_rua` | Alinhado (desconto 20% + próximo mercado + avaliação sem teste) | Nenhuma | P + A | Mercado Noturno |
| Mercador | Caderneta de Dívida | 2 | `mercador_caderneta_de_divida` | Alinhado (`compra_fiada`, 1/sessão, até Raro) | Nenhuma | N | Loja, dívida rastreada |
| Mercador | Rede de Favores | 3 | `mercador_rede_de_favores` | Alinhado (`recrutar_pn_aliado_temporario`, 1/sessão) | Nenhuma | N | PN aliado temporário |
| Paramédico | Pronto-socorro | 1 | `paramedico_pronto_socorro` | Alinhado (`estabilizar_aliado`, 1/cena, adjacente 0 PV) | Nenhuma | P | PV do aliado, adjacência manual |
| Paramédico | Ritmo de Campo | 2 | `paramedico_ritmo_de_campo` | Alinhado (`reduzir_custo_pa` cura, min 1) | Nenhuma | A | Ações de cura, PA |
| Paramédico | Protocolo de Emergência | 3 | `paramedico_protocolo_de_emergencia` | Alinhado (`reacao_cura_em_queda`, 1/cena, 5m) | Nenhuma | C | Reação, aliado em queda, Medkit/cura |
| Pistoleiro | Gatilho Quente | 1 | `pistoleiro_gatilho_quente` | Alinhado (`recurso_dado_gatilho` 3×d8, descanso longo) | Nenhuma | P | Reserva de dados de gatilho (CP10) |
| Pistoleiro | Bang Bang | 2 | `pistoleiro_bang_bang` | Alinhado (`aumentar_recurso` +1 + `segundo_disparo`) | Nenhuma | P + C | Reserva de dados de gatilho |
| Pistoleiro | Showdown | 3 | `pistoleiro_showdown` | Alinhado (`aumentar_recurso` +1 + `showdown`, 1/cena, até 3 dados) | Nenhuma | P | Reserva de dados de gatilho (CP10) |
| Praga | Marca da Dor | 1 | `praga_marca_da_dor` | Alinhado (`marcar_inimigo_afetado`, 1/rodada) | Nenhuma | C | Efeitos negativos no inimigo |
| Praga | Sangria Lenta | 2 | `praga_sangria_lenta` | Alinhado (`estender_duracao_efeito_negativo` +1 rodada) | Nenhuma | A | Duração de efeitos negativos |
| Praga | Contágio | 3 | `praga_contagio` | Alinhado (`propagar_efeito_negativo`, 1/cena, 3m) | Nenhuma | P + C | Efeitos negativos, alcance manual |
| Rato de Rua | Zé da Esquina | 1 | `rato_de_rua_ze_da_esquina` | Alinhado (`invocar_contato`, 1/missão) | Nenhuma | N | Contato/recurso narrativo |
| Rato de Rua | Gato de Telhado | 2 | `rato_de_rua_gato_de_telhado` | Alinhado (`encontrar_local_seguro`, 1/dia urbano) | Nenhuma | N | Local seguro narrativo |
| Rato de Rua | Saída dos Fundos | 3 | `rato_de_rua_saida_dos_fundos` | Alinhado (`escape_narrativo`, 1/dia) | Nenhuma | N | Escape com consequência menor |
| Rúnico | Gatilho Rúnico | 1 | `runico_gatilho_runico` | Alinhado (`ativar_desativar_runa_sem_pa`) | Nenhuma | A + P | Sistema de runas |
| Rúnico | Entalhe Rápido | 2 | `runico_entalhe_rapido` | Alinhado (`instalar_remover_runa`, 1 PA + teste) | Nenhuma | P | Sistema de runas, Engenharia |
| Rúnico | Sobregravação | 3 | `runico_sobregravacao` | Alinhado (`aumentar_espacos_runa` ×2) | Nenhuma | A | Espaços de runa em equipamento |
| Sorrateiro | Passo Fantasma | 1 | `sorrateiro_passo_fantasma` | Alinhado (`promocao_margem` Furtividade + sem rastros) | Nenhuma | A + N | Estado Furtividade (CP4) |
| Sorrateiro | Camuflagem Óptica | 2 | `sorrateiro_camuflagem_optica` | Alinhado (`manter_furtividade_em_movimento_exposto`) | Nenhuma | C | Estado Furtividade, linha de visão manual |
| Sorrateiro | Ataque Fatal | 3 | `sorrateiro_ataque_fatal` | Alinhado (`forcar_margem` a partir de furtividade) | Nenhuma | C | Estado Furtividade (CP4) |
| Tecelão | Olho de Botão | 1 | `tecelao_olho_de_botao` | Alinhado (`sondar_automatico`, 2 níveis) | Nenhuma | A + N | Sistema Trama/Malha (CP13) |
| Tecelão | Bypass | 2 | `tecelao_bypass` | Alinhado (`comando_sem_teste`, `sessao_malha`) — ver observação | Nenhuma (cadência mantida) | P | Sistema Trama/Malha |
| Tecelão | Agulha Fina | 3 | `tecelao_agulha_fina` | Alinhado (`comando_livre_sem_custo`, `sessao_malha`) — ver observação | Nenhuma (cadência mantida) | P | Sistema Trama/Malha (CP13) |
| Totem | Benção | 1 | `totem_bencao` | Alinhado (`promocao_margem` + `token_sucesso_limitado` 1/cena) | Nenhuma | A + C | Efeitos positivos |
| Totem | Onda Solidária | 2 | `totem_onda_solidaria` | Alinhado (`estender_efeito_positivo` a 2º aliado) | Nenhuma | C | Efeitos positivos, adjacência manual |
| Totem | Chama Redobrada | 3 | `totem_chama_redobrada` | Alinhado (`dobrar_efeito_positivo`, 1/cena) | Nenhuma | P | Efeitos positivos |

## Conclusão

66/66 níveis auditados e confirmados alinhados ao capítulo canônico. Nenhuma
alteração de payload foi necessária para corrigir divergência de regra. Os tipos
de efeito estruturados já presentes servem de base para a engine operacional (CP1)
e para a automação por árvore (CP2–CP13).
