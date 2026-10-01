"""Extrai um pacote de Classe v1.2 do texto limpo de uma página do Notion.

Uso: python3 extrair_classe.py <pagina.txt> <slug> <fonte_url> <editada_em> [recurso_classe]

A página precisa seguir o modelo das Classes v1.2 (tabela de progressão,
"CRIANDO UM(A) ...", "CARACTERÍSTICAS DE CLASSE", "SUBCLASSES DE ...").
O extrator falha alto (AssertionError) quando algo foge do modelo, em vez
de inventar valores. Regras de agrupamento das características:

* As características de um Ranking são as nomeadas na frase "Você adquire
  a(s) característica(s) ..."; cada título "####" com esse nome abre uma
  característica.
* Outros títulos "####" (ex.: GANHANDO ÍMPETO) viram subseções da
  característica anterior, exceto "FUNÇÕES", que vira uma característica
  própria ("Funções do Ranking X").
* Texto do Ranking fora da frase "Você adquire..." (ex.: "Seu limite de
  Focos aumenta em 1") vira uma característica de aprimoramento.
"""
import json
import os
import re
import sys
import unicodedata

sys.path.insert(0, os.path.dirname(__file__))
from classe_comum import classe, criacao, perfis_pericias, recurso, salvar, subclasse  # noqa: E402

RAIZ = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
REGRAS = json.load(open(os.path.join(RAIZ, "content", "db_regras_personagem_normalizado_v1_4.json"), encoding="utf-8"))
VERTENTES = {"BIÓTICA": "biotica", "CINÉTICA": "cinetica", "COGNITIVA": "cognitiva", "ENERGÉTICA": "energetica", "MATERIAL": "material", "SINÁPTICA": "sinaptica"}
ATRIBUTOS = {"corpo": "corpo", "mente": "mente", "ânimo": "animo", "animo": "animo"}


def sem_acento(s):
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "_", sem_acento(s).lower()).strip("_")


def titulo(nome):
    """'PONTO DE APOIO' -> 'Ponto de Apoio' (mantém preposições minúsculas)."""
    menores = {"de", "da", "do", "das", "dos", "e", "a", "o", "em", "na", "no", "para", "por", "com", "sem", "ao", "à"}
    palavras = nome.strip().lower().split()
    out = []
    for i, p in enumerate(palavras):
        out.append(p if (i > 0 and p in menores) else "-".join(x[:1].upper() + x[1:] for x in p.split("-")))
    return " ".join(out)


PERICIAS = {sem_acento(p["nome"]).lower(): p["id"] for p in REGRAS["pericias"]}


def pericias_da_linha(linha):
    ids = []
    for nome in linha.split():
        chave = sem_acento(nome).lower().strip(".,;")
        if not chave:
            continue
        assert chave in PERICIAS, f"perícia desconhecida na lista: {nome!r}"
        ids.append(PERICIAS[chave])
    return ids


def celulas(linha):
    return [c.strip() for c in linha.strip().strip("|").split("|")]


def secao(texto, inicio_regex, fim_regex=None):
    m = re.search(inicio_regex, texto, flags=re.M)
    assert m, f"seção não encontrada: {inicio_regex}"
    resto = texto[m.end():]
    if fim_regex:
        f = re.search(fim_regex, resto, flags=re.M)
        assert f, f"fim de seção não encontrado: {fim_regex}"
        resto = resto[:f.start()]
    return resto


def separar_nomes(trecho):
    trecho = trecho.split(":")[-1] if ":" in trecho and "Intervenção" in trecho else trecho
    partes = re.split(r",\s*|\s+e\s+", trecho)
    return [p.strip(" .") for p in partes if p.strip(" .")]


def nomes_adquiridos(intro):
    nomes = []
    for frase in re.split(r"(?<=\.)\s+", intro):
        for m in re.finditer(r"característica[s]?\s+(.+?)(?:\.|$)", frase):
            trecho = m.group(1)
            trecho = re.split(r"\s+e uma nova Intervenção:\s*|\s+e uma nova\s+", trecho)
            for t in trecho:
                nomes += separar_nomes(t)
        for m in re.finditer(r"Intervenção:\s*(.+?)(?:\.|$)", frase):
            nomes += separar_nomes(m.group(1))
    return [n for n in nomes if n and not n.lower().startswith("de subclasse")]


def paragrafos(linhas):
    """Parágrafos separados por linha em branco; itens de lista e linhas de tabela seguidos ficam juntos."""
    out = ""
    anterior = ""
    for l in (x for x in linhas if x):
        continua = (l.startswith("- ") and anterior.startswith("- ")) or (l.startswith("|") and anterior.startswith("|"))
        out += ("\n" if continua else "\n\n") + l if out else l
        anterior = l
    return out


def extrair_ranking(bloco, ranking, prefixo_slug, usados):
    """Lista de características de um bloco "### RANKING X"."""
    linhas = [l for l in bloco.split("\n") if l.strip()]
    i = 0
    intro = []
    while i < len(linhas) and not linhas[i].startswith("#### "):
        intro.append(linhas[i])
        i += 1
    nomes = {sem_acento(n).lower(): n for n in nomes_adquiridos(" ".join(intro))}

    feats = []
    sobra = [l for l in intro if not re.match(r"Você (adquire|recebe)|Escolha uma Subclasse", l)]
    if sobra:
        m = re.search(r"A característica (.+?) é aprimorada", " ".join(intro))
        if m:
            nome = f"{titulo(m.group(1))} Aprimorada"
        elif re.match(r"(Seu|Sua) limite", sobra[0]):
            nome = f"Aprimoramento (Ranking {ranking})"
        else:
            termo = re.match(r"^([A-ZÀ-Ú][^.]{2,40})\.\s", sobra[0])
            nome = titulo(termo.group(1)) if termo else f"Regras do Ranking {ranking}"
        feats.append({"nome": nome, "linhas": sobra})

    atual = None
    while i < len(linhas):
        l = linhas[i]
        if l.startswith("### "):
            atual = {"nome": titulo(l[4:]), "linhas": []}
            feats.append(atual)
        elif l.startswith("#### "):
            cab = l[5:].strip()
            chave = sem_acento(cab).lower()
            if chave in {sem_acento(k).lower() for k in nomes.values()} or chave in nomes:
                atual = {"nome": titulo(cab), "linhas": []}
                feats.append(atual)
            elif chave.startswith("funcoes"):
                atual = {"nome": f"Funções do Ranking {ranking}", "linhas": []}
                feats.append(atual)
            elif atual is None:
                atual = {"nome": titulo(cab), "linhas": []}
                feats.append(atual)
            else:
                atual["linhas"].append(cab.upper())
        else:
            alvo = atual if atual is not None else (feats[-1] if feats else None)
            assert alvo is not None, f"texto sem característica no Ranking {ranking}: {l[:60]}"
            alvo["linhas"].append(l)
        i += 1

    out = []
    for f in feats:
        slug = slugify(f["nome"])
        if slug in usados:
            slug = f"{slug}_{prefixo_slug}_{slugify(ranking)}"
        usados.add(slug)
        descricao = paragrafos(f["linhas"]).strip()
        assert descricao, f"característica vazia: {f['nome']} (Ranking {ranking})"
        out.append({"slug": slug, "nome": f["nome"], "descricao": descricao})
    assert out, f"Ranking {ranking} sem características"
    return out


NOTAS_EDITORIAIS = []


def blocos_ranking(texto, contexto=""):
    """Separa os blocos "### RANKING X". Um título como "### RANKING C (REVISAR ...)"
    tem a nota registrada como pendência editorial do pacote."""
    partes = re.split(r"^### RANKING (S\+|[FEDCBAS])(?:\s*\((.+?)\))?\s*$", texto, flags=re.M)
    blocos = {}
    for k in range(1, len(partes), 3):
        ranking, nota, corpo = partes[k], partes[k + 1], partes[k + 2]
        if nota:
            NOTAS_EDITORIAIS.append(f"{contexto} Ranking {ranking}: nota no Notion \"{nota}\"; texto transcrito como está.".strip())
        blocos[ranking] = corpo
    return blocos


def extrair(texto, slug, recurso_classe=None):
    linhas = texto.split("\n")

    # Tabela de progressão (primeiras linhas "| ... |").
    tabela = []
    for l in linhas:
        if not l.startswith("|"):
            break
        tabela.append(celulas(l))
    cab = tabela[0]
    idx_pericias = next(i for i, c in enumerate(cab) if c.lower().startswith("perícias"))
    extras = cab[2:idx_pericias]
    recursos_classe = {}
    for linha in tabela[1:]:
        r = linha[0]
        valores = {}
        for j, nome in enumerate(extras):
            bruto = linha[2 + j]
            chave = recurso_classe or slugify(nome)
            m_pa = re.fullmatch(r"(\d+) PA", bruto)
            valor = 0 if bruto in ("—", "-") else int(bruto) if bruto.isdigit() else int(m_pa.group(1)) if m_pa else bruto
            valores[chave if len(extras) == 1 else slugify(nome)] = valor
        recursos_classe[r] = valores
        assert int(linha[-1]) in (3, 4, 5), f"PA inválido no Ranking {r}"

    # Descrição e papéis.
    pos = len(tabela)
    desc = []
    while not linhas[pos].startswith("| Papel principal"):
        desc.append(linhas[pos])
        pos += 1
    papel = celulas(linhas[pos])[1]
    secundarios = [x[:1].upper() + x[1:] for x in separar_nomes(celulas(linhas[pos + 1])[1])]
    nomes_sub = separar_nomes(celulas(linhas[pos + 2])[1])

    # Criação.
    cr = secao(texto, r"^# CRIANDO UM", r"^# CARACTERÍSTICAS DE CLASSE")
    rec = {}
    for chave, rotulo in [("pv", "PV"), ("pe", "PE")]:
        m = re.search(rf"- {rotulo}:\s*(\d+)\s*\+\s*(Corpo|Mente|Ânimo)", cr)
        assert m, f"recurso {rotulo} não encontrado"
        rec[chave] = recurso(int(m.group(1)), ATRIBUTOS[m.group(2).lower()], 1, f"{m.group(1)} + {m.group(2)}")
    m = re.search(r"- Mana:\s*(\d+)\s*\+\s*\(?\s*Ânimo\s*[x×]\s*(\d)\s*\)?", cr)
    assert m, "Mana não encontrada"
    rec["mana"] = recurso(int(m.group(1)), "animo", int(m.group(2)), f"{m.group(1)} + (Ânimo × {m.group(2)})")
    assert re.search(r"Andar:\s*10\s*\+\s*Corpo", cr) and re.search(r"Correr:\s*2\s*[x×]\s*\(10\s*\+\s*Corpo\)", cr), "Deslocamento fora do padrão"
    assert re.search(r"Reações:\s*Mente\s*\+\s*1", cr), "Reações fora do padrão"
    mi = re.search(r"Integridade:\s*10\s*\+\s*\(?\s*Ânimo\s*[x×]\s*2", cr)
    assert mi, "Integridade fora do padrão"
    rec["andar"] = recurso(10, "corpo", 1, "10 + Corpo")
    rec["correr"] = recurso(20, "corpo", 2, "2 × (10 + Corpo)")
    rec["reacoes"] = recurso(1, "mente", 1, "Mente + 1")
    rec["integridade"] = recurso(10, "animo", 2, "10 + (Ânimo × 2)")

    perfis = {}
    for nome in ("Abrangente", "Padrão", "Especializado"):
        m = re.search(rf"^\| {nome} \| (\d+) \| (\d+) \| (\d+) \|", cr, flags=re.M)
        assert m, f"perfil {nome} não encontrado"
        perfis[nome] = (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    assert re.search(r"^\| Equilibrada \| 2, 1 e 1 \|", cr, flags=re.M), "perfis de Atributos fora do padrão"

    def lista(n):
        m = re.search(rf"perícias de valor {n} entre:\n(.+)", cr)
        assert m, f"lista de valor {n} não encontrada"
        return pericias_da_linha(m.group(1))

    sinergia = {}
    for nome, vid in VERTENTES.items():
        m = re.search(rf"^(?:#+ )?{nome}\n.*?\nSinergia:\s*([●○]+)", cr, flags=re.M | re.S)
        assert m, f"sinergia de {nome} não encontrada"
        sinergia[vid] = m.group(1).count("●")
    m = re.search(r"Ⱥ\s*([\d.]+)", cr)
    aretz = int(m.group(1).replace(".", ""))
    mochila = int(re.search(r"Mochila de (\d+) espaços", cr).group(1))
    pendencias = []
    if "PLACEHOLDER" in cr:
        pendencias.append("equipamento_inicial: os pacotes recomendados ainda são placeholders no Notion; nenhum item foi inferido.")

    # Características de Classe.
    usados = set()
    cc = secao(texto, r"^# CARACTERÍSTICAS DE CLASSE", r"^# SUBCLASSES DE")
    blocos = blocos_ranking(cc, "Classe")
    caracteristicas = {r: extrair_ranking(blocos[r], r, slug, usados) for r in ("F", "D", "B", "S")}

    # Subclasses.
    sc = secao(texto, r"^# SUBCLASSES DE")
    partes = re.split(r"^## (.+?)\s*$", sc, flags=re.M)
    subs = []
    for k in range(1, len(partes), 2):
        nome = titulo(partes[k])
        corpo = partes[k + 1]
        antes = corpo.split("### RANKING")[0]
        descricao = paragrafos([l for l in antes.split("\n") if l.strip()])
        b = blocos_ranking(corpo, f"Subclasse {nome},")
        sslug = slugify(nome)
        subs.append(subclasse(sslug, nome, slug,
                              descricao,
                              extrair_ranking(b["E"], "E", sslug, usados),
                              extrair_ranking(b["C"], "C", sslug, usados),
                              extrair_ranking(b["A"], "A", sslug, usados)))
    assert sorted(s["nome"] for s in subs) == sorted(titulo(n) for n in nomes_sub), \
        f"Subclasses da tabela ({nomes_sub}) diferem das seções ({[s['nome'] for s in subs]})"

    cls = classe(
        slug, titulo(re.search(r"^# CRIANDO UMA? (.+)$", texto, flags=re.M).group(1)),
        paragrafos(desc), papel, secundarios,
        criacao(perfis_pericias(perfis["Abrangente"], perfis["Padrão"], perfis["Especializado"]),
                lista(3), lista(2), rec, sinergia, aretz, mochila),
        caracteristicas, subs, recursos_classe,
    )
    return cls, subs, pendencias + NOTAS_EDITORIAIS


if __name__ == "__main__":
    pagina, slug, fonte, editada = sys.argv[1:5]
    recurso_classe = sys.argv[5] if len(sys.argv) > 5 else None
    texto = open(pagina, encoding="utf-8").read()
    cls, subs, pend = extrair(texto, slug, recurso_classe)
    salvar(f"db_classe_{slug}_v1_2.json", fonte, editada, cls, subs, pend or None)
    print(f"{cls['nome']}: " + "; ".join(f"{r}: " + ", ".join(f['nome'] for f in cls['caracteristicas'][r]) for r in ("F", "D", "B", "S")))
    for s in subs:
        print(f"  {s['nome']}: " + "; ".join(f"{r}: " + ", ".join(f['nome'] for f in s['caracteristicas'][r]) for r in ("E", "C", "A")))
