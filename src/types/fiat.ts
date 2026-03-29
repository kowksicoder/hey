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

export interface FiatWalletResponse {
  wallet: FiatWalletSummary;
  banks: FiatBankAccount[];
  providers: {
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

export interface FiatDepositInitiateInput {
  amountNaira: number;
  email: string;
  idempotencyKey?: string;
  name?: string;
  phone?: string;
  redirectUrl?: string;
}

export interface FiatDepositInitiateResponse {
  success: boolean;
  message: string;
  transaction: {
    id: string;
    amountNaira: number;
    currency: string;
    status: string;
    checkoutReference: string;
    checkoutUrl: null | string;
    expiresAt: null | string;
  };
  checkout?: {
    mode: "inline" | "redirect";
    publicKey?: null | string;
    txRef: string;
    amountNaira: number;
    currency: string;
    customer: {
      email: string;
      name?: null | string;
      phoneNumber?: null | string;
    };
    redirectUrl: string;
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
  naira_amount: number;
  support_amount_naira: number;
  estimated_coin_amount: number;
  fee_naira: number;
  total_naira: number;
  expires_at: string;
  quote_id: string;
}

export interface SupportExecuteInput {
  executionWalletAddress?: string;
  quoteId: string;
  idempotencyKey?: string;
}

export interface SupportExecuteResponse {
  success: boolean;
  message: string;
  status?: string;
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
  quote_id: string;
  settlement: {
    address: string;
    token_decimals: number;
    transfer_amount_label: string;
    transfer_amount_raw: string;
  };
}

export interface SellExecuteInput {
  executionWalletAddress?: string;
  quoteId: string;
  idempotencyKey?: string;
  transactionHash?: string;
}

export interface SellExecuteResponse {
  success: boolean;
  message: string;
  status?: string;
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
