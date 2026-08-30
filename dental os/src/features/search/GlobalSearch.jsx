import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { searchApi, GROUPS, resultView } from './searchApi';
import { useT } from '../../lib/i18n';

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function GlobalSearch() {
  const navigate = useNavigate();
  const { t } = useT();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState({});
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!open || term.length < 2) {
      setReady(false);
      setResults({});
      setLoading(false);
      setError(null);
      setActive(-1);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await searchApi.global(term);
        if (!cancelled) { setResults(data); setReady(true); setActive(-1); }
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [q, open]);

  const flatItems = [];
  const groupStart = new Map();
  GROUPS.forEach(({ key }) => {
    const items = results[key] || [];
    if (items.length) {
      groupStart.set(key, flatItems.length);
      items.forEach((r) => flatItems.push({ key, item: r }));
    }
  });

  const go = (key, item) => {
    const view = resultView(key);
    const target = view.route(item);
    setOpen(false);
    setQ('');
    if (target && target !== '#') navigate(target);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); return; }
    if (e.key === 'Enter') {
      const hit = flatItems[active];
      if (hit) { go(hit.key, hit.item); return; }
      const first = flatItems[0];
      if (first) { go(first.key, first.item); }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % Math.max(flatItems.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? flatItems.length - 1 : a - 1));
    }
  };

  const total = flatItems.length;

  return (
    <div className="relative mx-auto w-full max-w-xl" ref={boxRef}>
      <div className="relative">
        <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400">
          <SearchIcon />
        </span>
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t('search.placeholder')}
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pe-9 ps-9 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-indigo-600 dark:focus:bg-slate-800 dark:focus:ring-indigo-500/20"
        />
        {q && (
          <button
            type="button"
            onClick={() => { setQ(''); inputRef.current?.focus(); }}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
            aria-label={t('common.clear')}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute start-0 top-full z-40 mt-2 max-h-[70vh] w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-xl ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-800">
          {q.trim().length < 2 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">{t('search.typeMore')}</p>
          ) : loading ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">{t('common.loading')}</p>
          ) : error ? (
            <p className="px-4 py-6 text-center text-sm text-rose-500">{t('search.failed')}</p>
          ) : ready && total === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-slate-400">{t('search.empty', { query: q })}</p>
          ) : (
            <div className="divide-y divide-slate-100 py-1 dark:divide-slate-700/60">
              {GROUPS.map(({ key }) => {
                const items = results[key] || [];
                if (!items.length) return null;
                const start = groupStart.get(key);
                const view = resultView(key);
                return (
                  <div key={key} className="px-2 py-1.5">
                    <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {t('search.groups.' + key)}
                    </p>
                    {items.map((item, idx) => {
                      const flatIdx = start + idx;
                      return (
                        <button
                          key={item._id}
                          type="button"
                          onMouseEnter={() => setActive(flatIdx)}
                          onClick={() => go(key, item)}
                          className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-start transition ${
                            active === flatIdx ? 'bg-indigo-50 dark:bg-indigo-500/15' : ''
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{view.title(item)}</p>
                            {view.sub(item) && <p className="truncate text-xs text-slate-400 dark:text-slate-500">{view.sub(item)}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}