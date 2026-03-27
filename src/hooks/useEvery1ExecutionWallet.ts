import { usePrivy } from "@privy-io/react-auth";
import {
  type SmartWalletClientType,
  useSmartWallets
} from "@privy-io/react-auth/smart-wallets";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { isAddress } from "viem";
import { base } from "viem/chains";
import { useWalletClient } from "wagmi";
import { EVERY1_PROFILE_QUERY_KEY } from "@/helpers/every1";
import {
  type ExecutionWalletClient,
  linkExecutionWallet,
  toExecutionWalletAddress,
  toViemWalletClient
} from "@/helpers/executionWallet";
import { hasBaseSmartWalletConfig } from "@/helpers/privy";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";

const asAddress = (value?: null | string) =>
  value && isAddress(value) ? value : null;

const useEvery1ExecutionWallet = () => {
  const queryClient = useQueryClient();
  const { authenticated, ready } = usePrivy();
  const { profile, setProfile } = useEvery1Store();
  const { data: identityWalletClient } = useWalletClient({ chainId: base.id });
  const { getClientForChain } = useSmartWallets();
  const [smartWalletClient, setSmartWalletClient] =
    useState<null | SmartWalletClientType>(null);
  const [smartWalletError, setSmartWalletError] = useState<null | string>(null);
  const [smartWalletLoading, setSmartWalletLoading] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const linkedExecutionWalletRef = useRef<null | string>(null);
  const failedExecutionWalletLinkRef = useRef<null | string>(null);
  const linkingExecutionWalletRef = useRef<null | string>(null);

  useEffect(() => {
    if (!hasBaseSmartWalletConfig() || !ready || !authenticated) {
      setSmartWalletClient(null);
      setSmartWalletError(null);
      setSmartWalletLoading(false);
      return;
    }

    let cancelled = false;

    const loadSmartWalletClient = async () => {
      try {
        setSmartWalletLoading(true);
        const nextClient = await getClientForChain({ id: base.id });

        if (!cancelled) {
          setSmartWalletClient(nextClient || null);
          setSmartWalletError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setSmartWalletClient(null);
          setSmartWalletError(
            error instanceof Error
              ? error.message
              : "Unable to initialize your Every1 smart wallet."
          );
        }
      } finally {
        if (!cancelled) {
          setSmartWalletLoading(false);
        }
      }
    };

    void loadSmartWalletClient();

    return () => {
      cancelled = true;
    };
  }, [authenticated, getClientForChain, ready]);

  const identityWalletAddress = asAddress(
    identityWalletClient?.account?.address || profile?.walletAddress
  );
  const smartWalletAddress = asAddress(smartWalletClient?.account?.address);
  const registeredExecutionWalletAddress = asAddress(
    toExecutionWalletAddress(profile)
  );

  useEffect(() => {
    if (
      !profile?.id ||
      !profile.walletAddress ||
      !identityWalletAddress ||
      !identityWalletClient?.account ||
      !smartWalletClient ||
      !smartWalletAddress
    ) {
      return;
    }

    const targetLinkKey = `${profile.id}:${smartWalletAddress.toLowerCase()}`;

    if (
      registeredExecutionWalletAddress &&
      registeredExecutionWalletAddress.toLowerCase() ===
        smartWalletAddress.toLowerCase()
    ) {
      linkedExecutionWalletRef.current = targetLinkKey;
      failedExecutionWalletLinkRef.current = null;
      linkingExecutionWalletRef.current = null;
      setSmartWalletError(null);
      return;
    }

    if (
      linkedExecutionWalletRef.current === targetLinkKey ||
      linkingExecutionWalletRef.current === targetLinkKey ||
      failedExecutionWalletLinkRef.current === targetLinkKey
    ) {
      return;
    }

    let cancelled = false;
    linkingExecutionWalletRef.current = targetLinkKey;

    const syncExecutionWalletAddress = async () => {
      try {
        setIsLinking(true);
        const result = await linkExecutionWallet({
          executionWalletAddress: smartWalletAddress as Address,
          executionWalletClient: smartWalletClient,
          identityWalletAddress: identityWalletAddress as Address,
          identityWalletClient,
          profileId: profile.id
        });

        if (cancelled) {
          return;
        }

        const nextProfile = profile
          ? {
              ...profile,
              executionWalletAddress: result.profile.executionWalletAddress
            }
          : profile;

        if (nextProfile) {
          setProfile(nextProfile);
          queryClient.setQueryData(
            [EVERY1_PROFILE_QUERY_KEY, profile.id],
            nextProfile
          );
        }

        linkedExecutionWalletRef.current = targetLinkKey;
        failedExecutionWalletLinkRef.current = null;
        setSmartWalletError(null);
      } catch (error) {
        failedExecutionWalletLinkRef.current = targetLinkKey;

        if (!cancelled) {
          setSmartWalletError(
            error instanceof Error
              ? error.message
              : "Unable to link your Every1 smart wallet."
          );
        }
      } finally {
        if (linkingExecutionWalletRef.current === targetLinkKey) {
          linkingExecutionWalletRef.current = null;
        }

        if (!cancelled) {
          setIsLinking(false);
        }
      }
    };

    void syncExecutionWalletAddress();

    return () => {
      cancelled = true;
    };
  }, [
    identityWalletAddress,
    identityWalletClient,
    profile,
    queryClient,
    registeredExecutionWalletAddress,
    setProfile,
    smartWalletAddress,
    smartWalletClient
  ]);

  const executionWalletAddress =
    smartWalletAddress || registeredExecutionWalletAddress;
  const executionWalletClient = toViemWalletClient(
    smartWalletClient as ExecutionWalletClient | null
  );

  return {
    executionWalletAddress,
    executionWalletClient,
    identityWalletAddress,
    identityWalletClient,
    isLinkingExecutionWallet: isLinking,
    isSmartWalletReady: Boolean(smartWalletClient && executionWalletAddress),
    smartWalletAddress,
    smartWalletClient,
    smartWalletEnabled: hasBaseSmartWalletConfig(),
    smartWalletError,
    smartWalletLoading
  };
};

export default useEvery1ExecutionWallet;
