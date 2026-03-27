import { PrivyProvider } from "@privy-io/react-auth";
import { SmartWalletsProvider } from "@privy-io/react-auth/smart-wallets";
import { createConfig, WagmiProvider } from "@privy-io/wagmi";
import type { ComponentProps, ReactNode } from "react";
import { http } from "viem";
import { base } from "viem/chains";
import { BASE_RPC_URL, BRAND_COLOR, CHAIN } from "@/data/constants";
import { BASE_BUILDER_DATA_SUFFIX } from "@/helpers/builderCode";
import getRpc from "@/helpers/getRpc";
import {
  getBaseSmartWalletEndpoint,
  hasPrivyConfig,
  PRIMARY_AUTH_LOGIN_METHODS
} from "@/helpers/privy";

const config = createConfig({
  chains: [CHAIN, base],
  dataSuffix: BASE_BUILDER_DATA_SUFFIX,
  transports: {
    [CHAIN.id]: getRpc(),
    [base.id]: http(BASE_RPC_URL, { batch: { batchSize: 30 } })
  }
});

declare module "wagmi" {
  interface Register {
    config: typeof config;
  }
}

interface Web3ProviderProps {
  children: ReactNode;
}

type PrivyProviderConfig = NonNullable<
  ComponentProps<typeof PrivyProvider>["config"]
>;

type SolanaWalletConnectorsConfig = NonNullable<
  NonNullable<
    NonNullable<PrivyProviderConfig["externalWallets"]>["solana"]
  >["connectors"]
>;

const emptySolanaWalletConnectors: SolanaWalletConnectorsConfig = {
  get: () => [],
  onMount: () => undefined,
  onUnmount: () => undefined
};

const Web3Provider = ({ children }: Web3ProviderProps) => {
  const baseSmartWalletEndpoint = getBaseSmartWalletEndpoint();
  const privyConfig = {
    appearance: {
      accentColor: BRAND_COLOR,
      showWalletLoginFirst: false,
      walletChainType: "ethereum-only"
    },
    defaultChain: CHAIN,
    embeddedWallets: {
      ethereum: {
        createOnLogin: "users-without-wallets"
      },
      showWalletUIs: true
    },
    externalWallets: {
      coinbaseWallet: {
        config: {
          preference: {
            options: "eoaOnly"
          }
        }
      },
      solana: {
        connectors: emptySolanaWalletConnectors
      }
    },
    loginMethods: [...PRIMARY_AUTH_LOGIN_METHODS],
    smartWallets: baseSmartWalletEndpoint
      ? {
          configuredNetworks: [
            {
              bundlerUrl: baseSmartWalletEndpoint,
              chainId: `${base.id}`,
              paymasterUrl: baseSmartWalletEndpoint
            }
          ],
          enabled: true,
          smartWalletType: "coinbase_smart_wallet"
        }
      : {
          enabled: false
        },
    supportedChains: [CHAIN, base]
  } as PrivyProviderConfig;

  if (!hasPrivyConfig()) {
    return <WagmiProvider config={config}>{children}</WagmiProvider>;
  }

  return (
    <PrivyProvider
      appId={import.meta.env.VITE_PRIVY_APP_ID as string}
      config={privyConfig}
    >
      <SmartWalletsProvider>
        <WagmiProvider config={config}>{children}</WagmiProvider>
      </SmartWalletsProvider>
    </PrivyProvider>
  );
};

export default Web3Provider;
