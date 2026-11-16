import { describe, expect, it } from "vitest";
import { simulate, DEFAULT_ASSUMPTIONS, type Architecture } from "@/engine";
import { layoutDiagram } from "../diagram-layout";

const arch = (patch: Partial<Architecture>): Architecture => ({
  app: { size: "small", count: 1 },
  db: { size: "small", replicas: 0 },
  cache: false,
  ...patch,
});

const layout = (a: Architecture, rps = 100) => layoutDiagram(a, simulate(a, DEFAULT_ASSUMPTIONS, rps));

describe("layoutDiagram", () => {
  it("draws one server without a load balancer", () => {
    const { nodes, edges } = layout(arch({}));
    expect(nodes.map((n) => n.id)).toEqual(["users", "app-0", "db"]);
    expect(edges.map((e) => `${e.source}>${e.target}`)).toEqual(["users>app-0", "app-0>db"]);
  });

  it("adds a load balancer in front of two servers", () => {
    const { nodes, edges } = layout(arch({ app: { size: "small", count: 2 } }));
    expect(nodes.map((n) => n.id)).toEqual(["users", "lb", "app-0", "app-1", "db"]);
    expect(edges.filter((e) => e.source === "lb").map((e) => e.target)).toEqual(["app-0", "app-1"]);
    const [a0, a1] = nodes.filter((n) => n.data.kind === "app");
    expect(a0.position.y).toBe(-a1.position.y);
  });

  it("draws cache and replicas with replication edges", () => {
    const { nodes, edges } = layout(arch({ cache: true, db: { size: "small", replicas: 1 } }));
    expect(nodes.map((n) => n.id)).toContain("cache");
    expect(edges.find((e) => e.replication)).toMatchObject({ source: "db", target: "replica-0" });
  });

  it("colours the overloaded server red", () => {
    const { nodes } = layout(arch({}), 250);
    expect(nodes.find((n) => n.id === "app-0")!.data.tone).toBe("bad");
    expect(nodes.find((n) => n.id === "users")!.data.tone).toBeUndefined();
  });
});
