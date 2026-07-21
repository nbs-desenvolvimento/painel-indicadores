import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCQueryUtils } from "@trpc/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { AUTH_TOKEN_KEY } from "./hooks/useAuth";
import "./index.css";

const queryClient = new QueryClient();

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        const token = localStorage.getItem(AUTH_TOKEN_KEY);
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  ],
});

const trpcUtils = createTRPCQueryUtils({ queryClient, client: trpcClient });

// Sessão expirada/token inválido: descarta o token guardado para que a UI
// volte a mostrar a tela de login (não há redirect a fazer, é tudo local).
const clearStaleTokenIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (error.message !== UNAUTHED_ERR_MSG) return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  trpcUtils.auth.me.setData(undefined, null);
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    clearStaleTokenIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    clearStaleTokenIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
