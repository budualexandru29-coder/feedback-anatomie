"""Compară lista din baza de date (citită prin API, ca un vizitator) cu ANTET.docx, parsat din nou.
Singurele diferențe acceptate sunt cele din data/corectii.json. Ieșire cu cod 1 dacă apar alte diferențe.

Utilizare: python3 -I scripts/verifica_nume.py /cale/ANTET.docx [SUPABASE_URL] [CHEIE_PUBLICA]
"""
import json, pathlib, sys, urllib.request
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from parse_antet import parse  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
docx = sys.argv[1]
url = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:54321'
key = sys.argv[3] if len(sys.argv) > 3 else 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH'  # cheia publică implicită a serverului local
cor = json.loads((ROOT / 'data/corectii.json').read_text())


def get(path):
    req = urllib.request.Request(f'{url}/rest/v1/{path}', headers={'apikey': key, 'Authorization': f'Bearer {key}'})
    return json.load(urllib.request.urlopen(req))


staff = {s['id']: s for s in get('staff?select=id,nume,coordonator')}
sali = {s['id']: s for s in get('sali?select=id,nume,responsabil_id')}
leg = get('staff_sali?select=staff_id,sala_id,rol')
db = {(sali[l['sala_id']]['nume'], staff[l['staff_id']]['nume'], l['rol']) for l in leg}
db_resp = {(s['nume'], staff[s['responsabil_id']]['nume'] if s['responsabil_id'] else None) for s in sali.values()}

doc = set()
doc_resp = set()
for s in parse(docx):
    nume_sala = cor['nume_sali'][s['sala']]
    doc_resp.add((nume_sala, s['responsabil']))
    for m in s['membri']:
        doc.add((nume_sala, m['nume'], m['rol']))

asteptat = set(doc)
for e in cor['elimina']:
    asteptat = {x for x in asteptat if not (x[0] == cor['nume_sali'][e['sala']] and x[1] == e['nume'])}
for a in cor['adauga']:
    asteptat.add((cor['nume_sali'][a['sala']], a['nume'], a['rol']))

lipsa, in_plus = sorted(asteptat - db), sorted(db - asteptat)
coord = [s['nume'] for s in staff.values() if s['coordonator']]
print(f'docx: {len(doc)} repartizări | corecturi: +{len(cor["adauga"])} / -{len(cor["elimina"])} | baza de date: {len(db)} repartizări, {len(staff)} persoane')
print('lipsesc din baza de date:', lipsa or 'nimic')
print('în plus în baza de date:', in_plus or 'nimic')
print('responsabili identici:', db_resp == doc_resp, '| coordonator:', coord)
ok = not lipsa and not in_plus and db_resp == doc_resp and coord == [cor['coordonator']]
print('REZULTAT:', 'OK – 0 diferențe neexplicate' if ok else 'DIFERENȚE')
sys.exit(0 if ok else 1)
