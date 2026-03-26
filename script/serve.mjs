import { createReadStream, existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { getCoin, setApiKey as setZoraApiKey } from "@zoralabs/coins-sdk";
import { isAddress } from "viem";
import { createCollaborationRuntime } from "./collaborationRuntime.mjs";
import { createFanDropRuntime } from "./fandropRuntime.mjs";
import { createFiatRuntime } from "./fiatRuntime.mjs";
import { createProfileShareRuntime } from "./profileShareRuntime.mjs";
import { createPushRuntime } from "./pushRuntime.mjs";
import { createVerificationRuntime } from "./verificationRuntime.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const distDir = path.join(rootDir, "dist");
const indexHtmlPath = path.join(distDir, "index.html");
const collaborationRuntime = createCollaborationRuntime({ rootDir });
const fanDropRuntime = createFanDropRuntime({ rootDir });
const fiatRuntime = createFiatRuntime({ rootDir });
const profileShareRuntime = createProfileShareRuntime({ rootDir });
const pushRuntime = createPushRuntime({ rootDir });
const verificationRuntime = createVerificationRuntime({ rootDir });

const DEFAULT_META = {
  description:
    "Every1 is a creator-first social app for profiles, coins, and community.",
  image: "/evlogo.jpg",
  title: "Every1",
  type: "website",
  url: "/"
};

const BASE_APP_ID_META_TAG =
  '<meta name="base:app_id" content="694fcee74d3a403912ed823a">';

const STATIC_ROUTE_META = {
  "/": {
    description: "Discover creator coins, profiles, and communities on Every1.",
    image: "/buycoin.png",
    title: "Explore - Every1"
  },
  "/create": {
    description: "Launch a creator coin and publish it on Every1.",
    image: "/buycoin.png",
    title: "Create - Every1"
  },
  "/creators": {
    description: "Discover featured creators and creator coins on Every1.",
    image: "/buycoin.png",
    title: "Creators - Every1"
  },
  "/groups": {
    description: "Discover and join communities across Every1.",
    image: "/evlogo.jpg",
    title: "Groups - Every1"
  },
  "/leaderboard": {
    description: "Track the top creator traders and movers on Every1.",
    image: "/buycoin.png",
    title: "Leaderboard - Every1"
  },
  "/referrals": {
    description: "Invite friends and earn rewards on Every1.",
    image: "/evlogo.jpg",
    title: "Referrals - Every1"
  },
  "/showcase": {
    description: "Product stories and platform updates from Every1.",
    image: "/photo_2026-03-19_02-27-35.jpg",
    title: "Showcase - Every1"
  },
  "/streaks": {
    description: "Track your streak rewards and E1XP progress on Every1.",
    image: "/photo_2026-03-16_20-34-17.jpg",
    title: "Streaks - Every1"
  },
  "/swap": {
    description: "Swap creator coins and manage positions on Every1.",
    image: "/buycoin.png",
    title: "Swap - Every1"
  },
  "/wallet": {
    description: "Manage deposits, balances, and transfers on Every1.",
    image: "/evlogo.jpg",
    title: "Wallet - Every1"
  }
};

const SHOWCASE_FALLBACK_POSTS = {
  "designing-a-better-home-for-creators": {
    description:
      "How creator coins, discovery rails, and showcase storytelling can work together across the platform.",
    image: "/buycoin.png",
    title: "Designing a better home for creators"
  },
  "inside-the-new-every1-mobile-experience": {
    description:
      "A quick look at the latest feed, mobile create flow, and creator-first UI updates shipping across Every1.",
    image: "/photo_2026-03-19_02-27-35.jpg",
    title: "Inside the new Every1 mobile experience"
  },
  "whats-next-for-the-every1-community-layer": {
    description:
      "A preview of the community loops we want to bring in next, from missions to streaks to better onboarding.",
    image: "/photo_2026-03-16_20-34-17.jpg",
    title: "What's next for the Every1 community layer"
  }
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

const LENS_API_URL = "https://api.lens.xyz/graphql";
const IPFS_GATEWAY = "https://gw.ipfs-lens.dev/ipfs/";
const STORAGE_NODE_URL = "https://api.grove.storage/";
const BASE_CHAIN_ID = 8453;

const stripQuotes = (value) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

const loadEnvFile = (filePath) => {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = stripQuotes(trimmed.slice(separatorIndex + 1).trim());

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
};

loadEnvFile(path.join(rootDir, ".env"));
loadEnvFile(path.join(rootDir, ".env.local"));

const zoraApiKey =
  process.env.VITE_NEXT_PUBLIC_ZORA_API_KEY ||
  process.env.VITE_ZORA_API_KEY ||
  process.env.ZORA_API_KEY;

if (zoraApiKey) {
  setZoraApiKey(zoraApiKey);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
    : null;

const normalizeHandle = (value) => {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const withoutPrefix = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  const lastSegment = withoutPrefix.split("/").pop()?.trim() || withoutPrefix;

  return lastSegment || null;
};

const sanitizeStorageUrl = (value) => {
  if (!value) {
    return "";
  }

  if (/^Qm[1-9A-Za-z]{44}/.test(value)) {
    return `${IPFS_GATEWAY}${value}`;
  }

  return value
    .replace("https://ipfs.io/ipfs/", IPFS_GATEWAY)
    .replace("ipfs://ipfs/", IPFS_GATEWAY)
    .replace("ipfs://", IPFS_GATEWAY)
    .replace("lens://", STORAGE_NODE_URL)
    .replace("ar://", "https://gateway.arweave.net/");
};

const escapeHtml = (value = "") =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const cleanWhitespace = (value) => value?.replace(/\s+/g, " ").trim() || "";

const truncateWords = (value, wordLimit = 18) => {
  const words = cleanWhitespace(value).split(" ").filter(Boolean);

  if (words.length <= wordLimit) {
    return words.join(" ");
  }

  return `${words.slice(0, wordLimit).join(" ")}...`;
};

const formatShortAddress = (value) => {
  if (!value || value.length < 10) {
    return value || "";
  }

  return `${value.slice(0, 6)}...${value.slice(-4)}`;
};

const getRequestOrigin = (request) => {
  const configuredOrigin =
    process.env.VITE_APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  const forwardedProto = request.headers["x-forwarded-proto"];
  const protocol =
    typeof forwardedProto === "string" ? forwardedProto.split(",")[0] : "http";
  const requestOrigin = `${protocol}://${request.headers.host}`;

  if (configuredOrigin) {
    const normalizedConfiguredOrigin = configuredOrigin.replace(/\/+$/, "");

    try {
      const configuredUrl = new URL(normalizedConfiguredOrigin);
      const isLocalConfiguredHost = ["127.0.0.1", "localhost"].includes(
        configuredUrl.hostname
      );

      if (
        isLocalConfiguredHost &&
        configuredUrl.host !== request.headers.host
      ) {
        return requestOrigin;
      }
    } catch {
      return normalizedConfiguredOrigin;
    }

    return normalizedConfiguredOrigin;
  }

  return requestOrigin;
};

const toAbsoluteUrl = (origin, value) => {
  if (!value) {
    return `${origin}/`;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `${origin}${value.startsWith("/") ? value : `/${value}`}`;
};

const buildMeta = (origin, meta) => ({
  description: meta.description || DEFAULT_META.description,
  image: toAbsoluteUrl(origin, meta.image || DEFAULT_META.image),
  title: meta.title || DEFAULT_META.title,
  type: meta.type || DEFAULT_META.type,
  url: toAbsoluteUrl(origin, meta.url || DEFAULT_META.url)
});

const stripSeoTags = (html) =>
  html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="title"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/gi, "")
    .replace(/<meta\s+property="og:[^"]+"[^>]*>\s*/gi, "")
    .replace(/<meta\s+name="twitter:[^"]+"[^>]*>\s*/gi, "")
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, "");

const injectMeta = (html, meta) => {
  const strippedHtml = stripSeoTags(html);
  const baseAppMeta = strippedHtml.includes('name="base:app_id"')
    ? ""
    : `${BASE_APP_ID_META_TAG}\n    `;
  const metaBlock = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="title" content="${escapeHtml(meta.title)}">`,
    `<meta name="description" content="${escapeHtml(meta.description)}">`,
    `<link rel="canonical" href="${escapeHtml(meta.url)}">`,
    `<meta property="og:site_name" content="Every1">`,
    `<meta property="og:type" content="${escapeHtml(meta.type)}">`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}">`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}">`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}">`,
    `<meta property="og:image" content="${escapeHtml(meta.image)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:url" content="${escapeHtml(meta.url)}">`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(meta.image)}">`
  ].join("\n    ");

  return strippedHtml.replace(
    "</head>",
    `    ${baseAppMeta}${metaBlock}\n  </head>`
  );
};

const queryLens = async (query, variables) => {
  const response = await fetch(LENS_API_URL, {
    body: JSON.stringify({ query, variables }),
    headers: {
      "content-type": "application/json",
      origin: "https://hey.xyz"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(`Lens request failed with status ${response.status}`);
  }

  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || "Lens request failed.");
  }

  return payload.data;
};

const fetchLensAccount = async ({ address, username }) => {
  const request = address
    ? { address }
    : { username: { localName: normalizeHandle(username) } };

  const data = await queryLens(
    `
      query AccountMeta($request: AccountRequest!) {
        account(request: $request) {
          address
          owner
          metadata {
            bio
            coverPicture
            name
            picture
          }
          username(request: { autoResolve: true }) {
            localName
            value
          }
        }
      }
    `,
    { request }
  );

  const account = data?.account;

  if (!account) {
    return null;
  }

  return {
    address: account.address || address || null,
    avatarUrl: sanitizeStorageUrl(account.metadata?.picture),
    bannerUrl: sanitizeStorageUrl(account.metadata?.coverPicture),
    bio: account.metadata?.bio || null,
    displayName: account.metadata?.name || null,
    handle: normalizeHandle(
      account.username?.localName || account.username?.value || username
    ),
    walletAddress: account.owner || null
  };
};

const fetchSupabaseProfile = async ({ address, username }) => {
  if (!supabase) {
    return null;
  }

  const normalizedAddress = address?.trim().toLowerCase() || null;
  const normalizedHandle = normalizeHandle(username)?.toLowerCase() || null;

  if (normalizedAddress) {
    for (const column of ["wallet_address", "lens_account_address"]) {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "username, zora_handle, display_name, bio, avatar_url, banner_url, wallet_address, lens_account_address"
        )
        .ilike(column, normalizedAddress)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        return data;
      }
    }
  }

  if (normalizedHandle) {
    for (const column of ["username", "zora_handle"]) {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "username, zora_handle, display_name, bio, avatar_url, banner_url, wallet_address, lens_account_address"
        )
        .ilike(column, normalizedHandle)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        return data;
      }
    }
  }

  return null;
};

const resolveProfile = async ({ address, username }) => {
  const supabaseProfile = await fetchSupabaseProfile({
    address,
    username
  }).catch(() => null);

  if (supabaseProfile) {
    return {
      address:
        supabaseProfile.lens_account_address ||
        supabaseProfile.wallet_address ||
        address ||
        null,
      avatarUrl: sanitizeStorageUrl(supabaseProfile.avatar_url),
      bannerUrl: sanitizeStorageUrl(supabaseProfile.banner_url),
      bio: supabaseProfile.bio || null,
      displayName: supabaseProfile.display_name || null,
      handle: normalizeHandle(
        supabaseProfile.username || supabaseProfile.zora_handle || username
      ),
      walletAddress: supabaseProfile.wallet_address || null
    };
  }

  return fetchLensAccount({ address, username }).catch(() => null);
};

const extractAttachmentImage = (attachments = []) => {
  for (const attachment of attachments) {
    if (attachment?.item) {
      return sanitizeStorageUrl(attachment.item);
    }

    if (attachment?.cover) {
      return sanitizeStorageUrl(attachment.cover);
    }
  }

  return "";
};

const extractPostPreview = (metadata) => {
  if (!metadata) {
    return { content: "", image: "" };
  }

  switch (metadata.__typename) {
    case "ArticleMetadata":
    case "CheckingInMetadata":
    case "EmbedMetadata":
    case "EventMetadata":
    case "LinkMetadata":
    case "MintMetadata":
    case "TransactionMetadata":
    case "ThreeDMetadata":
      return {
        content: cleanWhitespace(metadata.content),
        image: extractAttachmentImage(metadata.attachments)
      };
    case "TextOnlyMetadata":
    case "StoryMetadata":
      return { content: cleanWhitespace(metadata.content), image: "" };
    case "ImageMetadata":
      return {
        content: cleanWhitespace(metadata.content),
        image:
          sanitizeStorageUrl(metadata.image?.item) ||
          extractAttachmentImage(metadata.attachments)
      };
    case "AudioMetadata":
      return {
        content: cleanWhitespace(metadata.content),
        image:
          sanitizeStorageUrl(metadata.audio?.cover) ||
          extractAttachmentImage(metadata.attachments)
      };
    case "VideoMetadata":
      return {
        content: cleanWhitespace(metadata.content),
        image:
          sanitizeStorageUrl(metadata.video?.cover) ||
          extractAttachmentImage(metadata.attachments)
      };
    default:
      return { content: "", image: "" };
  }
};

const MEDIA_FRAGMENT = `
  fragment ShareMediaFields on AnyMedia {
    ... on MediaImage { item }
    ... on MediaVideo { item cover }
    ... on MediaAudio { item cover }
  }
`;

const AUTHOR_FRAGMENT = `
  fragment ShareAuthorFields on Account {
    address
    owner
    metadata {
      name
      picture
    }
    username(request: { autoResolve: true }) {
      localName
      value
    }
  }
`;

const POST_METADATA_FRAGMENT = `
  fragment SharePostMetadataFields on PostMetadata {
    __typename
    ... on TextOnlyMetadata { content }
    ... on StoryMetadata { content }
    ... on ArticleMetadata { content attachments { ...ShareMediaFields } }
    ... on CheckingInMetadata { content attachments { ...ShareMediaFields } }
    ... on EmbedMetadata { content attachments { ...ShareMediaFields } }
    ... on EventMetadata { content attachments { ...ShareMediaFields } }
    ... on LinkMetadata { content attachments { ...ShareMediaFields } }
    ... on MintMetadata { content attachments { ...ShareMediaFields } }
    ... on TransactionMetadata { content attachments { ...ShareMediaFields } }
    ... on ThreeDMetadata { content attachments { ...ShareMediaFields } }
    ... on ImageMetadata {
      content
      image { item }
      attachments { ...ShareMediaFields }
    }
    ... on AudioMetadata {
      content
      audio { cover }
      attachments { ...ShareMediaFields }
    }
    ... on VideoMetadata {
      content
      video { cover }
      attachments { ...ShareMediaFields }
    }
  }
`;

const POST_FRAGMENT = `
  fragment SharePostFields on Post {
    slug
    author { ...ShareAuthorFields }
    metadata { ...SharePostMetadataFields }
  }
`;

const fetchLensPost = async (slug) => {
  const query = `
    ${MEDIA_FRAGMENT}
    ${AUTHOR_FRAGMENT}
    ${POST_METADATA_FRAGMENT}
    ${POST_FRAGMENT}
    query PostMeta($request: PostRequest!) {
      post(request: $request) {
        __typename
        ... on Post { ...SharePostFields }
        ... on Repost {
          repostOf { ...SharePostFields }
        }
      }
    }
  `;

  const data = await queryLens(query, { request: { post: slug } });
  const lensPost = data?.post;

  if (!lensPost) {
    return null;
  }

  return lensPost.__typename === "Repost"
    ? lensPost.repostOf || null
    : lensPost;
};

const fetchShowcasePost = async (slug) => {
  if (supabase) {
    const { data, error } = await supabase.rpc("get_public_showcase_posts");

    if (!error) {
      const matchedPost = (data || []).find((entry) => entry.slug === slug);

      if (matchedPost) {
        return {
          description: matchedPost.description,
          image:
            matchedPost.cover_image_url ||
            SHOWCASE_FALLBACK_POSTS[matchedPost.slug]?.image ||
            DEFAULT_META.image,
          title: matchedPost.title
        };
      }
    }
  }

  return SHOWCASE_FALLBACK_POSTS[slug] || null;
};

const fetchCommunityBySlug = async (slug) => {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.rpc("get_community_by_slug", {
    input_profile_id: null,
    input_slug: slug
  });

  if (error) {
    throw error;
  }

  return data?.[0] || null;
};

const buildProfileMeta = async ({ address, origin, pathname, username }) => {
  const profile = await resolveProfile({ address, username });

  if (!profile) {
    return {
      meta: buildMeta(origin, {
        description: DEFAULT_META.description,
        image: DEFAULT_META.image,
        title: "Profile - Every1",
        type: "profile",
        url: pathname
      })
    };
  }

  const handle = profile.handle;
  const canonicalPath = handle ? `/@${handle}` : pathname;
  const displayHandle = handle
    ? `@${handle}`
    : formatShortAddress(profile.address || profile.walletAddress);
  const titleName = profile.displayName || displayHandle || "Profile";

  return {
    meta: buildMeta(origin, {
      description:
        cleanWhitespace(profile.bio) ||
        `View ${displayHandle || titleName}'s public profile on Every1.`,
      image: profileShareRuntime.buildProfileShareCardPath({
        address: profile.walletAddress || profile.address,
        handle
      }),
      title: `${titleName}${displayHandle ? ` (${displayHandle})` : ""} - Every1`,
      type: "profile",
      url: canonicalPath
    }),
    redirectPath: null
  };
};

const fetchCoinByAddress = async (address) => {
  if (!isAddress(address)) {
    return null;
  }

  const response = await getCoin({
    address,
    chain: BASE_CHAIN_ID
  }).catch(() => null);

  return response?.data?.zora20Token || null;
};

const getCoinMetaImage = (coin) =>
  sanitizeStorageUrl(
    coin?.mediaContent?.previewImage?.medium ||
      coin?.mediaContent?.previewImage?.small ||
      coin?.creatorProfile?.avatar?.previewImage?.medium ||
      coin?.creatorProfile?.avatar?.previewImage?.small ||
      DEFAULT_META.image
  );

const getCoinCreatorLabel = (coin) => {
  const handle = normalizeHandle(coin?.creatorProfile?.handle);

  if (handle) {
    return `@${handle}`;
  }

  return formatShortAddress(coin?.creatorAddress);
};

const buildCoinMeta = async ({ address, origin, pathname }) => {
  const coin = await fetchCoinByAddress(address).catch(() => null);

  if (!coin) {
    return {
      meta: buildMeta(origin, {
        description: "Review live coin stats and open the Every1 trade flow.",
        image: DEFAULT_META.image,
        title: "Trade coin - Every1",
        type: "website",
        url: pathname
      })
    };
  }

  const symbol = coin.symbol?.trim();
  const name = coin.name?.trim() || symbol || "Coin";
  const creatorLabel = getCoinCreatorLabel(coin);
  const description =
    cleanWhitespace(coin.description) ||
    `${name}${creatorLabel ? ` from ${creatorLabel}` : ""} is live on Every1.`;

  return {
    meta: buildMeta(origin, {
      description,
      image: getCoinMetaImage(coin),
      title: symbol ? `${name} ($${symbol}) - Every1` : `${name} - Every1`,
      type: "website",
      url: pathname
    })
  };
};

const buildPostMeta = async ({ origin, pathname, quotesMode, slug }) => {
  const post = await fetchLensPost(slug).catch(() => null);

  if (!post) {
    return {
      meta: buildMeta(origin, {
        description: "View this post on Every1.",
        image: DEFAULT_META.image,
        title: "Post - Every1",
        type: quotesMode ? "website" : "article",
        url: pathname
      })
    };
  }

  const authorHandle = normalizeHandle(
    post.author?.username?.localName || post.author?.username?.value
  );
  const displayHandle = authorHandle
    ? `@${authorHandle}`
    : formatShortAddress(post.author?.address || post.author?.owner);
  const titleName =
    cleanWhitespace(post.author?.metadata?.name) || displayHandle || "Every1";
  const preview = extractPostPreview(post.metadata);
  const description =
    preview.content ||
    `View this post from ${displayHandle || titleName} on Every1.`;
  const image =
    preview.image ||
    sanitizeStorageUrl(post.author?.metadata?.picture) ||
    DEFAULT_META.image;

  return {
    meta: buildMeta(origin, {
      description,
      image,
      title: quotesMode
        ? `Quotes for ${displayHandle || titleName} - Every1`
        : preview.content
          ? `${truncateWords(preview.content, 14)} - Every1`
          : `Post by ${displayHandle || titleName} - Every1`,
      type: quotesMode ? "website" : "article",
      url: pathname
    })
  };
};

const buildShowcaseMeta = async ({ origin, pathname, slug }) => {
  const post = await fetchShowcasePost(slug).catch(() => null);

  if (!post) {
    return {
      meta: buildMeta(origin, {
        ...STATIC_ROUTE_META["/showcase"],
        title: "Showcase - Every1",
        type: "article",
        url: pathname
      })
    };
  }

  return {
    meta: buildMeta(origin, {
      description: post.description || "Every1 showcase story.",
      image: post.image || STATIC_ROUTE_META["/showcase"].image,
      title: `${post.title} - Every1`,
      type: "article",
      url: pathname
    })
  };
};

const buildCommunityMeta = async ({ origin, pathname, slug }) => {
  const community = await fetchCommunityBySlug(slug).catch(() => null);

  if (!community) {
    return {
      meta: buildMeta(origin, {
        description: "View this community on Every1.",
        image: DEFAULT_META.image,
        title: "Community - Every1",
        type: "website",
        url: pathname
      })
    };
  }

  return {
    meta: buildMeta(origin, {
      description:
        cleanWhitespace(community.description) ||
        `${community.name} community on Every1.`,
      image:
        sanitizeStorageUrl(community.banner_url) ||
        sanitizeStorageUrl(community.avatar_url) ||
        DEFAULT_META.image,
      title: `${community.name} - Every1`,
      type: "website",
      url: pathname
    })
  };
};

const resolveRouteMeta = async ({ origin, pathname }) => {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  const usernameMatch =
    normalizedPath.match(/^\/@([^/]+)$/) ||
    normalizedPath.match(/^\/u\/([^/]+)$/);

  if (usernameMatch) {
    return buildProfileMeta({
      origin,
      pathname: normalizedPath,
      username: decodeURIComponent(usernameMatch[1])
    });
  }

  const addressMatch = normalizedPath.match(/^\/account\/([^/]+)$/);

  if (addressMatch) {
    return buildProfileMeta({
      address: decodeURIComponent(addressMatch[1]),
      origin,
      pathname: normalizedPath
    });
  }

  const postMatch = normalizedPath.match(/^\/posts\/([^/]+)(?:\/quotes)?$/);

  if (postMatch) {
    return buildPostMeta({
      origin,
      pathname: normalizedPath,
      quotesMode: normalizedPath.endsWith("/quotes"),
      slug: decodeURIComponent(postMatch[1])
    });
  }

  const showcaseMatch = normalizedPath.match(/^\/showcase\/([^/]+)$/);

  if (showcaseMatch) {
    return buildShowcaseMeta({
      origin,
      pathname: normalizedPath,
      slug: decodeURIComponent(showcaseMatch[1])
    });
  }

  const communityMatch = normalizedPath.match(/^\/g\/([^/]+)$/);

  if (communityMatch) {
    return buildCommunityMeta({
      origin,
      pathname: normalizedPath,
      slug: decodeURIComponent(communityMatch[1])
    });
  }

  const coinMatch = normalizedPath.match(/^\/coins\/([^/]+)$/);

  if (coinMatch) {
    return buildCoinMeta({
      address: decodeURIComponent(coinMatch[1]),
      origin,
      pathname: normalizedPath
    });
  }

  const staticMeta = STATIC_ROUTE_META[normalizedPath];

  if (staticMeta) {
    return { meta: buildMeta(origin, { ...staticMeta, url: normalizedPath }) };
  }

  return { meta: buildMeta(origin, { url: normalizedPath }) };
};

const sendFile = (request, response, filePath) => {
  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || "application/octet-stream";

  response.writeHead(200, { "content-type": contentType });

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
};

const serve = async () => {
  if (!existsSync(indexHtmlPath)) {
    throw new Error("dist/index.html not found. Run `pnpm build` first.");
  }

  const htmlTemplate = await readFile(indexHtmlPath, "utf8");
  const port = Number(process.env.PORT || 4783);

  collaborationRuntime.start();
  fiatRuntime.start();
  pushRuntime.start();
  verificationRuntime.start();
  fanDropRuntime.start();

  const server = http.createServer(async (request, response) => {
    try {
      const collaborationHandled = await collaborationRuntime.handleApiRequest(
        request,
        response
      );

      if (collaborationHandled) {
        return;
      }

      const fiatHandled = await fiatRuntime.handleApiRequest(request, response);

      if (fiatHandled) {
        return;
      }

      const pushHandled = await pushRuntime.handleApiRequest(request, response);

      if (pushHandled) {
        return;
      }

      const verificationHandled = await verificationRuntime.handleApiRequest(
        request,
        response
      );

      if (verificationHandled) {
        return;
      }

      const fanDropHandled = await fanDropRuntime.handleApiRequest(
        request,
        response
      );

      if (fanDropHandled) {
        return;
      }

      const profileShareHandled = await profileShareRuntime.handleRequest(
        request,
        response
      );

      if (profileShareHandled) {
        return;
      }

      const requestUrl = new URL(request.url || "/", "http://localhost");
      const pathname = decodeURIComponent(requestUrl.pathname);
      const relativeFilePath = pathname.replace(/^\/+/, "");
      const filePath = path.resolve(distDir, relativeFilePath);
      const relativeFromDist = path.relative(distDir, filePath);
      const isInsideDist =
        Boolean(relativeFromDist) &&
        !relativeFromDist.startsWith("..") &&
        !path.isAbsolute(relativeFromDist);

      if (
        pathname !== "/" &&
        isInsideDist &&
        existsSync(filePath) &&
        Boolean(path.extname(filePath))
      ) {
        sendFile(request, response, filePath);
        return;
      }

      const origin = getRequestOrigin(request);
      const { meta, redirectPath } = await resolveRouteMeta({
        origin,
        pathname
      });

      if (redirectPath && redirectPath !== pathname) {
        response.writeHead(302, { location: redirectPath });
        response.end();
        return;
      }

      const html = injectMeta(htmlTemplate, meta);
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });

      if (request.method === "HEAD") {
        response.end();
        return;
      }

      response.end(html);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(
        error instanceof Error ? error.message : "Failed to serve Every1."
      );
    }
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`Every1 server listening on http://0.0.0.0:${port}`);
  });
};

void serve();
