import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import {
  authenticateFiatReadRequest,
  authenticateFiatRequest
} from "./fiat/auth.mjs";
import { createFlutterwaveClient } from "./fiat/integrations/flutterwave.mjs";
import { createMarketPriceClient } from "./fiat/integrations/marketPrice.mjs";
import { createCreatorService } from "./fiat/services/creatorService.mjs";
import { createExecutionWalletService } from "./fiat/services/executionWalletService.mjs";
import { createSellService } from "./fiat/services/sellService.mjs";
import { createSellSettlementService } from "./fiat/services/sellSettlementService.mjs";
import { createSupportService } from "./fiat/services/supportService.mjs";
import { createSupportSettlementService } from "./fiat/services/supportSettlementService.mjs";
import { createTelegramService } from "./fiat/services/telegramService.mjs";
import { createWalletService } from "./fiat/services/walletService.mjs";
import { createWebhookService } from "./fiat/services/webhookService.mjs";
import {
  jsonResponse,
  loadEnvFile,
  parseJsonBody,
  readRawBody,
  sendError,
  toStatusCode
} from "./fiat/utils.mjs";

const getAppOrigin = () =>
  process.env.FIAT_PUBLIC_APP_URL ||
  process.env.PUBLIC_TUNNEL_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.VITE_APP_URL ||
  "http://localhost:4783";

export const createFiatRuntime = ({ rootDir }) => {
  loadEnvFile(path.join(rootDir, ".env"));
  loadEnvFile(path.join(rootDir, ".env.local"));

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  const runtimeEnabled = Boolean(supabaseUrl && serviceRoleKey);
  const ngnPerUsd = Number.parseFloat(process.env.FIAT_NGN_PER_USD || "1600");
  const supportFeeBps = Number.parseInt(
    process.env.FIAT_SUPPORT_FEE_BPS || "250",
    10
  );
  const sellFeeBps = Number.parseInt(
    process.env.FIAT_SELL_FEE_BPS || "250",
    10
  );
  const executionEnabled = process.env.EVERY1_FIAT_EXECUTION_ENABLED === "true";
  const flutterwaveConfigured = Boolean(
    process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLUTTERWAVE_API_KEY
  );
  const baseRpcUrl =
    process.env.VITE_ZORA_RPC_URL ||
    process.env.PONDER_RPC_URL_8453 ||
    "https://mainnet.base.org";
  const platformPrivateKey =
    process.env.PLATFORM_PRIVATE_KEY || process.env.PRIVATE_KEY || null;
  const platformAccount =
    platformPrivateKey && /^0x[a-fA-F0-9]{64}$/.test(platformPrivateKey)
      ? privateKeyToAccount(platformPrivateKey)
      : null;
  const supabase = runtimeEnabled
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
    : null;
  const publicClient = runtimeEnabled
    ? createPublicClient({
        chain: base,
        transport: http(baseRpcUrl)
      })
    : null;
  const platformWalletClient =
    runtimeEnabled && platformAccount
      ? createWalletClient({
          account: platformAccount,
          chain: base,
          transport: http(baseRpcUrl)
        })
      : null;

  const flutterwave = createFlutterwaveClient({
    flutterwaveSecretKey:
      process.env.FLUTTERWAVE_SECRET_KEY || process.env.FLUTTERWAVE_API_KEY,
    flutterwaveWebhookHash:
      process.env.FLUTTERWAVE_WEBHOOK_HASH ||
      process.env.FLUTTERWAVE_WEBHOOK_SECRET_HASH ||
      null
  });

  const creatorService = runtimeEnabled
    ? createCreatorService({
        ngnPerUsd: Number.isFinite(ngnPerUsd) ? ngnPerUsd : 1600,
        supabase,
        zoraApiKey:
          process.env.VITE_NEXT_PUBLIC_ZORA_API_KEY ||
          process.env.NEXT_PUBLIC_ZORA_API_KEY ||
          null
      })
    : null;
  const marketPriceClient = createMarketPriceClient({
    ethNgnOverride: process.env.FIAT_NGN_PER_ETH || null,
    ethUsdOverride: process.env.FIAT_ETH_USD_PRICE || null,
    ngnPerUsd: Number.isFinite(ngnPerUsd) ? ngnPerUsd : 1600
  });
  const supportSettlementService = runtimeEnabled
    ? createSupportSettlementService({
        executionEnabled,
        marketPriceClient,
        platformAccount,
        publicClient,
        supabase,
        telegramService: null,
        walletClient: platformWalletClient
      })
    : null;
  const sellSettlementService = runtimeEnabled
    ? createSellSettlementService({
        publicClient,
        settlementAddress: platformAccount?.address || null,
        supabase,
        telegramService: null
      })
    : null;
  const telegramService = runtimeEnabled
    ? createTelegramService({
        appOrigin: getAppOrigin(),
        marketPriceClient,
        supabase,
        telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || null,
        telegramChannelId: process.env.TELEGRAM_CHANNEL_ID || null
      })
    : null;

  if (supportSettlementService) {
    supportSettlementService.setTelegramService(telegramService);
  }

  if (sellSettlementService) {
    sellSettlementService.setTelegramService(telegramService);
  }

  const walletService = runtimeEnabled
    ? createWalletService({
        appOrigin: getAppOrigin(),
        flutterwave,
        flutterwaveConfigured,
        supabase
      })
    : null;
  const executionWalletService = runtimeEnabled
    ? createExecutionWalletService({
        supabase
      })
    : null;

  const supportService = runtimeEnabled
    ? createSupportService({
        creatorService,
        executionEnabled,
        settlementService: supportSettlementService,
        supabase,
        supportFeeBps: Number.isFinite(supportFeeBps) ? supportFeeBps : 250
      })
    : null;

  const sellService = runtimeEnabled
    ? createSellService({
        creatorService,
        executionEnabled,
        publicClient,
        sellFeeBps: Number.isFinite(sellFeeBps) ? sellFeeBps : 250,
        settlementService: sellSettlementService,
        supabase
      })
    : null;

  const webhookService = runtimeEnabled
    ? createWebhookService({
        flutterwave,
        supabase
      })
    : null;

  const withAuth = async (request, rawBody = "", options = {}) => {
    if (!supabase) {
      const error = new Error("Fiat runtime is not configured on this server.");
      error.statusCode = 503;
      throw error;
    }

    return authenticateFiatRequest({
      ...options,
      rawBody,
      request,
      supabase
    });
  };

  const withReadAuth = async (request) => {
    if (!supabase) {
      const error = new Error("Fiat runtime is not configured on this server.");
      error.statusCode = 503;
      throw error;
    }

    return authenticateFiatReadRequest({
      request,
      supabase
    });
  };

  const handleApiRequest = async (request, response) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");
    const pathname = requestUrl.pathname;
    const isFiatRoute =
      pathname === "/api/wallet" ||
      pathname.startsWith("/api/wallet/") ||
      pathname.startsWith("/api/support/") ||
      pathname.startsWith("/api/sell/") ||
      pathname.startsWith("/api/telegram/") ||
      pathname.startsWith("/api/creators/") ||
      pathname.startsWith("/api/creator-coins/") ||
      pathname === "/api/payments/webhook" ||
      pathname === "/api/payouts/webhook";

    if (!isFiatRoute) {
      return false;
    }

    const creatorMatch = pathname.match(/^\/api\/creators\/([^/]+)$/);
    const creatorCoinMatch = pathname.match(/^\/api\/creator-coins\/([^/]+)$/);
    const creatorCoinActivityMatch = pathname.match(
      /^\/api\/creator-coins\/([^/]+)\/activity$/
    );

    try {
      if (!runtimeEnabled) {
        throw Object.assign(
          new Error("Fiat runtime is not configured on this server."),
          { statusCode: 503 }
        );
      }

      if (request.method === "GET" && pathname === "/api/wallet") {
        const hasSignature = Boolean(
          request.headers["x-every1-signature"]
        );
        const { profile } = hasSignature
          ? await withAuth(request)
          : await withReadAuth(request);
        const payload = await walletService.getWallet({
          profileId: profile.id
        });
        jsonResponse(response, 200, payload);
        return true;
      }

      if (request.method === "POST" && pathname === "/api/wallet/execution") {
        const rawBody = await readRawBody(request);
        const body = parseJsonBody(rawBody);
        const { authenticatedWalletAddress, profile } = await withAuth(
          request,
          rawBody
        );
        const payload = await executionWalletService.linkExecutionWallet({
          authenticatedWalletAddress,
          body,
          profile
        });
        jsonResponse(response, 200, payload);
        return true;
      }

      if (request.method === "GET" && pathname === "/api/wallet/transactions") {
        const hasSignature = Boolean(
          request.headers["x-every1-signature"]
        );
        const { profile } = hasSignature
          ? await withAuth(request)
          : await withReadAuth(request);
        const payload = await walletService.listTransactions({
          limit: requestUrl.searchParams.get("limit"),
          profileId: profile.id
        });
        jsonResponse(response, 200, payload);
        return true;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/wallet/deposit/initiate"
      ) {
        const rawBody = await readRawBody(request);
        const body = parseJsonBody(rawBody);
        const hasSignature = Boolean(
          request.headers["x-every1-signature"]
        );
        const { profile } = hasSignature
          ? await withAuth(request, rawBody)
          : await withReadAuth(request);
        const result = await walletService.initiateDeposit({
          body,
          profileId: profile.id
        });
        jsonResponse(response, result.statusCode, result.payload);
        return true;
      }

      if (request.method === "POST" && pathname === "/api/wallet/withdraw") {
        const rawBody = await readRawBody(request);
        const body = parseJsonBody(rawBody);
        const { profile } = await withAuth(request, rawBody);
        const result = await walletService.withdraw({
          body,
          profileId: profile.id
        });
        jsonResponse(response, result.statusCode, result.payload);
        return true;
      }

      if (request.method === "POST" && pathname === "/api/support/quote") {
        const rawBody = await readRawBody(request);
        const body = parseJsonBody(rawBody);
        const { profile } = await withAuth(request, rawBody);
        const result = await supportService.quote({
          body,
          profileId: profile.id
        });
        jsonResponse(response, result.statusCode, result.payload);
        return true;
      }

      if (request.method === "POST" && pathname === "/api/support/execute") {
        const rawBody = await readRawBody(request);
        const body = parseJsonBody(rawBody);
        const { profile } = await withAuth(request, rawBody);
        const result = await supportService.execute({
          body,
          profile
        });
        jsonResponse(response, result.statusCode, result.payload);
        return true;
      }

      if (request.method === "POST" && pathname === "/api/sell/quote") {
        const rawBody = await readRawBody(request);
        const body = parseJsonBody(rawBody);
        const { profile } = await withAuth(request, rawBody);
        const result = await sellService.quote({
          body,
          profileId: profile.id
        });
        jsonResponse(response, result.statusCode, result.payload);
        return true;
      }

      if (request.method === "POST" && pathname === "/api/sell/execute") {
        const rawBody = await readRawBody(request);
        const body = parseJsonBody(rawBody);
        const { profile } = await withAuth(request, rawBody);
        const result = await sellService.execute({
          body,
          profile
        });
        jsonResponse(response, result.statusCode, result.payload);
        return true;
      }

      if (
        request.method === "POST" &&
        pathname === "/api/telegram/coin-launch"
      ) {
        const rawBody = await readRawBody(request);
        const body = parseJsonBody(rawBody);
        const { profile } = await withAuth(request, rawBody, {
          allowExecutionWallet: true
        });
        const payload = await telegramService.announceCoinLaunch({
          category: body.category || null,
          coinAddress: body.coinAddress,
          coinName: body.coinName,
          coinSymbol: body.coinSymbol,
          launchType: body.launchType || "creator",
          profile
        });
        jsonResponse(response, 200, payload);
        return true;
      }

      if (request.method === "POST" && pathname === "/api/telegram/trade") {
        const rawBody = await readRawBody(request);
        const body = parseJsonBody(rawBody);
        const { profile } = await withAuth(request, rawBody, {
          allowExecutionWallet: true
        });
        const payload = await telegramService.announceTrade({
          coinAddress: body.coinAddress,
          coinName: body.coinName,
          coinSymbol: body.coinSymbol,
          ethAmount: body.ethAmount || null,
          nairaAmount: body.nairaAmount || null,
          profile,
          source: body.source || null,
          tokenAmount: body.tokenAmount || null,
          tokenAmountLabel: body.tokenAmountLabel || null,
          tradeSide: body.tradeSide,
          transactionHash: body.transactionHash
        });
        jsonResponse(response, 200, payload);
        return true;
      }

      if (request.method === "GET" && creatorMatch) {
        const payload = await creatorService.resolveCreator(
          decodeURIComponent(creatorMatch[1])
        );
        jsonResponse(response, 200, payload);
        return true;
      }

      if (request.method === "GET" && creatorCoinActivityMatch) {
        const payload = await creatorService.listCreatorCoinActivity(
          decodeURIComponent(creatorCoinActivityMatch[1]),
          requestUrl.searchParams.get("limit")
        );
        jsonResponse(response, 200, payload);
        return true;
      }

      if (request.method === "GET" && creatorCoinMatch) {
        const payload = await creatorService.resolveCreatorCoin(
          decodeURIComponent(creatorCoinMatch[1])
        );
        jsonResponse(response, 200, payload);
        return true;
      }

      if (request.method === "POST" && pathname === "/api/payments/webhook") {
        const rawBody = await readRawBody(request);
        const body = parseJsonBody(rawBody);
        const payload = await webhookService.handlePaymentWebhook({
          body,
          request
        });
        jsonResponse(response, 200, payload);
        return true;
      }

      if (request.method === "POST" && pathname === "/api/payouts/webhook") {
        const rawBody = await readRawBody(request);
        const body = parseJsonBody(rawBody);
        const payload = await webhookService.handlePayoutWebhook({
          body,
          request
        });
        jsonResponse(response, 200, payload);
        return true;
      }

      return false;
    } catch (error) {
      sendError(
        response,
        toStatusCode(error),
        error instanceof Error ? error.message : "Fiat runtime request failed."
      );
      return true;
    }
  };

  return {
    handleApiRequest,
    start() {}
  };
};
