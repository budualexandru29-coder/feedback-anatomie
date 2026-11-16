// Teste în browser (Chromium), pe telefon și desktop, cu serverul Supabase local.
// Rulare: npx playwright test
import { test, expect } from '@playwright/test';
import { reset, URL, ANON, PAROLA, OAMENI, sql } from './setup.mjs';

const CONFIG = `window.FEEDBACK_CONFIG = { supabaseUrl: '${URL}', supabaseKey: '${ANON}' };`;
const TELEFON = { width: 390, height: 844 };
const SHOTS = process.env.SHOTS_DIR;

test.beforeAll(async () => { await reset(); });

test.beforeEach(async ({ page }) => {
  await page.route('**/assets/config.js', r => r.fulfill({ contentType: 'text/javascript', body: CONFIG }));
});

async function intra(page, cine) {
  await page.goto('/cont.html');
  await page.fill('#loginEmail', OAMENI[cine].email);
  await page.fill('#loginPass', PAROLA);
  await page.click('#fLogin button[type=submit]');
  await expect(page.locator('#app')).toBeVisible();
}

test('studentul trimite un feedback negativ de pe telefon, anonim', async ({ page, context }) => {
  await page.setViewportSize(TELEFON);
  const gazde = new Set();
  page.on('request', r => gazde.add(new globalThis.URL(r.url()).host));

  await page.goto('/index.html');
  await page.getByRole('radio', { name: /Sala 1/ }).check();
  await page.getByRole('radio', { name: /Munteanu Victor/ }).check();
  await page.getByRole('radio', { name: 'Negativ' }).check();
  await page.selectOption('#data', { index: 2 });
  await page.selectOption('#ora', '16');
  await page.getByRole('radio', { name: 'La cadavru' }).check();
  await page.fill('#descriere', 'UI-TEST La cadavru nu ne-a lăsat să punem întrebări despre fosa axilară.');
  await expect(page.locator('#recipients')).toContainText('Munteanu Victor');
  await expect(page.locator('#recipients')).toContainText('Jovrea Andrei (responsabil Sala 1)');
  await expect(page.locator('#recipients')).toContainText('Buzgău Patrik (coordonator)');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/formular-telefon.png`, fullPage: true });
  await page.click('#trimite');
  await expect(page.locator('#done')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/trimis-telefon.png`, fullPage: true });

  // Nimic salvat în browser, nimic încărcat de pe alte servere.
  expect(await context.cookies()).toEqual([]);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  expect([...gazde].sort()).toEqual(['127.0.0.1:4173', '127.0.0.1:54321']);

  const r = await sql("select * from public.feedback where descriere like 'UI-TEST%'");
  expect(r).toHaveLength(1);
  console.log('Rândul salvat în baza de date:', JSON.stringify(r[0]));
});

test('formularul nu se trimite incomplet și spune ce lipsește', async ({ page }) => {
  await page.goto('/index.html');
  await page.getByRole('radio', { name: /Sala 4/ }).check();
  await page.getByRole('radio', { name: /Buzgău Patrik/ }).check();
  await page.getByRole('radio', { name: 'Pozitiv' }).check();
  await expect(page.locator('#destOpts')).toBeHidden(); // despre Patrik: ajunge doar la el
  await expect(page.locator('#recipients')).toContainText('Buzgău Patrik (coordonatorul demonstratorilor)');
  await page.click('#trimite');
  await expect(page.locator('#formErr')).toContainText('ziua');
  await expect(page.locator('#formErr')).toContainText('locul');
});

test('Munteanu își vede feedbackul; Pleșa nu vede nimic despre Patrik', async ({ page }) => {
  await intra(page, 'munteanu');
  await expect(page.locator('.fb')).toHaveCount(1);
  await expect(page.locator('.fb').first()).toContainText('fosa axilară');
  await expect(page.locator('#tabConturi')).toBeHidden();
  await expect(page.locator('[data-sterge]')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/demonstrator-telefon.png`, fullPage: true });
  await page.click('#btnIesire');
  await expect(page.locator('#authPanel')).toBeVisible();

  await intra(page, 'plesa');
  await expect(page.locator('.empty')).toContainText('Nu ai primit încă');
});

test('Patrik vede tot și poate șterge; adminul gestionează conturile', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await intra(page, 'patrik');
  await expect(page.locator('#roluri')).toContainText('Coordonator');
  await expect(page.locator('.fb')).toHaveCount(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/coordonator-desktop.png`, fullPage: true });
  await page.click('#btnIesire');
  await expect(page.locator('#authPanel')).toBeVisible();

  await intra(page, 'admin');
  await page.click('#tabConturi');
  const rand = page.locator('tr', { hasText: 'Tank Hunor' });
  await rand.locator('input[type=email]').fill('tank@test.local');
  await rand.getByRole('button', { name: 'Salvează' }).click();
  await expect(page.locator('#contMsg')).toContainText('Salvat: Tank Hunor');
  await expect(page.locator('tr', { hasText: 'Tank Hunor' })).toContainText('Așteaptă activarea');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/admin-desktop.png`, fullPage: false });
});

test('activarea contului: email din listă merge, email străin e refuzat', async ({ page }) => {
  await page.goto('/cont.html');
  await page.click('#tabActivare');
  await page.fill('#actEmail', 'strain@test.local');
  await page.fill('#actPass', 'o-parola-lunga-1');
  await page.click('#fActivare button[type=submit]');
  await expect(page.locator('#authMsg')).toContainText('nu este în lista catedrei');

  await page.fill('#actEmail', 'tank@test.local');
  await page.click('#fActivare button[type=submit]');
  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#numeEu')).toHaveText('Tank Hunor');
});

test('capturi în modul întunecat', async ({ page }) => {
  test.skip(!SHOTS);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setViewportSize(TELEFON);
  await page.goto('/index.html');
  await page.getByRole('radio', { name: /Sala 5/ }).check();
  await page.getByRole('radio', { name: /Barna Ioana/ }).check();
  await page.getByRole('radio', { name: 'Pozitiv' }).check();
  await page.screenshot({ path: `${SHOTS}/formular-dark.png`, fullPage: true });
});
