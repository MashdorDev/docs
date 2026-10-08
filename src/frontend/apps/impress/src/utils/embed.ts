/**
 * Helpers for converting URLs from common video platforms into iframe-friendly
 * `src` URLs. Unrecognised URLs fall back to direct-video rendering, matching
 * the behaviour of BlockNote's default video block so existing documents keep
 * working unchanged.
 */

export type EmbedKind = 'iframe' | 'video';

export interface ParsedEmbed {
  kind: EmbedKind;
  src: string;
}

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function getYouTubeId(input: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '');
  const path = parsed.pathname;

  if (host === 'youtu.be') {
    const id = path.split('/').filter(Boolean)[0] ?? '';
    return YOUTUBE_ID_RE.test(id) ? id : null;
  }

  if (host === 'youtube.com') {
    if (path === '/watch') {
      const id = parsed.searchParams.get('v') ?? '';
      return YOUTUBE_ID_RE.test(id) ? id : null;
    }
    const prefixed = ['/embed/', '/v/', '/shorts/'].find((p) =>
      path.startsWith(p),
    );
    if (prefixed) {
      const id = path.slice(prefixed.length).split('/')[0] ?? '';
      return YOUTUBE_ID_RE.test(id) ? id : null;
    }
  }

  return null;
}

const VIMEO_RE =
  /^(?:https?:\/\/)?(?:www\.)?(?:vimeo\.com|player\.vimeo\.com\/video)\/(\d+)(?:[?/].*)?$/;

const LOOM_RE =
  /^(?:https?:\/\/)?(?:www\.)?loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)(?:[?/].*)?$/;

const DAILYMOTION_RE =
  /^(?:https?:\/\/)?(?:www\.)?(?:dailymotion\.com\/(?:video|embed\/video)|dai\.ly)\/([a-zA-Z0-9]+)(?:[?_].*)?$/;

const VIDEO_FILE_EXT_RE =
  /\.(mp4|webm|ogv|ogg|mov|m4v|avi|mkv)(?:\?.*)?(?:#.*)?$/i;

/**
 * An embed provider turns a pasted URL into an iframe `src`, or returns null
 * when the URL is not one of its own.
 */
export interface EmbedProvider {
  id: string;
  match: (url: string) => string | null;
}

/**
 * A provider an instance adds through the backend `EMBED_PROVIDERS` setting:
 * `pattern` is matched against the URL, and `{1}`..`{9}` in `src` take its
 * groups.
 */
export interface ConfiguredEmbedProvider {
  id: string;
  pattern: string;
  src: string;
}

const fromRegex =
  (re: RegExp, buildSrc: (id: string) => string) => (url: string) => {
    const match = url.match(re);
    return match ? buildSrc(match[1]) : null;
  };

export const EMBED_PROVIDERS: EmbedProvider[] = [
  {
    id: 'youtube',
    match: (url) => {
      const id = getYouTubeId(url);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    },
  },
  {
    id: 'vimeo',
    match: fromRegex(VIMEO_RE, (id) => `https://player.vimeo.com/video/${id}`),
  },
  {
    id: 'loom',
    match: fromRegex(LOOM_RE, (id) => `https://www.loom.com/embed/${id}`),
  },
  {
    id: 'dailymotion',
    match: fromRegex(
      DAILYMOTION_RE,
      (id) => `https://www.dailymotion.com/embed/video/${id}`,
    ),
  },
];

// Configured patterns come from the instance admin, but they still run on
// every pasted URL: a cap keeps a careless pattern from stalling the editor
// on a pathological input.
const MAX_CONFIGURED_URL_LENGTH = 2048;

/**
 * Build providers from the backend config. An entry whose pattern does not
 * compile, or whose src is not https, is skipped: the backend refuses them at
 * startup, this only guards against a config served by something else.
 */
export function providersFromConfig(
  configured: ConfiguredEmbedProvider[] | undefined,
): EmbedProvider[] {
  return (configured ?? []).flatMap(({ id, pattern, src }) => {
    if (!src.startsWith('https://')) {
      return [];
    }
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch {
      return [];
    }
    return [
      {
        id,
        match: (url: string) => {
          if (url.length > MAX_CONFIGURED_URL_LENGTH) {
            return null;
          }
          const match = url.match(re);
          if (!match) {
            return null;
          }
          return src.replace(/\{([1-9])\}/g, (_, group: string) =>
            encodeURIComponent(match[Number(group)] ?? ''),
          );
        },
      },
    ];
  });
}

/**
 * Detects whether a URL points at a known embed-style platform (the built-in
 * providers, then any configured ones) and returns an iframe-ready src. URLs
 * that look like direct video files, or are unrecognised, are returned as-is
 * and rendered through the native HTML5 `<video>` element.
 */
export function parseEmbedUrl(
  url: string,
  extraProviders: EmbedProvider[] = [],
): ParsedEmbed {
  const trimmed = (url || '').trim();
  if (!trimmed) {
    return { kind: 'video', src: '' };
  }

  for (const provider of [...EMBED_PROVIDERS, ...extraProviders]) {
    const src = provider.match(trimmed);
    if (src) {
      return { kind: 'iframe', src };
    }
  }

  if (VIDEO_FILE_EXT_RE.test(trimmed)) {
    return { kind: 'video', src: trimmed };
  }

  // Fallback: render as <video>. Keeps backwards compatibility with existing
  // documents that store signed/extension-less direct video URLs.
  return { kind: 'video', src: trimmed };
}
