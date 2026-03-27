import { KeyIcon, LinkIcon } from "@heroicons/react/24/outline";
import { usePrivy } from "@privy-io/react-auth";
import type { FC } from "react";
import { Link } from "react-router";
import { Button } from "@/components/Shared/UI";
import formatAddress from "@/helpers/formatAddress";
import {
  getPrivyWalletAddress,
  PRIMARY_AUTH_LOGIN_METHODS
} from "@/helpers/privy";

const WalletSelector: FC = () => {
  const { authenticated, connectWallet, linkWallet, login, ready, user } =
    usePrivy();
  const walletAddress = getPrivyWalletAddress(user);

  if (!ready) {
    return null;
  }

  if (!authenticated) {
    return (
      <div className="space-y-3">
        <Button
          className="w-full"
          onClick={() =>
            login({ loginMethods: [...PRIMARY_AUTH_LOGIN_METHODS] })
          }
          outline
        >
          Sign in with email or Telegram
        </Button>
        <div className="linkify text-gray-500 text-sm">
          By signing in, you agree to our{" "}
          <Link target="_blank" to="/terms">
            Terms
          </Link>{" "}
          and{" "}
          <Link target="_blank" to="/privacy">
            Policy
          </Link>
          .
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {walletAddress ? (
        <div className="rounded-xl border border-gray-200 px-4 py-3 text-gray-700 text-sm dark:border-gray-700 dark:text-gray-200">
          Every1 wallet: {formatAddress(walletAddress)}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<KeyIcon className="size-4" />}
          onClick={() => connectWallet()}
          outline
          size="sm"
        >
          Connect external wallet
        </Button>
        <Button
          icon={<LinkIcon className="size-4" />}
          onClick={() => linkWallet()}
          outline
          size="sm"
        >
          Link another wallet
        </Button>
      </div>
    </div>
  );
};

export default WalletSelector;
