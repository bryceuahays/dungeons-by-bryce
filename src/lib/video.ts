// Video blocks: a YouTube or Vimeo link becomes an embedded player. Nothing is hosted
// here. Only these two players are ever embedded, and only by an id checked against a
// strict pattern, so a link can never smuggle in anything else.

export type Video = { p: 'yt' | 'vm'; id: string };

export function parseVideoUrl(url: unknown): Video | null {
  const s = String(url ?? '').trim();
  let m = /^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#].*)?$/.exec(s);
  if (m) return { p: 'yt', id: m[1] };
  m = /^(?:https?:\/\/)?(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d{6,12})(?:[?&#/].*)?$/.exec(s);
  if (m) return { p: 'vm', id: m[1] };
  return null;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

// The placeholder a video block renders to (it survives the HTML sanitizer, which would remove an iframe).
export const videoSlot = (url: unknown) => { const v = parseVideoUrl(url); return v ? `<div class="video-slot" id="vid-${v.p}-${v.id}"></div>` : ''; };

export function videoFrame(v: Video, title = 'Video'): string {
  const src = v.p === 'yt' ? `https://www.youtube-nocookie.com/embed/${v.id}` : `https://player.vimeo.com/video/${v.id}?dnt=1`;
  return `<div class="video"><iframe src="${src}" title="${esc(title)}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
}

// Run AFTER sanitizing: swaps each placeholder for its player.
export const embedVideos = (html: string) => html.replace(/<div class="video-slot" id="vid-(yt|vm)-([A-Za-z0-9_-]{6,12})"><\/div>/g, (_, p, id) => videoFrame({ p, id }));
