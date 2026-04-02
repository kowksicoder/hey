import type { SellExecuteResponse, SupportExecuteResponse } from "@/types/fiat";

const NOT_READY_PATTERNS = [
  "public.fiat_",
  "support_quotes",
  "sell_quotes",
  "fiat_wallets",
  "schema cache"
];

type FiatExecutionResponse = SellExecuteResponse | SupportExecuteResponse;

export const createFiatIdempotencyKey = (scope: string) => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${scope}-${crypto.randomUUID()}`;
  }

  return `${scope}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const normalizeFiatUiError = (
  error: unknown,
  fallback = "Something went wrong. Please try again."
) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  const normalized = message.trim();

  if (!normalized) {
    return fallback;
  }

  const lower = normalized.toLowerCase();

  if (NOT_READY_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return "Naira wallet is still being prepared on this environment.";
  }

  if (lower.includes("fiat runtime is not configured")) {
    return "Naira wallet is not configured on this environment yet.";
  }

  if (
    lower.includes("invalid fiat request signature") ||
    lower.includes("missing fiat") ||
    lower.includes("signature expired")
  ) {
    return "Approve the secure wallet check and try again.";
  }

  return normalized;
};

export const getFiatExecutionStatus = (response: FiatExecutionResponse) =>
  (
    response.status ||
    ("support" in response ? response.support?.status : undefined) ||
    ("sell" in response ? response.sell?.status : undefined) ||
    ""
  )
    .toString()
    .toLowerCase();

export const isFiatExecutionCompleted = (response: FiatExecutionResponse) => {
  const status = getFiatExecutionStatus(response);
  return status === "completed" || status === "succeeded";
};

export const isFiatExecutionFailed = (response: FiatExecutionResponse) =>
  getFiatExecutionStatus(response) === "failed";

export const shouldPollFiatExecution = (response: FiatExecutionResponse) =>
  Boolean(
    response.shouldPoll || getFiatExecutionStatus(response) === "processing"
  );

export const sleep = (ms: number) =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

export const pollFiatExecutionUntilSettled = async <
  TResponse extends FiatExecutionResponse
>({
  getStatus,
  initialResponse,
  maxAttempts = 6
}: {
  getStatus: () => Promise<TResponse>;
  initialResponse: TResponse;
  maxAttempts?: number;
}) => {
  let latest = initialResponse;
  let attempts = 0;

  while (shouldPollFiatExecution(latest) && attempts < maxAttempts) {
    await sleep(latest.refreshAfterMs || 5000);
    latest = await getStatus();
    attempts += 1;
  }

  return latest;
};
