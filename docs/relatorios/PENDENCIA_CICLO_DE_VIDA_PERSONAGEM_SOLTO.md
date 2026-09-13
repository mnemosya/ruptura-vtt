# Pendência — ciclo de vida do personagem SOLTO

**Estado:** aberta, aguardando decisão de produto.
**Aberta em:** 2026-09-13, ao reescrever `test:character-storage` para autenticar.
**Natureza:** não é bug de código. É uma regra que o banco aplica hoje e
sobre a qual ninguém decidiu explicitamente.

## O fato

As policies de `characters` tratam INSERT/UPDATE e DELETE de formas
diferentes:

```
INSERT / UPDATE   (campanha E você é o narrador dela)
                  OU (SEM campanha E o personagem é seu)

DELETE            SÓ (campanha E você é o narrador dela)
```

Um personagem **solto** — `campaign_id is null` — pode ser criado e
editado pelo dono, e **não pode ser apagado por ninguém** através da
policy. Nem pelo dono. A única forma de removê-lo é service role.

Não é um bloqueio que dá erro: a RLS não recusa o `DELETE`, ela
simplesmente não deixa o comando acertar linha nenhuma. Do lado do
cliente, `deleteCharacter` retorna sem exceção e o personagem continua
lá. Um usuário que tente apagar vê a operação "funcionar" e o
personagem permanecer.

## Por que não foi corrigido junto

Corrigir exige decidir o que um personagem solto É, e essa decisão tem
mais de uma resposta defensável:

1. **Solto é transitório.** Existe só entre a criação e a entrada numa
   mesa. Então o dono deveria poder apagá-lo, e a policy de DELETE
   ganha o ramo `(campaign_id is null and owner_id = auth.uid())` — a
   mesma condição que INSERT e UPDATE já usam. É a leitura mais simples
   e a que torna as três policies simétricas.

2. **Solto é arquivo pessoal.** Um personagem sem mesa é rascunho de
   quem o criou, e apagar deve ser difícil de propósito. Aí a policy
   está certa e o que falta é a interface parar de oferecer um botão de
   excluir que não exclui.

3. **Solto não deveria existir.** Se todo personagem nasce numa mesa, a
   pergunta some — mas aí o ramo `campaign_id is null` de INSERT/UPDATE
   é que está sobrando, e há dados legados a migrar.

As três mudam coisas diferentes: a primeira é uma migration, a segunda é
UI, a terceira é modelo de dados mais uma migração de dados. Escolher
por conta própria seria decidir produto.

## O que existe hoje para não esquecer

`scripts/test-character-storage.ts`, critério 9, afirma o comportamento
atual: a dona edita o solto e **não** consegue apagá-lo. O teste não
está "aceitando" o defeito — está fixando o estado de hoje, para que
qualquer mudança de policy apareça como falha apontando para este
documento.

Quando a decisão for tomada, o critério 9 é o primeiro lugar a mexer.

## Relacionado, e já resolvido

A mesma investigação encontrou um defeito de verdade, que **foi**
corrigido: `INSERT … RETURNING` é recusado nesta tabela para qualquer
conta não-service-role, porque a policy de SELECT (`can_read_character`,
função `STABLE` que reconsulta `characters`) não enxerga a linha sendo
inserida. O contorno já existia em `insertCharacterScoped`; o
`createCharacter` legado tinha ficado de fora dele e quebrava para
qualquer usuário autenticado. Ver o critério 8 do mesmo teste.
