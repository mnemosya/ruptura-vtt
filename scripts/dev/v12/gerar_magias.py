"""Catálogo de metadados das magias v1.2 e crosswalk preliminar com o catálogo antigo.

Fonte: banco "BANCO DE MAGIAS" do Notion (collection://58de8b08-a4dd-4299-af37-864306f4f3eb),
exportado em fontes/magias_v12_banco_notion.json (só propriedades; o texto das magias
fica nas páginas e ainda não foi extraído).

Saídas (nada é publicado):
  content/v12/db_magias_v1_2_metadados.json
  content/v12/crosswalk_magias_v1_3_para_v1_2.json
  docs/relatorios/CROSSWALK_MAGIAS_V1_2_RASCUNHO.md

Regra do plano (§7.2): igualdade de nome nunca basta. Nome igual gera apenas um
CANDIDATO; toda linha sai com status "ambiguous" até revisão editorial.
"""
import json
import os
import re
import unicodedata
from collections import defaultdict

AQUI = os.path.dirname(__file__)
RAIZ = os.path.normpath(os.path.join(AQUI, "..", "..", ".."))
REGRAS = json.load(open(os.path.join(RAIZ, "content", "db_regras_personagem_normalizado_v1_4.json"), encoding="utf-8"))


def sem_acento(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", sem_acento(s).lower()).strip()


PERICIAS = {norm(p["nome"]): p["id"] for p in REGRAS["pericias"]}


def custo_mana(bruto):
    b = bruto.strip()
    if re.fullmatch(r"\d+", b):
        return {"tipo": "fixo", "valor": int(b), "texto": b}
    m = re.fullmatch(r"(\d+)\s*[–-]\s*(\d+)", b)
    if m:
        return {"tipo": "intervalo", "min": int(m.group(1)), "max": int(m.group(2)), "texto": b}
    return {"tipo": "variavel", "texto": b}


def conjuracao(bruto):
    b = bruto.strip()
    m = re.fullmatch(r"(\d+) PA", b)
    if m:
        return {"tipo": "pa", "pa": int(m.group(1)), "texto": b}
    if b.lower() == "reação":
        return {"tipo": "reacao", "texto": b}
    m = re.fullmatch(r"(\d+) (minutos?|horas?)", b)
    if m:
        minutos = int(m.group(1)) * (60 if m.group(2).startswith("hora") else 1)
        return {"tipo": "tempo", "minutos": minutos, "texto": b}
    return {"tipo": "variavel", "texto": b}


def prerequisito(bruto):
    m = re.fullmatch(r"(.+?)\s+(\d)", bruto.strip())
    if m and norm(m.group(1)) in PERICIAS:
        return {"pericia": PERICIAS[norm(m.group(1))], "valor": int(m.group(2)), "texto": bruto}
    return {"texto": bruto}


def main():
    brutos = json.load(open(os.path.join(AQUI, "fontes", "magias_v12_banco_notion.json"), encoding="utf-8"))
    magias = []
    for r in brutos:
        vertente, _, resto = r["id"].partition("-")
        magias.append({
            "slug": f"{vertente}_{resto.replace('-', '_')}",
            "id_notion": r["id"],
            "nome": r["nome"],
            "vertente": vertente,
            "nivel": int(r["nivel"]),
            "tipo": r["tipo"],
            "custo_mana": custo_mana(r["mana"]),
            "conjuracao": conjuracao(r["pa"]),
            "alcance": r["alcance"],
            "duracao": r["duracao"],
            "prerequisito": prerequisito(r["prereq"]),
            "teste_defesa": r["teste"],
            "status_editorial": r["status"],
            "fonte": r["url"],
        })
    magias.sort(key=lambda m: (m["vertente"], m["nivel"], m["nome"]))

    os.makedirs(os.path.join(RAIZ, "content", "v12"), exist_ok=True)
    meta = {
        "ruleset_version": "1.2",
        "fonte": "Notion — BANCO DE MAGIAS (collection://58de8b08-a4dd-4299-af37-864306f4f3eb)",
        "extraido_em": "2026-10-01",
        "aviso": "Somente metadados. O texto das magias ainda não foi extraído e nenhuma magia está publicada. Todas estão como Rascunho/Em revisão no Notion.",
    }
    json.dump({"_meta": meta, "magias": magias}, open(os.path.join(RAIZ, "content", "v12", "db_magias_v1_2_metadados.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    antigas = json.load(open(os.path.join(RAIZ, "content", "db_magias_normalizado_v1_3.json"), encoding="utf-8"))["magias"]
    por_vertente_nome = defaultdict(list)
    for m in magias:
        por_vertente_nome[(m["vertente"], norm(m["nome"]))].append(m)
    por_nome = defaultdict(list)
    for m in magias:
        por_nome[norm(m["nome"])].append(m)

    linhas = []
    usadas = set()
    for a in sorted(antigas, key=lambda x: (x["vertente"], x["nome"])):
        vertente_nova = "biotica" if a["vertente"] == "somatica" else a["vertente"]
        candidatos = por_vertente_nome.get((vertente_nova, norm(a["nome"])), [])
        outra_vertente = [c for c in por_nome.get(norm(a["nome"]), []) if c not in candidatos]
        if candidatos:
            c = candidatos[0]
            usadas.add(c["slug"])
            nota = "Nome igual na mesma Vertente. Confirmar se o efeito é o mesmo (same), só mudou o nome (renamed) ou foi redesenhado (redesigned)."
            if c["nivel"] != int(a.get("estatisticas", {}).get("nivel", c["nivel"]) or c["nivel"]):
                nota += f" Nível mudou: {a.get('estatisticas', {}).get('nivel')} → {c['nivel']}."
            linhas.append({"legacy_slug": a["slug"], "legacy_nome": a["nome"], "legacy_vertente": a["vertente"],
                           "canonical_slug": c["slug"], "canonical_nome": c["nome"], "status": "ambiguous",
                           "candidato": "mesmo_nome", "migration_strategy": "pendente de revisão editorial", "editorial_notes": nota})
        else:
            nota = "Sem magia v1.2 com o mesmo nome na Vertente. Pode ter sido renomeada, redesenhada ou removida."
            if outra_vertente:
                nota += " Existe magia homônima em outra Vertente: " + ", ".join(c["slug"] for c in outra_vertente) + "."
            linhas.append({"legacy_slug": a["slug"], "legacy_nome": a["nome"], "legacy_vertente": a["vertente"],
                           "canonical_slug": None, "canonical_nome": None, "status": "ambiguous",
                           "candidato": "sem_correspondencia", "migration_strategy": "pendente de revisão editorial", "editorial_notes": nota})
    novas = [m for m in magias if m["slug"] not in usadas]

    crosswalk = {"_meta": {**meta, "regra": "Plano §7.2: igualdade de nome nunca basta; todas as linhas começam como ambiguous."},
                 "legado": linhas, "sem_antecessor": [{"canonical_slug": m["slug"], "nome": m["nome"], "vertente": m["vertente"], "nivel": m["nivel"]} for m in novas]}
    json.dump(crosswalk, open(os.path.join(RAIZ, "content", "v12", "crosswalk_magias_v1_3_para_v1_2.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # Relatório legível para revisão.
    por_v = defaultdict(lambda: {"total": 0, "n1": 0})
    for m in magias:
        por_v[m["vertente"]]["total"] += 1
        por_v[m["vertente"]]["n1"] += m["nivel"] == 1
    mesmo = [l for l in linhas if l["candidato"] == "mesmo_nome"]
    sem = [l for l in linhas if l["candidato"] == "sem_correspondencia"]
    tipos_mana = defaultdict(int)
    tipos_conj = defaultdict(int)
    for m in magias:
        tipos_mana[m["custo_mana"]["tipo"]] += 1
        tipos_conj[m["conjuracao"]["tipo"]] += 1
    out = ["# Crosswalk de magias v1.3 → v1.2 (rascunho para revisão editorial)", "",
           "**Gerado em:** 01/10/2026 por `scripts/dev/v12/gerar_magias.py`  ",
           "**Fonte v1.2:** banco BANCO DE MAGIAS do Notion (só propriedades).  ",
           "**Fonte legada:** `content/db_magias_normalizado_v1_3.json`.", "",
           "Nenhuma linha está aprovada. Pelo plano (§7.2), igualdade de nome não basta: cada linha precisa de uma classificação editorial (`same`, `renamed`, `redesigned`, `removed`) antes de qualquer migração.", "",
           "## Números", "",
           f"- Magias v1.2: **{len(magias)}** (todas em Rascunho ou Em revisão no Notion).",
           f"- Magias legadas: **{len(antigas)}**.",
           f"- Legadas com homônima na mesma Vertente (candidatas): **{len(mesmo)}**.",
           f"- Legadas sem homônima: **{len(sem)}**.",
           f"- Magias v1.2 sem antecessor por nome: **{len(novas)}**.", "",
           "| Vertente | Magias v1.2 | Nível 1 |", "|---|---|---|"]
    for v in sorted(por_v):
        out.append(f"| {v} | {por_v[v]['total']} | {por_v[v]['n1']} |")
    out += ["", "Custos de Mana: " + ", ".join(f"{k} {v}" for k, v in sorted(tipos_mana.items())) + ".  ",
            "Conjuração: " + ", ".join(f"{k} {v}" for k, v in sorted(tipos_conj.items())) + ".", "",
            "## Legadas com homônima (confirmar same/renamed/redesigned)", "", "| Legada | v1.2 | Observação |", "|---|---|---|"]
    for l in mesmo:
        out.append(f"| `{l['legacy_slug']}` | `{l['canonical_slug']}` | {l['editorial_notes']} |")
    out += ["", "## Legadas sem homônima (classificar)", "", "| Legada | Nome | Observação |", "|---|---|---|"]
    for l in sem:
        out.append(f"| `{l['legacy_slug']}` | {l['legacy_nome']} | {l['editorial_notes']} |")
    out += ["", "## Magias v1.2 sem antecessor por nome", "", "| v1.2 | Nome | Nível |", "|---|---|---|"]
    for m in novas:
        out.append(f"| `{m['slug']}` | {m['nome']} | {m['nivel']} |")
    open(os.path.join(RAIZ, "docs", "relatorios", "CROSSWALK_MAGIAS_V1_2_RASCUNHO.md"), "w", encoding="utf-8").write("\n".join(out) + "\n")
    print(f"{len(magias)} magias v1.2; {len(mesmo)} candidatas por nome; {len(sem)} legadas sem homônima; {len(novas)} novas")


if __name__ == "__main__":
    main()
