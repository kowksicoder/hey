import { Buffer } from "node:buffer";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import sodium from "libsodium-wrappers";

const DEFAULT_BASE_URL = "https://api.cngn.co";
const DEFAULT_TIMEOUT_MS = 10_000;

const normalizeMultilineKey = (value) =>
  String(value || "")
    .replace(/\\n/g, "\n")
    .trim();

const parseJsonMaybe = (value) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const parseOpenSshPrivateKey = (privateKey) => {
  const lines = normalizeMultilineKey(privateKey).split("\n");
  const base64PrivateKey = lines.slice(1, -1).join("");
  const privateKeyBuffer = Buffer.from(base64PrivateKey, "base64");
  const keyDataStart = privateKeyBuffer.indexOf(
    Buffer.from([0x00, 0x00, 0x00, 0x40])
  );

  if (keyDataStart === -1) {
    throw new Error("Unable to find Ed25519 key data.");
  }

  return new Uint8Array(
    privateKeyBuffer.subarray(keyDataStart + 4, keyDataStart + 68)
  );
};

const decryptWithPrivateKey = async (privateKey, encryptedData) => {
  await sodium.ready;

  const fullPrivateKey = parseOpenSshPrivateKey(privateKey);
  const curve25519PrivateKey =
    sodium.crypto_sign_ed25519_sk_to_curve25519(fullPrivateKey);
  const encryptedBuffer = Buffer.from(encryptedData, "base64");
  const nonce = encryptedBuffer.subarray(0, sodium.crypto_box_NONCEBYTES);
  const ephemeralPublicKey = encryptedBuffer.subarray(
    -sodium.crypto_box_PUBLICKEYBYTES
  );
  const ciphertext = encryptedBuffer.subarray(
    sodium.crypto_box_NONCEBYTES,
    -sodium.crypto_box_PUBLICKEYBYTES
  );
  const decrypted = sodium.crypto_box_open_easy(
    ciphertext,
    nonce,
    ephemeralPublicKey,
    curve25519PrivateKey
  );

  return sodium.to_string(decrypted);
};

const decodePayloadData = async ({ data, privateKey }) => {
  if (!data) {
    return null;
  }

  if (typeof data !== "string") {
    return data;
  }

  if (!privateKey) {
    throw new Error(
      "cNGN response decryption is not configured. Add a CNGN private key to enable live provider reads."
    );
  }

  return parseJsonMaybe(await decryptWithPrivateKey(privateKey, data));
};

const mapMerchantBalances = (payload) =>
  Array.isArray(payload)
    ? payload.map((entry) => ({
        assetCode: entry.asset_code || null,
        assetType: entry.asset_type || null,
        balance: Number.parseFloat(String(entry.balance || "0")) || 0
      }))
    : [];

const mapMerchantTransactions = (payload) => {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload)
      ? payload
      : [];

  return rows.map((entry) => ({
    amount: Number.parseFloat(String(entry.amount || "0")) || 0,
    assetSymbol: entry.asset_symbol || null,
    createdAt: entry.createdAt || null,
    description: entry.description || null,
    explorerLink: entry.explorer_link || null,
    id: entry.id || null,
    network: entry.network || null,
    raw: entry,
    receiver: entry.receiver || null,
    receiverAccountNumber: entry.receiver?.accountNumber || null,
    receiverAddress: entry.receiver?.address || null,
    reference: entry.trx_ref || null,
    status: entry.status || null,
    type: entry.trx_type || null
  }));
};

const mapMerchantTransactionPage = (payload) => ({
  pagination:
    typeof payload?.pagination === "object" && payload.pagination
      ? payload.pagination
      : null,
  transactions: mapMerchantTransactions(payload)
});

const mapBankList = (payload) =>
  Array.isArray(payload)
    ? payload.map((entry) => ({
        code: entry.code || null,
        country: entry.country || null,
        name: entry.name || null,
        nibssBankCode: entry.nibss_bank_code || null,
        slug: entry.slug || null
      }))
    : [];

const mapVirtualAccount = (payload) => ({
  accountNumber: payload?.accountNumber || null,
  accountReference: payload?.accountReference || null
});

const mapRedeemResponse = (payload) => ({
  amount: Number.parseFloat(String(payload?.amount || "0")) || 0,
  createdAt: payload?.createdAt || null,
  id: payload?.id || null,
  reference: payload?.trx_ref || null,
  status: payload?.status || null
});

const mapWithdrawResponse = (payload) => ({
  address: payload?.address || null,
  reference: payload?.trxRef || null
});

const mapVerifiedWithdrawal = (payload) => ({
  address: payload?.receiver?.address || null,
  amount: Number.parseFloat(String(payload?.amount || "0")) || 0,
  createdAt: payload?.createdAt || null,
  explorerLink: payload?.explorer_link || null,
  externalTransactionHash: payload?.extl_trx_hash || null,
  id: payload?.id || null,
  network: payload?.network || null,
  reference: payload?.trx_ref || null,
  status: payload?.status || null,
  transactionHash: payload?.base_trx_hash || null
});

const prepareAesKey = (key) => createHash("sha256").update(key).digest();

const encryptRequestPayload = ({ data, key }) => {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", prepareAesKey(key), iv);
  let encrypted = cipher.update(data, "utf8", "base64");
  encrypted += cipher.final("base64");

  return {
    content: encrypted,
    iv: iv.toString("base64")
  };
};

export const createCngnClient = ({
  allowMerchantWrites = false,
  apiBaseUrl = DEFAULT_BASE_URL,
  apiKey = null,
  privateKey = null,
  requestEncryptionKey = null,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) => {
  const normalizedApiKey = String(apiKey || "").trim();
  const normalizedPrivateKey = normalizeMultilineKey(privateKey || "");
  const normalizedEncryptionKey = String(requestEncryptionKey || "").trim();
  const normalizedBaseUrl = String(apiBaseUrl || DEFAULT_BASE_URL).replace(
    /\/+$/,
    ""
  );

  const isReadConfigured = Boolean(normalizedApiKey && normalizedPrivateKey);
  const isRequestEncryptionConfigured = Boolean(
    normalizedApiKey && normalizedPrivateKey && normalizedEncryptionKey
  );
  const isWriteReady = Boolean(
    isRequestEncryptionConfigured && allowMerchantWrites
  );

  const request = async ({ path, searchParams }) => {
    if (!isReadConfigured) {
      throw new Error(
        "cNGN live reads are not configured. Add the API key and private key first."
      );
    }

    const url = new URL(path, normalizedBaseUrl);

    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${normalizedApiKey}`,
          "content-type": "application/json"
        },
        method: "GET",
        signal: controller.signal
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.message || `cNGN request failed with ${response.status}.`
        );
      }

      return {
        data: await decodePayloadData({
          data: payload?.data,
          privateKey: normalizedPrivateKey
        }),
        message: payload?.message || null,
        status: payload?.status || response.status
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const postRequest = async ({ body, path, requiresMerchantWrite = false }) => {
    if (!isRequestEncryptionConfigured) {
      throw new Error(
        "cNGN request encryption is not configured. Add the API key, private key, and encryption key first."
      );
    }

    if (requiresMerchantWrite && !allowMerchantWrites) {
      throw new Error(
        "cNGN merchant write actions are disabled. Set CNGN_MERCHANT_WRITE_ENABLED=true only when you are ready to move real funds."
      );
    }

    const url = new URL(path, normalizedBaseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const encryptedBody = encryptRequestPayload({
        data: JSON.stringify(body),
        key: normalizedEncryptionKey
      });
      // cNGN docs show AES-encrypted request payloads with { iv, content }.
      const response = await fetch(url, {
        body: JSON.stringify(encryptedBody),
        headers: {
          Authorization: `Bearer ${normalizedApiKey}`,
          "content-type": "application/json"
        },
        method: "POST",
        signal: controller.signal
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload?.message || `cNGN request failed with ${response.status}.`
        );
      }

      return {
        data: await decodePayloadData({
          data: payload?.data,
          privateKey: normalizedPrivateKey
        }),
        message: payload?.message || null,
        status: payload?.status || response.status
      };
    } finally {
      clearTimeout(timer);
    }
  };

  const getBalance = async () => {
    const payload = await request({
      path: "/v1/api/balance"
    });

    return mapMerchantBalances(payload.data);
  };

  const getTransactionHistoryPage = async ({ limit = 10, page = 1 } = {}) => {
    const payload = await request({
      path: "/v1/api/transactions",
      searchParams: {
        limit,
        page
      }
    });

    return mapMerchantTransactionPage(payload.data);
  };

  const getTransactionHistory = async ({ limit = 10, page = 1 } = {}) => {
    const result = await getTransactionHistoryPage({
      limit,
      page
    });

    return result.transactions;
  };

  const getBankList = async () => {
    const payload = await request({
      path: "/v1/api/banks"
    });

    return mapBankList(payload.data);
  };

  const createVirtualAccount = async ({ provider = "korapay" } = {}) => {
    const payload = await postRequest({
      body: {
        provider
      },
      path: "/v1/api/createVirtualAccount"
    });

    return mapVirtualAccount(payload.data);
  };

  const redeemAsset = async ({
    accountNumber,
    amount,
    bankCode,
    saveDetails = false
  }) => {
    const payload = await postRequest({
      body: {
        accountNumber,
        amount,
        bank: bankCode,
        saveDetails
      },
      path: "/v1/api/redeemAsset",
      requiresMerchantWrite: true
    });

    return mapRedeemResponse(payload.data);
  };

  const withdrawCngn = async ({
    address,
    amount,
    network,
    shouldSaveAddress = false
  }) => {
    const payload = await postRequest({
      body: {
        address,
        amount,
        network,
        shouldSaveAddress
      },
      path: "/v1/api/withdraw",
      requiresMerchantWrite: true
    });

    return mapWithdrawResponse(payload.data);
  };

  const verifyWithdrawal = async ({ transactionRef }) => {
    const payload = await request({
      path: `/v1/api/withdraw/verify/${encodeURIComponent(transactionRef)}`
    });

    return mapVerifiedWithdrawal(payload.data);
  };

  const getRailSummary = () => ({
    configured: isReadConfigured,
    mode: "merchant_rail",
    readStatus: isReadConfigured ? "configured" : "unconfigured",
    supports: {
      balanceRead: true,
      bankListRead: true,
      transactionHistoryRead: true,
      virtualAccountWriteReady: isRequestEncryptionConfigured,
      walletWithdrawWriteReady: isWriteReady,
      withdrawToBankWriteReady: isWriteReady
    }
  });

  const getRailSnapshot = async () => {
    const checkedAt = new Date().toISOString();

    if (!isReadConfigured) {
      return {
        checkedAt,
        configured: false,
        merchant: null,
        mode: "merchant_rail",
        readStatus: "unconfigured",
        supports: getRailSummary().supports
      };
    }

    try {
      // cNGN read endpoints are merchant-level. We expose them as provider rail
      // diagnostics only, not as a user's personal wallet balance.
      const [balance, recentTransactions, banks] = await Promise.all([
        getBalance(),
        getTransactionHistory({ limit: 10, page: 1 }),
        getBankList()
      ]);

      return {
        checkedAt,
        configured: true,
        merchant: {
          balance,
          banks,
          recentTransactions
        },
        mode: "merchant_rail",
        readStatus: "available",
        supports: getRailSummary().supports
      };
    } catch (error) {
      return {
        checkedAt,
        configured: true,
        error:
          error instanceof Error
            ? error.message
            : "Unable to read cNGN provider state.",
        merchant: null,
        mode: "merchant_rail",
        readStatus: "degraded",
        supports: getRailSummary().supports
      };
    }
  };

  return {
    createVirtualAccount,
    getBalance,
    getBankList,
    getRailSnapshot,
    getRailSummary,
    getTransactionHistory,
    getTransactionHistoryPage,
    isReadConfigured,
    isRequestEncryptionConfigured,
    isWriteReady,
    // TODO: Add whitelist/updateBusiness and bridge support once the payout
    // policy and production approval flow are finalized for Every1.
    normalizedBaseUrl,
    redeemAsset,
    verifyWithdrawal,
    withdrawCngn
  };
};
