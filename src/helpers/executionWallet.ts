import type { SmartWalletClientType } from "@privy-io/react-auth/smart-wallets";
import type { Address, Hex, WalletClient } from "viem";
import { buildFiatAuthMessage } from "@/helpers/fiat";

const EXECUTION_WALLET_LINK_PATH = "/api/wallet/execution";

export type ExecutionWalletClient = SmartWalletClientType | WalletClient;

type ExecutionWalletStatusInput = {
  executionWalletAddress?: null | string;
  executionWalletClient?: null | WalletClient;
  isLinkingExecutionWallet?: boolean;
  smartWalletEnabled?: boolean;
  smartWalletError?: null | string;
  smartWalletLoading?: boolean;
};

type LinkExecutionWalletInput = {
  executionWalletAddress: Address;
  executionWalletClient: SmartWalletClientType;
  identityWalletAddress: Address;
  identityWalletClient: WalletClient;
  profileId: string;
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

const sha256Hex = async (value: string) => {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
};

const createIdentityAuthHeaders = async ({
  body,
  identityWalletAddress,
  identityWalletClient,
  profileId
}: {
  body: string;
  identityWalletAddress: Address;
  identityWalletClient: WalletClient;
  profileId: string;
}) => {
  if (!identityWalletClient.account) {
    throw new Error("Your Every1 wallet is not ready yet.");
  }

  const timestamp = Date.now().toString();
  const bodyHash = await sha256Hex(body);
  const message = buildFiatAuthMessage({
    bodyHash,
    method: "POST",
    pathname: EXECUTION_WALLET_LINK_PATH,
    profileId,
    timestamp,
    walletAddress: identityWalletAddress
  });
  const signature = await identityWalletClient.signMessage({
    account: identityWalletClient.account,
    message
  });

  return {
    "content-type": "application/json",
    "x-every1-profile-id": profileId,
    "x-every1-signature": signature as Hex,
    "x-every1-timestamp": timestamp,
    "x-every1-wallet-address": identityWalletAddress
  };
};

export const buildExecutionWalletLinkMessage = ({
  executionWalletAddress,
  identityWalletAddress,
  profileId,
  timestamp
}: {
  executionWalletAddress: string;
  identityWalletAddress: string;
  profileId: string;
  timestamp: string;
}) =>
  [
    "Every1 Execution Wallet Link",
    `Profile-ID: ${profileId}`,
    `Identity-Wallet: ${identityWalletAddress.toLowerCase()}`,
    `Execution-Wallet: ${executionWalletAddress.toLowerCase()}`,
    `Timestamp: ${timestamp}`
  ].join("\n");

export const toViemWalletClient = (client?: ExecutionWalletClient | null) =>
  client ? (client as unknown as WalletClient) : null;

export const linkExecutionWallet = async ({
  executionWalletAddress,
  executionWalletClient,
  identityWalletAddress,
  identityWalletClient,
  profileId
}: LinkExecutionWalletInput) => {
  const timestamp = Date.now().toString();
  const message = buildExecutionWalletLinkMessage({
    executionWalletAddress,
    identityWalletAddress,
    profileId,
    timestamp
  });
  const executionWalletSignature = await executionWalletClient.signMessage({
    message
  });
  const body = JSON.stringify({
    executionWalletAddress,
    executionWalletSignature,
    timestamp
  });
  const headers = await createIdentityAuthHeaders({
    body,
    identityWalletAddress,
    identityWalletClient,
    profileId
  });
  const response = await fetch(EXECUTION_WALLET_LINK_PATH, {
    body,
    headers,
    method: "POST"
  });

  if (!response.ok) {
    throw new Error(await parseResponseError(response));
  }

  return (await response.json()) as {
    profile: {
      executionWalletAddress: null | string;
      id: string;
      walletAddress: null | string;
    };
    success: true;
  };
};

export const toExecutionWalletAddress = (
  profile?: null | {
    executionWalletAddress?: null | string;
    walletAddress?: null | string;
  }
) => profile?.executionWalletAddress || profile?.walletAddress || null;

export const getExecutionWalletStatus = ({
  executionWalletAddress,
  executionWalletClient,
  isLinkingExecutionWallet = false,
  smartWalletEnabled = false,
  smartWalletError,
  smartWalletLoading = false
}: ExecutionWalletStatusInput) => {
  if (!smartWalletEnabled) {
    return {
      isPreparing: false,
      isReady: Boolean(executionWalletAddress && executionWalletClient),
      message:
        executionWalletAddress && executionWalletClient
          ? null
          : "Your Every1 wallet is not available right now."
    };
  }

  if (smartWalletError) {
    return {
      isPreparing: false,
      isReady: false,
      message: smartWalletError
    };
  }

  if (
    smartWalletLoading ||
    isLinkingExecutionWallet ||
    !executionWalletAddress ||
    !executionWalletClient?.account
  ) {
    return {
      isPreparing: true,
      isReady: false,
      message:
        "Preparing your Every1 wallet on Base. This should only take a moment."
    };
  }

  return {
    isPreparing: false,
    isReady: true,
    message: null
  };
};
