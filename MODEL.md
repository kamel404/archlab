# ARCHLAB Simulation Model

The spec for `src/engine/`. Every number the UI shows comes from the rules in this file. If the engine and this file disagree, one of them is a bug.

Expected values in §13 were produced by `scripts/model-reference.mjs`, a throwaway oracle written while drafting this spec. The engine is a clean TypeScript implementation; the oracle exists only to cross-check it.

---

## 1. Conventions

- Time in **seconds** inside the engine, shown as milliseconds in the UI.
- Load in **requests per second (rps)**.
- Money in **USD per month**, from a fictional price table (§8).
- Every output is tagged `calculated` or `estimate` (§5). The UI must render the two differently.
- The engine is **deterministic**: no randomness, no clock, no I/O.

---

## 2. The station: M/M/c/K

Every component is one or more *stations*. A station has:

| Symbol | Meaning |
|---|---|
| `λ` | arrival rate (rps) |
| `S` | mean service time (s), so `μ = 1/S` |
| `c` | parallel servers (cores, worker slots) |
| `K` | max requests in the station, waiting + in service |

Arrivals when the station already holds `K` requests are **rejected**. This is what makes overload computable: past saturation, a station drops requests instead of producing infinite wait.

### 2.1 Choosing K from a timeout

```
K = c + clamp(T · c / S, 1, 2000)
```

`T` is the queue timeout, default **1 s**. A request that joins a queue of `q` requests waits about `q / (c·μ)`, so this K rejects roughly the requests that would wait longer than `T`. The 2000 cap keeps very fast stations (cache, load balancer) cheap to compute; it has no visible effect because their queues never fill in any scenario.

**K is not floored.** A fractional K is solved at `floor(K)` and `floor(K) + 1`, and every output is interpolated linearly between the two. This matters for the worker pool, whose K depends on its hold time `H`. With an integer K, mean latency jittered up and down by about 0.5% in deep overload, and the "latency never decreases as load rises" property failed. With a constant K the jitter disappeared, which confirmed the cause.

### 2.2 State probabilities

With offered load `a = λ / μ` and `ρ = a / c`:

```
p_n ∝ a^n / n!                    for 0 ≤ n ≤ c
p_n ∝ (a^c / c!) · ρ^(n−c)         for c < n ≤ K
```

Normalise so the `p_n` sum to 1. Compute the weights iteratively (`w_n = w_{n−1} · a/min(n,c)`), never with factorials directly.

### 2.3 Outputs (all `calculated`)

| Output | Formula |
|---|---|
| Blocking probability | `P_block = p_K` |
| Throughput | `λ_eff = λ · (1 − P_block)` |
| Mean number in station | `L = Σ n · p_n` |
| Mean response time | `R = L / λ_eff` (Little's law) |
| Mean wait | `Wq = R − S` |
| Utilization (busy fraction) | `U = λ_eff · S / c`, always ≤ 1 |
| Offered load | `ρ = λ · S / c`, can exceed 1, shown as "demand" |
| P(wait > 0) | `Σ_{n=c}^{K−1} p_n / (1 − P_block)` |

### 2.4 P95 of a station

An admitted arrival sees `n` requests with probability `π_n = p_n / (1 − P_block)`, for `n < K`.

- If `n < c`, it waits 0 and its response is `Exp(μ)`.
- If `n ≥ c`, it waits `Erlang(k, θ)` with `k = n − c + 1` and `θ = c·μ`, then takes `Exp(μ)` service.

**Numerically stable method (required).** Write the service time as a geometric number of `Exp(θ)` phases: `Exp(μ) = Erlang(N, θ)` with `N ~ Geometric(q = 1/c)` on {1, 2, …}. A queued response is then `Erlang(k + N, θ)`, so the response CDF is a mixture with only positive terms:

```
F(t) = Σ_{n<c} π_n · (1 − e^{−μt})
     + Σ_{n≥c} π_n · Σ_{j≥1} q(1−q)^{j−1} · G(k + j, θ, t)
```

`G(m, θ, t) = P(Erlang(m, θ) ≤ t) = 1 − P(Poisson(θt) < m)`. Compute the Poisson terms in log space so `e^{−θt}` does not underflow. Truncate the `j` sum when `(1−q)^j < 1e−12`. P95 is the smallest `t` with `F(t) ≥ 0.95`, found by bisection.

`P95_wait` uses the same mixture without the service phases (`G(k, θ, t)` only), and is 0 when `P(wait > 0) < 0.05`.

> **Do not** use the closed form `G_k^θ(t) − e^{−μt}(θ/(θ−μ))^k · G_k^{θ−μ}(t)`. It subtracts two huge numbers. For M/M/2 at ρ = 0.75 it returned 91.6 ms and 125.9 ms on two runs, against an exact 64.8 ms.

P95 is computed **once, after the solve in §4 converges**, never inside the solve loop. The CDF tables are built lazily for the same reason.

Two implementation details keep this fast without changing the result:
- Queue lengths with weight below 1e−15 are skipped, so the Erlang tables only go as far as queue lengths that matter.
- The inner geometric sum uses the recursion `S_k = q·G(k+1) + (1−q)·S_{k+1}`, which is O(K + J) instead of O(K·J).

---

## 3. Architecture topology

An architecture is data: which components exist and their sizes. The engine supports these components.

### 3.1 Load balancer
One station: `c = 4`, `S = 0.25 ms` (capacity 16,000 rps). Present only when there are 2+ app servers. Splits load evenly: each of `N` app servers gets `λ / N`.

### 3.2 App server
Two coupled stations per server.

- **CPU:** `c = cores`, `S = S_cpu` (default 10 ms), K from §2.1.
- **Worker pool:** `c = W` (default `8 × cores`). Each request holds a worker for its whole life inside the server:

```
H = R_cpu + R_downstream
```

The worker pool is an M/M/W/K station with arrival rate `λ / N` and service time `H`. This is the admission gate: requests rejected here never reach the CPU or the database.

The UI shows **both** CPU utilization and worker utilization. They answer different questions: "is the CPU busy?" and "are requests piling up inside the server?"

### 3.3 Downstream time per request

Per admitted request, with read fraction `r`, write fraction `1 − r`, and cache hit rate `h` (0 when there is no cache):

```
R_downstream = r · ( R_cache + (1 − h) · R_db_read ) + (1 − r) · R_db_primary
```

`R_cache` is 0 when there is no cache.

### 3.4 Database
- **Primary:** `c = cores`, service times `S_read` (default 4 ms) and `S_write` (default 8 ms).
- **Read replicas** (`n_rep` ≥ 0): same size as the primary. Database reads are split evenly across the primary and the replicas. Writes go only to the primary.

```
reads per node    = N · x · r · (1 − h) / (1 + n_rep)
λ_primary         = reads per node + N · x · (1 − r)
λ_replica         = reads per node
R_db_read         = (R_primary + n_rep · R_replica) / (1 + n_rep)
```

`x` is the admitted rate per app server (§4). The database is **shared**: it sees the traffic of all `N` app servers.

A station with mixed request types uses the weighted mean service time `S_mix = Σ λ_i S_i / Σ λ_i`. This is an approximation and is listed in §12.

### 3.5 Cache
One shared station: `c = 2`, `S = 0.5 ms`. Arrival rate = all reads from all servers (`N · x · r`). Hit rate `h` is a scenario assumption the user can adjust (default 0.8). Hits stop at the cache. Misses continue to the database.

### 3.6 Queue and job workers
Used only in async mode (§6).

---

## 4. Solving the network

The worker pool's service time `H` depends on CPU and database response times. Those depend on how many requests the worker pool admits. That's a circular dependency.

Let `x` be the admitted rate per app server. Define:

```
g(x) = (λ / N) · (1 − P_block_worker(H(x)))
```

`g` is decreasing in `x`: more admitted traffic means longer `H`, which means more blocking. So `x = g(x)` has exactly one solution in `[0, λ/N]`. Find it by **bisection on `x − g(x)`**: 100 iterations, deterministic.

> **Do not** use plain fixed-point iteration (`x ← g(x)`). Near saturation it oscillates between "everything admitted, H huge" and "almost nothing admitted, H tiny". At 250 rps on a small server it settled on CPU 8% busy with no errors, which is nonsense.

Order of evaluation inside `g(x)`: CPU, database (primary, replicas), cache, then `H`, then the worker pool.

A consequence that is correct, not a bug: under overload, CPU utilization tops out at about 94%, not 100%. With 16 workers and an 80 ms hold time, the worker pool caps throughput at `16 / 0.0855 ≈ 187 rps` just before the CPU's 200 rps.

---

## 5. Architecture-level metrics

| Metric | Formula | Label |
|---|---|---|
| Throughput | `λ · (1 − error rate)` | calculated |
| Error rate | `1 − (1−Pb_lb)(1−Pb_worker)(1−Pb_cpu)(1 − f_db·Pb_db)(1 − f_cache·Pb_cache)` | calculated |
| Mean latency | `R_lb + Wq_worker + H` | calculated |
| P95 latency | `P95_lb + P95_wait,worker + P95_cpu + P95_db + P95_cache` | **estimate** (upper bound) |
| Utilization per station | §2.3 | calculated |
| Demand per station | offered load if nothing upstream rejected requests (can exceed 1) | calculated |
| Saturation point | lowest load where the SLO fails (§9.2) | calculated |
| Monthly cost | §8 | **estimate** |

- CPU, database and cache only see traffic the worker pool admits, so their own `ρ` is capped. Their reported **demand** is scaled back up by `(λ/N) / x`. Otherwise an overloaded server would show CPU demand 0.95 instead of 1.725, hiding the "you are asking for 170% of a CPU" signal.
- `f_db = r·(1−h) + (1−r)` and `f_cache = r` are the fractions of requests that touch each station. `Pb_db` is the worse of primary and replica. `P95_db` is the worse of primary and replica.
- Error composition and mean latency assume stations are independent. Under the "calculated" label, the tooltip says "calculated from the model".
- End-to-end P95 sums per-station P95s. Real P95 is lower, because the slowest moments at different stations rarely coincide. That's why it's labelled as an upper-bound estimate.

---

## 6. Async mode (Scenario 3)

### 6.1 Inline
The slow work runs on the app CPU. With slow-request fraction `f` and job time `S_job`:

```
S_cpu,mix = (1 − f) · S_cpu + f · S_job
```

Everything else follows §3–§5.

### 6.2 Queued
The app does a short enqueue instead: `S_cpu,mix = (1 − f) · S_cpu + f · (S_cpu + S_enqueue)`, with `S_enqueue` = 2 ms. Jobs arrive at the job workers at `λ_jobs = f · λ`.

Job workers: `n_inst` instances × 2 slots, each job takes `S_job`. Capacity `C = 2 · n_inst / S_job` jobs per second.

The backlog is a **time-stepped fluid model**: `dt = 1 s`, and the load profile is piecewise constant (set by the scenario).

```
processed(t)  = min(backlog(t) + λ_jobs(t)·dt, C·dt)
backlog(t+dt) = backlog(t) + λ_jobs(t)·dt − processed(t)
job delay(t)  = backlog(t) / C + S_job
```

When the backlog is 0 and `λ_jobs < C`, job delay is the M/M/c (no-limit) mean response at `λ_jobs` instead.

Outputs: backlog over time, peak backlog, peak job delay, time until the backlog passes a threshold, and drain time once load drops. All are `calculated`. The queue itself has no size limit in the MVP.

---

## 7. Diagnosis

`diagnose()` returns codes and data, never sentences. Text lives in `src/content/`, keyed by code.

**Request-time share** of station `i`: `share_i = f_i · R_i / H`. It answers "where does a request spend its time?"

Status colours: green `U < 0.70`, amber `0.70 ≤ U < 0.85`, red `U ≥ 0.85` or `P_block ≥ 1%`.

Rules are evaluated in order, and the first match wins. The two async codes come first: an inline-overloaded server also has an exhausted worker pool, and "your slow work is eating the CPU" is the more useful thing to say.

| Code | Condition | Payload |
|---|---|---|
| `JOB_BACKLOG_GROWING` | queued mode and `λ_jobs > C` | growth rate |
| `INLINE_SLOW_WORK` | SLO missed, inline mode, and slow jobs are > 50% of CPU time | job share |
| `WORKER_POOL_EXHAUSTED` | worker U ≥ 0.95 | the station with the largest share of H (the cause) |
| `CPU_BOUND` | SLO missed and CPU has the largest share | CPU U, share |
| `DB_BOUND` | SLO missed and DB has the largest share | DB U, share, CPU U (to show "CPU idle") |
| `CACHE_BOUND` | SLO missed and cache has the largest share | cache U |
| `APPROACHING_LIMIT` | SLO met and some station U ≥ 0.70 | that station, saturation point |
| `HEALTHY` | otherwise | headroom ratio = saturation point / current load |

Example (Scenario 2 at 45 rps): `DB_BOUND`, DB U = 0.83, DB share = 92%, CPU U = 0.23. Text: "Your app CPU is 78% idle. Requests spend 92% of their time waiting on the database." (77.5% idle, rounded.)

---

## 8. Cost and complexity

**Prices are fictional** and labelled as such in the UI. They're chosen to be the right order of magnitude, not to match any provider.

| Component | Size | Cores | $/month |
|---|---|---|---|
| App server | small / medium / large | 2 / 4 / 8 | 20 / 40 / 80 |
| Database (primary or replica) | small / medium / large | 2 / 4 / 8 | 30 / 60 / 120 |
| Load balancer | – | – | 20 |
| Cache | – | – | 15 |
| Queue | – | – | 5 |
| Job worker instance | – | 2 slots | 20 |

Upsizing a server scales `cores` (and so `W`). Service times stay the same.

**Complexity points** (shown next to cost):

| Change | Points |
|---|---|
| Bigger instance | 0 |
| Load balancer (horizontal scaling) | 1, plus it requires stateless app servers |
| Read replica | 2 |
| Cache | 2 |
| Queue + job workers | 3 |
| Query optimization | 0, and $0, but labelled "costs engineering time" |

---

## 9. Verdict

### 9.1 Rules
Each scenario stage defines an **SLO**: default P95 < 300 ms and error rate < 1%. The engine evaluates **every** option in the stage, not just the one the user picked. Options that meet the SLO are ranked by cost first, then complexity.

Rules are evaluated in order:

| Code | Condition |
|---|---|
| `NOT_NEEDED_YET` | The before architecture already met the SLO. Payload: the before architecture's saturation point. |
| `DID_NOT_FIX` | The after architecture misses the SLO. Payload: the after diagnosis. |
| `WORTH_IT` | It meets the SLO and is the top-ranked option. |
| `CHEAPER_FIX_EXISTS` | It meets the SLO, but another option ranks higher. Payload: that option. |

### 9.2 Saturation point
The lowest whole-number load (rps) where the architecture misses the SLO. Found by integer bisection over `[1, scenario max]`; `null` when the SLO still holds at the scenario max. Missing the SLO is assumed to be monotone in load, and a test checks that (§13.4). Computed when the slider stops moving, not on every frame.

---

## 10. Check My App

```
average rps = DAU × requests per user per day / 86,400
peak rps    = average rps × peak factor
```

Defaults: 50 requests per user per day, peak factor 10. Both are **editable** inputs, not just labelled ones, because they decide the whole answer. Peak rps is compared with the saturation point of the Scenario 1 baseline (≈185 rps) to give a headroom ratio and a pointer to the relevant scenario.

---

## 11. Default assumptions

Every value below is shown in the scenario's Assumptions panel.

| Assumption | Default |
|---|---|
| App CPU time per request `S_cpu` | 10 ms |
| Workers per core | 8 |
| DB read / write time | 4 ms / 8 ms |
| Read fraction | 0.9 |
| Cache service time / hit rate | 0.5 ms / 0.8 |
| LB service time | 0.25 ms |
| Queue timeout `T` | 1 s |
| Enqueue time | 2 ms |
| SLO | P95 < 300 ms, errors < 1% |

Scenario overrides: Scenario 2 sets `S_read = 40 ms` (a slow, unindexed query). Query optimization brings it back to 4 ms.

---

## 12. Stated limits

Shown in the UI's Assumptions panel and on the About page.

- Service times are exponential. Real endpoints have heavier tails, so a mixed fast/slow workload (Scenario 3 inline) looks smoother than it would really be.
- Stations are treated as independent. Correlated slow-downs are not modelled.
- Mixed request types at one station use a weighted mean service time.
- Not modelled: database connection-pool contention, cache invalidation and cold starts, replication lag, network latency, GC pauses, noisy neighbours, autoscaling.
- Prices are fictional.
- Async queue has no size limit or retention policy.

ARCHLAB teaches direction and order of magnitude, not capacity planning.

---

## 13. Test plan

Implemented in `src/engine/__tests__/` (`npm test`).

The oracle floors K, while the engine interpolates (§2.1). The resulting differences are well inside the 1% network tolerance.

Station values are exact for the model: assert with relative tolerance **1e−3**. Architecture values depend on bisection: assert with relative tolerance **1%**. Saturation points: assert to **±1 rps**.

### 13.1 Station: hand-checkable

| # | Case | Expected |
|---|---|---|
| T1 | M/M/1/4, λ = μ = 100 | `p_n = 1/5` each; P_block = 0.2; λ_eff = 80; L = 2; R = 25 ms; U = 0.8 |
| T2 | M/M/1/3, λ = 200, μ = 100 | p = [1,2,4,8]/15; P_block = 8/15 = 0.5333; λ_eff = 93.33; L = 34/15; R = 24.286 ms; U = 14/15 |
| T3 | M/M/2, λ = 150, S = 10 ms, K from §2.1 (202) | P(wait) = 0.642857 (Erlang C); Wq = 12.857 ms; R = 22.857 ms; P95 = 64.77 ms (analytic: solve `1.285714·e^{−50t} − 0.285714·e^{−100t} = 0.05`) |
| T4 | M/M/1, λ = 50, S = 10 ms, K from §2.1 | R = 20 ms; P95 = ln(20)/50 = 59.915 ms |
| T5 | M/M/2, λ = 250, S = 10 ms, K = 202 (overload) | P_block = 0.2000; λ_eff = 200; U = 1.0; R = 990 ms |

### 13.2 Scenario 1: One Server Is Enough

Defaults from §11. Small app server (2 cores, W = 16), small DB.

| Case | Expected |
|---|---|
| Small, 150 rps | CPU U = 0.750; DB U = 0.330; H = 27.80 ms; mean = 27.80 ms; P95 ≈ 79.2 ms; errors 0 |
| Small, 180 rps | CPU U = 0.900; mean = 58.65 ms; P95 ≈ 172.6 ms; errors 0 |
| Small, 250 rps | worker U = 1.000; CPU U = 0.936; throughput = 187.1; errors = 25.15%; mean ≈ 1069 ms |
| Medium (4 cores), 250 rps | CPU U = 0.625; mean = 18.44 ms; P95 ≈ 52.1 ms |
| 2 × small + LB, 250 rps | CPU U = 0.625 each; DB U = 0.550; mean = 22.97 ms; P95 ≈ 65.2 ms |
| Saturation point | small ≈ 185; medium ≈ 383; 2 × small + LB ≈ 367 |
| Verdict at 250 rps | medium (+$20, +0) → `WORTH_IT`; 2 × small + LB (+$40, +1) → `CHEAPER_FIX_EXISTS` |
| Verdict at 150 rps, any option | `NOT_NEEDED_YET`, saturation point ≈ 185 |

### 13.3 Scenario 2: The Database Bottleneck

Scenario 1 defaults with `S_read = 40 ms`. Load 45 rps.

| Case | Expected |
|---|---|
| Baseline | CPU U = 0.225; DB U = 0.828; DB R = 117.0 ms; mean = 127.55 ms; P95 ≈ 365.8 ms → misses SLO; diagnosis `DB_BOUND` |
| Baseline saturation point | ≈ 43 rps |
| + cache (h = 0.8) | DB U = 0.180; mean = 19.25 ms; P95 ≈ 120.2 ms → meets SLO |
| + 1 read replica | primary U = 0.423; replica U = 0.405; mean = 54.96 ms; P95 ≈ 169.6 ms → meets SLO |
| Query optimization (S_read = 4 ms) | DB U = 0.099; mean = 14.98 ms; P95 ≈ 44.4 ms → meets SLO |
| 2 × small + LB | DB U = 0.828 (unchanged); P95 ≈ 365.7 ms → `DID_NOT_FIX` |
| Medium app server | DB U = 0.828; P95 ≈ 364.7 ms → `DID_NOT_FIX` |
| Verdicts | query optimization ($0) → `WORTH_IT`; cache, replica → `CHEAPER_FIX_EXISTS`; more or bigger app servers → `DID_NOT_FIX` |

### 13.4 Scenario 3: async (fluid model, by hand)

`S_job = 500 ms`; 1 job-worker instance → C = 4 jobs/s.

| Case | Expected |
|---|---|
| 5 jobs/s for 300 s | backlog grows 1 job/s; backlog(300) = 300; job delay = 300/4 + 0.5 = 75.5 s; `JOB_BACKLOG_GROWING` |
| Then 1 job/s | drains at 3 jobs/s → empty after 100 s |
| 2 instances (C = 8), 5 jobs/s | backlog stays 0 |
| Inline, 100 rps, f = 0.05 | S_cpu,mix = 34.5 ms; CPU demand ρ = 1.725 → overloaded; `INLINE_SLOW_WORK` |
| Queued, 100 rps, f = 0.05 | S_cpu,mix = 10.1 ms; CPU ρ = 0.505 |

### 13.5 Check My App

| Input | Expected |
|---|---|
| 500 DAU, defaults | average 0.289 rps; peak 2.89 rps; headroom ≈ 64× against 185 rps |

### 13.6 Properties (all architectures, loads 1–1000 rps)

- `0 ≤ P_block ≤ 1`, `0 ≤ U ≤ 1`, throughput ≤ offered load.
- Same input → identical output (run twice and deep-compare).
- Mean latency and error rate never decrease as load rises.
- Missing the SLO is monotone in load (needed by §9.2).
- Station mass sums to 1 within 1e−12.
- Little's law: `L = λ_eff · R` within 1e−9.

### 13.7 Performance budget

One architecture solve (§4 + P95) must take **< 16 ms**, which is one frame. The engine measures 1.4–5.4 ms in Node, worst case in overload. Before the lazy CDFs and the recursion in §2.4 it took up to 17 ms. A saturation-point search (§9.2) runs when the slider stops moving, so it has a budget of < 300 ms. The test is skipped when `CI` is set, because shared CI machines make timings unreliable.
