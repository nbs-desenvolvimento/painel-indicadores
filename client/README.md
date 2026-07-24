# client — Painel de Gestão por Indicadores

Front-end React + Vite que consome a API do `server/` via tRPC. Pacote Node independente — tem seu
próprio `package.json`, lockfile e instalação; não compartilha código nem tipos com o `server`
(sem monorepo/workspace, sem pasta `shared/`).

## Stack

- **React 19.2** + **Vite 7** + **TypeScript 5.9**
- **Tailwind CSS v4** (`@tailwindcss/vite`), tokens de cor em `oklch`
- **Radix UI** como base dos componentes (`src/components/ui/`, padrão shadcn/ui), ícones via
  `lucide-react`
- **`@trpc/client` + `@trpc/react-query` 11.6** sobre **`@tanstack/react-query` 5.90**, transformer
  `superjson`
- **`wouter` 3.7** para rotas (com patch próprio, ver `patches/wouter@3.7.1.patch`, aplicado via
  `pnpm.patchedDependencies` no `package.json`)
- `react-hook-form`, `recharts` (gráficos dos dashboards), `sonner` (toasts)
- `class-variance-authority` + `tailwind-merge` — utilitário `cn()` em `src/lib/utils.ts`

## Scripts

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # gera dist/
pnpm check    # tsc --noEmit
pnpm format   # prettier --write .
```

## Estrutura

```
src/
  pages/           # uma página por rota (ver tabela abaixo)
  components/
    DashboardLayout.tsx   # shell: sidebar, tela de login, layout responsivo
    shared.tsx             # componentes compartilhados entre páginas
    ui/                    # primitivas Radix/shadcn (Button, Input, Sidebar, etc.)
  contexts/
    AppContext.tsx        # estado global da aplicação
    ThemeContext.tsx      # alterna a classe `.dark` no <html>
  hooks/
    useAuth.ts             # login/logout/sessão
    useMobile.ts            # breakpoint mobile
  lib/
    env.ts                 # VITE_API_URL
    trpcApi.ts / apiHooks.ts  # cliente tRPC + hooks tipados manualmente
    apiTypes.ts             # tipos espelhados do server (não compartilhados via import)
    calcEngine.ts           # mirror do motor de cálculo do server (ver seção própria)
    downloadFile.ts         # download autenticado de arquivos binários (export Excel)
    utils.ts                # cn()
public/
  logo-painel-azul.png       # logo para fundos claros
  logo-painel-branco.png     # logo para fundos escuros
  logo-nbs-branco.png        # logo NBS para fundos escuros
  nbs_logo_cinza.png         # logo NBS para fundos claros
  _redirects                 # fallback de SPA para o Cloudflare Pages
```

## Rotas

Definidas em `src/App.tsx` com `wouter`. Itens marcados **admin** só aparecem no menu para
`user.role === "admin"` — essa restrição é só de UI (o menu é filtrado em
`DashboardLayoutContent`/`visibleGroups`); quem garante a autorização de verdade é o `server`,
por procedure do tRPC.

| Rota | Página | Admin |
|---|---|---|
| `/` | `Home` | |
| `/dashboard/areas` | `DashboardAreas` | |
| `/dashboard/perspectivas` | `DashboardPerspectivas` | |
| `/dashboard/indicadores` | `DashboardIndicadores` | |
| `/dashboard/evolucao` | `Evolucao` | |
| `/dashboard/ranking` | `Ranking` | |
| `/dashboard/heatmap` | `Heatmap` | |
| `/dashboard/organograma` | `Organograma` | |
| `/lancamentos` | `Lancamentos` (metas/resultados) | |
| `/importacao` | `Importacao` (import Excel) | |
| `/cadastros/empresas` | `CadastroEmpresas` | ✓ |
| `/cadastros/areas` | `CadastroAreas` | ✓ |
| `/cadastros/perspectivas` | `CadastroPerspectivas` | ✓ |
| `/cadastros/objetivos` | `CadastroObjetivos` | ✓ |
| `/cadastros/regras` | `CadastroRegras` (regras de calibragem) | ✓ |
| `/cadastros/indicadores` | `CadastroIndicadores` | ✓ |
| `/cadastros/parametrizacao` | `Parametrizacao` (pesos e aplicabilidade) | ✓ |
| `/admin/usuarios` | `Usuarios` | ✓ |
| `/404`, catch-all | `NotFound` | |

## Autenticação

`src/hooks/useAuth.ts` encapsula `trpc.auth.me.useQuery` (sem retry, sem refetch automático) e
`trpc.auth.login.useMutation`:

- No login bem-sucedido, o JWT vai para `localStorage["auth_token"]` e o cache de `auth.me` é
  atualizado direto (sem round-trip extra).
- `src/main.tsx` monta o `httpBatchLink` do tRPC lendo esse token a cada requisição e enviando
  `Authorization: Bearer <token>`.
- Os caches de query/mutation têm subscribers globais que detectam a mensagem de erro específica
  de sessão expirada (`UNAUTHED_ERR_MSG` em `lib/const.ts`, precisa bater exatamente com a string
  do server — não há tipo compartilhado) e, ao ocorrer, limpam o token e zeram o cache de
  `auth.me` — isso derruba a UI de volta pra tela de login automaticamente.
- Logout (`useAuth().logout`) limpa o token, zera e invalida o cache.
- `src/lib/downloadFile.ts` existe porque download de arquivo binário (exportação Excel) não pode
  usar `<a href>`/`window.open` simples (não dá pra anexar o header `Authorization`): ele faz um
  `fetch` autenticado, lê o nome do arquivo do header `Content-Disposition` e dispara um clique
  sintético em um `<a download>`.

## Layout e navegação

`src/components/DashboardLayout.tsx` decide entre duas telas conforme `useAuth()`:

**Sem usuário logado** — tela cheia (`h-screen`, sem scroll na página):
- Painel esquerdo decorativo (`hidden lg:flex`, fundo escuro `bg-sidebar`), visível só em telas
  `lg+`: logo `logo-painel-branco.png`, nome "Painel de Gestão por Indicadores", texto de
  apresentação e um crédito "Desenvolvido por" + `logo-nbs-branco.png`.
- Painel direito: formulário de login. Mostra a logo da ferramenta só quando o painel esquerdo
  está escondido (`lg:hidden`), trocando entre `logo-painel-azul.png` (tema claro) e
  `logo-painel-branco.png` (tema escuro) via classe `dark:`. Rodapé com "Desenvolvido por" +
  `nbs_logo_cinza.png` (claro) / `logo-nbs-branco.png` (escuro).

**Com usuário logado** — sidebar do shadcn/ui (`collapsible="icon"`), redimensionável por arraste
(largura salva em `localStorage["sidebar-width"]`, entre 200–480px, padrão 280px):
- Cabeçalho empilhado verticalmente: botão de recolher (ícone `PanelLeft`) → logo da ferramenta
  (`logo-painel-branco.png`) → nome da ferramenta (some quando a sidebar está recolhida).
- Conteúdo com scrollbar que só aparece no hover (classe `.scrollbar-hover`, ver design system),
  agrupado em `menuGroups` (Dashboards / Lançamentos / Cadastros / Administração), filtrados por
  `adminOnly` vs papel do usuário.
- Rodapé: avatar/nome/role do usuário com menu de logout, e abaixo, separado por uma borda sutil,
  "Desenvolvido por" + `logo-nbs-branco.png` (também some quando a sidebar está recolhida).
- Em mobile (`useIsMobile`), a sidebar vira uma barra superior fixa com botão de menu e o nome da
  página ativa, no lugar do chrome de desktop.

## Design system

Tokens de cor em `oklch` definidos em `src/index.css`, mapeados para o Tailwind via `@theme
inline`. Há um conjunto de tokens `--sidebar*` separado de `--background`/`--foreground`, para a
sidebar manter a mesma aparência (navy escuro) tanto no tema claro quanto no escuro. Fontes:
`Inter` (`--font-sans`) e `Cormorant Garamond` (`--font-serif`, usada no título da tela de login).

- **Tema escuro**: o mecanismo já existe (`ThemeContext.tsx` alterna a classe `.dark` no
  `<html>`), mas hoje o `App.tsx` monta o `ThemeProvider` com `defaultTheme="light"` e
  `switchable` no padrão `false` — ou seja, o CSS do dark mode existe e está todo pronto, mas não
  há nenhum botão exposto ao usuário final para trocar de tema ainda.
- **`.scrollbar-hover`** (`index.css`): utilitário que deixa a scrollbar transparente por padrão e
  só a revela no `:hover` (`scrollbar-color` para Firefox, `::-webkit-scrollbar-thumb` para
  Chrome/Edge). Usado no conteúdo da sidebar.
- **Impressão** (`@media print`): esconde sidebar/nav/botões e força `main`/`sidebar-inset` a
  ocupar a largura inteira — usado para exportar/imprimir as telas de dashboard em PDF.

## Cálculo de score no client

`src/lib/calcEngine.ts` é uma **cópia mantida manualmente** do motor de cálculo do `server`
(`server/calcEngine.ts`) — como os dois pacotes não compartilham código, essa lógica foi
duplicada de propósito para permitir prévia instantânea do score (ao editar meta/resultado em
`Lancamentos`, `CadastroIndicadores`, `DashboardIndicadores` e `components/shared.tsx`) sem
esperar um round-trip ao server. Reimplementa:
- `computeScore` — as 5 faixas fixas legadas de `scaleType`, com tolerância de ponto flutuante
  para reproduzir o comportamento de fórmulas do Excel original.
- `computeScoreWithRule` — score por regra de calibragem configurável, usando `direction`
  (`higher_better`/`lower_better`) para decidir se o atingimento é `resultado/meta` ou
  `meta/resultado`.
- `computeAreaScore` — agregação indicador → média por perspectiva → soma ponderada pelos pesos
  da área.

⚠️ **Se a lógica de score mudar no `server/calcEngine.ts`, replique manualmente em
`client/src/lib/calcEngine.ts`** — não há teste ou tipo compartilhado que garanta que os dois
fiquem em sincronia; a única fonte de verdade para o score persistido é o server, o client só usa
sua cópia para feedback visual imediato.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `VITE_API_URL` | sim | URL base do `server` (ex.: `http://localhost:3000`). O Vite embute esse valor **em build-time** — mudar a variável exige rebuildar o client, não tem efeito em runtime. |

Sem essa variável definida, `src/lib/env.ts` cai no fallback `http://localhost:3000`.

## Build & deploy

- **Local/Docker**: `client/Dockerfile` faz build multi-stage — `pnpm install` + `pnpm build` em
  `node:22-alpine` (recebendo `VITE_API_URL` como build ARG), depois copia `dist/` para uma
  imagem `nginx:alpine` servindo com fallback de SPA (`client/nginx.conf`:
  `try_files $uri $uri/ /index.html`).
- **Produção (Cloudflare Pages)**: build direto do repositório, sem Docker — ver o passo a passo
  completo em [`../PLANO_DEPLOY_CLOUDFLARE_RENDER_NEON.md`](../PLANO_DEPLOY_CLOUDFLARE_RENDER_NEON.md).
  Pontos chave: root directory `client`, build command `pnpm build`, output `dist`, variável de
  build `VITE_API_URL` apontando para o `server` hospedado, e o arquivo `public/_redirects`
  (`/* /index.html 200`) fazendo o papel do fallback de SPA que o `nginx.conf` faz localmente.
