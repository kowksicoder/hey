import { USD_TO_NGN_RATE } from "@/helpers/formatNaira";

const parsePositiveNumber = (value: unknown) => {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const getUsdToNgnRate = async () => {
  try {
    const response = await fetch("/api/fx", {
      headers: { accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`FX rate request failed: ${response.status}`);
    }

    const payload = (await response.json()) as {
      ngnPerUsd?: number;
      rate?: number;
    };
    const parsed =
      parsePositiveNumber(payload?.ngnPerUsd) ??
      parsePositiveNumber(payload?.rate);

    return parsed ?? USD_TO_NGN_RATE;
  } catch {
    return USD_TO_NGN_RATE;
  }
};

