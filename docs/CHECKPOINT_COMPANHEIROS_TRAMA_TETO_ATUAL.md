# Checkpoint — Companheiros/drones/robôs/Trama (teto atual, sem mudança de código)

## Achado

`docs/CHECKPOINT_ETAPA10_COMPANHEIROS_TRAMA.md` já documenta, com
auditoria completa e várias rodadas de aceite de browser reais contra
o Supabase, exatamente a situação que esta fase pediu para resolver:
dois sistemas deliberadamente separados —

1. **Gameplay real** (`talentEngine.ts`) — ~15 funções bespoke
   (Droneiro/Mecatrônico/Tecelão), cada uma lendo um `tipo`/`família`
   exato de UM nível de talento específico, com CRUD completo em
   `Character.drones[]`/`robos[]`/`trama_ativa` e UI própria.
2. **Editor Universal** — os efeitos desses 3 talentos sempre caem em
   `FAMILIAS_INCOMPATIVEIS` (documentado desde antes da Etapa 10);
   os 6 tipos de efeito novos (`companheiro`, `modificar_companheiro`,
   `acao_companheiro`, etc.) são **sempre `lembrete`** — decisão
   deliberada, não uma lacuna esquecida.

## Por que não foi unificado nesta sessão

Construir a "camada de consumo" pedida — ler o payload publicado e
criar a instância real correspondente — exigiria UMA das duas coisas
que o próprio checkpoint da Etapa 10 já rejeitou depois de auditar:

- generalizar as ~15 funções bespoke para aceitarem qualquer payload
  de conteúdo genérico (ex.: `pairDronesEnxame` só aceita drones do
  MESMO `modelo` textual, limite 3 — valores literais de UM talento
  específico; generalizar isso é reimplementar a regra, não conectar
  um executor); ou
- criar um executor genérico novo que reimplementa a lógica de
  Droneiro/Mecatrônico/Tecelão a partir do zero — violando
  diretamente "não reimplementar motores já existentes".

Ambos os caminhos contrariam princípios explícitos desta execução.
**Nenhuma mudança de código nesta fase.**

## Estado real (sem alteração)

- Companheiros/drones/robôs/Trama funcionam de verdade SÓ através dos
  talentos bespoke específicos (Droneiro/Mecatrônico/Tecelão) — não
  através de conteúdo genérico do Editor Universal.
- Um admin pode documentar/publicar conteúdo de companheiro/Trama no
  Editor Universal (sempre como lembrete, nunca executa sozinho) —
  isso já funciona e foi validado ao vivo (ver "Aceite de browser" no
  checkpoint da Etapa 10).

## O que desbloquearia unificação real (fora de escopo, registrado)

Um redesenho de produto que definisse os ~15 comportamentos bespoke
como INSTÂNCIAS de um schema genérico comum (não o inverso) — decisão
de design que precisa vir do dono do produto, não de uma correção
pontual nesta sessão.
