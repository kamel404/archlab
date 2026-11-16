import Link from "next/link";
import { SCENARIOS } from "@/scenarios";

const COMING_SOON = [
  { number: 2, title: "The Database Bottleneck", tagline: "The CPU is idle and responses are still slow. More servers will not help." },
  { number: 3, title: "Make Them Wait, or Make It Async", tagline: "Slow work inline, or on a queue with background workers?" },
  { number: 4, title: "Do You Even Need That?", tagline: "Remove components from an over-built setup without breaking it." },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6">
      <p className="text-sm font-semibold tracking-widest text-sky-700 dark:text-sky-400">ARCHLAB</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Find out what your app actually needs, before you add it.
      </h1>
      <p className="mt-4 max-w-2xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
        Guided scenarios that show when a load balancer, cache, queue or replica is worth it, and when it is just extra complexity.
        Start with one server, raise the load, try a fix, and get a straight answer.
      </p>

      <h2 className="mt-12 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Scenarios</h2>
      <ul className="mt-3 space-y-3">
        {SCENARIOS.map((s) => (
          <li key={s.slug}>
            <Link
              href={`/scenarios/${s.slug}`}
              className="block rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-sky-600 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-sky-500"
            >
              <span className="text-sm text-zinc-500 dark:text-zinc-400">Scenario {s.number}</span>
              <span className="mt-1 block text-lg font-semibold text-zinc-900 dark:text-zinc-100">{s.title}</span>
              <span className="mt-1 block text-zinc-600 dark:text-zinc-400">{s.tagline}</span>
              <span className="mt-3 block text-sm font-medium text-sky-700 dark:text-sky-400">Start →</span>
            </Link>
          </li>
        ))}
        {COMING_SOON.map((s) => (
          <li key={s.number} className="rounded-xl border border-dashed border-zinc-300 p-5 dark:border-zinc-700">
            <span className="text-sm text-zinc-500 dark:text-zinc-400">Scenario {s.number} · coming soon</span>
            <span className="mt-1 block text-lg font-semibold text-zinc-500 dark:text-zinc-400">{s.title}</span>
            <span className="mt-1 block text-zinc-500 dark:text-zinc-500">{s.tagline}</span>
          </li>
        ))}
      </ul>

      <p className="mt-12 text-sm text-zinc-500 dark:text-zinc-400">
        Numbers come from a queueing model with stated assumptions. ARCHLAB teaches direction and order of magnitude, not capacity
        planning.
      </p>
    </main>
  );
}
