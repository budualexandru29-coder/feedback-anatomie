-- ============================================================================
-- Feedback anonim – demonstratori Anatomie
-- Toate regulile de acces sunt în baza de date (Row Level Security), nu doar în interfață.
-- ============================================================================

-- ---------- Tabele ----------------------------------------------------------

create table public.staff (
  id          serial primary key,
  nume        text not null unique,
  coordonator boolean not null default false          -- Buzgău Patrik: vede tot feedbackul
);

create table public.sali (
  id             text primary key,                     -- ex. 'sala-1'
  nume           text not null,
  ordine         int  not null default 0,
  grupe          int,
  responsabil_id int references public.staff(id) on delete set null
);

create table public.staff_sali (
  staff_id int  not null references public.staff(id) on delete cascade,
  sala_id  text not null references public.sali(id) on delete cascade,
  rol      text not null check (rol in ('demonstrator', 'voluntar')),
  primary key (staff_id, sala_id)
);

-- Conturile catedrei: adminul introduce emailul; persoana își activează singură contul cu acel email.
create table public.conturi (
  staff_id int  primary key references public.staff(id) on delete cascade,
  email    text not null unique check (email = lower(btrim(email)) and email like '%_@_%'),
  user_id  uuid unique references auth.users(id) on delete set null,
  admin    boolean not null default false
);

-- Feedbackul. Intenționat NU există coloane pentru IP, browser, cont sau ora trimiterii.
create table public.feedback (
  id             uuid primary key default gen_random_uuid(),   -- aleator, nu dezvăluie ordinea
  primit_la      date not null,                                -- doar ziua, nu și ora
  staff_id       int  not null references public.staff(id) on delete cascade,
  sala_id        text not null references public.sali(id),
  tip            text not null check (tip in ('pozitiv', 'negativ')),
  destinatie     text not null check (destinatie in ('persoana', 'coordonator')),
  data_eveniment date not null,
  ora_start      smallint not null check (ora_start between 14 and 19),   -- interval de 1 oră, 14–20
  locatie        text not null check (locatie in ('tabla', 'cadavru', 'muzeu')),
  descriere      text not null check (char_length(descriere) between 20 and 3000)
);
create index feedback_staff_idx on public.feedback (staff_id);
create index feedback_sala_idx  on public.feedback (sala_id);

-- Limitare anti-spam fără identificare: doar un contor pe oră, fără legătură cu vreun feedback.
create table public.limitare (
  ora    timestamptz primary key,
  numar  int not null default 0
);

-- ---------- Funcții ajutătoare (cine sunt eu?) ------------------------------

create or replace function public.staff_curent() returns int
language sql stable security definer set search_path = public as $$
  select staff_id from public.conturi where user_id = auth.uid()
$$;

create or replace function public.este_coordonator() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select s.coordonator from public.staff s where s.id = public.staff_curent()), false)
$$;

create or replace function public.este_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select c.admin from public.conturi c where c.user_id = auth.uid()), false)
$$;

-- Regula de vizibilitate, într-un singur loc:
--  * coordonatorul (Patrik) vede tot, inclusiv feedbackul confidențial;
--  * persoana vizată își vede feedbackul (dacă studentul nu l-a trimis doar coordonatorului);
--  * responsabilul de sală vede feedbackul din sala lui, cu excepția celui despre coordonator.
create or replace function public.poate_vedea(f public.feedback) returns boolean
language sql stable security definer set search_path = public as $$
  select public.este_coordonator()
      or (f.destinatie = 'persoana' and (
            f.staff_id = public.staff_curent()
         or (not (select s.coordonator from public.staff s where s.id = f.staff_id)
             and exists (select 1 from public.sali sa
                         where sa.id = f.sala_id and sa.responsabil_id = public.staff_curent()))
      ))
$$;

-- Ce roluri are utilizatorul logat (pentru interfață).
create or replace function public.profilul_meu() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'staff_id', s.id,
    'nume', s.nume,
    'coordonator', s.coordonator,
    'admin', c.admin,
    'responsabil_sali', coalesce((select json_agg(sa.id order by sa.ordine) from public.sali sa where sa.responsabil_id = s.id), '[]'::json)
  )
  from public.conturi c join public.staff s on s.id = c.staff_id
  where c.user_id = auth.uid()
$$;

-- ---------- Trimiterea feedbackului (singura cale de scriere pentru studenți) ----

create or replace function public.trimite_feedback(
  p_staff_id int, p_sala_id text, p_tip text, p_destinatie text,
  p_data date, p_ora_start int, p_locatie text, p_descriere text
) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_azi  date := (now() at time zone 'Europe/Bucharest')::date;
  v_ora  int  := extract(hour from (now() at time zone 'Europe/Bucharest'));
  v_text text := btrim(coalesce(p_descriere, ''));
  v_dest text := p_destinatie;
  v_nr   int;
begin
  if not exists (select 1 from public.staff_sali where staff_id = p_staff_id and sala_id = p_sala_id) then
    raise exception 'Persoana aleasă nu face parte din sala aleasă.' using errcode = '22023';
  end if;
  if p_tip not in ('pozitiv', 'negativ') then
    raise exception 'Tip de feedback invalid.' using errcode = '22023';
  end if;
  if p_locatie not in ('tabla', 'cadavru', 'muzeu') then
    raise exception 'Locație invalidă.' using errcode = '22023';
  end if;
  if p_destinatie not in ('persoana', 'coordonator') then
    raise exception 'Destinatar invalid.' using errcode = '22023';
  end if;
  if p_data is null or p_data > v_azi or p_data < v_azi - 120 then
    raise exception 'Data trebuie să fie din ultimele 4 luni și nu din viitor.' using errcode = '22023';
  end if;
  if extract(isodow from p_data) not in (1, 3) then
    raise exception 'Lucrările practice sunt doar lunea și miercurea.' using errcode = '22023';
  end if;
  if p_ora_start is null or p_ora_start not between 14 and 19 then
    raise exception 'Intervalul orar trebuie să fie între 14 și 20.' using errcode = '22023';
  end if;
  if p_data = v_azi and p_ora_start > v_ora then
    raise exception 'Intervalul ales nu a început încă.' using errcode = '22023';
  end if;
  if char_length(v_text) < 20 then
    raise exception 'Descrierea trebuie să aibă cel puțin 20 de caractere.' using errcode = '22023';
  end if;
  if char_length(v_text) > 3000 then
    raise exception 'Descrierea poate avea cel mult 3000 de caractere.' using errcode = '22023';
  end if;

  -- Feedbackul despre coordonator ajunge oricum doar la el.
  if (select coordonator from public.staff where id = p_staff_id) then
    v_dest := 'persoana';
  end if;

  -- Anti-spam: maximum 300 de trimiteri pe oră în total și 30 pe zi despre aceeași persoană.
  insert into public.limitare as l (ora, numar) values (date_trunc('hour', now()), 1)
    on conflict (ora) do update set numar = l.numar + 1
    returning numar into v_nr;
  if v_nr > 300 then
    raise exception 'Prea multe trimiteri în ultima oră. Încearcă din nou mai târziu.' using errcode = '54000';
  end if;
  if (select count(*) from public.feedback where staff_id = p_staff_id and primit_la = v_azi) >= 30 then
    raise exception 'S-a atins limita zilnică de feedback pentru această persoană.' using errcode = '54000';
  end if;
  delete from public.limitare where ora < now() - interval '1 day';

  insert into public.feedback (primit_la, staff_id, sala_id, tip, destinatie, data_eveniment, ora_start, locatie, descriere)
  values (v_azi, p_staff_id, p_sala_id, p_tip, v_dest, p_data, p_ora_start, p_locatie, v_text);
end
$$;

-- ---------- Legarea conturilor -----------------------------------------------

-- La înregistrare: se acceptă doar emailuri introduse de admin în tabelul conturi.
create or replace function public.leaga_cont_nou() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.conturi set user_id = new.id where email = lower(new.email) and user_id is null;
  if not found then
    raise exception 'Acest email nu este în lista catedrei.' using errcode = '42501';
  end if;
  return new;
end
$$;
create trigger leaga_cont_nou after insert on auth.users
  for each row execute function public.leaga_cont_nou();

-- Când adminul adaugă un email pentru care există deja un utilizator, se leagă imediat.
create or replace function public.leaga_cont_existent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(btrim(new.email));
  if new.user_id is null or (tg_op = 'UPDATE' and new.email is distinct from old.email) then
    new.user_id := (select id from auth.users u where lower(u.email) = new.email);
  end if;
  return new;
end
$$;
create trigger leaga_cont_existent before insert or update on public.conturi
  for each row execute function public.leaga_cont_existent();

-- Ultimul admin nu se poate șterge singur (ca să nu rămână aplicația fără admin).
create or replace function public.pastreaza_un_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.conturi where admin) then
    raise exception 'Trebuie să rămână cel puțin un cont de admin.' using errcode = '42501';
  end if;
  return null;
end
$$;
create constraint trigger pastreaza_un_admin after update or delete on public.conturi
  deferrable initially immediate for each row execute function public.pastreaza_un_admin();

-- ---------- Drepturi și Row Level Security -----------------------------------

alter table public.staff      enable row level security;
alter table public.sali       enable row level security;
alter table public.staff_sali enable row level security;
alter table public.conturi    enable row level security;
alter table public.feedback   enable row level security;
alter table public.limitare   enable row level security;

-- Pe lângă RLS, retragem explicit drepturile care nu trebuie să existe deloc.
revoke all on public.feedback, public.conturi, public.limitare from anon;
revoke all on public.limitare from authenticated;
revoke insert, update, truncate, references, trigger on public.feedback from authenticated;
revoke insert, update, delete, truncate on public.staff, public.sali, public.staff_sali from anon, authenticated;
grant select on public.staff, public.sali, public.staff_sali to anon, authenticated;
grant select, delete on public.feedback to authenticated;
grant select, insert, update, delete on public.conturi to authenticated;

-- Lista de nume e publică (e nevoie de ea în formular).
create policy "lista publica" on public.staff      for select to anon, authenticated using (true);
create policy "lista publica" on public.sali       for select to anon, authenticated using (true);
create policy "lista publica" on public.staff_sali for select to anon, authenticated using (true);

-- Feedback: citire după regula poate_vedea; ștergere doar de coordonator (moderare). Nicio scriere directă.
create policy "citire dupa destinatar" on public.feedback for select to authenticated
  using (public.poate_vedea(feedback));
create policy "moderare coordonator" on public.feedback for delete to authenticated
  using (public.este_coordonator());

-- Conturi: adminul le gestionează; fiecare își vede propriul rând.
create policy "admin vede tot / eu ma vad" on public.conturi for select to authenticated
  using (public.este_admin() or user_id = auth.uid());
create policy "admin adauga" on public.conturi for insert to authenticated with check (public.este_admin());
create policy "admin modifica" on public.conturi for update to authenticated
  using (public.este_admin()) with check (public.este_admin());
create policy "admin sterge" on public.conturi for delete to authenticated using (public.este_admin());

-- Funcțiile: doar ce trebuie, doar cui trebuie.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.trimite_feedback(int, text, text, text, date, int, text, text) to anon, authenticated;
grant execute on function public.profilul_meu() to authenticated;
grant execute on function public.staff_curent(), public.este_coordonator(), public.este_admin(),
                          public.poate_vedea(public.feedback) to authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------- Păstrarea datelor ------------------------------------------------
-- Feedbackul mai vechi de 12 luni se șterge automat în fiecare noapte (vezi nota de confidențialitate).
create or replace function public.sterge_feedback_vechi() returns void
language sql security definer set search_path = public as $$
  delete from public.feedback where primit_la < (now() at time zone 'Europe/Bucharest')::date - interval '12 months';
$$;

create extension if not exists pg_cron;
select cron.schedule('sterge-feedback-vechi', '15 3 * * *', 'select public.sterge_feedback_vechi()');
