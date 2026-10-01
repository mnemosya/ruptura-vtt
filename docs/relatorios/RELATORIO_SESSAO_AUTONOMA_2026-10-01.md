# Relatório — sessão autônoma da migração v1.2

**Data:** 01/10/2026
**Branch / PR:** `migracao-ruptura-v1-2` → [mnemosya/ruptura-vtt#3](https://github.com/mnemosya/ruptura-vtt/pull/3) (aberto, não mergeado)

## 1. Limites que segui

- Commits e push só na branch do PR. Nenhum merge.
- Banco remoto: só mudanças aditivas (seed de conteúdo novo). Cada mudança foi testada antes numa transação desfeita.
- Não apaguei dados e não fiz o corte de personagens da Fase 7.
- Não tomei decisões editoriais. Tudo o que depende de você está na seção 4.

## 2. O que foi feito

| Commit | Entrega |
|---|---|
| `df21adf` | Rascunho persistente da criação v1.2: salva sozinho, restaura na mesma etapa e trata o rascunho v1 como incompatível. |
| `a46e77d` | Relatório da fatia vertical da Âncora (Fase 3). |
| `eda522c` | Sete Classes e 24 Subclasses transcritas do Notion e publicadas pelo seed. As sete são criáveis pela tela e pela RPC. |
| `6744faf` | Avanço de Ranking: chip "Ranking X" no console abre o modal do próximo Ranking. O modal pede Subclasse no E, Perícias, Atributo e Vertente, e o servidor valida e grava. |
| `75f0655` | Plano atualizado com as entregas das Fases 4 e 5. |
| `ee6c5e0` | Metadados das 211 magias v1.2 e crosswalk preliminar com as 132 legadas. Nada foi publicado. |

### Verificado

- **Classes:** no remoto, numa transação desfeita, a RPC criou um personagem de cada Classe, cada um com suas fórmulas.
- **Avanço pela tela:** a Hilda Norren subiu de F para E (Vitalista, Luta +1, Vigor +1, Cinética 1). Conferi o banco e a ficha, e o console não mostrou erros.
- **Testes:** passam `test:ruleset-v12`, `-ancora`, `-criacao`, `-rascunho`, `-classes`, `-progressao` e `-magias`, além de `tsc`.

### Magias (Fase 6)

- **As 211 magias do BANCO DE MAGIAS estão como Rascunho ou Em revisão.** Por isso gerei só os metadados, em `content/v12/db_magias_v1_2_metadados.json`, e nada entrou no seed. Os metadados cobrem nível, Mana estruturada, conjuração, alcance, duração, pré-requisito e teste.
- **Crosswalk:** está em `docs/relatorios/CROSSWALK_MAGIAS_V1_2_RASCUNHO.md`, em versão legível.
  - 60 magias legadas têm homônima na mesma Vertente.
  - 72 não têm.
  - 151 magias v1.2 não têm antecessor por nome.
  - Todas as linhas estão como `ambiguous`, porque o plano diz que nome igual não basta (§7.2).
- **Magias de nível 1:** toda Vertente tem pelo menos quatro, que é o necessário para a escolha na criação.
- **Magias concedidas na criação e no avanço** ficam registradas em `magia.escolhas_pendentes` até o catálogo ser aprovado.

## 3. O que deixei de fora de propósito

- **Condições e combate da Fase 6:** mexem no motor de combate em uso.
- **Formulários do Editor Universal (Fase 2):** dependem de decisões de interface.
- **Recursos de Classe na ficha** (Focos, Ímpeto, Brechas e afins): falta decidir se a ficha só mostra esses valores ou se também controla o gasto.
- **Snapshot da Fase 0 e o corte de personagens da Fase 7:** são destrutivos ou exigem você.

## 4. Decisões que dependem de você

1. **DEC-003:** aprovar a cópia das fórmulas da Classe e do PA para `progressao.formulas_derivados`. Já está em uso.
2. **Proteção do Ranking:** hoje `update_character_sheet_payload` aceita o payload inteiro do jogador controlador. Fechar isso exige duas coisas: uma RPC de avanço, e a RPC de ficha preservar `progressao`, `trajetoria` e os níveis de Vertente.
3. **Quem concede o Marco:** hoje o narrador e o controlador podem avançar. Precisa decidir se fica só com o narrador.
4. **Cura no avanço:** hoje o avanço não cura e só recalcula os máximos.
5. **CD da Sináptica:** a página diz 5 + Nível e as outras Vertentes dizem 6 + Nível.
6. **Assassino, Ranking C:** a nota "REVISAR O DANO DE SANGRANDO" está no Notion.
7. **Pacotes de equipamento:** são placeholders em todas as Classes.
8. **Catálogo de magias:**
   - aprovar as magias no Notion;
   - classificar cada linha do crosswalk como `same`, `renamed`, `redesigned` ou `removed`;
   - depois disso, extrair o texto das magias.
9. **Limite de raridade de itens** na criação.
10. **Snapshot do banco (Fase 0):** é pré-requisito de qualquer passo destrutivo.

## 5. Próximo passo recomendado

Os passos que mais destravam são a decisão 2 (proteção do Ranking) e a aprovação do catálogo de magias (decisão 8). Com o catálogo aprovado, a escolha das quatro magias iniciais e a resolução das magias pendentes usam o crosswalk que já está pronto.
