import {
  type GetCoinSwapsResponse,
  getCoinSwaps,
  setApiKey
} from "@zoralabs/coins-sdk";
import type { Address } from "viem";
import { base } from "viem/chains";
import { DEFAULT_AVATAR } from "@/data/constants";
import formatAddress from "@/helpers/formatAddress";
import getZoraApiKey from "@/helpers/getZoraApiKey";

const zoraApiKey = getZoraApiKey();

if (zoraApiKey) {
  setApiKey(zoraApiKey);
}

type SwapNode = NonNullable<
  NonNullable<
    NonNullable<GetCoinSwapsResponse["zora20Token"]>["swapActivities"]
  >["edges"]
>[number]["node"];

export interface CoinPriceHistoryPoint {
  id: string;
  timestamp: string;
  priceUsd: number;
  totalUsd: number;
  coinAmount: number;
  activityType: "BUY" | "SELL" | null;
  actorAddress: string;
  actorAvatar: string;
  actorHandle: string;
  actorProfileHandle: null | string;
  transactionHash: string;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 8;

const parseSwapNode = (node: SwapNode): CoinPriceHistoryPoint | null => {
  const coinAmount = Number.parseFloat(node.coinAmount || "");
  const totalUsd = Number.parseFloat(
    node.currencyAmountWithPrice?.priceUsdc || ""
  );
  const senderHandle = node.senderProfile?.handle?.trim() || null;

  if (!Number.isFinite(coinAmount) || coinAmount <= 0) {
    return null;
  }

  if (!Number.isFinite(totalUsd) || totalUsd <= 0) {
    return null;
  }

  const priceUsd = totalUsd / coinAmount;

  if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
    return null;
  }

  return {
    activityType: node.activityType || null,
    actorAddress: node.senderAddress,
    actorAvatar:
      node.senderProfile?.avatar?.previewImage?.medium ||
      node.senderProfile?.avatar?.previewImage?.small ||
      DEFAULT_AVATAR,
    actorHandle: senderHandle
      ? senderHandle.startsWith("@")
        ? senderHandle
        : `@${senderHandle}`
      : formatAddress(node.senderAddress),
    actorProfileHandle: senderHandle,
    coinAmount,
    id: node.id,
    priceUsd,
    timestamp: node.blockTimestamp,
    totalUsd,
    transactionHash: node.transactionHash
  };
};

const getCoinPriceHistory = async ({
  address,
  maxPages = MAX_PAGES
}: {
  address: Address;
  maxPages?: number;
}) => {
  let after: string | undefined;
  const history: CoinPriceHistoryPoint[] = [];

  for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
    const response = await getCoinSwaps({
      address,
      after,
      chain: base.id,
      first: PAGE_SIZE
    });

    const swapActivities = response.data?.zora20Token?.swapActivities;
    const edges = swapActivities?.edges ?? [];

    for (const edge of edges) {
      if (!edge?.node) {
        continue;
      }

      const parsed = parseSwapNode(edge.node);

      if (parsed) {
        history.push(parsed);
      }
    }

    if (
      !swapActivities?.pageInfo?.hasNextPage ||
      !swapActivities.pageInfo.endCursor
    ) {
      break;
    }

    after = swapActivities.pageInfo.endCursor;
  }

  return history.sort(
    (left, right) =>
      new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
  );
};

export default getCoinPriceHistory;
