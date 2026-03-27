import { assert } from "../utils.mjs";

export const getIdempotencyRecord = async ({
  key,
  profileId = null,
  scope,
  supabase
}) => {
  if (!key) {
    return null;
  }

  const { data, error } = await supabase
    .from("fiat_idempotency_keys")
    .select("id, response_body, response_status")
    .eq("scope", scope)
    .eq("idempotency_key", key)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
};

export const saveIdempotencyRecord = async ({
  key,
  profileId = null,
  responseBody,
  responseStatus,
  scope,
  supabase
}) => {
  if (!key) {
    return;
  }

  const { error } = await supabase.from("fiat_idempotency_keys").upsert(
    {
      idempotency_key: key,
      last_used_at: new Date().toISOString(),
      profile_id: profileId,
      response_body: responseBody,
      response_status: responseStatus,
      scope
    },
    {
      onConflict: "scope,idempotency_key"
    }
  );

  if (error) {
    throw error;
  }
};

export const getWalletOverviewRow = async ({ profileId, supabase }) => {
  const { data, error } = await supabase.rpc("get_fiat_wallet_overview", {
    input_profile_id: profileId
  });

  if (error) {
    throw error;
  }

  const wallet = Array.isArray(data) ? data[0] || null : null;
  assert(wallet?.wallet_id, "Fiat wallet was not found.", 404);

  return wallet;
};

export const expireQuoteIfNeeded = async ({ quote, quoteTable, supabase }) => {
  const expiresAt = new Date(quote?.expires_at || "");

  if (
    !Number.isFinite(expiresAt.getTime()) ||
    expiresAt.getTime() > Date.now()
  ) {
    return false;
  }

  if (quote.status !== "expired") {
    const { error } = await supabase
      .from(quoteTable)
      .update({
        status: "expired"
      })
      .eq("id", quote.id);

    if (error) {
      throw error;
    }
  }

  return true;
};

export const logFiatEvent = (event, payload = {}) => {
  console.log(
    JSON.stringify({
      at: new Date().toISOString(),
      domain: "fiat",
      event,
      ...payload
    })
  );
};

export const insertFiatLedgerEntryIfMissing = async ({ entry, supabase }) => {
  const { data: existing, error: existingError } = await supabase
    .from("fiat_wallet_ledger_entries")
    .select("id")
    .eq("reference_kind", entry.reference_kind)
    .eq("reference_id", entry.reference_id)
    .eq("entry_kind", entry.entry_kind)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    return existing.id;
  }

  const { data, error } = await supabase
    .from("fiat_wallet_ledger_entries")
    .insert(entry)
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data?.id || null;
};

export const recordReferralTradeRewardIfEligible = async ({
  chainId = 8453,
  coinAddress,
  coinSymbol,
  profileId,
  supabase,
  tradeAmountIn,
  tradeAmountOut,
  tradeSide,
  txHash
}) => {
  if (
    !supabase ||
    !profileId ||
    !coinAddress ||
    !coinSymbol ||
    !txHash ||
    !tradeSide
  ) {
    return null;
  }

  const { data, error } = await supabase.rpc("record_referral_trade_reward", {
    input_chain_id: chainId,
    input_coin_address: coinAddress,
    input_coin_symbol: coinSymbol,
    input_profile_id: profileId,
    input_trade_amount_in: tradeAmountIn,
    input_trade_amount_out: tradeAmountOut,
    input_trade_side: tradeSide,
    input_tx_hash: txHash
  });

  if (error) {
    throw error;
  }

  return data || null;
};
