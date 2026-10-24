# Revisão do Notion — 24/10/2026

Fonte: [Ruptura (1.2)](https://app.notion.com/p/17f0a1363552827fab1601753924fb3a) e páginas filhas sincronizadas no Compêndio.

## Aplicado

- Compêndio: 49 páginas conferidas na sincronização; 7 atualizadas e 42 sem alteração.
- Ruptura, Sobrecarga, Condições, classes Técnico, Face, Combatente e Vanguarda: conteúdo e controles afetados atualizados.
- Ações de combate: descrições atuais na aba Ações e 25 registros atualizados na Biblioteca do Sistema. As oito ações de Investigação também usam o texto atual.
- Mercado: 280 itens, 38 runas e 17 Máquinas Autônomas publicados. Peças retiradas foram arquivadas, preservando as fichas existentes.
- As 13 entradas de `content/v12/revisao_notion.json` têm hash de revisão da página atual.

## Revisão técnica de armas

A extração do mercado registrou 71 conflitos de campos técnicos de armas, principalmente perícia de teste e alcance. Os campos existentes foram preservados quando a leitura da tabela divergiu. O arquivo [avisos-armas.json](./avisos-armas.json) lista cada ocorrência para conferência pontual; nenhuma delas foi usada para sobrescrever silenciosamente esses campos.

Os dados publicados no Supabase foram validados com dry-run por documento. As mudanças de interface e de geração estão no código local e dependem do fluxo normal de deploy.
