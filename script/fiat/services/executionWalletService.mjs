import { isAddress, verifyMessage } from "viem";
import { assert } from "../utils.mjs";

const MAX_LINK_AGE_MS = 5 * 60 * 1000;

export const buildExecutionWalletLinkMessage = ({
  executionWalletAddress,
  identityWalletAddress,
  profileId,
  timestamp
}) =>
  [
    "Every1 Execution Wallet Link",
    `Profile-ID: ${profileId}`,
    `Identity-Wallet: ${String(identityWalletAddress || "").toLowerCase()}`,
    `Execution-Wallet: ${String(executionWalletAddress || "").toLowerCase()}`,
    `Timestamp: ${timestamp}`
  ].join("\n");

export const createExecutionWalletService = ({ supabase }) => {
  const linkExecutionWallet = async ({
    authenticatedWalletAddress,
    body,
    profile
  }) => {
    const executionWalletAddress = String(
      body?.executionWalletAddress || ""
    ).trim();
    const executionWalletSignature = String(
      body?.executionWalletSignature || ""
    ).trim();
    const timestamp = String(body?.timestamp || "").trim();
    const requestTime = Number.parseInt(timestamp, 10);

    assert(
      executionWalletAddress && isAddress(executionWalletAddress),
      "A valid execution wallet address is required."
    );
    assert(
      executionWalletSignature,
      "An execution wallet signature is required."
    );
    assert(Number.isFinite(requestTime), "Missing execution wallet timestamp.");
    assert(
      Math.abs(Date.now() - requestTime) <= MAX_LINK_AGE_MS,
      "Execution wallet link request expired. Please retry."
    );
    assert(
      profile?.wallet_address && isAddress(profile.wallet_address),
      "A valid Every1 identity wallet is required."
    );
    assert(
      authenticatedWalletAddress?.toLowerCase() ===
        profile.wallet_address.toLowerCase(),
      "Only your Every1 identity wallet can link an execution wallet.",
      403
    );

    const normalizedExecutionWallet = executionWalletAddress.toLowerCase();
    const message = buildExecutionWalletLinkMessage({
      executionWalletAddress: normalizedExecutionWallet,
      identityWalletAddress: profile.wallet_address,
      profileId: profile.id,
      timestamp
    });
    const validExecutionSignature = await verifyMessage({
      address: normalizedExecutionWallet,
      message,
      signature: executionWalletSignature
    });

    assert(validExecutionSignature, "Invalid execution wallet signature.", 401);

    const { data, error } = await supabase
      .from("profiles")
      .update({
        execution_wallet_address: normalizedExecutionWallet
      })
      .eq("id", profile.id)
      .select(
        "id, username, display_name, bio, avatar_url, banner_url, wallet_address, execution_wallet_address, lens_account_address, zora_handle, verification_status, verification_category, verified_at"
      )
      .single();

    if (error) {
      throw error;
    }

    return {
      profile: {
        executionWalletAddress: data.execution_wallet_address,
        id: data.id,
        walletAddress: data.wallet_address
      },
      success: true
    };
  };

  return {
    linkExecutionWallet
  };
};
