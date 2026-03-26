import { CurrencyDollarIcon } from "@heroicons/react/24/outline";
import { CheckBadgeIcon } from "@heroicons/react/24/solid";
import { useQuery } from "@tanstack/react-query";
import {
  type GetProfileBalancesResponse,
  getProfileBalances,
  setApiKey
} from "@zoralabs/coins-sdk";
import { Link } from "react-router";
import {
  EmptyState,
  ErrorMessage,
  Image,
  Spinner
} from "@/components/Shared/UI";
import { ZORA_API_KEY } from "@/data/constants";
import { NAIRA_SYMBOL } from "@/helpers/formatNaira";
import getCoinPath from "@/helpers/getCoinPath";
import { formatUsdMetric } from "@/helpers/liveCreatorData";
import nFormatter from "@/helpers/nFormatter";

setApiKey(ZORA_API_KEY);

type CoinBalanceNode = NonNullable<
  NonNullable<
    NonNullable<GetProfileBalancesResponse["profile"]>["coinBalances"]
  >["edges"][number]["node"]
>;

interface AccountHoldingsProps {
  address: string;
  username: string;
}

const formatTokenBalance = (value?: null | string) => {
  const amount = Number.parseFloat(value ?? "0");

  if (!Number.isFinite(amount) || amount <= 0) {
    return "0";
  }

  if (amount >= 1000) {
    return nFormatter(amount, 2);
  }

  if (amount >= 1) {
    return amount.toFixed(2).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
  }

  return amount.toFixed(4).replace(/\.?0+$/, "");
};

const getUsdValue = (holding: CoinBalanceNode) => {
  const balance = Number.parseFloat(holding.balance ?? "0");
  const price = Number.parseFloat(
    holding.coin?.tokenPrice?.priceInUsdc ??
      holding.coin?.tokenPrice?.priceInPoolToken ??
      "0"
  );

  if (!Number.isFinite(balance) || !Number.isFinite(price)) {
    return 0;
  }

  return balance * price;
};

const AccountHoldings = ({ address, username }: AccountHoldingsProps) => {
  const holdingsQuery = useQuery({
    enabled: Boolean(address),
    queryFn: async () =>
      await getProfileBalances({
        count: 24,
        identifier: address,
        sortOption: "USD_VALUE"
      }),
    queryKey: ["account-holdings", address]
  });

  if (holdingsQuery.isLoading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center">
        <Spinner size="sm" />
      </div>
    );
  }

  if (holdingsQuery.error) {
    return (
      <ErrorMessage
        error={holdingsQuery.error}
        title="Failed to load holdings"
      />
    );
  }

  const holdings =
    holdingsQuery.data?.data?.profile?.coinBalances?.edges
      ?.map((edge) => edge.node)
      .filter((holding) => holding.coin && !holding.coin.platformBlocked) ?? [];

  if (!holdings.length) {
    return (
      <EmptyState
        icon={<CurrencyDollarIcon className="size-8" />}
        message={
          <div>
            <b className="mr-1">{username}</b>
            <span>isn't holding any coins yet!</span>
          </div>
        }
      />
    );
  }

  return (
    <div className="mx-5 mb-5 space-y-3 md:mx-0">
      {holdings.map((holding) => {
        const coin = holding.coin;

        if (!coin) {
          return null;
        }

        const creatorHandle = coin.creatorProfile?.handle?.trim()
          ? coin.creatorProfile.handle.startsWith("@")
            ? coin.creatorProfile.handle
            : `@${coin.creatorProfile.handle}`
          : null;
        const isOwnCreatorCoin =
          address.trim().toLowerCase() ===
          coin.creatorAddress?.trim().toLowerCase();
        const balanceDisplay = formatTokenBalance(holding.balance);
        const usdValue = getUsdValue(holding);

        return (
          <Link
            className="block rounded-[1.25rem] border border-gray-200 bg-white px-3.5 py-3 transition hover:border-gray-300 hover:bg-gray-50 dark:border-gray-800 dark:bg-[#0f1012] dark:hover:border-gray-700 dark:hover:bg-[#15171b]"
            key={holding.id}
            to={getCoinPath(coin.address)}
          >
            <div className="flex items-center gap-3">
              <Image
                alt={coin.name}
                className="size-12 rounded-2xl bg-gray-100 object-cover dark:bg-gray-800"
                height={48}
                src={coin.mediaContent?.previewImage?.medium}
                width={48}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-semibold text-gray-950 text-sm dark:text-white">
                    {coin.name}
                  </p>
                  {isOwnCreatorCoin ? (
                    <CheckBadgeIcon className="size-4 shrink-0 text-brand-500" />
                  ) : null}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                  <span>
                    {NAIRA_SYMBOL}
                    {coin.symbol}
                  </span>
                  {creatorHandle ? <span>{creatorHandle}</span> : null}
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-gray-950 text-sm dark:text-white">
                  {balanceDisplay} {coin.symbol}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {formatUsdMetric(usdValue)}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-gray-50 px-2.5 py-2 dark:bg-[#17191d]">
                <p className="font-semibold text-[12px] text-gray-950 dark:text-white">
                  {formatUsdMetric(
                    coin.tokenPrice?.priceInUsdc ||
                      coin.tokenPrice?.priceInPoolToken
                  )}
                </p>
                <p className="mt-0.5 text-[9px] text-gray-500 uppercase tracking-[0.08em] dark:text-gray-400">
                  Price
                </p>
              </div>
              <div className="rounded-2xl bg-gray-50 px-2.5 py-2 dark:bg-[#17191d]">
                <p className="font-semibold text-[12px] text-gray-950 dark:text-white">
                  {formatUsdMetric(coin.marketCap)}
                </p>
                <p className="mt-0.5 text-[9px] text-gray-500 uppercase tracking-[0.08em] dark:text-gray-400">
                  MC
                </p>
              </div>
              <div className="rounded-2xl bg-gray-50 px-2.5 py-2 dark:bg-[#17191d]">
                <p className="font-semibold text-[12px] text-gray-950 dark:text-white">
                  {formatUsdMetric(coin.volume24h)}
                </p>
                <p className="mt-0.5 text-[9px] text-gray-500 uppercase tracking-[0.08em] dark:text-gray-400">
                  Vol
                </p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
};

export default AccountHoldings;
