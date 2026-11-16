"""Construiește lista finală (ANTET.docx + corectii.json) și generează:
  - data/roster.json          (lista folosită de aplicație, pentru verificare)
  - supabase/seed.sql         (datele inițiale)
  - supabase/setup_complet.sql (schemă + date, de lipit în SQL Editor-ul Supabase)

Utilizare: python3 -I scripts/build_seed.py
"""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
raw = json.loads((ROOT / 'data/antet_raw.json').read_text())
cor = json.loads((ROOT / 'data/corectii.json').read_text())


def build():
    sali = []
    for i, s in enumerate(raw):
        membri = [dict(m) for m in s['membri']]
        for e in cor['elimina']:
            if e['sala'] == s['sala']:
                membri = [m for m in membri if m['nume'] != e['nume']]
        for a in cor['adauga']:
            if a['sala'] == s['sala'] and all(m['nume'] != a['nume'] for m in membri):
                membri.append({'nume': a['nume'], 'rol': a['rol']})
        sid = re.sub(r'[^a-z0-9]+', '-', cor['nume_sali'][s['sala']].lower()).strip('-')
        sali.append({'id': sid, 'nume': cor['nume_sali'][s['sala']], 'ordine': i + 1,
                     'grupe': s['grupe'], 'responsabil': s['responsabil'], 'membri': membri})
    return sali


def q(s):
    return "'" + s.replace("'", "''") + "'"


def seed_sql(sali):
    names = sorted({m['nume'] for s in sali for m in s['membri']})
    out = ['-- Generat de scripts/build_seed.py din ANTET.docx + data/corectii.json. Nu edita manual.',
           'insert into public.staff (nume, coordonator) values']
    out.append(',\n'.join(f"  ({q(n)}, {'true' if n == cor['coordonator'] else 'false'})" for n in names)
               + '\non conflict (nume) do update set coordonator = excluded.coordonator;')
    out.append('insert into public.sali (id, nume, ordine, grupe) values')
    out.append(',\n'.join(f"  ({q(s['id'])}, {q(s['nume'])}, {s['ordine']}, {s['grupe'] if s['grupe'] else 'null'})"
                          for s in sali) + '\non conflict (id) do update set nume = excluded.nume, ordine = excluded.ordine, grupe = excluded.grupe;')
    out.append('insert into public.staff_sali (staff_id, sala_id, rol)\nselect st.id, v.sala, v.rol from (values')
    out.append(',\n'.join(f"  ({q(s['id'])}, {q(m['nume'])}, {q(m['rol'])})" for s in sali for m in s['membri'])
               + '\n) as v(sala, nume, rol) join public.staff st on st.nume = v.nume\non conflict (staff_id, sala_id) do update set rol = excluded.rol;')
    for s in sali:
        if s['responsabil']:
            out.append(f"update public.sali set responsabil_id = (select id from public.staff where nume = {q(s['responsabil'])}) where id = {q(s['id'])};")
    return '\n'.join(out) + '\n'


if __name__ == '__main__':
    sali = build()
    (ROOT / 'data/roster.json').write_text(json.dumps(sali, ensure_ascii=False, indent=1))
    seed = seed_sql(sali)
    (ROOT / 'supabase/seed.sql').write_text(seed)
    migs = sorted((ROOT / 'supabase/migrations').glob('*.sql'))
    full = '\n\n'.join(m.read_text() for m in migs) + '\n\n' + seed
    (ROOT / 'supabase/setup_complet.sql').write_text(full)
    print(f"{sum(len(s['membri']) for s in sali)} repartizări, "
          f"{len({m['nume'] for s in sali for m in s['membri']})} persoane, {len(sali)} săli")
