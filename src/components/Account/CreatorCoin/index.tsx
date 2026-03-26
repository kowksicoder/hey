import { useQuery } from "@tanstack/react-query";
import { type GetCoinResponse, getCoin, setApiKey } from "@zoralabs/coins-sdk";
import { useState } from "react";
import type { Address } from "viem";
import { base } from "viem/chains";
import { ZORA_API_KEY } from "@/data/constants";
import { NAIRA_SYMBOL } from "@/helpers/formatNaira";
import getAccountAttribute from "@/helpers/getAccountAttribute";
import type { AccountFragment } from "@/indexer/generated";
import { Image, Modal } from "../../Shared/UI";
import MetaDetails from "../MetaDetails";
import CreatorCoinDetails from "./CreatorCoinDetails";

setApiKey(ZORA_API_KEY);

interface CreatorCoinProps {
  account: AccountFragment;
}

const CreatorCoin = ({ account }: CreatorCoinProps) => {
  const [showModal, setShowModal] = useState(false);
  const creatorCoinAddress = getAccountAttribute(
    "creatorCoinAddress",
    account?.metadata?.attributes
  );

  const { data: coin } = useQuery<GetCoinResponse["zora20Token"] | null>({
    enabled: !!creatorCoinAddress,
    queryFn: async () => {
      const coin = await getCoin({
        address: creatorCoinAddress,
        chain: base.id
      });
      return coin.data?.zora20Token ?? null;
    },
    queryKey: ["coin", creatorCoinAddress]
  });

  if (!coin) {
    return null;
  }

  return (
    <>
      <button
        className="rounded-full border border-gray-200 bg-white px-2.5 text-gray-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-white/90"
        onClick={() => {
          umami.track("open_creator_coin");
          setShowModal(true);
        }}
        type="button"
      >
        <MetaDetails
          icon={
            <Image
              alt={coin.name}
              className="size-4 rounded-full"
              height={16}
              src={coin.mediaContent?.previewImage?.medium}
              width={16}
            />
          }
        >
          {NAIRA_SYMBOL}
          {coin.symbol}
        </MetaDetails>
      </button>
      <Modal
        onClose={() => setShowModal(false)}
        show={showModal}
        title="Creator Coin"
      >
        <CreatorCoinDetails address={coin.address as Address} />
      </Modal>
    </>
  );
};

export default CreatorCoin;
