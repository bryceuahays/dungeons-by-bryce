'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

// Instant feedback on a click: a thin bar across the top from the moment a link is
// pressed until the new page is on screen. (A streamed placeholder page would also do
// this, but it makes "not found" and redirects answer with the wrong status, and those
// statuses are part of how hidden pages stay hidden.)
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [busy, setBusy] = useState(false);

  useEffect(() => { setBusy(false); }, [pathname, search]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = () => { setBusy(true); if (timer) clearTimeout(timer); timer = setTimeout(() => setBusy(false), 12000); };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const href = a.getAttribute('href') || '';
      if (!href.startsWith('/') || href.startsWith('//')) return;
      const url = new URL(href, location.href);
      if (url.pathname === location.pathname && url.search === location.search) return;
      if (a.classList.contains('chip')) return; // race chips switch in place
      start();
    };
    const onSubmit = () => start();
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('submit', onSubmit); if (timer) clearTimeout(timer); };
  }, []);

  return <div className={'nav-progress' + (busy ? ' on' : '')} role="progressbar" aria-hidden={!busy} aria-label="Loading" />;
}

export function NavProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}
