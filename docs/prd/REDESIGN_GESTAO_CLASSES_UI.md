# Gestão de classes no Console — redesign

13/10/2026. Substitui o painel uniforme de registros. O mapeamento de regras continua em `MAPEAMENTO_CLASSES_SUBCLASSES_UI.md`.

## Referências consultadas

- [D&D Beyond — seções da ficha](https://dndbeyond-support.wizards.com/hc/en-us/articles/7747193946388-Sheet-Sections): ações disponíveis separadas da referência de características; usos limitados agrupados por recuperação. A própria documentação avisa que algumas imagens podem diferir da versão atual.
- [D&D Beyond — Extras](https://dndbeyond-support.wizards.com/hc/en-us/articles/7747209465748-Extras): companheiros como blocos de estatísticas associados ao personagem.
- [Foundry — Active Effects](https://foundryvtt.com/article/active-effects/): efeitos temporários ligados ao estado de atores/itens, sem sobrescrever valores-base.
- [Roll20 — recursos da ficha](https://bloghub.roll20.net/posts/tome-of-tips-dungeons-dragons-5th-edition-ogl/): recurso vinculado ao inventário, evitando contadores independentes; automação vinculada à ação.

As referências informam o fluxo de uso. A tipografia, cores, moldura e densidade seguem o Console de Ruptura.

## Decisões

1. A tela abre no gerenciamento em jogo. Dossiê, qualidades, complicações e formação permanecem abaixo.
2. Nenhum formulário de texto livre como atividade principal. Selecionar aliado, alvo, item, região, dado ou abordagem são interações próprias de cada tarefa.
3. Custos e motivos de indisponibilidade aparecem junto da ação. Uso em um clique; regras em botão separado. Desfazer devolve apenas o último custo/estado de classe quando não houve outra alteração incompatível.
4. As classes compartilham somente tokens visuais e componentes pequenos. A composição espacial muda: equipe/triagem, mira, companheiro, investigação, anatomia, movimento, negociação, rede, bancada, topologia, escudos e Fúria.
5. Dados reais vêm da ficha: PA, inventário/PD, atributos, aliados e tokens disponíveis. Exemplos só existem na rota `/dev/identidade`.
6. Rank limita as ações disponíveis. As futuras ficam em uma seção recolhida.
7. O motor v1.2 é separado dos campos de talentos antigos. Registros manuais antigos são preservados, mas não usados como estado mecânico.

## Implementado e verificado localmente

- 24 variantes de interface, responsividade e moldura do Console.
- Custos de PA e de recurso da classe na confirmação do uso; limites por rodada/cena e por alvo nas ações configuradas.
- Renovação por mudança de rodada/cena; Dados de Manobra no descanso longo; renovação de operação explícita na Face.
- Reserva Tática: pagamento da preparação e separação de PA; disponibilização na rodada seguinte e expiração.
- Face: pool real de interação, Guardar/Trocar uma vez por teste, resultado preservado na reserva e resolução pelo rolador existente. A reserva começa vazia: não é gerada por uma rolagem independente.
- Unidades: instalação/recolhimento e operação com custos; limite de uma operação por Unidade/rodada.
- Guardião: PD das instâncias empunhadas; defesa usa Reflexos e a rotina de Reação existente; bônus por dois escudos com PD.
- Recursos por alvo, escolhas de Foco, regiões, modelos e preparação persistidos no payload da ficha.
- Calculadora de negociação; progressão terapêutica; escolhas de briefing, modulação, rota e bancada.

## Limites explícitos

Este redesign não implementa um segundo motor completo de combate. Declarar uma característica acompanha seus custos/usos e a deixa em resolução; a descrição orienta o resultado que deve ser aplicado pelo fluxo correspondente. Dano, cura em outro personagem, condições, distância/linha de visão, movimentação de tokens e modificadores condicionais não são universalmente automatizados. Preparar uma modificação ou escolher um modelo não fabrica nem compra um item.

Tratamento persistente, datas ficcionais, elegibilidade narrativa e condições de alvo ainda exigem decisão na mesa. Essas informações não são inventadas pelo Console. A reserva da Face já usa dados reais; o passo de interação atualmente resolve sem uma CD predefinida, como as rolagens abertas da ficha.

A chamada de teste de integração de fim de cena não conectou ao backend nesta execução. Testes puros, TypeScript e verificações Playwright locais cobrem o comportamento descrito; não equivalem a validação multiplayer ponta a ponta.
