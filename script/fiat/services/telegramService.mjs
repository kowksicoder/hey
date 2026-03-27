import { isAddress } from "viem";
import {
  getIdempotencyRecord,
  saveIdempotencyRecord
} from "./serviceHelpers.mjs";

const TELEGRAM_API_BASE = "https://api.telegram.org";
const NAIRA_SYMBOL = "₦";

const normalizeNumber = (value) => {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseFloat(
          String(value ?? "")
            .replace(/,/g, "")
            .trim()
        );

  return Number.isFinite(parsed) ? parsed : null;
};

const sanitizeHandle = (value) => {
  const trimmed = String(value || "").trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
};

const formatShortAddress = (value) => {
  const normalized = String(value || "");

  if (normalized.length < 10) {
    return normalized || "Unknown";
  }

  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
};

const formatProfileLabel = (profile) => {
  const handle = sanitizeHandle(profile?.username);

  if (handle) {
    return `@${handle}`;
  }

  const displayName = String(profile?.display_name || "").trim();

  if (displayName) {
    return displayName;
  }

  return formatShortAddress(profile?.wallet_address);
};

const formatNaira = (value) => {
  const numeric = normalizeNumber(value);

  if (!numeric) {
    return `${NAIRA_SYMBOL}0`;
  }

  const maximumFractionDigits = numeric >= 100 ? 0 : 2;
  return `${NAIRA_SYMBOL}${numeric.toLocaleString("en-NG", {
    maximumFractionDigits,
    minimumFractionDigits: 0
  })}`;
};

const formatTokenAmount = (value, symbol) => {
  const numeric = normalizeNumber(value);
  const label = String(symbol || "COIN").trim() || "COIN";

  if (!numeric) {
    return `0 ${label}`;
  }

  return `${numeric.toLocaleString("en-US", {
    maximumFractionDigits: numeric >= 1000 ? 0 : numeric >= 1 ? 2 : 4,
    minimumFractionDigits: 0
  })} ${label}`;
};

const formatLaunchType = (value) => {
  const normalized = String(value || "creator")
    .trim()
    .toLowerCase();

  if (normalized === "community") {
    return "Community coin";
  }

  if (normalized === "collaboration") {
    return "Collaboration coin";
  }

  return "Creator coin";
};

const formatSource = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized === "swap") {
    return "Swap";
  }

  if (normalized === "coin_page") {
    return "Coin page";
  }

  if (normalized === "naira_buy") {
    return "Naira buy";
  }

  if (normalized === "naira_sell") {
    return "Naira sell";
  }

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
};

const createAbsoluteUrl = (appOrigin, pathname) =>
  `${String(appOrigin || "").replace(/\/+$/, "")}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;

export const createTelegramService = ({
  appOrigin,
  marketPriceClient = null,
  supabase,
  telegramBotToken = null,
  telegramChannelId = null
}) => {
  const isEnabled = () =>
    Boolean(
      supabase && telegramBotToken && String(telegramChannelId || "").trim()
    );

  const sendMessage = async ({
    idempotencyKey,
    payload,
    profileId = null,
    scope,
    text
  }) => {
    if (!isEnabled()) {
      return {
        messageId: null,
        skipped: true,
        success: false
      };
    }

    const existingRecord = await getIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      scope,
      supabase
    });

    if (existingRecord?.response_body) {
      return existingRecord.response_body;
    }

    const response = await fetch(
      `${TELEGRAM_API_BASE}/bot${telegramBotToken}/sendMessage`,
      {
        body: JSON.stringify({
          chat_id: telegramChannelId,
          disable_web_page_preview: false,
          text
        }),
        headers: {
          accept: "application/json",
          "content-type": "application/json"
        },
        method: "POST"
      }
    );

    const responsePayload = await response.json().catch(() => null);

    if (!response.ok || !responsePayload?.ok) {
      const error = new Error(
        responsePayload?.description ||
          `Telegram send failed with ${response.status}`
      );
      error.statusCode = 502;
      throw error;
    }

    const result = {
      messageId: responsePayload.result?.message_id || null,
      payload,
      skipped: false,
      success: true
    };

    await saveIdempotencyRecord({
      key: idempotencyKey,
      profileId,
      responseBody: result,
      responseStatus: 200,
      scope,
      supabase
    });

    return result;
  };

  const resolveTradeNairaValue = async ({
    ethAmount = null,
    nairaAmount = null
  }) => {
    const directAmount = normalizeNumber(nairaAmount);

    if (directAmount && directAmount > 0) {
      return Number(directAmount.toFixed(2));
    }

    const normalizedEthAmount = normalizeNumber(ethAmount);

    if (!normalizedEthAmount || !marketPriceClient) {
      return null;
    }

    const ethNgnPrice = await marketPriceClient.getEthNgnPrice();
    const computedAmount = normalizedEthAmount * ethNgnPrice;

    return Number.isFinite(computedAmount)
      ? Number(computedAmount.toFixed(2))
      : null;
  };

  const isFirstLaunchForProfile = async (profileId) => {
    if (!supabase || !profileId) {
      return false;
    }

    const { count, error } = await supabase
      .from("creator_launches")
      .select("id", { count: "exact", head: true })
      .eq("created_by", profileId)
      .eq("status", "launched");

    if (error) {
      throw error;
    }

    return Number(count || 0) === 1;
  };

  const announceCoinLaunch = async ({
    category = null,
    coinAddress,
    coinName,
    coinSymbol,
    launchType = "creator",
    profile
  }) => {
    if (!profile?.id || !coinAddress || !isAddress(coinAddress)) {
      return {
        coin: null,
        creator: null,
        success: false
      };
    }

    const creatorLabel = formatProfileLabel(profile);
    const profileUrl = sanitizeHandle(profile.username)
      ? createAbsoluteUrl(appOrigin, `/@${sanitizeHandle(profile.username)}`)
      : createAbsoluteUrl(
          appOrigin,
          `/account/${String(profile.wallet_address || "").toLowerCase()}`
        );
    const coinUrl = createAbsoluteUrl(appOrigin, `/coins/${coinAddress}`);
    const coinLabel = coinSymbol
      ? `${coinName} (${String(coinSymbol).toUpperCase()})`
      : coinName;
    const normalizedCategory = String(category || "Creator").trim();
    const coinResult = await sendMessage({
      idempotencyKey: `telegram:coin-launch:${coinAddress.toLowerCase()}`,
      payload: {
        category: normalizedCategory,
        coinAddress,
        coinName,
        coinSymbol,
        creator: creatorLabel,
        launchType
      },
      profileId: profile.id,
      scope: "telegram_coin_launch",
      text: [
        "NEW COIN",
        `${coinLabel} just launched on Every1.`,
        `Creator: ${creatorLabel}`,
        `Type: ${formatLaunchType(launchType)}`,
        `Category: ${normalizedCategory}`,
        `Trade now: ${coinUrl}`
      ].join("\n")
    });

    let creatorResult = null;

    if (await isFirstLaunchForProfile(profile.id)) {
      creatorResult = await sendMessage({
        idempotencyKey: `telegram:new-creator:${profile.id}`,
        payload: {
          coinAddress,
          creator: creatorLabel,
          firstCoin: coinLabel
        },
        profileId: profile.id,
        scope: "telegram_new_creator",
        text: [
          "NEW CREATOR",
          `${creatorLabel} just launched a first coin on Every1.`,
          `First coin: ${coinLabel}`,
          `Profile: ${profileUrl}`,
          `Coin: ${coinUrl}`
        ].join("\n")
      });
    }

    return {
      coin: coinResult,
      creator: creatorResult,
      success: true
    };
  };

  const announceTrade = async ({
    coinAddress,
    coinName,
    coinSymbol,
    ethAmount = null,
    nairaAmount = null,
    profile,
    source = null,
    tokenAmount = null,
    tokenAmountLabel = null,
    tradeSide,
    transactionHash
  }) => {
    if (
      !profile?.id ||
      !coinAddress ||
      !isAddress(coinAddress) ||
      !transactionHash
    ) {
      return {
        success: false,
        trade: null
      };
    }

    const side = String(tradeSide || "")
      .trim()
      .toLowerCase();
    const normalizedSide = side === "sell" ? "sell" : "buy";
    const creatorLabel = formatProfileLabel(profile);
    const coinUrl = createAbsoluteUrl(appOrigin, `/coins/${coinAddress}`);
    const tradeValueNaira = await resolveTradeNairaValue({
      ethAmount,
      nairaAmount
    });
    const tokenLabel = tokenAmountLabel
      ? tokenAmountLabel
      : normalizeNumber(tokenAmount)
        ? formatTokenAmount(tokenAmount, coinSymbol || coinName)
        : null;

    const tradeResult = await sendMessage({
      idempotencyKey: `telegram:trade:${transactionHash.toLowerCase()}`,
      payload: {
        coinAddress,
        coinName,
        coinSymbol,
        source,
        tradeSide: normalizedSide,
        transactionHash,
        valueNaira: tradeValueNaira
      },
      profileId: profile.id,
      scope: "telegram_trade",
      text: [
        "NEW TRADE",
        `${creatorLabel} ${normalizedSide === "buy" ? "bought" : "sold"} ${coinSymbol || coinName}.`,
        tradeValueNaira ? `Value: ${formatNaira(tradeValueNaira)}` : null,
        tokenLabel ? `Size: ${tokenLabel}` : null,
        formatSource(source) ? `Source: ${formatSource(source)}` : null,
        `Coin: ${coinName}${coinSymbol ? ` (${String(coinSymbol).toUpperCase()})` : ""}`,
        `View coin: ${coinUrl}`
      ]
        .filter(Boolean)
        .join("\n")
    });

    return {
      success: true,
      trade: tradeResult
    };
  };

  return {
    announceCoinLaunch,
    announceTrade,
    isEnabled
  };
};

export default createTelegramService;
