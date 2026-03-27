import type { Address, Hex, WalletClient } from "viem";

const sha256Hex = async (value: string) => {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
};

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

const buildAuthMessage = ({
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

const createSignedHeaders = async ({
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
  const message = buildAuthMessage({
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

const postTelegramEvent = async <TResponse>({
  body,
  path,
  profileId,
  walletAddress,
  walletClient
}: {
  body: Record<string, unknown>;
  path: string;
  profileId: string;
  walletAddress: Address;
  walletClient: WalletClient;
}) => {
  const bodyString = JSON.stringify(body);
  const headers = {
    "content-type": "application/json",
    ...(await createSignedHeaders({
      body: bodyString,
      method: "POST",
      pathname: path,
      profileId,
      walletAddress,
      walletClient
    }))
  };

  const response = await fetch(path, {
    body: bodyString,
    headers,
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(await parseResponseError(response));
  }

  return (await response.json()) as TResponse;
};

export const announceTelegramCoinLaunch = (input: {
  category?: null | string;
  coinAddress: string;
  coinName: string;
  coinSymbol?: null | string;
  launchType: "collaboration" | "community" | "creator";
  profileId: string;
  walletAddress: Address;
  walletClient: WalletClient;
}) =>
  postTelegramEvent({
    body: {
      category: input.category || null,
      coinAddress: input.coinAddress,
      coinName: input.coinName,
      coinSymbol: input.coinSymbol || null,
      launchType: input.launchType
    },
    path: "/api/telegram/coin-launch",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });

export const announceTelegramTrade = (input: {
  coinAddress: string;
  coinName: string;
  coinSymbol?: null | string;
  ethAmount?: null | number | string;
  nairaAmount?: null | number | string;
  profileId: string;
  source?: null | string;
  tokenAmount?: null | number | string;
  tokenAmountLabel?: null | string;
  tradeSide: "buy" | "sell";
  transactionHash: string;
  walletAddress: Address;
  walletClient: WalletClient;
}) =>
  postTelegramEvent({
    body: {
      coinAddress: input.coinAddress,
      coinName: input.coinName,
      coinSymbol: input.coinSymbol || null,
      ethAmount: input.ethAmount ?? null,
      nairaAmount: input.nairaAmount ?? null,
      source: input.source || null,
      tokenAmount: input.tokenAmount ?? null,
      tokenAmountLabel: input.tokenAmountLabel || null,
      tradeSide: input.tradeSide,
      transactionHash: input.transactionHash
    },
    path: "/api/telegram/trade",
    profileId: input.profileId,
    walletAddress: input.walletAddress,
    walletClient: input.walletClient
  });
