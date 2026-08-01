# Painel de Gestão Baseada em Desempenho  

Aplicação de gestão de indicadores (Balanced Scorecard): cadastro de empresas, áreas (com
hierarquia/organograma), perspectivas, objetivos, indicadores e regras de calibragem; lançamento
mensal de metas e resultados com cálculo automático de score; dashboards executivos; importação e
exportação em Excel; administração de usuários com visibilidade restrita por área.

## Documentação

Este README cobre a visão geral e o fluxo de validação local. Para detalhes de cada pacote:

- **[`client/README.md`](client/README.md)** — stack de front-end, rotas, design system, variáveis
  de ambiente e build.
- **[`server/README.md`](server/README.md)** — API (tRPC), modelo de dados, motor de cálculo de
  score, controle de acesso por área, variáveis de ambiente e build.
- **[`PLANO_DEPLOY_CLOUDFLARE_RENDER_NEON.md`](PLANO_DEPLOY_CLOUDFLARE_RENDER_NEON.md)** — roteiro
  de deploy em produção (Cloudflare Pages + Render + Neon).

## Funcionalidades

- **Login local** via e-mail/senha (JWT, sem dependência de provedor OAuth externo).
- **Administração de usuários**: papéis `admin`/`user`, usuários comuns restritos a um conjunto de
  áreas liberadas pelo admin, ativação/desativação de acesso.
- **Cadastros**: empresas, áreas (hierárquicas, com organograma), perspectivas, objetivos,
  indicadores, regras de calibragem, matriz de pesos (área × perspectiva) e aplicabilidade
  (indicador × área).
- **Lançamentos**: metas e resultados mensais por indicador, manuais ou via importação de Excel.
- **Motor de cálculo de score**: por faixas fixas legadas (`scaleType`) ou por regra de calibragem
  configurável, respeitando a direção do indicador (`maior melhor` / `menor melhor`).
- **Dashboards**: visão geral, por área, por perspectiva, por indicador, evolução mensal, ranking,
  heatmap e organograma.
- **Excel**: importação de planilha de resultados (com log de linhas casadas/não casadas) e
  exportação de relatório e de modelo de importação.

## Arquitetura

`client/` e `server/` são dois pacotes Node completamente independentes — cada um com seu próprio
`package.json`, lockfile e instalação de dependências. Não há pasta de código compartilhado; eles só
se comunicam via HTTP (tRPC sobre `/api/trpc` + duas rotas de download de Excel). Banco de dados:
PostgreSQL.

- `client/` — React + Vite + tRPC client + Tailwind. Build estático servido por nginx em produção
  (ou por um host de estáticos como Cloudflare Pages).
- `server/` — Express + tRPC server + Drizzle ORM + PostgreSQL.
- `docker-compose.yml` — sobe os três serviços (`db`, `server`, `client`) para validação local.

## Rodando via Docker Compose (fluxo único de validação)

Pré-requisito: Docker + Docker Compose.

```bash
cp .env.example .env   # ajuste as senhas/segredos se quiser
docker compose up --build
```

- Client: http://localhost:8080 (ou a porta definida em `CLIENT_PORT`)
- Server: http://localhost:3000 (ou a porta definida em `SERVER_PORT`)

Na primeira subida, o `server` roda a migration do banco e o seed automaticamente (idempotente —
seguro rodar de novo em subidas seguintes). Ver aviso sobre a senha do admin seedado abaixo.

Para derrubar mantendo os dados: `docker compose down` (sem `-v`). Para apagar tudo, incluindo o
volume do Postgres: `docker compose down -v`.

Para reconstruir só um serviço depois de alterar código (ex.: `client`):

```bash
docker compose stop client && docker compose rm -f client
docker compose build --no-cache client
docker compose up -d client
```

## Rodando em desenvolvimento sem Docker

Precisa de um Postgres acessível (local ou remoto) e Node 22+.

```bash
# server
cd server
cp .env.example .env   # ajuste DATABASE_URL/JWT_SECRET (ver server/README.md)
pnpm install
pnpm migrate   # aplica as migrations existentes em drizzle/
pnpm seed      # cria o admin inicial + dados de exemplo (idempotente)
pnpm dev       # http://localhost:3000

# client (em outro terminal)
cd client
cp .env.example .env   # VITE_API_URL=http://localhost:3000
pnpm install
pnpm dev       # http://localhost:5173 (padrão do Vite)
```

## Variáveis de ambiente (resumo)

O `.env` da raiz alimenta o `docker-compose.yml` (Postgres + as duas portas publicadas). Para rodar
cada pacote fora do Docker, cada um tem seu próprio `.env` — ver as tabelas completas em
[`server/README.md`](server/README.md#variáveis-de-ambiente) e
[`client/README.md`](client/README.md#variáveis-de-ambiente).

| Variável (raiz) | Descrição |
|---|---|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Credenciais do Postgres local |
| `JWT_SECRET` | Segredo de assinatura do token de sessão |
| `CORS_ORIGIN` | Origem(ns) permitida(s) para o client |
| `SERVER_PORT` / `CLIENT_PORT` | Portas publicadas localmente |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Credenciais do admin criado pelo seed |

⚠️ **A senha do admin seedado é fixa e documentada aqui/no console do server.** Troque-a assim que
possível após o primeiro login (`Usuários` → editar → redefinir senha).

## Checklist de validação end-to-end

Rodar manualmente contra o ambiente do Docker Compose (ou o modo dev):

- [ ] Login com o admin seedado.
- [ ] Criar um usuário comum via tela de Usuários, restringir áreas, fazer login com ele e conferir
      que só enxerga o que foi liberado.
- [ ] CRUD de empresa, área, perspectiva, indicador, objetivo, regra de calibragem.
- [ ] Lançamento manual de meta/resultado e conferência do score calculado.
- [ ] Importação de planilha Excel e conferência do log de importação.
- [ ] Renderização dos dashboards (geral, área, perspectiva, indicador, evolução, ranking, heatmap,
      organograma).
- [ ] Exportação (relatório Excel e modelo de importação).
- [ ] Reiniciar os containers (`docker compose restart` ou `down`/`up` sem `-v`) e confirmar que os
      dados persistiram.

**Pendente:** verificação visual em navegador real de todas as telas após as últimas mudanças de
UI (tela de login, sidebar, indicadores de direção) — ambiente de desenvolvimento sem automação de
browser disponível. A camada de API/dados foi validada de ponta a ponta (login, CRUD, cálculo de
score, controle de acesso por área, CORS, persistência).
