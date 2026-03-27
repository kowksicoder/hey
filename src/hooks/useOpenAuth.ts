import { usePrivy } from "@privy-io/react-auth";
import { useCallback } from "react";
import { toast } from "sonner";
import { hasPrivyConfig, PRIMARY_AUTH_LOGIN_METHODS } from "@/helpers/privy";

const useOpenAuth = () => {
  const { login } = usePrivy();

  return useCallback(
    async (trackingEvent?: string) => {
      if (!hasPrivyConfig()) {
        toast.error("Authentication is not configured yet");
        return;
      }

      if (trackingEvent && typeof umami !== "undefined") {
        try {
          umami.track(trackingEvent);
        } catch (error) {
          console.error("Failed to track auth event", error);
        }
      }

      try {
        await login({ loginMethods: [...PRIMARY_AUTH_LOGIN_METHODS] });
      } catch (error) {
        console.error("Failed to open auth flow", error);
        toast.error("Couldn't open sign in", {
          description: "Please try again in a moment."
        });
      }
    },
    [login]
  );
};

export default useOpenAuth;
