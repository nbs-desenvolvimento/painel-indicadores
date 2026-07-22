import { trpc } from "@/lib/trpc";

/**
 * `trpc` é tipado com AnyRouter (client não importa o tipo do router do
 * server — pacotes independentes, ver trpc.ts), o que faz o proxy do
 * createTRPCReact perder a tipagem inclusive dos métodos utilitários
 * (createClient, Provider, useUtils) e de cada namespace de procedure.
 * `trpcApi` é a única ponte de acesso solta ao proxy; o retorno de cada
 * chamada (useQuery/useMutation/etc.) é tipado explicitamente no ponto de
 * uso com os tipos de @/lib/apiTypes — não propague `any` além disso.
 */
export const trpcApi = trpc as any;
