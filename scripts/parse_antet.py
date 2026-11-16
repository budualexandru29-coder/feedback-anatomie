"""Extrage repartizarea din ANTET.docx -> JSON (sală, rol, nume), direct din tabelele Word.

Utilizare: python3 -I scripts/parse_antet.py /cale/ANTET.docx > data/antet_raw.json
"""
import json, re, sys, zipfile

def paras(xml):
    out = []
    for p in re.findall(r'<w:p[ >].*?</w:p>', xml, re.S):
        t = ''.join(re.findall(r'<w:t[^>]*>([^<]*)</w:t>', p)).strip()
        if t:
            out.append(re.sub(r'\s+', ' ', t))
    return out

def parse(path):
    x = zipfile.ZipFile(path).read('word/document.xml').decode('utf-8')
    body_text = paras(x)
    responsabili = {}
    sala_curenta = None
    for t in body_text:
        if re.match(r'^(SALA \d+|STOMA)', t):
            sala_curenta = t
        m = re.match(r'^Responsabil sală\s*[–-]\s*(.+)$', t)
        if m:
            responsabili[sala_curenta] = m.group(1).strip()
    sali = []
    for tbl in re.findall(r'<w:tbl>.*?</w:tbl>', x, re.S):
        rows = [[paras(c) for c in re.findall(r'<w:tc>.*?</w:tc>', r, re.S)]
                for r in re.findall(r'<w:tr[ >].*?</w:tr>', tbl, re.S)]
        head = rows[0]
        nume_sala = head[0][0]
        grupe = None
        membri = []
        for r in rows[1:]:
            if r[0] and re.match(r'^\d+\s*GR$', r[0][0]):
                grupe = int(r[0][0].split()[0])
            for col, rol in ((1, 'demonstrator'), (2, 'voluntar')):
                for nume in r[col] if len(r) > col else []:
                    membri.append({'nume': nume, 'rol': rol})
        sali.append({'sala': nume_sala, 'grupe': grupe,
                     'responsabil': responsabili.get(nume_sala), 'membri': membri})
    return sali

if __name__ == '__main__':
    print(json.dumps(parse(sys.argv[1]), ensure_ascii=False, indent=1))
