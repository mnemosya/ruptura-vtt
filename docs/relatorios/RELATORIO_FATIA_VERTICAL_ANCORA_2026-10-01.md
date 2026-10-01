# Relatório — fatia vertical da Âncora (Fase 3)

**Data:** 01/10/2026
**Escopo:** criação e uso de uma Âncora de Ranking F com o contrato RUPTURA v1.2, do conteúdo canônico à ficha e à rolagem.

## 1. Resultado

O fluxo completo funciona contra o banco remoto:

- conteúdo canônico da Âncora, das três Subclasses e da Trajetória (15 Antecedentes, 24 Qualidades, 28 Complicações) publicado pelo seed;
- criação pela tela (`AssistenteV12`) com rascunho persistente;
- payload montado no servidor (`buildCharacterV2`) e revalidado pela RPC `complete_character_creation_v2`;
- ficha e HUD calculam os máximos pelas fórmulas da Classe (DEC-003);
- rolagem: o motor da Fase 1 resolve as perícias do personagem v2 sem adaptação (Medicina com Mente 2 rola 2d8, usa o maior e soma 3).

Personagem de prova: Hilda Norren (`e434866f-ec73-4c2c-b685-76dad1855f84`), campanha de desenvolvimento 12312321.

A rolagem foi verificada com o motor real sobre o payload salvo, não por clique na mesa, para não gerar mensagens no chat da campanha.

## 2. Ajustes feitos no contrato durante a fatia

| Ajuste | Motivo |
|---|---|
| `efeitos` opcional em Qualidade/Complicação, com `aretz_inicial_adicional` | Recursos soma Ⱥ 1.500 ou Ⱥ 3.000 ao orçamento inicial. |
| Regiões como constante `REGIOES_V12`, não `content_type` | O capítulo 8 define as cinco regiões do Império como não personalizáveis. |
| Complicações: soma **mínima** 2 (antes: exatamente 2) | O texto permite Complicações adicionais por acordo do grupo. |
| `custos_permitidos` e `repetivel` aplicados na criação | Aliado só custa 2; Contato, Credencial e Boa Reputação são repetíveis. |
| `progressao.formulas_derivados` e `formulas_derivados_texto` | Cópia das fórmulas da Classe para a ficha e o HUD (DEC-003, proposta). |
| `mudancas_recursos_classe` com Focos e Intervenções por Ranking | Recursos próprios da Âncora; no Ranking S o valor é `"todos_aliados_proximos"`, texto e não número. |
| Rascunho `schema_version: 2` na tabela existente | Reaproveita a RPC de rascunho; cada assistente rejeita o formato do outro. |

## 3. Lacunas do contrato ainda abertas

1. **Fórmulas compostas.** `ResourceFormulaV12` é `constante + atributo × multiplicador`. "2 × (10 + Corpo)" foi gravado como `20 + Corpo × 2`. Funciona para as fórmulas da Âncora; uma Classe com dois atributos na mesma fórmula exigiria ampliar o contrato.
2. **Características estruturadas.** Só o aumento de Focos do Coordenador tem `efeitos`. Intervenções, Atendimentos e afins são texto; a mesa ainda não os executa.
3. **Recursos de Classe na ficha.** Focos e Intervenções por rodada estão no conteúdo, mas a ficha ainda não os exibe nem os controla.
4. **Catálogo de perícias no validador de conteúdo.** `validateClassContentV12` não confere se as perícias citadas existem; a conferência está no teste da Âncora e na criação.
5. **Ranking inicial diferente de F.** O capítulo 7 permite que o narrador defina outro Ranking inicial; a criação só aceita F.
6. **Escalpos de Moda gratuitos.** O capítulo 7 permite até 3 Escalpos de Moda de Ⱥ 150 sem custo; não modelado.
7. **Idioma da região da campanha.** A tela pede o idioma da região onde a campanha começa; a campanha ainda não registra essa região.
8. **Efeitos de Qualidades sem estrutura.** Linguista (dois idiomas extras) e Vida de Fachada (RPI de nível 2/3 e CDI Craqueada) existem só como texto.

## 4. Pendências editoriais encontradas

- **Pacotes de equipamento da Âncora:** placeholders no Notion.
- **Magias iniciais:** cada Vertente concede, no nível 1, a escolha de **quatro magias de nível 1** da sua lista, algumas com perícia como pré-requisito (ex.: Acoplar exige Engenharia 1). Implementar depende do catálogo de magias v1.2 e do crosswalk da Fase 6; o catálogo publicado ainda é o antigo (`somatica`). Até lá a RPC rejeita magias na criação.
- **CD de Vertente:** a página da Sináptica menciona "5 + Nível de Sináptica"; as demais usam CD = 6 + Nível. Mantido como ambíguo (regra de segurança 6).

## 5. Generalização para as sete Classes (adendo)

A transcrição das outras seis Classes exigiu um ajuste adicional no contrato: **características de Classe passaram de uma por Ranking para uma lista por Ranking**, como já era nas Subclasses. O Técnico concede Protocolo Reativo, Reprogramar e novas Funções no Ranking D.

Outras observações:

- **Companheiros do Domador:** as fichas (Canídeo, Felino, Ave de Rapina, Constritora, Peçonhenta) estão como texto dentro das características. O tipo `companion_model` já existe e poderia representá-las estruturadamente.
- **Notas de regra:** blocos como "Testes de Interação" (Face) e "Dados originais de dano" (Brutalista) viraram características próprias com esse nome.
- **Assassino, Ranking C:** o título no Notion contém "REVISAR O DANO DE SANGRANDO"; o texto foi transcrito como está e a nota ficou em `_meta.pendencias_editoriais`.

## 6. Progressão (adendo)

- **Proteção do Ranking.** O avanço é calculado e validado no servidor, mas a RPC `update_character_sheet_payload` aceita o payload inteiro do jogador controlador (como já aceitava atributos). Para que o Ranking só mude por avanço válido, é preciso: (1) uma RPC de avanço que valide no banco e (2) a RPC de ficha preservar `progressao`, `trajetoria` e `magia.niveis_vertente` para jogadores, como já faz com `tipo_personagem`. Não implementado sem decisão sua, porque muda o que o jogador pode editar na própria ficha.
- **Quem concede o Marco.** O capítulo 25 diz que o narrador reconhece o Marco; hoje narrador e controlador podem aplicar o avanço. Restringir ao narrador é uma decisão de produto.
- **Recursos atuais no avanço.** O avanço recalcula os máximos e não cura; o capítulo não diz que o Intervalo restaura recursos. Mantido assim até decisão.
- **Recursos de Classe na ficha.** Focos, Ímpeto, Brechas e afins avançam no conteúdo, mas a ficha ainda não os exibe.

## 7. Recomendação

Generalizar para as outras seis Classes e 21 Subclasses (Fase 4) usando o mesmo contrato. As lacunas 1 e 2 devem ser reavaliadas à medida que cada Classe for transcrita.
