import { useQuery } from "@tanstack/react-query";
import { getUsdToNgnRate } from "@/helpers/fxRate";
import { USD_TO_NGN_RATE } from "@/helpers/formatNaira";

export const resolveUsdToNgnRate = (value?: number | null) =>
  Number.isFinite(value) && (value ?? 0) > 0 ? (value as number) : USD_TO_NGN_RATE;

const useUsdToNgnRate = ({
  refetchInterval = 300_000,
  staleTime = 300_000
}: {
  refetchInterval?: number;
  staleTime?: number;
} = {}) =>
  useQuery({
    queryFn: getUsdToNgnRate,
    queryKey: ["fx-rate", "usd-ngn"],
    refetchInterval,
    staleTime
  });

export default useUsdToNgnRate;

