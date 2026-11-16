// Formularul anonim. Pagina nu salvează nimic în browser (fără sesiune, fără cookie, fără ciorne).
(async function () {
  const { esc, eticheteZi, interval, ORE, acumRo, zileLP } = window.FB;
  const $ = id => document.getElementById(id);
  const form = $('form');
  let lista, sb;

  try {
    sb = FB.client({ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    lista = await FB.incarcaLista(sb);
  } catch (e) {
    $('loadErr').textContent = 'Formularul nu s-a putut încărca. ' + FB.mesajEroare(e);
    $('loadErr').hidden = false;
    return;
  }

  const stare = () => ({
    sala: form.querySelector('input[name="sala"]:checked')?.value,
    staff: Number(form.querySelector('input[name="persoana"]:checked')?.value) || null,
    tip: form.querySelector('input[name="tip"]:checked')?.value,
    locatie: form.querySelector('input[name="locatie"]:checked')?.value,
  });

  // ----- Pasul 1: sălile
  $('sali').innerHTML = lista.sali.map(s => `
    <label class="opt"><input type="radio" name="sala" id="sala-${esc(s.id)}" value="${esc(s.id)}">
      <span>${esc(s.nume)}${s.grupe ? `<small>${s.grupe} ${s.grupe === 1 ? 'grupă' : 'grupe'}</small>` : ''}</span></label>`).join('');

  // ----- Pasul 2: persoanele din sală
  function arataPersoane() {
    const { sala } = stare();
    const s = lista.sali.find(x => x.id === sala);
    $('persoane').innerHTML = lista.membri(sala).map(p => {
      const tags = [];
      if (p.coordonator) tags.push('<span class="tag coord">Coordonator</span>');
      else if (s.responsabil_id === p.id) tags.push('<span class="tag">Resp. sală</span>');
      else tags.push(`<span class="tag">${p.rol === 'voluntar' ? 'Voluntar' : 'Demonstrator'}</span>`);
      return `<label class="opt"><input type="radio" name="persoana" id="p-${p.id}" value="${p.id}">
        <span><span>${esc(p.nume)}</span>${tags.join('')}</span></label>`;
    }).join('');
    $('stepPersoana').hidden = false;
  }

  // ----- Pasul 4: zilele de luni/miercuri și intervalele 14–20
  const zile = zileLP(120);
  $('data').innerHTML = '<option value="">Alege ziua</option>' +
    zile.map(z => `<option value="${z}">${esc(eticheteZi(z))}</option>`).join('');
  function arataOre() {
    const ziua = $('data').value;
    const { iso, ora } = acumRo();
    const prev = $('ora').value;
    $('ora').innerHTML = '<option value="">Alege intervalul</option>' + ORE.map(h => {
      const viitor = ziua === iso && h > ora;
      return `<option value="${h}"${viitor ? ' disabled' : ''}>${interval(h)}${viitor ? ' (nu a început)' : ''}</option>`;
    }).join('');
    if (prev && !$('ora').querySelector(`option[value="${prev}"]`)?.disabled) $('ora').value = prev;
  }
  arataOre();

  // ----- Pasul 6: cine primește, scris explicit
  function arataDestinatari() {
    const { sala, staff } = stare();
    if (!staff) return;
    const p = lista.persoane.get(staff);
    const s = lista.sali.find(x => x.id === sala);
    const coord = lista.coordonator;
    const resp = s.responsabil_id ? lista.persoane.get(s.responsabil_id) : null;
    let cine;
    if (p.coordonator) {
      cine = [`${esc(p.nume)} (coordonatorul demonstratorilor)`];
    } else {
      cine = [esc(p.nume)];
      if (resp && resp.id !== p.id && resp.id !== coord?.id) cine.push(`${esc(resp.nume)} (responsabil ${esc(s.nume)})`);
      if (coord && coord.id !== p.id) cine.push(`${esc(coord.nume)} (coordonator)`);
    }
    for (const s of lista.supervizori) cine.push(`${esc(s.nume)} (supervizor)`);
    $('recipients').innerHTML = `<span class="muted">Feedbackul va fi văzut doar de:</span><ul>${cine.map(c => `<li>${c}</li>`).join('')}</ul>`;
  }

  function actualizeaza() {
    const st = stare();
    $('stepTip').hidden = !st.staff;
    const dupaTip = !(st.staff && st.tip);
    for (const id of ['stepCand', 'stepText', 'stepDest', 'trimite']) $(id).hidden = dupaTip;
    arataDestinatari();
  }

  form.addEventListener('change', e => {
    if (e.target.name === 'sala') {
      arataPersoane();
      form.querySelectorAll('input[name="persoana"]').forEach(i => (i.checked = false));
    }
    if (e.target.id === 'data') arataOre();
    $('formErr').hidden = true;
    actualizeaza();
  });

  $('descriere').addEventListener('input', () => {
    const n = $('descriere').value.trim().length;
    $('counter').textContent = `${n} / 3000${n < 20 ? ' · minimum 20' : ''}`;
    $('counter').classList.toggle('bad', n > 0 && n < 20);
  });

  // ----- Trimitere
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const st = stare();
    const text = $('descriere').value.trim();
    const lipsa = [];
    if (!st.sala) lipsa.push('sala');
    if (!st.staff) lipsa.push('persoana');
    if (!st.tip) lipsa.push('tipul feedbackului');
    if (!$('data').value) lipsa.push('ziua');
    if (!$('ora').value) lipsa.push('intervalul orar');
    if (!st.locatie) lipsa.push('locul (tablă, cadavru sau muzeu)');
    if (text.length < 20) lipsa.push('o descriere de cel puțin 20 de caractere');
    if (lipsa.length) {
      $('formErr').textContent = 'Mai completează: ' + lipsa.join(', ') + '.';
      $('formErr').hidden = false;
      return;
    }

    const btn = $('trimite');
    btn.disabled = true; btn.textContent = 'Se trimite…';
    try {
      if (!$('website').value) { // câmp-capcană pentru roboți; oamenii nu îl văd
        const { error } = await sb.rpc('trimite_feedback', {
          p_staff_id: st.staff, p_sala_id: st.sala, p_tip: st.tip, p_destinatie: 'persoana',
          p_data: $('data').value, p_ora_start: Number($('ora').value), p_locatie: st.locatie, p_descriere: text,
        });
        if (error) throw error;
      }
      const p = lista.persoane.get(st.staff);
      $('doneTxt').textContent = `Feedbackul despre ${p.nume} a fost înregistrat, fără date despre tine.`;
      form.hidden = true; $('done').hidden = false;
      $('done').scrollIntoView({ block: 'start' });
    } catch (err) {
      $('formErr').textContent = FB.mesajEroare(err);
      $('formErr').hidden = false;
    } finally {
      btn.disabled = false; btn.textContent = 'Trimite feedbackul anonim';
    }
  });

  $('altul').addEventListener('click', () => {
    form.reset();
    $('stepPersoana').hidden = true;
    $('counter').textContent = '0 / 3000';
    arataOre(); actualizeaza();
    $('done').hidden = true; form.hidden = false;
    window.scrollTo(0, 0);
  });

  form.hidden = false;
  actualizeaza();
})();
