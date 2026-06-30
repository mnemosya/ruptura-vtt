# Ruptura VTT — Tabelas-mestre

Contrato de dados para a Biblioteca do Sistema. Define quais registros são autoritativos, o que cada tabela contém, quais campos são chaves estrangeiras e para onde apontam. Os bancos de conteúdo (condições, talentos, escalpos, etc.) referenciam daqui em vez de redeclarar.

---

## Como ler este documento

Cada seção descreve uma tabela-mestre (vocabulário fechado, fonte única de verdade) ou uma tabela de conteúdo (registros editáveis na Biblioteca). O separador entre as duas camadas é simples: tabelas-mestre são populadas no código e não mudam sem deploy; tabelas de conteúdo são populadas via seed/import e são editáveis no painel admin.

**Notação de campo:**

- `→ tabela.campo` indica FK
- `[enum]` indica que o campo é restrito ao enum da tabela-mestre listada
- `?` indica campo opcional
- `JSONB` indica payload livre mas validado por schema ao publicar

---

## Parte I — Tabelas-mestre (vocabulário fechado)

Estas tabelas não têm painel de edição. Mudar um valor requer atualizar o schema dos bancos que o referenciam.

---

### M1 — atributos

Os três atributos do sistema. Imutáveis.

| id | nome | abreviacao |
|---|---|---|
| corpo | Corpo | C |
| mente | Mente | M |
| animo | Ânimo | A |

**Derivados diretos** (calculados, não armazenados por personagem):

| id | formula | recurso_zerado |
|---|---|---|
| pv_max | 10 + corpo | colapso_fisico |
| pe_max | 10 + mente | colapso_mental |
| mana_max | 10 + (animo × 2) | — |
| integridade_max | 10 + (animo × 2) | vestígio / casca |
| reacoes_por_rodada | mente | — |
| andar_m | 10 + corpo | — |
| correr_m | andar_m × 2 | — |
| pa_max | 3 (fixo) | — |

---

### M2 — pericias

21 perícias canônicas. Qualquer campo `pericia` em qualquer banco aponta para este enum.

| id | nome | atributo_primario | atributos_alternativos |
|---|---|---|---|
| arcanismo | Arcanismo | mente | — |
| artes | Artes | animo | corpo |
| balistica | Balística | corpo | mente |
| biologia | Biologia | mente | — |
| carisma | Carisma | animo | — |
| engenharia | Engenharia | mente | — |
| furtividade | Furtividade | corpo | — |
| influencia | Influência | mente | animo |
| intimidacao | Intimidação | animo | corpo |
| logica | Lógica | mente | — |
| luta | Luta | corpo | mente |
| mobilidade | Mobilidade | corpo | — |
| percepcao | Percepção | mente | — |
| precisao | Precisão | corpo | — |
| psicologia | Psicologia | mente | animo |
| reflexos | Reflexos | corpo | — |
| robotica | Robótica | mente | — |
| sociedade | Sociedade | mente | animo |
| tecnomagia | Tecnomagia | mente | — |
| vigor | Vigor | corpo | — |
| vontade | Vontade | animo | — |

---

### M3 — vertentes

6 vertentes mágicas. Campos `vertente` em qualquer banco referenciam este enum.

| id | nome | atributos_requisito |
|---|---|---|
| cinetica | Cinética | corpo |
| energetica | Energética | corpo |
| material | Material | corpo + mente |
| somatica | Somática | corpo + mente |
| sinaptica | Sináptica | mente |
| cognitiva | Cognitiva | mente |

Requisitos por nível (mínimo de atributo para investir):

| vertente | nv1 | nv2 | nv3 | nv4 | nv5 |
|---|---|---|---|---|---|
| cinetica | C2 | C3 | C3 | C4 | C5 |
| energetica | C2 | C3 | C3 | C4 | C5 |
| material | C1 M2 | C2 M2 | C2 M3 | C3 M3 | C3 M4 |
| somatica | C2 M1 | C2 M2 | C3 M2 | C3 M3 | C4 M3 |
| sinaptica | M2 | M3 | M3 | M4 | M5 |
| cognitiva | M2 | M3 | M3 | M4 | M5 |

---

### M4 — condicoes (enum de IDs)

17 condições canônicas. Campos `condicao`, `aplica_condicao`, `remove_condicao` em qualquer banco referenciam este enum. Os registros completos ficam na tabela de conteúdo C2.

```
agarrado  agarrando  atordoado  caido  cego  contundido  envenenado
imobilizado  inconsciente  insaturado  lento  ofuscado  queimando
sangrando  saturado  sufocando  surdo
```

---

### M5 — acoes (catálogo base)

**Fonte autoritativa: `db_acoes_combate_normalizado_v1_1.json`.** Esta tabela documenta o catálogo; os registros completos (teste, efeitos por margem, requisitos, modos, variantes) vivem no banco de ações de combate. São 28 ações. Campos `acao`, `base_acao`, `acoes_defensivas`, `defesas_permitidas` em qualquer banco referenciam este enum.

| id | nome | custo_pa | tipo | pericia_teste | visibilidade |
|---|---|---|---|---|---|
| deslocar | Deslocar-se | 1 | movimento | — | sempre |
| levantar | Levantar | 1 | movimento | — | condicao:caido |
| escapar | Escapar | 2 | movimento | — | condicao:agarrado,imobilizado |
| fintar | Fintar | 1 | ofensiva | influencia | sempre |
| interagir | Interagir | 1 | diversa | — | sempre |
| sacar_rapido | Sacar/Guardar (rápido) | 1 | diversa | — | sempre |
| sacar_dificil | Sacar/Guardar (difícil) | 2 | diversa | — | sempre |
| postura_ofensiva | Postura Ofensiva | 1 | ofensiva | — | sempre |
| atacar | Atacar | 2 | ofensiva | luta/precisao/balistica | sempre |
| agarrar | Agarrar | 2 | ofensiva | luta | sempre |
| estrangular | Estrangular | 2 | ofensiva | luta | sempre |
| derrubar | Derrubar | 2 | ofensiva | luta | sempre |
| empurrar | Empurrar | 2 | ofensiva | luta | sempre |
| desarmar | Desarmar | 2 | ofensiva | luta | sempre |
| postura_defensiva | Postura Defensiva | 1 | defensiva | — | sempre |
| aparar | Aparar | reacao | defensiva | luta | sempre |
| bloquear | Bloquear | reacao | defensiva | reflexos | sempre |
| esquivar | Esquivar | reacao | defensiva | reflexos | sempre |
| resistir | Resistir | reacao | defensiva | vigor/mobilidade | sempre |
| mirar | Mirar | 1 | diversa | percepcao | sempre |
| recarregar | Recarregar | 1 | diversa | — | sempre |
| acessar_trama | Acessar Trama | 2 | diversa | tecnomagia | sempre |
| preparar_turno | Preparar Turno | 1+acao+reacao | diversa | — | sempre |
| usar_pericia | Usar Perícia | 1 | diversa | variavel | sempre |
| falar | Falar | livre | livre | — | sempre |
| soltar_alvo | Soltar alvo | livre | livre | — | condicao:agarrando |
| gestos_rapidos | Gestos rápidos | livre | livre | — | sempre |
| apagar_fogo | Apagar fogo | 1 (interagir) | movimento | — | condicao:queimando |

**Nota de visibilidade:** `sempre` = aparece sempre no catálogo. `condicao:X` = só aparece quando o personagem tem aquela condição ativa. Nenhuma ação some por ausência de alvo, token ou adjacência (PRD §7.1).

---

### M6 — tipos_dano

| id | nome | afeta | subtipos | mecanica inerente |
|---|---|---|---|---|
| fisico | Físico | pv | cortante, contundente, perfurante | — |
| energetico | Energético | pv | igneo, gelido, eletrico | — |
| acido | Ácido | pv | acido | Estruturas com MIT/PD sofrem dobra redução (em vez de reduzir 1 ponto, reduzem 2) |
| toxico | Tóxico | pv | toxico | — |
| psiquico | Psíquico | pe | psiquico | — |
| trauma | Trauma | pe | trauma | — |

**Nota:** Resistência e vulnerabilidade *adicionais* a tipos específicos são propriedades de itens, escalpos, runas e magias. Exemplo: uma armadura pode ter resistência a Ácido (reduz dano ácido à metade além da regra de dobra redução). As mechânicas inerentes do tipo (como vulnerabilidade de ácido a MIT/PD) aplicam-se automaticamente; as adicionais vivem no payload do item.

---

### M7 — raridades

| id | label | disponivel_na_criacao |
|---|---|---|
| muito_comum | Muito Comum | sim |
| comum | Comum | sim |
| incomum | Incomum | sim |
| raro | Raro | não |
| muito_raro | Muito Raro | não |

---

### M8 — margem

Resultado de qualquer teste. A ordem é numérica crescente.

| id | label | valor_numerico |
|---|---|---|
| falha | Falha | 1 |
| falha_limitada | Falha Limitada | 2 |
| sucesso_limitado | Sucesso Limitado | 3 |
| sucesso_padrao | Sucesso | 4 |
| sucesso_critico | Sucesso Crítico | 5 |

---

### M9 — cadencias

Unidades de tempo de jogo. Qualquer campo `cadencia` referencia este enum.

| id | label | ordem | reseta_em |
|---|---|---|---|
| rodada | Rodada | 1 | encerrar_rodada |
| cena | Cena | 2 | encerrar_cena |
| combate | Combate | 3 | encerrar_cena |
| sessao_malha | Sessão na Malha | 4 | encerrar_cena |
| descanso_curto | Descanso curto | 5 | descanso_curto |
| descanso_longo | Descanso longo | 6 | descanso_longo |
| dia | Dia | 7 | descanso_longo |
| sessao | Sessão | 8 | inicio_de_sessao |
| missao | Missão | 9 | fim_de_missao |
| permanente | Permanente | 10 | nunca |
| enquanto_na_area | Enquanto na área | — | sair_da_area |

---

### M10 — tags_rolagem

Tags que uma rolagem pode carregar. Campos `alvo_tags` em efeitos de condição, escalpo e talento referenciam esta união: **{id de perícia} ∪ {tags semânticas abaixo}**. IDs de perícia são alvo_tags válidos sem duplicação aqui.

Tags semânticas (não são perícias):

```
acao          ofensiva      defensiva     visao         audicao
sentido       corpo         movimento     conjuracao    magia
reacao        sobrecarga    trama         malha         social
ataque_corpo_a_corpo   ataque_distancia   ataque_direcional   ataque_area
cobertura     terreno
```

Tags de domínio de rolagem (agrupam perícias por contexto — usados pelo prompt de rolagem, não por modificadores de condição):

```
combate       arcano        tecnica       medicina      programacao
robos         drones        analise       deducao       raciocinio
persuasao     manipulacao   emocao        presenca      performance
discricao     ocultacao     furtividade   velocidade    agilidade
coordenacao   resistencia   resistencia_mental  toxicologia
vida          conhecimento  cultura       historia      ciencia
construcao    reparo        criatividade  expressao     empatia
mira          distancia     arremesso     corpo_a_corpo arma_de_fogo
arma_energetica atencao     politica      medo
```

---

### M11 — tags_sistema

Tags de categorização para filtro e exibição na UI. Usadas nos campos `tags` dos registros de conteúdo.

```
acao           acao_remove    ambiente       arcano         arma
armadura       asfixia        ativo          audicao        companheiro
conjuracao     controle       cronometro     cura           dano
dano_continuo  defensiva      drone          economia       equipamento
escudo         falha_automatica  fim_de_rodada  fisico       furtividade
igneo          incapacitante  loja           magia          malha
mana           margem         mit            movimento      narrativo
ofensiva       pa             passivo        pd             penalidade
penalidade_atributo  penalidade_defensiva  penalidade_ofensiva
penalidade_pericia   pericia    postura       reacao        reduz_pa
relacional     remove_por_cura  restricao_movimento  risco_morte
robo           robotica       runa           saturacao      sentido
sobrecarga     social         suporte        teste_unico_por_cena
trama          trava_acao     trava_defensiva  trava_ofensiva  trava_reacao
veneno         visao          vulneravel
```

---

### M12 — status_conteudo

Estados de publicação. Todos os registros de conteúdo têm este campo.

| id | visivel_em |
|---|---|
| draft | admin apenas |
| published | admin + fichas + mesas |
| archived | admin (histórico); indisponível para novas seleções |

---

### M13 — familias_efeito

Famílias de despacho do motor de automação (derivadas do §12.1 do PRD). O motor despacha por `familia`; o campo `tipo` é subtipo descritivo para admin e log.

| id | descricao | subtipos_conhecidos |
|---|---|---|
| aquisicao_nivel | Marcador estrutural de requisito de nível anterior | talento_nivel_adquirido |
| modificador | +X ou −X em tags de rolagem específicas | modificador, ignorar_penalidade, substituir_bonus_acao, toggle_condicional, marcar_alvo_ou_detalhe, marcar_inimigo_afetado, detectar_falha_sem_teste |
| margem | Promoção, piso ou override de resultado de margem | promocao_margem, promocao_margem_manual, piso_margem, forcar_margem, token_sucesso_limitado |
| dado_gatilho | Dado adicional com gatilho de resultado | recurso_dado_gatilho |
| buff_empilhavel | Pilha de bônus que cresce por evento | buff_empilhavel |
| reacao | Reação gratuita, gatilhada ou contra-ataque | reacao_gratuita, reacao_gatilho, contra_ataque_sem_pa, reacao_cura_em_queda, gatilho_prevenir_zero_pv, override_turno_aliado |
| economia_pa | Reduz custo de PA de ação ou remove custo | reduzir_custo_pa, saque_sem_pa |
| aplicar_condicao | Aplica condição em margem menor ou troca dano por condição | aplicar_condicao_em_margem, trocar_dano_por_condicao, aplicar_penalidade_pos_critico, alterar_dado_condicao |
| ataque_adicional | Segundo ataque, rajada ou sequência no mesmo turno | ataque_extra, segundo_disparo, sequencia_arremessos, showdown |
| companheiro | Ações, PA e scripts de drone ou robô | companheiro_acao_extra, companheiro_bonus_primeiro_teste, companheiro_grupo_coordenado, companheiro_pa_bonus, companheiro_pa_por_rodada, companheiro_script, comando_livre_sem_custo, alterar_protocolo |
| trama | Comandos e leitura da Malha sem teste | comando_sem_teste, sondar_automatico |
| economia_loja | Desconto, fiado ou acesso a mercado | desconto_loja, compra_fiada, avaliar_mercadoria_sem_teste, conhecer_proximo_mercado_noturno |
| runa | Instalação, remoção ou ativação de runa sem custo | ativar_desativar_runa_sem_pa, instalar_remover_runa, aumentar_espacos_runa |
| troca_atributo | Usa atributo diferente do padrão no teste | trocar_atributo |
| recurso | Altera PV, PE, Mana, Sobrecarga ou estabiliza | aumentar_recurso, canalizar_mana, alterar_limite_sobrecarga, ruptura_imediata_sem_perda_integridade, estabilizar_aliado |
| protecao | Geometria defensiva: alcance de proteção, anulação de dano, cobertura | alterar_alcance_protecao, anular_dano_bloqueado, conceder_cobertura_pos_bloqueio |
| magia | Altera parâmetro de magia (alcance, área) | multiplicar_alcance_area_magia |
| propagacao_efeito | Estende ou propaga efeito positivo/negativo | estender_duracao_efeito_negativo, estender_efeito_positivo, dobrar_efeito_positivo, propagar_efeito_negativo |
| meta_talento | Modifica outro talento já adquirido | modificar_talento_existente |
| habilidade_narrativa | Efeito sem automação mecânica: exibe texto e rastreia cadência | acao_narrativa, escape_narrativo, encontrar_local_seguro, invocar_contato, recrutar_pn_aliado_temporario, forcar_abertura_social, ler_vulnerabilidade_social, manter_furtividade_em_movimento_exposto, nao_deixar_rastros_fisicos, reposicionamento_pos_acerto, briefing_pre_cena |
| regra_especial | Mecânica única que não cabe em padrão genérico | declarar_execucao, aprimorar_item_temporario |

---

### M14 — regioes_corpo

Regiões disponíveis para escolha após um acerto. Travadas por margem. **Fonte autoritativa do mapeamento margem→regiões: `db_campo_combate` (`regiao_corpo_ataque`).**

| id | label | margem_minima | modificador_dano | efeitos_criticos |
|---|---|---|---|---|
| tronco | Tronco | falha_limitada | −1 (em limitado) | não |
| bracos | Braços | sucesso_padrao | — | não |
| pernas | Pernas | sucesso_padrao | — | não |
| cabeca | Cabeça | sucesso_critico | +1 dado | sim |

Bandas de margem (de `db_campo_combate`): sucesso limitado (0–1) libera tronco com −1 dano; sucesso padrão (2–4) libera tronco, braços e pernas; sucesso crítico (5+) libera também cabeça com +1 dado. Dano em área sempre atinge tronco, independente da margem.

---

### M15 — pools_escalpo

Pools de espaço de escalpo. Campos `pool` nos slots de escalpo referenciam este enum.

| id | nome | tipo | capacidade | aberto_por |
|---|---|---|---|---|
| neural | Neural | global | 4 | — |
| interno | Interno | global | 5 | — |
| optica | Óptica | aberto_por_base | 3 | optica_runica |
| audicao | Audição | aberto_por_base | 2 | audicao_runica |
| braco | Braço | por_instancia | 2 por unidade, máx 2 | braco_runico |
| perna | Perna | por_instancia | 3 por unidade, máx 2 | perna_runica |
| moda | Moda | sem_limite_declarado | — | — |
| identidade | Identidade | sem_limite_declarado | — | — |

---

### M16 — recursos_personagem

Todos os recursos rastreados por personagem em jogo.

| id | nome | temporario | camada_antes_do_normal | some_em | calculado_de |
|---|---|---|---|---|---|
| pv | PV | não | — | — | 10 + corpo |
| pe | PE | não | — | — | 10 + mente |
| mana | Mana | não | — | — | 10 + (animo × 2) |
| integridade | Integridade | não | — | — | 10 + (animo × 2) |
| pv_temporario | PV Temporário | sim | pv | descanso_longo | fontes variáveis |
| mana_temporaria | Mana Temporária | sim | mana | descanso_longo | fontes variáveis |
| pa | PA | por_turno | — | fim_de_turno | 3 (máx) |
| sobrecarga | Sobrecarga | por_dia | — | descanso_longo | 0–3 surtos |
| ram | RAM | por_sessao_malha | — | sair_da_trama | definido pelo deck |

**Regra de empilhamento de temporários:** fontes iguais mantêm o maior valor; fontes diferentes somam.

---

### M17 — categorias_item

Tipos de item que a Biblioteca armazena. Usados no campo `categoria` de todos os registros da Biblioteca.

| id | label | tem_instancia | tem_munição | tem_slots_runa | tem_mit | tem_pd |
|---|---|---|---|---|---|---|
| arma | Arma | sim | depende | sim | não | não |
| armadura | Armadura | sim | não | sim | sim | não |
| escudo | Escudo | sim | não | sim | não | sim |
| explosivo | Explosivo | sim (qtd) | não | não | não | não |
| farmacia | Farmácia | sim (cargas) | não | não | não | não |
| vertina | Vertina | sim (cargas) | não | não | não | não |
| ferramenta | Ferramenta | sim (cargas) | não | não | não | não |
| dispositivo | Dispositivo | sim (cargas) | não | não | não | não |
| escalpo | Escalpo | sim | não | não | não | não |
| runa | Runa | sim | não | não | não | não |
| drone | Drone | sim | não | sim | sim | não |
| robo | Robô | sim | não | sim | sim | não |
| veiculo | Veículo | sim | depende | não | sim | não |
| magia | Magia | não (modelo) | não | não | não | não |
| talento | Talento | não (modelo) | não | não | não | não |

---

---

### M18 — tamanhos

**Fonte autoritativa: `db_campo_combate` (`tamanhos`).** Ocupação no grid hexagonal (1 m por célula).

| id | label | ocupacao | altura |
|---|---|---|---|
| pequeno | Pequeno | 1 célula | até 1 m |
| medio | Médio | 1 célula | 1 a 2 m |
| grande | Grande | 2×2 | 2 a 3 m |
| enorme | Enorme | 3×3 | 3 a 5 m |
| colossal | Colossal | 4×4 ou mais | 5 m ou mais |

---

### M19 — formas_area

**Fonte autoritativa: `db_campo_combate` (`areas`).** Usadas por magias, explosivos e armas de área. Regra geral: célula é afetada quando a área cobre pelo menos metade dela.

| id | símbolo | origem | parâmetros |
|---|---|---|---|
| esfera | ◎ | ponto | raio_m |
| domo | ◯ | ponto na superfície | raio_m |
| aura | ⊙ | personagem | raio_m |
| linha | — | célula origem | comprimento_m (largura 1) |
| faixa | ═ | célula origem | comprimento_m, largura_m |
| parede | ▭ | célula origem | comprimento_m, altura_m (largura 1, bloqueia) |
| cubo | ▢ | ponto | lado_m |
| cone | ◢ | célula ocupada/ponto | alcance_m (abertura 45°) |

---

### M20 — alcances

**Fonte autoritativa: `db_campo_combate` (`alcances`).** Alvo válido exige alcance + linha de visão + linha de efeito.

| id | label | medição |
|---|---|---|
| pessoal | Pessoal | só o próprio |
| adjacente | Adjacente | células que tocam o espaço ocupado |
| distancia | Distância | centro da célula origem até célula alvo, em metros |

---

### M21 — cobertura

**Fonte autoritativa: `db_campo_combate` (`cobertura`, `protecao_improvisada`).**

Graus: parcial (−1 ofensiva direcional contra o alvo), maior (−2), total (inalvejável por ataque direcional).

Durabilidade de cobertura por PD: frágil 2–5, média 6–15, resistente 16+. Proteções improvisadas (Bloquear): frágil 1–3, média 4–7, resistente 8–12.

Impacto em falha: falha limitada atinge cobertura de qualquer tamanho; falha padrão atinge grande/enorme/colossal; falha crítica não reduz PD.

---

### M22 — terrenos

**Fonte autoritativa: `db_campo_combate` (`terrenos`).**

| id | efeito |
|---|---|
| dificil | deslocamento custa o dobro; Manobrar ignora |
| elevado | +1 em ataque à distância de cima, se diferença ≥ 3 m |

---

### M23 — condicoes_ambientais

**Fonte autoritativa: `db_campo_combate` (`condicoes_ambientais`).**

| id | efeito |
|---|---|
| iluminacao_baixa | −1 em testes de visão |
| escuridao | falha automática em visão; ofensiva vira teste simples se posição conhecida por outro sentido |
| nevoa | alcance visual 3 m; −2 em ataque à distância |
| chuva | dano ígneo −1, dano elétrico +1 |
| tempestade_arcana | aplica Saturado em todas as criaturas na área |

---

## Parte II — Tabelas de conteúdo (Biblioteca do Sistema)

Registros editáveis no painel admin. Cada tabela herda campos obrigatórios de controle:

```
id            slug (estável, nunca renomeado)    nome
categoria     categoria_label                    raridade → M7
descricao_curta   descricao_longa               tags → M11
status → M12  versao (semver)                   created_at  updated_at
payload_automacao JSONB (validado por schema ao publicar)
```

---

### C1 — talentos

22 talentos canônicos, cada um com 3 níveis. Cada nível é um registro separado com seu próprio payload.

Campos adicionais:

```
talento_id → talentos.id   (FK para o talento pai)
nivel       [1|2|3]
requisitos  → M2 (perícias) + M3 (vertentes) + talento_nivel_adquirido
familia_efeito → M13
```

---

### C2 — condicoes

17 condições canônicas.

Campos adicionais:

```
duracao_padrao?           remove_por []
acoes_habilitadas []      → M5.id
payload_automacao.efeitos[].tipo → M13.subtipos_conhecidos
payload_automacao.efeitos[].alvo_tags → M10 ∪ M2.id
```

---

### C3 — escalpos

58 escalpos.

Campos adicionais:

```
custo_integridade   slot.pool → M15.id   slot.modo [consome|abre_pool]
requisitos []       pools_de_espaco → M15
payload_automacao.efeitos[].condicao → M4
```

---

### C4 — magias

Pendente de normalização. Aguarda o artefato *A Magia* reescrito como fonte de verdade. Campos esperados quando normalizado:

```
vertente → M3.id    nivel [1–5]    tipo_magia [ataque|controle|suporte|utilidade]
custo_mana (placeholder até playtest)
pericia_teste → M2.id
duracao    alcance_m    area?
resistencia? → {acao: M5.id, pericia: M2.id, cd: int}
especializacoes? []
```

---

### C5 — especializacoes

Vinculadas a uma vertente e aplicáveis por direção de efeito (não como tag fixa na magia).

```
vertente → M3.id
descricao_curta   descricao_longa
criterio_aplicacao   (texto: quando o narrador considera que se aplica)
```

---

### C6 — itens (armas, armaduras, etc.)

Uma tabela ou views por categoria (PRD §2.1.8 recomenda `content_items`). Campos variáveis por categoria:

**Todos:**
```
categoria → M17.id   preco_aretz   preco_cdi?
```

**Armas:**
```
tipo_dano → M6.id   dado_dano   alcance [corpo_a_corpo|arremesso|curto|medio|longo]
propriedades [] → C9   munição_max?   rajada?   soma_atributo → M1.id?
```

**Armaduras:**
```
mit_base   regioes [] → M14.id   tipo_protecao [fisica|energetica|hibrida]
penalidade_pericias [] → {pericia → M2.id, valor: int}
```

**Escudos:**
```
pd_max   tipo_protecao [fisica|hibrida]
```

**Explosivos:**
```
custo_pa   alcance_arremesso   area_m   pericia_teste → M2.id
efeitos [] (dano + condição por margem)
```

**Farmácia / Vertinas / Ferramentas / Dispositivos:**
```
cargas_max   duracao_buff?   efeitos []
```

---

### C7 — runas

```
slots_possiveis [] → M17.id   (em que tipo de equipamento pode ser instalada)
custo_integridade?   requisito_pericia? → M2.id
```

---

### C8 — drones_e_robos

```
pv_base   mit_base   deslocamento_m   pa_base
acoes_proprias [] → M5.id
modo_controle [pilotado|autonomo|misto]
pericia_controle → M2.id
slots_runa → C7
```

---

### C9 — propriedades_arma

14 propriedades canônicas (banco já existe; listadas aqui para referência cruzada).

```
id   nome   descricao   custo_pa_adicional?   efeito_critico JSONB
aplica_condicao? → M4   margem_minima? → M8
```

---

### C10 — acoes_homebrew

Ações extras criadas por talento, escalpo ou mesa. Estendem M5 sem editar a tabela-mestre.

```
base_acao? → M5.id   custo_pa   tipo → [ofensiva|defensiva|movimento|diversa|livre|reacao]
pericia_teste → M2.id   visibilidade → [sempre|condicao:M4.id|equipamento:C6.id|talento:C1.id]
payload_automacao JSONB
```

---

## Parte III — Tabelas de instância (por campanha/personagem)

Não são editadas na Biblioteca. Vivem no escopo da campanha.

### I1 — personagem

```
campanha_id   perfil_id   nome   alcunha   conceito   origem   rpi
atributos {corpo, mente, animo}       (valores 1–5)
pericias {} → M2.id                   (valores 0–5)
vertentes {} → M3.id                  (níveis 0–5)
talentos [] → C1.id + nivel
recursos_atuais {pv, pe, mana, integridade, pa_gasto, sobrecarga, ram?}
condicoes_ativas [] → M4 + timestamp + fonte
escalpos_instalados [] → C3.id + custo_integridade_pago
pm_historico []
integridade_faixas → calculado de M1.integridade_max
```

### I2 — inventario_personagem

```
personagem_id   item_id → C6.id / C7.id / C8.id
quantidade   cargas_atuais?   munição_atual?
mit_atual? pd_atual?   runas_instaladas [] → C7.id
nome_customizado?   notas?   equipado [equipado|rapido|mochila]
```

### I3 — inventario_bando

```
campanha_id   item_id → C6.id   quantidade
transferencias_log []
```

### I4 — instancia_escalpo_personagem

```
personagem_id   escalpo_id → C3.id
slot_ocupado → M15.id   integridade_paga
efeitos_ativos []   usos_restantes_por_cadencia {}
```

### I5 — efeitos_ativos

Buffs, debuffs, posturas, Mirar, Fintar e efeitos temporários em jogo.

```
personagem_id   fonte_tipo [talento|escalpo|item|condicao|acao|magia|narrador]
fonte_id?   descricao   alvo_tags [] → M10
valor?   cadencia → M9.id   usos_restantes?   expira_em?
reversivel [sim|nao]   criado_em   modificado_em
```

### I6 — log_mesa

```
campanha_id   tipo [rolagem|dano|cura|condicao|item|evolucao|chat|sistema]
personagem_id?   ator_id   alvo_id?
descricao   dados_brutos JSONB   visivel_para [todos|narrador|jogador]
timestamp
```

### I7 — estado_combate

```
campanha_id   rodada   janela [rapida|lenta]   lado_ativo [pj|pn]
turnos_rapidos_usados [] → personagem_id
turnos_lentos_usados [] → personagem_id
sobrecarga_pendente [] → personagem_id
ruptura_pendente [] → personagem_id
```

### I8 — carteira_personagem

```
personagem_id
aretz           (fora do circuito imperial)
cdi             (Carteira Digital Imperial, rastreável)
cdi_craqueada   (CDI fora do rastreio imperial)
log_transacoes []
```

---

## Parte IV — Regras de binding (contrato de engine)

Essas regras precisam estar no código, não nos dados.

### B1 — resolução de alvo_tags

Ao aplicar um efeito com `alvo_tags`, o motor faz a união:

```
tags_efetivas = tags_da_rolagem ∪ {id_pericia_da_rolagem} ∪ {tags_de_acao}
```

Se a intersecção com `alvo_tags` do efeito for não-vazia, o efeito se aplica.

### B2 — resistência com escolha de perícia

Quando `resistencia.acao` existe (ex.: Resistir), o alvo escolhe entre as perícias listadas em `resistencia.pericias_possiveis` antes de rolar.

### B3 — instâncias vs modelos

Texto, regra, raridade, preço-base e payload padrão vêm do modelo na Biblioteca. Quantidade, cargas, MIT/PD atuais, runas instaladas, nome customizado e estado de uso ficam na instância. Atualizar o modelo não destrói instâncias; a instância sobrescreve os campos de estado.

### B4 — visibilidade de ações

Ações com `visibilidade = sempre` aparecem sempre. Ações com `visibilidade = condicao:X` aparecem quando `X ∈ personagem.condicoes_ativas`. Nenhuma ação some por ausência de alvo, token, munição, adjacência ou linha de visão; isso vira aviso de requisito no catálogo.

### B5 — temporários e empilhamento

PV temporário e Mana temporária são consumidos antes do recurso normal. Fontes iguais mantêm o maior valor; fontes diferentes somam. Somem no descanso longo.

### B6 — gatilhos de tempo

| Gatilho | Quem aciona | O que resolve |
|---|---|---|
| Encerrar turno | Jogador | Marca turno como usado na janela; expira efeitos de escopo turno |
| Encerrar rodada | Narrador | Fim de rodada de condições (Queimando, Sangrando, Envenenado, Sufocando); reseta reações; expira duração 1_rodada |
| Encerrar cena | Narrador | Ruptura pendente; fim de efeitos por cena; zera cadências de cena e combate |
| Descanso curto | Jogador | Recupera metade da Mana; recursos marcados descanso_curto |
| Descanso longo | Jogador | PV +Corpo+2; PE +Mente+2; Mana ao máximo; remove temporários; reseta Sobrecarga; recursos marcados descanso_longo |

### B7 — conteúdo oficial vs mesa vs homebrew

```
Oficial  →  editável apenas por admin/dev
Mesa     →  narrador pode sobrescrever; só vale naquela campanha
Instância → estado real em uso; guarda overrides individuais
```

### B8 — Modo Jogo vs Modo Evolução

Modo Jogo: apenas recursos atuais, PA, reações, condições, munição, MIT/PD, Sobrecarga, notas são editáveis.
Modo Evolução: atributos, perícias, vertentes, talentos, PA máximo e PM são editáveis. Ao subir atributo, derivados máximos e atuais recalculam; a diferença é adicionada ao valor atual quando aplicável.

---

## Apêndice — O que ainda falta normalizar

| Conteúdo | Status | Bloqueado por |
|---|---|---|
| Magias e especializações | Pendente | Artefato *A Magia* reescrito (fonte de verdade) |
| Catálogo de ações homebrew | Modelo definido (C10) | Nenhum; pode seedar junto com C2 |
| Itens, armas, armaduras, etc. | Modelo definido (C6) | Dados dos capítulos ainda não normalizados |
| Runas | Modelo definido (C7) | Capítulo de runas não normalizado |
| Drones e robôs | Modelo definido (C8) | Capítulo de drones não normalizado |
| Propriedades de arma | Banco existe | Pode importar; integrar com C6 |
| Explosivos, farmácia, vertinas | Modelo definido (C6 por categoria) | Capítulos não normalizados |
| Veículos | Modelo mínimo definido | Baixa prioridade (PRD §13.11) |
| Colapso | Regras em regras_personagem | Sem banco próprio; lógica vai no motor |
| Cartões jogáveis | Derivados de C1–C6 + I5 | Nenhum; renderizados em runtime |

