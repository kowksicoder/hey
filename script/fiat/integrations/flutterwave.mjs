import { assert, safeCompare } from "../utils.mjs";

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";
const readHeaderValue = (value) =>
  Array.isArray(value) ? value[0] || "" : String(value || "");

const readJson = async (response) => {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.error ||
        `Flutterwave request failed with ${response.status}.`
    );
  }

  return payload;
};

export const createFlutterwaveClient = (config) => ({
  createDepositPaymentLink: async ({
    amountNaira,
    customer,
    redirectUrl,
    txRef
  }) => {
    assert(
      config.flutterwaveSecretKey,
      "Flutterwave deposit key is not configured.",
      503
    );

    const response = await fetch(`${FLUTTERWAVE_BASE_URL}/payments`, {
      body: JSON.stringify({
        amount: Number(amountNaira.toFixed(2)),
        currency: "NGN",
        customer: {
          email: customer.email,
          name: customer.name,
          phonenumber: customer.phone || undefined
        },
        customizations: {
          description: "Fund your Every1 wallet",
          title: "Every1 wallet deposit"
        },
        payment_options: "card,banktransfer,ussd",
        redirect_url: redirectUrl,
        tx_ref: txRef
      }),
      headers: {
        Authorization: `Bearer ${config.flutterwaveSecretKey}`,
        "content-type": "application/json"
      },
      method: "POST"
    });

    const payload = await readJson(response);

    return {
      checkoutUrl: payload?.data?.link || null,
      expiresAt: null,
      providerReference: txRef,
      raw: payload
    };
  },
  createTransfer: async ({
    accountBank,
    accountNumber,
    amountNaira,
    narration,
    reference
  }) => {
    assert(
      config.flutterwaveSecretKey,
      "Flutterwave payout key is not configured.",
      503
    );

    const response = await fetch(`${FLUTTERWAVE_BASE_URL}/transfers`, {
      body: JSON.stringify({
        account_bank: accountBank,
        account_number: accountNumber,
        amount: Number(amountNaira.toFixed(2)),
        currency: "NGN",
        debit_currency: "NGN",
        narration,
        reference
      }),
      headers: {
        Authorization: `Bearer ${config.flutterwaveSecretKey}`,
        "content-type": "application/json"
      },
      method: "POST"
    });

    const payload = await readJson(response);

    return {
      providerPayoutId:
        payload?.data?.id?.toString() || payload?.data?.reference || reference,
      raw: payload,
      reference: payload?.data?.reference || reference
    };
  },
  getPublicKey: () => config.flutterwavePublicKey || null,
  getTransfer: async ({ transferId }) => {
    assert(
      config.flutterwaveSecretKey,
      "Flutterwave payout key is not configured.",
      503
    );
    assert(transferId, "Flutterwave transfer id is required.", 400);

    const response = await fetch(
      `${FLUTTERWAVE_BASE_URL}/transfers/${encodeURIComponent(String(transferId))}`,
      {
        headers: {
          Authorization: `Bearer ${config.flutterwaveSecretKey}`
        },
        method: "GET"
      }
    );

    const payload = await readJson(response);

    return {
      data: payload?.data || null,
      raw: payload
    };
  },
  isInlineReady: () => Boolean(config.flutterwavePublicKey),
  verifyTransactionByReference: async ({ txRef }) => {
    assert(
      config.flutterwaveSecretKey,
      "Flutterwave deposit key is not configured.",
      503
    );
    assert(txRef, "Flutterwave transaction reference is required.", 400);

    const response = await fetch(
      `${FLUTTERWAVE_BASE_URL}/transactions/verify_by_reference?tx_ref=${encodeURIComponent(
        String(txRef)
      )}`,
      {
        headers: {
          Authorization: `Bearer ${config.flutterwaveSecretKey}`,
          "content-type": "application/json"
        },
        method: "GET"
      }
    );

    const payload = await readJson(response);

    return {
      data: payload?.data || null,
      raw: payload
    };
  },
  verifyWebhookSignature: (request) => {
    const headerValue = readHeaderValue(
      request.headers["verif-hash"] ||
        request.headers["x-flutterwave-signature"]
    );

    assert(
      config.flutterwaveWebhookHash,
      "Flutterwave webhook hash is not configured.",
      503
    );
    assert(
      safeCompare(headerValue, config.flutterwaveWebhookHash),
      "Invalid Flutterwave webhook signature.",
      401
    );
  }
});
