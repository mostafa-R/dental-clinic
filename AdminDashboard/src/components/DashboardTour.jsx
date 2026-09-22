import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import Button from "./ui/Button";
import { t } from "../lib/i18n";

const TOUR_KEY = "dashboard_tour_done";

const STEPS = [
  { selector: ".tour-stats", titleKey: "tourStatsTitle", descKey: "tourStatsDesc" },
  { selector: ".tour-customize", titleKey: "tourCustomizeTitle", descKey: "tourCustomizeDesc" },
];

function finish() {
  try {
    localStorage.setItem(TOUR_KEY, "1");
  } catch {
    /* ignore */
  }
}

export default function DashboardTour({ onDone }) {
  const { language } = useSelector((state) => state.ui);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);

  const step = STEPS[index];

  useEffect(() => {
    const update = () => {
      const el = document.querySelector(step.selector);
      if (!el) {
        // Target hidden (e.g. card disabled) — advance or finish.
        if (index + 1 < STEPS.length) setIndex(index + 1);
        else {
          finish();
          onDone();
        }
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  const close = () => {
    finish();
    onDone();
  };

  const next = () => {
    if (index + 1 < STEPS.length) setIndex(index + 1);
    else close();
  };

  if (!rect) return null;

  const popTop = Math.min(
    window.innerHeight - 180,
    Math.max(12, rect.top + rect.height + 12),
  );

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-label={t(step.titleKey, language)}>
      <div className="absolute inset-0 bg-slate-900/50" onClick={close} />
      <div
        className="absolute rounded-xl ring-4 ring-indigo-500 ring-offset-2 ring-offset-transparent pointer-events-none transition-all"
        style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
      />
      <div
        className="absolute w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl p-4"
        style={{ top: popTop, left: Math.max(12, Math.min(window.innerWidth - 300, rect.left)) }}
      >
        <p className="text-sm font-bold text-slate-900 dark:text-white">
          {t(step.titleKey, language)}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {t(step.descKey, language)}
        </p>
        <p className="text-xs text-slate-400 mt-2">
          {index + 1} / {STEPS.length}
        </p>
        <div className="flex justify-between items-center mt-3">
          <Button variant="ghost" size="sm" onClick={close}>
            {t("tourSkip", language)}
          </Button>
          <Button size="sm" onClick={next}>
            {index + 1 < STEPS.length ? t("tourNext", language) : t("tourDone", language)}
          </Button>
        </div>
      </div>
    </div>
  );
}
