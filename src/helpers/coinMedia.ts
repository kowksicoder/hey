export type CoinMediaIntent = "movie" | "music" | "project";
export type CoinMediaProvider =
  | "apple_music"
  | "external"
  | "spotify"
  | "youtube";

export interface CoinMediaImportConfig {
  helperText: string;
  intent: CoinMediaIntent;
  label: string;
  placeholder: string;
}

export interface ResolvedCoinMedia {
  ctaLabel: string;
  embedHeight?: number;
  embedUrl?: string;
  kind: "audio" | "link" | "video";
  lockLabel: string;
  provider: CoinMediaProvider;
  sourceUrl: string;
  title: string;
}

const SPOTIFY_COMPACT_TYPES = new Set(["episode", "track"]);
const TEST_SPOTIFY_TRACK_SOURCE_URL =
  "https://open.spotify.com/track/5YrBnxZSRpzYHOBCUfGFw1";
const TEST_SPOTIFY_TRACK_EMBED_URL =
  "https://open.spotify.com/embed/track/5YrBnxZSRpzYHOBCUfGFw1?utm_source=generator&theme=0";
const TEST_SPOTIFY_ALBUM_SOURCE_URL =
  "https://open.spotify.com/album/6ioyq5pfnljh86aAouCAw4";
const TEST_SPOTIFY_ALBUM_EMBED_URL =
  "https://open.spotify.com/embed/album/6ioyq5pfnljh86aAouCAw4?utm_source=generator&theme=0";

const extractYouTubeId = (url: URL) => {
  if (url.hostname === "youtu.be") {
    return url.pathname.split("/").filter(Boolean)[0] || null;
  }

  if (
    url.hostname.includes("youtube.com") ||
    url.hostname.includes("youtube-nocookie.com")
  ) {
    if (url.pathname === "/watch") {
      return url.searchParams.get("v");
    }

    const segments = url.pathname.split("/").filter(Boolean);

    if (segments[0] === "embed" || segments[0] === "shorts") {
      return segments[1] || null;
    }
  }

  return null;
};

export const getCoinMediaIntent = (
  category?: null | string
): CoinMediaIntent => {
  const normalizedCategory = category?.trim().toLowerCase();

  if (normalizedCategory === "music") {
    return "music";
  }

  if (normalizedCategory === "movies") {
    return "movie";
  }

  return "project";
};

export const getMediaImportConfig = (
  category?: null | string
): CoinMediaImportConfig => {
  const intent = getCoinMediaIntent(category);

  if (intent === "music") {
    return {
      helperText:
        "Paste a Spotify, Apple Music, YouTube, or public release link.",
      intent,
      label: "Import song link",
      placeholder: "https://open.spotify.com/track/..."
    };
  }

  if (intent === "movie") {
    return {
      helperText: "Paste a YouTube trailer, teaser, or movie link.",
      intent,
      label: "Import movie/trailer link",
      placeholder: "https://www.youtube.com/watch?v=..."
    };
  }

  return {
    helperText: "Paste a link to the project, release page, teaser, or site.",
    intent,
    label: "Import project link",
    placeholder: "https://..."
  };
};

export const normalizeCoinMediaUrl = (value?: null | string) => {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  try {
    const url = new URL(trimmedValue);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
};

export const resolveCoinMedia = (
  inputUrl?: null | string,
  category?: null | string
): ResolvedCoinMedia | null => {
  const normalizedUrl = normalizeCoinMediaUrl(inputUrl);

  if (!normalizedUrl) {
    return null;
  }

  const url = new URL(normalizedUrl);
  const mediaIntent = getCoinMediaIntent(category);

  if (url.hostname.includes("open.spotify.com")) {
    const [resourceType, resourceId] = url.pathname.split("/").filter(Boolean);

    if (resourceType && resourceId) {
      const title =
        resourceType === "track"
          ? "Song"
          : resourceType === "artist"
            ? "Artist"
            : resourceType === "playlist"
              ? "Playlist"
              : "Release";

      return {
        ctaLabel: "Open in Spotify",
        embedHeight: SPOTIFY_COMPACT_TYPES.has(resourceType) ? 152 : 352,
        embedUrl: `https://open.spotify.com/embed/${resourceType}/${resourceId}`,
        kind: "audio",
        lockLabel: title.toLowerCase(),
        provider: "spotify",
        sourceUrl: normalizedUrl,
        title
      };
    }
  }

  if (
    url.hostname.includes("music.apple.com") ||
    url.hostname.includes("embed.music.apple.com")
  ) {
    const isTrackEmbed = url.searchParams.has("i");

    return {
      ctaLabel: "Open in Apple Music",
      embedHeight: isTrackEmbed ? 175 : 450,
      embedUrl: `https://embed.music.apple.com${url.pathname}${url.search}`,
      kind: "audio",
      lockLabel: isTrackEmbed ? "song" : "release",
      provider: "apple_music",
      sourceUrl: normalizedUrl,
      title: isTrackEmbed ? "Song" : "Release"
    };
  }

  const youtubeId = extractYouTubeId(url);

  if (youtubeId) {
    return {
      ctaLabel:
        mediaIntent === "movie"
          ? "Watch trailer"
          : mediaIntent === "music"
            ? "Watch video"
            : "Watch on YouTube",
      embedUrl: `https://www.youtube.com/embed/${youtubeId}`,
      kind: "video",
      lockLabel: "video",
      provider: "youtube",
      sourceUrl: normalizedUrl,
      title:
        mediaIntent === "movie"
          ? "Trailer"
          : mediaIntent === "music"
            ? "Music video"
            : "Video"
    };
  }

  return {
    ctaLabel: "Open link",
    kind: "link",
    lockLabel:
      mediaIntent === "music"
        ? "release"
        : mediaIntent === "movie"
          ? "trailer"
          : "project link",
    provider: "external",
    sourceUrl: normalizedUrl,
    title:
      mediaIntent === "music"
        ? "Release link"
        : mediaIntent === "movie"
          ? "Trailer link"
          : "Project link"
  };
};

export const getTemporaryTestCoinMedia = (
  variant: "album" | "track" = "track"
): ResolvedCoinMedia => {
  if (variant === "album") {
    return {
      ctaLabel: "Open in Spotify",
      embedHeight: 352,
      embedUrl: TEST_SPOTIFY_ALBUM_EMBED_URL,
      kind: "audio",
      lockLabel: "album",
      provider: "spotify",
      sourceUrl: TEST_SPOTIFY_ALBUM_SOURCE_URL,
      title: "Album"
    };
  }

  return {
    ctaLabel: "Open in Spotify",
    embedHeight: 152,
    embedUrl: TEST_SPOTIFY_TRACK_EMBED_URL,
    kind: "audio",
    lockLabel: "song",
    provider: "spotify",
    sourceUrl: TEST_SPOTIFY_TRACK_SOURCE_URL,
    title: "Song"
  };
};
