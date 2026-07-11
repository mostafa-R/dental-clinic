const routeStats = new Map();
const HISTOGRAM_BUCKETS = [50, 100, 150, 200, 300, 500, 1000, 2000, 5000];

function routeKey(method, route) {
  return `${method}:${route}`;
}

export function trackResponse(method, route, durationMs, statusCode) {
  const key = routeKey(method, route);
  let stat = routeStats.get(key);

  if (!stat) {
    stat = {
      method,
      route,
      count: 0,
      totalMs: 0,
      minMs: Infinity,
      maxMs: 0,
      errors: 0,
      histogram: Object.fromEntries(HISTOGRAM_BUCKETS.map((b) => [b, 0])),
      lastHit: null,
    };
    routeStats.set(key, stat);
  }

  stat.count++;
  stat.totalMs += durationMs;
  stat.minMs = Math.min(stat.minMs, durationMs);
  stat.maxMs = Math.max(stat.maxMs, durationMs);
  stat.lastHit = new Date();

  if (statusCode >= 400) {
    stat.errors++;
  }

  for (const bucket of HISTOGRAM_BUCKETS) {
    if (durationMs <= bucket) {
      stat.histogram[bucket]++;
      break;
    }
  }
}

export function getPerfStats() {
  const stats = [];
  for (const [, stat] of routeStats) {
    const avg = stat.count > 0 ? stat.totalMs / stat.count : 0;

    stats.push({
      route: `${stat.method} ${stat.route}`,
      count: stat.count,
      avgMs: Math.round(avg * 10) / 10,
      minMs: stat.minMs === Infinity ? 0 : stat.minMs,
      maxMs: stat.maxMs,
      errors: stat.errors,
      errorRate: stat.count > 0 ? Math.round((stat.errors / stat.count) * 10000) / 100 : 0,
      lastHit: stat.lastHit,
    });
  }

  stats.sort((a, b) => b.count - a.count);

  const totals = stats.reduce(
    (acc, s) => {
      acc.totalRequests += s.count;
      acc.totalErrors += s.errors;
      acc.totalRoutes++;
      return acc;
    },
    { totalRequests: 0, totalErrors: 0, totalRoutes: 0 },
  );

  const avgAll = totals.totalRequests > 0
    ? Math.round(
      (stats.reduce((s, r) => s + r.avgMs * r.count, 0) / totals.totalRequests) * 10,
    ) / 10
    : 0;

  const routesUnder200ms = stats.filter((r) => r.avgMs < 200).length;

  return {
    routes: stats,
    totals,
    globalAvgMs: avgAll,
    routesUnder200ms,
    routesOver200ms: totals.totalRoutes - routesUnder200ms,
    prdTargetMet: routesUnder200ms === totals.totalRoutes && totals.totalRoutes > 0,
  };
}

export function resetPerfStats() {
  routeStats.clear();
}

export function perfMiddleware(req, res, next) {
  const start = process.hrtime.bigint();
  const originalEnd = res.end.bind(res);

  res.end = function (...args) {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationMs = Math.round(durationNs / 1e6 * 10) / 10;

    const routePath = req.route?.path || req.originalUrl.split('?')[0];
    trackResponse(req.method, routePath, durationMs, res.statusCode);
    res.setHeader("X-Response-Time-MS", String(durationMs));

    return originalEnd(...args);
  };

  next();
}
