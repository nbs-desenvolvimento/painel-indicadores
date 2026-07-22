import { PageSkeleton, PageToolbar } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApp, MONTH_NAMES } from "@/contexts/AppContext";
import type { ImportLog, ImportResult } from "@/lib/apiTypes";
import { downloadAuthedFile } from "@/lib/downloadFile";
import { trpcApi } from "@/lib/trpcApi";
import { CheckCircle2, Download, FileUp, Loader2, XCircle } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

interface ImporterApi {
  useUtils: () => {
    entries: { list: { invalidate: () => void } };
    dashboard: { invalidate: () => void };
    importer: { logs: { invalidate: () => void } };
  };
  importer: {
    logs: {
      useQuery: (
        input: { companyId: number },
        opts: { enabled: boolean },
      ) => { data: ImportLog[] | undefined };
    };
    importExcel: {
      useMutation: (opts: {
        onSuccess: (res: ImportResult) => void;
        onError: (e: { message: string }) => void;
      }) => {
        mutate: (input: {
          companyId: number;
          year: number;
          month: number;
          fileName: string;
          fileBase64: string;
        }) => void;
        isPending: boolean;
      };
    };
  };
}

export default function Importacao() {
  const { companyId, year, month, periodLabel } = useApp();
  const api = trpcApi as ImporterApi;
  const utils = api.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [outcome, setOutcome] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const { data: logs } = api.importer.logs.useQuery(
    { companyId: companyId ?? 0 },
    { enabled: !!companyId },
  );

  const importMutation = api.importer.importExcel.useMutation({
    onSuccess: (res) => {
      setOutcome(res);
      utils.entries.list.invalidate();
      utils.dashboard.invalidate();
      utils.importer.logs.invalidate();
      toast.success(`Importação concluída: ${res.matched.length} de ${res.totalRows} indicadores atualizados`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    if (!companyId) return;
    if (!file.name.match(/\.xlsx?$/i)) {
      toast.error("Envie um arquivo Excel (.xlsx)");
      return;
    }
    setFileName(file.name);
    setOutcome(null);
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    const base64 = btoa(binary);
    importMutation.mutate({ companyId, year, month, fileName: file.name, fileBase64: base64 });
  };

  if (!companyId) return <PageSkeleton />;

  return (
    <div className="fade-up">
      <PageToolbar title="Importar Excel" subtitle={`Importação mensal de metas e resultados — ${periodLabel}`} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card className="card-elegant border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Enviar planilha
            </CardTitle>
            <p className="text-xs text-muted-foreground leading-relaxed">
              A planilha deve conter a aba <strong>INDICADORES</strong> com as colunas de indicador, META e
              RESULTADO (mesma estrutura da planilha original). Os valores serão aplicados ao período{" "}
              <strong>{MONTH_NAMES[month - 1]}/{year}</strong> selecionado acima.
            </p>
          </CardHeader>
          <CardContent>
            <div
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-colors cursor-pointer ${
                dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/60"
              }`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleFile(f);
              }}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-10 w-10 text-accent animate-spin mb-3" />
                  <p className="font-medium">Importando {fileName}…</p>
                </>
              ) : (
                <>
                  <FileUp className="h-10 w-10 text-muted-foreground/50 mb-3" />
                  <p className="font-medium">Arraste o arquivo aqui ou clique para selecionar</p>
                  <p className="text-xs text-muted-foreground mt-1">Formato .xlsx — máx. 15 MB</p>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-4 bg-card"
              onClick={() =>
                downloadAuthedFile(
                  `/api/export/template?companyId=${companyId}`,
                  "modelo-importacao-indicadores.xlsx",
                ).catch((e) => toast.error(e.message))
              }
            >
              <Download className="h-4 w-4 mr-1.5" />
              Baixar modelo de importação
            </Button>
          </CardContent>
        </Card>

        <Card className="card-elegant border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Resultado da importação
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!outcome ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Envie uma planilha para ver o resumo da importação.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <span className="text-sm">
                      <strong>{outcome.matched.length}</strong> indicadores atualizados
                    </span>
                  </div>
                  {outcome.unmatched.length > 0 && (
                    <div className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-orange-500" />
                      <span className="text-sm">
                        <strong>{outcome.unmatched.length}</strong> não reconhecidos
                      </span>
                    </div>
                  )}
                </div>
                {outcome.unmatched.length > 0 && (
                  <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                    <p className="text-xs font-medium text-orange-800 mb-1">
                      Linhas não casadas com indicadores cadastrados:
                    </p>
                    <p className="text-xs text-orange-700">{outcome.unmatched.join("; ")}</p>
                  </div>
                )}
                <div className="max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground uppercase tracking-wide">
                        <th className="text-left py-1.5 pr-2 font-medium">Indicador</th>
                        <th className="text-right py-1.5 px-2 font-medium">Meta</th>
                        <th className="text-right py-1.5 pl-2 font-medium">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {outcome.matched.map((m) => (
                        <tr key={m.indicatorId} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">{m.indicatorName}</td>
                          <td className="py-1.5 px-2 text-right kpi-number">
                            {m.goal !== null ? m.goal.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) : "—"}
                          </td>
                          <td className="py-1.5 pl-2 text-right kpi-number">
                            {m.result !== null ? m.result.toLocaleString("pt-BR", { maximumFractionDigits: 4 }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="card-elegant border-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Histórico de importações
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma importação realizada ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                  <th className="text-left py-2 pr-2 font-medium">Data</th>
                  <th className="text-left py-2 px-2 font-medium">Arquivo</th>
                  <th className="text-center py-2 px-2 font-medium">Período</th>
                  <th className="text-center py-2 px-2 font-medium">Linhas</th>
                  <th className="text-center py-2 pl-2 font-medium">Atualizados</th>
                </tr>
              </thead>
              <tbody>
                {[...logs].reverse().map((l) => (
                  <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2 pr-2">{l.createdAt.toLocaleString("pt-BR")}</td>
                    <td className="py-2 px-2">{l.fileName || "—"}</td>
                    <td className="py-2 px-2 text-center">
                      {MONTH_NAMES[l.month - 1]}/{l.year}
                    </td>
                    <td className="py-2 px-2 text-center kpi-number">{l.totalRows}</td>
                    <td className="py-2 pl-2 text-center kpi-number">{l.matchedRows}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
