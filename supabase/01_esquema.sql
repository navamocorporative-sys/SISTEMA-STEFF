-- =====================================================================
--  SISTEMA STEFF PARA EVENTOS — Esquema de base de datos (Supabase)
--  Ejecutar completo en: Supabase > SQL Editor > New query > Run
--  Es seguro ejecutarlo una sola vez en un proyecto nuevo.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
--  Utilidades
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
--  Usuarios del sistema (perfil ligado a auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text not null unique,
  full_name   text not null default '',
  role        text not null default 'colaborador' check (role in ('admin', 'colaborador')),
  active      boolean not null default false,
  created_at  timestamptz not null default now()
);

create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.active and p.role = 'admin');
$$;

-- Crea el perfil automáticamente cuando se crea un usuario en Auth.
-- El primer usuario del sistema se convierte en administrador.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_admin boolean;
  v_username  text;
begin
  select exists (select 1 from public.profiles where role = 'admin') into v_has_admin;

  v_username := lower(coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), split_part(new.email, '@', 1), 'usuario'));
  if exists (select 1 from public.profiles where username = v_username) then
    v_username := v_username || '-' || left(new.id::text, 4);
  end if;

  insert into public.profiles (id, username, full_name, role, active)
  values (
    new.id,
    v_username,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    case when not v_has_admin then 'admin'
         else coalesce(nullif(new.raw_app_meta_data ->> 'steff_role', ''), 'colaborador') end,
    case when not v_has_admin then true
         else coalesce((new.raw_app_meta_data ->> 'steff_active')::boolean, false) end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Función interna: crea un usuario de acceso (usuario + contraseña).
-- No se expone a la aplicación directamente.
create or replace function public._steff_create_auth_user(
  p_username  text,
  p_password  text,
  p_full_name text,
  p_role      text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_id       uuid := gen_random_uuid();
  v_username text := lower(trim(p_username));
  v_email    text;
begin
  if v_username !~ '^[a-z0-9._-]{3,30}$' then
    raise exception 'El usuario debe tener de 3 a 30 caracteres (letras, números, punto, guion).';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres.';
  end if;
  if p_role not in ('admin', 'colaborador') then
    raise exception 'Rol inválido.';
  end if;

  v_email := v_username || '@steff.app';

  if exists (select 1 from auth.users where email = v_email)
     or exists (select 1 from public.profiles where username = v_username) then
    raise exception 'El usuario "%" ya existe.', v_username;
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    is_sso_user, is_anonymous
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                       'steff_role', p_role, 'steff_active', true),
    jsonb_build_object('username', v_username, 'full_name', coalesce(p_full_name, '')),
    now(), now(),
    '', '', '', '',
    '', '', '', '',
    false, false
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now(), now()
  );

  -- Garantiza rol y estado exactos aunque ya existiera otro administrador.
  update public.profiles
     set role = p_role, active = true, full_name = coalesce(p_full_name, ''), username = v_username
   where id = v_id;

  return v_id;
end;
$$;

revoke all on function public._steff_create_auth_user(text, text, text, text) from public, anon, authenticated;

-- Funciones que la app usa (solo el administrador puede ejecutarlas)
create or replace function public.admin_create_user(
  p_username  text,
  p_password  text,
  p_full_name text,
  p_role      text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede crear usuarios.';
  end if;
  return public._steff_create_auth_user(p_username, p_password, p_full_name, p_role);
end;
$$;

create or replace function public.admin_set_password(p_user_id uuid, p_password text)
returns void
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede cambiar contraseñas de otros usuarios.';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'La contraseña debe tener al menos 8 caracteres.';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_user_id;
end;
$$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo el administrador puede eliminar usuarios.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'No puedes eliminar tu propio usuario.';
  end if;
  delete from auth.users where id = p_user_id;
end;
$$;

revoke all on function public.admin_create_user(text, text, text, text) from public, anon;
revoke all on function public.admin_set_password(uuid, text) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_create_user(text, text, text, text) to authenticated;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------
--  Configuración del negocio (una sola fila)
-- ---------------------------------------------------------------------
create table public.settings (
  id                    integer primary key default 1 check (id = 1),
  business_name         text not null default 'STEFF',
  city                  text not null default 'Hermosillo, Sonora',
  representative_name   text not null default '',
  phone                 text not null default '',
  email                 text not null default '',
  address               text not null default '',
  whatsapp_country_code text not null default '52',
  updated_at            timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
--  Clientes
-- ---------------------------------------------------------------------
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  full_name     text not null,
  phone         text not null default '',
  email         text not null default '',
  address       text not null default '',
  city          text not null default '',
  source        text not null default '',
  status        text not null default 'activo'
                check (status in ('prospecto', 'activo', 'recurrente', 'inactivo')),
  birthday      date,
  notes         text not null default '',
  client_since  date not null default current_date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index clients_name_idx on public.clients (lower(full_name));

create table public.client_notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete cascade,
  body        text not null,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index client_notes_client_idx on public.client_notes (client_id);

-- ---------------------------------------------------------------------
--  Equipo humano
-- ---------------------------------------------------------------------
create table public.staff (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  phone             text not null default '',
  email             text not null default '',
  roles             text[] not null default '{}',
  status            text not null default 'activo' check (status in ('activo', 'inactivo', 'vacaciones')),
  address           text not null default '',
  birth_date        date,
  emergency_contact text not null default '',
  emergency_phone   text not null default '',
  bank_name         text not null default '',
  bank_account      text not null default '',
  rate_notes        text not null default '',
  equipment_notes   text not null default '',
  notes             text not null default '',
  photo_path        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------
--  Eventos
-- ---------------------------------------------------------------------
create table public.events (
  id              uuid primary key default gen_random_uuid(),
  project_number  text not null unique,
  client_id       uuid not null references public.clients (id) on delete restrict,
  event_type      text not null,
  main_names      text not null default '',
  event_date      date not null,
  status          text not null default 'confirmado'
                  check (status in ('cotizacion', 'confirmado', 'realizado', 'en_edicion', 'entregado', 'cancelado')),
  package         text not null default '',
  services        text[] not null default '{}',
  total_amount    numeric(12, 2) not null default 0 check (total_amount >= 0),
  seller_id       uuid references public.staff (id) on delete set null,
  address         text not null default '',
  sesion_place    text not null default '',
  sesion_maps_url text not null default '',
  sesion_start    time,
  sesion_end      time,
  misa_place      text not null default '',
  misa_maps_url   text not null default '',
  misa_start      time,
  misa_end        time,
  evento_place    text not null default '',
  evento_maps_url text not null default '',
  evento_start    time,
  evento_end      time,
  delivery_type   text not null default 'normal' check (delivery_type in ('normal', 'express1', 'express2')),
  print_service   text not null default '',
  notes           text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index events_date_idx on public.events (event_date);
create index events_client_idx on public.events (client_id);

create table public.event_payments (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events (id) on delete cascade,
  concept     text not null default 'abono' check (concept in ('anticipo', 'abono', 'liquidacion', 'extra')),
  amount      numeric(12, 2) not null check (amount > 0),
  paid_on     date not null default current_date,
  method      text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now()
);
create index event_payments_event_idx on public.event_payments (event_id);

-- Equipo asignado al evento (+ guía de trabajo por persona)
create table public.assignments (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events (id) on delete cascade,
  staff_id       uuid not null references public.staff (id) on delete restrict,
  role           text not null,
  payment        numeric(12, 2) not null default 0 check (payment >= 0),
  paid           boolean not null default false,
  paid_on        date,
  notes          text not null default '',
  guide          jsonb,
  guide_sent_at  timestamptz,
  created_at     timestamptz not null default now(),
  unique (event_id, staff_id, role)
);
create index assignments_event_idx on public.assignments (event_id);
create index assignments_staff_idx on public.assignments (staff_id);

-- Familiares (fotos y nombres para identificar a la familia)
create table public.family_members (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  name          text not null,
  relationship  text not null default '',
  notes         text not null default '',
  photo_path    text,
  created_at    timestamptz not null default now()
);
create index family_members_event_idx on public.family_members (event_id);

-- ---------------------------------------------------------------------
--  Inventario y entrega de equipo
-- ---------------------------------------------------------------------
create table public.equipment (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null default '',
  brand       text not null default '',
  model       text not null default '',
  serial      text not null default '',
  status      text not null default 'disponible' check (status in ('disponible', 'en_uso', 'mantenimiento', 'baja')),
  notes       text not null default '',
  created_at  timestamptz not null default now()
);

create table public.equipment_checkouts (
  id             uuid primary key default gen_random_uuid(),
  equipment_id   uuid not null references public.equipment (id) on delete cascade,
  event_id       uuid references public.events (id) on delete set null,
  staff_id       uuid references public.staff (id) on delete set null,
  out_at         timestamptz not null default now(),
  due_back       date,
  returned_at    timestamptz,
  condition_out  text not null default '',
  condition_in   text not null default '',
  notes          text not null default '',
  created_at     timestamptz not null default now()
);
create index equipment_checkouts_equipment_idx on public.equipment_checkouts (equipment_id);

-- ---------------------------------------------------------------------
--  Respaldos y entregas de material
-- ---------------------------------------------------------------------
create table public.backups (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  service       text not null default 'general',
  location      text not null default '',
  folder_name   text not null default '',
  status        text not null default 'pendiente' check (status in ('pendiente', 'respaldado', 'incompleto', 'eliminado')),
  backed_up_on  date,
  notes         text not null default '',
  created_at    timestamptz not null default now()
);
create index backups_event_idx on public.backups (event_id);

create table public.deliveries (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events (id) on delete cascade,
  service       text not null default 'fotografia',
  status        text not null default 'pendiente'
                check (status in ('pendiente', 'en_edicion', 'seleccion_cliente', 'listo', 'entregado')),
  editor_id     uuid references public.staff (id) on delete set null,
  edit_day      text not null default '',
  due_date      date,
  delivered_on  date,
  method        text not null default '',
  link          text not null default '',
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index deliveries_event_idx on public.deliveries (event_id);

-- ---------------------------------------------------------------------
--  Proveedores y gastos
-- ---------------------------------------------------------------------
create table public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       text not null default '',
  contact_name   text not null default '',
  phone          text not null default '',
  email          text not null default '',
  address        text not null default '',
  website        text not null default '',
  products       text not null default '',
  payment_terms  text not null default '',
  status         text not null default 'activo' check (status in ('activo', 'inactivo')),
  notes          text not null default '',
  created_at     timestamptz not null default now()
);

create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid references public.events (id) on delete cascade,
  supplier_id   uuid references public.suppliers (id) on delete set null,
  category      text not null,
  concept       text not null default '',
  amount        numeric(12, 2) not null default 0 check (amount >= 0),
  expense_date  date not null default current_date,
  paid          boolean not null default true,
  paid_on       date,
  notes         text not null default '',
  created_at    timestamptz not null default now()
);
create index expenses_event_idx on public.expenses (event_id);
create index expenses_supplier_idx on public.expenses (supplier_id);
create index expenses_date_idx on public.expenses (expense_date);

-- ---------------------------------------------------------------------
--  Contratos y plantillas
-- ---------------------------------------------------------------------
create table public.contract_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_default  boolean not null default false,
  content     jsonb not null,
  logo_path   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index contract_templates_one_default on public.contract_templates (is_default) where is_default;

create table public.contracts (
  id             uuid primary key default gen_random_uuid(),
  folio          bigint generated always as identity,
  event_id       uuid references public.events (id) on delete set null,
  client_id      uuid references public.clients (id) on delete set null,
  template_id    uuid references public.contract_templates (id) on delete set null,
  contract_date  date not null default current_date,
  status         text not null default 'borrador' check (status in ('borrador', 'enviado', 'firmado', 'cancelado')),
  data           jsonb not null,
  pdf_path       text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index contracts_event_idx on public.contracts (event_id);
create index contracts_client_idx on public.contracts (client_id);

create table public.guide_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_default  boolean not null default false,
  content     jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index guide_templates_one_default on public.guide_templates (is_default) where is_default;

-- ---------------------------------------------------------------------
--  Publicidad
-- ---------------------------------------------------------------------
create table public.ad_campaigns (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'publicidad' check (kind in ('publicidad', 'innovacion')),
  name        text not null,
  platform    text not null default '',
  objective   text not null default '',
  strategy    text not null default '',
  start_date  date,
  end_date    date,
  budget      numeric(12, 2) not null default 0 check (budget >= 0),
  spent       numeric(12, 2) not null default 0 check (spent >= 0),
  reach       integer not null default 0 check (reach >= 0),
  leads       integer not null default 0 check (leads >= 0),
  sales       integer not null default 0 check (sales >= 0),
  revenue     numeric(12, 2) not null default 0 check (revenue >= 0),
  status      text not null default 'planeada' check (status in ('idea', 'planeada', 'activa', 'finalizada')),
  result      text check (result in ('funciono', 'regular', 'no_funciono')),
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.moodboard_items (
  id          uuid primary key default gen_random_uuid(),
  board       text not null default 'General',
  title       text not null default '',
  notes       text not null default '',
  image_path  text not null,
  created_at  timestamptz not null default now()
);

-- Registro de mensajes de WhatsApp enviados a clientes
create table public.wa_messages (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid references public.clients (id) on delete cascade,
  message     text not null,
  image_path  text,
  sent_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  sent_at     timestamptz not null default now()
);
create index wa_messages_client_idx on public.wa_messages (client_id);

-- ---------------------------------------------------------------------
--  Triggers updated_at
-- ---------------------------------------------------------------------
create trigger clients_updated_at before update on public.clients for each row execute function public.set_updated_at();
create trigger staff_updated_at before update on public.staff for each row execute function public.set_updated_at();
create trigger events_updated_at before update on public.events for each row execute function public.set_updated_at();
create trigger deliveries_updated_at before update on public.deliveries for each row execute function public.set_updated_at();
create trigger contract_templates_updated_at before update on public.contract_templates for each row execute function public.set_updated_at();
create trigger contracts_updated_at before update on public.contracts for each row execute function public.set_updated_at();
create trigger guide_templates_updated_at before update on public.guide_templates for each row execute function public.set_updated_at();
create trigger ad_campaigns_updated_at before update on public.ad_campaigns for each row execute function public.set_updated_at();
create trigger settings_updated_at before update on public.settings for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
--  Vista financiera por evento (respeta permisos de quien consulta)
-- ---------------------------------------------------------------------
create view public.event_finance
with (security_invoker = true)
as
select
  e.id as event_id,
  e.total_amount,
  coalesce(p.paid, 0)::numeric(12, 2)                              as paid,
  (e.total_amount - coalesce(p.paid, 0))::numeric(12, 2)           as balance,
  coalesce(a.team_cost, 0)::numeric(12, 2)                         as team_cost,
  coalesce(a.team_unpaid, 0)::numeric(12, 2)                       as team_unpaid,
  coalesce(x.other_cost, 0)::numeric(12, 2)                        as other_cost,
  coalesce(x.other_unpaid, 0)::numeric(12, 2)                      as other_unpaid,
  (coalesce(a.team_cost, 0) + coalesce(x.other_cost, 0))::numeric(12, 2) as investment,
  (e.total_amount - coalesce(a.team_cost, 0) - coalesce(x.other_cost, 0))::numeric(12, 2) as profit
from public.events e
left join (
  select event_id, sum(amount) as paid from public.event_payments group by event_id
) p on p.event_id = e.id
left join (
  select event_id,
         sum(payment) as team_cost,
         sum(case when paid then 0 else payment end) as team_unpaid
  from public.assignments group by event_id
) a on a.event_id = e.id
left join (
  select event_id,
         sum(amount) as other_cost,
         sum(case when paid then 0 else amount end) as other_unpaid
  from public.expenses where event_id is not null group by event_id
) x on x.event_id = e.id;

-- ---------------------------------------------------------------------
--  Seguridad (RLS)
--  - Solo usuarios activos del sistema pueden ver información.
--  - Finanzas, pagos, contratos, plantillas, familiares, proveedores,
--    publicidad y equipo humano solo los modifica el administrador.
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.settings            enable row level security;
alter table public.clients             enable row level security;
alter table public.client_notes        enable row level security;
alter table public.staff               enable row level security;
alter table public.events              enable row level security;
alter table public.event_payments      enable row level security;
alter table public.assignments         enable row level security;
alter table public.family_members      enable row level security;
alter table public.equipment           enable row level security;
alter table public.equipment_checkouts enable row level security;
alter table public.backups             enable row level security;
alter table public.deliveries          enable row level security;
alter table public.suppliers           enable row level security;
alter table public.expenses            enable row level security;
alter table public.contract_templates  enable row level security;
alter table public.contracts           enable row level security;
alter table public.guide_templates     enable row level security;
alter table public.ad_campaigns        enable row level security;
alter table public.moodboard_items     enable row level security;
alter table public.wa_messages         enable row level security;

-- Perfiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_member());
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Tablas que cualquier usuario activo puede leer y modificar
do $$
declare t text;
begin
  foreach t in array array['clients', 'client_notes', 'events', 'equipment', 'equipment_checkouts',
                           'backups', 'deliveries', 'wa_messages']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_member())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_member()) with check (public.is_member())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_member())', t || '_delete', t);
  end loop;
end $$;

-- Tablas que todos leen pero solo el administrador modifica
do $$
declare t text;
begin
  foreach t in array array['settings', 'staff', 'assignments', 'family_members', 'suppliers',
                           'contract_templates', 'contracts', 'guide_templates', 'ad_campaigns', 'moodboard_items']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_delete', t);
  end loop;
end $$;

-- Tablas de dinero: solo el administrador las ve y modifica
do $$
declare t text;
begin
  foreach t in array array['event_payments', 'expenses']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_admin())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_delete', t);
  end loop;
end $$;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.event_finance to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------
--  Almacenamiento de archivos
--  media      (público): fotos de familiares, logos, moodboard, promociones
--  documentos (privado): PDFs de contratos, guías y reportes
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true), ('documentos', 'documentos', false)
on conflict (id) do nothing;

create policy steff_storage_select on storage.objects for select to authenticated
  using (bucket_id in ('media', 'documentos') and public.is_member());
create policy steff_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('media', 'documentos') and public.is_member());
create policy steff_storage_update on storage.objects for update to authenticated
  using (bucket_id in ('media', 'documentos') and public.is_member());
create policy steff_storage_delete on storage.objects for delete to authenticated
  using (bucket_id in ('media', 'documentos') and public.is_member());
