import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  isAddress
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

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

const jsonResponse = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
};

const normalizeAddress = (value) => {
  const trimmed = value?.trim().toLowerCase();
  return trimmed && isAddress(trimmed) ? trimmed : null;
};

const formatRewardAmount = (value) => {
  const numeric =
    typeof value === "number"
      ? value
      : Number.parseFloat(
          String(value ?? "")
            .replace(/,/g, "")
            .trim()
        );

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "0";
  }

  return numeric.toLocaleString("en-US", {
    maximumFractionDigits: numeric >= 100 ? 2 : 4,
    minimumFractionDigits: 0
  });
};

const getReferralLabel = (reward) =>
  reward.referredDisplayName ||
  (reward.referredUsername ? `@${reward.referredUsername}` : null) ||
  "your referral";

const createNotification = async (
  { body, data, recipientId, targetKey, title },
  supabase
) => {
  const { data: row, error } = await supabase
    .from("notifications")
    .insert({
      actor_id: null,
      body: body || null,
      data: data || {},
      kind: "reward",
      recipient_id: recipientId,
      target_key: targetKey || null,
      title
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return row?.id || null;
};

export const createReferralRuntime = ({ rootDir }) => {
  loadEnvFile(path.join(rootDir, ".env"));
  loadEnvFile(path.join(rootDir, ".env.local"));

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
  const rpcUrl =
    process.env.VITE_ZORA_RPC_URL ||
    process.env.PONDER_RPC_URL_8453 ||
    process.env.VITE_BASE_RPC_URL ||
    "https://base.llamarpc.com";
  const payoutPrivateKey =
    process.env.PLATFORM_PRIVATE_KEY || process.env.PRIVATE_KEY || null;
  const payoutAccount =
    payoutPrivateKey && /^0x[a-fA-F0-9]{64}$/.test(payoutPrivateKey)
      ? privateKeyToAccount(payoutPrivateKey)
      : null;
  const runtimeEnabled = Boolean(supabaseUrl && serviceRoleKey && rpcUrl);
  const payoutEnabled = Boolean(runtimeEnabled && payoutAccount);
  const payoutWalletAddress = payoutAccount?.address?.toLowerCase() || null;
  const supabase = runtimeEnabled
    ? createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
    : null;
  const publicClient = runtimeEnabled
    ? createPublicClient({
        chain: base,
        transport: http(rpcUrl, { batch: { batchSize: 20 } })
      })
    : null;
  const walletClient =
    payoutEnabled && payoutAccount
      ? createWalletClient({
          account: payoutAccount,
          chain: base,
          transport: http(rpcUrl, { batch: { batchSize: 20 } })
        })
      : null;
  let payoutInterval = null;
  let isDispatching = false;

  const markRewardFailed = async (reward, message) => {
    if (!supabase) {
      return;
    }

    const shouldNotify =
      reward.status !== "failed" || reward.errorMessage !== message;

    await supabase
      .from("referral_trade_rewards")
      .update({
        error_message: message,
        payout_attempted_at: new Date().toISOString(),
        status: "failed"
      })
      .eq("id", reward.id);

    if (!shouldNotify) {
      return;
    }

    await createNotification(
      {
        body: `We couldn't send your ${formatRewardAmount(reward.rewardAmount)} ${reward.coinSymbol} referral reward yet. ${message}`,
        data: {
          coinAddress: reward.coinAddress,
          coinSymbol: reward.coinSymbol,
          referredProfileId: reward.referredProfileId,
          rewardAmount: reward.rewardAmount,
          status: "failed"
        },
        recipientId: reward.referrerId,
        targetKey: "/referrals",
        title: "Referral reward delayed"
      },
      supabase
    );
  };

  const listPendingRewards = async () => {
    if (!supabase) {
      return [];
    }

    const { data, error } = await supabase
      .from("referral_trade_rewards")
      .select(
        "id, referrer_id, referred_profile_id, coin_address, coin_symbol, reward_amount, reward_amount_raw, reward_token_decimals, recipient_wallet_address, payout_attempted_at, error_message, status"
      )
      .in("status", ["recorded", "failed"])
      .order("created_at", { ascending: true })
      .limit(20);

    if (error) {
      throw error;
    }

    const profileIds = Array.from(
      new Set(
        (data || [])
          .flatMap((row) => [row.referrer_id, row.referred_profile_id])
          .filter(Boolean)
      )
    );
    const profileMap = new Map();

    if (profileIds.length) {
      const { data: profileRows, error: profileError } = await supabase
        .from("profiles")
        .select("display_name, id, username, wallet_address")
        .in("id", profileIds);

      if (profileError) {
        throw profileError;
      }

      for (const row of profileRows || []) {
        profileMap.set(row.id, row);
      }
    }

    return (data || []).map((row) => ({
      coinAddress: row.coin_address,
      coinSymbol: row.coin_symbol,
      currentWalletAddress:
        profileMap.get(row.referrer_id)?.wallet_address?.toLowerCase() || null,
      errorMessage: row.error_message,
      id: row.id,
      payoutAttemptedAt: row.payout_attempted_at,
      recipientWalletAddress: row.recipient_wallet_address,
      referredDisplayName:
        profileMap.get(row.referred_profile_id)?.display_name || null,
      referredProfileId: row.referred_profile_id,
      referredUsername:
        profileMap.get(row.referred_profile_id)?.username || null,
      referrerId: row.referrer_id,
      rewardAmount: row.reward_amount,
      rewardAmountRaw: row.reward_amount_raw,
      rewardTokenDecimals: row.reward_token_decimals,
      status: row.status
    }));
  };

  const sendReward = async (reward) => {
    if (!supabase || !publicClient || !walletClient || !payoutAccount) {
      return;
    }

    const coinAddress = normalizeAddress(reward.coinAddress);
    const rewardAmountRaw = BigInt(String(reward.rewardAmountRaw || 0));
    const currentWalletAddress = normalizeAddress(reward.currentWalletAddress);
    const storedWalletAddress = normalizeAddress(reward.recipientWalletAddress);
    const recipientWalletAddress = currentWalletAddress || storedWalletAddress;

    if (!recipientWalletAddress) {
      await markRewardFailed(reward, "Recipient wallet address is missing.");
      return;
    }

    if (currentWalletAddress && currentWalletAddress !== storedWalletAddress) {
      await supabase
        .from("referral_trade_rewards")
        .update({
          recipient_wallet_address: currentWalletAddress
        })
        .eq("id", reward.id);
    }

    if (!coinAddress) {
      await markRewardFailed(reward, "Reward token address is invalid.");
      return;
    }

    if (rewardAmountRaw <= 0n) {
      await markRewardFailed(reward, "Reward amount is invalid.");
      return;
    }

    const payoutBalance = await publicClient.readContract({
      abi: erc20Abi,
      address: coinAddress,
      args: [payoutWalletAddress],
      functionName: "balanceOf"
    });

    if (payoutBalance < rewardAmountRaw) {
      await markRewardFailed(
        reward,
        `Every1 reward inventory is too low for ${reward.coinSymbol} right now.`
      );
      return;
    }

    try {
      const txHash = await walletClient.writeContract({
        abi: erc20Abi,
        account: payoutAccount,
        address: coinAddress,
        args: [recipientWalletAddress, rewardAmountRaw],
        functionName: "transfer"
      });

      await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 120_000
      });

      const notificationId = await createNotification(
        {
          body: `${getReferralLabel(reward)} completed a first trade. You received ${formatRewardAmount(reward.rewardAmount)} ${reward.coinSymbol} in your wallet.`,
          data: {
            coinAddress,
            coinSymbol: reward.coinSymbol,
            referredProfileId: reward.referredProfileId,
            rewardAmount: reward.rewardAmount,
            status: "paid",
            txHash
          },
          recipientId: reward.referrerId,
          targetKey: `/coins/${coinAddress}`,
          title: "Referral reward sent"
        },
        supabase
      );

      const { error } = await supabase
        .from("referral_trade_rewards")
        .update({
          error_message: null,
          notification_id: notificationId,
          payout_attempted_at: new Date().toISOString(),
          payout_tx_hash: txHash,
          sent_at: new Date().toISOString(),
          status: "paid"
        })
        .eq("id", reward.id);

      if (error) {
        throw error;
      }
    } catch (error) {
      await markRewardFailed(
        reward,
        error instanceof Error
          ? error.message
          : "Failed to send referral reward."
      );
    }
  };

  const dispatchPayouts = async () => {
    if (!payoutEnabled || !supabase || isDispatching) {
      return;
    }

    isDispatching = true;

    try {
      const rewards = await listPendingRewards();

      for (const reward of rewards) {
        const lastAttemptTime = reward.payoutAttemptedAt
          ? new Date(reward.payoutAttemptedAt).getTime()
          : 0;

        if (
          reward.status === "failed" &&
          Date.now() - lastAttemptTime < 60_000
        ) {
          continue;
        }

        await sendReward(reward);
      }
    } catch (error) {
      console.error("Failed to dispatch referral rewards", error);
    } finally {
      isDispatching = false;
    }
  };

  const start = () => {
    if (!payoutEnabled || payoutInterval) {
      return;
    }

    void dispatchPayouts();
    payoutInterval = setInterval(() => {
      void dispatchPayouts();
    }, 20_000);
  };

  const handleApiRequest = async (request, response) => {
    const requestUrl = new URL(request.url || "/", "http://localhost");

    if (!requestUrl.pathname.startsWith("/api/referrals/")) {
      return false;
    }

    if (requestUrl.pathname === "/api/referrals/config") {
      jsonResponse(response, 200, {
        enabled: runtimeEnabled,
        payoutEnabled,
        payoutWalletAddress
      });
      return true;
    }

    jsonResponse(response, 404, { error: "Referral route not found." });
    return true;
  };

  return {
    handleApiRequest,
    payoutEnabled,
    payoutWalletAddress,
    start
  };
};
