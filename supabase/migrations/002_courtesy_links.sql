-- Tabela de links de cortesia (intransferível, 1 uso por link)
CREATE TABLE IF NOT EXISTS courtesy_links (
  id text PRIMARY KEY,
  plan text NOT NULL DEFAULT 'cortesia',
  duration_days int NOT NULL DEFAULT 90,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_by_email text,
  used_at timestamptz,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS courtesy_links_used_by ON courtesy_links(used_by_email);

-- RLS: qualquer um pode ler/atualizar (pra resgatar) mas só admin pode criar via service role
ALTER TABLE courtesy_links ENABLE ROW LEVEL SECURITY;

-- Pode ler (pra verificar se o link existe e não foi usado)
DROP POLICY IF EXISTS "anon can read courtesy" ON courtesy_links;
CREATE POLICY "anon can read courtesy" ON courtesy_links FOR SELECT USING (true);

-- Pode atualizar (pra marcar como usado) — apenas se ainda não foi usado
DROP POLICY IF EXISTS "anon can claim courtesy" ON courtesy_links;
CREATE POLICY "anon can claim courtesy" ON courtesy_links
  FOR UPDATE
  USING (used_by_email IS NULL OR used_by_email = (auth.jwt() ->> 'email'))
  WITH CHECK (true);

-- Inserção: apenas autenticado (admin gera)
DROP POLICY IF EXISTS "auth can insert courtesy" ON courtesy_links;
CREATE POLICY "auth can insert courtesy" ON courtesy_links
  FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
