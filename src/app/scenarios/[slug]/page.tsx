import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ScenarioPlayer } from "@/components/scenario/ScenarioPlayer";
import { getScenario, SCENARIOS } from "@/scenarios";

// Unknown slugs hit notFound() below. (`dynamicParams` is not allowed with cacheComponents.)
export function generateStaticParams() {
  return SCENARIOS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/scenarios/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const scenario = getScenario(slug);
  if (!scenario) return {};
  return { title: scenario.title, description: scenario.tagline };
}

export default async function ScenarioPage({ params }: PageProps<"/scenarios/[slug]">) {
  const { slug } = await params;
  if (!getScenario(slug)) notFound();
  return <ScenarioPlayer slug={slug} />;
}
