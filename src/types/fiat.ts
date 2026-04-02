export interface FiatWalletSummary {
  id: string;
  profileId: string;
  currency: string;
  availableBalance: number;
  availableBalanceKobo: number;
  pendingBalance: number;
  pendingBalanceKobo: number;
  lockedBalance: number;
  lockedBalanceKobo: number;
  totalBalance: number;
  totalBalanceKobo: number;
  lastTransactionAt: null | string;
}

export interface FiatBankAccount {
  id: string;
  provider: "flutterwave";
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountName: null | string;
  isDefault: boolean;
  isVerified: boolean;
}

export interface FiatCngnRailSupports {
  balanceRead: boolean;
  bankListRead: boolean;
  transactionHistoryRead: boolean;
  virtualAccountWriteReady: boolean;
  walletWithdrawWriteReady: boolean;
  withdrawToBankWriteReady: boolean;
}

export interface FiatCngnRailSummary {
  configured: boolean;
  mode: "merchant_rail";
  readStatus: "available" | "configured" | "degraded" | "unconfigured";
  supports: FiatCngnRailSupports;
}

export interface FiatCngnMerchantBalance {
  assetCode: null | string;
  assetType: null | string;
  balance: number;
}

export interface FiatCngnMerchantBank {
  code: null | string;
  country: null | string;
  name: null | string;
  nibssBankCode: null | string;
  slug: null | string;
}

export interface FiatCngnMerchantTransaction {
  amount: number;
  assetSymbol: null | string;
  createdAt: null | string;
  description: null | string;
  explorerLink: null | string;
  id: null | string;
  network: null | string;
  raw?: Record<string, unknown>;
  reference: null | string;
  receiver?: null | Record<string, unknown>;
  receiverAccountNumber?: null | string;
  receiverAddress?: null | string;
  status: null | string;
  type: null | string;
}

export interface FiatCngnRailResponse extends FiatCngnRailSummary {
  checkedAt: string;
  error?: string;
  merchant: null | {
    balance: FiatCngnMerchantBalance[];
    banks: FiatCngnMerchantBank[];
    recentTransactions: FiatCngnMerchantTransaction[];
  };
}

export interface FiatCngnBanksResponse {
  banks: FiatCngnMerchantBank[];
}

export interface FiatCngnVirtualAccountInput {
  idempotencyKey?: string;
  provider?: string;
}

export interface FiatCngnVirtualAccountResponse {
  account: {
    accountNumber: null | string;
    accountReference: null | string;
  };
  message: string;
  success: boolean;
}

export interface FiatCngnDepositReconcileResponse {
  message: string;
  success: boolean;
  sync: {
    checked: number;
    failed: number;
    matched: number;
    processing: number;
    succeeded: number;
    waiting: number;
    updated: number;
  };
}

export interface FiatTradeReconcileResponse {
  message: string;
  success: boolean;
  sync: {
    checked: number;
    completed: number;
    failed: number;
    processing: number;
  };
}

export interface FiatCngnRedeemInput {
  accountNumber: string;
  amount: number;
  bankCode: string;
  idempotencyKey?: string;
  saveDetails?: boolean;
}

export interface FiatCngnRedeemResponse {
  message: string;
  redemption: {
    amount: number;
    createdAt: null | string;
    id: null | string;
    reference: null | string;
    status: null | string;
  };
  success: boolean;
}

export interface FiatCngnWithdrawInput {
  address: string;
  amount: number;
  idempotencyKey?: string;
  network: string;
  shouldSaveAddress?: boolean;
}

export interface FiatCngnWithdrawResponse {
  message: string;
  success: boolean;
  withdrawal: {
    address: null | string;
    reference: null | string;
  };
}

export interface FiatCngnVerifyWithdrawalResponse {
  success: boolean;
  withdrawal: {
    address: null | string;
    amount: number;
    createdAt: null | string;
    explorerLink: null | string;
    externalTransactionHash: null | string;
    id: null | string;
    network: null | string;
    reference: null | string;
    status: null | string;
    transactionHash: null | string;
  };
}

export interface FiatWalletResponse {
  wallet: FiatWalletSummary;
  banks: FiatBankAccount[];
  providers: {
    rails?: {
      cngn: FiatCngnRailSummary;
    };
    paymentConfigured: boolean;
    payoutConfigured: boolean;
  };
}

export interface FiatWalletTransaction {
  id: string;
  type: "deposit" | "sell" | "support" | "withdrawal";
  status: string;
  direction: "credit" | "debit";
  title: string;
  subtitle: string;
  amountNaira: number;
  feeNaira: number;
  netAmountNaira: number;
  coinAddress: null | string;
  coinSymbol: null | string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

export interface FiatWalletTransactionsResponse {
  transactions: FiatWalletTransaction[];
}

export interface FiatTradeFundingSummary {
  availableBalance: number;
  availableBalanceKobo: number;
  balanceSource: "every1_wallet_ledger";
  buySettlementMessage?: null | string;
  buySettlementReady: boolean;
  currency: string;
  depositRail: "cngn_virtual_account" | "flutterwave_checkout" | "internal";
  principalModel:
    | "every1_wallet_ledger"
    | "platform_treasury"
    | "user_backed_cngn";
  payoutRail: "cngn" | "flutterwave" | "internal";
  rails: {
    cngn: FiatCngnRailSummary;
  };
  tradeFundingRail: "cngn" | "flutterwave" | "every1_wallet";
}

export interface FiatDepositInitiateInput {
  amountNaira: number;
  email?: string;
  idempotencyKey?: string;
  name?: string;
  phone?: string;
  provider?: string;
  redirectUrl?: string;
}

export interface FiatDepositInitiateResponse {
  checkout?: {
    amountNaira: number;
    currency: string;
    customer: {
      email?: null | string;
      name?: null | string;
      phoneNumber?: null | string;
    };
    mode: "inline" | "redirect";
    publicKey?: string;
    redirectUrl?: string;
    txRef: string;
  };
  success: boolean;
  message: string;
  transaction: {
    id: string;
    amountNaira: number;
    currency: string;
    provider: "cngn" | "flutterwave";
    status: string;
    checkoutReference: string;
    checkoutUrl: null | string;
    expiresAt: null | string;
  };
  virtualAccount?: {
    accountNumber: null | string;
    accountReference: null | string;
    provider: "cngn";
  };
}

export interface FiatWithdrawInput {
  amountNaira: number;
  bankAccountId?: string;
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  narration?: string;
  makeDefault?: boolean;
  idempotencyKey?: string;
}

export interface FiatWithdrawResponse {
  success: boolean;
  message: string;
  withdrawal: {
    id: string;
    amountNaira: number;
    status: string;
    bankAccount: FiatBankAccount;
  };
}

export interface SupportQuoteInput {
  nairaAmount: number;
  creatorCoinId?: string;
  creatorId?: string;
  coinAddress?: string;
  executionWalletAddress?: string;
  launchId?: string;
  ticker?: string;
  idempotencyKey?: string;
}

export interface SupportQuoteResponse {
  creator: {
    id: string;
    name: string;
  };
  funding?: null | FiatTradeFundingSummary;
  naira_amount: number;
  support_amount_naira: number;
  estimated_coin_amount: number;
  fee_naira: number;
  total_naira: number;
  expires_at: string;
  quote_id: string;
  wallet?: FiatWalletSummary;
}

export interface SupportExecuteInput {
  executionWalletAddress?: string;
  quoteId: string;
  idempotencyKey?: string;
}

export interface SupportExecuteResponse {
  funding?: null | FiatTradeFundingSummary;
  success: boolean;
  message: string;
  refreshAfterMs?: number;
  status?: string;
  shouldPoll?: boolean;
  new_naira_balance?: number;
  support?: {
    id: string;
    quoteId: string;
    status: string;
    coinAddress: string;
    coinSymbol: null | string;
    estimatedCoinAmount: number;
    feeNaira: number;
    supportAmountNaira: number;
    totalNaira: number;
  };
  wallet?: FiatWalletSummary;
}

export interface SellQuoteInput {
  coinAmount: number;
  creatorCoinId?: string;
  coinAddress?: string;
  executionWalletAddress?: string;
  launchId?: string;
  ticker?: string;
  idempotencyKey?: string;
}

export interface SellQuoteResponse {
  coin: {
    id: string;
    address: string;
    name: string;
    symbol: null | string;
  };
  coin_amount: number;
  gross_naira_return: number;
  estimated_naira_return: number;
  fee_naira: number;
  expires_at: string;
  funding?: null | FiatTradeFundingSummary;
  quote_id: string;
  settlement: {
    address: string;
    token_decimals: number;
    transfer_amount_label: string;
    transfer_amount_raw: string;
  };
  wallet?: FiatWalletSummary;
}

export interface SellExecuteInput {
  executionWalletAddress?: string;
  quoteId: string;
  idempotencyKey?: string;
  transactionHash?: string;
}

export interface SellExecuteResponse {
  funding?: null | FiatTradeFundingSummary;
  success: boolean;
  message: string;
  refreshAfterMs?: number;
  status?: string;
  shouldPoll?: boolean;
  new_naira_balance?: number;
  sell?: {
    id: string;
    quoteId: string;
    status: string;
    coinAddress: string;
    coinSymbol: null | string;
    coinAmount: number;
    grossNairaReturn: number;
    estimatedNairaReturn: number;
    feeNaira: number;
    settlementAddress?: string;
    tokenDecimals?: number;
    transferAmountLabel?: string;
    transferAmountRaw?: string;
  };
  wallet?: FiatWalletSummary;
}

export type SwapQuoteNgnToCoinInput = SupportQuoteInput;

export type SwapQuoteNgnToCoinResponse = SupportQuoteResponse;

export type SwapExecuteNgnToCoinInput = SupportExecuteInput;

export type SwapExecuteNgnToCoinResponse = SupportExecuteResponse;

export type SwapQuoteCoinToNgnInput = SellQuoteInput;

export type SwapQuoteCoinToNgnResponse = SellQuoteResponse;

export type SwapExecuteCoinToNgnInput = SellExecuteInput;

export type SwapExecuteCoinToNgnResponse = SellExecuteResponse;

export interface SwapQuoteCoinToCoinInput {
  executionWalletAddress?: string;
  fromCoinAddress?: string;
  fromCoinAmount: number;
  fromCreatorCoinId?: string;
  fromLaunchId?: string;
  fromTicker?: string;
  idempotencyKey?: string;
  toCoinAddress?: string;
  toCreatorCoinId?: string;
  toLaunchId?: string;
  toTicker?: string;
}

export interface SwapQuoteCoinToCoinResponse {
  estimated_to_coin_amount: number;
  expires_at: string;
  from_coin: {
    address: string;
    id: string;
    name: string;
    symbol: null | string;
  };
  from_coin_amount: number;
  quote_id: string;
  to_coin: {
    address: string;
    id: string;
    name: string;
    symbol: null | string;
  };
}

export interface SwapExecuteCoinToCoinInput {
  executionWalletAddress?: string;
  idempotencyKey?: string;
  quoteId: string;
  transactionHash?: string;
}

export interface SwapExecuteCoinToCoinResponse {
  error?: string;
  message: string;
  status?: string;
  success: boolean;
  swap?: {
    fromCoinAddress: string;
    fromCoinAmount: number;
    fromCoinSymbol: null | string;
    id: string;
    quoteId: string;
    status: string;
    toCoinAddress: string;
    toCoinAmount: number;
    toCoinSymbol: null | string;
  };
  wallet?: FiatWalletSummary;
}

export interface FiatCreatorProfile {
  id: string;
  username: null | string;
  displayName: null | string;
  bio: null | string;
  avatarUrl: null | string;
  bannerUrl: null | string;
  walletAddress: null | string;
  coinCount: number;
}

export interface FiatCreatorCoin {
  id: string;
  ticker: string;
  name: string;
  description: null | string;
  coverImageUrl: null | string;
  coinAddress: string;
  status: string;
  launchedAt: null | string;
  live: null | {
    address: string;
    name: string;
    symbol: null | string;
    priceUsd: number;
    priceNaira: number;
    marketCapUsd: number;
    marketCapNaira: number;
    volume24hUsd: number;
    volume24hNaira: number;
    holdersCount: number;
    uniqueHolders: number;
    mediaContent: {
      image: null | string;
    };
  };
  creator: {
    id: string;
    username: null | string;
    displayName: null | string;
    avatarUrl: null | string;
    walletAddress: null | string;
  };
}

export interface FiatCreatorCoinActivityResponse {
  coin: FiatCreatorCoin;
  activity: Array<{
    id: string;
    kind: "sell" | "support";
    actorProfileId: string;
    amountNaira: number;
    coinSymbol: null | string;
    status: string;
    createdAt: string;
    metadata: Record<string, unknown>;
  }>;
}
