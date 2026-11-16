// Testează regulile de acces DIRECT prin API (ocolind interfața), pe serverul Supabase local.
// Rulare: node --test tests/acces.test.mjs
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { reset, anon, login, sql, staffId, ziLPTrecuta, OAMENI, PAROLA } from './setup.mjs';

const zi = ziLPTrecuta();
const T = 'Text de test suficient de lung pentru validare.';
const ids = {};

async function trimite(o) {
  return anon().rpc('trimite_feedback', {
    p_staff_id: await staffId(o.persoana), p_sala_id: o.sala, p_tip: o.tip || 'negativ',
    p_destinatie: o.dest || 'persoana', p_data: o.data || zi, p_ora_start: o.ora ?? 16,
    p_locatie: o.loc || 'cadavru', p_descriere: o.text || `${o.cheie} – ${T}`,
  });
}

async function vede(cine) {
  const c = await login(cine);
  const { data, error } = await c.from('feedback').select('descriere');
  assert.ifError(error);
  return data.map(r => r.descriere.split(' – ')[0]).sort();
}

before(async () => {
  await reset();
  const lot = [
    { cheie: 'F1', persoana: 'Munteanu Victor', sala: 'sala-1' },
    { cheie: 'F2', persoana: 'Munteanu Victor', sala: 'sala-1', dest: 'coordonator' },
    { cheie: 'F3', persoana: 'Buzgău Patrik', sala: 'sala-4', tip: 'pozitiv' },
    { cheie: 'F4', persoana: 'Buzgău Patrik', sala: 'sala-4', dest: 'coordonator' },
    { cheie: 'F5', persoana: 'Nagy David', sala: 'sala-3' },
    { cheie: 'F6', persoana: 'Barna Ioana', sala: 'stoma-lr' },
    { cheie: 'F7', persoana: 'Jovrea Andrei', sala: 'sala-1', tip: 'pozitiv', loc: 'muzeu' },
    { cheie: 'F8', persoana: 'Barna Ioana', sala: 'sala-5', loc: 'tabla' },
  ];
  for (const f of lot) {
    const { error } = await trimite(f);
    assert.ifError(error);
  }
});

// ---------- Cine vede ce ----------
test('demonstratorul își vede doar feedbackul lui, fără cel confidențial', async () => {
  assert.deepEqual(await vede('munteanu'), ['F1']);
});
test('responsabilul de sală vede feedbackul din sala lui, fără cel confidențial', async () => {
  assert.deepEqual(await vede('jovrea'), ['F1', 'F7']);
  assert.deepEqual(await vede('nagy'), ['F5']);
});
test('responsabilul Sălii 4 NU vede feedbackul despre Patrik', async () => {
  assert.deepEqual(await vede('plesa'), []);
});
test('Barna Ioana își vede feedbackul din ambele săli; Stoma-LR nu are responsabil', async () => {
  assert.deepEqual(await vede('barna'), ['F6', 'F8']);
});
test('Patrik (coordonator) vede tot, inclusiv confidențialul', async () => {
  assert.deepEqual(await vede('patrik'), ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']);
});
test('adminul nu vede feedbackul altora doar pentru că e admin (Sala 5: responsabil e Patrik)', async () => {
  assert.deepEqual(await vede('admin'), []);
});
test('feedbackul „doar coordonator” despre Patrik e salvat ca adresat lui', async () => {
  const r = await sql("select destinatie from public.feedback where descriere like 'F4 –%'");
  assert.equal(r[0].destinatie, 'persoana');
});

// ---------- Vizitatorul anonim ----------
test('vizitatorul anonim nu poate citi feedback', async () => {
  const { data, error } = await anon().from('feedback').select('*');
  assert.ok(error || data.length === 0, 'anonimul a primit rânduri');
});
test('vizitatorul anonim nu poate scrie direct în tabel (doar prin funcția validată)', async () => {
  const { error } = await anon().from('feedback').insert({
    primit_la: zi, staff_id: await staffId('Munteanu Victor'), sala_id: 'sala-1', tip: 'negativ', destinatie: 'persoana',
    data_eveniment: zi, ora_start: 16, locatie: 'cadavru', descriere: T,
  });
  assert.ok(error);
});
test('vizitatorul anonim nu vede emailurile din conturi', async () => {
  const { data, error } = await anon().from('conturi').select('*');
  assert.ok(error || data.length === 0);
});

// ---------- Scriere/ștergere de către conturi ----------
test('un demonstrator nu poate insera, modifica sau șterge feedback', async () => {
  const c = await login('jovrea');
  const ins = await c.from('feedback').insert({
    primit_la: zi, staff_id: await staffId('Munteanu Victor'), sala_id: 'sala-1', tip: 'pozitiv', destinatie: 'persoana',
    data_eveniment: zi, ora_start: 16, locatie: 'cadavru', descriere: T,
  });
  assert.ok(ins.error, 'insert permis');
  const upd = await c.from('feedback').update({ tip: 'pozitiv' }).like('descriere', 'F1 –%').select();
  assert.ok(upd.error || upd.data.length === 0, 'update permis');
  const del = await c.from('feedback').delete({ count: 'exact' }).like('descriere', 'F1 –%');
  assert.ok(del.error || del.count === 0, 'delete permis');
  assert.equal((await sql("select count(*)::int n from public.feedback where descriere like 'F1 –%'"))[0].n, 1);
});
test('coordonatorul poate șterge (moderare)', async () => {
  const c = await login('patrik');
  const del = await c.from('feedback').delete({ count: 'exact' }).like('descriere', 'F7 –%');
  assert.ifError(del.error);
  assert.equal(del.count, 1);
});

// ---------- Conturi ----------
test('un non-admin nu poate adăuga conturi și își vede doar propriul rând', async () => {
  const c = await login('patrik');
  const ins = await c.from('conturi').insert({ staff_id: await staffId('Tank Hunor'), email: 'intrus@test.local' });
  assert.ok(ins.error);
  const { data } = await c.from('conturi').select('email');
  assert.deepEqual(data.map(r => r.email), [OAMENI.patrik.email]);
  const upd = await c.from('conturi').update({ admin: true }).eq('email', OAMENI.patrik.email).select();
  assert.ok(upd.error || upd.data.length === 0, 'și-a dat singur drept de admin');
});
test('adminul vede toate conturile', async () => {
  const c = await login('admin');
  const { data } = await c.from('conturi').select('email');
  assert.equal(data.length, Object.keys(OAMENI).length);
});
test('înregistrarea cu un email care nu e în listă e refuzată', async () => {
  const { error } = await anon().auth.signUp({ email: 'necunoscut@test.local', password: PAROLA });
  assert.ok(error, 'înregistrare permisă');
});
test('după eliminarea din listă, persoana nu mai vede nimic', async () => {
  const admin = await login('admin');
  const del = await admin.from('conturi').delete().eq('email', OAMENI.munteanu.email);
  assert.ifError(del.error);
  assert.deepEqual(await vede('munteanu'), []);
  // repunem contul: se leagă automat de utilizatorul existent
  const ins = await admin.from('conturi').insert({ staff_id: await staffId('Munteanu Victor'), email: OAMENI.munteanu.email });
  assert.ifError(ins.error);
  assert.deepEqual(await vede('munteanu'), ['F1']);
});
test('ultimul admin nu își poate retrage singur dreptul de admin', async () => {
  const c = await login('admin');
  const upd = await c.from('conturi').update({ admin: false }).eq('email', OAMENI.admin.email);
  assert.ok(upd.error);
});

// ---------- Validarea trimiterii ----------
const marti = (() => { const d = new Date(ziLPTrecuta() + 'T00:00:00Z'); while (d.getUTCDay() !== 2) d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
const viitor = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 14); while (![1, 3].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
const vechi = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 200); while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
for (const [nume, o, mesaj] of [
  ['zi de marți', { data: marti }, /lunea și miercurea/],
  ['zi din viitor', { data: viitor }, /viitor/],
  ['zi mai veche de 4 luni', { data: vechi }, /4 luni/],
  ['persoană din altă sală', { sala: 'sala-3' }, /nu face parte/],
  ['text prea scurt', { text: 'scurt' }, /20 de caractere/],
  ['interval 20–21', { ora: 20 }, /între 14 și 20/],
  ['interval 13–14', { ora: 13 }, /între 14 și 20/],
  ['locație inventată', { loc: 'amfiteatru' }, /Locație/],
  ['destinatar inventat', { dest: 'decan' }, /Destinatar/],
]) {
  test(`trimiterea e refuzată: ${nume}`, async () => {
    const { error } = await trimite({ persoana: 'Munteanu Victor', sala: 'sala-1', cheie: 'X', ...o });
    assert.ok(error, 'a fost acceptată');
    assert.match(error.message, mesaj);
  });
}

// ---------- Anonimat ----------
test('tabelul de feedback nu are nicio coloană care ar putea identifica studentul', async () => {
  const cols = (await sql("select column_name from information_schema.columns where table_schema='public' and table_name='feedback' order by ordinal_position")).map(r => r.column_name);
  assert.deepEqual(cols, ['id', 'primit_la', 'staff_id', 'sala_id', 'tip', 'destinatie', 'data_eveniment', 'ora_start', 'locatie', 'descriere']);
  const tip = await sql("select data_type from information_schema.columns where table_schema='public' and table_name='feedback' and column_name='primit_la'");
  assert.equal(tip[0].data_type, 'date', 'momentul trimiterii trebuie să fie doar ziua');
});
