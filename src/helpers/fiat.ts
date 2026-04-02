import type { Address, Hex, WalletClient } from "viem";
import { logActionError } from "@/helpers/actionErrorLogger";
import type {
  FiatCngnBanksResponse,
  FiatCngnDepositReconcileResponse,
  FiatCngnRailResponse,
  FiatCngnRedeemInput,
  FiatCngnRedeemResponse,
  FiatCngnVerifyWithdrawalResponse,
  FiatCngnVirtualAccountInput,
  FiatCngnVirtualAccountResponse,
  FiatCngnWithdrawInput,
  FiatCngnWithdrawResponse,
  FiatCreatorCoin,
  FiatCreatorCoinActivityResponse,
  FiatCreatorProfile,
  FiatDepositInitiateInput,
  FiatDepositInitiateResponse,
  FiatTradeReconcileResponse,
  FiatWalletResponse,
  FiatWalletTransactionsResponse,
  FiatWithdrawInput,
  FiatWithdrawResponse,
  SellExecuteInput,
  SellExecuteResponse,
  SellQuoteInput,
  SellQuoteResponse,
  SupportExecuteInput,
  SupportExecuteResponse,
  SupportQuoteInput,
  SupportQuoteResponse,
  SwapExecuteCoinToCoinInput,
  SwapExecuteCoinToCoinResponse,
  SwapExecuteCoinToNgnInput,
  SwapExecuteCoinToNgnResponse,
  SwapExecuteNgnToCoinInput,
  SwapExecuteNgnToCoinResponse,
  SwapQuoteCoinToCoinInput,
  SwapQuoteCoinToCoinResponse,
  SwapQuoteCoinToNgnInput,
  SwapQuoteCoinToNgnResponse,
  SwapQuoteNgnToCoinInput,
  SwapQuoteNgnToCoinResponse
} from "@/types/fiat";

const parseResponseError = async (response: Response) => {
  try {
    const payload = await response.json();
    return (
      payload?.error ||
      payload?.message ||
      `${response.status} ${response.statusText}`
    );
  } catch {
    return `${response.status} ${response.statusText}`;
  }
};

const sha256Hex = async (value: string) => {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
};

export const buildFiatAuthMessage = ({
  bodyHash,
  method,
  pathname,
  profileId,
  timestamp,
  walletAddress
}: {
  bodyHash: string;
  method: string;
  pathname: string;
  profileId: string;
  timestamp: string;
  walletAddress: string;
}) =>
  [
    "Every1 Fiat Auth",
    `Method: ${method.toUpperCase()}`,
    `Path: ${pathname}`,
    `Profile-ID: ${profileId}`,
    `Wallet: ${walletAddress.toLowerCase()}`,
    `Timestamp: ${timestamp}`,
    `Body-SHA256: ${bodyHash}`
  ].join("\n");

const createFiatAuthHeaders = async ({
  body,
  method,
  pathname,
  profileId,
  walletAddress,
  walletClient
}: {
  body: string;
  method: string;
  pathname: string;
  profileId: string;
  walletAddress: Address;
  walletClient: WalletClient;
}) => {
  if (!walletClient.account) {
    throw new Error("Connect your wallet to continue.");
  }

  const timestamp = Date.now().toString();
  const bodyHash = await sha256Hex(body);
  const canonicalPath = pathname.split("?")[0] || pathname;
  const message = buildFiatAuthMessage({
    bodyHash,
    method,
    pathname: canonicalPath,
    profileId,
    timestamp,
    walletAddress
  });
  const signature = await walletClient.signMessage({
    account: walletClient.account,
    message
  });

  return {
    "x-every1-profile-id": profileId,
    "x-every1-signature": signature as Hex,
    "x-every1-timestamp": timestamp,
    "x-every1-wallet-address": walletAddress
  };
};

const fiatFetch = async <TResponse>({
  body,
  method = "GET",
  path,
  profileId,
  profileIdHeader,
  walletAddress,
  walletClient
}: {
  body?: unknown;
  method?: "GET" | "POST";
  path: string;
  profileId?: string;
  profileIdHeader?: string;
  walletAddress?: Address;
  walletClient?: WalletClient;
}) => {
  const bodyString = body ? JSON.stringify(body) : "";
  const logBody =
    body && typeof body === "object"
      ? {
          ...body,
          accountNumber:
            "accountNumber" in body &&
            typeof body.accountNumber === "string" &&
            body.accountNumber
              ? `${body.accountNumber.slice(0, 2)}***${body.accountNumber.slice(-2)}`
              : undefined
        }
      : body;
  const headers: HeadersInit = {};

  if (bodyString) {
    headers["content-type"] = "application/json";
  }

  if (profileIdHeader) {
    headers["x-every1-profile-id"] = profileIdHeader;
  }

  if (profileId && walletAddress && walletClient) {
    Object.assign(
      headers,
      await createFiatAuthHeaders({
        body: bodyString,
        method,
        pathname: path,
        profileId,
        walletAddress,
        walletClient
      })
    );
  }

  const response = await fetch(path, {
    body: bodyString || undefined,
    headers,
    method
  }).catch((error) => {
    logActionError("fiat.request.network", error, {
      hasAuth: Boolean(profileId && walletAddress && walletClient),
      method,
      path,
      profileId: profileId || null,
      requestBody: logBody
    });
    throw error;
  });

  if (!response.ok) {
    const error = new Error(await parseResponseError(response));
    logActionError("fiat.request.http", error, {
      hasAuth: Boolean(profileId && walletAddress && walletClient),
      method,
      path,
      profileId: profileId || null,
      requestBody: logBody,
      status: response.status,
      statusText: response.statusText
    });
    throw error;
  }

  return (await response.json()) as TResponse;
};

export const getFiatWallet = (input: {
  profileId: string;
  walletAddress: Address;
  walletClient: WalletClient;
}) =>
  fiatFetch<FiatWalletResponse>({
    method: "GET",
    path: "/api/wallet",
    ...input
  });

export const getFiatWalletPublic = (profileId: string) =>
  fiatFetch<FiatWalletResponse>({
    method: "GET",
    path: "/api/wallet",
    profileIdHeader: profileId
  });

export const getFiatCngnRailStatusPublic = (profileId: string) =>
  fiatFetch<FiatCngnRailResponse>({
    method: "GET",
    path: "/api/wallet/providers/cngn",
    profileIdHeader: profileId
  });

export const getFiatCngnBanksPublic = (profileId: string) =>
  fiatFetch<FiatCngnBanksResponse>({
    method: "GET",
    path: "/api/wallet/providers/cngn/banks",
    profileIdHeader: profileId
  });

export const createFiatCngnVirtualAccountPublic = (
  input: FiatCngnVirtualAccountInput & {
    profileId: string;
  }
) =>
  fiatFetch<FiatCngnVirtualAccountResponse>({
    body: {
      idempotencyKey: input.idempotencyKey,
      provider: input.provider
    },
    method: "POST",
    path: "/api/wallet/providers/cngn/virtual-account",
    profileIdHeader: input.profileId
  });

export const reconcileFiatCngnDepositsPublic = (profileId: string) =>
  fiatFetch<FiatCngnDepositReconcileResponse>({
    method: "POST",
    path: "/api/wallet/providers/cngn/deposits/reconcile",
    profileIdHeader: profileId
  });

export const reconcileFiatTradesPublic = (profileId: string) =>
  fiatFetch<FiatTradeReconcileResponse>({
    method: "POST",
    path: "/api/wallet/trades/reconcile",
    profileIdHeader: profileId
  });

export const redeemFiatCngn = (
  input: FiatCngnRedeemInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<FiatCngnRedeemResponse>({
    body: {
      accountNumber: input.accountNumber,
      amount: input.amount,
      bankCode: input.bankCode,
      idempotencyKey: input.idempotencyKey,
      saveDetails: input.saveDetails
    },
    method: "POST",
    path: "/api/wallet/providers/cngn/redeem",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const withdrawFiatCngn = (
  input: FiatCngnWithdrawInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<FiatCngnWithdrawResponse>({
    body: {
      address: input.address,
      amount: input.amount,
      idempotencyKey: input.idempotencyKey,
      network: input.network,
      shouldSaveAddress: input.shouldSaveAddress
    },
    method: "POST",
    path: "/api/wallet/providers/cngn/withdraw",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const verifyFiatCngnWithdrawalPublic = (
  profileId: string,
  transactionRef: string
) =>
  fiatFetch<FiatCngnVerifyWithdrawalResponse>({
    method: "GET",
    path: `/api/wallet/providers/cngn/withdraw/${encodeURIComponent(transactionRef)}`,
    profileIdHeader: profileId
  });

export const getFiatWalletTransactions = (input: {
  limit?: number;
  profileId: string;
  walletAddress: Address;
  walletClient: WalletClient;
}) =>
  fiatFetch<FiatWalletTransactionsResponse>({
    method: "GET",
    path: `/api/wallet/transactions${input.limit ? `?limit=${input.limit}` : ""}`,
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const getFiatWalletTransactionsPublic = (
  profileId: string,
  limit?: number
) =>
  fiatFetch<FiatWalletTransactionsResponse>({
    method: "GET",
    path: `/api/wallet/transactions${limit ? `?limit=${limit}` : ""}`,
    profileIdHeader: profileId
  });

export const initiateFiatDeposit = (
  input: FiatDepositInitiateInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<FiatDepositInitiateResponse>({
    body: {
      amountNaira: input.amountNaira,
      email: input.email,
      idempotencyKey: input.idempotencyKey,
      name: input.name,
      phone: input.phone,
      redirectUrl: input.redirectUrl
    },
    method: "POST",
    path: "/api/wallet/deposit/initiate",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const initiateFiatDepositPublic = (
  input: FiatDepositInitiateInput & {
    profileId: string;
  }
) =>
  fiatFetch<FiatDepositInitiateResponse>({
    body: {
      amountNaira: input.amountNaira,
      email: input.email,
      idempotencyKey: input.idempotencyKey,
      name: input.name,
      phone: input.phone,
      redirectUrl: input.redirectUrl
    },
    method: "POST",
    path: "/api/wallet/deposit/initiate",
    profileIdHeader: input.profileId
  });

export const withdrawFiat = (
  input: FiatWithdrawInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<FiatWithdrawResponse>({
    body: {
      accountName: input.accountName,
      accountNumber: input.accountNumber,
      amountNaira: input.amountNaira,
      bankAccountId: input.bankAccountId,
      bankCode: input.bankCode,
      bankName: input.bankName,
      idempotencyKey: input.idempotencyKey,
      makeDefault: input.makeDefault,
      narration: input.narration
    },
    method: "POST",
    path: "/api/wallet/withdraw",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const getSupportQuote = (
  input: SupportQuoteInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<SupportQuoteResponse>({
    body: {
      coinAddress: input.coinAddress,
      creatorCoinId: input.creatorCoinId,
      creatorId: input.creatorId,
      executionWalletAddress: input.executionWalletAddress,
      idempotencyKey: input.idempotencyKey,
      launchId: input.launchId,
      nairaAmount: input.nairaAmount,
      ticker: input.ticker
    },
    method: "POST",
    path: "/api/support/quote",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const getSupportQuotePublic = (
  input: SupportQuoteInput & {
    profileId: string;
  }
) =>
  fiatFetch<SupportQuoteResponse>({
    body: {
      coinAddress: input.coinAddress,
      creatorCoinId: input.creatorCoinId,
      creatorId: input.creatorId,
      executionWalletAddress: input.executionWalletAddress,
      idempotencyKey: input.idempotencyKey,
      launchId: input.launchId,
      nairaAmount: input.nairaAmount,
      ticker: input.ticker
    },
    method: "POST",
    path: "/api/support/quote",
    profileIdHeader: input.profileId
  });

export const executeSupport = (
  input: SupportExecuteInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<SupportExecuteResponse>({
    body: {
      executionWalletAddress: input.executionWalletAddress,
      idempotencyKey: input.idempotencyKey,
      quoteId: input.quoteId
    },
    method: "POST",
    path: "/api/support/execute",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const getSupportExecutionStatusPublic = (
  profileId: string,
  transactionId: string
) =>
  fiatFetch<SupportExecuteResponse>({
    method: "GET",
    path: `/api/support/transactions/${encodeURIComponent(transactionId)}`,
    profileIdHeader: profileId
  });

export const getSwapQuoteNgnToCoin = (
  input: SwapQuoteNgnToCoinInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<SwapQuoteNgnToCoinResponse>({
    body: {
      coinAddress: input.coinAddress,
      creatorCoinId: input.creatorCoinId,
      creatorId: input.creatorId,
      executionWalletAddress: input.executionWalletAddress,
      idempotencyKey: input.idempotencyKey,
      launchId: input.launchId,
      nairaAmount: input.nairaAmount,
      ticker: input.ticker
    },
    method: "POST",
    path: "/api/swap/quote/ngn-to-coin",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const getSwapQuoteNgnToCoinPublic = (
  input: SwapQuoteNgnToCoinInput & {
    profileId: string;
  }
) =>
  fiatFetch<SwapQuoteNgnToCoinResponse>({
    body: {
      coinAddress: input.coinAddress,
      creatorCoinId: input.creatorCoinId,
      creatorId: input.creatorId,
      executionWalletAddress: input.executionWalletAddress,
      idempotencyKey: input.idempotencyKey,
      launchId: input.launchId,
      nairaAmount: input.nairaAmount,
      ticker: input.ticker
    },
    method: "POST",
    path: "/api/swap/quote/ngn-to-coin",
    profileIdHeader: input.profileId
  });

export const executeSwapNgnToCoin = (
  input: SwapExecuteNgnToCoinInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<SwapExecuteNgnToCoinResponse>({
    body: {
      executionWalletAddress: input.executionWalletAddress,
      idempotencyKey: input.idempotencyKey,
      quoteId: input.quoteId
    },
    method: "POST",
    path: "/api/swap/execute/ngn-to-coin",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const getSellQuote = (
  input: SellQuoteInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<SellQuoteResponse>({
    body: {
      coinAddress: input.coinAddress,
      coinAmount: input.coinAmount,
      creatorCoinId: input.creatorCoinId,
      executionWalletAddress: input.executionWalletAddress,
      idempotencyKey: input.idempotencyKey,
      launchId: input.launchId,
      ticker: input.ticker
    },
    method: "POST",
    path: "/api/sell/quote",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const getSellQuotePublic = (
  input: SellQuoteInput & {
    profileId: string;
  }
) =>
  fiatFetch<SellQuoteResponse>({
    body: {
      coinAddress: input.coinAddress,
      coinAmount: input.coinAmount,
      creatorCoinId: input.creatorCoinId,
      executionWalletAddress: input.executionWalletAddress,
      idempotencyKey: input.idempotencyKey,
      launchId: input.launchId,
      ticker: input.ticker
    },
    method: "POST",
    path: "/api/sell/quote",
    profileIdHeader: input.profileId
  });

export const executeSell = (
  input: SellExecuteInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<SellExecuteResponse>({
    body: {
      executionWalletAddress: input.executionWalletAddress,
      idempotencyKey: input.idempotencyKey,
      quoteId: input.quoteId,
      transactionHash: input.transactionHash
    },
    method: "POST",
    path: "/api/sell/execute",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const getSellExecutionStatusPublic = (
  profileId: string,
  transactionId: string
) =>
  fiatFetch<SellExecuteResponse>({
    method: "GET",
    path: `/api/sell/transactions/${encodeURIComponent(transactionId)}`,
    profileIdHeader: profileId
  });

export const getSwapQuoteCoinToNgn = (
  input: SwapQuoteCoinToNgnInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<SwapQuoteCoinToNgnResponse>({
    body: {
      coinAddress: input.coinAddress,
      coinAmount: input.coinAmount,
      creatorCoinId: input.creatorCoinId,
      executionWalletAddress: input.executionWalletAddress,
      idempotencyKey: input.idempotencyKey,
      launchId: input.launchId,
      ticker: input.ticker
    },
    method: "POST",
    path: "/api/swap/quote/coin-to-ngn",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const getSwapQuoteCoinToNgnPublic = (
  input: SwapQuoteCoinToNgnInput & {
    profileId: string;
  }
) =>
  fiatFetch<SwapQuoteCoinToNgnResponse>({
    body: {
      coinAddress: input.coinAddress,
      coinAmount: input.coinAmount,
      creatorCoinId: input.creatorCoinId,
      executionWalletAddress: input.executionWalletAddress,
      idempotencyKey: input.idempotencyKey,
      launchId: input.launchId,
      ticker: input.ticker
    },
    method: "POST",
    path: "/api/swap/quote/coin-to-ngn",
    profileIdHeader: input.profileId
  });

export const executeSwapCoinToNgn = (
  input: SwapExecuteCoinToNgnInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<SwapExecuteCoinToNgnResponse>({
    body: {
      executionWalletAddress: input.executionWalletAddress,
      idempotencyKey: input.idempotencyKey,
      quoteId: input.quoteId,
      transactionHash: input.transactionHash
    },
    method: "POST",
    path: "/api/swap/execute/coin-to-ngn",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const getSwapQuoteCoinToCoin = (
  input: SwapQuoteCoinToCoinInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<SwapQuoteCoinToCoinResponse>({
    body: {
      executionWalletAddress: input.executionWalletAddress,
      fromCoinAddress: input.fromCoinAddress,
      fromCoinAmount: input.fromCoinAmount,
      fromCreatorCoinId: input.fromCreatorCoinId,
      fromLaunchId: input.fromLaunchId,
      fromTicker: input.fromTicker,
      idempotencyKey: input.idempotencyKey,
      toCoinAddress: input.toCoinAddress,
      toCreatorCoinId: input.toCreatorCoinId,
      toLaunchId: input.toLaunchId,
      toTicker: input.toTicker
    },
    method: "POST",
    path: "/api/swap/quote/coin-to-coin",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const executeSwapCoinToCoin = (
  input: SwapExecuteCoinToCoinInput & {
    profileId: string;
    walletAddress: Address;
    walletClient: WalletClient;
  }
) =>
  fiatFetch<SwapExecuteCoinToCoinResponse>({
    body: {
      executionWalletAddress: input.executionWalletAddress,
      idempotencyKey: input.idempotencyKey,
      quoteId: input.quoteId,
      transactionHash: input.transactionHash
    },
    method: "POST",
    path: "/api/swap/execute/coin-to-coin",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const getFiatCreator = (identifier: string) =>
  fiatFetch<FiatCreatorProfile>({
    method: "GET",
    path: `/api/creators/${encodeURIComponent(identifier)}`
  });

export const getFiatCreatorCoin = (identifier: string) =>
  fiatFetch<FiatCreatorCoin>({
    method: "GET",
    path: `/api/creator-coins/${encodeURIComponent(identifier)}`
  });

export const getFiatCreatorCoinActivity = (
  identifier: string,
  limit?: number
) =>
  fiatFetch<FiatCreatorCoinActivityResponse>({
    method: "GET",
    path: `/api/creator-coins/${encodeURIComponent(identifier)}/activity${
      limit ? `?limit=${limit}` : ""
    }`
  });
