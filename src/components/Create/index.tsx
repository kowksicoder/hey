import {
  ArrowLeftIcon,
  CheckCircleIcon,
  FilmIcon,
  InformationCircleIcon,
  LinkIcon,
  MusicalNoteIcon,
  PhotoIcon
} from "@heroicons/react/24/outline";
import {
  createCoin,
  createMetadataBuilder,
  createZoraUploaderForCreator,
  setApiKey
} from "@zoralabs/coins-sdk";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import type { Address } from "viem";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import evLogo from "@/assets/fonts/evlogo.jpg";
import MetaTags from "@/components/Common/MetaTags";
import CoinDetailSlidesPreview from "@/components/Create/CoinDetailSlidesPreview";
import { ActionStatusModal } from "@/components/Shared/UI";
import { BASE_RPC_URL, ZORA_API_KEY } from "@/data/constants";
import cn from "@/helpers/cn";
import {
  getMediaImportConfig,
  normalizeCoinMediaUrl
} from "@/helpers/coinMedia";
import {
  createCollaborationCoinInvite,
  getPublicEvery1Profile
} from "@/helpers/every1";
import {
  getExecutionWalletStatus,
  toViemWalletClient
} from "@/helpers/executionWallet";
import {
  COLLABORATION_LAUNCH_CATEGORY,
  COMMUNITY_LAUNCH_CATEGORY,
  CREATOR_CREATE_CATEGORY_OPTIONS
} from "@/helpers/platformCategories";
import { getSupabaseClient, hasSupabaseConfig } from "@/helpers/supabase";
import { announceTelegramCoinLaunch } from "@/helpers/telegramAnnouncements";
import useEvery1ExecutionWallet from "@/hooks/useEvery1ExecutionWallet";
import useHandleWrongNetwork from "@/hooks/useHandleWrongNetwork";
import useOpenAuth from "@/hooks/useOpenAuth";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";

setApiKey(ZORA_API_KEY);

const CREATE_BANNER_IMAGE =
  "https://i.pinimg.com/736x/81/95/3d/81953df1510811e814ceafc09bd7280e.jpg";
const CREATE_TEST_SPOTIFY_LINK =
  "https://open.spotify.com/track/5YrBnxZSRpzYHOBCUfGFw1?utm_source=generator";
const NAIRA_SYMBOL = "\u20A6";

type CreateTab = "collaboration" | "community" | "creator";
type CreateStatusModalState = null | {
  description?: string;
  title: string;
  tone: "pending" | "success";
};

const slugifyValue = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");

const formatSplitPercent = (value: number) =>
  Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/\.?0+$/, "");

const Create = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab =
    searchParams.get("tab") === "community"
      ? "community"
      : searchParams.get("tab") === "collaboration"
        ? "collaboration"
        : "creator";
  const { profile } = useEvery1Store();
  const {
    executionWalletAddress,
    executionWalletClient,
    identityWalletAddress,
    identityWalletClient,
    isLinkingExecutionWallet,
    smartWalletEnabled,
    smartWalletError,
    smartWalletLoading
  } = useEvery1ExecutionWallet();
  const openAuth = useOpenAuth();
  const handleWrongNetwork = useHandleWrongNetwork();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const didApplyPrefill = useRef(false);

  const [activeTab, setActiveTab] = useState<CreateTab>(initialTab);
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [creatorCategory, setCreatorCategory] = useState("");
  const [description, setDescription] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [collaboratorHandle, setCollaboratorHandle] = useState("");
  const [inviteNote, setInviteNote] = useState("");
  const [creatorSplit, setCreatorSplit] = useState("60");
  const [fileName, setFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);
  const [showFeeSheet, setShowFeeSheet] = useState(false);
  const [mobileStep, setMobileStep] = useState<"form" | "ticker">("ticker");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusModal, setStatusModal] = useState<CreateStatusModalState>(null);

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: base,
        transport: http(BASE_RPC_URL, { batch: { batchSize: 30 } })
      }),
    []
  );
  const executionWalletStatus = getExecutionWalletStatus({
    executionWalletAddress,
    executionWalletClient,
    isLinkingExecutionWallet,
    smartWalletEnabled,
    smartWalletError,
    smartWalletLoading
  });

  const isCommunity = activeTab === "community";
  const isCollaboration = activeTab === "collaboration";
  const selectedCategory = isCommunity
    ? COMMUNITY_LAUNCH_CATEGORY
    : isCollaboration
      ? COLLABORATION_LAUNCH_CATEGORY
      : creatorCategory;
  const hasTicker = Boolean(ticker.trim());
  const creatorSplitValue = Number.parseFloat(creatorSplit || "0");
  const collaboratorSplitValue = Math.max(
    0,
    Number.parseFloat((100 - creatorSplitValue).toFixed(2))
  );
  const isSplitValid =
    Number.isFinite(creatorSplitValue) &&
    creatorSplitValue > 0 &&
    creatorSplitValue < 100 &&
    Number.isFinite(collaboratorSplitValue) &&
    collaboratorSplitValue > 0;
  const canSubmit = Boolean(
    selectedFile &&
      selectedCategory &&
      ticker.trim() &&
      name.trim() &&
      (!isCollaboration || (collaboratorHandle.trim() && isSplitValid))
  );
  const previewTicker =
    ticker.trim() ||
    (isCommunity ? "community" : isCollaboration ? "collab" : "creator");
  const previewCurrencyTicker = `${NAIRA_SYMBOL}${previewTicker}`;
  const previewImage = filePreviewUrl || CREATE_BANNER_IMAGE;
  const previewMediaUrl = mediaUrl.trim() || CREATE_TEST_SPOTIFY_LINK;
  const creatorPreviewLabel =
    profile?.displayName?.trim() ||
    (profile?.username?.trim()
      ? `@${profile.username.trim().replace(/^@+/, "")}`
      : "Creator");
  const previewCoinTitle = name.trim() || `${previewTicker.toUpperCase()} coin`;
  const mediaImportConfig = getMediaImportConfig(selectedCategory);
  const topCopy = isCommunity
    ? {
        actionLabel: "Create community coin",
        availabilityLabel: "Community coin ready",
        heroTitle: "Launch a community coin",
        introTitle: "Publish the coin and the community together.",
        postDestination: "Community hub + Every1 Feed",
        previewBody:
          "Your community coin launches with its group already linked and ready for members."
      }
    : isCollaboration
      ? {
          actionLabel: "Send collaboration invite",
          availabilityLabel: "Collaboration invite ready",
          heroTitle: "Start a collaboration coin",
          introTitle:
            "Lock the split up front and let your collaborator approve it.",
          postDestination: "Invite first, launch after approval",
          previewBody:
            "The coin stays pending until your collaborator accepts the exact revenue split."
        }
      : {
          actionLabel: "Create coin",
          availabilityLabel: "Creator coin ready",
          heroTitle: "Launch a creator coin",
          introTitle: "Upload from gallery and finish everything on one form.",
          postDestination: "Every1 Feed",
          previewBody:
            "A tighter desktop canvas for ticker, cover, caption, and launch."
        };

  useEffect(() => {
    return () => {
      if (filePreviewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(filePreviewUrl);
      }
    };
  }, [filePreviewUrl]);

  useEffect(() => {
    if (didApplyPrefill.current || description.trim()) {
      return;
    }

    const text = searchParams.get("text");
    const url = searchParams.get("url");
    const via = searchParams.get("via");

    if (!text && !url && !via) {
      return;
    }

    const nextDescription = [text, url, via ? `via @${via}` : null]
      .filter(Boolean)
      .join("\n\n");

    if (!nextDescription) {
      return;
    }

    setDescription(nextDescription);
    didApplyPrefill.current = true;
  }, [description, searchParams]);

  const handleBack = () => {
    window.history.length > 1
      ? window.history.back()
      : (window.location.href = "/");
  };

  const handleSelectTab = (nextTab: CreateTab) => {
    setActiveTab(nextTab);
    setMobileStep("ticker");
  };

  const handleTickerChange = (value: string) => {
    setTicker(
      value
        .replace(/[^a-z0-9]/gi, "")
        .slice(0, 8)
        .toLowerCase()
    );
  };

  const handleContinueFromTicker = () => {
    if (!hasTicker) {
      return;
    }

    setMobileStep("form");
  };

  const handleOpenGallery = () => {
    inputRef.current?.click();
  };

  const handleSelectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (filePreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(filePreviewUrl);
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setFileName(file.name);
    setFilePreviewUrl(nextPreviewUrl);
  };

  const persistCreatorLaunch = async ({
    coinAddress,
    coverImageUrl,
    metadataUri
  }: {
    coinAddress: string;
    coverImageUrl: null | string;
    metadataUri: string;
  }) => {
    if (!profile?.id) {
      throw new Error(
        "Finish your Every1 profile setup before creating a coin."
      );
    }

    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("create_creator_coin_launch", {
      input_category: selectedCategory,
      input_chain_id: base.id,
      input_coin_address: coinAddress,
      input_cover_image_url: coverImageUrl,
      input_created_by_profile_id: profile.id,
      input_description: description.trim() || null,
      input_media_url: normalizeCoinMediaUrl(mediaUrl),
      input_metadata_uri: metadataUri,
      input_name: name.trim(),
      input_post_destination: "every1_feed",
      input_supply: 10000000,
      input_ticker: ticker.trim()
    });

    if (error) {
      throw error;
    }

    return data as null | { coinAddress?: null | string };
  };

  const persistCommunityLaunch = async ({
    coinAddress,
    coverImageUrl,
    metadataUri
  }: {
    coinAddress: string;
    coverImageUrl: null | string;
    metadataUri: string;
  }) => {
    if (!profile?.id) {
      throw new Error(
        "Finish your Every1 profile setup before creating a community coin."
      );
    }

    const slug = slugifyValue(name.trim()) || slugifyValue(ticker.trim());
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc("create_community_coin_launch", {
      input_category: selectedCategory,
      input_chain_id: base.id,
      input_coin_address: coinAddress,
      input_coin_description: description.trim() || null,
      input_coin_name: name.trim(),
      input_community_description: description.trim() || null,
      input_community_name: name.trim(),
      input_community_slug: slug,
      input_cover_image_url: coverImageUrl,
      input_metadata_uri: metadataUri,
      input_owner_profile_id: profile.id,
      input_supply: 10000000,
      input_ticker: ticker.trim(),
      input_visibility: "public"
    });

    if (error) {
      throw error;
    }

    return data as null | { slug?: null | string };
  };

  const persistCollaborationInvite = async ({
    coverImageUrl,
    metadataUri
  }: {
    coverImageUrl: null | string;
    metadataUri: string;
  }) => {
    if (!profile?.id) {
      throw new Error(
        "Finish your Every1 profile setup before creating a collaboration coin."
      );
    }

    const normalizedCollaboratorHandle = collaboratorHandle
      .trim()
      .replace(/^@+/, "");

    if (!normalizedCollaboratorHandle) {
      throw new Error("Add the collaborator username before continuing.");
    }

    const collaboratorProfile = await getPublicEvery1Profile({
      username: normalizedCollaboratorHandle
    });

    if (!collaboratorProfile?.id) {
      throw new Error("That collaborator profile could not be found.");
    }

    if (collaboratorProfile.id === profile.id) {
      throw new Error("You cannot invite your own profile to collaborate.");
    }

    return await createCollaborationCoinInvite(profile.id, {
      category: selectedCategory,
      collaboratorProfileId: collaboratorProfile.id,
      collaboratorUsername: normalizedCollaboratorHandle,
      coverImageUrl,
      creatorSplit: creatorSplitValue,
      description: description.trim() || null,
      inviteNote: inviteNote.trim() || null,
      metadataUri,
      name: name.trim(),
      ticker: ticker.trim()
    });
  };
  const announceCoinLaunchToTelegram = async ({
    coinAddress,
    launchType
  }: {
    coinAddress: string;
    launchType: "community" | "creator";
  }) => {
    if (
      !profile?.id ||
      !identityWalletAddress ||
      !identityWalletClient?.account
    ) {
      return;
    }

    await announceTelegramCoinLaunch({
      category: selectedCategory,
      coinAddress,
      coinName: name.trim(),
      coinSymbol: ticker.trim().toUpperCase(),
      launchType,
      profileId: profile.id,
      walletAddress: identityWalletAddress,
      walletClient: identityWalletClient
    });
  };

  const handleSubmit = async () => {
    if (isSubmitting) {
      return;
    }

    if (!profile?.id) {
      await openAuth("create_coin");
      return;
    }

    if (!executionWalletStatus.isReady) {
      toast.error(
        executionWalletStatus.message || "Preparing your Every1 wallet on Base."
      );
      return;
    }

    if (!canSubmit || !selectedFile) {
      toast.error("Add a ticker, name, and image before continuing.");
      return;
    }

    if (mediaUrl.trim() && !normalizeCoinMediaUrl(mediaUrl)) {
      toast.error("Add a valid media link before continuing.");
      return;
    }

    if (!hasSupabaseConfig()) {
      toast.error("App configuration is incomplete right now.");
      return;
    }

    try {
      setIsSubmitting(true);
      setStatusModal({
        description: isCommunity
          ? "Publishing your community coin and linked group."
          : isCollaboration
            ? "Saving the project terms and sending the collaboration invite."
            : "Publishing your creator coin to Every1 and Base.",
        title: isCollaboration
          ? "Sending your collaboration invite, please wait"
          : "Launching your coin, please wait",
        tone: "pending"
      });
      await handleWrongNetwork({ chainId: base.id });
      const client = toViemWalletClient(executionWalletClient);
      const creatorAddress = executionWalletAddress as Address | undefined;

      if (!client || !creatorAddress) {
        throw new Error(
          executionWalletStatus.message ||
            "Preparing your Every1 wallet on Base."
        );
      }

      const metadataUpload = await createMetadataBuilder()
        .withName(name.trim())
        .withSymbol(ticker.trim().toUpperCase())
        .withDescription(
          description.trim() ||
            `${name.trim()} ${
              isCommunity ? "community coin" : "creator coin"
            } is live on Every1.`
        )
        .withImage(selectedFile)
        .upload(createZoraUploaderForCreator(creatorAddress));

      if (isCollaboration) {
        await persistCollaborationInvite({
          coverImageUrl: metadataUpload.metadata.image || null,
          metadataUri: metadataUpload.url
        });
        setStatusModal({
          description:
            "Your collaborator needs to accept the split before the coin can go live.",
          title: "Invite sent",
          tone: "success"
        });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        navigate(
          profile?.username || profile?.zoraHandle
            ? `/@${profile?.username || profile?.zoraHandle}?tab=collaborations`
            : `/account/${
                identityWalletAddress ||
                profile?.walletAddress ||
                executionWalletAddress
              }?tab=collaborations`
        );
        return;
      }

      const createdCoin = await createCoin({
        call: {
          chainId: base.id,
          creator: creatorAddress,
          currency: "ETH",
          metadata: metadataUpload.createMetadataParameters.metadata,
          name: name.trim(),
          symbol: ticker.trim().toUpperCase()
        },
        options: {
          account: client.account,
          skipValidateTransaction: true
        },
        publicClient,
        walletClient: client
      });

      const deployedCoinAddress =
        createdCoin.address || createdCoin.deployment?.coin || null;

      if (!deployedCoinAddress) {
        throw new Error(
          "Coin deployed, but the address could not be resolved."
        );
      }

      if (isCommunity) {
        const result = await persistCommunityLaunch({
          coinAddress: deployedCoinAddress,
          coverImageUrl: metadataUpload.metadata.image || null,
          metadataUri: metadataUpload.url
        });
        await announceCoinLaunchToTelegram({
          coinAddress: deployedCoinAddress,
          launchType: "community"
        }).catch((error) => {
          console.error("Failed to announce community coin launch", error);
        });
        setStatusModal({
          description: "You have a new coin now, start making money!",
          title: "Nice work!",
          tone: "success"
        });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        navigate(`/g/${result?.slug || slugifyValue(name.trim())}?created=1`);
      } else {
        await persistCreatorLaunch({
          coinAddress: deployedCoinAddress,
          coverImageUrl: metadataUpload.metadata.image || null,
          metadataUri: metadataUpload.url
        });
        await announceCoinLaunchToTelegram({
          coinAddress: deployedCoinAddress,
          launchType: "creator"
        }).catch((error) => {
          console.error("Failed to announce creator coin launch", error);
        });
        setStatusModal({
          description: "You have a new coin now, start making money!",
          title: "Nice work!",
          tone: "success"
        });
        await new Promise((resolve) => setTimeout(resolve, 1600));
        navigate(`/coins/${deployedCoinAddress}?created=1`);
      }
    } catch (error) {
      setStatusModal(null);
      toast.error(
        isCommunity
          ? "Failed to create community coin"
          : isCollaboration
            ? "Failed to send collaboration invite"
            : "Failed to create coin",
        {
          description:
            error instanceof Error ? error.message : "Please try again."
        }
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCreateForm = ({
    desktop = false,
    showIntro = true,
    showTickerField = true,
    submitLabel = topCopy.actionLabel
  }: {
    desktop?: boolean;
    showIntro?: boolean;
    showTickerField?: boolean;
    submitLabel?: string;
  }) => (
    <div
      className={cn(
        "border border-gray-200 bg-white shadow-sm dark:border-white/8 dark:bg-[#111214] dark:shadow-none",
        desktop
          ? "no-scrollbar flex h-full min-h-0 flex-col overflow-y-auto rounded-[28px] p-4"
          : "rounded-[22px] p-2"
      )}
    >
      {showIntro ? (
        <div className="mb-2 flex flex-col items-center text-center md:mb-2.5">
          <img
            alt="Every1"
            className={cn(
              "border border-black/5 object-cover dark:border-white/10",
              desktop
                ? "mb-1.5 h-9 w-9 rounded-2xl"
                : "mb-1.5 h-8 w-8 rounded-xl"
            )}
            src={evLogo}
          />
          <p
            className={cn(
              "text-gray-500 uppercase dark:text-white/45",
              desktop
                ? "text-[11px] tracking-[0.24em]"
                : "text-[10px] tracking-[0.22em]"
            )}
          >
            One-step create
          </p>
          <p
            className={cn(
              "text-balance font-semibold dark:text-white",
              desktop ? "mt-0.5 text-[20px] leading-6" : "mt-0.5 text-sm"
            )}
          >
            {topCopy.introTitle}
          </p>
        </div>
      ) : null}

      {showTickerField ? (
        <label className="block">
          <span
            className={cn(
              "block text-gray-500 dark:text-white/58",
              desktop ? "mb-1 text-sm" : "mb-0.5 text-[10px]"
            )}
          >
            Ticker
          </span>
          <div
            className={cn(
              "flex items-center bg-gray-100 dark:bg-[#1b1c20]",
              desktop
                ? "rounded-[16px] px-4 py-2.5"
                : "rounded-[14px] px-2.5 py-2"
            )}
          >
            <span
              className={cn(
                "mr-1 font-semibold text-gray-400 dark:text-white/42",
                desktop ? "text-2xl" : "text-sm"
              )}
            >
              {NAIRA_SYMBOL}
            </span>
            <input
              className={cn(
                "w-full border-none bg-transparent p-0 font-semibold text-gray-950 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-white dark:placeholder:text-white/24",
                desktop ? "text-[22px]" : "text-sm"
              )}
              onChange={(event) => handleTickerChange(event.target.value)}
              placeholder="ticker"
              value={ticker}
            />
          </div>
        </label>
      ) : (
        <div className="mb-3 rounded-[16px] bg-gray-100 px-3 py-3 dark:bg-[#1b1c20]">
          <span className="block text-[11px] text-gray-500 dark:text-white/58">
            Ticker
          </span>
          <p className="mt-1 font-semibold text-gray-950 text-lg dark:text-white">
            {previewCurrencyTicker}
          </p>
        </div>
      )}

      <div
        className={cn(
          showTickerField ? (desktop ? "mt-2.5" : "mt-2") : "",
          desktop ? "space-y-1.5" : "space-y-2"
        )}
      >
        <label className="block">
          <span
            className={cn(
              "block text-gray-500 dark:text-white/58",
              desktop ? "mb-1 text-sm" : "mb-0.5 text-[10px]"
            )}
          >
            {isCommunity
              ? "Coin + community name"
              : isCollaboration
                ? "Project name"
                : "Name"}
          </span>
          <input
            className={cn(
              "w-full border-none bg-gray-100 font-semibold text-gray-950 outline-none placeholder:text-gray-400 focus:ring-0 dark:bg-[#1b1c20] dark:text-white dark:placeholder:text-white/24",
              desktop
                ? "rounded-[16px] px-4 py-2.5 text-[22px]"
                : "rounded-[14px] px-2.5 py-2 text-sm"
            )}
            onChange={(event) => setName(event.target.value)}
            placeholder={
              isCommunity
                ? "Community name"
                : isCollaboration
                  ? "Asake x Rema Album Coin"
                  : "Name"
            }
            value={name}
          />
        </label>

        <label className="block">
          <span
            className={cn(
              "block text-gray-500 dark:text-white/58",
              desktop ? "mb-1 text-sm" : "mb-0.5 text-[10px]"
            )}
          >
            Category
          </span>
          <select
            className={cn(
              "w-full appearance-none border-none bg-gray-100 font-semibold text-gray-950 outline-none focus:ring-0 dark:bg-[#1b1c20] dark:text-white",
              desktop
                ? "rounded-[16px] px-4 py-2.5 text-base"
                : "rounded-[14px] px-2.5 py-2 text-sm"
            )}
            disabled={isCommunity || isCollaboration}
            onChange={(event) => setCreatorCategory(event.target.value)}
            value={selectedCategory}
          >
            {isCommunity || isCollaboration ? null : (
              <option value="">Select category</option>
            )}
            {isCommunity ? (
              <option value={COMMUNITY_LAUNCH_CATEGORY}>
                {COMMUNITY_LAUNCH_CATEGORY}
              </option>
            ) : isCollaboration ? (
              <option value={COLLABORATION_LAUNCH_CATEGORY}>
                {COLLABORATION_LAUNCH_CATEGORY}
              </option>
            ) : (
              CREATOR_CREATE_CATEGORY_OPTIONS.map((categoryOption) => (
                <option key={categoryOption} value={categoryOption}>
                  {categoryOption}
                </option>
              ))
            )}
          </select>
        </label>

        <label className="block">
          <span
            className={cn(
              "block text-gray-500 dark:text-white/58",
              desktop ? "mb-1 text-sm" : "mb-0.5 text-[10px]"
            )}
          >
            Description
          </span>
          <textarea
            className={cn(
              "w-full resize-none border-none bg-gray-100 text-gray-950 outline-none placeholder:text-gray-400 focus:ring-0 dark:bg-[#1b1c20] dark:text-white dark:placeholder:text-white/24",
              desktop
                ? "min-h-20 rounded-[16px] px-4 py-2.5 text-sm"
                : "min-h-16 rounded-[14px] px-2.5 py-2 text-xs"
            )}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={
              isCommunity
                ? "What is this community about?"
                : isCollaboration
                  ? "What is this joint project about?"
                  : "Tell people what this post or drop is about"
            }
            value={description}
          />
        </label>

        {isCollaboration ? (
          <>
            <label className="block">
              <span
                className={cn(
                  "block text-gray-500 dark:text-white/58",
                  desktop ? "mb-1 text-sm" : "mb-0.5 text-[10px]"
                )}
              >
                Collaborator username
              </span>
              <div
                className={cn(
                  "flex items-center bg-gray-100 dark:bg-[#1b1c20]",
                  desktop
                    ? "rounded-[16px] px-4 py-2.5"
                    : "rounded-[14px] px-2.5 py-2"
                )}
              >
                <span
                  className={cn(
                    "mr-1 font-semibold text-gray-400 dark:text-white/42",
                    desktop ? "text-lg" : "text-sm"
                  )}
                >
                  @
                </span>
                <input
                  className={cn(
                    "w-full border-none bg-transparent p-0 font-semibold text-gray-950 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-white dark:placeholder:text-white/24",
                    desktop ? "text-base" : "text-sm"
                  )}
                  onChange={(event) =>
                    setCollaboratorHandle(
                      event.target.value.replace(/^@+/, "").trim().toLowerCase()
                    )
                  }
                  placeholder="remajr"
                  value={collaboratorHandle}
                />
              </div>
            </label>

            <label className="block">
              <span
                className={cn(
                  "block text-gray-500 dark:text-white/58",
                  desktop ? "mb-1 text-sm" : "mb-0.5 text-[10px]"
                )}
              >
                Your split
              </span>
              <div
                className={cn(
                  "rounded-[16px] bg-gray-100 px-4 py-3 dark:bg-[#1b1c20]",
                  !desktop && "rounded-[14px] px-2.5 py-2.5"
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <input
                    className={cn(
                      "w-20 border-none bg-transparent p-0 font-semibold text-gray-950 outline-none placeholder:text-gray-400 focus:ring-0 dark:text-white dark:placeholder:text-white/24",
                      desktop ? "text-2xl" : "text-base"
                    )}
                    max="99"
                    min="1"
                    onChange={(event) => setCreatorSplit(event.target.value)}
                    placeholder="60"
                    type="number"
                    value={creatorSplit}
                  />
                  <span className="font-semibold text-gray-500 text-sm dark:text-white/50">
                    %
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-white/55">
                  <span>You</span>
                  <span>
                    @{collaboratorHandle || "collaborator"} gets{" "}
                    {formatSplitPercent(collaboratorSplitValue)}%
                  </span>
                </div>
              </div>
            </label>

            <label className="block">
              <span
                className={cn(
                  "block text-gray-500 dark:text-white/58",
                  desktop ? "mb-1 text-sm" : "mb-0.5 text-[10px]"
                )}
              >
                Invite note
              </span>
              <textarea
                className={cn(
                  "w-full resize-none border-none bg-gray-100 text-gray-950 outline-none placeholder:text-gray-400 focus:ring-0 dark:bg-[#1b1c20] dark:text-white dark:placeholder:text-white/24",
                  desktop
                    ? "min-h-16 rounded-[16px] px-4 py-2.5 text-sm"
                    : "min-h-14 rounded-[14px] px-2.5 py-2 text-xs"
                )}
                onChange={(event) => setInviteNote(event.target.value)}
                placeholder="Add a quick note about the project or split."
                value={inviteNote}
              />
            </label>
          </>
        ) : null}
      </div>

      <div
        className={cn(
          !isCommunity && !isCollaboration
            ? desktop
              ? "mt-2.5 grid grid-cols-2 items-start gap-2"
              : "mt-2 space-y-2"
            : desktop
              ? "mt-2.5"
              : "mt-2"
        )}
      >
        <button
          className={cn(
            "w-full overflow-hidden border border-gray-200 bg-gray-100 transition dark:border-white/10 dark:bg-[#18191d]",
            desktop ? "rounded-[16px]" : "rounded-[14px]",
            filePreviewUrl ? "p-0" : desktop ? "p-2" : "p-2"
          )}
          onClick={handleOpenGallery}
          type="button"
        >
          {filePreviewUrl ? (
            <div className="relative">
              <img
                alt={fileName || "Selected media"}
                className={cn(
                  "w-full object-cover",
                  desktop ? "aspect-[4/2]" : "aspect-[4/3.1]"
                )}
                src={filePreviewUrl}
              />
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent",
                  desktop ? "px-3 pt-7 pb-3" : "px-2.5 pt-6 pb-2"
                )}
              >
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "truncate font-medium text-white/65",
                        desktop ? "text-[11px]" : "text-[11px]"
                      )}
                    >
                      Selected image
                    </p>
                    <p
                      className={cn(
                        "truncate text-white",
                        desktop ? "text-sm" : "text-xs"
                      )}
                    >
                      {fileName}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-full bg-white font-medium text-black",
                      desktop
                        ? "px-3 py-1.5 text-[11px]"
                        : "px-2 py-1 text-[10px]"
                    )}
                  >
                    Change
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "flex items-center justify-center text-left",
                desktop ? "gap-2 px-2.5 py-2" : "gap-2 px-1 py-1"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center rounded-full bg-white dark:bg-white/8",
                  desktop ? "h-8 w-8" : "h-7 w-7 shrink-0"
                )}
              >
                <PhotoIcon
                  className={cn(
                    "text-gray-950 dark:text-white",
                    desktop ? "h-4 w-4" : "h-3.5 w-3.5"
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "font-medium text-gray-950 dark:text-white",
                    desktop ? "text-sm" : "text-[11px]"
                  )}
                >
                  Upload from gallery
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-gray-500 dark:text-white/55",
                    desktop ? "text-[11px] leading-4" : "text-[9px] leading-4"
                  )}
                >
                  {isCommunity
                    ? "Add the image members will see first."
                    : isCollaboration
                      ? "Add the cover both collaborators will review."
                      : "Add an image for the post."}
                </p>
              </div>
            </div>
          )}
        </button>

        {!isCommunity && !isCollaboration ? (
          <div
            className={cn(
              "border border-gray-200 bg-gray-100 dark:border-white/10 dark:bg-[#18191d]",
              desktop
                ? "flex flex-col self-start rounded-[16px] p-3"
                : "rounded-[18px] p-2.5"
            )}
          >
            <div
              className={cn(
                "flex items-start gap-2",
                desktop ? "mb-2" : "mb-2"
              )}
            >
              <div
                className={cn(
                  "flex items-center justify-center rounded-full bg-white dark:bg-white/8",
                  desktop ? "h-8 w-8" : "h-7 w-7 shrink-0"
                )}
              >
                {mediaImportConfig.intent === "music" ? (
                  <MusicalNoteIcon
                    className={cn(
                      "text-gray-950 dark:text-white",
                      desktop ? "h-4 w-4" : "h-3.5 w-3.5"
                    )}
                  />
                ) : mediaImportConfig.intent === "movie" ? (
                  <FilmIcon
                    className={cn(
                      "text-gray-950 dark:text-white",
                      desktop ? "h-4 w-4" : "h-3.5 w-3.5"
                    )}
                  />
                ) : (
                  <LinkIcon
                    className={cn(
                      "text-gray-950 dark:text-white",
                      desktop ? "h-4 w-4" : "h-3.5 w-3.5"
                    )}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "font-medium text-gray-950 dark:text-white",
                    desktop ? "text-sm" : "text-[11px]"
                  )}
                >
                  {mediaImportConfig.label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-gray-500 dark:text-white/55",
                    desktop ? "text-[11px] leading-4" : "text-[9px] leading-4"
                  )}
                >
                  {mediaImportConfig.helperText}
                </p>
              </div>
            </div>

            <input
              className={cn(
                "w-full border-none bg-white font-medium text-gray-950 outline-none placeholder:text-gray-400 focus:ring-0 dark:bg-[#111214] dark:text-white dark:placeholder:text-white/24",
                desktop
                  ? "rounded-[10px] px-2.5 py-2 text-[13px]"
                  : "rounded-[12px] px-2.5 py-2 text-xs"
              )}
              onChange={(event) => setMediaUrl(event.target.value)}
              placeholder={mediaImportConfig.placeholder}
              value={mediaUrl}
            />
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "bg-gray-100 dark:bg-[#1a1b1f]",
          desktop ? "mt-2.5 rounded-[18px] p-4" : "mt-2.5 rounded-[16px] p-2.5"
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between",
            desktop ? "py-1 text-base" : "py-0.5 text-xs"
          )}
        >
          <span className="text-gray-600 dark:text-white/72">You receive</span>
          <span className="font-medium text-gray-950 dark:text-white">
            {isCollaboration
              ? `${formatSplitPercent(creatorSplitValue)}%`
              : "10,000,000"}
          </span>
        </div>
        {isCollaboration ? (
          <div
            className={cn(
              "flex items-center justify-between",
              desktop ? "py-1 text-base" : "py-0.5 text-xs"
            )}
          >
            <span className="text-gray-600 dark:text-white/72">
              Collaborator share
            </span>
            <span className="text-right text-gray-900 dark:text-white/88">
              {`${formatSplitPercent(collaboratorSplitValue)}%`}
            </span>
          </div>
        ) : null}
        {isCollaboration ? (
          <div
            className={cn(
              "flex items-center justify-between",
              desktop ? "py-1 text-base" : "py-0.5 text-xs"
            )}
          >
            <span className="text-gray-600 dark:text-white/72">Flow</span>
            <span className="text-right text-gray-900 dark:text-white/88">
              {topCopy.postDestination}
            </span>
          </div>
        ) : null}
        <button
          className={cn(
            "flex w-full items-center justify-between text-left",
            desktop ? "py-1 text-base" : "py-0.5 text-xs"
          )}
          onClick={() => setShowFeeSheet(true)}
          type="button"
        >
          <span className="inline-flex items-center gap-1 text-gray-600 dark:text-white/72">
            Blockchain fee
            <InformationCircleIcon
              className={desktop ? "h-4 w-4" : "h-3.5 w-3.5"}
            />
          </span>
          <span className="inline-flex items-center gap-1 text-gray-500 dark:text-white/54">
            <CheckCircleIcon className={desktop ? "h-4 w-4" : "h-3.5 w-3.5"} />
            Sponsored by Zora
          </span>
        </button>
      </div>

      <button
        className={cn(
          "w-full rounded-full font-semibold transition",
          desktop ? "mt-3 px-6 py-3.5 text-xl" : "mt-2.5 px-4 py-2.5 text-sm",
          canSubmit && !isSubmitting && executionWalletStatus.isReady
            ? "bg-gray-950 text-white dark:bg-white dark:text-black"
            : "bg-gray-200 text-gray-400 dark:bg-white/16 dark:text-white/40"
        )}
        disabled={!canSubmit || isSubmitting || !executionWalletStatus.isReady}
        onClick={handleSubmit}
        type="button"
      >
        {isSubmitting
          ? "Creating..."
          : executionWalletStatus.isReady
            ? submitLabel
            : executionWalletStatus.isPreparing
              ? "Preparing wallet..."
              : submitLabel}
      </button>
      {executionWalletStatus.isReady ? null : (
        <p className="mt-2 text-center text-[11px] text-gray-500 dark:text-white/52">
          {executionWalletStatus.message}
        </p>
      )}
    </div>
  );

  const renderCreateTabs = ({ desktop = false }: { desktop?: boolean }) => (
    <div
      className={cn(
        "inline-flex items-center rounded-full border border-gray-200 bg-white/80 backdrop-blur-sm dark:border-white/8 dark:bg-white/5",
        desktop ? "gap-1.5 p-1.5" : "gap-1 p-1"
      )}
    >
      <button
        className={cn(
          "rounded-full font-medium transition",
          activeTab === "creator"
            ? "bg-gray-950 text-white dark:bg-white dark:text-black"
            : "text-gray-500 hover:text-gray-900 dark:text-white/44 dark:hover:text-white",
          desktop ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-[11px]"
        )}
        onClick={() => handleSelectTab("creator")}
        type="button"
      >
        Creator
      </button>
      <button
        className={cn(
          "rounded-full font-medium transition",
          activeTab === "collaboration"
            ? "bg-gray-950 text-white dark:bg-white dark:text-black"
            : "text-gray-500 hover:text-gray-900 dark:text-white/44 dark:hover:text-white",
          desktop ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-[11px]"
        )}
        onClick={() => handleSelectTab("collaboration")}
        type="button"
      >
        Collaboration
      </button>
      <button
        className={cn(
          "rounded-full font-medium transition",
          activeTab === "community"
            ? "bg-gray-950 text-white dark:bg-white dark:text-black"
            : "text-gray-500 hover:text-gray-900 dark:text-white/44 dark:hover:text-white",
          desktop ? "px-3 py-1.5 text-sm" : "px-2.5 py-1 text-[11px]"
        )}
        onClick={() => handleSelectTab("community")}
        type="button"
      >
        Community
      </button>
    </div>
  );

  return (
    <>
      <MetaTags description="Create on Every1." title="Create" />
      <input
        accept="image/*"
        className="hidden"
        onChange={handleSelectFile}
        ref={inputRef}
        type="file"
      />

      <div
        className="min-h-screen bg-gray-50 text-gray-950 dark:bg-[#08090b] dark:text-white"
        style={{
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          paddingTop: "max(8px, env(safe-area-inset-top))"
        }}
      >
        <div className="md:hidden">
          {mobileStep === "ticker" ? (
            <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col px-4">
              <div className="flex items-center justify-between py-1">
                <button
                  aria-label="Back"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-gray-950 dark:text-white"
                  onClick={handleBack}
                  type="button"
                >
                  <ArrowLeftIcon className="h-7 w-7" />
                </button>
                {renderCreateTabs({ desktop: false })}
                <div className="h-10 w-10" />
              </div>

              <div className="flex flex-1 flex-col justify-center pb-14">
                <div className="text-center">
                  <p className="inline-flex items-center gap-1.5 text-gray-500 text-sm dark:text-white/45">
                    {topCopy.heroTitle}
                    <InformationCircleIcon className="h-4 w-4" />
                  </p>
                  <p
                    className={cn(
                      "mt-6 font-semibold text-6xl tracking-tight",
                      hasTicker
                        ? "text-gray-950 dark:text-white"
                        : "text-gray-300 dark:text-white/22"
                    )}
                  >
                    {previewCurrencyTicker}
                  </p>
                  {hasTicker ? (
                    <p className="mt-4 inline-flex items-center gap-1.5 text-green-500 text-lg">
                      <CheckCircleIcon className="h-5 w-5" />
                      {topCopy.availabilityLabel}
                    </p>
                  ) : null}
                </div>

                <div className="mt-12">
                  <div className="rounded-[22px] bg-gray-200/90 px-5 py-4 dark:bg-white/10">
                    <input
                      className="w-full border-none bg-transparent p-0 text-center font-medium text-gray-950 text-lg outline-none placeholder:text-gray-400 focus:ring-0 dark:text-white dark:placeholder:text-white/24"
                      onChange={(event) =>
                        handleTickerChange(event.target.value)
                      }
                      placeholder="Enter a ticker"
                      value={ticker}
                    />
                  </div>

                  <button
                    className={cn(
                      "mt-5 w-full rounded-[22px] px-5 py-4 font-semibold text-lg transition",
                      hasTicker
                        ? "bg-gray-950 text-white dark:bg-white dark:text-black"
                        : "bg-gray-200 text-gray-400 dark:bg-white/12 dark:text-white/30"
                    )}
                    onClick={handleContinueFromTicker}
                    type="button"
                  >
                    {hasTicker
                      ? `Continue with ${previewCurrencyTicker}`
                      : "Proceed"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex min-h-screen w-full max-w-sm flex-col px-4">
              <div className="flex items-center justify-between py-1">
                <button
                  aria-label="Back to ticker"
                  className="flex h-10 w-10 items-center justify-center rounded-full text-gray-950 dark:text-white"
                  onClick={() => setMobileStep("ticker")}
                  type="button"
                >
                  <ArrowLeftIcon className="h-6 w-6" />
                </button>
                {renderCreateTabs({ desktop: false })}
                <div className="h-10 w-10" />
              </div>

              <div className="flex-1 py-4">
                <div className="pb-6 text-center">
                  <p className="inline-flex items-center gap-1.5 text-gray-500 text-sm dark:text-white/45">
                    {topCopy.heroTitle}
                    <InformationCircleIcon className="h-4 w-4" />
                  </p>
                  <p className="mt-5 font-semibold text-5xl text-gray-950 tracking-tight dark:text-white">
                    {previewCurrencyTicker}
                  </p>
                  <p className="mt-3 inline-flex items-center gap-1.5 text-green-500">
                    <CheckCircleIcon className="h-5 w-5" />
                    {topCopy.availabilityLabel}
                  </p>
                </div>

                {activeTab === "creator" ? (
                  <div className="mb-4">
                    <CoinDetailSlidesPreview
                      category={selectedCategory}
                      compact
                      creatorLabel={creatorPreviewLabel}
                      mediaUrl={previewMediaUrl}
                      previewImage={filePreviewUrl}
                      ticker={previewTicker}
                      title={previewCoinTitle}
                    />
                  </div>
                ) : null}

                {renderCreateForm({
                  showIntro: false,
                  showTickerField: false
                })}
              </div>
            </div>
          )}
        </div>

        <div className="mx-auto hidden min-h-screen w-full max-w-6xl flex-col px-6 md:flex">
          <div className="flex items-center justify-between py-1">
            <button
              aria-label="Back"
              className="flex h-10 w-10 items-center justify-center rounded-full text-gray-950 dark:text-white"
              onClick={handleBack}
              type="button"
            >
              <ArrowLeftIcon className="h-6 w-6" />
            </button>
            <p className="font-medium text-2xl">Create</p>
            <div className="h-10 w-10" />
          </div>

          <div className="mt-2 flex justify-center">
            {renderCreateTabs({ desktop: true })}
          </div>

          <div className="grid h-[54vh] max-h-[560px] min-h-[480px] flex-1 grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] gap-4 py-6">
            <div className="h-full">{renderCreateForm({ desktop: true })}</div>

            <aside className="relative h-full overflow-hidden rounded-[32px] border border-gray-200 bg-[#dfe5ef] dark:border-white/8 dark:bg-[#0f1115]">
              <img
                alt={fileName || "Banner preview"}
                className="absolute inset-0 h-full w-full object-cover"
                src={previewImage}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/78 via-black/28 to-transparent" />
              <div className="relative flex h-full flex-col p-6">
                <div className="inline-flex w-fit items-center gap-2 rounded-full bg-black/30 px-3 py-2 text-white backdrop-blur-md">
                  <img
                    alt="Every1"
                    className="h-7 w-7 rounded-full object-cover ring-1 ring-white/25"
                    src={evLogo}
                  />
                  <span className="font-medium text-sm">Every1 Create</span>
                </div>

                {activeTab === "creator" ? (
                  <>
                    <div className="mt-5">
                      <div className="mb-4 flex flex-wrap gap-2">
                        <span className="rounded-full bg-white/16 px-3 py-1.5 text-white text-xs backdrop-blur-md">
                          {previewCurrencyTicker}
                        </span>
                        <span className="rounded-full bg-white/16 px-3 py-1.5 text-white text-xs backdrop-blur-md">
                          Creator coin
                        </span>
                      </div>
                      <p className="max-w-sm font-semibold text-3xl text-white leading-tight">
                        Preview the content, image, and chart stack before
                        launch.
                      </p>
                      <p className="mt-3 max-w-sm text-sm text-white/78 leading-6">
                        Imported creator links add a content slide first, and
                        uploading the coin image adds the image slide between
                        content and chart.
                      </p>
                    </div>

                    <div className="mt-5 flex-1">
                      <CoinDetailSlidesPreview
                        category={selectedCategory}
                        creatorLabel={creatorPreviewLabel}
                        mediaUrl={previewMediaUrl}
                        previewImage={filePreviewUrl}
                        ticker={previewTicker}
                        title={previewCoinTitle}
                      />
                    </div>
                  </>
                ) : (
                  <div className="mt-auto">
                    <div className="mb-4 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white/16 px-3 py-1.5 text-white text-xs backdrop-blur-md">
                        {previewCurrencyTicker}
                      </span>
                      <span className="rounded-full bg-white/16 px-3 py-1.5 text-white text-xs backdrop-blur-md">
                        {isCommunity
                          ? "Community linked on publish"
                          : "Invite must be accepted"}
                      </span>
                    </div>
                    <p className="max-w-sm font-semibold text-4xl text-white leading-tight">
                      {isCommunity
                        ? "Launch the community and its coin in one move."
                        : "Set the split, send the invite, and wait for approval."}
                    </p>
                    <p className="mt-3 max-w-sm text-sm text-white/78 leading-6">
                      {topCopy.previewBody}
                    </p>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>

        {showFeeSheet ? (
          <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm dark:bg-black/70">
            <button
              aria-label="Close fee information"
              className="absolute inset-0"
              onClick={() => setShowFeeSheet(false)}
              type="button"
            />
            <div className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-xl rounded-t-[28px] bg-white px-5 pt-4 pb-6 md:px-6 md:pb-8 dark:bg-[#1b1b1b]">
              <div className="mx-auto mb-5 h-1.5 w-14 rounded-full bg-gray-300 dark:bg-white/14" />
              <p className="font-semibold text-2xl text-gray-950 md:text-[2rem] dark:text-white">
                Understanding blockchain fees
              </p>
              <p className="mt-3 text-gray-600 text-sm leading-6 md:mt-4 md:text-lg md:leading-8 dark:text-white/64">
                This is the fee paid to the Base network to process your
                transaction. It varies with network demand and is not controlled
                by Zora.
              </p>
              <button
                className="mt-6 w-full rounded-full bg-gray-950 px-5 py-3.5 font-semibold text-lg text-white md:mt-8 md:px-6 md:py-4 md:text-2xl dark:bg-white dark:text-black"
                onClick={() => setShowFeeSheet(false)}
                type="button"
              >
                Got it
              </button>
            </div>
          </div>
        ) : null}

        <ActionStatusModal
          description={statusModal?.description}
          label={
            isCommunity
              ? "Community coin"
              : isCollaboration
                ? "Collaboration coin"
                : "Creator coin"
          }
          show={Boolean(statusModal)}
          title={statusModal?.title || ""}
          tone={statusModal?.tone || "pending"}
        />
      </div>
    </>
  );
};

export default Create;
