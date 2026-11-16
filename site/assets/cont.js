// Pagina catedrei: autentificare, feedbackul vizibil pentru utilizator, administrarea conturilor.
// Ce vede fiecare decide baza de date (Row Level Security); interfața doar afișează ce primește.
(async function () {
  const { esc, eticheteZi, interval, dataScurta, LOCATII, collator } = window.FB;
  const $ = id => document.getElementById(id);
  let sb, lista, profil, utilizator = null, feedback = [];

  try {
    sb = FB.client();
    lista = await FB.incarcaLista(sb);
  } catch (e) {
    $('cfgErr').textContent = FB.mesajEroare(e);
    $('cfgErr').hidden = false;
    return;
  }

  // ---------- Autentificare ----------
  const formulare = { tabLogin: 'fLogin', tabActivare: 'fActivare', tabReset: 'fReset' };
  function aratăTab(tab) {
    for (const [t, f] of Object.entries(formulare)) {
      $(t).setAttribute('aria-selected', String(t === tab));
      $(f).hidden = t !== tab;
    }
    $('fParolaNoua').hidden = true;
    mesaj('authMsg');
  }
  for (const t of Object.keys(formulare)) $(t).addEventListener('click', () => aratăTab(t));

  function mesaj(id, text, tip) {
    const el = $(id);
    el.hidden = !text; el.textContent = text || '';
    el.className = tip === 'ok' ? 'ok' : 'error';
  }

  function eroareAuth(error) {
    const m = error?.message || '';
    if (/Invalid login credentials/i.test(m)) return 'Email sau parolă greșită.';
    if (/Email not confirmed/i.test(m)) return 'Contul nu e confirmat încă. Deschide linkul din emailul de confirmare.';
    if (/Database error|not in the list|lista catedrei/i.test(m)) return 'Acest email nu este în lista catedrei. Roagă adminul să te adauge, apoi încearcă din nou.';
    if (/already registered/i.test(m)) return 'Există deja un cont cu acest email. Intră în cont sau folosește „Am uitat parola”.';
    if (/rate limit/i.test(m)) return 'Au fost trimise prea multe emailuri. Încearcă din nou peste o oră.';
    if (/Password should/i.test(m)) return 'Parola e prea slabă. Folosește cel puțin 10 caractere.';
    return FB.mesajEroare(error);
  }
  const adresaPagina = () => location.origin + location.pathname;

  $('fLogin').addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await sb.auth.signInWithPassword({ email: $('loginEmail').value.trim(), password: $('loginPass').value });
    if (error) mesaj('authMsg', eroareAuth(error));
  });

  $('fActivare').addEventListener('submit', async e => {
    e.preventDefault();
    if ($('actPass').value.length < 10) return mesaj('authMsg', 'Parola trebuie să aibă cel puțin 10 caractere.');
    const { data, error } = await sb.auth.signUp({
      email: $('actEmail').value.trim().toLowerCase(), password: $('actPass').value,
      options: { emailRedirectTo: adresaPagina() },
    });
    if (error) return mesaj('authMsg', eroareAuth(error));
    if (!data.session) mesaj('authMsg', 'Ți-am trimis un email de confirmare. Deschide linkul din el, apoi intră în cont.', 'ok');
  });

  $('fReset').addEventListener('submit', async e => {
    e.preventDefault();
    const { error } = await sb.auth.resetPasswordForEmail($('resetEmail').value.trim(), { redirectTo: adresaPagina() });
    if (error) return mesaj('authMsg', eroareAuth(error));
    mesaj('authMsg', 'Dacă emailul are cont, vei primi un link pentru parola nouă.', 'ok');
  });

  $('fParolaNoua').addEventListener('submit', async e => {
    e.preventDefault();
    if ($('newPass').value.length < 10) return mesaj('authMsg', 'Parola trebuie să aibă cel puțin 10 caractere.');
    const { error } = await sb.auth.updateUser({ password: $('newPass').value });
    if (error) return mesaj('authMsg', eroareAuth(error));
    mesaj('authMsg', 'Parola a fost schimbată.', 'ok');
    await intra();
  });

  // Schimbarea parolei din cont
  $('btnParola').addEventListener('click', () => { $('fSchimbaParola').hidden = false; $('chPass').focus(); });
  $('chCancel').addEventListener('click', () => { $('fSchimbaParola').hidden = true; mesaj('chMsg'); });
  $('fSchimbaParola').addEventListener('submit', async e => {
    e.preventDefault();
    if ($('chPass').value.length < 10) return mesaj('chMsg', 'Parola trebuie să aibă cel puțin 10 caractere.');
    const { error } = await sb.auth.updateUser({ password: $('chPass').value });
    if (error) return mesaj('chMsg', eroareAuth(error));
    $('chPass').value = '';
    mesaj('chMsg', 'Parola a fost schimbată.', 'ok');
  });

  $('btnIesire').addEventListener('click', async () => { await sb.auth.signOut(); iesit(); });

  let recuperare = false;
  sb.auth.onAuthStateChange((ev) => {
    if (ev === 'PASSWORD_RECOVERY') {
      recuperare = true;
      $('authWrap').hidden = false; $('app').hidden = true; $('authPanel').hidden = false;
      for (const f of Object.values(formulare)) $(f).hidden = true;
      $('fParolaNoua').hidden = false;
    } else if (ev === 'SIGNED_IN' && !recuperare) {
      setTimeout(intra, 0);
    } else if (ev === 'SIGNED_OUT') {
      iesit();
    }
  });

  function iesit() {
    profil = null; feedback = []; utilizator = null;
    $('app').hidden = true; $('authWrap').hidden = false; $('authPanel').hidden = false;
    $('lista').innerHTML = ''; $('fSchimbaParola').hidden = true;
    for (const id of ['loginPass', 'actPass', 'newPass', 'chPass']) $(id).value = '';
    aratăTab('tabLogin');
  }

  // ---------- Aplicația ----------
  async function intra() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { $('authPanel').hidden = false; return; }
    if (utilizator === session.user.id && !$('app').hidden) return; // deja afișat (ex. revenire în tab)
    utilizator = session.user.id;
    const r = await sb.rpc('profilul_meu');
    if (r.error) { $('authPanel').hidden = false; return mesaj('authMsg', FB.mesajEroare(r.error)); }
    profil = r.data;
    if (!profil) {
      $('authPanel').hidden = false;
      await sb.auth.signOut();
      return mesaj('authMsg', 'Contul nu mai este asociat cu nicio persoană din catedră. Contactează adminul.');
    }
    $('authWrap').hidden = true; $('app').hidden = false;
    $('numeEu').textContent = profil.nume;
    const roluri = [];
    if (profil.coordonator) roluri.push('<span class="pill">Coordonator · vezi tot feedbackul</span>');
    if (profil.supervizor) roluri.push('<span class="pill">Supervizor · vezi tot feedbackul</span>');
    for (const s of profil.responsabil_sali) roluri.push(`<span class="pill">Responsabil ${esc(lista.sali.find(x => x.id === s)?.nume)}</span>`);
    if (profil.admin) roluri.push('<span class="pill">Admin</span>');
    $('roluri').innerHTML = roluri.join('');
    $('tabConturi').hidden = !profil.admin;
    $('scope').textContent = profil.supervizor
      ? 'Vezi tot feedbackul trimis, din toate sălile.'
      : profil.coordonator
      ? 'Vezi tot feedbackul trimis, din toate sălile.'
      : profil.responsabil_sali.length
        ? 'Vezi feedbackul despre tine și feedbackul despre persoanele din sala de care răspunzi.'
        : 'Vezi feedbackul trimis despre tine.';
    await incarcaFeedback();
  }

  async function incarcaFeedback() {
    const { data, error } = await sb.from('feedback')
      .select('id, primit_la, staff_id, sala_id, tip, destinatie, data_eveniment, ora_start, locatie, descriere')
      .order('data_eveniment', { ascending: false }).order('ora_start', { ascending: false });
    if (error) { $('listErr').textContent = FB.mesajEroare(error); $('listErr').hidden = false; return; }
    feedback = data;
    pregătesteFiltre();
    afiseaza();
  }

  function pregătesteFiltre() {
    const persoane = [...new Set(feedback.map(f => f.staff_id))]
      .map(id => lista.persoane.get(id)).sort((a, b) => collator.compare(a.nume, b.nume));
    const sali = [...new Set(feedback.map(f => f.sala_id))].map(id => lista.sali.find(s => s.id === id))
      .sort((a, b) => a.ordine - b.ordine);
    const p = $('fPersoana').value, s = $('fSala').value;
    $('fPersoana').innerHTML = '<option value="">Toți</option>' + persoane.map(x => `<option value="${x.id}">${esc(x.nume)}</option>`).join('');
    $('fSala').innerHTML = '<option value="">Toate</option>' + sali.map(x => `<option value="${esc(x.id)}">${esc(x.nume)}</option>`).join('');
    $('fPersoana').value = p; $('fSala').value = s;
    $('fPersoanaWrap').hidden = persoane.length < 2;
    $('fSalaWrap').hidden = sali.length < 2;
  }

  function afiseaza() {
    const tip = $('fTip').value, pers = $('fPersoana').value, sala = $('fSala').value, loc = $('fLoc').value;
    const vizibile = feedback.filter(f => (!tip || f.tip === tip) && (!pers || f.staff_id === Number(pers))
      && (!sala || f.sala_id === sala) && (!loc || f.locatie === loc));
    $('nTotal').textContent = vizibile.length;
    $('nPoz').textContent = vizibile.filter(f => f.tip === 'pozitiv').length;
    $('nNeg').textContent = vizibile.filter(f => f.tip === 'negativ').length;

    if (!feedback.length) {
      $('lista').innerHTML = '<div class="empty">Nu ai primit încă niciun feedback. Când un student trimite feedback adresat ție, apare aici.</div>';
      return;
    }
    if (!vizibile.length) {
      $('lista').innerHTML = '<div class="empty">Niciun feedback nu se potrivește cu filtrele alese.</div>';
      return;
    }
    $('lista').innerHTML = vizibile.map(f => {
      const p = lista.persoane.get(f.staff_id);
      const s = lista.sali.find(x => x.id === f.sala_id);
      const conf = f.destinatie === 'coordonator';
      return `<article class="fb ${f.tip}" data-id="${f.id}">
        <div class="fb-h">
          <span class="pill ${f.tip}">${f.tip === 'pozitiv' ? 'Pozitiv' : 'Negativ'}</span>
          <strong>${esc(p?.nume)}</strong><span class="muted">· ${esc(s?.nume)}</span>
          ${conf ? '<span class="pill conf">Confidențial · doar coordonator</span>' : ''}
        </div>
        <div class="fb-meta">${esc(eticheteZi(f.data_eveniment, true))} · ${interval(f.ora_start)} · ${LOCATII[f.locatie]}</div>
        <p class="fb-text">${esc(f.descriere)}</p>
        <div class="fb-f"><span>Primit pe ${dataScurta(f.primit_la)}</span>
          ${profil.coordonator ? `<span class="chips"><button type="button" class="btn ghost sm" data-sterge="${f.id}">Șterge</button></span>` : ''}
        </div>
      </article>`;
    }).join('');
  }
  for (const id of ['fTip', 'fPersoana', 'fSala', 'fLoc']) $(id).addEventListener('change', afiseaza);

  // Ștergere (doar coordonatorul), cu confirmare în pagină
  $('lista').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sterge) {
      b.parentElement.innerHTML = `<span>Ștergi definitiv?</span>
        <button type="button" class="btn danger sm" data-confirma="${b.dataset.sterge}">Da, șterge</button>
        <button type="button" class="btn ghost sm" data-anuleaza="1">Nu</button>`;
    } else if (b.dataset.anuleaza) {
      afiseaza();
    } else if (b.dataset.confirma) {
      const { error, count } = await sb.from('feedback').delete({ count: 'exact' }).eq('id', b.dataset.confirma);
      if (error || !count) { $('listErr').textContent = error ? FB.mesajEroare(error) : 'Feedbackul nu a putut fi șters.'; $('listErr').hidden = false; return; }
      feedback = feedback.filter(f => f.id !== b.dataset.confirma);
      afiseaza();
    }
  });

  // ---------- Conturi (admin) ----------
  const taburiApp = { tabFeedback: 'vFeedback', tabConturi: 'vConturi' };
  for (const [t, v] of Object.entries(taburiApp)) $(t).addEventListener('click', () => {
    for (const [t2, v2] of Object.entries(taburiApp)) { $(t2).setAttribute('aria-selected', String(t2 === t)); $(v2).hidden = t2 !== t; }
    if (t === 'tabConturi') incarcaConturi();
  });

  let conturi = new Map();
  async function incarcaConturi() {
    const { data, error } = await sb.from('conturi').select('staff_id, email, user_id, admin');
    if (error) return mesaj('contMsg', FB.mesajEroare(error));
    conturi = new Map(data.map(c => [c.staff_id, c]));
    randeazaConturi();
  }

  function randeazaConturi() {
    const q = $('cauta').value.trim();
    const toti = [...lista.persoane.values()].sort((a, b) => collator.compare(a.nume, b.nume))
      .filter(p => !q || collator.compare(p.nume.slice(0, q.length), q) === 0 || p.nume.toLowerCase().includes(q.toLowerCase()));
    $('tConturi').innerHTML = toti.map(p => {
      const c = conturi.get(p.id);
      const stare = !c ? '<span class="status fara">Fără cont</span>'
        : c.user_id ? '<span class="status activ">Activ</span>' : '<span class="status asteapta">Așteaptă activarea</span>';
      const sali = p.supervizor ? 'Supervizor' : lista.saliPersoana(p.id).map(s => esc(s.nume)).join(', ');
      return `<tr data-staff="${p.id}">
        <td><strong>${esc(p.nume)}</strong>${p.coordonator ? ' <span class="tag coord">Coord.</span>' : ''}</td>
        <td class="muted">${sali}</td>
        <td><input type="email" aria-label="Email ${esc(p.nume)}" value="${esc(c?.email || '')}" placeholder="email@exemplu.ro"></td>
        <td>${stare}</td>
        <td><input type="checkbox" aria-label="Admin ${esc(p.nume)}" ${c?.admin ? 'checked' : ''}></td>
        <td><span class="chips" style="flex-wrap:nowrap">
          <button type="button" class="btn sm" data-salveaza="1">Salvează</button>
          ${c ? '<button type="button" class="btn ghost sm" data-elimina="1">Elimină</button>' : ''}
        </span></td></tr>`;
    }).join('');
  }
  $('cauta').addEventListener('input', randeazaConturi);

  // Adăugarea unei persoane noi (sau a unei persoane existente într-o sală nouă)
  function pregatesteAdaugare() {
    $('addSala').innerHTML = lista.sali.map(s => `<option value="${esc(s.id)}">${esc(s.nume)}</option>`).join('');
    $('addSalaWrap').hidden = $('addRol').value === 'supervizor';
  }
  $('addRol').addEventListener('change', pregatesteAdaugare);
  pregatesteAdaugare();

  $('fAdauga').addEventListener('submit', async e => {
    e.preventDefault();
    const nume = $('addNume').value.trim().replace(/\s+/g, ' ');
    const rol = $('addRol').value;
    const email = $('addEmail').value.trim().toLowerCase();
    if (nume.length < 3) return mesaj('addMsg', 'Scrie numele complet.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return mesaj('addMsg', 'Emailul nu pare valid.');
    const { error } = await sb.rpc('adauga_persoana', {
      p_nume: nume, p_rol: rol, p_sala_id: rol === 'supervizor' ? null : $('addSala').value, p_email: email || null,
    });
    if (error) return mesaj('addMsg', FB.mesajEroare(error));
    lista = await FB.incarcaLista(sb);
    const unde = rol === 'supervizor' ? 'ca supervizor' : `în ${lista.sali.find(s => s.id === $('addSala').value).nume}, ca ${rol}`;
    mesaj('addMsg', `Adăugat: ${nume}, ${unde}.${email ? ' Contul așteaptă activarea.' : ''}`, 'ok');
    $('addNume').value = ''; $('addEmail').value = '';
    await incarcaConturi();
  });

  $('tConturi').addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    const tr = b.closest('tr'); const staffId = Number(tr.dataset.staff);
    const nume = lista.persoane.get(staffId).nume;
    if (b.dataset.salveaza) {
      const email = tr.querySelector('input[type="email"]').value.trim().toLowerCase();
      const admin = tr.querySelector('input[type="checkbox"]').checked;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return mesaj('contMsg', `Emailul pentru ${nume} nu pare valid.`);
      const { error } = await sb.from('conturi').upsert({ staff_id: staffId, email, admin }, { onConflict: 'staff_id' });
      if (error) return mesaj('contMsg', /duplicate|unique/i.test(error.message) ? 'Acest email este deja folosit de altă persoană.' : FB.mesajEroare(error));
      mesaj('contMsg', `Salvat: ${nume}.`, 'ok');
      await incarcaConturi();
    } else if (b.dataset.elimina) {
      b.parentElement.innerHTML = `<button type="button" class="btn danger sm" data-confirm-elim="1">Confirmă</button>
        <button type="button" class="btn ghost sm" data-renunta="1">Nu</button>`;
    } else if (b.dataset.renunta) {
      randeazaConturi();
    } else if (b.dataset.confirmElim) {
      const { error } = await sb.from('conturi').delete().eq('staff_id', staffId);
      if (error) return mesaj('contMsg', FB.mesajEroare(error));
      mesaj('contMsg', `${nume} nu mai are acces la feedback.`, 'ok');
      await incarcaConturi();
    }
  });

  await intra();
})();
