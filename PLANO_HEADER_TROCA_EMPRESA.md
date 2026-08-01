# Plano: reestruturação do cabeçalho das telas + troca de empresa centralizada com confirmação

## 1. Objetivo

Três mudanças relacionadas, para aplicar em **todas as telas** do sistema:

1. **Layout do cabeçalho**: hoje toda tela tem título+subtítulo à esquerda e botões/controles à
   direita, na mesma linha. Passa a ser: título+subtítulo à esquerda (linha 1); **nome da empresa**
   à direita, no lugar onde os botões ficavam (linha 1); botões/controles numa **nova linha**, abaixo,
   ainda alinhados à direita (linha 2).
2. **Troca de empresa centralizada**: remove o seletor de empresa que hoje aparece em cada tela
   (dentro do `PageToolbar`). A troca passa a acontecer **só** em dois lugares: o dropdown da
   sidebar e a tela `/admin/empresas`. Toda troca de empresa pede confirmação via SweetAlert2,
   estilizado com a paleta/fontes do projeto.
3. **Sidebar**: o dropdown de logout/troca de empresa ganha fundo escuro (igual à sidebar), abre
   para cima (drop-up — ele já fica embaixo, mas hoje a abertura depende do espaço disponível;
   passa a ser forçada), rótulo didático "Troca de empresa" e um separador antes do item de logout.

## 2. Levantamento do estado atual

### 2.1 Dois padrões de cabeçalho hoje

**Padrão A — `PageToolbar`** (`client/src/components/shared.tsx:18-140`), usado por 11 telas:
Home, DashboardAreas, DashboardPerspectivas, DashboardObjetivos, DashboardIndicadores, Ranking,
Heatmap, Organograma, Evolucao, Lancamentos, Importacao.

Estrutura atual (linhas 75-137): uma única linha `flex flex-wrap items-start justify-between` com
título+subtítulo à esquerda e, à direita, nessa ordem: seletor de empresa (`Select`, só se
`companies.length > 1`) → seletor de mês (`Select`, oculto se `hideMonth`) → seletor de ano
(`Select`, sempre visível) → botões Excel/PDF (se `showExport`) → `children` (controles
específicos da tela, ex.: `PeriodModeToggle`, filtros de área/perspectiva/objetivo/indicador).

**Padrão B — cabeçalho manual**, duplicado em 7 telas: `CadastroAreas.tsx:166-178`,
`CadastroObjetivos.tsx:176`, `CadastroPerspectivas.tsx:159`, `CadastroIndicadores.tsx:330`,
`CadastroRegras.tsx:300`, `Usuarios.tsx:255`, `CadastroEmpresas.tsx:113-156`. Todas seguem o mesmo
esqueleto: `<div className="flex items-start justify-between mb-6"><div><h1 className="page-title
font-serif text-3xl">Título</h1><p className="text-sm text-muted-foreground mt-1">Subtítulo</p>
</div><Dialog>...<Button><Plus/> Novo X</Button>...</Dialog></div>`. Nenhuma dessas telas mostra
empresa ou período — são telas de cadastro, sempre no escopo da empresa ativa.

**Caso à parte — `Parametrizacao.tsx:202-208`**: só título+subtítulo, sem nenhum botão à direita.

### 2.2 Seletor de empresa hoje existe em dois lugares

- `PageToolbar` (`shared.tsx:82-95`) — **será removido**.
- Sidebar, dentro do dropdown de usuário (`DashboardLayout.tsx:392-434`) — lista de empresas já
  existe ali (linhas 412-424), só falta o polimento pedido (dark bg, drop-up, rótulo, separador) —
  já tem `DropdownMenuSeparator` antes do logout, só falta o rótulo "Troca de empresa" (hoje é só
  "Empresa") e forçar a abertura pra cima.
- **Novo**: `/admin/empresas` (`CadastroEmpresas.tsx`) — hoje só cadastra/edita/exclui, não permite
  trocar a empresa ativa. Vai ganhar destaque visual + botão seletor.

### 2.3 Troca de empresa hoje é direta, sem confirmação

`AppContext.setCompanyId` (`client/src/contexts/AppContext.tsx:63-66`) só seta o estado + grava no
`localStorage`. Não há nenhuma confirmação. Os hooks de dados (`useDashboardSnapshot` etc.) já são
keyed por `companyId`, então trocar o id já dispara refetch automático — não precisa mexer nisso.

### 2.4 Paleta e fontes do projeto (para estilizar o SweetAlert2)

De `client/src/index.css`:
- Fontes: `--font-sans: "Inter", ...` (texto), `--font-serif: "Cormorant Garamond", ...` (títulos,
  usada em todo `page-title`/`font-serif`).
- Cores via CSS custom properties já expostas em `:root` e `.dark` (alternam sozinhas com a classe
  `.dark` na `<html>`, aplicada pelo `ThemeContext`): `--primary` (navy no claro, dourado no
  escuro), `--primary-foreground`, `--popover`/`--popover-foreground` (fundo/texto do modal),
  `--destructive`, `--muted-foreground`, `--border`, `--radius`.
- Como o SweetAlert2 é renderizado num portal solto no `<body>`, mas as variáveis CSS estão no
  `:root`, referenciá-las diretamente (`var(--primary)` etc.) já garante tema claro/escuro
  automático, sem lógica extra em JS.
- `sweetalert2` **não está instalado** (`grep sweetalert package.json` → vazio). Precisa
  `pnpm add sweetalert2` em `client/`.

## 3. Parte A — Reestruturação do cabeçalho (duas linhas)

### 3.1 Estender `PageToolbar` (não criar um componente novo)

Único componente já cobre 11 telas; a ideia é estendê-lo para também cobrir as 8 telas do Padrão B
(7 cadastros + Parametrização), eliminando a duplicação em vez de criar um segundo componente
paralelo. Novos props:

- `hideYear?: boolean` — esconde o seletor de ano também (hoje só existe `hideMonth`). Cadastros
  não são escopados por período, então passam `hideMonth hideYear`.
- Mantém `showExport`, `exportMode`, `exportMonth`, `children` como estão.
- Remove o bloco do seletor de empresa (linhas 82-95) — vira só texto.

Novo layout interno (substitui o bloco único de `shared.tsx:75-137`):

```tsx
<div className="flex flex-col gap-3 mb-6 print:hidden">
  {/* linha 1: título/subtítulo à esquerda, nome da empresa à direita */}
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <h1 className="page-title font-serif text-3xl">{title}</h1>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
    {companyName && (
      <span className="text-sm font-medium text-muted-foreground text-right shrink-0">
        {companyName}
      </span>
    )}
  </div>

  {/* linha 2: controles, alinhados à direita (só renderiza se houver algo a mostrar) */}
  {(!hideMonth || !hideYear || showExport || children) && (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {!hideMonth && <Select .../* mês */ />}
      {!hideYear && <Select .../* ano */ />}
      {showExport && <>{/* Excel, PDF */}</>}
      {children}
    </div>
  )}
</div>
```

- `companyName` já é derivável dentro do próprio `PageToolbar` (`companies?.find(c => c.id ===
  companyId)?.name`, como já faz hoje em `shared.tsx:42`) — não precisa de prop nova, só parar de
  usá-lo para montar o `Select` e passar a usá-lo como texto.
- O `print-doc-header` (linhas 61-73, cabeçalho exclusivo de impressão) não muda — já mostra nome
  da empresa e data separadamente, fora do fluxo normal da tela.

### 3.2 Migrar as 7 telas do Padrão B para `PageToolbar`

Cada uma das 7 telas (`CadastroAreas`, `CadastroObjetivos`, `CadastroPerspectivas`,
`CadastroIndicadores`, `CadastroRegras`, `Usuarios`, `CadastroEmpresas`) troca o bloco manual:

```tsx
<div className="flex items-start justify-between mb-6">
  <div>
    <h1 className="page-title font-serif text-3xl">Áreas</h1>
    <p className="text-sm text-muted-foreground mt-1">Áreas e cargos avaliados...</p>
  </div>
  <Dialog>...<Button>Nova área</Button>...</Dialog>
</div>
```

por:

```tsx
<PageToolbar title="Áreas" subtitle="Áreas e cargos avaliados..." hideMonth hideYear>
  <Dialog>...<Button>Nova área</Button>...</Dialog>
</PageToolbar>
```

Import de `PageToolbar` some de `@/components/shared` (já importado em algumas, precisa adicionar
nas que hoje não usam). Nenhuma lógica de dados muda — só o wrapper visual.

`CadastroIndicadores.tsx:330` já usa `flex flex-wrap items-start justify-between gap-3` (levemente
diferente, mas mesmo espírito) — mesma migração.

`Usuarios.tsx:255` tem dois botões possíveis no cabeçalho (conferir se há mais de um `Dialog`
trigger ali) — ambos entram como `children` do `PageToolbar`, um do lado do outro na linha 2.

### 3.3 `Parametrizacao.tsx`

Só título/subtítulo, sem botão. Migra para `<PageToolbar title="Parametrização" subtitle="..."
hideMonth hideYear />` sem `children` — linha 2 não renderiza (nenhum dos quatro
`!hideMonth/!hideYear/showExport/children` é verdadeiro), mantendo o visual limpo de hoje, mas
agora com o nome da empresa aparecendo à direita da linha 1.

### 3.4 As 11 telas do Padrão A

Não precisam de mudança de props (a única mudança de comportamento — empresa virar texto, botões
irem pra linha 2 — já é automática dentro do próprio `PageToolbar`). Só validar visualmente depois.

## 4. Parte B — Seletor de empresa único

### 4.1 Remover de `PageToolbar`

Feito junto com a Parte A (§3.1) — o bloco `Select` de empresa (`shared.tsx:82-95`) sai; a prop
`setCompanyId`/`companies` do `useApp()` deixa de ser usada ali para montar seletor, só para o
texto do nome.

### 4.2 Sidebar (`DashboardLayout.tsx:391-434`)

Ajustes no `DropdownMenuContent` (linha 411) e itens:

- `side="top"` explícito no `DropdownMenuContent` — força abertura pra cima (drop-up), já que o
  trigger fica no rodapé da sidebar.
- Classe de fundo escuro: `className="w-56 bg-sidebar text-sidebar-foreground border-sidebar-border"`
  (hoje herda `bg-popover`, que é claro/escuro conforme o tema geral, não a paleta fixa da sidebar).
  Os itens (`DropdownMenuItem`, `DropdownMenuLabel`) usam classes utilitárias com `text-*` que
  também precisam de variantes `sidebar-*` (ex. `focus:bg-sidebar-accent
  focus:text-sidebar-accent-foreground`) pra não ficar com contraste ruim em cima do fundo escuro.
- Rótulo `DropdownMenuLabel` (linha 414-416): troca "Empresa" por **"Troca de empresa"**.
- `DropdownMenuSeparator` (linha 423) já existe antes do item de logout — mantém, só garante que
  fica visível no fundo escuro (`bg-sidebar-border` em vez do `bg-border` padrão).
- Cada `DropdownMenuItem` de empresa (linha 417-422): `onClick` deixa de chamar `setCompanyId`
  direto — passa a chamar o novo helper de confirmação (§5.2); só troca de fato se confirmado.

### 4.3 `CadastroEmpresas.tsx` — destaque + seletor

No card de cada empresa (`CadastroEmpresas.tsx:160-192`):

- **Destaque da empresa ativa**: se `c.id === companyId` (via `useApp()`, precisa importar o hook
  nessa tela — hoje ela só usa a API de empresas, não `useApp()`), aplica classe extra no `Card`
  (ex. `ring-2 ring-primary border-primary/40 bg-primary/5`, mesmo padrão de destaque já usado em
  `Ranking.tsx` pro 1º lugar do pódio: `ring-2 ring-accent/60`) + um `Badge` "Empresa ativa" no
  `CardHeader`.
- **Botão seletor**: no `CardContent` (linha 167-189), ao lado dos botões de editar/excluir, um
  botão novo:
  - Se `c.id === companyId`: sem botão (ou botão desabilitado dizendo "Ativa"), pois já é a
    selecionada.
  - Se `c.id !== companyId`: `<Button variant="outline" size="sm">Selecionar</Button>`, que chama
    o mesmo helper de confirmação do §5.2 e, se confirmado, `setCompanyId(c.id)`.

## 5. Parte C — Confirmação de troca com SweetAlert2

### 5.1 Instalar dependência

```bash
cd client && pnpm add sweetalert2
```

### 5.2 Helper único e reutilizável

Novo arquivo `client/src/lib/confirmCompanySwitch.ts`:

```ts
import Swal from "sweetalert2";

/** Confirmação de troca de empresa, com a paleta/fontes do projeto. Retorna true se confirmado. */
export async function confirmCompanySwitch(fromName: string | undefined, toName: string): Promise<boolean> {
  const result = await Swal.fire({
    title: "Trocar de empresa?",
    html: fromName
      ? `Você vai passar de <strong>${fromName}</strong> para <strong>${toName}</strong>. Todos os dados exibidos no painel vão mudar para a nova empresa.`
      : `Você vai visualizar os dados de <strong>${toName}</strong>.`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Trocar empresa",
    cancelButtonText: "Cancelar",
    reverseButtons: true,
    background: "var(--popover)",
    color: "var(--popover-foreground)",
    confirmButtonColor: "var(--primary)",
    cancelButtonColor: "var(--muted-foreground)",
    customClass: {
      popup: "swal-project-popup",
      title: "swal-project-title",
    },
  });
  return result.isConfirmed;
}
```

- `customClass` aplica classes que, via CSS global (`index.css`), fixam `font-family:
  var(--font-sans)` no corpo e `var(--font-serif)` no título, e `border-radius: var(--radius-lg)`
  no popup — replicando a identidade visual do resto do app (mesmo princípio do `.card-elegant`).
  Ex. a adicionar em `index.css`:
  ```css
  .swal-project-popup { font-family: var(--font-sans); border-radius: var(--radius-lg); }
  .swal-project-title { font-family: var(--font-serif); }
  ```
- Cores usam `var(--...)` direto (não hex fixo) — funciona igual em claro/escuro sem lógica extra,
  como explicado em §2.4.
- `confirmButtonColor: var(--primary)` casa com `buttonVariants` default do projeto
  (`bg-primary text-primary-foreground`, `button.tsx:13`).

### 5.3 Usar o helper nos dois pontos de troca

- **Sidebar** (`DashboardLayout.tsx`, item de empresa no dropdown, §4.2): `onClick={async () => {
  if (c.id === companyId) return; const ok = await confirmCompanySwitch(activeCompanyName, c.name);
  if (ok) setCompanyId(c.id); }}`.
- **CadastroEmpresas** (botão "Selecionar", §4.3): mesma lógica, usando o nome da empresa
  atualmente ativa (via `useApp()`) e o nome da empresa do card clicado.

Não precisa de nenhuma outra mudança — `setCompanyId` já cuida de persistir e disparar refetch.

## 6. Ordem de implementação (uma etapa de cada vez)

1. Instalar `sweetalert2` + criar `confirmCompanySwitch.ts` + estilos no `index.css` (Parte C) —
   testável isoladamente antes de plugar nos dois pontos de uso.
2. Estender `PageToolbar` (§3.1): duas linhas, empresa como texto, remove `Select` de empresa,
   novo prop `hideYear`. Validar nas 11 telas que já usam — nenhuma delas deve mudar de
   comportamento além do reposicionamento visual.
3. Migrar as 7 telas do Padrão B + `Parametrizacao.tsx` para `PageToolbar` (§3.2-3.3), uma a uma:
   CadastroAreas → CadastroPerspectivas → CadastroObjetivos → CadastroIndicadores →
   CadastroRegras → Usuarios → CadastroEmpresas → Parametrizacao.
4. Sidebar (§4.2): `side="top"`, fundo escuro, rótulo "Troca de empresa", plugar
   `confirmCompanySwitch`.
5. `CadastroEmpresas` (§4.3): destaque da empresa ativa + botão "Selecionar" + plugar
   `confirmCompanySwitch`.
6. Validação final (checklist §7) em todas as telas.

## 7. Checklist de validação

1. Em toda tela: título/subtítulo à esquerda (linha 1), nome da empresa à direita (linha 1),
   controles/botões à direita (linha 2). Em `Parametrizacao`, linha 2 não aparece (sem controles).
2. Nenhuma tela mostra mais seletor de empresa, exceto sidebar e `/admin/empresas`.
3. Trocar empresa pela sidebar: aparece o SweetAlert2 com nome de origem/destino corretos; cancelar
   não troca nada; confirmar troca os dados de todas as telas (refetch automático).
4. Trocar empresa por `/admin/empresas`: card da empresa ativa com destaque visual e badge; clicar
   em "Selecionar" numa empresa diferente dispara a mesma confirmação; card ativo não tem botão de
   selecionar (ou aparece desabilitado).
5. Dropdown da sidebar: fundo escuro igual à sidebar (não branco/claro), abre para cima, mostra
   "Troca de empresa" como rótulo, separador visível antes de "Sair".
6. Testar com 1 empresa só (usuário sem múltiplas empresas): dropdown da sidebar não mostra a
   seção de troca (mesma condição de hoje, `companies.length > 1`); `/admin/empresas` não teria
   sentido nesse caso mas não deve quebrar (só não há outra empresa pra selecionar).
7. Testar em modo claro e escuro: SweetAlert2 com cores/fontes coerentes com o resto do app nos
   dois temas.
8. `tsc --noEmit` e `vite build` limpos; verificação visual real no navegador (pelo usuário, dado
   que o ambiente de execução do assistente não tem browser).
