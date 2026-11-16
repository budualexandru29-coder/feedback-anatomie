# Feedback LP Anatomie

Feedback anonim de la studenții din anul I pentru demonstratorii și voluntarii de la lucrările practice de Anatomie.

- `site/index.html`: formularul anonim, fără cont. Ordinea pașilor: sală → persoană → pozitiv/negativ → zi (luni/miercuri) → interval (14–20) → loc (tablă/cadavru/muzeu) → descriere → destinatar.
- `site/cont.html`: pagina catedrei. Aici se intră în cont, se citește feedbackul și se administrează conturile (doar adminul).
- `site/confidentialitate.html`: ce se păstrează și cine vede.
- `supabase/setup_complet.sql`: toată baza de date (tabele, reguli de acces, lista de nume). Se rulează o singură dată.

## Cine vede ce (regulă impusă de baza de date)

| Feedback despre… | Destinatar ales de student | Îl văd |
|---|---|---|
| un demonstrator/voluntar | „Persoana despre care scriu” | persoana, responsabilul sălii, Patrik |
| un demonstrator/voluntar | „Doar coordonatorul” | doar Patrik |
| Buzgău Patrik | (nu se poate alege) | doar Patrik |

- Stoma-LR nu are responsabil de sală, așa că acolo feedbackul îl văd persoana și Patrik.
- Adminul gestionează conturile, dar nu vede feedbackul altora.
- Doar Patrik poate șterge un feedback (moderare).
- Feedbackul se șterge automat după 12 luni.

## Punerea online (o singură dată, cam 20 de minute)

### 1. Baza de date: Supabase
1. Fă-ți cont pe https://supabase.com și creează un proiect nou (**New project**). La **Region** alege **Central EU (Frankfurt)**, ca datele să rămână în UE.
2. Mergi la **SQL Editor → New query**, lipește tot conținutul fișierului `supabase/setup_complet.sql` și apasă **Run**.
3. Fă-te admin. Rulează în SQL Editor, cu emailul tău:
   ```sql
   insert into public.conturi (staff_id, email, admin)
   select id, 'emailul.tau@exemplu.ro', true from public.staff where nume = 'Budu Alexandru';
   ```
4. Din **Authentication → Sign In / Providers → Email**:
   - lasă **Confirm email** pornit;
   - setează **Minimum password length** la 10.
5. Din **Project Settings → API**, copiază **Project URL** și cheia **publishable** (sau **anon public**) în `site/assets/config.js`.

### 2. Site-ul: GitHub Pages
1. Creează un repository pe GitHub și urcă în el conținutul proiectului.
2. Din **Settings → Pages**, alege să publici folderul `site` (cu un workflow de tip „static HTML”) sau mută conținutul din `site/` în `docs/` și alege `/docs`.
3. Adresa site-ului va fi `https://<utilizator>.github.io/<repository>/`.
4. Înapoi în Supabase, la **Authentication → URL Configuration**:
   - **Site URL**: `https://<utilizator>.github.io/<repository>/cont.html`;
   - **Redirect URLs**: aceeași adresă.

### 3. Conturile catedrei
1. Intră pe `cont.html`, la **Activează contul**, cu emailul de la pasul 1.3.
2. În tabul **Conturi**, introdu emailul fiecărei persoane, de exemplu al lui Patrik și al responsabililor de sală.
3. Fiecare își activează singur contul din **Activează contul**. Merge doar cu un email din listă; orice alt email este refuzat.

**Atenție la emailuri.** Serverul de email inclus gratuit în Supabase trimite doar câteva emailuri pe oră, iar emailurile de confirmare pentru 36 de persoane ar dura mult. Ai două variante:
- **Recomandat:** în Supabase, la **Authentication → Users → Add user**, creezi utilizatorul cu emailul lui, o parolă temporară și bifezi **Auto Confirm User**. Contul se leagă automat de persoană. Persoana își schimbă apoi parola din **Schimbă parola**.
- Configurezi un server de email propriu: **Authentication → Emails → SMTP Settings**.

### 4. Pentru studenți
Dă-le adresa `https://<utilizator>.github.io/<repository>/`, de exemplu printr-un cod QR afișat în sală.

## Lucruri de știut
- **Pauza proiectelor gratuite.** Supabase pune pe pauză proiectele gratuite care nu au activitate o perioadă (în prezent, în jur de o săptămână). După o vacanță, intră în dashboard și apasă **Restore**.
- **Anonimatul.** Baza de date nu are nicio coloană pentru IP, browser sau ora trimiterii. Formularul nu folosește cookie-uri și nu încarcă nimic de pe alte servere. Supabase și GitHub țin, ca orice server, jurnale tehnice temporare, iar acestea nu sunt legate de feedback.
- **Lista de nume** vine din `ANTET.docx` plus corecturile din `data/corectii.json`: Patrik apare și la Sala 4, iar la Stoma-LR rămân doar Mocanu Maria și Barna Ioana. La o listă nouă:
  ```
  python3 -I scripts/parse_antet.py ANTET_NOU.docx > data/antet_raw.json
  python3 -I scripts/build_seed.py
  ```
  Apoi rulează în SQL Editor doar `supabase/seed.sql`.
- **Nota GDPR.** Feedbackul despre persoane identificate este dată personală. E bine ca responsabilul cu protecția datelor (DPO) al facultății să vadă `confidentialitate.html` înainte de lansare.

## Testele (local, cu Supabase pornit pe calculator)
```
export DOCKER_HOST=unix:///run/user/1000/podman/podman.sock
npx supabase start -x vector,logflare,studio,imgproxy,edge-runtime,realtime,storage-api,postgres-meta,supavisor
npx supabase db reset
npm test                       # 27 teste de acces prin API + 6 teste în browser
npm run verifica-nume          # lista din baza de date comparată cu ANTET.docx
```

## Test cu studenți reali (înainte de lansare)
Dă linkul la 3–5 studenți din anul I, pe telefon, fără nicio explicație. Testul a trecut dacă:
- fiecare trimite un feedback în mai puțin de 2 minute;
- nimeni nu întreabă ce trebuie să facă;
- persoana vizată, responsabilul de sală și Patrik văd exact ce scrie în tabelul de mai sus.
