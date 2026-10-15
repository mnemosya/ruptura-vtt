# Mapeamento de classes e subclasses para a interface do VTT

Levantamento em 13/10/2026. Escopo: regras de acompanhamento das **7 classes e 24 subclasses** de Ruptura 1.2, lidas diretamente no Notion. Este documento é um levantamento funcional; não implementa telas nem altera regras.

As tabelas descrevem requisitos extraídos das regras. As sugestões de organização são propostas de UX, identificadas como tal. “Controle” pode ser uma informação derivada, um registro ou uma ação; não significa necessariamente acrescentar um botão manual.

## Cobertura e fontes

A coleção CLASSES foi consultada integralmente: 7 registros, `has_more: false`. As 24 subclasses estão nas próprias páginas das classes. Foram lidos os blocos de características, as tabelas mecânicas e os repertórios de manobras, preparos, companheiros, funções e modificações. Não houve indicação de truncamento ou blocos desconhecidos nas respostas dessas páginas.

| Fonte | Última edição informada pelo Notion | Subclasses |
|---|---|---|
| [Âncora](https://app.notion.com/p/3d90a1363552800aa253ecb7b72a8b0d) | 04/10/2026 | Coordenador, Terapeuta, Vitalista |
| [Caçador](https://app.notion.com/p/3d90a13635528034a166dbb1dd0c2b3b) | 04/10/2026 | Assassino, Atirador de Elite, Domador, Perito |
| [Combatente](https://app.notion.com/p/3d90a13635528088ac28caeaca52d623) | 04/10/2026 | Acrobata, Brutalista, Dissecador, Mago de Batalha |
| [Face](https://app.notion.com/p/3d90a136355280b18fc8e6819e95616f) | 04/10/2026 | Ícone, Mercador, Rato de Rua |
| [Infiltrador](https://app.notion.com/p/3d90a1363552807294c8d481c179bf01) | 05/10/2026 | Batedor, Sorrateiro |
| [Técnico](https://app.notion.com/p/3d90a13635528045a101de4d967cd26c) | 05/10/2026 | Artífice, Maquinista, Tecelão, Biomecânico |
| [Vanguarda](https://app.notion.com/p/3d90a1363552807aad18f3d230b68c40) | 05/10/2026 no fuso de São Paulo | Berserker, Carcereiro, Colosso, Guardião |

Contexto: [10. Classes](https://app.notion.com/p/3bf0a1363552800c9c95c568bea9d6a9). Algumas cópias JSON do repositório declaram datas de origem anteriores às páginas consultadas, especialmente Âncora, Combatente, Face e Vanguarda. O mapeamento abaixo usa o Notion; sincronização do catálogo é trabalho separado. Não foi realizada auditoria de cobertura das automações já existentes no VTT.

## Estrutura comum necessária

O núcleo muda com a classe; a subclasse muda o que ocupa a área principal de trabalho.

| Classe | Núcleo que todo personagem da classe precisa acompanhar | Não confundir com |
|---|---|---|
| Âncora | Aliados Foco e Intervenções disponíveis | Uma reserva diária de cura |
| Caçador | PA da Reserva Tática e Preparos escolhidos | PA normais sem identificação de origem |
| Combatente | Dados de Manobra disponíveis, tamanho do dado e repertório | Resultados de dados guardados pela Face |
| Face | Espaços de d8 com **resultados preservados**, relações e manobras por alvo | Um simples contador de pontos |
| Infiltrador | Brechas, fontes que já as concederam e benefícios pendentes | Reserva renovada por descanso |
| Técnico | Unidades individuais, PD, posição/acoplamento, protocolo e operação da rodada | Companheiros autônomos genéricos |
| Vanguarda | Ímpeto, gatilhos de ganho e condições de permanência | Fúria, que é exclusiva do Berserker |

Todos precisam de: ranking, habilidades liberadas, custos reais, disponibilidade, alvo, origem do efeito, duração e condições que encerram o efeito. Características de subclasse entram em E/C/A; os avanços da classe precisam continuar presentes. Os quadros de progressão também incluem S+, sem novo recurso específico de classe nas páginas consultadas.

### Ciclos que não podem compartilhar um único botão de “reset”

- **Ação/teste:** limite de manobras ou trocas; efeitos consumidos pelo próximo teste.
- **Turno:** início/fim do turno do usuário, do alvo ou do companheiro. São momentos distintos.
- **Rodada:** disponibilidade de reações especiais, ganhos e operações das Unidades.
- **Cena:** usos especiais e estados como Fúria, Brechas e Pontos Fracos.
- **Operação:** reserva da Face a partir de B, comércio, movimento público e esconderijos.
- **Dia:** venda do Mercador e pareamento do Maquinista.
- **Descanso longo:** Dados de Manobra, troca de manobra e seleção de Preparos.
- **Calendário ficcional:** fabricação, reparos, atendimento e intervalo terapêutico de seis dias.
- **Por entidade:** paciente, alvo, sistema, obstáculo, aplicação de magia ou fonte de Evidência. Trocar de operador não pode apagar um limite pertencente ao alvo.

## 1. Âncora

Fonte de todas as regras desta seção: [Âncora](https://app.notion.com/p/3d90a1363552800aa253ecb7b72a8b0d).

### Núcleo da classe

| Ranking / característica | O que guardar ou derivar | Operação e validade |
|---|---|---|
| F — Ponto de Apoio | Identidade do Foco, percepção, comunicação e distância | Escolher aliado percebido a até 10 m no início da cena. Trocar custa 1 PA. Foco dura a cena. |
| F — Intervenções | Uso da rodada, teste/acontecimento beneficiado, opção utilizada | 1/rodada, sem PA e sem Reação. Ajustar dá +1 vantagem antes da resolução; Conter a Consequência reduz a gravidade de falha padrão/crítica, sem convertê-la em sucesso. Uma intervenção por acontecimento. |
| D — Atenção Dividida | 2 Focos; troca emergencial disponível | Troca emergencial 1/cena, sem PA, antes da resolução; não gasta Intervenção. |
| B — Rede de Apoio | 3 Focos; 2 Intervenções por rodada | Beneficiários diferentes. Fora de rodadas, até duas por ação, em aliados diferentes. |
| S — A Operação Continua | Aliados percebidos a 10 m contam como Foco; 3 Intervenções/rodada | Mesmo aliado pode receber mais de uma em acontecimentos distintos. Conversão de falha limitada em sucesso limitado margem 0: 1/cena. |

### Coordenador — painel de equipe e plano

| Ranking | Controles específicos |
|---|---|
| E | **Focos +1. Briefing Operacional:** plano, participantes, perícia escolhida por cada um e rerrolagem consumida individualmente. Preparação de 5 minutos; benefício 1/cena por participante; novo briefing substitui anterior. **Orientações Coordenadas:** selecionar outro Foco, registrar deslocamento de 2 m/interação/sacar-guardar e eventual +1 vantagem no próximo teste, até fim do próximo turno dele. |
| C | **Focos +1 adicional. Coordenação Paralela:** uso gratuito adicional de Ajustar/Conter 1/rodada, distinto do contador normal. **Imposição de Ritmo:** Foco que ainda não agiu, turno antecipado, permissão de 3+ PA nos Turnos Rápidos. Não concede segundo turno nem recupera PA. |
| A | **Focos +1 adicional. Operação Sincronizada:** 1/cena; lista ordenada de Focos que ainda não agiram. Cada turno é marcado como realizado; efeitos de início/fim de turno continuam ocorrendo. |

**Organização proposta:** aliados como linhas ou cards, com Foco, perícia do briefing, benefício pendente e situação do turno. Ordem de execução como sequência, sem duplicar o tracker de iniciativa.

### Terapeuta — pacientes e tratamentos

| Ranking | Controles específicos |
|---|---|
| E | **Acompanhamento Terapêutico:** paciente, evento específico que causou a perda de Integridade, perda atribuída à origem, sucessos acumulados 0–3, última sessão e próxima data elegível. Sessão ≥1 h; paciente testa Vontade CD 7 com +2 vantagem; falha mantém progresso. Intervalo mínimo de 6 dias **por paciente**, mesmo trocando de terapeuta. Recupera até 1 Integridade no total; não permite autotratamento nem recuperar quem chegou a 0. |
| E | **Aterramento:** 2 PA, 1d6+2 PE; uso registrado **por criatura por cena**. **Expertise Cognitiva:** referência contextual de +1 vantagem em Psicologia; não precisa de contador. |
| C | **Intervenção Cognitiva:** Recuperar o Eixo usa Aterramento e seus custos/limites; Romper a Influência exige registrar beneficiário + aplicação específica do efeito, pois só pode ser recebido uma vez contra ela; Suspender a Crise guarda condição suspensa e expira no fim do próximo turno do Foco, sem pausar sua duração original. |
| A | **Retomar a Si:** 1/cena, associado a Intervenção Cognitiva e efeito encerrado. **Acompanhamento Aprofundado:** teto vitalício terapêutico sobe para 2 pontos; cada ponto precisa de novo ciclo de 3 sucessos. Histórico pertence ao paciente, não à ficha de um único terapeuta. |

**Organização proposta:** prontuários com progresso e calendário; atendimento imediato separado dos tratamentos persistentes. Não representar terapia por três “cargas de cura”.

### Vitalista — triagem e atendimento de emergência

| Ranking | Controles específicos |
|---|---|
| E | **Atendimento:** referência à ação real (item, magia, fórmula ou característica) e seus custos. **Primeiros Socorros:** 2 PA, 1d4 PV, 1 recuperação por criatura/cena. **Prática de Cura:** +1d6 PV por Atendimento elegível, excluindo Primeiros Socorros; uso de itens médicos automaticamente bem-sucedido e Medkit a 50%, sem acumular desconto. |
| E | **Primeira Resposta / Prontidão de Campo:** evento no Foco, deslocamento de até metade de Andar em direção a ele e item médico sacado. Consome a Intervenção, não PA para mover. |
| C | **Triagem de Combate:** estado dos aliados por faixas de PV, Colapso e condições de dano. Troca imediata de Foco por agravamento, separada de Atenção Dividida. **Protocolo de Urgência:** 1/rodada; Atendimento após Primeira Resposta, inclusive fora do turno, pagando recursos. Com alvo ≤metade de PV: escolher Reabilitar, Reposicionar ou Tratar Condição. |
| A | **Janela de Reanimação:** movimento da Primeira Resposta passa a Andar completo. Por Foco morto de Colapso físico: rodada da morte, 3 rodadas seguintes restantes, corpo elegível e Atendimento concluído. Cura ≥1 PV ou estabilização revertem a morte com estados finais diferentes. |

**Organização proposta:** quadro de triagem, pacientes já atendidos e temporizador explícito da reanimação. Os recursos devem ser os das fichas dos aliados.

## 2. Caçador

Fonte: [Caçador](https://app.notion.com/p/3d90a13635528034a166dbb1dd0c2b3b).

### Núcleo da classe

| Ranking | Acompanhamento |
|---|---|
| F — Reserva Tática | Capacidade 1 PA. Ao fim da rodada, conservar PA não gastos; na próxima rodada somam-se aos normais. Identificar quais ações foram pagas parcial/integralmente pela reserva. PA reservados contam para Turnos Rápidos/Lentos. |
| D — Preparado para Tudo | Selecionar 2 Preparos ao concluir descanso longo. Cada escolhido tem 1 uso/cena; máximo 1 Preparo/ação. |
| B — Reação Planejada | Reserva comporta 2 PA. 1/rodada: gastar Reação para agir depois da ação de outra criatura, pagando a ação **inteiramente** com reserva. |
| S — Dez Passos à Frente | 1 PA de reserva no início da cena, com validade especial até fim da primeira rodada. 3 Preparos escolhidos; dois usos especiais independentes de 1/cena: Preparo não escolhido e segunda utilização de um escolhido. |

**Preparos a apresentar:** Ação Calculada (+1 vantagem em teste de ação paga com reserva); Equipamento Separado (sacar e eventual Interagir com –1 PA); Plano Alternativo (recupera 1 PA de reserva após falha, com validade até fim da rodada); Reposicionamento Previsto (3 m); Saída Planejada (resolução especial de dano em defesa); Sinal Combinado (aliado a 10 m recebe 2 m ou +1 vantagem em ação contra mesmo alvo até fim da rodada). Guardar beneficiário/validade quando houver benefício pendente.

### Assassino — oportunidades e presas feridas

| Ranking | Controles específicos |
|---|---|
| E | **Ataque Furtivo:** alvo não ciente da presença; +2 vantagem total com Ponto Cego; dano extra 1/rodada, +1d4 em E, +2d4 em C, +3d4 em A. **Rota de Fuga:** sucesso padrão/crítico contra alvo desavisado ou Isolado dá metade de Andar; Esconder-se gratuito após deslocamento, 1/rodada. Isolado significa nenhum aliado consciente do alvo a 8 m. |
| C | **Ferida Aberta:** distinguir aplicação inicial/agravamento de Sangrando e sucesso padrão/crítico com arma de Sangramento. **Caça Persistente:** identificar quais sangramentos foram causados pelo Assassino; revela faixa ≤metade PV, dá +1 rastreio e libera Rota de Fuga contra essas presas. |
| A | **Executar:** uso 1/cena, declarado antes do ataque e perdido se errar. Exibir elegibilidade: ≤metade PV, não ciente, Imobilizado/Atordoado ou Sangrando pelo usuário + Isolado. Ao acertar: crítico, ignora MIT regional; dado extra se já seria crítico natural. |

**Organização proposta:** presa selecionada e condições de oportunidade, com vínculo ao mapa e origem de Sangrando. Não revelar PV exatos de inimigos só porque a regra revela a faixa.

### Atirador de Elite — mira persistente

| Ranking | Controles específicos |
|---|---|
| E | **Um Tiro, Um Acerto:** guardar resultado de Mirar e bônus (+1 na falha, +2 no sucesso, +3 no crítico). **Alvo na Mira:** identidade do alvo, percepção e deslocamento voluntário acumulado; termina ao atacar, mirar outro, perder percepção, mover >2 m ou terminar a cena. |
| C | **À Espreita:** falha limitada do disparo beneficiado vira sucesso limitado; sucesso limitado sem –1 dano. **Janela de Abate:** 1/rodada; gatilho da presa mover ≥2 m, atacar outro ou acabar ação sem cobertura; disparo custa 1 PA da reserva + Reação. Acerto consome a mira; falha dessa ação específica a preserva. |
| A | **Tiro Terminal:** exige Mirar com crítico e acertar; trata ataque como crítico e ignora cobertura. Dado extra se o próprio ataque já seria crítico. Não há novo contador de uso descrito. |

**Organização proposta:** alvo e qualidade da mira no centro, com avisos de quebra da mira e botão contextual da Janela de Abate.

### Domador — ficha do companheiro

| Ranking | Controles específicos |
|---|---|
| E | **Companheiro de Caça:** uma criatura vinculada, modelo/espécie/aparência, atributos, perícias, PV, condições, Colapso, deslocamento, Reação, PA e Instinto. Comandar custa 1 PA do Domador (pode vir da reserva): companheiro recebe 2 PA; sem comando recebe 1 PA restrito. Turno imediatamente após Domador, sem nova posição na alternância. Ataque natural: 1 PA e máximo 1/turno. Morte é permanente; substituição exige novo vínculo narrativo. |
| C | **Caçada Coordenada:** 1/rodada, fonte/beneficiário/alvo e +1 vantagem na primeira ação pertinente até fim da rodada. Aplicar evolução própria do modelo. |
| A | **Ataque Conjunto:** 1/cena; outro participante gasta sua Reação para mover e atacar mesmo alvo. Se ambos acertarem: ambos críticos, segundo +1 dado e alvo sem Reações até início do próximo turno dele. Ataque do companheiro é exceção ao limite de ataque natural. |

| Modelo | Estado adicional e evolução a acompanhar |
|---|---|
| Canídeo | Alvo localizado e benefício de primeira ação até fim do próximo turno do companheiro. E: PV12/Corpo2/mordida d6+Corpo; C: PV13/Corpo3/mordida d8+Corpo e penalidade defensiva do localizado adjacente. |
| Felino | Furtividade condicionada a deslocamento ≤metade; Bote e alvo desavisado. E: PV10/Corpo2/garras d4+Corpo; C: PV11/Corpo3/garras d6+Corpo e retirada após Bote. |
| Ave de rapina | Voo, queda por condições e alvo Assinalado (uma vez por alvo/turno); benefício até início do próximo turno. E: PV7/Mente2; C: PV8/Mente3, voo extra após Assinalar e +1d6 no ataque favorecido. |
| Constritora | Alvo agarrado/Imobilizado, margem do Agarrar e deslocamento 0 enquanto agarra. E: PV13/Corpo3; C: PV14/Corpo4, penalidade de fuga –1/–2 e tentativa gratuita de imobilizar no início do turno. |
| Peçonhenta | Se moveu desde início do último turno; alvo Envenenado pela própria peçonha e Lento temporário. E: PV9/Corpo2; C: PV10/Corpo3, Inocular gratuito 1/turno após dano de Mordida e reinoculação agravada. |

**Organização proposta:** ficha operacional do companheiro, com ação conjunta e turno associado. Não modelar como item de inventário ou um contador abstrato de “pet”.

### Perito — investigação estruturada

| Ranking | Controles específicos |
|---|---|
| E | **Dossiê:** um objeto investigado e até 3 Deduções; conclusão, categoria (Método/Motivação/Origem/Destino/Padrão/Inconsistência) e fonte/Evidências. Uma fonte não pode conceder repetidamente Deduções. Novo Dossiê remove as anteriores. 1 Dedução: +1 investigação pertinente; 2: proteção contra surpresa fundamentada, incluindo aliados orientados; 3: 1 PA de reserva ao iniciar cena pertinente ou obter terceira Dedução, 1/cena. |
| C | **Montar o Perfil:** 1/rodada, 1 PA de reserva; criatura e ação observada (incluindo arma/magia/equipamento específico). Vigora até fim do próximo turno do Perito; consumir ao punir repetição ou beneficiar defesa/movimento de aliado. Primeira utilização por criatura/cena ligada ao Dossiê pode gerar Dedução de Padrão. |
| A | **Caso Encerrado:** exige 3 Deduções; 1/cena. Alvo sustentado pelo Dossiê e aliados até Mente, mínimo1, a10 m. Por beneficiário: primeira ação pertinente/rodada com +2 vantagem e conversão de sucesso limitado→padrão uma única vez durante o efeito. |

**Organização proposta:** objeto do caso, três cartões de Dedução e perfis ativos; evidências ligadas ao sistema de investigação, sem inventar novas informações automaticamente.

## 3. Combatente

Fonte: [Combatente](https://app.notion.com/p/3d90a13635528088ac28caeaca52d623).

### Núcleo da classe

| Ranking | Acompanhamento |
|---|---|
| F — Doutrina de Combate | 4 dados d4 disponíveis; 3 Manobras Básicas conhecidas; gasto ao declarar, mesmo se falhar. Todos recuperados no descanso longo. Uma manobra/ação. |
| D — Técnica Aprimorada | Dados d6; 4 conhecidas; Táticas liberadas; troca de uma conhecida ao concluir descanso longo. |
| B — Manobra Composta | Dados d8; 5 conhecidas; Avançadas liberadas; duas manobras diferentes na mesma ação 1/rodada, custo de dois dados. |
| S — Mestre Inesgotável | Dados d10; 6 conhecidas; se começar cena zerado, recuperar1. 1/cena: Manobra Composta gasta/rola apenas um dado para os dois efeitos. |

| Repertório | Estado ou contexto adicional |
|---|---|
| Cortar a Resposta | Reação removida ou redução pendente da recuperação no próximo turno do alvo. |
| Defesa Calculada | Janela antes de conhecer resultado da defesa. |
| Demolição | Dano a PD de item/escudo/estrutura/cobertura. |
| Explorar a Guarda | Alvo e próximo ataque beneficiado até fim do próximo turno. |
| Finta Treinada | Resultado do dado reaplicado ao primeiro ataque beneficiado. |
| Investida Irrefreável | Deslocamento prévio ≥4 m, alvo, empurrão e acompanhamento. |
| Ataque Encadeado | Ataque Secundário sem 1 PA; 1/rodada. |
| Ataque Preparado | Entrada voluntária no alcance; exige Reação. |
| Contra-Ataque | Erro de inimigo ao alcance; exige Reação. |
| Desarme | Objeto empunhado, teste de Resistir e queda do objeto. |
| Golpe Amplo | Segundo alvo, comparação com defesa, dano do dado. |
| Quebra de Base | Caído automático ou teste conforme margem. |
| Amortecer | Redução do dano, 1/rodada. |
| Ataque de Oportunidade | Saída voluntária do alcance; exige Reação. |
| Correção do Golpe | Após saber que errou, recalcular teste e margem. |
| Manter a Ofensiva | Alvo reduzido a0 PV, novo alvo; ataque sem PA, 1/rodada. |

### Acrobata — percurso e posições transitórias

| Ranking | Controles específicos |
|---|---|
| E | **Percurso Livre:** Manobrar +5 m e sem teste, percurso restante, posição transitória para alcance/visão/cobertura/altura, posição final válida. +1 vantagem ofensiva de posição transitória 1/rodada. **Aterrissagem:** queda reduzida por Andar; pouso alternativo a2 m se dano evitado. |
| C | **Impulso Contínuo:** 1/rodada, gastar dado para –1 PA (mínimo1) e somar resultado ao movimento restante. Não ocupa a manobra da ação. |
| A | **Sem Tocar o Chão:** 1/cena, até fim do turno; Manobrar sem PA, +4 m após cada ofensiva, primeiro ataque transitório contra cada criatura com vantagem, Impulso liberado por ação. Termina também por Imobilizado/falta de apoio; validar pouso ou queda. |

### Brutalista — resolução dos dados de dano

| Ranking | Controles específicos |
|---|---|
| E | **Mão Pesada:** Postura Ofensiva gratuita 1/cena e rerrolagem de um dado original 1/rodada, mantendo maior. **Dano Explosivo:** 1/rodada, dado original no máximo gera um dado extra; sem cadeia de explosões em E. Guardar procedência dos dados. |
| C | **Forçar o Limite:** 1/rodada; dado de Manobra aumenta um dado original até máximo e pode provocar segunda explosão no mesmo ataque. Não ocupa manobra do ataque. |
| A | **Tudo ou Nada:** declarar 1/cena antes do ataque, com –1 vantagem. Um dado original no máximo, explosão e possível segunda por Forçar o Limite; dados de explosão rolados duas vezes, maior resultado. Erro consome uso. |

### Dissecador — regiões marcadas por inimigo

| Ranking | Controles específicos |
|---|---|
| E | **Técnica Analítica:** opção de Mente para acerto, Corpo preservado no dano corpo a corpo. **Ponto Fraco:** marcar 1/rodada, uma região por criatura, até fim da cena; nova região substitui antiga. Benefícios no acerto/localização e remoção de –1 dano por sucesso limitado. |
| C | **Comprometer:** 1/rodada, dado de Manobra para dano e região comprometida até fim do próximo turno do alvo. Braços: penalidade de ataques/manobras; pernas: movimento pela metade e sem movimento gratuito; tronco: bloqueio de cura/redução de dano; cabeça: penalidade ofensiva e sem Reações ofensivas. Não ocupa manobra do ataque. |
| A | **Golpe Decisivo:** 1/cena em acerto no Ponto Fraco; crítico para dano/propriedades, ignora MIT regional e comprometimento até fim da cena sem dado. Pode receber manobra. |

### Mago de Batalha — modificação da conjuração

| Ranking | Controles específicos |
|---|---|
| E | **Treinado em Magia Bélica:** compatibilidade da manobra com magia de Ataque; adicional limitado a uma criatura atingida. **Modulação de Combate:** 1/rodada, um dado, escolher Concentrar (dano em um alvo), Expandir (metade do dado em metros), Projetar (dado em alcance) ou Conter (metade em criaturas protegidas), arredondando metade para baixo. Não ocupa manobra segundo a regra de E. |
| C | **Modulação Composta:** duas diferentes com mesmo dado. Concentrar em alvo único rola duas vezes/maior; Expandir divide metros em duas dimensões; Conter permite seleção após defesas. |
| A | **Bombardeio Perfeito:** 1/cena; todas as Modulações, dado rolado sem gasto; segunda área ou segundo alvo. Resolver cada criatura só uma vez, mesmo se áreas sobrepostas. |

**Organização proposta para Combatente:** repertório comum + área especializada. Acrobata usa percurso; Brutalista usa dados; Dissecador usa corpo/alvos; Mago usa o fluxo de Magias. Uma troca de ícone não resolve essas diferenças.

## 4. Face

Fonte: [Face](https://app.notion.com/p/3d90a136355280b18fc8e6819e95616f).

### Núcleo da classe

| Ranking | Acompanhamento |
|---|---|
| F — Reserva de Confiança | Dois espaços, cada um contendo o **resultado de um d8**. Guardar retira um dado do teste sem deixá-lo vazio; Trocar permuta resultados com a reserva. Apenas uma dessas operações por teste, antes de determinar resultado. Esvazia na cena. |
| F — Manobras Sociais | Histórico por alvo/grupo + manobra + cena; cada manobra uma vez por alvo/cena. Arrancar, Comprometer, Desviar, Expor, Hesitar, Isolar, Provocar, Viabilizar. Efeito depende da margem; Viabilizar deixa benefício de próximo teste do aliado. Acordos/promessas podem persistir narrativamente. |
| F — Interação Cognitiva | Benefício +1 associado a aplicação de magia e informação específica; uso único enquanto relevante. |
| D — Argumento Coletivo / Rede de Contatos | Três espaços de reserva. Propor troca em teste de aliado 1/rodada, com aceite do jogador. Contatos, acesso possível, preço/favor/risco como registros. |
| B — Confiança Acumulada | Reserva passa a persistir **pela operação**. Até duas Manobras Sociais diferentes/rodada; aplicar sobre sucesso de aliado custa1 PA, 1/rodada. |
| S — Palavra Final | Troca com teste de oposição 1/cena, podendo também trocar no lado próprio durante resolução. Crítico permite até três manobras diferentes. Reserva permanece3 por operação. Ver questão editorial ao final. |

### Ícone — Persona, Público e mobilizações

| Ranking | Controles específicos |
|---|---|
| E | **Persona Pública:** imagem, meios de circulação, ambiente inicial e expectativas. **Cativar:** público temporário da cena conforme margem, sem transformar hostis em apoiadores. **Mobilizar:** pedido, público alcançado, custos/riscos e resposta; pedido testado 1/cena. Pedidos simples não precisam de teste. |
| C | **Mobilização:** até2/cena; segundo pedido bloqueado enquanto primeiro em execução. Acompanhar resultado coletivo, progresso narrativo, concessões e capacidade real do Público. |
| A | **Movimento:** território/circuito de atuação, convocação 1/operação, objetivo coletivo, meio de transmissão, tempo para chegar/produzir efeito, custos e consequências persistentes. |

### Mercador — transações, reservas e dívidas

| Ranking | Controles específicos |
|---|---|
| E | **Intermediação:** compra/venda, itens/lote/serviço/informação, valor justo, preparação1–3 h, Reserva de Negociação com resultados d8 (quantidade até Mente, mínimo1). É separada da Confiança, persiste pela preparação e é descartada após teste. Compra concluída:1/operação. Tentativa de venda:1/dia. Valor justo vendido atéȺ2.000/operação; recebimento75/100/125% conforme sucesso. Falha mantém bens e só permite nova tentativa a partir do dia seguinte. |
| E | **Garimpo de Rua:** referência do Mercado Noturno/contato/código e avaliação de bens; desconto20% em uma compra por operação, não acumulável. |
| C | **Crédito de Campo:** atéȺ1.500 não pagos,1/operação, bloqueado enquanto existir dívida desta característica. Credor, valor, termos, prazo, quitação ou consignação/devolução. **Estoque de Oportunidade:**1/operação, compra declarada e paga, raridade≤Incomum, espaço/transporte válidos. **Margem Favorável:** tetoȺ4.000; recebimentos100/125/150%. |
| A | **Mercado Particular:**1/operação, preparação≥1 h, até3 negociações; conclusão nas próximas6 h; vendas125% contam no teto. **Operação em Escala:** tetoȺ8.000, créditoȺ3.000, Estoque2/operação; desconto pode beneficiar aliado pelo Mercado Particular. |

**Organização proposta:** transações em andamento e livro de dívidas; reserva de negociação por transação; integração com carteiras e inventário. Encontrar fornecedor não equivale a pagar ou receber item automaticamente.

### Rato de Rua — rede territorial e fuga

| Ranking | Controles específicos |
|---|---|
| E | **Ouvidos no Chão:**1/cena,10 min, até2 perguntas com rumores/nomes/locais obtidos; +1 no primeiro teste de interação que seguir informação na mesma cena. **Porta Entreaberta:**1/cena,10 min, ajuda procurada, contato e termos. |
| C | **Casa Segura:**1/operação,≥1 h, local, responsável, condições, custo, proteção de localização –1/–2 e eventos que a comprometem. **Gato de Telhado:** bônus de navegação/perseguição/fuga urbana para grupo orientado; rota alternativa1/cena, obstáculos e riscos restantes. |
| A | **Saída dos Fundos:**1/operação, saída fisicamente possível, participantes capazes de acompanhar, consequência escolhida pelo narrador e perseguição encerrada até nova pista concreta. |

## 5. Infiltrador

Fonte: [Infiltrador](https://app.notion.com/p/3d90a1363552807294c8d481c179bf01).

### Núcleo da classe

| Ranking | Acompanhamento |
|---|---|
| F — Brechas | Capacidade2; zeram ao final da cena. Ganho por gatilhos usuais:1/rodada. Registrar informação/obstáculo/proteção que já concedeu Brecha, evitando repetição da mesma fonte. Gastar1/ação: +1 vantagem antes, +2 margem após sucesso ou tentativa adicional de Acessar antes da primeira tentativa. |
| F — Procurar Brecha |1/cena;1 PA em rodadas, instantes fora delas. Ganha1; não revela automaticamente Evidências. |
| D — Sem Deixar Rastros | Capacidade3. Ação bem-sucedida com Brecha não deixa vestígios comuns de execução; investigação residual –2. Em falha elegível, gastar Brecha para impedir revelação/alarme, preservando demais consequências e consumo de Tolerância. |
| B — Caminho Fantasma | Capacidade4; recuperar Brecha após ação bem-sucedida +3 m,1/cena. |
| S — Ninguém Esteve Aqui / Plano de Contingência | Capacidade5; começa cena com2 após observar. Caminho Fantasma passa a2/rodada,1/ação. Contingência1/cena transforma falha em sucesso limitado0 e perde todas as Brechas; em Acessar dispara Contramedida imediatamente. |

### Batedor — caminho e aliados orientados

| Ranking | Controles específicos |
|---|---|
| E | **Reconhecer o Caminho:** até2 perguntas quando usa Procurar Brecha; respostas do narrador. **Sigam Meus Passos:** obstáculo/caminho, aliados orientados a10 m, primeiro teste beneficiado de cada aliado (+2) ou tentativa adicional de Acessar, até fim do próximo turno do Batedor. Benefício apenas uma vez por aliado por obstáculo/caminho. |
| C | **Caminho Seguro:** movimento3 m após sucesso de aliado; encobrir falha custa1 Brecha por ocorrência, sem apagar consequências físicas/Tolerância/partes não informacionais da Contramedida. |
| A | **Todos Pelo Mesmo Caminho:**1/cena; passagem preparada, aliados e uso individual, validade até fim da cena ou mudança significativa das condições. Passagem não elimina tarefas técnicas individuais ou oposição nova. |

### Sorrateiro — furtividade e distração

| Ranking | Controles específicos |
|---|---|
| E | **Sumir de Vista:** Esconder-se gratuito1/rodada após movimento ou sucesso de Mãos Leves, se houver posição válida. **Mãos Leves:** redução1 PA até0,1/rodada, compartilhada entre manipulação discreta e fechadura mecânica. Retirada de objeto em movimento: oposição e consequência conforme margem. **Sem Alarde:** exceção que permite Brecha em ataque à distância com arma Silenciosa. |
| C | **Posição Falsa:**1/rodada,1 Brecha, ponto até6 m, criaturas afetadas e3 m de movimento. Até fim do próximo turno: penalidade de localização, benefício único em teste/ataque compatível e percepção atrasada da alteração no objeto. Termina individualmente se criatura perceber posição real. |
| A | **Entre Um Piscar e Outro:**1/cena,2 Brechas; sequência de movimento +até2 ações sem PA. Apenas um ataque possível, último e por Sem Alarde, com Brecha adicional. Guardar ações restantes, posições, observadores e validade de alteração não percebida até fim do próximo turno. |

## 6. Técnico

Fonte: [Técnico](https://app.notion.com/p/3d90a13635528045a101de4d967cd26c).

### Núcleo da classe

| Ranking | Acompanhamento |
|---|---|
| F — Unidades de Campo |1 Unidade,10 PD próprios. Instalar/recolher1 PA; posicionada (raio4 m) ou acoplada a sistema/usuário. Operação até20 m,1 Função/Unidade/rodada por1 PA. A0 PD fica Inativa; reparo10 min recupera tudo. Estado e ligação ao mapa/item são essenciais. |
| D — Protocolo Reativo / Reprogramar | Gatilho, Resposta, alvo e escolhas antecipadas de cada Unidade. Automático não gasta PA/Reação, mas divide o limite1/rodada com ativação manual. Reprogramar1 PA a20 m não renova limite. Interface automática permite Interagir predefinido, não Acessar. |
| B — Redundância Operacional |2 Unidades independentes. **Registro:**1 por Unidade/cena,1 PA; snapshot técnico, validade e consumo. **Restaurar:**2 PA, ou Resposta, apaga Registro. Nunca restaurar PV, Mana, Integridade, munição, cargas/consumíveis, posição ou informação adquirida depois. |
| S — Arquitetura Distribuída / Operação Sincronizada |3 Unidades.1/rodada: operação manual por1 PA permite Função gratuita em outra; ambas consomem disponibilidade da rodada. |

| Função | Dados/efeitos a acompanhar |
|---|---|
| Amplificação (F) | Sistema/função beneficiada; próximo teste+1 ou valor+2; até início do próximo turno. |
| Diagnóstico (F) | Sistema examinado, achados, Evidência quando cabível; próxima intervenção+1 ou tentativa extra de Acessar; até início do próximo turno. |
| Estabilização (F) | Efeito técnico ignorado, duração original e supressão até início do próximo turno. |
| Interface (F) | Ação remota e ferramentas realmente conectadas; Tolerância/Contramedida do desafio permanecem. |
| Manutenção (F) |1d6 PD; sistema já atendido nesta cena. |
| Monitoramento (F) | Alvo/sensores, acontecimentos percebidos e duração até início do próximo turno. |
| Derivação (D) | Próximo dano reduzido até3 e PD equivalentes retirados da Unidade; até início do próximo turno. |
| Desregulação (D) | Atividade escolhida, próximo teste–1 ou valor–2, mínimo0; até início do próximo turno; superar proteção se necessário. |
| Travamento (D) | Parte móvel e posição mantida, até início do próximo turno; não se aplica a corpo/implantes/escalpos. |
| Relé (B) | Topologia e alcance: posicionada100 m em cada trecho; acoplada+100 m ao sistema. Ativo até outra Função/recolhimento/inativação/fim de cena; bloqueios de sinal continuam relevantes. |

### Artífice — oficina, projetos e equipamentos

| Ranking | Controles específicos |
|---|---|
| E | **Oficina:**2 modificações simultâneas; uma temporária por equipamento; ferramentas e10 min para instalar/trocar/remover. Vínculo exato item↔modificação. **Prática de Reparo:**+1d6 MIT/PD por uso elegível e aplicação sem teste. **Projetos:** biblioteca inicial de2 projetos≤Incomum; possuir projeto não concede item. Fabricação com materiais50%, testes/tempo/progresso; desmontagem8 h destrói item, gera projeto e materiais para primeira fabricação. |
| C | Oficina3; alteração rápida de modificação/runa1/cena por1 PA. **Equipamento Híbrido:** apenas1 existente, dois projetos da mesma categoria, custos somados, maior CD e progressos somados; configuração ativa, alternância1/rodada por1 PA e compatibilidade das modificações/runas. **Gatilho Rúnico:** ativar/desativar gratuitamente1/rodada em equipamento Integrado elegível; eventos e respostas de protocolo. |
| A | Oficina4. **Modificação Permanente:**+300 progresso e materiais+25% do preço; não ocupa limite temporário. Equipamentos permanentes existentes até Mente, mínimo1. Pode coexistir com modificação normal. Em híbrido, exige compatibilidade com ambas configurações. |

**Catálogo de modificações:** Balanceamento (propriedade escolhida); Blindagem Adicional (+3 MIT atual/máxima e remoção correspondente); Calibração (+2 em função técnica, sem ataque/defesa); Potencialização (+1d4 dano); Reforço Estrutural (+5 PD atual/máximo); Sobregravação (+1 espaço de runa). É necessário guardar a escolha interna, não só o nome da modificação.

**Projeto em fabricação:** item, raridade, CD, materiais comprometidos, progresso atual/necessário, histórico de períodos, ritmo, tempo decorrido e consequências de falha. Comum/Muito Comum: CD5/100; Incomum: CD7/300; Raro: CD9/600. Ritmos: Cauteloso4 h (+1 vantagem/falha amenizada), Regular2 h, Acelerado1 h (–1 desvantagem, +1d100 em sucesso/falha agravada). Sucessos limitado/padrão/crítico:1/2/3d100. Falhas permitem escolher tempo adicional, perda de progresso e, nos graus superiores, materiais. Progresso mínimo0, conservado se interromper; projeto não é consumido.

### Maquinista — máquinas e modos de controle

| Ranking | Controles específicos |
|---|---|
| E | **Modos de Operação:** máquina vinculada a Unidade, direto/autônomo, programação, PA próprios, atributos usados, sensores, PD e ficha real. Trocar modo1 PA; entrar em direto perde PA remanescentes da máquina. Autônoma comandada por1 PA recebe PA da ficha; sem comando recebe1 PA restrito; age após jogador. **Domínio Técnico:** converter falha limitada de Robótica pertinente. **Reconstrução:** componentes recuperados,8 h, materiais25%, CD e resultado; falha preserva materiais. |
| C | **Resposta Mecânica:** ação de máquina como Resposta, só autônoma e pagando PA dela. **Intervenção Direta:**1/rodada;1 PA para repetir falha autônoma com atributos do jogador, novo resultado obrigatório. |
| A | **Enxame:** pareamento1/dia, até4 drones idênticos ou2 robôs; composição, alcance20 m/sinal e comando pareado/independente. Uma Unidade pode acoplar grupo do mesmo modelo. **Overclock:**1/cena, +2 PA em cada máquina pareada autônoma, até fim da rodada. |

### Tecelão — infraestrutura na Trama

| Ranking | Controles específicos |
|---|---|
| E | **Unidades na Trama:** Trama, Nó/Ponto de Acesso/Bloqueio, posição, PD e defesa por Tecnomagia; alcance convertido1 m→1 espaço. **Olho de Botão:** primeira conexão na cena, revelar próximos2 níveis sem PA/RAM. **Processamento Paralelo:** PA adicional restrito a Protocolo/Comando no primeiro turno de cada rodada, condicionado a conexão+Unidade ativa. |
| C | **Controle Distribuído:** um Comando sustentado por Unidade, alvo/conexão e ordens possíveis; pode permanecer após desconexão do jogador; termina por recolhimento/inativação/perda de conexão ao alvo. **Bypass:**1/cena, sucesso limitado0, custos normais; exclui Apagar Rastros/Modificar Assinatura. |
| A | **Migração de Processo:**1/rodada,1 PA, destino é Unidade. **Processos Espelhados:**1/rodada, segunda Unidade e alvo diferente/compatível; segunda ação sem PA, mas com RAM e resolução próprias. |

### Biomecânico — paciente, implantes e calibrações

| Ranking | Controles específicos |
|---|---|
| E | **Procedimento Biomecânico:** paciente, escalpo, instalação/extração1 h, ferramentas; após extração, teste VontadeCD7+1 para recuperar Integridade daquela instalação. Reparo10 min remove1 Desgaste ou efeito técnico persistente. **Forçar Limites:**1/cena, escalpo/usuário/Unidade, melhoria escolhida, antes da ativação, sem PA adicional. Opções: bônus+1; alcance/movimento/dano+2;2 MIT/PD temporários; ativação sem PA;1 uso adicional. |
| C | **Recalibração de Campo:** Unidade na criatura alcança todos os seus escalpos; Manutenção recupera1d6 MIT por escalpo1/cena. **Segunda Calibração:** Estabilização em escalpo potencializado recupera uso de Forçar Limites,1/cena conforme texto. **Circuito Biomecânico:** gatilhos por escalpo e Resposta em outro do mesmo paciente. **Compensação de Desgaste:** suprime efeito de1 ponto até fim da cena, sem removê-lo;1 benefício por escalpo/cena. |
| A | **Zona Vermelha:**1/cena junto a Forçar Limites, melhoria ampliada. Bônus1d4 guardado; alcance/movimento+6 m ou dano+1d8; proteção1d8 temporária; ativação gratuita+melhoria normal;2 usos extras. Guardar resultados/consumo e maior bônus aplicável, sem somar incompatíveis. Ao fim da cena, escalpo fica Inativo até procedimento10 min. |

## 7. Vanguarda

Fonte: [Vanguarda](https://app.notion.com/p/3d90a1363552807aad18f3d230b68c40).

### Núcleo da classe

| Ranking | Acompanhamento |
|---|---|
| F — Ponta de Lança | Ímpeto atual/máximo2; ganho1/rodada ao entrar ou começar turno adjacente a hostil. Após ação,2 m por ponto gasto. Perde tudo no fim da cena ou ao terminar turno sem envolvimento direto no confronto (inclui decisão do narrador). |
| D — Ganhar Terreno | Máximo3; pode gastar para movimento ou +1 margem após ataque/manobra bem-sucedido, combinando efeitos. |
| B — Presença Dominante | Estado de Ímpeto que ativa penalidade–2 em hostis adjacentes que ataquem/manobrem sem incluir o usuário. Ver ambiguidade de limiar no fim do documento. |
| S — Avanço Irrefreável | Máximo4; recuperação1 após gasto, se restou≥1,1/rodada. Ao sair do confronto conserva1, mas fim da cena continua zerando. |

### Berserker — Fúria e risco físico

| Ranking | Controles específicos |
|---|---|
| E | **Dor é Combustível:** perda de PV por hostil gera1 Ímpeto1/rodada independente do ganho normal; movimento2 m em direção à fonte. **Fúria:** entra ao cair a≤metade PV ou gastando2 Ímpetos após Dor é Combustível; dura até fim da cena, mesmo se curar. Dobro do bônus de Corpo no dano corpo a corpo, +1 Vigor. |
| C | **Contra-Ataque:**1/rodada,2 Ímpetos+Reação depois de perder PV, alcance e fonte; +1 vantagem em Fúria. **Negar a Dor:**1/cena em Fúria,2 Ímpetos, metade da perda de PV de ataque hostil, arredondada para cima. |
| A | **Limite Rompido:**1/cena em Fúria, até fim do próximo turno; Ímpeto até máximo, redução1 PA até mínimo1, triplo do bônus Corpo, consciência a0 PV e condições físicas novas suspensas. Ao terminar, restaurar condições ainda válidas e entrar em Colapso se continuar a0 PV. |

### Carcereiro — adversários contidos

| Ranking | Controles específicos |
|---|---|
| E | **Sem Saída:**1/rodada,Reação+1 Ímpeto; inimigo adjacente tenta afastar-se. Escolher Agarrar/Derrubar/Empurrar antes do movimento; sucesso interrompe e perde metros restantes; crítico bloqueia ações de movimento até início do próximo turno dele. |
| C | **Cela Móvel:**2 Ímpetos após ataque ou Sem Saída bem-sucedido em adjacente; alvo, deslocamento2:1 e penalidade na próxima defesa; termina no início do próximo turno do usuário. |
| A | **Sentença:**1/cena,1 PA+2 Ímpetos; até Corpo alvos a2 m, mínimo1; manobra diferente por alvo, sem PA/Reações extras, resultados separados; sucessos aplicam Cela Móvel. |

### Colosso — ocupação e absorção

| Ranking | Controles específicos |
|---|---|
| E | **Corpo Colossal:** tamanho Grande e alcance a partir de qualquer célula ocupada. **Absorver Impacto:**1/rodada,1 Ímpeto para reduzir perda de PV por Corpo, mínimo0. |
| C | **Passo Firme:** com≥1 Ímpeto, movimento forçado reduzido2 m. **Abrir Caminho:** ao mover com Ímpeto, ignora terreno difícil e pode atravessar hostil de tamanho≤seu; Empurrar/Derrubar gratuito1/rodada, resultado decide continuidade; posição final livre. |
| A | **Centro da Batalha:**1/cena no início do turno, até início do próximo; absorção em toda perda sem Ímpeto, imunidade a mover involuntariamente/Caído, segundo alvo em ataque corpo a corpo1/turno. |

### Guardião — dois escudos e proteção compartilhada

| Ranking | Controles específicos |
|---|---|
| E | **Arsenal Defensivo:** escudos primário/secundário com PD independentes; escolher qual Bloquear; bônus se ambos possuem≥1 PD. Ataque com escudo1d6+Corpo. **Posição de Guarda:** Postura Defensiva gratuita1/cena. **Ímpeto Protetor:**1/rodada ao Bloquear com sucesso, separado do ganho básico. **Interceptar:**1/rodada,1 Ímpeto, aliado a2 m, deslocamento até2 m; defesa real com ou sem Reação e penalidade cumulativa normal. |
| C | **Abrigo Móvel:** após Bloquear,1 Ímpeto; escudo de origem, grau de cobertura, aliados adjacentes elegíveis; até início do próximo turno, exigindo escudo empunhado e PD≥1. Movimento com Ímpeto pode permitir2 m para um protegido, terminando a≤2 m. |
| A | **Ninguém Fica Para Trás:**1/cena no início do turno, até início do próximo; Interceptar4 m, sem custo de Ímpeto e sem limite/rodada. Não torna bloqueios gratuitos em Reações nem apaga penalidades defensivas. |

## Consequências para o redesign — propostas de UX

1. **Manter a moldura e a navegação do Console.** Variar o conteúdo operacional, não criar 24 convenções de navegação diferentes.
2. **Dois níveis de composição:** núcleo da classe + área de trabalho da subclasse. Somar o que foi desbloqueado pelo ranking, sem mostrar controles de habilidades futuras como se estivessem disponíveis.
3. **Separar cadastro de operação:** classe/subclasse/antecedente, qualidades, complicações e biografia continuam acessíveis em Identidade; o trabalho recorrente da classe precisa de destaque. A localização final dessa área (na própria Identidade ou área operacional) ainda é decisão de produto, não conclusão das regras.
4. **Usar o componente certo para o estado:** dados com valores para Face; ficha de criatura para Domador; registros por paciente para Terapeuta; itens para Artífice/Guardião; alvos e regiões para Dissecador; posição/ação para Acrobata; transações para Mercador; grafo/Unidades para Tecelão.
5. **Reutilizar a fonte real do dado:** PV/PE/condições dos aliados, PD dos escudos/máquinas, inventário, Mana/RAM, ações, turnos e Evidências. Não manter uma cópia divergente dentro da aba de classe.
6. **Permitir decisão do narrador onde a regra exige:** interpretação de evidências, viabilidade de passagem, acesso social, condições de compra, envolvimento no confronto, elegibilidade de Atendimento. Automação pode mostrar critérios e registrar decisão, sem inventar resposta.
7. **Revelar informação só no nível concedido pela característica:** faixa de PV da presa não é PV exato; Diagnóstico não revela senha; Reconhecer o Caminho não encontra Evidências ocultas.
8. **Ações devem mostrar antecipadamente custo, alvo e consequência:** por exemplo, Zona Vermelha produz inativação posterior, trocar Dossiê apaga Deduções, controle direto remove PA da máquina e desmontar destrói item.

### Áreas especializadas por subclasse

| Família de interface proposta | Subclasses |
|---|---|
| Equipe, alvos e turnos | Coordenador, Vitalista, Guardião |
| Tratamentos e calendário | Terapeuta |
| Presa e condições de oportunidade | Assassino, Atirador de Elite, Dissecador, Carcereiro |
| Personagem secundário ou frota | Domador, Maquinista |
| Evidências e relações | Perito, Rato de Rua |
| Movimento e posicionamento | Acrobata, Batedor, Sorrateiro, Colosso |
| Resolução de ataque e dados | Brutalista, Mago de Batalha |
| Estado corporal e duração | Berserker |
| Público e ações coletivas | Ícone |
| Comércio e obrigações | Mercador |
| Oficina, fila de projetos e itens | Artífice |
| Rede e processos persistentes | Tecelão |
| Implantes por paciente | Biomecânico |

Essas famílias ajudam a reutilizar componentes; não tornam iguais os fluxos das subclasses agrupadas.

## Pontos a resolver antes de automatizar

Não impedem o desenho inicial, mas não devem receber uma interpretação silenciosa no código.

| Regra | Questão encontrada |
|---|---|
| Âncora S × Coordenador | Todos os aliados percebidos a10 m viram Focos em S; o Briefing continua usando “limite de Focos”. Confirmar se seus participantes usam o último limite numérico com aumentos do Coordenador ou outra leitura em S. |
| Face B/S | B diz até2 Manobras Sociais diferentes/rodada; S permite até3 num crítico. Determinar expressamente a precedência dessa exceção. |
| Mago de Batalha C | E diz que Modulação não conta como manobra aplicada; o último período de C chama seus benefícios de “mesma manobra”. Tratar como redação a esclarecer, não gastar indevidamente o limite comum. |
| Vanguarda B/S | Presença Dominante diz “enquanto possuir3 Ímpetos”; S permite4. Confirmar se é limiar≥3 ou valor exato3. |
| Biomecânico — Segunda Calibração | “Uma vez por cena, uma Unidade pode…” deixa margem entre limite global e limite por Unidade. Não permitir renovação múltipla sem definição. |
| Técnico — Registro/Restaurar | Não está explícito se criar/restaurar manualmente ocupa a operação1/rodada da Unidade como uma Função. Protocolo tem limite compartilhado descrito; ações manuais precisam de confirmação. |
| Tecelão — Controle Distribuído | Comando pode durar indefinidamente, inclusive após desconexão; regra básica encerra Unidade ao fim de cena estruturada. Precisar como a exceção mantém a Unidade/processo entre cenas. |
| Maquinista — Enxame | Texto diz até4 “modelos idênticos de drones” ou2 “modelos de robôs”, depois fala em máquinas pareadas do mesmo modelo. Esclarecer quantidade de máquinas versus modelos e homogeneidade dos robôs. |
| Mercador — Mercado Particular | Determinar interação exata entre negociações automáticas de A e os limites de compra/operação e tentativa de venda/dia de Intermediação. Teto de valor vendido já é explicitamente compartilhado. |
| Eventos de reset | Operação, cena, dia e descanso longo precisam ser eventos distintos no VTT. As páginas de classe não definem todo o ciclo global desses eventos. |

## Critérios para a próxima etapa

Antes de desenhar cada variante, verificar que ela oferece: recurso-base; escolhas persistentes; lista de entidades vinculadas; efeitos ativos e validade; uso por entidade quando aplicável; ações no momento correto da resolução; integração com as outras abas; comportamento em ranking inicial e avançado; leitura sem permissão de alteração; funcionamento dentro da moldura e rolagem reais do Console.

Este levantamento cobre as características presentes nas páginas de classes/subclasses consultadas. Regras gerais de Trama, investigação, condições, fabricação externa e itens citados são dependências para a futura implementação; não foram todas auditadas separadamente aqui.
