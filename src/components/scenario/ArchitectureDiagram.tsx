"use client";

import { Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { useMemo } from "react";
import type { Architecture, SimResult } from "@/engine";
import { layoutDiagram, type DiagramNodeData } from "./diagram-layout";
import { TONE_DOT, TONE_WORD } from "./tone";

type ComponentNode = Node<DiagramNodeData, "component">;

const TONE_BORDER = {
  good: "border-emerald-500",
  warn: "border-amber-500",
  bad: "border-red-500 shadow-[0_0_0_3px_rgba(239,68,68,0.2)]",
} as const;

function ComponentNodeView({ data }: NodeProps<ComponentNode>) {
  const border = data.tone ? TONE_BORDER[data.tone] : "border-zinc-300 dark:border-zinc-600";
  return (
    <div className={`w-44 rounded-lg border-2 bg-white px-3 py-2 text-left dark:bg-zinc-900 ${border}`}>
      <Handle type="target" position={Position.Left} id="in" className="!opacity-0" isConnectable={false} />
      <Handle type="source" position={Position.Right} id="out" className="!opacity-0" isConnectable={false} />
      <Handle type="target" position={Position.Top} id="up" className="!opacity-0" isConnectable={false} />
      <Handle type="source" position={Position.Bottom} id="down" className="!opacity-0" isConnectable={false} />
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{data.title}</span>
        {data.tone && (
          <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <span className={`h-2 w-2 rounded-full ${TONE_DOT[data.tone]}`} aria-hidden />
            {TONE_WORD[data.tone]}
          </span>
        )}
      </div>
      {data.subtitle && <div className="text-xs text-zinc-500 dark:text-zinc-400">{data.subtitle}</div>}
      <dl className="mt-1 space-y-0.5">
        {data.lines.map((line) => (
          <div key={line.label} className="flex justify-between text-xs">
            <dt className="text-zinc-500 dark:text-zinc-400">{line.label}</dt>
            <dd className="font-medium tabular-nums text-zinc-800 dark:text-zinc-200">{line.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const nodeTypes = { component: ComponentNodeView };

/** A stable key per topology, so the view re-fits when components are added or removed. */
function topologyKey(arch: Architecture): string {
  return `${arch.app.count}-${arch.db.replicas}-${arch.cache}`;
}

export function ArchitectureDiagram({ architecture, result }: { architecture: Architecture; result: SimResult }) {
  const { nodes, edges } = useMemo(() => {
    const layout = layoutDiagram(architecture, result);
    const nodes: ComponentNode[] = layout.nodes.map((n) => ({ ...n, type: "component" }));
    const edges: Edge[] = layout.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? "out",
      targetHandle: e.targetHandle ?? "in",
      animated: !e.replication && result.rps > 0,
      style: e.replication ? { strokeDasharray: "2 4" } : undefined,
    }));
    return { nodes, edges };
  }, [architecture, result]);

  return (
    // On phones the diagram keeps a readable size and scrolls sideways inside its card.
    <div className="overflow-x-auto">
    <div className="h-72 w-full min-w-[600px]" role="img" aria-label={describe(nodes)}>
      <ReactFlow
        key={topologyKey(architecture)}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        minZoom={0.3}
        maxZoom={1.2}
      />
    </div>
    </div>
  );
}

function describe(nodes: ComponentNode[]): string {
  return (
    "Architecture: " +
    nodes
      .map((n) => `${n.data.title}${n.data.tone ? ` (${TONE_WORD[n.data.tone]})` : ""}: ${n.data.lines.map((l) => `${l.label} ${l.value}`).join(", ")}`)
      .join("; ")
  );
}
