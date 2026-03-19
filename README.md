# ClassBoard — fases 1 e 2

Web app em **Next.js + TypeScript + Tailwind + Supabase**.

Este pacote inclui:

- autenticação por email e senha
- tela de configuração inicial após o login
- dashboard escolar
- criação, edição e exclusão de tarefas
- checklist por tarefa
- prioridade
- calendário semanal
- configuração da turma
- convite por link
- anexo em tarefa usando Supabase Storage
- lembrete local por notificação do navegador

---

## 1) Tecnologias

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase
- Vercel

---

## 2) Como rodar localmente

### Pré-requisitos

- Node.js 20+
- npm 10+

### Passos

```bash
npm install
cp .env.example .env.local
npm run dev
```

Abra:

```bash
http://localhost:3000
```

---

## 3) Como ativar o banco de dados no Supabase

### Etapa 1 — criar o projeto

1. Crie uma conta no Supabase.
2. Crie um novo projeto.
3. Escolha nome, região e senha do banco.
4. Aguarde o provisionamento.

### Etapa 2 — pegar as chaves

No painel do Supabase, copie:

- `Project URL`
- `anon public key`

Depois preencha o arquivo `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
```

### Etapa 3 — criar as tabelas e políticas

1. No Supabase, abra o **SQL Editor**.
2. Copie todo o conteúdo do arquivo `supabase/schema.sql`.
3. Execute o script.

Esse script cria:

- `workspaces`
- `workspace_members`
- `tasks`
- `checklist_items`
- bucket `task-files`
- políticas de segurança com RLS

### Etapa 4 — autenticação por email

No Supabase:

1. Vá em **Authentication**.
2. Ative o provider **Email**.
3. Escolha se quer confirmação por email ou não.

Para testes rápidos, você pode deixar a confirmação desligada.

### Etapa 5 — reiniciar o projeto

Depois de preencher o `.env.local`, rode novamente:

```bash
npm run dev
```

---

## 4) Como o app está organizado

```text
app/
  page.tsx
  join/[inviteCode]/page.tsx
components/
  classboard-app.tsx
  task-form.tsx
lib/
  supabase/client.ts
  types.ts
supabase/
  schema.sql
```

### Estrutura principal

- `app/page.tsx`: entrada do app
- `components/classboard-app.tsx`: autenticação, configuração inicial, dashboard e navegação
- `components/task-form.tsx`: modal para criar e editar tarefa
- `app/join/[inviteCode]/page.tsx`: rota para entrar via convite
- `lib/supabase/client.ts`: conexão com Supabase
- `supabase/schema.sql`: banco de dados, RLS e bucket

---

## 5) Fluxo já implementado

### Fase 1

- criar conta
- entrar no app
- preencher escola, turma e tipo do espaço
- ver painel
- criar tarefas
- acompanhar tarefas no dashboard
- ver calendário
- usar convite por link

### Fase 2

- prioridade
- checklist
- progresso da tarefa
- anexo
- edição e exclusão de tarefas
- notificação local no navegador

---

## 6) Como subir para a web na Vercel

### 1. subir para o GitHub

Dentro da pasta do projeto:

```bash
git init
git add .
git commit -m "Primeira versão do ClassBoard"
```

Crie um repositório no GitHub e depois rode:

```bash
git remote add origin SEU_REPOSITORIO_GIT
git branch -M main
git push -u origin main
```

### 2. importar na Vercel

1. Entre na Vercel.
2. Clique em **Add New > Project**.
3. Conecte seu GitHub.
4. Importe o repositório.
5. A Vercel detecta automaticamente que é um projeto Next.js.

### 3. adicionar variáveis de ambiente

Na Vercel, adicione estas variáveis:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Depois faça um novo deploy.

### 4. compartilhar com testers

Após o deploy, a Vercel gera uma URL pública. Você pode enviar essa URL diretamente para seus testers.

---

## 7) Como atualizar o app

### Atualizar no computador

Faça as mudanças nos arquivos.

Depois rode:

```bash
git add .
git commit -m "Atualiza onboarding e edição de tarefas"
git push origin main
```

### Atualizar na Vercel

Se o projeto já está conectado ao GitHub, a Vercel gera um novo deploy automaticamente depois do `git push`.

### Quando precisa redeploy manual

Você normalmente precisa redeployar manualmente quando:

- altera variáveis de ambiente
- muda algo no Supabase e quer testar uma nova build

---

## 8) Importante sobre contas antigas

As contas criadas na versão anterior podem já ter uma turma e tarefas salvas no banco.

Nesta versão nova:

- novos usuários entram sem tarefas pré-definidas
- o primeiro acesso pede escola, turma e tipo do espaço
- tudo fica editável

Se quiser limpar dados antigos de teste, apague as tarefas e o workspace no Supabase ou use uma conta nova.

---

## 9) Dicas de teste

Valide nesta ordem:

1. criar conta
2. entrar
3. preencher escola e turma
4. criar tarefa
5. editar tarefa
6. excluir tarefa
7. copiar link de convite
8. abrir no celular
