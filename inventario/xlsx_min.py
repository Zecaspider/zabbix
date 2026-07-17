"""Leitor minimo de .xlsx usando so a stdlib (zipfile + ElementTree).
Suficiente para ler os snapshots de inventario sem depender de openpyxl."""
import re
import zipfile
import xml.etree.ElementTree as ET

M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def read_xlsx(path):
    """Devolve {nome_da_sheet: [ {letra_coluna: valor} ]}."""
    z = zipfile.ZipFile(path)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        for si in root.findall(f"{M}si"):
            shared.append("".join(t.text or "" for t in si.iter(f"{M}t")))
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    relmap = {r.get("Id"): r.get("Target") for r in rels}
    sheets = {}
    for sh in wb.find(f"{M}sheets"):
        target = relmap.get(sh.get(f"{R}id"), "")
        if not target.startswith("xl/"):
            target = "xl/" + target
        sheets[sh.get("name")] = target
    out = {}
    for name, target in sheets.items():
        try:
            root = ET.fromstring(z.read(target))
        except KeyError:
            continue
        rows = []
        for row in root.iter(f"{M}row"):
            vals = {}
            for c in row:
                ref = c.get("r") or ""
                mcol = re.match(r"([A-Z]+)", ref)
                col = mcol.group(1) if mcol else "?"
                t = c.get("t")
                v = c.find(f"{M}v")
                if t == "s" and v is not None:
                    val = shared[int(v.text)]
                elif v is not None:
                    val = v.text
                else:
                    is_ = c.find(f"{M}is")
                    val = "".join(x.text or "" for x in is_.iter(f"{M}t")) if is_ is not None else None
                vals[col] = val
            rows.append(vals)
        out[name] = rows
    return out


def sheet_as_dicts(rows, header_idx):
    """Converte linhas {col: val} em dicts pelo cabecalho na linha header_idx."""
    hdr = rows[header_idx]
    cols = sorted(hdr.keys(), key=lambda c: (len(c), c))
    names = {c: hdr[c] for c in cols if hdr.get(c)}
    out = []
    for r in rows[header_idx + 1:]:
        d = {names[c]: r.get(c) for c in names}
        if any(v not in (None, "") for v in d.values()):
            out.append(d)
    return out
