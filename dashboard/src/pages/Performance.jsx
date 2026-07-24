import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import AppLayout from "../components/layout/AppLayout";
import Topbar from "../components/layout/Topbar";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import StatCard from "../components/ui/StatCard";
import { PageLoader } from "../components/ui/Spinner";
import { fetchPerfStats, resetPerfStats } from "../features/perf/perfSlice";
import { t } from "../lib/i18n";

function msColor(ms) {
  if (ms < 50) return "text-emerald-600 dark:text-emerald-400";
  if (ms < 100) return "text-green-600 dark:text-green-400";
  if (ms < 200) return "text-yellow-600 dark:text-yellow-400";
  if (ms < 500) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

export default function Performance() {
  const dispatch = useDispatch();
  const { data, loading, resetting } = useSelector((state) => state.perf);
  const { language } = useSelector((state) => state.ui);

  useEffect(() => {
    dispatch(fetchPerfStats());
    const interval = setInterval(() => dispatch(fetchPerfStats()), 15000);
    return () => clearInterval(interval);
  }, [dispatch]);

  const handleReset = () => {
    if (window.confirm(t("resetPerfConfirm", language))) {
      dispatch(resetPerfStats()).then(() => dispatch(fetchPerfStats()));
    }
  };

  const totals = data?.totals;
  const routes = data?.routes || [];

  return (
    <AppLayout>
      <Topbar title={t("performance", language)} />
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("performanceDesc", language)}
          </p>
          <div className="flex gap-3">
            <Button variant="ghost" onClick={() => dispatch(fetchPerfStats())} loading={loading}>
              {t("refresh", language)}
            </Button>
            <Button variant="danger" onClick={handleReset} loading={resetting}>
              {t("resetStats", language)}
            </Button>
          </div>
        </div>

        {loading && !data ? (
          <PageLoader />
        ) : data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatCard
                title={t("totalRequests", language)}
                value={totals.totalRequests || 0}
                variant="info"
              />
              <StatCard
                title={t("totalRoutes", language)}
                value={totals.totalRoutes || 0}
                variant="default"
              />
              <StatCard
                title={t("avgResponseTime", language)}
                value={`${totals.globalAvgMs || 0}ms`}
                variant={data.prdTargetMet ? "success" : "warning"}
              />
              <StatCard
                title={t("errorRate", language)}
                value={totals.totalRequests > 0
                  ? `${((totals.totalErrors / totals.totalRequests) * 100).toFixed(2)}%`
                  : "0%"}
                variant={totals.totalErrors > 0 ? "danger" : "success"}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${data.prdTargetMet ? "bg-emerald-500" : "bg-amber-500"}`} />
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {t("prdTarget", language)}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {data.prdTargetMet ? t("prdMet", language) : t("prdNotMet", language)}
                  </p>
                </div>
              </Card>
              <Card className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {t("routesUnder200ms", language)}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {data.routesUnder200ms || 0} / {totals.totalRoutes || 0}
                  </p>
                </div>
              </Card>
              <Card className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div>
                  <p className="font-medium text-slate-900 dark:text-white">
                    {t("routesOver200ms", language)}
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {data.routesOver200ms || 0}
                  </p>
                </div>
              </Card>
            </div>

            <Card>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white p-4 border-b border-slate-200 dark:border-slate-700">
                {t("routePerformance", language)}
              </h3>
              {routes.length === 0 ? (
                <p className="text-slate-500 text-center py-8">{t("noPerfData", language)}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="text-start px-4 py-3 font-medium text-slate-500">{t("route", language)}</th>
                        <th className="text-end px-4 py-3 font-medium text-slate-500">{t("hits", language)}</th>
                        <th className="text-end px-4 py-3 font-medium text-slate-500">{t("avgMs", language)}</th>
                        <th className="text-end px-4 py-3 font-medium text-slate-500">{t("minMs", language)}</th>
                        <th className="text-end px-4 py-3 font-medium text-slate-500">{t("maxMs", language)}</th>
                        <th className="text-end px-4 py-3 font-medium text-slate-500">{t("errors", language)}</th>
                        <th className="text-end px-4 py-3 font-medium text-slate-500">{t("errorRateLabel", language)}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map((route) => (
                        <tr key={route.route} className="border-b border-slate-100 dark:border-slate-700/50">
                          <td className="px-4 py-3 font-mono text-xs text-slate-900 dark:text-white">
                            {route.route}
                          </td>
                          <td className="px-4 py-3 text-end text-slate-600 dark:text-slate-300">
                            {route.count}
                          </td>
                          <td className={`px-4 py-3 text-end font-medium ${msColor(route.avgMs)}`}>
                            {route.avgMs}ms
                          </td>
                          <td className="px-4 py-3 text-end text-slate-600 dark:text-slate-300">
                            {route.minMs}ms
                          </td>
                          <td className="px-4 py-3 text-end text-slate-600 dark:text-slate-300">
                            {route.maxMs}ms
                          </td>
                          <td className="px-4 py-3 text-end">
                            {route.errors > 0 ? (
                              <Badge variant="danger" size="sm">{route.errors}</Badge>
                            ) : (
                              <span className="text-slate-400">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-end text-slate-600 dark:text-slate-300">
                            {route.errorRate}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        ) : (
          <Card>
            <div className="text-center py-12">
              <p className="text-slate-500 dark:text-slate-400">{t("noPerfData", language)}</p>
            </div>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
