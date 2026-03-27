import {
  getEmbeddedConnectedWallet,
  useActiveWallet,
  useWallets
} from "@privy-io/react-auth";
import { useEffect, useMemo } from "react";

const normalizeAddress = (value?: null | string) =>
  value?.toLowerCase() || null;

const Every1WalletSync = () => {
  const { wallets, ready } = useWallets();
  const { setActiveWallet, wallet: activeWallet } = useActiveWallet();
  const embeddedWallet = useMemo(
    () => getEmbeddedConnectedWallet(wallets),
    [wallets]
  );
  const activeAddress = normalizeAddress(activeWallet?.address);
  const embeddedAddress = normalizeAddress(embeddedWallet?.address);

  useEffect(() => {
    if (!ready || !embeddedWallet || activeAddress === embeddedAddress) {
      return;
    }

    setActiveWallet(embeddedWallet);
  }, [activeAddress, embeddedAddress, embeddedWallet, ready, setActiveWallet]);

  return null;
};

export default Every1WalletSync;
