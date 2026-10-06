// Small data-mining toolkit for the smart modules (no dependencies): robust statistics, least
// squares, standardisation and k-means. Deterministic (seeded) so a page shows the same groups on
// every load.

export const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export const quantile = (xs: number[], q: number) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const i = (a.length - 1) * q;
  const lo = Math.floor(i);
  return a[lo] + (a[Math.ceil(i)] - a[lo]) * (i - lo);
};

/** Median absolute deviation, scaled to a standard deviation for normal data. */
export const mad = (xs: number[]) => {
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
};

/** How unusual `x` is against `history` (robust z-score; median/MAD, so outliers don't hide outliers). */
export function robustZ(x: number, history: number[]) {
  if (history.length < 4) return 0;
  const m = median(history);
  const s = mad(history) || Math.abs(m) * 0.1 || 1;
  return (x - m) / s;
}

/** Ordinary least squares y = a + b·x, with R². */
export function linreg(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 2) return { a: ys[0] ?? 0, b: 0, r2: 0, n };
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const b = sxx ? sxy / sxx : 0;
  return { a: my - b * mx, b, r2: sxx && syy ? (sxy * sxy) / (sxx * syy) : 0, n };
}

/** Standardises each column (z-scores) so k-means weighs every feature equally. */
export function standardise(rows: number[][]) {
  const k = rows[0]?.length ?? 0;
  const mean = Array.from({ length: k }, (_, j) => rows.reduce((s, r) => s + r[j], 0) / Math.max(1, rows.length));
  const sd = Array.from({ length: k }, (_, j) => Math.sqrt(rows.reduce((s, r) => s + (r[j] - mean[j]) ** 2, 0) / Math.max(1, rows.length)) || 1);
  return { z: rows.map((r) => r.map((v, j) => (v - mean[j]) / sd[j])), mean, sd };
}

/** k-means (k-means++ seeding with a fixed seed). Returns the cluster of each row and the centroids (in z units). */
export function kmeans(rows: number[][], k: number, iterations = 50) {
  const n = rows.length;
  if (n === 0) return { labels: [] as number[], centroids: [] as number[][] };
  k = Math.min(k, n);
  let seed = 42;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const dist = (a: number[], b: number[]) => a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0);
  const centroids: number[][] = [rows[Math.floor(rand() * n)]];
  while (centroids.length < k) {
    const d = rows.map((r) => Math.min(...centroids.map((c) => dist(r, c))));
    const total = d.reduce((s, v) => s + v, 0);
    let t = rand() * total;
    let i = 0;
    while (i < n - 1 && (t -= d[i]) > 0) i++;
    centroids.push(rows[i]);
  }
  let labels = new Array(n).fill(0);
  for (let it = 0; it < iterations; it++) {
    const next = rows.map((r) => {
      let best = 0;
      let bd = Infinity;
      centroids.forEach((c, ci) => {
        const dd = dist(r, c);
        if (dd < bd) {
          bd = dd;
          best = ci;
        }
      });
      return best;
    });
    const changed = next.some((l, i) => l !== labels[i]);
    labels = next;
    for (let ci = 0; ci < k; ci++) {
      const members = rows.filter((_, i) => labels[i] === ci);
      if (members.length) centroids[ci] = members[0].map((_, j) => members.reduce((s, m) => s + m[j], 0) / members.length);
    }
    if (!changed) break;
  }
  return { labels, centroids };
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
export const qi = (v: string) => `"${v.replace(/"/g, '""')}"`;
