// Funcții comune pentru ambele pagini.
(function () {
  const TZ = 'Europe/Bucharest';
  const LOCATII = { tabla: 'Tablă', cadavru: 'Cadavru', muzeu: 'Muzeu' };
  const ZILE_LP = [1, 3]; // luni, miercuri
  const ORE = [14, 15, 16, 17, 18, 19]; // intervale de 1 oră, 14–20

  const collator = new Intl.Collator('ro', { sensitivity: 'base' });

  // „Azi” și ora curentă în România, indiferent de fusul orar al telefonului.
  function acumRo() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date()).map(x => [x.type, x.value]));
    return { iso: `${p.year}-${p.month}-${p.day}`, ora: Number(p.hour) };
  }

  function isoToDate(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  function dateToIso(dt) { return dt.toISOString().slice(0, 10); }

  // Zilele de LP (luni/miercuri) din ultimele `zile` zile, cele mai recente primele.
  function zileLP(zile = 120) {
    const azi = isoToDate(acumRo().iso);
    const out = [];
    for (let i = 0; i <= zile; i++) {
      const d = new Date(azi); d.setUTCDate(d.getUTCDate() - i);
      const dow = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
      if (ZILE_LP.includes(dow)) out.push(dateToIso(d));
    }
    return out;
  }

  const fmtZi = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const fmtZiAn = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fmtScurt = new Intl.DateTimeFormat('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function eticheteZi(iso, cuAn) {
    const azi = acumRo().iso;
    const txt = cap((cuAn ? fmtZiAn : fmtZi).format(isoToDate(iso)));
    return iso === azi ? `${txt} (azi)` : txt;
  }
  const interval = h => `${h}:00–${h + 1}:00`;
  const dataScurta = iso => fmtScurt.format(isoToDate(iso));

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function client(opts) {
    const cfg = window.FEEDBACK_CONFIG || {};
    if (!cfg.supabaseUrl || cfg.supabaseUrl.includes('COMPLETEAZA')) {
      throw new Error('Site-ul nu este încă legat de baza de date (lipsește configurarea din assets/config.js).');
    }
    return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, opts);
  }

  // Lista de săli și persoane, așa cum e în baza de date.
  async function incarcaLista(sb) {
    const [sali, staff, legaturi] = await Promise.all([
      sb.from('sali').select('id, nume, ordine, grupe, responsabil_id').order('ordine'),
      sb.from('staff').select('id, nume, coordonator'),
      sb.from('staff_sali').select('staff_id, sala_id, rol'),
    ]);
    for (const r of [sali, staff, legaturi]) if (r.error) throw r.error;
    const persoane = new Map(staff.data.map(p => [p.id, p]));
    return {
      sali: sali.data,
      persoane,
      coordonator: staff.data.find(p => p.coordonator) || null,
      membri(salaId) {
        return legaturi.data.filter(l => l.sala_id === salaId)
          .map(l => ({ ...persoane.get(l.staff_id), rol: l.rol }))
          .sort((a, b) => collator.compare(a.nume, b.nume));
      },
      saliPersoana(staffId) {
        return legaturi.data.filter(l => l.staff_id === staffId).map(l => sali.data.find(s => s.id === l.sala_id));
      },
    };
  }

  // Mesaj de eroare pe înțeles. Erorile de validare din baza de date sunt deja în română.
  function mesajEroare(err) {
    if (!err) return 'A apărut o eroare necunoscută.';
    if (err.code === '22023' || err.code === '54000' || err.code === '42501') return err.message;
    if (/fetch|network|Failed to fetch/i.test(err.message || '')) return 'Nu ne-am putut conecta la server. Verifică conexiunea la internet și încearcă din nou.';
    return err.message || String(err);
  }

  window.FB = { TZ, LOCATII, ORE, collator, acumRo, zileLP, eticheteZi, interval, dataScurta, esc, client, incarcaLista, mesajEroare };
})();
