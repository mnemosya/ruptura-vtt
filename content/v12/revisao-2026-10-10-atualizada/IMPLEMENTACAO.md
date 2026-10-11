# Atualização canônica do Notion — aplicada em 11/10/2026

Fonte: extração atual dos 12 capítulos comerciais, com conferência de ARMAS, INVENTÁRIO e CENAS DE COMBATE. A versão anterior permanece em `publicado-antes.json`.

A publicação foi aplicada em uma transação no projeto ruptura-vtt (`yvxoijexyhjjipjktfuu`), com trava dos registros, comparação de updated_at/status contra a cópia anterior e gravação em content_changelog. Resultado: 273 itens publicados, 49 runas publicadas, 39 escalpos, 10 modelos de companheiro e 3 novas propriedades. Apenas as três runas expressamente retiradas foram arquivadas. Os quatro itens retirados anteriormente continuam arquivados. Nenhuma instância de personagem foi alterada por essa transação.

## Regras implementadas

- As 78 armas têm Mãos explícito: 28 usam uma mão e 50 usam duas. Manoplas ocupam ambas. A projeção e os fluxos de equipamento aplicam a exclusividade das mãos com armas/escudo e das regiões da armadura.
- Traje e Suporte de Munição têm posições próprias no painel. Trajes verificam compatibilidade com as classes de armadura declaradas; acessórios e mobilidade respeitam suas posições independentes no domínio.
- Kits comprados cobram por kit e guardam unidades; carga calcula conjuntos parcialmente consumidos sem contar cada projétil como um espaço.
- Facas de Arremesso têm modos selecionáveis de arremesso e corpo a corpo, com dados e perícias próprios. A mesa lê o modo persistido para o dano contestado.
- Armas e munições são vinculadas pelo catálogo atual. Células são separadas dos suportes convencionais. A troca preserva a célula vazia no inventário.
- Aljavas e cartucheiras guardam munição com capacidade ponderada e não aceitam células. A Autoalimentadora aceita apenas flechas e permite consumo no ataque; arcos sem Autoalimentadora exigem recarga da arma.
- Recarga usa primeiro suporte equipado/acesso rápido (1 PA), depois mochila (2 PA); abrigo não é estoque de combate. Falhas e PA insuficiente não gastam munição.
- Alcance é lido das fichas e validado no ataque da mesa a partir das pegadas reais dos tokens. Penalidade além do alcance eficaz aparece no painel de rolagem e é reconferida no servidor.
- Congelamento, Ofuscamento e Disrupção foram publicados com as definições atuais e integrados às sugestões de propriedades críticas. O alvo continua sendo afetado pela confirmação do narrador, como nas demais propriedades críticas do VTT.
- Capacidade de runas vem da categoria leve/média/pesada, separadamente do campo Mãos. Instalação usa o modelo atual, rejeita runas arquivadas e preserva as já registradas nos personagens.
- Descrições completas de Retorno Vetorial e Trajetória Serpentina são preservadas. Sua resolução contextual, incluindo segundo alvo, continua no fluxo do narrador.

## Decisões pendentes

1. **Pente Fantasma:** falta definir de qual localização sai a munição recuperada. Nenhuma transferência automática foi criada.

## Ajuste provisório autorizado em 2026-10-11

**AS-127 Wrecker:** usa munição de Precisão por decisão do usuário, mantendo capacidade de 1 projétil. A associação é recíproca no catálogo e fica preservada na preparação de futuras revisões. A fonte do Notion permanece intacta; este vínculo é provisório.

## Validação

TypeScript sem erros; testes de atualização do Notion, tradução técnica, inventário/carga, munições, escalpos e ícones aprovados. As cópias intermediárias são artefatos de auditoria, não substitutos do catálogo já publicado. `publicacao.sql` é a transação já executada e não deve ser reaplicada com a cópia antiga.
