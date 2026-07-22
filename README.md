# Painel de Gestão de Indicadores

Aplicação de gestão de indicadores (BSC): cadastro de empresas, áreas, perspectivas, objetivos,
indicadores e regras de calibragem; lançamento de metas/resultados; dashboards (geral, por área,
por perspectiva, por indicador, evolução, ranking, heatmap, organograma); importação/exportação em
Excel.

## Arquitetura

`client/` e `server/` são dois pacotes Node completamente independentes — cada um com seu próprio
`package.json`, lockfile e instalação de dependências. Não há pasta de código compartilhado; eles só
se comunicam via HTTP (tRPC sobre `/api/trpc` + duas rotas de download de Excel). Banco de dados:
PostgreSQL.

- `client/` — React + Vite + tRPC client + Tailwind. Build estático servido por nginx em produção.
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

## Rodando em desenvolvimento sem Docker

Precisa de um Postgres acessível (local ou remoto) e Node 22+.

```bash
# server
cd server
cp .env.example .env   # ajuste DATABASE_URL/JWT_SECRET (ver tabela abaixo)
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

## Variáveis de ambiente

### `server`

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Connection string do Postgres (ex.: `postgres://user:pass@host:5432/db`) |
| `JWT_SECRET` | sim | Segredo usado para assinar o token de sessão (7 dias, sem refresh) |
| `CORS_ORIGIN` | sim | Origem(ns) permitida(s) para o client, separadas por vírgula (ex.: `http://localhost:8080`) |
| `PORT` | não (default `3000`) | Porta do servidor HTTP |
| `SEED_ADMIN_EMAIL` | não (default `admin@painel.local`) | E-mail do admin criado pelo seed |
| `SEED_ADMIN_PASSWORD` | não (default `TrocarSenha123!`) | Senha inicial do admin criado pelo seed |

### `client`

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VITE_API_URL` | sim | URL base do server (ex.: `http://localhost:3000`). O Vite embute esse valor **em build-time**, não runtime — mudar a variável exige rebuildar o client. |

⚠️ **A senha do admin seedado é fixa e documentada aqui/no console do server.** Troque-a assim que
possível após o primeiro login (`Usuários` → editar → redefinir senha, ou `users.resetPassword` via
API).

## Checklist de validação end-to-end

Rodar manualmente contra o ambiente do Docker Compose (ou o modo dev):

- [ ] Login com o admin seedado.
- [ ] Criar um usuário comum via tela de Usuários, fazer login com ele.
- [ ] CRUD de empresa, área, perspectiva, indicador, objetivo, regra de calibragem.
- [ ] Lançamento manual de meta/resultado e conferência do score calculado.
- [ ] Importação de planilha Excel e conferência do log de importação.
- [ ] Renderização dos dashboards (geral, área, perspectiva, indicador, evolução, ranking, heatmap,
      organograma).
- [ ] Exportação (relatório Excel e modelo de importação).
- [ ] Reiniciar os containers (`docker compose restart` ou `down`/`up` sem `-v`) e confirmar que os
      dados persistiram.

**Pendente:** a verificação visual em navegador real (aparência do dashboard, telas de import etc.)
não foi feita pelo ambiente que preparou esta migração — ele não tem automação de browser
disponível. A camada de API/dados foi validada de ponta a ponta (login, CRUD, cálculo de score,
CORS, persistência), mas a conferência visual fica para o usuário.
