import { useEffect } from 'react';

/**
 * Sets document.title while the component is mounted and restores the
 * previous title on unmount.
 *
 * The public pages (Pricing, Login) are the only crawlable surfaces of the
 * SPA, and previously every route shared the static "Dental OS" title —
 * search results, bookmarks and browser history all read the same. Only the
 * public pages set per-route titles for now (metadata for authed routes is
 * invisible to crawlers anyway).
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    return () => {
      document.title = previousTitle;
    };
  }, [title]);
}

export default useDocumentTitle;
