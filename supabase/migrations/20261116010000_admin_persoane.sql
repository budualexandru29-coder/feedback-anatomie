-- 1) Rol de supervizor (ex. Conf. Denes): vede tot feedbackul, inclusiv pe cel confidențial și pe cel despre coordonator.
--    Nu face parte din nicio sală, deci nu poate fi ales în formular. Nu poate șterge (moderarea rămâne la coordonator).
-- 2) Adminul poate adăuga persoane noi (sau o persoană existentă într-o sală nouă) din aplicație.

alter table public.staff add column supervizor boolean not null default false;

create or replace function public.vede_tot() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select s.coordonator or s.supervizor from public.staff s where s.id = public.staff_curent()), false)
$$;
grant execute on function public.vede_tot() to authenticated;

create or replace function public.poate_vedea(f public.feedback) returns boolean
language sql stable security definer set search_path = public as $$
  select public.vede_tot()
      or (f.destinatie = 'persoana' and (
            f.staff_id = public.staff_curent()
         or (not (select s.coordonator from public.staff s where s.id = f.staff_id)
             and exists (select 1 from public.sali sa
                         where sa.id = f.sala_id and sa.responsabil_id = public.staff_curent()))
      ))
$$;

create or replace function public.profilul_meu() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'staff_id', s.id,
    'nume', s.nume,
    'coordonator', s.coordonator,
    'supervizor', s.supervizor,
    'admin', c.admin,
    'responsabil_sali', coalesce((select json_agg(sa.id order by sa.ordine) from public.sali sa where sa.responsabil_id = s.id), '[]'::json)
  )
  from public.conturi c join public.staff s on s.id = c.staff_id
  where c.user_id = auth.uid()
$$;

-- Adăugare de către admin. Rol: 'demonstrator' | 'voluntar' (cu sală) sau 'supervizor' (fără sală).
create or replace function public.adauga_persoana(p_nume text, p_rol text, p_sala_id text default null, p_email text default null)
returns int
language plpgsql volatile security definer set search_path = public as $$
declare
  v_nume  text := regexp_replace(btrim(coalesce(p_nume, '')), '\s+', ' ', 'g');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_id    int;
begin
  if not public.este_admin() then
    raise exception 'Doar adminul poate adăuga persoane.' using errcode = '42501';
  end if;
  if char_length(v_nume) < 3 or char_length(v_nume) > 80 then
    raise exception 'Numele trebuie să aibă între 3 și 80 de caractere.' using errcode = '22023';
  end if;
  if p_rol not in ('demonstrator', 'voluntar', 'supervizor') then
    raise exception 'Rolul trebuie să fie demonstrator, voluntar sau supervizor.' using errcode = '22023';
  end if;
  if p_rol <> 'supervizor' and not exists (select 1 from public.sali where id = p_sala_id) then
    raise exception 'Alege sala în care e repartizată persoana.' using errcode = '22023';
  end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Emailul nu pare valid.' using errcode = '22023';
  end if;

  insert into public.staff (nume) values (v_nume) on conflict (nume) do nothing;
  select id into v_id from public.staff where nume = v_nume;

  if p_rol = 'supervizor' then
    if exists (select 1 from public.staff_sali where staff_id = v_id) then
      raise exception '% este deja repartizat într-o sală; un supervizor nu poate fi și membru al unei săli.', v_nume using errcode = '22023';
    end if;
    update public.staff set supervizor = true where id = v_id;
  else
    if (select supervizor from public.staff where id = v_id) then
      raise exception '% este supervizor și nu poate fi repartizat într-o sală.', v_nume using errcode = '22023';
    end if;
    insert into public.staff_sali (staff_id, sala_id, rol) values (v_id, p_sala_id, p_rol)
      on conflict (staff_id, sala_id) do update set rol = excluded.rol;
  end if;

  if v_email is not null then
    if exists (select 1 from public.conturi where email = v_email and staff_id <> v_id) then
      raise exception 'Emailul % este deja folosit de altă persoană.', v_email using errcode = '22023';
    end if;
    insert into public.conturi (staff_id, email) values (v_id, v_email)
      on conflict (staff_id) do update set email = excluded.email;
  end if;
  return v_id;
end
$$;
grant execute on function public.adauga_persoana(text, text, text, text) to authenticated;
