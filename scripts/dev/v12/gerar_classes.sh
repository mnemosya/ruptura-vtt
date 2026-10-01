#!/usr/bin/env bash
# Regenera os pacotes de Classe v1.2 (content/v12/db_classe_*_v1_2.json).
# Âncora foi transcrita à mão (content/v12/db_classe_ancora_v1_2.json) e a
# Vanguarda tem script próprio. As demais saem do extrator a partir dos
# textos limpos do Notion em fontes/ (limpar_notion.py gera esse formato).
set -euo pipefail
cd "$(dirname "$0")"
python3 classe_vanguarda.py
python3 extrair_classe.py fontes/tecnico.txt tecnico https://app.notion.com/p/3d90a13635528045a101de4d967cd26c 2026-09-20T02:00:00.000Z unidades_ativas
python3 extrair_classe.py fontes/infiltrador.txt infiltrador https://app.notion.com/p/3d90a1363552807294c8d481c179bf01 2026-09-14T23:12:20.301Z limite_brechas
python3 extrair_classe.py fontes/combatente.txt combatente https://app.notion.com/p/3d90a13635528088ac28caeaca52d623 2026-09-20T01:34:35.817Z
python3 extrair_classe.py fontes/cacador.txt cacador https://app.notion.com/p/3d90a13635528034a166dbb1dd0c2b3b 2026-09-20T01:32:00.000Z
python3 extrair_classe.py fontes/face.txt face https://app.notion.com/p/3d90a136355280b18fc8e6819e95616f 2026-09-14T23:12:42.819Z reserva_confianca
