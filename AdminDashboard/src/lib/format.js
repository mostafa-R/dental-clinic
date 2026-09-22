const getLocale = (language) => (language === "ar" ? "ar-EG" : "en-US");

export const formatCurrency = (amount, currency = "USD", language = "en") => {
  return new Intl.NumberFormat(getLocale(language), {
    style: "currency",
    currency,
  }).format(amount);
};

export const formatDate = (date, language = "en") => {
  return new Intl.DateTimeFormat(getLocale(language), {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(date));
};

export const formatDateTime = (date, language = "en") => {
  return new Intl.DateTimeFormat(getLocale(language), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
};

export const formatNumber = (num, language = "en") => {
  return new Intl.NumberFormat(getLocale(language)).format(num);
};

export const formatPercentage = (value) => {
  return `${value.toFixed(1)}%`;
};

export const getRelativeTime = (date, language = "en") => {
  const now = new Date();
  const past = new Date(date);
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
