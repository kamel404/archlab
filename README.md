# ARCHLAB

Guided, interactive scenarios that show developers when a load balancer, cache, queue or replica is worth it, and when it is just extra complexity. See [ArchLab.md](ArchLab.md) for the product and [MODEL.md](MODEL.md) for the simulation model.

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest: engine, scenarios, content, diagram layout
npm run test:e2e   # Playwright smoke tests (builds and starts the app on port 3100)
npm run lint
```

## Layout

```
src/
  engine/       pure TypeScript queueing model, no React (ESLint-enforced)
  scenarios/    scenario definitions as data, validated with Zod
  content/      all user-facing explanation text, keyed by engine codes
  components/   diagram, slider, metrics, fix options, comparison, verdict
  store/        Zustand state for the scenario player
  app/          routes: /, /scenarios/[slug]
e2e/            one Playwright smoke test per scenario
```

Adding a scenario means adding a file in `src/scenarios/` and registering it in `src/scenarios/index.ts`. The engine does not change.
