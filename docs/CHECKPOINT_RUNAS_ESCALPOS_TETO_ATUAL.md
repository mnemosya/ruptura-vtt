# Checkpoint — Runas e escalpos operacionais (teto atual, sem mudança de código)

## Achado

Auditoria pré-existente completa e honesta já cobre exatamente o que
esta fase pediu (`docs/RELATORIO_AUTOMACAO_RUNAS.md`, checkpoint
v0.57): das 40 runas publicadas, 1 já é automatizada de verdade
(commit `423e92d`), e as ~39 restantes foram classificadas runa a
runa e bloqueadas **deliberadamente**, não por falta de esforço — a
automação exigiria sistemas que não existem hoje:

- resolução de ataque/dano integrada por runa (`dano_modificador`,
  `ataque_adicional`);
- alvo estruturado + resistência do alvo (`efeito_com_resistencia`,
  `aplicar_condicao`);
- pipeline de MIT/PD por dano recebido (`protecao`, `autorreparo`);
- gatilhos de evento/estado (PV abaixo da metade, "ao eliminar
  inimigo", cadência "por cena");
- estado de item novo (`torna_ocultavel` — nenhuma propriedade
  renderizável equivalente existe em `InventoryItemInstance`/
  `ItemContent`).

Escalpos (`technicalEffects.ts::deriveInstalledTechnicalEffects`) já
seguem o mesmo padrão: aplicam efeitos incondicionais automaticamente,
mas **explicitamente pulam** qualquer efeito com `quando != null`
("condicional — não automatizado nesta fase, sem inventar contexto",
comentário já existente no código) — mesmo critério de segurança
usado em condições/talentos.

## Decisão desta sessão

Implementar "executores reutilizáveis por categoria de efeito" para
as runas do Grupo C forçaria exatamente o que o checkpoint v0.57 já
identificou como impossível sem inventar regra ou construir um
sistema inteiro novo (alvo/mapa, dano por região, gatilhos de evento).
Isso violaria o princípio central do projeto ("nunca aplicar
modificador incondicional quando o payload declara uma restrição que
o motor não consegue verificar") e o próprio pedido desta execução
("não inventar regra", "não reimplementar motores já existentes",
"não fazer refactor preventivo").

**Nenhuma mudança de código nesta fase** — o estado já é o teto
seguro possível com a infraestrutura atual. Runas/escalpos com efeito
condicional/dependente de alvo continuam como Lembrete, exatamente
como o princípio "manter como Lembrete apenas as que exigem
julgamento humano real" pede.

## O que desbloquearia mais automação (fora de escopo, registrado para o futuro)

- Sistema de alvo estruturado (mesmo que mínimo, sem mapa) para
  resolver `aplicar_condicao`/`efeito_com_resistencia`/
  `ataque_adicional` em runas.
- Campo de estado de item (`estadoRuna` ou equivalente) para runas
  tipo `torna_ocultavel` — schema sugerido já está em
  `RELATORIO_AUTOMACAO_RUNAS.md`.
- Pipeline de dano recebido/MIT-PD acessível fora do fluxo de "Atacar"
  para runas de proteção/autorreparo.
