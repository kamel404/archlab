/**
 * Architecture + metrics -> fixed diagram layout. Guided, not free-form: positions
 * come from the architecture, so the same setup always draws the same way.
 */
import { CORES, stationStatus, type Architecture, type SimResult, type StationId } from "@/engine";
import { formatPercent, formatRps } from "@/content/format";
import type { Tone } from "@/content/diagnosis";
import { STATUS_TONE } from "./tone";

export type ComponentKind = "users" | "lb" | "app" | "db" | "replica" | "cache";

export interface DiagramLine {
  label: string;
  value: string;
}

export interface DiagramNodeData extends Record<string, unknown> {
  kind: ComponentKind;
  title: string;
  subtitle?: string;
  lines: DiagramLine[];
  tone?: Tone;
}

export interface DiagramNode {
  id: string;
  position: { x: number; y: number };
  data: DiagramNodeData;
}

export interface DiagramEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  /** Replication rather than request traffic. */
  replication?: boolean;
}

const COL = 230;
const ROW = 130;
const TONE_RANK: Record<Tone, number> = { good: 0, warn: 1, bad: 2 };

function worst(...tones: (Tone | undefined)[]): Tone | undefined {
  return tones.reduce<Tone | undefined>((w, t) => (t && (!w || TONE_RANK[t] > TONE_RANK[w]) ? t : w), undefined);
}

const column = (count: number, i: number) => (i - (count - 1) / 2) * ROW;

export function layoutDiagram(arch: Architecture, result: SimResult): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const station = (id: StationId) => result.stations.find((s) => s.id === id);
  const tone = (id: StationId) => {
    const s = station(id);
    return s ? STATUS_TONE[stationStatus(s.utilization, s.blocking)] : undefined;
  };
  const busy = (id: StationId) => formatPercent(station(id)?.utilization ?? 0);

  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const n = arch.app.count;
  const hasLb = n > 1;
  let x = 0;

  nodes.push({
    id: "users",
    position: { x, y: 0 },
    data: { kind: "users", title: "Users", lines: [{ label: "Load", value: formatRps(result.rps) }] },
  });
  x += COL;

  if (hasLb) {
    nodes.push({
      id: "lb",
      position: { x, y: 0 },
      data: { kind: "lb", title: "Load balancer", lines: [{ label: "Busy", value: busy("lb") }], tone: tone("lb") },
    });
    edges.push({ id: "users-lb", source: "users", target: "lb" });
    x += COL;
  }

  const appTone = worst(tone("cpu"), tone("workers"));
  for (let i = 0; i < n; i++) {
    const id = `app-${i}`;
    nodes.push({
      id,
      position: { x, y: column(n, i) },
      data: {
        kind: "app",
        title: n > 1 ? `App server ${i + 1}` : "App server",
        subtitle: `${arch.app.size}, ${CORES[arch.app.size]} cores`,
        lines: [
          { label: "CPU", value: busy("cpu") },
          { label: "Slots", value: busy("workers") },
        ],
        tone: appTone,
      },
    });
    edges.push({ id: `${hasLb ? "lb" : "users"}-${id}`, source: hasLb ? "lb" : "users", target: id });
  }
  x += COL;

  const storage: DiagramNode[] = [];
  if (arch.cache) {
    storage.push({
      id: "cache",
      position: { x, y: 0 },
      data: { kind: "cache", title: "Cache", lines: [{ label: "Busy", value: busy("cache") }], tone: tone("cache") },
    });
  }
  const dbSubtitle = `${arch.db.size}, ${CORES[arch.db.size]} cores`;
  storage.push({
    id: "db",
    position: { x, y: 0 },
    data: {
      kind: "db",
      title: arch.db.replicas > 0 ? "Database (primary)" : "Database",
      subtitle: dbSubtitle,
      lines: [{ label: "Busy", value: busy("db-primary") }],
      tone: tone("db-primary"),
    },
  });
  for (let i = 0; i < arch.db.replicas; i++) {
    storage.push({
      id: `replica-${i}`,
      position: { x, y: 0 },
      data: {
        kind: "replica",
        title: arch.db.replicas > 1 ? `Read replica ${i + 1}` : "Read replica",
        subtitle: dbSubtitle,
        lines: [{ label: "Busy", value: busy("db-replica") }],
        tone: tone("db-replica"),
      },
    });
  }
  storage.forEach((node, i) => (node.position.y = column(storage.length, i)));
  nodes.push(...storage);

  for (let i = 0; i < n; i++) {
    const app = `app-${i}`;
    if (arch.cache) edges.push({ id: `${app}-cache`, source: app, target: "cache" });
    edges.push({ id: `${app}-db`, source: app, target: "db" });
    for (let r = 0; r < arch.db.replicas; r++) edges.push({ id: `${app}-replica-${r}`, source: app, target: `replica-${r}` });
  }
  for (let r = 0; r < arch.db.replicas; r++) {
    const target = `replica-${r}`;
    const from = r === 0 ? "db" : `replica-${r - 1}`;
    edges.push({ id: `${from}-${target}-repl`, source: from, target, sourceHandle: "down", targetHandle: "up", replication: true });
  }

  return { nodes, edges };
}
