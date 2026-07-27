# Checkpoint — Ficha em Modo Jogo: identidade (parcial)

## Achado

Auditando a ficha (`CharacterSheetClient.tsx`/`GeneralTab.tsx`) contra
o wizard de criação: `metadados.alcunha`/`.conceito`/`.origem`/
`.idioma`/`.afiliacao` são capturados desde o checkpoint v0.41, mas
**nenhum lugar da ficha os exibia** — só `character.nome` aparecia em
qualquer lugar (confirmado por busca de texto no arquivo inteiro).

## Correção

`GeneralTab.tsx` ganha um bloco de identidade somente-leitura logo
abaixo do campo de nome, alimentado por `character.metadados` (novo
prop) — aparece só quando pelo menos um campo tem valor (personagens
antigos, criados antes do v0.41, continuam sem o bloco em vez de
mostrar campos vazios).

## Outras áreas de Modo Jogo verificadas nesta sessão (sem gap encontrado)

- **Magias/vertentes** (`SpellsTab.tsx`): já consome
  `magias_aprendidas`/`niveis_vertente` corretamente — funciona de
  verdade agora que o wizard (Fase 3) realmente popula esses campos.
- **Talentos** (`TalentsTab.tsx`): já tem o callback `onAcquire`
  ligado ao motor real; personagens com talento inicial aplicado pela
  Fase 3 aparecem corretamente.
- **Sobrecarga** (`overload.ts`): a aplicação "manual" de dano
  psíquico é uma decisão de design já documentada no código (o
  conteúdo não estrutura o recurso-alvo) — não é um bug residual,
  não foi alterado.

## Ainda não auditado a fundo nesta sessão

Inventário/condições/rolagens em Modo Jogo não passaram por uma
auditoria linha-a-linha equivalente — o escopo desta fase ficou
concentrado no gap concreto encontrado (identidade). Se houver outras
lacunas silenciosas do mesmo tipo (campo capturado em algum lugar mas
nunca exibido), ficam para uma auditoria dedicada.

## Validação

- `npx tsc --noEmit` e `npm run build`: limpos.
- Não verificado em navegador nesta sessão.
