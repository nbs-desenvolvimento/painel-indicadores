# Análise de Migração — Painel de Indicadores (DE: Manus AI → PARA: Server e Client separados independentes + Postgres + Docker Compose)

## 1. O que é o projeto

O projeto é um app full-stack gerado pelo template "Web App (db, user)" da Manus AI:

- **Client**: React 19 + TypeScript + Vite + Tailwind + shadcn/radix + wouter (rotas) + tRPC (React Query).
- **Server**: Node + Express + tRPC + Drizzle ORM.
- **Banco**: hoje MySQL (via `mysql2`), schema em `drizzle/schema.ts`, migrations em `drizzle/*.sql`
  — **este projeto migra para PostgreSQL** (ver seção 3.4).
- **Build**: um único `package.json` na raiz (monorepo simples), `vite build` gera `dist/public`,
  `esbuild` empacota o server em `dist/index.js`, um único processo Node serve API + estáticos.

Eu quero que client e server sejam reatorados para funcionarem de forma independente, sem nada que só funcione na Manus, a ideia é fornecer este código para um cliente hospedar o frontend em um provedor grátis (Cloudflare, Vercel, etc.) o backend em serviço pago (Hostinger, etc.) e o banco Postgres em outro serviço
Mas no momento eu quero o banco, o client e o back subindo via Docker Compose, vou entregar assim para o cliente validar, então tudo dev subir com um docker compose build up
ATENÇÃO: Não quero código shared (código que que sirva para o front e para o back, o único compartilhamento que o client deve receber do back é a URL da API no .env)

**Boa notícia:** a lógica de negócio (routers, `dashboardService`, `calcEngine`, `importService`,
`exportService`, schema do banco, testes vitest) **não depende da Manus**. Ela é 100% portável.
O acoplamento à plataforma está concentrado em poucos arquivos

## 2 Missão: Diagnóstico do estado atual

Quero que voce faça um diagnóstico completo do estado atual para nortear tomadas de decisão para realizarmos um plano de migração

Acredito que hoje o login é 100% delegado a um provedor OAuth hospedado pela Manus, ele deve ser substituido por autenticação simples via JWT e o controle de usuários deve ser feito pelo administrador

Encontre pontos de acoplamento e problemas como esse para termos um diagnóstico para nos guiar, gere o diagnóstico em .md na raiz do projeto