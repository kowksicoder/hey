import { BackspaceIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import type { GetCoinResponse } from "@zoralabs/coins-sdk";
import {
  createTradeCall,
  type TradeParameters,
  tradeCoin
} from "@zoralabs/coins-sdk";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Address } from "viem";
import {
  createPublicClient,
  erc20Abi,
  formatEther,
  formatUnits,
  http,
  isAddress,
  parseEther,
  parseUnits
} from "viem";
import { base } from "viem/chains";
import { useAccount, useConfig, useWalletClient } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import {
  ActionStatusModal,
  Button,
  Image,
  Input,
  Spinner,
  Tabs,
  Tooltip
} from "@/components/Shared/UI";
import { BASE_RPC_URL } from "@/data/constants";
import cn from "@/helpers/cn";
import {
  EVERY1_NOTIFICATION_COUNT_QUERY_KEY,
  EVERY1_NOTIFICATIONS_QUERY_KEY,
  EVERY1_REFERRAL_DASHBOARD_QUERY_KEY,
  EVERY1_WALLET_ACTIVITY_QUERY_KEY,
  recordReferralTradeReward
} from "@/helpers/every1";
import {
  executeSell,
  executeSupport,
  getSellQuote,
  getSupportQuote
} from "@/helpers/fiat";
import {
  createFiatIdempotencyKey,
  normalizeFiatUiError
} from "@/helpers/fiatUi";
import useHandleWrongNetwork from "@/hooks/useHandleWrongNetwork";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";

interface TradeModalProps {
  coin: NonNullable<GetCoinResponse["zora20Token"]>;
  initialMode?: Mode;
  onClose?: () => void;
  variant?: "mobile" | "modal" | "page";
}

type Mode = "buy" | "sell";
type TradeRail = "fiat" | "onchain";
type TradeStatusModalState = null | {
  description?: string;
  title: string;
  tone: "pending" | "success";
};
type FiatQuoteState = null | {
  amountLabel: string;
  expiresAt: string;
  quoteId: string;
  settlement?: {
    address: Address;
    transferAmountLabel: string;
    transferAmountRaw: string;
  };
  summary: string;
};

const Trade = ({
  coin,
  initialMode = "buy",
  onClose,
  variant = "modal"
}: TradeModalProps) => {
  const { address } = useAccount();
  const config = useConfig();
  const queryClient = useQueryClient();
  const { profile } = useEvery1Store();
  const { data: walletClient } = useWalletClient({ chainId: base.id });
  const { data: signingWalletClient } = useWalletClient();
  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: base,
        transport: http(BASE_RPC_URL, { batch: { batchSize: 30 } })
      }),
    []
  );
  const handleWrongNetwork = useHandleWrongNetwork();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [tradeRail, setTradeRail] = useState<TradeRail>("fiat");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [tradeStatusModal, setTradeStatusModal] =
    useState<TradeStatusModalState>(null);
  const [fiatQuote, setFiatQuote] = useState<FiatQuoteState>(null);
  const [fiatQuoteError, setFiatQuoteError] = useState<null | string>(null);
  const [fiatQuoteLoading, setFiatQuoteLoading] = useState(false);
  const [ethBalance, setEthBalance] = useState<bigint>(0n);
  const [tokenBalance, setTokenBalance] = useState<bigint>(0n);
  const [estimatedOut, setEstimatedOut] = useState<string>("");
  const tradeWalletAddress = useMemo(() => {
    const candidate =
      address ||
      walletClient?.account?.address ||
      signingWalletClient?.account?.address ||
      null;
    return candidate && isAddress(candidate) ? candidate : undefined;
  }, [address, signingWalletClient?.account?.address, walletClient]);
  const fiatWalletClient = signingWalletClient || walletClient;

  useEffect(() => {
    (async () => {
      if (!tradeWalletAddress) return;
      try {
        const [eth, token] = await Promise.all([
          publicClient.getBalance({ address: tradeWalletAddress }),
          publicClient.readContract({
            abi: erc20Abi,
            address: coin.address as Address,
            args: [tradeWalletAddress],
            functionName: "balanceOf"
          })
        ]);
        setEthBalance(eth);
        setTokenBalance(token as bigint);
      } catch {}
    })();
  }, [coin.address, publicClient, tradeWalletAddress]);

  const tokenDecimals = 18;
  const isPageVariant = variant === "page";
  const isMobileVariant = variant === "mobile";

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (isMobileVariant) {
      setTradeRail("fiat");
    }
  }, [isMobileVariant]);

  useEffect(() => {
    setFiatQuote(null);
    setFiatQuoteError(null);
  }, [amount, coin.address, mode, tradeRail]);

  const setPercentAmount = (pct: number) => {
    const decimals = 6;
    if (tradeRail === "fiat" && mode === "buy") {
      const suggestedValues = {
        25: "500",
        50: "1000",
        75: "5000",
        100: "10000"
      } as const;
      setAmount(suggestedValues[pct as 25 | 50 | 75 | 100] || "1000");
      return;
    }

    if (mode === "buy") {
      const available = Number(formatEther(ethBalance));
      const gasReserve = 0.0002;
      const baseAmt = (available * pct) / 100;
      const amt = pct === 100 ? Math.max(baseAmt - gasReserve, 0) : baseAmt;
      setAmount(amt.toFixed(decimals));
    } else {
      const available = Number(formatUnits(tokenBalance, tokenDecimals));
      const amt = Math.max((available * pct) / 100, 0);
      setAmount(amt.toFixed(decimals));
    }
  };

  const makeParams = (address: Address): TradeParameters | null => {
    if (!amount || Number(amount) <= 0) return null;

    if (mode === "buy") {
      return {
        amountIn: parseEther(amount),
        buy: { address: coin.address as Address, type: "erc20" },
        sell: { type: "eth" },
        sender: address,
        slippage: 0.1
      };
    }

    return {
      amountIn: parseUnits(amount, tokenDecimals),
      buy: { type: "eth" },
      sell: { address: coin.address as Address, type: "erc20" },
      sender: address,
      slippage: 0.1
    };
  };

  const parsedAmount = Number.parseFloat(amount || "0");
  const hasValidAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const isFiatRail = tradeRail === "fiat";

  const handleFiatQuote = async () => {
    if (!profile?.id || !fiatWalletClient?.account || !tradeWalletAddress) {
      toast.error("Connect your wallet to continue.");
      return;
    }

    if (!hasValidAmount) {
      toast.error(
        mode === "buy"
          ? "Enter the Naira amount you want to use."
          : `Enter the ${symbol || "coin"} amount you want to sell.`
      );
      return;
    }

    if (mode === "sell" && !hasEnoughTokenToSell) {
      toast.error(`Not enough ${symbol || "token"} balance.`);
      return;
    }

    try {
      setFiatQuoteLoading(true);
      setFiatQuoteError(null);

      if (mode === "buy") {
        const quote = await getSupportQuote({
          coinAddress: coin.address as Address,
          idempotencyKey: createFiatIdempotencyKey("support-quote"),
          nairaAmount: parsedAmount,
          profileId: profile.id,
          walletAddress: tradeWalletAddress,
          walletClient: fiatWalletClient
        });

        setFiatQuote({
          amountLabel: `${quote.estimated_coin_amount.toLocaleString("en-US", {
            maximumFractionDigits: 2
          })} ${symbol || "TOKEN"}`,
          expiresAt: quote.expires_at,
          quoteId: quote.quote_id,
          summary: `You'll receive approximately ${quote.estimated_coin_amount.toLocaleString(
            "en-US",
            { maximumFractionDigits: 2 }
          )} ${symbol || "TOKEN"} after ${new Intl.NumberFormat("en-NG", {
            currency: "NGN",
            currencyDisplay: "narrowSymbol",
            maximumFractionDigits: 0,
            style: "currency"
          }).format(quote.fee_naira)} in fees.`
        });
      } else {
        const quote = await getSellQuote({
          coinAddress: coin.address as Address,
          coinAmount: parsedAmount,
          idempotencyKey: createFiatIdempotencyKey("sell-quote"),
          profileId: profile.id,
          walletAddress: tradeWalletAddress,
          walletClient: fiatWalletClient
        });

        setFiatQuote({
          amountLabel: new Intl.NumberFormat("en-NG", {
            currency: "NGN",
            currencyDisplay: "narrowSymbol",
            maximumFractionDigits: 0,
            style: "currency"
          }).format(quote.estimated_naira_return),
          expiresAt: quote.expires_at,
          quoteId: quote.quote_id,
          settlement: {
            address: quote.settlement.address as Address,
            transferAmountLabel: quote.settlement.transfer_amount_label,
            transferAmountRaw: quote.settlement.transfer_amount_raw
          },
          summary: `You'll receive approximately ${new Intl.NumberFormat(
            "en-NG",
            {
              currency: "NGN",
              currencyDisplay: "narrowSymbol",
              maximumFractionDigits: 0,
              style: "currency"
            }
          ).format(quote.estimated_naira_return)} after ${new Intl.NumberFormat(
            "en-NG",
            {
              currency: "NGN",
              currencyDisplay: "narrowSymbol",
              maximumFractionDigits: 0,
              style: "currency"
            }
          ).format(
            quote.fee_naira
          )} in fees after you confirm the secure wallet transfer.`
        });
      }
    } catch (error) {
      const message = normalizeFiatUiError(
        error,
        "Unable to get a Naira quote right now."
      );
      setFiatQuote(null);
      setFiatQuoteError(message);
      toast.error(message);
    } finally {
      setFiatQuoteLoading(false);
    }
  };

  const handleFiatSubmit = async () => {
    if (!profile?.id || !fiatWalletClient?.account || !tradeWalletAddress) {
      toast.error("Connect your wallet to continue.");
      return;
    }

    if (!fiatQuote) {
      await handleFiatQuote();
      return;
    }

    try {
      setLoading(true);
      setTradeStatusModal({
        description:
          mode === "buy"
            ? "Please wait while we complete your Naira buy trade."
            : "Confirm the wallet transfer to continue with this sell.",
        title:
          mode === "buy"
            ? `Buying ${coin.name}`
            : `Selling ${symbol || coin.name}`,
        tone: "pending"
      });

      const response =
        mode === "buy"
          ? await executeSupport({
              idempotencyKey: createFiatIdempotencyKey("support-execute"),
              profileId: profile.id,
              quoteId: fiatQuote.quoteId,
              walletAddress: tradeWalletAddress,
              walletClient: fiatWalletClient
            })
          : await (async () => {
              const settlement = fiatQuote.settlement;

              if (!settlement) {
                throw new Error(
                  "This sell quote is missing its settlement instructions."
                );
              }

              await handleWrongNetwork({ chainId: base.id });
              const client =
                (await getWalletClient(config, { chainId: base.id })) ||
                walletClient;

              if (!client?.account) {
                throw new Error("Connect a Base wallet to complete this sell.");
              }

              const transferHash = await client.writeContract({
                abi: erc20Abi,
                account: client.account,
                address: coin.address as Address,
                args: [
                  settlement.address,
                  BigInt(settlement.transferAmountRaw)
                ],
                functionName: "transfer"
              });

              await publicClient.waitForTransactionReceipt({
                hash: transferHash,
                timeout: 120000
              });

              setTradeStatusModal({
                description:
                  "Transfer confirmed. Finalizing your Naira wallet credit.",
                title: `Settling ${symbol || coin.name}`,
                tone: "pending"
              });

              return await executeSell({
                idempotencyKey: createFiatIdempotencyKey("sell-execute"),
                profileId: profile.id,
                quoteId: fiatQuote.quoteId,
                transactionHash: transferHash,
                walletAddress: tradeWalletAddress,
                walletClient: fiatWalletClient
              });
            })();

      if (!response.success) {
        throw new Error(response.message || "Unable to complete this request.");
      }

      if (response.status === "failed") {
        throw new Error(
          response.message || "This buy trade could not be completed."
        );
      }

      setTradeStatusModal({
        description: response.message,
        title:
          mode === "buy"
            ? response.status === "completed"
              ? "Buy completed!"
              : "Buy finalizing"
            : response.status === "completed"
              ? "Sell completed!"
              : "Sell finalizing",
        tone: response.status === "completed" ? "success" : "pending"
      });

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["fiat-wallet"]
        }),
        queryClient.invalidateQueries({
          queryKey: ["fiat-wallet-transactions"]
        }),
        queryClient.invalidateQueries({
          queryKey: [EVERY1_NOTIFICATIONS_QUERY_KEY, profile.id]
        }),
        queryClient.invalidateQueries({
          queryKey: [EVERY1_NOTIFICATION_COUNT_QUERY_KEY, profile.id]
        }),
        queryClient.invalidateQueries({
          queryKey: [EVERY1_WALLET_ACTIVITY_QUERY_KEY, profile.id]
        })
      ]);

      await new Promise((resolve) => setTimeout(resolve, 1400));

      setAmount("");
      setFiatQuote(null);
      setTradeStatusModal(null);
      onClose?.();
    } catch (error) {
      const message = normalizeFiatUiError(
        error,
        "Unable to complete this Naira request right now."
      );
      setTradeStatusModal(null);
      setFiatQuoteError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (isFiatRail) {
      await handleFiatSubmit();
      return;
    }

    if (!tradeWalletAddress) {
      return toast.error("Connect a wallet to trade");
    }

    const params = makeParams(tradeWalletAddress);
    if (!params) return;

    try {
      setLoading(true);
      setTradeStatusModal({
        description: "Please wait while we complete your trade.",
        title: `Swapping ${tradeInputLabel} - ${tradeOutputLabel}`,
        tone: "pending"
      });
      umami.track("trade_creator_coin", { mode });
      await handleWrongNetwork({ chainId: base.id });
      const client =
        (await getWalletClient(config, { chainId: base.id })) || walletClient;
      if (!client) {
        setLoading(false);
        setTradeStatusModal(null);
        return toast.error("Please switch to Base network");
      }

      const receipt = await tradeCoin({
        account: client.account,
        publicClient,
        tradeParameters: params,
        validateTransaction: false,
        walletClient: client
      });
      setTradeStatusModal({
        description: "Trade successful, enjoy your profits!",
        title: "Nice trade!",
        tone: "success"
      });

      if (profile?.id) {
        try {
          const quotedAmountOut = estimatedOut
            ? mode === "buy"
              ? Number(formatUnits(BigInt(estimatedOut), tokenDecimals))
              : Number(formatEther(BigInt(estimatedOut)))
            : 0;

          const rewardResult = await recordReferralTradeReward({
            chainId: base.id,
            coinAddress: coin.address,
            coinSymbol: coin.symbol || coin.name || "COIN",
            profileId: profile.id,
            tradeAmountIn: Number(amount),
            tradeAmountOut: quotedAmountOut,
            tradeSide: mode,
            txHash: receipt.transactionHash
          });

          if (rewardResult.rewardGranted) {
            toast.success("Referral reward unlocked", {
              description: `+${Number(rewardResult.rewardAmount || 0).toFixed(
                4
              )} ${rewardResult.rewardSymbol} and +${
                rewardResult.e1xpAwarded || 50
              } E1XP`
            });

            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: [EVERY1_REFERRAL_DASHBOARD_QUERY_KEY, profile.id]
              }),
              queryClient.invalidateQueries({
                queryKey: [EVERY1_NOTIFICATIONS_QUERY_KEY, profile.id]
              }),
              queryClient.invalidateQueries({
                queryKey: [EVERY1_NOTIFICATION_COUNT_QUERY_KEY, profile.id]
              })
            ]);
          }
        } catch (rewardError) {
          console.error("Failed to record referral reward", rewardError);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1600));

      if (isPageVariant) {
        setAmount("");
        setTradeStatusModal(null);
      }

      onClose?.();

      if (!onClose && !isPageVariant) {
        setTradeStatusModal(null);
      }
    } catch {
      setTradeStatusModal(null);
      toast.error("Trade failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (isFiatRail) {
        setEstimatedOut("");
        return;
      }

      const sender = tradeWalletAddress;
      if (!sender || !amount) {
        setEstimatedOut("");
        return;
      }

      const params: TradeParameters =
        mode === "buy"
          ? {
              amountIn: parseEther(amount),
              buy: { address: coin.address as Address, type: "erc20" },
              sell: { type: "eth" },
              sender,
              slippage: 0.1
            }
          : {
              amountIn: parseUnits(amount, tokenDecimals),
              buy: { type: "eth" },
              sell: { address: coin.address as Address, type: "erc20" },
              sender,
              slippage: 0.1
            };

      try {
        const q = await createTradeCall(params);
        if (!cancelled) {
          const out = q.quote.amountOut || "0";
          setEstimatedOut(out);
        }
      } catch {
        if (!cancelled) setEstimatedOut("");
      }
    };

    timeoutId = setTimeout(() => {
      void run();
    }, 300);

    intervalId = setInterval(() => {
      void run();
    }, 8000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [amount, coin.address, isFiatRail, mode, tradeWalletAddress]);

  const symbol = coin.symbol || "";
  const formattedEthBalance = Number(formatEther(ethBalance));
  const formattedTokenBalance = Number(
    formatUnits(tokenBalance, tokenDecimals)
  );

  const balanceLabel = isFiatRail
    ? mode === "buy"
      ? "Uses your Every1 Naira wallet"
      : `Balance ${formattedTokenBalance.toFixed(3)} ${symbol || "TOKEN"}`
    : mode === "buy"
      ? `Balance ${formattedEthBalance.toFixed(4)} ETH`
      : `Balance ${formattedTokenBalance.toFixed(3)} ${symbol || "TOKEN"}`;

  const quickTradeOptions = isFiatRail
    ? mode === "buy"
      ? [
          { label: "N500", onClick: () => setAmount("500") },
          { label: "N1k", onClick: () => setAmount("1000") },
          { label: "N5k", onClick: () => setAmount("5000") },
          { label: "N10k", onClick: () => setAmount("10000") }
        ]
      : [
          { label: "25%", onClick: () => setPercentAmount(25) },
          { label: "50%", onClick: () => setPercentAmount(50) },
          { label: "75%", onClick: () => setPercentAmount(75) },
          { label: "Max", onClick: () => setPercentAmount(100) }
        ]
    : mode === "buy"
      ? [
          { label: "0.001 ETH", onClick: () => setAmount("0.001") },
          { label: "0.01 ETH", onClick: () => setAmount("0.01") },
          { label: "0.1 ETH", onClick: () => setAmount("0.1") },
          { label: "Max", onClick: () => setPercentAmount(100) }
        ]
      : [
          { label: "25%", onClick: () => setPercentAmount(25) },
          { label: "50%", onClick: () => setPercentAmount(50) },
          { label: "75%", onClick: () => setPercentAmount(75) },
          { label: "Max", onClick: () => setPercentAmount(100) }
        ];

  const mobileQuickTradeOptions = isFiatRail
    ? mode === "buy"
      ? [
          { label: "N500", onClick: () => setAmount("500") },
          { label: "N1k", onClick: () => setAmount("1000") },
          { label: "N2.5k", onClick: () => setAmount("2500") },
          { label: "N5k", onClick: () => setAmount("5000") }
        ]
      : [
          { label: "10%", onClick: () => setPercentAmount(10) },
          { label: "25%", onClick: () => setPercentAmount(25) },
          { label: "50%", onClick: () => setPercentAmount(50) },
          { label: "Max", onClick: () => setPercentAmount(100) }
        ]
    : [
        { label: "10%", onClick: () => setPercentAmount(10) },
        { label: "25%", onClick: () => setPercentAmount(25) },
        { label: "50%", onClick: () => setPercentAmount(50) },
        { label: "Max", onClick: () => setPercentAmount(100) }
      ];

  const formatTradeNumber = (value: number, maximumFractionDigits = 4) =>
    new Intl.NumberFormat("en-US", {
      maximumFractionDigits,
      minimumFractionDigits: 0
    }).format(value);

  const formatNaira = (value: number) =>
    new Intl.NumberFormat("en-NG", {
      currency: "NGN",
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
      style: "currency"
    }).format(Math.max(0, value));

  const tradeInputLabel = useMemo(() => {
    const parsedAmount = Number.parseFloat(amount || "0");

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      if (isFiatRail) {
        return mode === "buy" ? formatNaira(0) : `0 ${symbol || "TOKEN"}`;
      }

      return mode === "buy" ? "0 ETH" : `0 ${symbol || "TOKEN"}`;
    }

    if (isFiatRail) {
      return mode === "buy"
        ? formatNaira(parsedAmount)
        : `${formatTradeNumber(parsedAmount, 4)} ${symbol || "TOKEN"}`;
    }

    return mode === "buy"
      ? `${formatTradeNumber(parsedAmount, 6)} ETH`
      : `${formatTradeNumber(parsedAmount, 4)} ${symbol || "TOKEN"}`;
  }, [amount, formatNaira, isFiatRail, mode, symbol]);

  const tradeOutputLabel = useMemo(() => {
    if (isFiatRail) {
      return (
        fiatQuote?.amountLabel ||
        (mode === "buy" ? `0 ${symbol || "TOKEN"}` : formatNaira(0))
      );
    }

    if (!estimatedOut) {
      return mode === "buy" ? `0 ${symbol || "TOKEN"}` : "0 ETH";
    }

    try {
      const formattedAmount =
        mode === "buy"
          ? Number(formatUnits(BigInt(estimatedOut), tokenDecimals))
          : Number(formatEther(BigInt(estimatedOut)));

      return mode === "buy"
        ? `${formatTradeNumber(formattedAmount, 2)} ${symbol || "TOKEN"}`
        : `${formatTradeNumber(formattedAmount, 6)} ETH`;
    } catch {
      return mode === "buy" ? `0 ${symbol || "TOKEN"}` : "0 ETH";
    }
  }, [
    estimatedOut,
    fiatQuote?.amountLabel,
    formatNaira,
    isFiatRail,
    mode,
    symbol,
    tokenDecimals
  ]);

  const handleMobileKeypadInput = (key: "." | "backspace" | `${number}`) => {
    if (key === "backspace") {
      setAmount((previous) => previous.slice(0, -1));
      return;
    }

    if (key === ".") {
      setAmount((previous) => {
        if (previous.includes(".")) {
          return previous;
        }

        return previous ? `${previous}.` : "0.";
      });
      return;
    }

    setAmount((previous) => {
      if (previous === "0") {
        return key;
      }

      return `${previous}${key}`;
    });
  };

  const hasEnoughTokenToSell =
    parsedAmount <= formattedTokenBalance + 0.0000001 || mode === "buy";
  const modeTabs = isFiatRail
    ? [
        { label: "Buy", value: "buy" },
        { label: "Sell", value: "sell" }
      ]
    : [
        { label: "Buy", value: "buy" },
        { label: "Sell", value: "sell" }
      ];
  const statusLabel = isFiatRail
    ? mode === "buy"
      ? "Buy with Naira"
      : "Sell to Naira"
    : mode === "buy"
      ? "Coin trade"
      : "Token swap";
  const summaryText = isFiatRail
    ? fiatQuoteError ||
      fiatQuote?.summary ||
      (mode === "buy"
        ? "Enter a Naira amount, get a secure quote, then confirm your buy trade."
        : `Enter how much ${symbol || "token"} you want to sell into Naira.`)
    : `Estimated amount: ${
        estimatedOut
          ? mode === "buy"
            ? `${Number(formatUnits(BigInt(estimatedOut), tokenDecimals)).toFixed(0)}`
            : `${Number(formatEther(BigInt(estimatedOut))).toFixed(6)} ETH`
          : "-"
      }`;
  const quoteExpiryText = fiatQuote
    ? `Valid until ${new Date(fiatQuote.expiresAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit"
      })}`
    : null;
  const submitLabel = loading
    ? mode === "buy"
      ? isFiatRail
        ? "Buying with Naira"
        : "Buying"
      : isFiatRail
        ? "Selling to Naira"
        : "Selling"
    : isFiatRail
      ? fiatQuote
        ? mode === "buy"
          ? "Confirm buy"
          : "Confirm sell"
        : fiatQuoteLoading
          ? "Getting quote..."
          : "Get quote"
      : mode === "buy"
        ? "Buy"
        : "Sell";
  const canSubmit = isFiatRail
    ? Boolean(
        profile?.id &&
          tradeWalletAddress &&
          fiatWalletClient?.account &&
          hasValidAmount &&
          hasEnoughTokenToSell &&
          !loading &&
          !fiatQuoteLoading
      )
    : Boolean(amount && tradeWalletAddress && !loading);

  if (isMobileVariant) {
    const displayAmount = amount || "0";
    const mobileBalanceLabel = isFiatRail
      ? mode === "buy"
        ? "Every1 Naira wallet"
        : `${formattedTokenBalance.toFixed(formattedTokenBalance >= 1 ? 2 : 4)} ${
            symbol || "TOKEN"
          } available`
      : mode === "buy"
        ? `${formattedEthBalance.toFixed(formattedEthBalance >= 1 ? 3 : 4)} ETH available`
        : `${formattedTokenBalance.toFixed(formattedTokenBalance >= 1 ? 2 : 4)} ${
            symbol || "TOKEN"
          } available`;
    const mobilePadKeys: Array<"." | "backspace" | `${number}`> = [
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      ".",
      "0",
      "backspace"
    ];

    return (
      <>
        <div className="flex h-full flex-col bg-white text-gray-950 dark:bg-[#111111] dark:text-white">
          <div className="px-3.5 pt-3 pb-2">
            <div className="flex items-center justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2.5">
                <Image
                  alt={coin.name}
                  className="size-9 rounded-full object-cover"
                  height={36}
                  src={
                    coin.mediaContent?.previewImage?.medium ||
                    coin.mediaContent?.previewImage?.small
                  }
                  width={36}
                />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[1.15rem] text-gray-950 dark:text-white">
                    {coin.name}
                  </p>
                  <p className="truncate text-[10px] text-gray-500 dark:text-white/55">
                    {symbol || "COIN"} ·{" "}
                    {isFiatRail
                      ? mode === "buy"
                        ? "Buy with Naira"
                        : "Sell to Naira"
                      : mode === "buy"
                        ? "Buy with ETH"
                        : "Sell from your wallet"}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-semibold text-[1.15rem] text-gray-950 dark:text-white">
                  {Number.parseFloat(coin.marketCap ?? "0") > 0 &&
                  Number.parseFloat(coin.totalSupply ?? "0") > 0
                    ? `$${(
                        Number.parseFloat(coin.marketCap ?? "0") /
                          Number.parseFloat(coin.totalSupply ?? "1")
                      ).toFixed(4)}`
                    : "$0.00"}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-1 flex-col px-3.5">
            <div className="mb-2 flex items-center justify-center gap-1 rounded-full bg-gray-100 p-1 dark:bg-white/6">
              {modeTabs.map((tab) => (
                <button
                  className={cn(
                    "rounded-full px-3 py-1.5 font-semibold text-[11px] transition-colors",
                    mode === tab.value
                      ? tab.value === "buy"
                        ? "bg-emerald-500 text-white"
                        : "bg-rose-500 text-white"
                      : "text-gray-500 dark:text-white/55"
                  )}
                  key={tab.value}
                  onClick={() => setMode(tab.value as Mode)}
                  type="button"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="pt-2 pb-1.5 text-center">
              <p className="font-semibold text-[2.8rem] text-gray-950 leading-none tracking-tight dark:text-white">
                {mode === "buy"
                  ? isFiatRail
                    ? `NGN ${displayAmount}`
                    : `$${displayAmount}`
                  : displayAmount}
              </p>
            </div>

            <div className="flex items-center justify-between pt-1.5 pb-2">
              <button
                className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] text-gray-700 dark:bg-white/5 dark:text-white/85"
                type="button"
              >
                {mode === "sell" ? (
                  <Image
                    alt={coin.name}
                    className="size-3.5 rounded-full"
                    height={14}
                    src={coin.mediaContent?.previewImage?.small}
                    width={14}
                  />
                ) : isFiatRail ? (
                  <span className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 font-semibold text-[9px] text-white">
                    NGN
                  </span>
                ) : (
                  <span className="inline-flex items-center justify-center rounded-full bg-gray-900 px-1.5 py-0.5 font-semibold text-[9px] text-white dark:bg-white/85 dark:text-[#111111]">
                    ETH
                  </span>
                )}
                <span>{mobileBalanceLabel}</span>
                <ChevronDownIcon className="size-3 text-gray-500 dark:text-white/55" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-1.5 pb-3">
              {mobileQuickTradeOptions.map((option) => (
                <button
                  className="rounded-[0.85rem] bg-gray-100 px-1.5 py-2 font-semibold text-[#7C5CFA] text-[15px] transition-colors hover:bg-gray-200 dark:bg-white/6 dark:text-[#9E85FF] dark:hover:bg-white/10"
                  key={option.label}
                  onClick={option.onClick}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="pb-2 text-center">
              <p
                className={cn(
                  "text-[11px] leading-4",
                  fiatQuoteError
                    ? "text-rose-500 dark:text-rose-300"
                    : "text-gray-500 dark:text-white/55"
                )}
              >
                {summaryText}
              </p>
              {quoteExpiryText ? (
                <p className="mt-1 text-[10px] text-gray-400 dark:text-white/35">
                  {quoteExpiryText}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-x-2 gap-y-2.5 pb-3">
              {mobilePadKeys.map((key) => (
                <button
                  className="flex h-11 items-center justify-center rounded-[0.85rem] font-medium text-[1.85rem] text-gray-950 transition-colors hover:bg-gray-100 dark:text-white dark:hover:bg-white/5"
                  key={key}
                  onClick={() => handleMobileKeypadInput(key)}
                  type="button"
                >
                  {key === "backspace" ? (
                    <BackspaceIcon className="size-6" />
                  ) : (
                    key
                  )}
                </button>
              ))}
            </div>

            <button
              className={cn(
                "mt-auto mb-4 flex h-11 w-full items-center justify-center rounded-[1rem] font-semibold text-[15px] text-white transition-colors disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 dark:disabled:bg-white/6 dark:disabled:text-white/45",
                mode === "buy"
                  ? "bg-emerald-500 hover:bg-emerald-600"
                  : "bg-rose-500 hover:bg-rose-600"
              )}
              disabled={!canSubmit}
              onClick={handleSubmit}
              type="button"
            >
              {loading || fiatQuoteLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="xs" />
                  <span>{submitLabel}</span>
                </span>
              ) : (
                submitLabel
              )}
            </button>
          </div>
        </div>
        <ActionStatusModal
          description={tradeStatusModal?.description}
          label={statusLabel}
          show={Boolean(tradeStatusModal)}
          title={tradeStatusModal?.title || ""}
          tone={tradeStatusModal?.tone || "pending"}
        />
      </>
    );
  }

  if (isPageVariant) {
    return (
      <>
        <div className="flex h-full min-h-0 flex-col">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2.5">
              <div className="inline-flex rounded-full bg-gray-100 p-1 dark:bg-gray-900">
                {(
                  [
                    { label: "Naira", value: "fiat" },
                    { label: "Onchain", value: "onchain" }
                  ] as const
                ).map((option) => (
                  <button
                    className={
                      tradeRail === option.value
                        ? "rounded-full bg-gray-950 px-2.5 py-1 font-semibold text-[10px] text-white dark:bg-white dark:text-[#111111]"
                        : "rounded-full px-2.5 py-1 font-semibold text-[10px] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                    }
                    key={option.value}
                    onClick={() => setTradeRail(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-gray-500 dark:text-gray-400">
                {balanceLabel}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2.5">
              <div className="inline-flex rounded-full bg-gray-100 p-1 dark:bg-gray-900">
                {modeTabs.map((tab) => (
                  <button
                    className={
                      mode === tab.value
                        ? "rounded-full bg-emerald-500 px-2.5 py-1 font-semibold text-[10px] text-white"
                        : "rounded-full px-2.5 py-1 font-semibold text-[10px] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                    }
                    key={tab.value}
                    onClick={() => setMode(tab.value as Mode)}
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-[0.9rem] border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-950">
              <div className="flex items-center justify-between gap-3">
                <input
                  className="w-full bg-transparent font-semibold text-[1.45rem] text-gray-950 leading-none outline-hidden placeholder:text-gray-400 dark:text-gray-50 dark:placeholder:text-gray-500"
                  inputMode="decimal"
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder={
                    isFiatRail && mode === "buy" ? "1000" : "0.000111"
                  }
                  value={amount}
                />

                <div className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-1.25 font-semibold text-[11px] text-gray-950 dark:border-gray-700 dark:bg-black dark:text-gray-50">
                  {mode === "buy" ? (
                    <span>{isFiatRail ? "NGN" : "ETH"}</span>
                  ) : (
                    <>
                      <Image
                        alt={coin.name}
                        className="size-4 rounded-full"
                        height={16}
                        src={coin.mediaContent?.previewImage?.small}
                        width={16}
                      />
                      <span>{symbol || "TOKEN"}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1">
              {quickTradeOptions.map((option) => (
                <button
                  className="rounded-[0.75rem] border border-gray-200 bg-white px-1 py-1.5 font-semibold text-[10px] text-gray-700 transition-colors hover:border-gray-300 hover:text-gray-950 dark:border-gray-800 dark:bg-black dark:text-gray-300 dark:hover:border-gray-700 dark:hover:text-gray-50"
                  key={option.label}
                  onClick={option.onClick}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="rounded-[0.85rem] border border-gray-200 bg-white px-2.5 py-2 dark:border-gray-800 dark:bg-black">
              <p
                className={cn(
                  "text-[11px] leading-4",
                  fiatQuoteError
                    ? "text-rose-500 dark:text-rose-300"
                    : "text-gray-700 dark:text-gray-200"
                )}
              >
                {summaryText}
              </p>
              {quoteExpiryText ? (
                <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">
                  {quoteExpiryText}
                </p>
              ) : null}
            </div>
          </div>

          <button
            className="mt-auto flex h-10 w-full items-center justify-center rounded-[0.85rem] bg-emerald-500 font-semibold text-[14px] text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300 dark:disabled:bg-emerald-900"
            disabled={!canSubmit}
            onClick={handleSubmit}
            type="button"
          >
            {loading || fiatQuoteLoading ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="xs" />
                <span>{submitLabel}</span>
              </span>
            ) : (
              submitLabel
            )}
          </button>
        </div>
        <ActionStatusModal
          description={tradeStatusModal?.description}
          label={statusLabel}
          show={Boolean(tradeStatusModal)}
          title={tradeStatusModal?.title || ""}
          tone={tradeStatusModal?.tone || "pending"}
        />
      </>
    );
  }

  return (
    <>
      <div className="p-5">
        <div className="mb-3 inline-flex rounded-full bg-gray-100 p-1 dark:bg-gray-900">
          {(
            [
              { label: "Naira", value: "fiat" },
              { label: "Onchain", value: "onchain" }
            ] as const
          ).map((option) => (
            <button
              className={
                tradeRail === option.value
                  ? "rounded-full bg-gray-950 px-3 py-1.5 font-semibold text-[11px] text-white dark:bg-white dark:text-[#111111]"
                  : "rounded-full px-3 py-1.5 font-semibold text-[11px] text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              }
              key={option.value}
              onClick={() => setTradeRail(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
        <Tabs
          active={mode}
          className="mb-4"
          layoutId="trade-mode"
          setActive={(t) => setMode(t as Mode)}
          tabs={modeTabs.map((tab) => ({ name: tab.label, type: tab.value }))}
        />
        <div className="relative mb-2">
          <Input
            inputMode="decimal"
            label={isFiatRail && mode === "buy" ? "Naira amount" : "Amount"}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={
              isFiatRail && mode === "buy"
                ? "1000"
                : mode === "buy"
                  ? "0.01"
                  : "0"
            }
            prefix={
              mode === "buy" ? (
                isFiatRail ? (
                  "NGN"
                ) : (
                  "ETH"
                )
              ) : (
                <Tooltip content={`$${symbol}`}>
                  <Image
                    alt={coin.name}
                    className="size-5 rounded-full"
                    height={20}
                    src={coin.mediaContent?.previewImage?.small}
                    width={20}
                  />
                </Tooltip>
              )
            }
            value={amount}
          />
        </div>
        <div className="mb-3 flex items-center justify-between text-gray-500 text-xs dark:text-gray-400">
          <div>{summaryText}</div>
          <div>{balanceLabel}</div>
        </div>
        {quoteExpiryText ? (
          <div className="mb-3 text-gray-500 text-xs dark:text-gray-400">
            {quoteExpiryText}
          </div>
        ) : null}
        <div className="mb-3 grid grid-cols-4 gap-2">
          {quickTradeOptions.map((option) => (
            <Button key={option.label} onClick={option.onClick} outline>
              {option.label}
            </Button>
          ))}
        </div>
        <Button
          className="mt-4 w-full"
          disabled={!canSubmit}
          loading={loading || fiatQuoteLoading}
          onClick={handleSubmit}
          size="lg"
        >
          {submitLabel}
        </Button>
      </div>
      <ActionStatusModal
        description={tradeStatusModal?.description}
        label={statusLabel}
        show={Boolean(tradeStatusModal)}
        title={tradeStatusModal?.title || ""}
        tone={tradeStatusModal?.tone || "pending"}
      />
    </>
  );
};

export default Trade;
