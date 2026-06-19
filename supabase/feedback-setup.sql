-- Tabela de feedback do app (avaliação de satisfação)
-- Roda essa SQL no Supabase Dashboard → SQL Editor

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  email text,
  rating int not null check (rating between 1 and 5),
  comment text,
  student_count int default 0,
  app_version text,
  created_at timestamptz not null default now()
);

alter table feedback enable row level security;

-- Qualquer um pode INSERIR (com anon key)
create policy "anyone inserts feedback" on feedback
  for insert with check (true);

-- Só admin lê
create policy "admin reads all" on feedback
  for select using (auth.jwt() ->> 'email' = 'uanalee1@gmail.com');
