import {
  ArrowTopRightOnSquareIcon,
  CameraIcon,
  CheckBadgeIcon,
  ClipboardDocumentIcon,
  LinkIcon,
  ShieldCheckIcon
} from "@heroicons/react/24/outline";
import { useLinkAccount, usePrivy } from "@privy-io/react-auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import BackButton from "@/components/Shared/BackButton";
import NotLoggedIn from "@/components/Shared/NotLoggedIn";
import PageLayout from "@/components/Shared/PageLayout";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorMessage,
  Input,
  Select,
  TextArea
} from "@/components/Shared/UI";
import errorToast from "@/helpers/errorToast";
import {
  EVERY1_PROFILE_QUERY_KEY,
  EVERY1_PROFILE_SOCIAL_ACCOUNTS_QUERY_KEY,
  EVERY1_PROFILE_VERIFICATION_REQUESTS_QUERY_KEY,
  getVerificationRuntimeConfig,
  listProfileSocialAccounts,
  listProfileVerificationRequests,
  submitProfileVerificationProofEvidence,
  submitProfileVerificationRequest,
  syncProfileSocialAccount,
  verifyXProfileVerificationProof
} from "@/helpers/every1";
import {
  getPrivyInstagramAccount,
  getPrivyTwitterAccount,
  mergeEvery1ProfileIntoAccount
} from "@/helpers/privy";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";
import type {
  Every1ProfileSocialAccount,
  Every1ProfileVerificationRequest,
  Every1VerificationProofStatus,
  Every1VerificationStatus
} from "@/types/every1";

const providerOptions: {
  label: string;
  value: Every1ProfileVerificationRequest["provider"];
}[] = [
  { label: "Instagram", value: "instagram" },
  { label: "X", value: "x" },
  { label: "YouTube", value: "youtube" },
  { label: "TikTok", value: "tiktok" },
  { label: "Other", value: "other" }
];

const statusMeta: Record<
  Every1VerificationStatus,
  { className: string; label: string }
> = {
  flagged: {
    className:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/80 dark:bg-amber-950/40 dark:text-amber-300",
    label: "Needs review"
  },
  pending: {
    className:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/80 dark:bg-blue-950/40 dark:text-blue-300",
    label: "Pending"
  },
  rejected: {
    className:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-900/80 dark:bg-red-950/40 dark:text-red-300",
    label: "Not approved"
  },
  unverified: {
    className:
      "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300",
    label: "Unverified"
  },
  verified: {
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/80 dark:bg-emerald-950/40 dark:text-emerald-300",
    label: "Official"
  }
};

const proofStatusMeta: Record<
  Every1VerificationProofStatus,
  { className: string; label: string }
> = {
  failed: {
    className:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-900/80 dark:bg-red-950/40 dark:text-red-300",
    label: "Proof failed"
  },
  not_started: {
    className:
      "border-gray-200 bg-gray-50 text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300",
    label: "Proof needed"
  },
  submitted: {
    className:
      "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/80 dark:bg-blue-950/40 dark:text-blue-300",
    label: "Proof submitted"
  },
  verified: {
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/80 dark:bg-emerald-950/40 dark:text-emerald-300",
    label: "Proof verified"
  }
};

const VerificationStatusChip = ({
  status
}: {
  status: Every1VerificationStatus;
}) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold text-[11px] ${statusMeta[status].className}`}
  >
    {statusMeta[status].label}
  </span>
);

const ProofStatusChip = ({
  status
}: {
  status: Every1VerificationProofStatus;
}) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-1 font-semibold text-[11px] ${proofStatusMeta[status].className}`}
  >
    {proofStatusMeta[status].label}
  </span>
);

const SocialAccountChip = ({
  account
}: {
  account: Every1ProfileSocialAccount;
}) => (
  <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50/80 px-3 py-3 dark:border-gray-800 dark:bg-gray-900/70">
    <div className="min-w-0">
      <p className="font-semibold text-gray-950 text-sm capitalize dark:text-gray-50">
        {account.provider}
      </p>
      <p className="truncate text-gray-500 text-xs dark:text-gray-400">
        @{account.handle}
      </p>
    </div>
    <div className="flex items-center gap-2">
      {account.isPrimary ? (
        <Badge className="border-transparent bg-gray-900 px-2 py-0.5 text-white shadow-none dark:bg-white dark:text-black">
          Primary
        </Badge>
      ) : null}
      <ProofStatusChip
        status={account.isVerified ? "verified" : "not_started"}
      />
    </div>
  </div>
);

const VerificationSettings = () => {
  const queryClient = useQueryClient();
  const { currentAccount, setCurrentAccount } = useAccountStore();
  const { profile, setProfile } = useEvery1Store();
  const { user } = usePrivy();
  const { linkInstagram, linkTwitter } = useLinkAccount();
  const [provider, setProvider] =
    useState<Every1ProfileVerificationRequest["provider"]>("instagram");
  const [claimedHandle, setClaimedHandle] = useState("");
  const [category, setCategory] = useState("Artist");
  const [note, setNote] = useState("");
  const [proofPostUrl, setProofPostUrl] = useState("");
  const [proofPostText, setProofPostText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSyncingLinkedX, setIsSyncingLinkedX] = useState(false);
  const [isSyncingLinkedInstagram, setIsSyncingLinkedInstagram] =
    useState(false);
  const linkedXAccount = useMemo(() => getPrivyTwitterAccount(user), [user]);
  const linkedInstagramAccount = useMemo(
    () => getPrivyInstagramAccount(user),
    [user]
  );

  const requestsQuery = useQuery({
    enabled: Boolean(profile?.id),
    queryFn: () => listProfileVerificationRequests(profile?.id || ""),
    queryKey: [EVERY1_PROFILE_VERIFICATION_REQUESTS_QUERY_KEY, profile?.id]
  });

  const socialAccountsQuery = useQuery({
    enabled: Boolean(profile?.id),
    queryFn: () => listProfileSocialAccounts(profile?.id || ""),
    queryKey: [EVERY1_PROFILE_SOCIAL_ACCOUNTS_QUERY_KEY, profile?.id]
  });

  const verificationConfigQuery = useQuery({
    queryFn: getVerificationRuntimeConfig,
    queryKey: ["verification-runtime-config"],
    staleTime: 30_000
  });

  const latestRequest = requestsQuery.data?.[0] || null;
  const latestInstagramRequest =
    requestsQuery.data?.find((request) => request.provider === "instagram") ||
    null;
  const latestXRequest =
    requestsQuery.data?.find((request) => request.provider === "x") || null;
  const activeProviderRequest =
    provider === "instagram"
      ? latestInstagramRequest
      : provider === "x"
        ? latestXRequest
        : latestRequest;
  const isAlreadyOfficial = profile?.verificationStatus === "verified";
  const xVerificationEnabled = Boolean(
    verificationConfigQuery.data?.xVerificationEnabled
  );
  const linkedXAccountLabel = linkedXAccount?.username
    ? `@${linkedXAccount.username}`
    : null;
  const linkedInstagramAccountLabel = linkedInstagramAccount?.username
    ? `@${linkedInstagramAccount.username}`
    : null;

  const canSubmit =
    Boolean(profile?.id) &&
    !isSubmitting &&
    !isAlreadyOfficial &&
    (provider === "x"
      ? Boolean(linkedXAccount?.username)
      : provider === "instagram"
        ? Boolean(linkedInstagramAccount?.username)
        : claimedHandle.trim().length > 1);

  const xProofCopy = latestXRequest
    ? `Claiming my official coin on EV1: ${latestXRequest.verificationCode}`
    : "";
  const instagramProofCopy = latestInstagramRequest
    ? `Claiming my official coin on EV1: ${latestInstagramRequest.verificationCode}`
    : "";
  const activeProofCopy =
    provider === "instagram" ? instagramProofCopy : xProofCopy;

  const instructionText = useMemo(() => {
    if (profile?.verificationStatus === "verified") {
      return "This creator profile has already passed Every1 official verification.";
    }

    if (provider === "instagram") {
      return "Link your Instagram account, publish the EV1 proof code in your bio or a public post, and send that proof in for review.";
    }

    if (provider === "x") {
      return "Link your X account, post the EV1 verification code, and we will approve your official creator badge automatically when the proof matches.";
    }

    if (latestRequest?.status === "pending") {
      return "Your request is already in the admin review queue. Instagram proof review is live now, and X proof automation stays optional.";
    }

    return "EV1 uses wallet identity plus claimed social identity for official creator trust. Instagram proof review is live now, and the other providers still use manual review.";
  }, [latestRequest?.status, profile?.verificationStatus, provider]);

  useEffect(() => {
    const linkedHandle =
      provider === "x"
        ? linkedXAccount?.username
        : provider === "instagram"
          ? linkedInstagramAccount?.username
          : null;

    if (!linkedHandle) {
      return;
    }

    if (claimedHandle === linkedHandle) {
      return;
    }

    setClaimedHandle(linkedHandle);
  }, [
    claimedHandle,
    linkedInstagramAccount?.username,
    linkedXAccount?.username,
    provider
  ]);

  useEffect(() => {
    if (
      !profile?.id ||
      !linkedXAccount?.username ||
      socialAccountsQuery.isLoading ||
      isSyncingLinkedX
    ) {
      return;
    }

    const alreadyLinked = (socialAccountsQuery.data || []).some(
      (account) =>
        account.provider === "x" &&
        (account.providerUserId === linkedXAccount.subject ||
          account.handle === linkedXAccount.username)
    );

    if (alreadyLinked) {
      return;
    }

    let isCancelled = false;

    const syncLinkedX = async () => {
      try {
        setIsSyncingLinkedX(true);

        await syncProfileSocialAccount({
          avatarUrl: linkedXAccount.profilePictureUrl,
          displayName: linkedXAccount.displayName,
          handle: linkedXAccount.username || "",
          profileId: profile.id,
          profileUrl: linkedXAccount.username
            ? `https://x.com/${linkedXAccount.username}`
            : null,
          provider: "x",
          providerUserId: linkedXAccount.subject
        });

        await queryClient.invalidateQueries({
          queryKey: [EVERY1_PROFILE_SOCIAL_ACCOUNTS_QUERY_KEY, profile.id]
        });
      } catch (error) {
        console.error(error);
      } finally {
        if (!isCancelled) {
          setIsSyncingLinkedX(false);
        }
      }
    };

    void syncLinkedX();

    return () => {
      isCancelled = true;
    };
  }, [
    isSyncingLinkedX,
    linkedXAccount?.displayName,
    linkedXAccount?.profilePictureUrl,
    linkedXAccount?.subject,
    linkedXAccount?.username,
    profile?.id,
    queryClient,
    socialAccountsQuery.data,
    socialAccountsQuery.isLoading
  ]);

  useEffect(() => {
    if (
      !profile?.id ||
      !linkedInstagramAccount?.username ||
      socialAccountsQuery.isLoading ||
      isSyncingLinkedInstagram
    ) {
      return;
    }

    const alreadyLinked = (socialAccountsQuery.data || []).some(
      (account) =>
        account.provider === "instagram" &&
        (account.providerUserId === linkedInstagramAccount.subject ||
          account.handle === linkedInstagramAccount.username)
    );

    if (alreadyLinked) {
      return;
    }

    let isCancelled = false;

    const syncLinkedInstagram = async () => {
      try {
        setIsSyncingLinkedInstagram(true);

        await syncProfileSocialAccount({
          avatarUrl: linkedInstagramAccount.profilePictureUrl,
          displayName: linkedInstagramAccount.displayName,
          handle: linkedInstagramAccount.username || "",
          profileId: profile.id,
          profileUrl: linkedInstagramAccount.username
            ? `https://instagram.com/${linkedInstagramAccount.username}`
            : null,
          provider: "instagram",
          providerUserId: linkedInstagramAccount.subject
        });

        await queryClient.invalidateQueries({
          queryKey: [EVERY1_PROFILE_SOCIAL_ACCOUNTS_QUERY_KEY, profile.id]
        });
      } catch (error) {
        console.error(error);
      } finally {
        if (!isCancelled) {
          setIsSyncingLinkedInstagram(false);
        }
      }
    };

    void syncLinkedInstagram();

    return () => {
      isCancelled = true;
    };
  }, [
    isSyncingLinkedInstagram,
    linkedInstagramAccount?.displayName,
    linkedInstagramAccount?.profilePictureUrl,
    linkedInstagramAccount?.subject,
    linkedInstagramAccount?.username,
    profile?.id,
    queryClient,
    socialAccountsQuery.data,
    socialAccountsQuery.isLoading
  ]);

  if (!currentAccount) {
    return <NotLoggedIn />;
  }

  if (!profile?.id) {
    return (
      <PageLayout title="Official profile">
        <Card>
          <div className="hidden md:block">
            <CardHeader
              icon={<BackButton path="/settings" />}
              title="Claim Official Profile"
            />
          </div>
          <div className="p-5 text-gray-600 text-sm dark:text-gray-300">
            Your Every1 profile is still syncing. Refresh this page in a moment.
          </div>
        </Card>
      </PageLayout>
    );
  }

  const handleCopyCode = async () => {
    if (!activeProofCopy) {
      return;
    }

    try {
      await navigator.clipboard.writeText(activeProofCopy);
      toast.success("Verification copy copied");
    } catch {
      toast.error("Could not copy the verification text");
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    if (provider === "x" && !linkedXAccount?.username) {
      toast.error("Link your X account first");
      return;
    }

    if (provider === "instagram" && !linkedInstagramAccount?.username) {
      toast.error("Link your Instagram account first");
      return;
    }

    const nextHandle =
      provider === "x"
        ? linkedXAccount?.username || claimedHandle
        : provider === "instagram"
          ? linkedInstagramAccount?.username || claimedHandle
          : claimedHandle.trim();

    try {
      setIsSubmitting(true);

      const result = await submitProfileVerificationRequest({
        category,
        claimedHandle: nextHandle,
        note,
        profileId: profile.id,
        provider
      });

      const nextProfile = {
        ...profile,
        verificationCategory: result.category || category,
        verificationStatus: "pending" as const
      };

      setProfile(nextProfile);

      if (currentAccount) {
        setCurrentAccount(
          mergeEvery1ProfileIntoAccount(currentAccount, nextProfile)
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [EVERY1_PROFILE_QUERY_KEY]
        }),
        queryClient.invalidateQueries({
          queryKey: [EVERY1_PROFILE_VERIFICATION_REQUESTS_QUERY_KEY, profile.id]
        }),
        queryClient.invalidateQueries({
          queryKey: [EVERY1_PROFILE_SOCIAL_ACCOUNTS_QUERY_KEY, profile.id]
        })
      ]);

      if (provider !== "x" && provider !== "instagram") {
        setClaimedHandle("");
      }

      setNote("");
      setProofPostUrl("");
      setProofPostText("");
      toast.success(
        provider === "x"
          ? "Official request created. Post the EV1 code on X next."
          : provider === "instagram"
            ? "Official request created. Submit your Instagram proof next."
            : "Official creator request submitted"
      );
    } catch (error) {
      errorToast(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyXProof = async () => {
    if (
      !profile?.id ||
      !latestXRequest?.id ||
      !linkedXAccount?.username ||
      !proofPostUrl.trim()
    ) {
      return;
    }

    try {
      setIsVerifying(true);

      const result = await verifyXProfileVerificationProof({
        linkedDisplayName: linkedXAccount.displayName,
        linkedHandle: linkedXAccount.username,
        linkedProfileImageUrl: linkedXAccount.profilePictureUrl,
        linkedSubject: linkedXAccount.subject,
        postUrl: proofPostUrl.trim(),
        profileId: profile.id,
        requestId: latestXRequest.id
      });

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [EVERY1_PROFILE_QUERY_KEY]
        }),
        queryClient.invalidateQueries({
          queryKey: [EVERY1_PROFILE_VERIFICATION_REQUESTS_QUERY_KEY, profile.id]
        }),
        queryClient.invalidateQueries({
          queryKey: [EVERY1_PROFILE_SOCIAL_ACCOUNTS_QUERY_KEY, profile.id]
        })
      ]);

      if (result.status === "verified") {
        const nextProfile = {
          ...profile,
          verificationCategory:
            latestXRequest.category || profile.verificationCategory,
          verificationStatus: "verified" as const,
          verifiedAt: result.proofVerifiedAt || new Date().toISOString()
        };

        setProfile(nextProfile);

        if (currentAccount) {
          setCurrentAccount(
            mergeEvery1ProfileIntoAccount(currentAccount, nextProfile)
          );
        }

        toast.success("Official creator badge approved");
      } else {
        toast.success("Proof checked");
      }
    } catch (error) {
      errorToast(error);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmitInstagramProof = async () => {
    if (
      !profile?.id ||
      !latestInstagramRequest?.id ||
      !linkedInstagramAccount?.username
    ) {
      return;
    }

    if (!proofPostUrl.trim() && !proofPostText.trim()) {
      toast.error("Add an Instagram proof URL or note first");
      return;
    }

    try {
      setIsVerifying(true);

      await submitProfileVerificationProofEvidence({
        avatarUrl: linkedInstagramAccount.profilePictureUrl,
        displayName: linkedInstagramAccount.displayName,
        postText: proofPostText,
        postUrl: proofPostUrl,
        profileUrl: linkedInstagramAccount.username
          ? `https://instagram.com/${linkedInstagramAccount.username}`
          : null,
        proofHandle: linkedInstagramAccount.username,
        providerUserId: linkedInstagramAccount.subject,
        requestId: latestInstagramRequest.id
      });

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: [EVERY1_PROFILE_QUERY_KEY]
        }),
        queryClient.invalidateQueries({
          queryKey: [EVERY1_PROFILE_VERIFICATION_REQUESTS_QUERY_KEY, profile.id]
        }),
        queryClient.invalidateQueries({
          queryKey: [EVERY1_PROFILE_SOCIAL_ACCOUNTS_QUERY_KEY, profile.id]
        })
      ]);

      toast.success("Instagram proof submitted for review");
    } catch (error) {
      errorToast(error);
    } finally {
      setIsVerifying(false);
    }
  };

  const renderXVerificationFlow = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/70">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-gray-950 text-sm dark:text-gray-50">
              Linked X account
            </p>
            <p className="mt-1 text-gray-500 text-xs leading-5 dark:text-gray-400">
              {linkedXAccountLabel
                ? `We use your linked X handle ${linkedXAccountLabel} as the proof source for automatic verification.`
                : "Link your X account first so EV1 can verify the post you publish with your proof code."}
            </p>
          </div>
          {linkedXAccountLabel ? (
            <Badge className="border-transparent bg-black px-2.5 py-1 text-white shadow-none dark:bg-white dark:text-black">
              {linkedXAccountLabel}
            </Badge>
          ) : (
            <Button onClick={() => linkTwitter()} outline>
              <LinkIcon className="size-4" />
              Link X
            </Button>
          )}
        </div>

        {verificationConfigQuery.data && !xVerificationEnabled ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-700 text-xs dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-300">
            X verification is not configured on this server yet. You can still
            submit the request, but automatic proof checks are currently off.
          </p>
        ) : null}

        {isSyncingLinkedX ? (
          <p className="mt-3 text-gray-500 text-xs dark:text-gray-400">
            Syncing linked X account...
          </p>
        ) : null}
      </div>

      <Input
        disabled
        label="Claimed X handle"
        onChange={(event) => setClaimedHandle(event.target.value)}
        placeholder="@janedoe"
        type="text"
        value={linkedXAccount?.username || claimedHandle}
      />
      <Input
        label="Creator category"
        onChange={(event) => setCategory(event.target.value)}
        placeholder="Artist, Athlete, Podcaster..."
        type="text"
        value={category}
      />
      <TextArea
        label="Review note"
        onChange={(event) => setNote(event.target.value)}
        placeholder="Add context that helps the EV1 team understand why this should become the official profile."
        rows={3}
        value={note}
      />
      <Button
        className="w-full justify-center sm:w-auto"
        disabled={!canSubmit}
        loading={isSubmitting}
        onClick={handleSubmit}
      >
        Submit official claim
      </Button>

      {latestXRequest ? (
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-950 text-sm dark:text-gray-50">
                Step 2: Post your EV1 proof on X
              </p>
              <p className="mt-1 text-gray-500 text-xs dark:text-gray-400">
                Publish the exact text below from your linked X account, then
                paste the post URL here.
              </p>
            </div>
            <ProofStatusChip status={latestXRequest.proofStatus} />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-black/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-gray-950 text-sm dark:text-gray-50">
                Verification post copy
              </p>
              <Button onClick={handleCopyCode} outline size="sm">
                <ClipboardDocumentIcon className="size-4" />
                Copy
              </Button>
            </div>
            <p className="mt-2 font-semibold text-gray-950 text-sm dark:text-gray-50">
              {xProofCopy}
            </p>
          </div>

          <Input
            label="X post URL"
            onChange={(event) => setProofPostUrl(event.target.value)}
            placeholder="https://x.com/yourhandle/status/123456789..."
            type="url"
            value={proofPostUrl}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={
                isVerifying ||
                !proofPostUrl.trim() ||
                !linkedXAccount?.username ||
                !xVerificationEnabled
              }
              loading={isVerifying}
              onClick={handleVerifyXProof}
            >
              Verify X post
            </Button>
            {latestXRequest.proofPostUrl ? (
              <a
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-2 font-semibold text-gray-700 text-xs dark:border-gray-800 dark:text-gray-300"
                href={latestXRequest.proofPostUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open checked post
                <ArrowTopRightOnSquareIcon className="size-3.5" />
              </a>
            ) : null}
          </div>

          {latestXRequest.proofError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-xs leading-5 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
              {latestXRequest.proofError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const renderInstagramVerificationFlow = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/70">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-gray-950 text-sm dark:text-gray-50">
              Linked Instagram account
            </p>
            <p className="mt-1 text-gray-500 text-xs leading-5 dark:text-gray-400">
              {linkedInstagramAccountLabel
                ? `We use your linked Instagram handle ${linkedInstagramAccountLabel} as the claimed account for manual official verification.`
                : "Link your Instagram creator or business account first so EV1 can review your proof."}
            </p>
          </div>
          {linkedInstagramAccountLabel ? (
            <Badge className="border-transparent bg-black px-2.5 py-1 text-white shadow-none dark:bg-white dark:text-black">
              {linkedInstagramAccountLabel}
            </Badge>
          ) : (
            <Button onClick={() => linkInstagram()} outline>
              <LinkIcon className="size-4" />
              Link Instagram
            </Button>
          )}
        </div>

        <p className="mt-3 rounded-xl border border-gray-200 bg-white px-3 py-2 text-gray-600 text-xs leading-5 dark:border-gray-800 dark:bg-black/40 dark:text-gray-300">
          Add the EV1 verification code to your Instagram bio or a public post
          caption, then paste the public profile or post URL below.
        </p>

        {isSyncingLinkedInstagram ? (
          <p className="mt-3 text-gray-500 text-xs dark:text-gray-400">
            Syncing linked Instagram account...
          </p>
        ) : null}
      </div>

      <Input
        disabled
        label="Claimed Instagram handle"
        onChange={(event) => setClaimedHandle(event.target.value)}
        placeholder="@janedoe"
        type="text"
        value={linkedInstagramAccount?.username || claimedHandle}
      />
      <Input
        label="Creator category"
        onChange={(event) => setCategory(event.target.value)}
        placeholder="Artist, Athlete, Podcaster..."
        type="text"
        value={category}
      />
      <TextArea
        label="Review note"
        onChange={(event) => setNote(event.target.value)}
        placeholder="Add context that helps the EV1 team understand why this should become the official profile."
        rows={3}
        value={note}
      />
      <Button
        className="w-full justify-center sm:w-auto"
        disabled={!canSubmit}
        loading={isSubmitting}
        onClick={handleSubmit}
      >
        Submit official claim
      </Button>

      {latestInstagramRequest ? (
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/70">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-950 text-sm dark:text-gray-50">
                Step 2: Submit your Instagram proof
              </p>
              <p className="mt-1 text-gray-500 text-xs dark:text-gray-400">
                Put the exact EV1 code in your bio or a public post, then send
                that proof in for review.
              </p>
            </div>
            <ProofStatusChip status={latestInstagramRequest.proofStatus} />
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-black/40">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-gray-950 text-sm dark:text-gray-50">
                Verification proof code
              </p>
              <Button onClick={handleCopyCode} outline size="sm">
                <ClipboardDocumentIcon className="size-4" />
                Copy
              </Button>
            </div>
            <p className="mt-2 font-semibold text-gray-950 text-sm dark:text-gray-50">
              {instagramProofCopy}
            </p>
          </div>

          <Input
            label="Instagram proof URL"
            onChange={(event) => setProofPostUrl(event.target.value)}
            placeholder="https://instagram.com/p/... or https://instagram.com/yourhandle"
            type="url"
            value={proofPostUrl}
          />
          <TextArea
            label="Where should the admin look?"
            onChange={(event) => setProofPostText(event.target.value)}
            placeholder="Example: the code is in my bio, or in the caption of the linked post."
            rows={3}
            value={proofPostText}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              disabled={
                isVerifying ||
                (!proofPostUrl.trim() && !proofPostText.trim()) ||
                !linkedInstagramAccount?.username
              }
              loading={isVerifying}
              onClick={handleSubmitInstagramProof}
            >
              <CameraIcon className="size-4" />
              Submit Instagram proof
            </Button>
            {latestInstagramRequest.proofPostUrl ? (
              <a
                className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-2 font-semibold text-gray-700 text-xs dark:border-gray-800 dark:text-gray-300"
                href={latestInstagramRequest.proofPostUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open submitted proof
                <ArrowTopRightOnSquareIcon className="size-3.5" />
              </a>
            ) : null}
          </div>

          {latestInstagramRequest.proofError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-xs leading-5 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
              {latestInstagramRequest.proofError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  return (
    <PageLayout title="Official profile">
      <div className="space-y-4">
        <Card>
          <div className="hidden md:block">
            <CardHeader
              icon={<BackButton path="/settings" />}
              title="Claim Official Profile"
            />
          </div>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-base text-gray-950 dark:text-gray-50">
                  Verification status
                </p>
                <p className="mt-1 text-gray-500 text-xs dark:text-gray-400">
                  {instructionText}
                </p>
              </div>
              <VerificationStatusChip
                status={profile.verificationStatus || "unverified"}
              />
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/70">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-black p-2 text-white dark:bg-white dark:text-black">
                  <ShieldCheckIcon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-950 text-sm dark:text-gray-50">
                    {profile.displayName || profile.username || "Your profile"}
                  </p>
                  <p className="mt-1 text-gray-600 text-xs leading-5 dark:text-gray-300">
                    EV1 treats official creator identity as wallet plus social
                    proof. Instagram proof review is live first, and other
                    platforms can still be submitted for manual review.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {profile.verificationCategory ? (
                      <Badge className="border-transparent bg-gray-900 px-2.5 py-1 text-white shadow-none dark:bg-white dark:text-black">
                        {profile.verificationCategory}
                      </Badge>
                    ) : null}
                    {activeProviderRequest ? (
                      <ProofStatusChip
                        status={activeProviderRequest.proofStatus}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {(socialAccountsQuery.data || []).length ? (
              <div className="space-y-2">
                <p className="font-semibold text-gray-950 text-sm dark:text-gray-50">
                  Linked social accounts
                </p>
                <div className="space-y-2">
                  {(socialAccountsQuery.data || []).map((account) => (
                    <SocialAccountChip account={account} key={account.id} />
                  ))}
                </div>
              </div>
            ) : null}

            {isAlreadyOfficial ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700 text-sm dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300">
                This profile already carries the official creator badge.
              </div>
            ) : (
              <div className="space-y-4">
                <Select
                  defaultValue={provider}
                  onChange={(value) => setProvider(value)}
                  options={providerOptions.map((option) => ({
                    label: option.label,
                    selected: option.value === provider,
                    value: option.value
                  }))}
                />

                {provider === "instagram" ? (
                  renderInstagramVerificationFlow()
                ) : provider === "x" ? (
                  renderXVerificationFlow()
                ) : (
                  <div className="space-y-4">
                    <Input
                      label="Claimed social handle"
                      onChange={(event) => setClaimedHandle(event.target.value)}
                      placeholder="@janedoe"
                      type="text"
                      value={claimedHandle}
                    />
                    <Input
                      label="Creator category"
                      onChange={(event) => setCategory(event.target.value)}
                      placeholder="Artist, Athlete, Podcaster..."
                      type="text"
                      value={category}
                    />
                    <TextArea
                      label="Review note"
                      onChange={(event) => setNote(event.target.value)}
                      placeholder="Add context that helps the admin team validate this official profile request."
                      rows={3}
                      value={note}
                    />
                    <Button
                      className="w-full justify-center sm:w-auto"
                      disabled={!canSubmit}
                      loading={isSubmitting}
                      onClick={handleSubmit}
                    >
                      Submit official claim
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="border-gray-200 border-b px-5 py-4 dark:border-gray-800">
            <h3 className="font-semibold text-base text-gray-950 dark:text-gray-50">
              Verification requests
            </h3>
            <p className="mt-1 text-gray-500 text-xs dark:text-gray-400">
              Current and recent official creator requests tied to this profile.
            </p>
          </div>

          {requestsQuery.isLoading ? (
            <div className="p-5 text-gray-500 text-sm dark:text-gray-400">
              Loading requests...
            </div>
          ) : requestsQuery.error ? (
            <div className="p-4">
              <ErrorMessage
                error={requestsQuery.error}
                title="Failed to load verification requests"
              />
            </div>
          ) : requestsQuery.data?.length ? (
            <div className="divide-y divide-gray-200 dark:divide-gray-800">
              {requestsQuery.data.map((request) => (
                <div className="space-y-3 px-5 py-4" key={request.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CheckBadgeIcon className="size-4 text-gray-500 dark:text-gray-400" />
                      <span className="font-semibold text-gray-950 text-sm dark:text-gray-50">
                        {request.provider === "x"
                          ? "X"
                          : request.provider.charAt(0).toUpperCase() +
                            request.provider.slice(1)}
                      </span>
                      <span className="text-gray-500 text-xs dark:text-gray-400">
                        @{request.claimedHandle}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ProofStatusChip status={request.proofStatus} />
                      <VerificationStatusChip status={request.status} />
                    </div>
                  </div>

                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/80">
                      <p className="text-gray-500 dark:text-gray-400">
                        Verification code
                      </p>
                      <p className="mt-1 font-semibold text-gray-950 dark:text-gray-50">
                        {request.verificationCode}
                      </p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-gray-900/80">
                      <p className="text-gray-500 dark:text-gray-400">
                        Submitted
                      </p>
                      <p className="mt-1 font-semibold text-gray-950 dark:text-gray-50">
                        {new Date(request.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {request.proofPostUrl ? (
                    <a
                      className="inline-flex items-center gap-1 text-gray-600 text-xs hover:text-gray-950 dark:text-gray-300 dark:hover:text-white"
                      href={request.proofPostUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open proof post
                      <ArrowTopRightOnSquareIcon className="size-3.5" />
                    </a>
                  ) : null}

                  {request.note ? (
                    <p className="text-gray-600 text-xs leading-5 dark:text-gray-300">
                      {request.note}
                    </p>
                  ) : null}

                  {request.proofError ? (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-700 text-xs leading-5 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-300">
                      {request.proofError}
                    </p>
                  ) : null}

                  {request.adminNote ? (
                    <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-gray-600 text-xs leading-5 dark:border-gray-800 dark:bg-gray-900/80 dark:text-gray-300">
                      Admin note: {request.adminNote}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5 text-gray-500 text-sm dark:text-gray-400">
              No verification requests yet.
            </div>
          )}
        </Card>
      </div>
    </PageLayout>
  );
};

export default VerificationSettings;
