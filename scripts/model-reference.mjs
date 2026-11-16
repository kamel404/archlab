// Reference calculator for MODEL.md test cases. Units: seconds internally.
// Throwaway oracle, not the engine: it produced the expected values in MODEL.md §13.
// Run: node scripts/model-reference.mjs   (takes a minute; the fail-at searches dominate)
// G[m] = P(Erlang(m, r) <= x) for m = 0..M, stable in log space
const erlCdfs = (M, r, x) => {
  const z = r * x, G = new Float64Array(M + 1);
  if (z <= 0) { G[0] = 1; return G; }
  let logp = -z, below = 0; G[0] = 1;
  for (let m = 1; m <= M; m++) { below += Math.exp(logp); G[m] = Math.max(0, 1 - below); logp += Math.log(z) - Math.log(m); }
  return G;
};
const erlCdf = (k, r, x) => erlCdfs(k, r, x)[k];
const bis = (f, target) => { // smallest x with f(x) >= target, f increasing
  let lo = 0, hi = 1e-3; while (f(hi) < target) hi *= 2;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (f(m) < target) lo = m; else hi = m; }
  return hi;
};
export function station(lam, S, c, K) {
  const mu = 1 / S, a = lam / mu;
  const w = []; let t = 1;
  for (let n = 0; n <= K; n++) { if (n > 0) t *= n <= c ? a / n : a / c; w.push(t); }
  const Z = w.reduce((x, y) => x + y, 0);
  const p = w.map(x => x / Z);
  const pb = p[K], lamEff = lam * (1 - pb);
  const L = p.reduce((s, x, n) => s + n * x, 0);
  const R = lamEff > 0 ? L / lamEff : S;
  const theta = c * mu;
  const pi = n => p[n] / (1 - pb);
  let pw = 0; for (let n = c; n < K; n++) pw += pi(n);
  // queued arrivals (n >= c) wait Erlang(k = n-c+1, theta). Service Exp(mu) == Erlang(N, theta), N ~ Geom(q = 1/c).
  // So queued response ~ Erlang(k + N, theta): a positive mixture, no cancellation.
  const q = 1 / c, kMax = K - c;
  const wq = new Float64Array(kMax + 2); for (let n = c; n < K; n++) wq[n - c + 1] = pi(n); // weight of wait = Erlang(k)
  const waitCdf = x => { const G = erlCdfs(kMax + 1, theta, x); let F = 0; for (let n = 0; n < c; n++) F += pi(n); for (let k = 1; k <= kMax + 1; k++) F += wq[k] * G[k]; return F; };
  let jMax = 1; if (q < 1) while (Math.pow(1 - q, jMax) > 1e-12) jMax++;
  const respCdf = x => {
    let F = 0; for (let n = 0; n < c; n++) F += pi(n) * (1 - Math.exp(-mu * x));
    const G = erlCdfs(kMax + 1 + jMax, theta, x);
    for (let k = 1; k <= kMax + 1; k++) {
      if (wq[k] < 1e-15) continue;
      let s = 0, w = q; for (let j = 1; j <= jMax; j++) { s += w * G[k + j]; w *= 1 - q; }
      F += wq[k] * s;
    }
    return F;
  };
  return { a, rho: a / c, pb, lamEff, L, R, Wq: R - S, util: lamEff * S / c, pw,
    get p95() { return bis(respCdf, 0.95); },
    get p95Wait() { return waitCdf(0) >= 0.95 ? 0 : bis(waitCdf, 0.95); } };
}
export const K = (c, S, T = 1) => c + Math.min(2000, Math.max(1, Math.floor(T * c / S)));
const ms = x => (x * 1000).toFixed(3) + 'ms';
const show = (name, r) => console.log(name, { rho: r.rho.toFixed(4), pb: r.pb.toExponential(4), lamEff: r.lamEff.toFixed(3), util: r.util.toFixed(4), pw: r.pw.toFixed(5), R: ms(r.R), Wq: ms(r.Wq), p95: ms(r.p95), p95Wait: ms(r.p95Wait) });

// N identical app servers behind LB, shared DB (+replicas), optional shared cache.
export function arch({ lam, n = 1, cores = 2, Scpu = 0.01, W = 8 * cores, dbCores = 2, Sr = 0.004, Sw = 0.008, readFrac = 0.9, hit = 0, replicas = 0, Scache = 0.0005, cacheCores = 2, T = 1 }) {
  const lamApp = lam / n, wf = 1 - readFrac;
  const lb = n > 1 ? station(lam, 0.00025, 4, K(4, 0.00025, T)) : null;
  const evalAt = x => { // x = admitted rate per app server
    const cpu = station(x, Scpu, cores, K(cores, Scpu, T));
    const reads = n * x * readFrac, writes = n * x * wf;
    const dbReads = reads * (1 - hit), perNodeReads = dbReads / (1 + replicas);
    const lp = perNodeReads + writes;
    const Sp = lp > 0 ? (perNodeReads * Sr + writes * Sw) / lp : Sr;
    const prim = station(lp, Sp, dbCores, K(dbCores, Sp, T));
    const rep = replicas > 0 ? station(perNodeReads, Sr, dbCores, K(dbCores, Sr, T)) : null;
    const cache = hit > 0 ? station(reads, Scache, cacheCores, K(cacheCores, Scache, T)) : null;
    const Rread = rep ? (prim.R + replicas * rep.R) / (1 + replicas) : prim.R;
    const Rdown = readFrac * ((cache ? cache.R : 0) + (1 - hit) * Rread) + wf * prim.R;
    const H = cpu.R + Rdown;
    const wk = station(lamApp, H, W, K(W, H, T));
    return { cpu, prim, rep, cache, wk, H, next: lamApp * (1 - wk.pb) };
  };
  // fixed point x = g(x), g decreasing -> bisection on x - g(x)
  let lo = 0, hi = lamApp;
  for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (m - evalAt(m).next < 0) lo = m; else hi = m; }
  const o = evalAt(hi);
  const fDb = readFrac * (1 - hit) + wf, fCache = hit > 0 ? readFrac : 0;
  const pbDb = o.rep ? Math.max(o.prim.pb, o.rep.pb) : o.prim.pb;
  const err = 1 - (lb ? 1 - lb.pb : 1) * (1 - o.wk.pb) * (1 - o.cpu.pb) * (1 - fDb * pbDb) * (1 - fCache * (o.cache ? o.cache.pb : 0));
  const dbP95 = o.rep ? Math.max(o.prim.p95, o.rep.p95) : o.prim.p95;
  const p95 = o.wk.p95Wait + o.cpu.p95 + (fDb > 0 ? dbP95 : 0) + (o.cache ? o.cache.p95 : 0);
  return { ...o, lb, admitted: hi, err, mean: (lb ? lb.R : 0) + o.wk.Wq + o.H, p95: p95 + (lb ? lb.p95 : 0), tput: lam * (1 - err) };
}
const sum = (name, o) => console.log(name.padEnd(28), [
  `cpu ρ=${o.cpu.rho.toFixed(3)} util=${o.cpu.util.toFixed(3)} R=${ms(o.cpu.R)}`,
  `db ρ=${o.prim.rho.toFixed(3)} R=${ms(o.prim.R)}` + (o.rep ? ` rep ρ=${o.rep.rho.toFixed(3)}` : ''),
  `wk util=${o.wk.util.toFixed(3)} H=${ms(o.H)} Wq=${ms(o.wk.Wq)}`,
  `tput=${o.tput.toFixed(1)} mean=${ms(o.mean)} p95≈${ms(o.p95)} err=${(o.err * 100).toFixed(3)}%`].join(' | '));

if (process.argv[2] !== 'quiet') {
  show('T1 MM1K4 rho1', station(100, 0.01, 1, 4));
  show('T2 MM1K3 rho2', station(200, 0.01, 1, 3));
  show('T3 MM2 150', station(150, 0.01, 2, K(2, 0.01)));
  show('T4 MM1 50', station(50, 0.01, 1, K(1, 0.01)));
  console.log('T4 exact p95', ms(Math.log(20) / 50));
  show('T5 MM2 250 overload', station(250, 0.01, 2, K(2, 0.01)));

  const fails = o => o.p95 >= 0.3 || o.err >= 0.01;
  const failAt = f => { let lo = 1, hi = 2000; while (hi - lo > 0.25) { const m = (lo + hi) / 2; if (fails(f(m))) hi = m; else lo = m; } return hi; };

  for (const l of [100, 150, 180, 190, 200, 250]) sum('S1 small ' + l, arch({ lam: l }));
  sum('S1 medium 250', arch({ lam: 250, cores: 4 }));
  sum('S1 2xsmall+LB 250', arch({ lam: 250, n: 2 }));
  console.log('S1 small fails at', failAt(l => arch({ lam: l })));
  console.log('S1 medium fails at', failAt(l => arch({ lam: l, cores: 4 })));
  console.log('S1 2xsmall fails at', failAt(l => arch({ lam: l, n: 2 })));

  const s2 = { Sr: 0.04 };
  for (const l of [20, 30, 40, 45, 50]) sum('S2 base ' + l, arch({ lam: l, ...s2 }));
  console.log('S2 base fails at', failAt(l => arch({ lam: l, ...s2 })));
  sum('S2 cache 45', arch({ lam: 45, ...s2, hit: 0.8 }));
  sum('S2 replica 45', arch({ lam: 45, ...s2, replicas: 1 }));
  sum('S2 queryopt 45', arch({ lam: 45 }));
  sum('S2 2xapp+LB 45', arch({ lam: 45, ...s2, n: 2 }));
  sum('S2 bigger app 45', arch({ lam: 45, ...s2, cores: 4 }));
}
