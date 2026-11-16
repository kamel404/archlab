# ARCHLAB

### Find out what your app actually needs, before you add it.

> Guided, interactive scenarios that show developers when a load balancer, cache, queue or replica is worth it, and when it is just extra complexity.

## What ARCHLAB Is

ARCHLAB is a browser-based learning tool for system design decisions.

It is not a blank diagramming canvas and it is not interview prep. Each scenario starts with a small, working architecture (one server, one database), puts it under growing load, and lets you try fixes one at a time. After every change, ARCHLAB tells you three things:

1. **What changed:** latency, errors, utilization, monthly cost.
2. **Why it changed:** which component was the bottleneck and what the fix did to it.
3. **Was it worth it:** the improvement weighed against the added cost and operational complexity.

The question ARCHLAB answers is not "how do I scale to a million users?" It is:

**"Do I need this yet, and what does it cost me if I add it?"**

## The Problem

Many developers, especially those shipping quickly with frameworks and AI assistance, can build working applications without knowing how those applications behave under load. The usual result is one of two mistakes:

- **Under-building:** the app falls over at the first traffic spike and nobody knows which part failed.
- **Over-building:** Redis, queues, Kubernetes and three replicas for an app with 500 daily users.

Existing resources explain components one at a time. Existing simulators hand you a blank canvas and assume you already know what to draw. Neither tells you whether your own app needs the thing.

## Who It Is For

- Full-stack developers who ship apps but have never had to scale one.
- AI-assisted developers and vibe coders who want to understand what they built.
- Junior and intermediate developers building real intuition, not memorized diagrams.
- Students in software engineering and distributed systems courses.

Interview candidates can use it, but they are not the target. No scoring, no mock interviews.

## How It Works

Every scenario follows the same loop:

1. **Start small.** A fixed, working architecture is already on screen.
2. **Raise the load.** Drag the traffic slider and watch one component turn red.
3. **Read the diagnosis.** A plain-language explanation of what is saturated and why.
4. **Pick a fix.** Choose from two to four options (for example: bigger server, second server plus load balancer, add a cache).
5. **Compare.** Side-by-side before and after: latency, error rate, cost, complexity.
6. **Get the verdict.** "Worth it at this load", "works, but a cheaper fix exists", or "you did not need this yet".

The architecture diagram is interactive but guided: you choose from meaningful options instead of wiring boxes freely.

## Scenarios (MVP)

### 1. One Server Is Enough (Until It Isn't)
Start with one app server and one database. Find the load at which it actually breaks. Compare upgrading the server with adding a second one behind a load balancer.
**Teaches:** vertical vs horizontal scaling, and how far a single server really goes.

### 2. The Database Bottleneck
App server CPU is mostly idle, yet responses are slow: requests spend most of their time waiting on the database. Adding servers does nothing. Try a cache, a read replica, or query optimization, and see which one fits the read/write mix.
**Teaches:** finding the real bottleneck, cache hit rate, why "more servers" is often the wrong fix.

### 3. Make Them Wait, or Make It Async
One endpoint does slow work (email, image processing, a report). Compare handling it inline with moving it to a queue and background workers. Watch the queue backlog when workers are under-provisioned.
**Teaches:** synchronous vs asynchronous processing, and the new failure modes a queue brings.

### 4. Do You Even Need That?
The reverse scenario. Start with an over-engineered setup for a small app and remove components one at a time without breaking the latency target. Watch the monthly bill drop.
**Teaches:** recognizing overengineering. This is the scenario that most distinguishes ARCHLAB.

## "Check My App"

A short form, not an AI feature:

- Stack (for example Laravel + MySQL, Next.js + Postgres)
- Daily active users
- Rough usage pattern (read-heavy, write-heavy, has slow background tasks)

ARCHLAB converts this to an estimated peak load, shows the working, and points to the relevant scenario.

Example: 500 daily users at about 50 requests each is roughly 0.3 requests per second on average, and about 3 per second at a 10x peak. Verdict: one small server and one database, with a lot of headroom. No load balancer, no Redis.

This is rule-based in the MVP. Every number shown is labelled as an estimate with its assumptions.

## Simulation Model

The simulation is the product, so it has to be honest.

- **Analytical, not animated guesswork.** Each component is modelled as a queue with a service rate and a number of workers. Utilization, throughput and average wait come from standard queueing formulas.
- **Deterministic.** Same inputs, same outputs. No random noise in the MVP, which makes results explainable and testable.
- **Calculated vs estimated.** Throughput, utilization and saturation points are calculated. P95 latency and monthly cost are estimates and are labelled as such in the UI.
- **Assumptions are visible.** Every scenario has an "Assumptions" panel: request size, service times, cache hit rate, instance prices.
- **Stated limits.** No network partitions, no garbage-collection pauses, no noisy neighbours, no real cloud pricing. ARCHLAB teaches direction and order of magnitude, not capacity planning.

## Component Explanations

Each component that appears in a scenario (load balancer, app server, database, cache, read replica, queue, worker, CDN) has a short card:

- What it does and why it exists.
- When you need it, and the signal that tells you.
- When you do not need it.
- What it costs you in money and in operational complexity.

## MVP Scope

**In:**

- Four guided scenarios with a fixed, interactive architecture diagram.
- Load slider and two to four fix options per stage.
- Metrics: requests per second, average latency, estimated P95, error rate, utilization per component, queue backlog, estimated monthly cost.
- Bottleneck diagnosis and a worth-it verdict per change.
- Before/after comparison view.
- "Check My App" form.
- Shareable result links (state encoded in the URL).
- Progress saved in the browser.

**Out:**

- Free-form drag-and-drop canvas (planned for after validation, see Roadmap).
- Accounts, login, payments.
- AI-generated architectures or AI feedback.
- Real cloud provisioning, code generation, repository scanning.
- Team collaboration.
- Chaos and failure injection.
- Interview scoring.

## Technology Stack

| Area | Choice | Reason |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | Scenario and component pages are static and indexable, which matters for discovery. Deploys to Vercel with no backend. |
| Simulation engine | Pure TypeScript module, no React or DOM imports | The core asset. Must be unit-testable and reusable. |
| Diagram | React Flow (`@xyflow/react`) with fixed layouts | Guided diagrams now, and the free-form sandbox later reuses the same nodes. |
| State | Zustand | Small, simple, fits a single-page interactive tool. |
| UI | Tailwind CSS + shadcn/ui | Fast to build, consistent. |
| Charts | Recharts | Enough for latency and utilization curves. |
| Validation | Zod | Validates scenario definitions and URL-encoded state. |
| Tests | Vitest (engine), Playwright (one smoke test per scenario) | The engine is where correctness matters most. |
| Persistence | Local Storage + URL state | No backend in the MVP. |
| Analytics | PostHog or Plausible | Needed to measure the success criteria below. |
| Hosting | Vercel | Free tier is enough. |

No backend and no database in the MVP. If accounts or saved architectures are added later: NestJS + PostgreSQL.

## Project Structure

```
src/
  engine/            # pure TypeScript, no React
    model/           # component types, queueing math
    simulate.ts      # architecture + workload -> metrics
    diagnose.ts      # metrics -> bottleneck + explanation keys
    verdict.ts       # before/after -> worth-it verdict
    __tests__/
  scenarios/         # scenario definitions as typed data
    one-server.ts
    database-bottleneck.ts
    sync-vs-async.ts
    do-you-need-that.ts
  content/           # component cards and explanation text
  components/        # diagram, metric panels, comparison view
  app/               # routes: /, /scenarios/[slug], /check, /components/[slug]
  store/             # Zustand stores
```

Rules:

- `engine/` never imports from React, the store or the UI. Enforced with an ESLint import boundary.
- Scenarios are data, not code. Adding a scenario should not require touching the engine.
- Explanation text lives in `content/`, keyed by diagnosis codes the engine returns.

## Roadmap

**Phase 1: Engine (week 1)**
Queueing model, `simulate`, `diagnose`, `verdict`, with tests against hand-calculated cases.

**Phase 2: First scenario end to end (week 2)**
Scenario 1 with diagram, slider, fix options, comparison and verdict. This is the first thing shown publicly.

**Phase 3: Remaining scenarios and Check My App (weeks 3 to 4)**
Scenarios 2 to 4, component cards, shareable links, analytics.

**Phase 4: Launch and measure (weeks 5 to 8)**
Post it, watch the numbers, talk to users.

**After validation only:**
Free-form sandbox canvas, failure scenarios (server death, cache flush, traffic spike), AI-assisted "describe my app", accounts.

## Success Criteria

Measured over the first 30 days after launch. These are proposed targets and should be adjusted before launch, not after.

- At least 30% of visitors who start a scenario finish it.
- At least 10% of visitors come back within a week.
- At least 20 unprompted pieces of feedback, shares or requests.

If two of the three are missed, stop adding features and either change the angle or shelve the project. The engine and write-ups remain useful as portfolio work either way.

## Product Principles

**Start from the smallest thing that works.** Every scenario begins with one server.

**No component without a reason.** Nothing is added until something is visibly failing.

**Every fix has a price.** Cost and complexity are shown next to every performance gain.

**Honest numbers.** Calculated results and estimates are labelled differently, and assumptions are always one click away.

**Guided first, open later.** A blank canvas is only useful once you know what to put on it.
