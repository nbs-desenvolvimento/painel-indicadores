import { PageSkeleton, PageToolbar } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { fmtScore, scoreColor, useApp } from "@/contexts/AppContext";
import { trpc } from "@/lib/trpc";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface AreaNode {
  id: number;
  name: string;
  parentAreaId: number | null;
  children: AreaNode[];
  total: number | null;
}

function buildTree(
  areas: { id: number; name: string; parentAreaId: number | null }[],
  scoreMap: Map<number, number | null>,
): AreaNode[] {
  const nodes = new Map<number, AreaNode>();
  for (const a of areas) {
    nodes.set(a.id, { id: a.id, name: a.name, parentAreaId: a.parentAreaId, children: [], total: scoreMap.get(a.id) ?? null });
  }
  const roots: AreaNode[] = [];
  for (const n of Array.from(nodes.values())) {
    if (n.parentAreaId && nodes.has(n.parentAreaId) && n.parentAreaId !== n.id) {
      nodes.get(n.parentAreaId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  return roots;
}

/** Coleta o id do nó e de todos os descendentes */
function collectIds(node: AreaNode): number[] {
  return [node.id, ...node.children.flatMap(collectIds)];
}

function OrgNode({
  node,
  depth,
  selected,
  onToggle,
  collapsed,
  onCollapse,
}: {
  node: AreaNode;
  depth: number;
  selected: Set<number>;
  onToggle: (node: AreaNode, checked: boolean) => void;
  collapsed: Set<number>;
  onCollapse: (id: number) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isCollapsed = collapsed.has(node.id);
  return (
    <div className={depth > 0 ? "ml-6 border-l border-border/60 pl-4" : ""}>
      <div className="flex items-center gap-2 py-1.5 group">
        {hasChildren ? (
          <button
            onClick={() => onCollapse(node.id)}
            className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground shrink-0"
          >
            {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <Checkbox
          checked={selected.has(node.id)}
          onCheckedChange={(v) => onToggle(node, v === true)}
          className="shrink-0"
        />
        <div
          className={`flex items-center justify-between gap-3 flex-1 rounded-md border px-3 py-1.5 transition-colors ${
            selected.has(node.id) ? "border-primary/40 bg-primary/5" : "border-border/60 bg-card"
          }`}
        >
          <span className="text-sm font-medium truncate">{node.name}</span>
          <span
            className="kpi-number text-sm font-semibold shrink-0"
            style={{ color: node.total !== null ? scoreColor(node.total) : undefined }}
          >
            {node.total !== null ? fmtScore(node.total) : "—"}
          </span>
        </div>
      </div>
      {hasChildren && !isCollapsed && (
        <div>
          {node.children.map((c) => (
            <OrgNode
              key={c.id}
              node={c}
              depth={depth + 1}
              selected={selected}
              onToggle={onToggle}
              collapsed={collapsed}
              onCollapse={onCollapse}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Organograma() {
  const { companyId, year, month } = useApp();
  const { data: snap, isLoading } = trpc.dashboard.snapshot.useQuery(
    { companyId: companyId ?? 0, year, month },
    { enabled: !!companyId },
  );
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  const tree = useMemo(() => {
    if (!snap) return [];
    const scoreMap = new Map<number, number | null>(snap.areaScores.map((a) => [a.areaId, a.total]));
    return buildTree(
      snap.areas.map((a) => ({ id: a.id, name: a.name, parentAreaId: (a as { parentAreaId?: number | null }).parentAreaId ?? null })),
      scoreMap,
    );
  }, [snap]);

  if (isLoading || !companyId) return <PageSkeleton />;
  if (!snap) return <PageSkeleton />;

  const scoreByArea = new Map(snap.areaScores.map((a) => [a.areaId, a]));

  // Ao marcar um nó, marca também todos os subordinados; ao desmarcar, remove todos
  const handleToggle = (node: AreaNode, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of collectIds(node)) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const handleCollapse = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedAreas = snap.areaScores.filter((a) => selected.has(a.areaId));
  const chartData = selectedAreas.map((a) => ({
    name: a.areaName,
    total: a.total,
  }));
  const avg =
    selectedAreas.length > 0 ? selectedAreas.reduce((s, a) => s + a.total, 0) / selectedAreas.length : null;

  return (
    <div className="fade-up">
      <PageToolbar title="Organograma" subtitle="Hierarquia das áreas com o desempenho do período" showExport />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6 print-block">
        <Card className="card-elegant border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Estrutura organizacional
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Marque uma diretoria para selecioná-la junto com todos os seus subordinados. Configure a
              subordinação de cada área no cadastro de áreas.
            </p>
          </CardHeader>
          <CardContent>
            {tree.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma área cadastrada.</p>
            ) : (
              <div className="max-h-[560px] overflow-y-auto pr-2">
                {tree.map((n) => (
                  <OrgNode
                    key={n.id}
                    node={n}
                    depth={0}
                    selected={selected}
                    onToggle={handleToggle}
                    collapsed={collapsed}
                    onCollapse={handleCollapse}
                  />
                ))}
              </div>
            )}
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set(snap.areas.map((a) => a.id)))}
              >
                Selecionar todas
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                Limpar seleção
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="card-elegant border-0">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Resultado das áreas selecionadas
            </CardTitle>
            {avg !== null && (
              <p className="text-xs text-muted-foreground">
                {selectedAreas.length} área(s) selecionada(s) — média simples:{" "}
                <span className="font-semibold" style={{ color: scoreColor(avg) }}>
                  {fmtScore(avg)}
                </span>
              </p>
            )}
          </CardHeader>
          <CardContent>
            {selectedAreas.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
                Selecione áreas no organograma ao lado para comparar os resultados.
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 44)}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                    <XAxis
                      type="number"
                      domain={[0, 1.2]}
                      tickFormatter={(v) => `${Math.round(v * 100)}%`}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={180}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      formatter={(v: number) => [fmtScore(v), "Desempenho"]}
                      contentStyle={{ borderRadius: 8, fontSize: 12 }}
                    />
                    <ReferenceLine x={1} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                    <Bar dataKey="total" radius={[0, 4, 4, 0]} maxBarSize={22}>
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={scoreColor(d.total)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-muted-foreground text-xs uppercase tracking-wide">
                        <th className="text-left py-2 pr-2 font-medium">Área</th>
                        {snap.perspectives.map((p) => (
                          <th key={p.id} className="text-center py-2 px-2 font-medium">
                            {p.name}
                          </th>
                        ))}
                        <th className="text-center py-2 pl-2 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedAreas.map((a) => {
                        const full = scoreByArea.get(a.areaId);
                        return (
                          <tr key={a.areaId} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-2 pr-2 font-medium">{a.areaName}</td>
                            {snap.perspectives.map((p) => {
                              const ps = full?.perspectives.find((x) => x.perspectiveId === p.id);
                              return (
                                <td key={p.id} className="py-2 px-2 text-center kpi-number text-muted-foreground">
                                  {ps ? fmtScore(ps.weighted) : "—"}
                                </td>
                              );
                            })}
                            <td
                              className="py-2 pl-2 text-center kpi-number font-semibold"
                              style={{ color: scoreColor(a.total) }}
                            >
                              {fmtScore(a.total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
