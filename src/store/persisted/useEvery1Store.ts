import { Localstorage } from "@/data/storage";
import { createPersistedTrackedStore } from "@/store/createTrackedStore";
import type { Every1Profile } from "@/types/every1";

interface State {
  lastToastNotificationId: null | string;
  pendingReferralCode: null | string;
  profile: Every1Profile | null;
  signupCelebrationProfileId: null | string;
  clearSignupCelebration: () => void;
  setLastToastNotificationId: (notificationId: null | string) => void;
  setPendingReferralCode: (code: null | string) => void;
  setProfile: (profile: Every1Profile | null) => void;
  setSignupCelebrationProfileId: (profileId: null | string) => void;
}

const { useStore: useEvery1Store } = createPersistedTrackedStore<State>(
  (set) => ({
    clearSignupCelebration: () =>
      set(() => ({ signupCelebrationProfileId: null })),
    lastToastNotificationId: null,
    pendingReferralCode: null,
    profile: null,
    setLastToastNotificationId: (notificationId) =>
      set(() => ({ lastToastNotificationId: notificationId })),
    setPendingReferralCode: (code) =>
      set(() => ({ pendingReferralCode: code })),
    setProfile: (profile) => set(() => ({ profile })),
    setSignupCelebrationProfileId: (profileId) =>
      set(() => ({ signupCelebrationProfileId: profileId })),
    signupCelebrationProfileId: null
  }),
  { name: Localstorage.Every1Store }
);

export { useEvery1Store };
