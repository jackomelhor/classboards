# ClassBoard — versão revisada

Web app em **Next.js + TypeScript + Tailwind + Supabase**.

## O que esta versão já cobre

- login e cadastro por email e senha
- validação de email duplicado antes do cadastro
- tela de configuração inicial após o login
- dashboard escolar
- criação, edição e exclusão de tarefas
- checklist por tarefa
- prioridade e urgência por prazo
- calendário semanal
- configuração da turma
- convite por link
- anexo em tarefa usando Supabase Storage
- lembretes locais no navegador para tarefas em 3 dias, 1 dia e no dia
- grupos internos dentro da turma
- associação de tarefas a grupos
- lista de membros do workspace
- navegação mobile com barra inferior
- modal de tarefa adaptado para celular

## Antes de testar

### 1) Dependências

```bash
npm install
```

### 2) Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```env
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICA
```

### 3) Banco de dados

No Supabase, abra o **SQL Editor** e execute todo o conteúdo de `supabase/schema.sql`.

Essa versão adiciona:

- `user_profiles`
- `groups`
- `group_members`
- `tasks.group_id`
- função `email_exists(candidate_email)`
- trigger para manter perfis sincronizados com `auth.users`

### 4) Desligar o email de verificação

Isso **não é feito por código do front-end**. Você precisa desligar no painel do Supabase:

- **Authentication**
- **Providers**
- **Email**
- desligar **Confirm email**

Sem isso, o Supabase continua podendo exigir confirmação por email.

## Rodar localmente

```bash
npm run dev
```

Abra:

```bash
http://localhost:3000
```

## Teste de produção local

Antes de subir para a Vercel, rode:

```bash
npm run build
```

Se o build passar localmente, a chance de falha no deploy cai bastante.

## Deploy na Vercel

1. suba o projeto para o GitHub
2. importe o repositório na Vercel
3. configure as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. faça o deploy

## Atualizando o projeto

Depois de editar os arquivos:

```bash
git add .
git commit -m "Atualiza ClassBoard"
git push origin main
```

Se o projeto estiver ligado ao GitHub na Vercel, o deploy novo sai automaticamente.

## Observação importante

Esta versão está bem mais sólida do que a anterior, mas cobrança, assinaturas e webhooks de pagamento ainda precisam de uma camada backend dedicada antes de virar produto comercial fechado.
