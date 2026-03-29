import nFormatter from "@/helpers/nFormatter";

export const USD_TO_NGN_RATE = 1378.02126408623;

export const NAIRA_SYMBOL = "₦";

type FormatNairaOptions = {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
};

export const formatNaira = (
  value: number,
  options: FormatNairaOptions = {}
) => {
  const safeValue = Number.isFinite(value) && value > 0 ? value : 0;

  const maximumFractionDigits =
    options.maximumFractionDigits ?? (safeValue >= 100 ? 0 : 2);

  const formatted = new Intl.NumberFormat("en-NG", {
    maximumFractionDigits,
    minimumFractionDigits: options.minimumFractionDigits ?? 0
  }).format(safeValue);

  return `${NAIRA_SYMBOL}${formatted}`;
};

export const formatCompactNaira = (value: number, digits = 2) => {
  const safeValue = Number.isFinite(value) && value > 0 ? value : 0;

  if (safeValue <= 0) {
    return `${NAIRA_SYMBOL}0`;
  }

  return `${NAIRA_SYMBOL}${nFormatter(safeValue, digits)}`;
};

export const convertUsdToNgn = (value: number) => {
  const safeValue = Number.isFinite(value) && value > 0 ? value : 0;
  return safeValue * USD_TO_NGN_RATE;
};

export const formatNairaFromUsd = (
  value: number,
  options: FormatNairaOptions = {}
) => formatNaira(convertUsdToNgn(value), options);

export const formatCompactNairaFromUsd = (value: number, digits = 2) =>
  formatCompactNaira(convertUsdToNgn(value), digits);
