import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import AvatarUpload from "@/components/Shared/AvatarUpload";
import BackButton from "@/components/Shared/BackButton";
import CoverUpload from "@/components/Shared/CoverUpload";
import {
  Button,
  Card,
  CardHeader,
  Form,
  Input,
  TextArea,
  useZodForm
} from "@/components/Shared/UI";
import { ERRORS } from "@/data/errors";
import errorToast from "@/helpers/errorToast";
import { upsertEvery1Profile } from "@/helpers/every1";
import { mergeEvery1ProfileIntoAccount } from "@/helpers/privy";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import { useEvery1Store } from "@/store/persisted/useEvery1Store";

const ValidationSchema = z.object({
  bio: z.string().max(260, { message: "Bio should not exceed 260 characters" }),
  name: z
    .string()
    .max(100, { message: "Name should not exceed 100 characters" })
});

const PersonalizeSettingsForm = () => {
  const { currentAccount, setCurrentAccount } = useAccountStore();
  const { setProfile } = useEvery1Store();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(
    currentAccount?.metadata?.picture
  );
  const [coverUrl, setCoverUrl] = useState<string | undefined>(
    currentAccount?.metadata?.coverPicture
  );

  const form = useZodForm({
    defaultValues: {
      bio: currentAccount?.metadata?.bio || "",
      name: currentAccount?.metadata?.name || ""
    },
    schema: ValidationSchema
  });

  const updateAccount = async (
    data: z.infer<typeof ValidationSchema>,
    avatarUrl: string | undefined,
    coverUrl: string | undefined
  ) => {
    if (!currentAccount) {
      return toast.error(ERRORS.SignWallet);
    }

    try {
      setIsSubmitting(true);
      umami.track("update_profile");

      const updatedProfile = await upsertEvery1Profile({
        avatarUrl,
        bannerUrl: coverUrl,
        bio: data.bio,
        displayName: data.name,
        lensAccountAddress: currentAccount.address,
        username: currentAccount.username?.localName || null,
        walletAddress: currentAccount.owner || currentAccount.address,
        zoraHandle: currentAccount.username?.localName || null
      });

      setProfile(updatedProfile);
      setCurrentAccount(
        mergeEvery1ProfileIntoAccount(currentAccount, updatedProfile)
      );
      form.reset(
        {
          bio: updatedProfile.bio || "",
          name: updatedProfile.displayName || ""
        },
        { keepValues: false }
      );
      toast.success("Profile updated");
    } catch (error) {
      errorToast(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const onSetAvatar = async (src: string | undefined) => {
    setAvatarUrl(src);
    return await updateAccount({ ...form.getValues() }, src, coverUrl);
  };

  const onSetCover = async (src: string | undefined) => {
    setCoverUrl(src);
    return await updateAccount({ ...form.getValues() }, avatarUrl, src);
  };

  return (
    <Card>
      <div className="hidden md:block">
        <CardHeader
          icon={<BackButton path="/settings" />}
          title="Personalize"
        />
      </div>
      <Form
        className="space-y-4 p-5"
        form={form}
        onSubmit={(data) => updateAccount(data, avatarUrl, coverUrl)}
      >
        <Input
          disabled
          label="Account Address"
          type="text"
          value={currentAccount?.address}
        />
        <Input
          label="Name"
          placeholder="Gavin"
          type="text"
          {...form.register("name")}
        />
        <TextArea
          label="Bio"
          placeholder="Tell us something about you!"
          {...form.register("bio")}
        />
        <AvatarUpload setSrc={onSetAvatar} src={avatarUrl || ""} />
        <CoverUpload setSrc={onSetCover} src={coverUrl || ""} />
        <Button
          className="ml-auto"
          disabled={isSubmitting || !form.formState.isDirty}
          loading={isSubmitting}
          type="submit"
        >
          Save
        </Button>
      </Form>
    </Card>
  );
};

export default PersonalizeSettingsForm;
