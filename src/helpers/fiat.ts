import type { Address, Hex, WalletClient } from "viem";
import { logActionError } from "@/helpers/actionErrorLogger";
import type {
  FiatCreatorCoin,
  FiatCreatorCoinActivityResponse,
  FiatCreatorProfile,
  FiatDepositInitiateInput,
  FiatDepositInitiateResponse,
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
  SupportQuoteResponse
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
