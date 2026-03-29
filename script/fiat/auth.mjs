import { isAddress, verifyMessage } from "viem";
import { assert, isUuid, sha256Hex } from "./utils.mjs";

const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;
const getHeaderValue = (value) =>
  Array.isArray(value) ? value[0] || "" : String(value || "");

export const buildFiatAuthMessage = ({
  bodyHash,
  method,
  pathname,
  profileId,
  timestamp,
  walletAddress
}) =>
  [
    "Every1 Fiat Auth",
    `Method: ${String(method || "GET").toUpperCase()}`,
    `Path: ${pathname}`,
    `Profile-ID: ${profileId}`,
    `Wallet: ${walletAddress.toLowerCase()}`,
    `Timestamp: ${timestamp}`,
    `Body-SHA256: ${bodyHash}`
  ].join("\n");

export const buildExecutionWalletAuthMessage = ({
  bodyHash,
  method,
  pathname,
  profileId,
  timestamp,
  walletAddress
}) =>
  [
    "Every1 Wallet Setup",
    "Action: Link your Every1 wallet",
    `Method: ${String(method || "GET").toUpperCase()}`,
    `Path: ${pathname}`,
    `Profile-ID: ${profileId}`,
    `Wallet: ${walletAddress.toLowerCase()}`,
    `Timestamp: ${timestamp}`,
    `Body-SHA256: ${bodyHash}`
  ].join("\n");

export const authenticateFiatRequest = async ({
  allowExecutionWallet = false,
  rawBody,
  request,
  supabase
}) => {
  const profileId = getHeaderValue(
    request.headers["x-every1-profile-id"]
  ).trim();
  const walletAddress = getHeaderValue(
    request.headers["x-every1-wallet-address"]
  )
    .trim()
    .toLowerCase();
  const signature = getHeaderValue(
    request.headers["x-every1-signature"]
  ).trim();
  const timestamp = getHeaderValue(
    request.headers["x-every1-timestamp"]
  ).trim();
  const requestTime = Number.parseInt(timestamp, 10);

  assert(profileId && isUuid(profileId), "Missing fiat profile identity.", 401);
  assert(
    walletAddress && isAddress(walletAddress),
    "Missing fiat wallet identity.",
    401
  );
  assert(signature, "Missing fiat request signature.", 401);
  assert(Number.isFinite(requestTime), "Missing fiat request timestamp.", 401);
  assert(
    Math.abs(Date.now() - requestTime) <= MAX_REQUEST_AGE_MS,
    "Fiat request signature expired. Please retry.",
    401
  );

  const bodyHash = sha256Hex(rawBody || "");
  const pathname = new URL(request.url || "/", "http://localhost").pathname;
  const message = buildFiatAuthMessage({
    bodyHash,
    method: request.method,
    pathname,
    profileId,
    timestamp,
    walletAddress
  });
  const executionWalletMessage = buildExecutionWalletAuthMessage({
    bodyHash,
    method: request.method,
    pathname,
    profileId,
    timestamp,
    walletAddress
  });

  const validSignature =
    (await verifyMessage({
      address: walletAddress,
      message,
      signature
    })) ||
    (await verifyMessage({
      address: walletAddress,
      message: executionWalletMessage,
      signature
    }));

  assert(validSignature, "Invalid fiat request signature.", 401);

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, username, wallet_address, execution_wallet_address"
    )
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  assert(profile, "Profile not found.", 401);
  const matchesIdentity =
    profile.wallet_address?.toLowerCase() === walletAddress;
  const matchesExecution =
    profile.execution_wallet_address?.toLowerCase() === walletAddress;

  assert(
    matchesIdentity || (allowExecutionWallet && matchesExecution),
    "Wallet does not match the signed profile.",
    403
  );

  return {
    authenticatedWalletAddress: walletAddress,
    profile
  };
};

export const authenticateFiatReadRequest = async ({ request, supabase }) => {
  const profileId = getHeaderValue(
    request.headers["x-every1-profile-id"]
  ).trim();

  assert(profileId && isUuid(profileId), "Missing fiat profile identity.", 401);

  const { data: profile, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, username, wallet_address, execution_wallet_address"
    )
    .eq("id", profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  assert(profile, "Profile not found.", 401);

  return {
    profile
  };
};
