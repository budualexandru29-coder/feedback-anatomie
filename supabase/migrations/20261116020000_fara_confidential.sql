-- Studentul nu mai alege destinatarul: orice feedback ajunge la persoana vizată, la responsabilul sălii,
-- la coordonator (Patrik) și la supervizor. Parametrul p_destinatie rămâne în semnătură doar pentru
-- compatibilitate cu paginile deja deschise și este ignorat.

create or replace function public.trimite_feedback(
  p_staff_id int, p_sala_id text, p_tip text, p_destinatie text,
  p_data date, p_ora_start int, p_locatie text, p_descriere text
) returns void
language plpgsql volatile security definer set search_path = public as $$
declare
  v_azi  date := (now() at time zone 'Europe/Bucharest')::date;
  v_ora  int  := extract(hour from (now() at time zone 'Europe/Bucharest'));
  v_text text := btrim(coalesce(p_descriere, ''));
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
  values (v_azi, p_staff_id, p_sala_id, p_tip, 'persoana', p_data, p_ora_start, p_locatie, v_text);
end
$$;
