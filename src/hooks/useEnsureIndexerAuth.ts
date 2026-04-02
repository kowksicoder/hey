import { usePrivy } from "@privy-io/react-auth";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWalletClient } from "wagmi";
import { hasPrivyConfig } from "@/helpers/privy";
import {
  useAuthenticateMutation,
  useChallengeMutation
} from "@/indexer/generated";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import {
  clearAuthTokens,
  hydrateAuthTokens,
  signIn,
  useAuthStore
} from "@/store/persisted/useAuthStore";

let authAttemptInFlight: null | Promise<boolean> = null;
let authAttemptKeyInFlight: null | string = null;

interface UseEnsureIndexerAuthOptions {
  autoAuthenticate?: boolean;
  enabled?: boolean;
}

const useEnsureIndexerAuth = ({
  autoAuthenticate = false,
  enabled = false
}: UseEnsureIndexerAuthOptions = {}) => {
  const hasPrivy = hasPrivyConfig();
  const { authenticated, ready } = usePrivy();
  const { currentAccount } = useAccountStore();
  const { accessToken } = useAuthStore();
  const { data: walletClient } = useWalletClient();
  const [challengeMutation] = useChallengeMutation();
  const [authenticateMutation] = useAuthenticateMutation();
  const [authenticating, setAuthenticating] = useState(false);
  const failedAttemptKeyRef = useRef<null | string>(null);

  const accountAddress = currentAccount?.address;
  const ownerAddress = currentAccount?.owner || walletClient?.account?.address;
  const isDirectWalletAccount = Boolean(
    accountAddress &&
      ownerAddress &&
      accountAddress.toLowerCase() === ownerAddress.toLowerCase()
  );
  const authAttemptKey =
    accountAddress && ownerAddress ? `${accountAddress}:${ownerAddress}` : null;
  const shouldAuthenticate =
    enabled &&
    hasPrivy &&
    ready &&
    authenticated &&
    Boolean(authAttemptKey) &&
    Boolean(walletClient?.account) &&
    !accessToken;

  useEffect(() => {
    if (accessToken && authAttemptKey) {
      failedAttemptKeyRef.current = null;
    }
  }, [accessToken, authAttemptKey]);

  const authenticateIndexer = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      if (
        !hasPrivy ||
        !ready ||
        !authenticated ||
        !authAttemptKey ||
        !accountAddress ||
        !ownerAddress ||
        !walletClient?.account
      ) {
        return false;
      }

      if (accessToken) {
        return true;
      }

      if (force) {
        failedAttemptKeyRef.current = null;
      }

      if (!force && failedAttemptKeyRef.current === authAttemptKey) {
        return false;
      }

      if (authAttemptInFlight && authAttemptKeyInFlight === authAttemptKey) {
        return await authAttemptInFlight;
      }

      const authenticateIndexerSession = async () => {
        try {
          setAuthenticating(true);

          const { data: challengeData } = await challengeMutation({
            variables: {
              request: isDirectWalletAccount
                ? {
                    onboardingUser: {
                      wallet: ownerAddress
                    }
                  }
                : {
                    accountOwner: {
                      account: accountAddress,
                      owner: ownerAddress
                    }
                  }
            }
          });

          const challenge = challengeData?.challenge;

          if (!challenge) {
            throw new Error("Failed to create authentication challenge.");
          }

          const signature = await walletClient.signMessage({
            account: walletClient.account,
            message: challenge.text
          });

          const { data: authenticateData } = await authenticateMutation({
            variables: {
              request: {
                id: challenge.id,
                signature
              }
            }
          });

          const authResult = authenticateData?.authenticate;

          if (!authResult || authResult.__typename !== "AuthenticationTokens") {
            throw new Error(
              authResult?.__typename === "ForbiddenError"
                ? authResult.reason || "Authentication was rejected."
                : "Failed to authenticate wallet session."
            );
          }

          signIn({
            accessToken: authResult.accessToken,
            refreshToken: authResult.refreshToken
          });
          failedAttemptKeyRef.current = null;

          return true;
        } catch (error) {
          failedAttemptKeyRef.current = authAttemptKey;
          clearAuthTokens();
          console.error("Failed to authenticate indexer session", error);
          return false;
        } finally {
          setAuthenticating(false);
        }
      };

      authAttemptKeyInFlight = authAttemptKey;
      const nextAttempt = authenticateIndexerSession();
      authAttemptInFlight = nextAttempt;

      try {
        return await nextAttempt;
      } finally {
        if (authAttemptInFlight === nextAttempt) {
          authAttemptInFlight = null;
        }

        if (authAttemptKeyInFlight === authAttemptKey) {
          authAttemptKeyInFlight = null;
        }
      }
    },
    [
      accessToken,
      accountAddress,
      authAttemptKey,
      authenticateMutation,
      authenticated,
      challengeMutation,
      hasPrivy,
      isDirectWalletAccount,
      ownerAddress,
      ready,
      walletClient
    ]
  );

  useEffect(() => {
    if (
      !autoAuthenticate ||
      !shouldAuthenticate ||
      !authAttemptKey ||
      !accountAddress ||
      !ownerAddress ||
      !walletClient?.account
    ) {
      return;
    }

    if (failedAttemptKeyRef.current === authAttemptKey) {
      return;
    }

    void authenticateIndexer({ force: false });
  }, [
    accountAddress,
    autoAuthenticate,
    authAttemptKey,
    authenticateIndexer,
    shouldAuthenticate,
    walletClient
  ]);

  return {
    authenticateIndexer,
    authenticating,
    canUseAuthenticatedIndexer: Boolean(
      accessToken || hydrateAuthTokens().accessToken
    ),
    needsAuthenticatedIndexer: Boolean(currentAccount?.address) && !accessToken
  };
};

export default useEnsureIndexerAuth;
