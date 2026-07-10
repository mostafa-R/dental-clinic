import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import AppLayout from "../components/layout/AppLayout";
import Topbar from "../components/layout/Topbar";
import Card from "../components/ui/Card";
import StatCard from "../components/ui/StatCard";
import { PageLoader } from "../components/ui/Spinner";
import { fetchHealth } from "../features/health/healthSlice";
import { t } from "../lib/i18n";

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function RedisCard({ data: redis, language }) {
  if (!redis) return null;
  return (
    <Card>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
        {t("redis", language)} {redis.connected ? `✅ ${t("redisConnected", language)}` : `❌ ${t("redisDisconnected", language)}`}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
        <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{redis.usedMemory || 'N/A'}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t("redisMemory", language)}</div>
        </div>
        <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{redis.totalConnections ?? 0}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t("redisConnections", language)}</div>
        </div>
        <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{formatUptime(redis.uptime)}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t("redisUptime", language)}</div>
        </div>
        <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{redis.cacheHits}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t("cacheHits", language)}</div>
        </div>
        <div className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="text-2xl font-bold text-slate-900 dark:text-white">{redis.cacheMisses}</div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t("cacheMisses", language)}</div>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-sm mb-1">
          <span className="text-slate-600 dark:text-slate-400">{t("hitRateLabel", language)}</span>
          <span className="font-medium text-slate-900 dark:text-white">{redis.hitRate}%</span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
          <div className="h-2.5 rounded-full bg-amber-500" style={{ width: `${redis.hitRate}%` }} />
        </div>
      </div>
    </Card>
  );
}

function TelemetryCard({ data: telemetry, language }) {
  if (!telemetry || Object.keys(telemetry).length === 0) return null;
  return (
    <Card>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
        {t("apiTelemetry", language)}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(telemetry).map(([key, val]) => (
          <div key={key} className="text-center p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{val.total}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">{key.replace(/_/g, ' ')}</div>
            {val.tenantCount > 1 && (
              <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                {val.tenantCount} tenants
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function Health() {
  const dispatch = useDispatch();
  const { data, loading } = useSelector((state) => state.health);
  const { language } = useSelector((state) => state.ui);

  useEffect(() => {
    dispatch(fetchHealth());
    const interval = setInterval(() => dispatch(fetchHealth()), 30000);
    return () => clearInterval(interval);
  }, [dispatch]);

  return (
    <AppLayout>
      <Topbar title={t("systemHealth", language)} />
      <div className="p-6">
        {loading && !data && <PageLoader />}

        {data && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <StatCard
                title={t("uptime", language)}
                value={formatUptime(data.uptime)}
                variant="info"
              />
              <StatCard
                title={t("mongodb", language)}
                value={data.mongodb === "connected" ? t("connected", language) : t("disconnected", language)}
                variant={data.mongodb === "connected" ? "success" : "danger"}
              />
              <StatCard
                title={t("nodeVersion", language)}
                value={data.node}
                variant="default"
              />
              <StatCard
                title={t("platform", language)}
                value={data.platform}
                variant="default"
              />
            </div>

            <div className="mb-6">
              <RedisCard data={data.redis} language={language} />
            </div>

            <div className="mb-6">
              <TelemetryCard data={data.telemetry} language={language} />
            </div>

            <Card>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                {t("memory", language)}
              </h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600 dark:text-slate-400">{t("rss", language)}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{data.memory.rss} MB</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full bg-indigo-500" style={{ width: `${Math.min((data.memory.rss / 1024) * 100, 100)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600 dark:text-slate-400">{t("heapTotal", language)}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{data.memory.heapTotal} MB</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: `${Math.min((data.memory.heapTotal / 512) * 100, 100)}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-600 dark:text-slate-400">{t("heapUsed", language)}</span>
                    <span className="font-medium text-slate-900 dark:text-white">{data.memory.heapUsed} MB</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5">
                    <div className="h-2.5 rounded-full bg-purple-500" style={{ width: `${Math.min((data.memory.heapUsed / data.memory.heapTotal) * 100, 100)}%` }} />
                  </div>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
