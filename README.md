# ClassBoard v3

## O que mudou
- plano Individual Gratuito com limitações
- planos Grupo e Turma com liberação manual
- painel admin para liberar ou inativar planos
- convite por link validado no servidor
- grupos internos por plano
- contato do proprietário via Instagram
- ajustes para uso mobile

## Variáveis de ambiente
Crie um arquivo `.env.local` com:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_EMAILS=
```

### ADMIN_EMAILS
Coloque o email do administrador que poderá liberar planos manualmente.
Se tiver mais de um, separe por vírgula.

Exemplo:

```env
ADMIN_EMAILS=voce@email.com,outro@email.com
```

## Supabase
1. Crie o projeto
2. Rode `supabase/schema.sql` no SQL Editor
3. Desligue `Authentication > Providers > Email > Confirm email`
4. Crie o bucket `task-files` se ele não existir após o SQL

## Rodar localmente
```bash
npm install
npm run build
npm run dev
```

## Deploy na Vercel
Adicione as mesmas variáveis em `Settings > Environment Variables`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_EMAILS`

Depois faça novo deploy.

## Fluxo de planos
- `Individual Gratuito`: ativo imediatamente
- `Grupo`: fica pendente até o admin liberar
- `Turma`: fica pendente até o admin liberar

## Painel admin
O painel aparece para os emails definidos em `ADMIN_EMAILS`.
Nele você consegue:
- liberar plano Individual Gratuito
- liberar plano Grupo
- liberar plano Turma
- deixar pendente
- inativar
