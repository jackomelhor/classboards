-- ClassBoard v3
-- Execute este arquivo inteiro no SQL Editor do Supabase.
-- Depois desligue: Authentication > Providers > Email > Confirm email.

create extension if not exists pgcrypto;

create or replace function public.generate_invite_code()
returns text
language sql
as $$
  select upper(substring(encode(gen_random_bytes(6), 'hex') from 1 for 10));
$$;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text not null unique,
  email_normalized text generated always as (lower(email)) stored,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, full_name, email)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    new.email
  )
  on conflict (user_id) do update
  set full_name = excluded.full_name,
      email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_classboard on auth.users;
create trigger on_auth_user_created_classboard
after insert on auth.users
for each row execute procedure public.handle_new_user_profile();

create or replace function public.email_exists(candidate_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_profiles up
    where up.email_normalized = lower(candidate_email)
  );
$$;

grant execute on function public.email_exists(text) to anon, authenticated;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  school_name text,
  workspace_type text not null check (workspace_type in ('individual', 'grupo', 'turma')),
  invite_code text not null unique default public.generate_invite_code(),
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists public.workspace_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (workspace_id, name)
);

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.workspace_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.workspace_plans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  plan_code text not null check (plan_code in ('individual_free', 'grupo', 'turma')),
  status text not null default 'pending' check (status in ('active', 'pending', 'inactive')),
  notes text,
  granted_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);

create or replace function public.touch_workspace_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists workspace_plans_touch_updated_at on public.workspace_plans;
create trigger workspace_plans_touch_updated_at
before update on public.workspace_plans
for each row execute procedure public.touch_workspace_plans_updated_at();

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  subject text not null,
  task_type text not null check (task_type in ('prova', 'trabalho', 'atividade', 'apresentacao')),
  due_date date not null,
  priority text not null default 'media' check (priority in ('alta', 'media', 'baixa')),
  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'concluida')),
  attachment_name text,
  attachment_url text,
  group_id uuid references public.workspace_groups(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  content text not null,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.owner_id = auth.uid()
  );
$$;

create or replace function public.workspace_allows_collaboration(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_plans wp
    where wp.workspace_id = target_workspace_id
      and wp.status = 'active'
      and wp.plan_code in ('grupo', 'turma')
  );
$$;

create or replace function public.workspace_plan_is_active(target_workspace_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.workspace_plans wp
    where wp.workspace_id = target_workspace_id
      and wp.status = 'active'
  )
  or exists (
    select 1
    from public.workspaces w
    where w.id = target_workspace_id
      and w.workspace_type = 'individual'
      and not exists (
        select 1 from public.workspace_plans wp2 where wp2.workspace_id = target_workspace_id
      )
  );
$$;

alter table public.user_profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.workspace_plans enable row level security;
alter table public.tasks enable row level security;
alter table public.checklist_items enable row level security;

drop policy if exists "profiles readable by authenticated users" on public.user_profiles;
create policy "profiles readable by authenticated users"
on public.user_profiles
for select
to authenticated
using (true);

drop policy if exists "workspace members can read workspaces" on public.workspaces;
create policy "workspace members can read workspaces"
on public.workspaces
for select
to authenticated
using (public.is_workspace_member(id) or owner_id = auth.uid());

drop policy if exists "authenticated users can create workspace" on public.workspaces;
create policy "authenticated users can create workspace"
on public.workspaces
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "owners can update own workspace" on public.workspaces;
create policy "owners can update own workspace"
on public.workspaces
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "owners can delete own workspace" on public.workspaces;
create policy "owners can delete own workspace"
on public.workspaces
for delete
to authenticated
using (owner_id = auth.uid());

drop policy if exists "members can read memberships" on public.workspace_members;
create policy "members can read memberships"
on public.workspace_members
for select
to authenticated
using (user_id = auth.uid() or public.is_workspace_member(workspace_id));

drop policy if exists "owners can insert membership rows" on public.workspace_members;
create policy "owners can insert membership rows"
on public.workspace_members
for insert
to authenticated
with check (user_id = auth.uid() and public.is_workspace_owner(workspace_id));

drop policy if exists "owners can remove memberships" on public.workspace_members;
create policy "owners can remove memberships"
on public.workspace_members
for delete
to authenticated
using (public.is_workspace_owner(workspace_id) or user_id = auth.uid());

drop policy if exists "members can read plans" on public.workspace_plans;
create policy "members can read plans"
on public.workspace_plans
for select
to authenticated
using (public.is_workspace_member(workspace_id) or public.is_workspace_owner(workspace_id));

drop policy if exists "owners can create plan rows" on public.workspace_plans;
create policy "owners can create plan rows"
on public.workspace_plans
for insert
to authenticated
with check (public.is_workspace_owner(workspace_id));

drop policy if exists "owners can update safe plan rows" on public.workspace_plans;
create policy "owners can update safe plan rows"
on public.workspace_plans
for update
to authenticated
using (public.is_workspace_owner(workspace_id))
with check (
  public.is_workspace_owner(workspace_id)
  and (
    (plan_code = 'individual_free' and status = 'active')
    or status = 'pending'
  )
);

drop policy if exists "members can read groups" on public.workspace_groups;
create policy "members can read groups"
on public.workspace_groups
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "collaborative plans can create groups" on public.workspace_groups;
create policy "collaborative plans can create groups"
on public.workspace_groups
for insert
to authenticated
with check (
  created_by = auth.uid()
  and public.is_workspace_member(workspace_id)
  and public.workspace_allows_collaboration(workspace_id)
);

drop policy if exists "owners and creators can update groups" on public.workspace_groups;
create policy "owners and creators can update groups"
on public.workspace_groups
for update
to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (created_by = auth.uid() or public.is_workspace_owner(workspace_id))
)
with check (
  public.is_workspace_member(workspace_id)
  and (created_by = auth.uid() or public.is_workspace_owner(workspace_id))
);

drop policy if exists "owners and creators can delete groups" on public.workspace_groups;
create policy "owners and creators can delete groups"
on public.workspace_groups
for delete
to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (created_by = auth.uid() or public.is_workspace_owner(workspace_id))
);

drop policy if exists "members can read group memberships" on public.group_members;
create policy "members can read group memberships"
on public.group_members
for select
to authenticated
using (
  exists (
    select 1 from public.workspace_groups g
    where g.id = group_id and public.is_workspace_member(g.workspace_id)
  )
);

drop policy if exists "members can add themselves to groups" on public.group_members;
create policy "members can add themselves to groups"
on public.group_members
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.workspace_groups g
    where g.id = group_id and public.is_workspace_member(g.workspace_id)
  )
);

drop policy if exists "members can read tasks" on public.tasks;
create policy "members can read tasks"
on public.tasks
for select
to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can create tasks" on public.tasks;
create policy "members can create tasks"
on public.tasks
for insert
to authenticated
with check (
  author_id = auth.uid()
  and public.is_workspace_member(workspace_id)
  and public.workspace_plan_is_active(workspace_id)
);

drop policy if exists "authors and owners can update tasks" on public.tasks;
create policy "authors and owners can update tasks"
on public.tasks
for update
to authenticated
using (
  public.is_workspace_member(workspace_id)
  and public.workspace_plan_is_active(workspace_id)
  and (author_id = auth.uid() or public.is_workspace_owner(workspace_id))
)
with check (
  public.is_workspace_member(workspace_id)
  and public.workspace_plan_is_active(workspace_id)
  and (author_id = auth.uid() or public.is_workspace_owner(workspace_id))
);

drop policy if exists "authors and owners can delete tasks" on public.tasks;
create policy "authors and owners can delete tasks"
on public.tasks
for delete
to authenticated
using (
  public.is_workspace_member(workspace_id)
  and public.workspace_plan_is_active(workspace_id)
  and (author_id = auth.uid() or public.is_workspace_owner(workspace_id))
);

drop policy if exists "members can read checklist items" on public.checklist_items;
create policy "members can read checklist items"
on public.checklist_items
for select
to authenticated
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_id and public.is_workspace_member(t.workspace_id)
  )
);

drop policy if exists "members can create checklist items" on public.checklist_items;
create policy "members can create checklist items"
on public.checklist_items
for insert
to authenticated
with check (
  exists (
    select 1 from public.tasks t
    where t.id = task_id and public.is_workspace_member(t.workspace_id) and public.workspace_plan_is_active(t.workspace_id)
  )
);

drop policy if exists "members can update checklist items" on public.checklist_items;
create policy "members can update checklist items"
on public.checklist_items
for update
to authenticated
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_id and public.is_workspace_member(t.workspace_id) and public.workspace_plan_is_active(t.workspace_id)
  )
)
with check (
  exists (
    select 1 from public.tasks t
    where t.id = task_id and public.is_workspace_member(t.workspace_id) and public.workspace_plan_is_active(t.workspace_id)
  )
);

drop policy if exists "members can delete checklist items" on public.checklist_items;
create policy "members can delete checklist items"
on public.checklist_items
for delete
to authenticated
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_id and public.is_workspace_member(t.workspace_id) and public.workspace_plan_is_active(t.workspace_id)
  )
);

insert into storage.buckets (id, name, public)
values ('task-files', 'task-files', true)
on conflict (id) do nothing;
