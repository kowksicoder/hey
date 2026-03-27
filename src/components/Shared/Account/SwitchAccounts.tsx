import {
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  EnvelopeIcon,
  LinkIcon,
  PlusIcon,
  WalletIcon
} from "@heroicons/react/24/outline";
import { usePrivy } from "@privy-io/react-auth";
import { Button, WarningMessage } from "@/components/Shared/UI";
import formatAddress from "@/helpers/formatAddress";
import {
  getPrivyWalletAddress,
  PRIMARY_AUTH_LOGIN_METHODS
} from "@/helpers/privy";

const SwitchAccounts = () => {
  const { authenticated, connectWallet, linkWallet, login, ready, user } =
    usePrivy();
  const primaryWallet = getPrivyWalletAddress(user);
  const wallets = Array.from(
    new Set(
      (user?.linkedAccounts || [])
        .map((account) => {
          if (
            account.type === "wallet" &&
            account.chainType === "ethereum" &&
            "address" in account
          ) {
            return account.address;
          }

          return null;
        })
        .filter((address): address is string => Boolean(address))
    )
  );
  const email = user?.email?.address;
  const telegramUsername = user?.telegram?.username || null;

  if (!ready) {
    return (
      <div className="p-5 text-center text-gray-500 text-sm dark:text-gray-400">
        Loading Every1 wallet...
      </div>
    );
  }

  if (!authenticated || !user) {
    return (
      <WarningMessage
        className="m-5"
        message="Sign in with email or Telegram to manage your Every1 wallet."
        title="Not logged in"
      />
    );
  }

  return (
    <div className="space-y-4 p-5">
      <div className="space-y-1">
        <p className="text-gray-500 text-sm dark:text-gray-400">
          Every1 creates a wallet for your account automatically. You can still
          connect extra wallets here if you want advanced access.
        </p>
      </div>

      <div className="space-y-2">
        {primaryWallet ? (
          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="rounded-full bg-green-100 p-2 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                <WalletIcon className="size-4" />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-gray-900 text-sm dark:text-gray-100">
                  {formatAddress(primaryWallet)}
                </div>
                <div className="text-gray-500 text-xs dark:text-gray-400">
                  Every1 wallet
                </div>
              </div>
            </div>
            <span className="rounded-full bg-green-100 px-2 py-1 font-medium text-[11px] text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Connected
            </span>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-300 border-dashed px-3 py-3 text-gray-500 text-sm dark:border-gray-700 dark:text-gray-400">
            No wallet linked yet.
          </div>
        )}

        {wallets
          .filter((wallet) => wallet !== primaryWallet)
          .map((wallet) => (
            <div
              className="flex items-center justify-between rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-800"
              key={wallet}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="rounded-full bg-gray-100 p-2 text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                  <WalletIcon className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 text-sm dark:text-gray-100">
                    {formatAddress(wallet)}
                  </div>
                  <div className="text-gray-500 text-xs dark:text-gray-400">
                    Linked wallet
                  </div>
                </div>
              </div>
              <CheckCircleIcon className="size-4 text-green-600 dark:text-green-400" />
            </div>
          ))}

        {email ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-800">
            <div className="rounded-full bg-gray-100 p-2 text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              <EnvelopeIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium text-gray-900 text-sm dark:text-gray-100">
                {email}
              </div>
              <div className="text-gray-500 text-xs dark:text-gray-400">
                Email login
              </div>
            </div>
          </div>
        ) : null}

        {telegramUsername ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-gray-800">
            <div className="rounded-full bg-gray-100 p-2 text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              <ChatBubbleLeftRightIcon className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate font-medium text-gray-900 text-sm dark:text-gray-100">
                @{telegramUsername}
              </div>
              <div className="text-gray-500 text-xs dark:text-gray-400">
                Telegram login
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          className="w-full"
          icon={<PlusIcon className="size-4" />}
          onClick={() => connectWallet()}
          outline
          size="sm"
        >
          Connect external
        </Button>
        <Button
          className="w-full"
          icon={<LinkIcon className="size-4" />}
          onClick={() => linkWallet()}
          outline
          size="sm"
        >
          Link another
        </Button>
      </div>

      {primaryWallet ? null : (
        <Button
          className="w-full"
          onClick={() =>
            login({ loginMethods: [...PRIMARY_AUTH_LOGIN_METHODS] })
          }
          size="sm"
        >
          Continue setup
        </Button>
      )}
    </div>
  );
};

export default SwitchAccounts;
