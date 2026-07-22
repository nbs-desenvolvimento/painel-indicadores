import { createTRPCReact } from "@trpc/react-query";
import type { AnyRouter } from "@trpc/server";

// Client e server são repositórios independentes — não há import do tipo
// AppRouter do server aqui. Isso custa a inferência automática de tipos do
// tRPC (autocomplete/checagem de input-output); ver DIAGNOSTICO_MIGRACAO.md.
export const trpc = createTRPCReact<AnyRouter>();
