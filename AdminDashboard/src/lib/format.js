const getLocale = (language) => (language === "ar" ? "ar-EG" : "en-US");

// Em dash for "no value", matching the date formatters. Chosen over a formatted
// zero because a missing amount and a real 0.00 must not look identical on an
// invoice or a usage bar.
const EMPTY = "—";

/**
 * True when `value` can be rendered as a number.
 *
 * Coerces strings because amounts arrive from the API as JSON numbers but are
 * sometimes still strings from a query or a CSV import. `Number("")` is 0, so
 * blanks are rejected explicitly - otherwise an empty field would render as a
 * real $0.00.
 */
const isRenderableNumber = (value) => {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "boolean") return false;
  return Number.isFinite(Number(value));
};

export const formatCurrency = (amount, currency = "USD", language = "en") => {
  if (!isRenderableNumber(amount)) return EMPTY;
  return new Intl.NumberFormat(getLocale(language), {
    style: "currency",
    currency,
  }).format(Number(amount));
};

export const formatDate = (date, language = "en") => {
  if (!date) return EMPTY;
  const d = new Date(date);
  if (isNaN(d.getTime())) return EMPTY;
  return new Intl.DateTimeFormat(getLocale(language), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
};

export const formatDateTime = (date, language = "en") => {
  if (!date) return EMPTY;
  const d = new Date(date);
  if (isNaN(d.getTime())) return EMPTY;
  return new Intl.DateTimeFormat(getLocale(language), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

export const formatNumber = (num, language = "en") => {
  if (!isRenderableNumber(num)) return EMPTY;
  return new Intl.NumberFormat(getLocale(language)).format(Number(num));
};

export const formatPercentage = (value) => {
  // `value.toFixed` threw a TypeError on null/undefined, taking down whichever
  // component rendered a usage bar with no data yet.
  if (!isRenderableNumber(value)) return EMPTY;
  return `${Number(value).toFixed(1)}%`;
};

export const getRelativeTime = (date, language = "en") => {
  if (!date) return EMPTY;
  const now = new Date();
  const past = new Date(date);
  if (isNaN(past.getTime())) return EMPTY;
  const diffInSeconds = Math.floor((now - past) / 1000);

  if (diffInSeconds < 60) return language === "ar" ? "الآن" : "just now";
  const mins = Math.floor(diffInSeconds / 60);
  const hrs = Math.floor(diffInSeconds / 3600);
  const days = Math.floor(diffInSeconds / 86400);
  if (diffInSeconds < 3600) return language === "ar" ? `منذ ${mins} د` : `${mins}m ago`;
  if (diffInSeconds < 86400) return language === "ar" ? `منذ ${hrs} س` : `${hrs}h ago`;
  if (diffInSeconds < 604800)
    return language === "ar" ? `منذ ${days} ي` : `${days}d ago`;
  return formatDate(date, language);
};
