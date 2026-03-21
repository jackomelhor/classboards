-- ClassBoard - schema ampliado
-- Execute tudo no SQL Editor do Supabase.
-- Depois, no painel do Supabase, desligue Authentication > Providers > Email > Confirm email.

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
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
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

create table if not exists public.groups (
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
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

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
  created_at timestamptz not null default now()
);

alter table public.tasks
  add column if not exists group_id uuid references public.groups(id) on delete set null;

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
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

alter table public.user_profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
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
using (
  public.is_workspace_member(id)
  or owner_id = auth.uid()
);

drop policy if exists "authenticated users can create workspace" on public.workspaces;
create policy "authenticated users can create workspace"
on public.workspaces
for insert
with check (auth.uid() = owner_id);

drop policy if exists "owners can update own workspace" on public.workspaces;
create policy "owners can update own workspace"
on public.workspaces
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "owners can delete own workspace" on public.workspaces;
create policy "owners can delete own workspace"
on public.workspaces
for delete
using (owner_id = auth.uid());

drop policy if exists "members can read membership rows" on public.workspace_members;
create policy "members can read membership rows"
on public.workspace_members
for select
using (
  user_id = auth.uid()
  or public.is_workspace_member(workspace_id)
);

drop policy if exists "authenticated users can join a workspace as themselves" on public.workspace_members;
create policy "authenticated users can join a workspace as themselves"
on public.workspace_members
for insert
with check (user_id = auth.uid());

drop policy if exists "owners can remove memberships" on public.workspace_members;
create policy "owners can remove memberships"
on public.workspace_members
for delete
using (
  exists (
    select 1 from public.workspaces w
    where w.id = workspace_id and w.owner_id = auth.uid()
  )
  or user_id = auth.uid()
);

drop policy if exists "members can read groups" on public.groups;
create policy "members can read groups"
on public.groups
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can create groups" on public.groups;
create policy "members can create groups"
on public.groups
for insert
with check (
  public.is_workspace_member(workspace_id)
  and created_by = auth.uid()
);

drop policy if exists "owners and creators can update groups" on public.groups;
create policy "owners and creators can update groups"
on public.groups
for update
using (
  public.is_workspace_member(workspace_id)
  and (
    created_by = auth.uid()
    or exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  )
)
with check (
  public.is_workspace_member(workspace_id)
  and (
    created_by = auth.uid()
    or exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  )
);

drop policy if exists "owners and creators can delete groups" on public.groups;
create policy "owners and creators can delete groups"
on public.groups
for delete
using (
  public.is_workspace_member(workspace_id)
  and (
    created_by = auth.uid()
    or exists (
      select 1 from public.workspaces w
      where w.id = workspace_id and w.owner_id = auth.uid()
    )
  )
);

drop policy if exists "members can read group members" on public.group_members;
create policy "members can read group members"
on public.group_members
for select
using (
  exists (
    select 1 from public.groups g
    where g.id = group_id and public.is_workspace_member(g.workspace_id)
  )
);

drop policy if exists "members can join groups" on public.group_members;
create policy "members can join groups"
on public.group_members
for insert
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.groups g
    where g.id = group_id and public.is_workspace_member(g.workspace_id)
  )
);

drop policy if exists "members can leave groups" on public.group_members;
create policy "members can leave groups"
on public.group_members
for delete
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.groups g
    join public.workspaces w on w.id = g.workspace_id
    where g.id = group_id and w.owner_id = auth.uid()
  )
);

drop policy if exists "members can read tasks" on public.tasks;
create policy "members can read tasks"
on public.tasks
for select
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can create tasks" on public.tasks;
create policy "members can create tasks"
on public.tasks
for insert
with check (
  public.is_workspace_member(workspace_id)
  and author_id = auth.uid()
);

drop policy if exists "members can update tasks" on public.tasks;
create policy "members can update tasks"
on public.tasks
for update
using (public.is_workspace_member(workspace_id))
with check (public.is_workspace_member(workspace_id));

drop policy if exists "members can delete tasks" on public.tasks;
create policy "members can delete tasks"
on public.tasks
for delete
using (public.is_workspace_member(workspace_id));

drop policy if exists "members can read checklist" on public.checklist_items;
create policy "members can read checklist"
on public.checklist_items
for select
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_id and public.is_workspace_member(t.workspace_id)
  )
);

drop policy if exists "members can create checklist" on public.checklist_items;
create policy "members can create checklist"
on public.checklist_items
for insert
with check (
  exists (
    select 1 from public.tasks t
    where t.id = task_id and public.is_workspace_member(t.workspace_id)
  )
);

drop policy if exists "members can update checklist" on public.checklist_items;
create policy "members can update checklist"
on public.checklist_items
for update
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_id and public.is_workspace_member(t.workspace_id)
  )
)
with check (
  exists (
    select 1 from public.tasks t
    where t.id = task_id and public.is_workspace_member(t.workspace_id)
  )
);

drop policy if exists "members can delete checklist" on public.checklist_items;
create policy "members can delete checklist"
on public.checklist_items
for delete
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_id and public.is_workspace_member(t.workspace_id)
  )
);

insert into storage.buckets (id, name, public)
values ('task-files', 'task-files', true)
on conflict (id) do nothing;

drop policy if exists "authenticated users can upload task files" on storage.objects;
create policy "authenticated users can upload task files"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'task-files');

drop policy if exists "public can read task files" on storage.objects;
create policy "public can read task files"
on storage.objects
for select
to public
using (bucket_id = 'task-files');

drop policy if exists "users can update own task files" on storage.objects;
create policy "users can update own task files"
on storage.objects
for update
to authenticated
using (bucket_id = 'task-files' and owner = auth.uid())
with check (bucket_id = 'task-files' and owner = auth.uid());

drop policy if exists "users can delete own task files" on storage.objects;
create policy "users can delete own task files"
on storage.objects
for delete
to authenticated
using (bucket_id = 'task-files' and owner = auth.uid());
