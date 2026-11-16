// Pregătire comună pentru teste, pe serverul Supabase LOCAL (npx supabase start).
// Șterge feedbackul/conturile de test și creează conturi cu parole cunoscute.
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

import { execSync } from 'node:child_process';

// Cheile serverului local se citesc din `supabase status`, nu se țin în cod.
const local = process.env.SB_SERVICE ? {} : JSON.parse(execSync('npx supabase status -o json', {
  env: { DOCKER_HOST: 'unix:///run/user/1000/podman/podman.sock', ...process.env },
  stdio: ['ignore', 'pipe', 'ignore'],
}).toString());
export const URL = process.env.SB_URL || local.API_URL;
export const ANON = process.env.SB_ANON || local.PUBLISHABLE_KEY;
export const SERVICE = process.env.SB_SERVICE || local.SECRET_KEY;
export const DB = process.env.SB_DB || local.DB_URL;
export const PAROLA = 'parola-de-test-123';

// Conturile de test: cine e cine în regulile de acces.
export const OAMENI = {
  admin:    { nume: 'Budu Alexandru',  email: 'admin@test.local' },     // admin, voluntar Sala 5
  munteanu: { nume: 'Munteanu Victor', email: 'munteanu@test.local' },  // demonstrator Sala 1
  jovrea:   { nume: 'Jovrea Andrei',   email: 'jovrea@test.local' },    // responsabil Sala 1
  plesa:    { nume: 'Pleșa Vlad',      email: 'plesa@test.local' },     // responsabil Sala 4 (unde e și Patrik)
  patrik:   { nume: 'Buzgău Patrik',   email: 'patrik@test.local' },    // coordonator
  nagy:     { nume: 'Nagy David',      email: 'nagy@test.local' },      // responsabil Sala 3
  barna:    { nume: 'Barna Ioana',     email: 'barna@test.local' },     // Sala 5 + Stoma-LR
};

export const anon = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
export const service = () => createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

export async function sql(text, params) {
  const c = new pg.Client({ connectionString: DB });
  await c.connect();
  try { return (await c.query(text, params)).rows; } finally { await c.end(); }
}

export async function login(cine) {
  const c = anon();
  const { error } = await c.auth.signInWithPassword({ email: OAMENI[cine].email, password: PAROLA });
  if (error) throw new Error(`login ${cine}: ${error.message}`);
  return c;
}

// Ultima zi de luni sau miercuri strict înainte de azi (în România) – mereu validă pentru orice interval orar.
export function ziLPTrecuta(offsetSaptamani = 0) {
  const azi = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
  const d = new Date(azi + 'T00:00:00Z');
  for (let i = 1; i < 10; i++) {
    const x = new Date(d); x.setUTCDate(d.getUTCDate() - i - 7 * offsetSaptamani);
    if ([1, 3].includes(x.getUTCDay())) return x.toISOString().slice(0, 10);
  }
}

export async function staffId(nume) {
  const r = await sql('select id from public.staff where nume = $1', [nume]);
  if (!r.length) throw new Error('Nu există: ' + nume);
  return r[0].id;
}

export async function reset() {
  await sql('delete from public.feedback; delete from public.limitare;');
  await sql('alter table public.conturi disable trigger pastreaza_un_admin; delete from public.conturi; alter table public.conturi enable trigger pastreaza_un_admin;');
  const sv = service();
  const { data } = await sv.auth.admin.listUsers({ perPage: 1000 });
  for (const u of data.users) await sv.auth.admin.deleteUser(u.id);

  // Adminul inițial se pune direct în baza de date (pasul de pornire din README).
  await sql('insert into public.conturi (staff_id, email, admin) values ($1, $2, true)', [await staffId(OAMENI.admin.nume), OAMENI.admin.email]);
  const a = anon();
  let r = await a.auth.signUp({ email: OAMENI.admin.email, password: PAROLA });
  if (r.error) throw new Error('signup admin: ' + r.error.message);

  // Restul conturilor le adaugă adminul, din aplicație (prin API, cu regulile reale).
  const admin = await login('admin');
  for (const [k, o] of Object.entries(OAMENI)) {
    if (k === 'admin') continue;
    const ins = await admin.from('conturi').insert({ staff_id: await staffId(o.nume), email: o.email });
    if (ins.error) throw new Error(`admin adaugă ${k}: ${ins.error.message}`);
    r = await anon().auth.signUp({ email: o.email, password: PAROLA });
    if (r.error) throw new Error(`signup ${k}: ${r.error.message}`);
  }
}
