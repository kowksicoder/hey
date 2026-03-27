import { useEffect, useState } from "react";
import {
  DESKTOP_SIDEBAR_CHANGE_EVENT,
  DESKTOP_SIDEBAR_STATE_KEY,
  getDesktopSidebarCollapsed
} from "@/helpers/desktopSidebar";

const useDesktopSidebarCollapsed = () => {
  const [collapsed, setCollapsed] = useState(getDesktopSidebarCollapsed);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleSidebarChange = (event: Event) => {
      const nextCollapsed = (event as CustomEvent<{ collapsed?: boolean }>)
        .detail?.collapsed;

      setCollapsed(
        typeof nextCollapsed === "boolean"
          ? nextCollapsed
          : getDesktopSidebarCollapsed()
      );
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== DESKTOP_SIDEBAR_STATE_KEY) {
        return;
      }

      setCollapsed(getDesktopSidebarCollapsed());
    };

    window.addEventListener(
      DESKTOP_SIDEBAR_CHANGE_EVENT,
      handleSidebarChange as EventListener
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        DESKTOP_SIDEBAR_CHANGE_EVENT,
        handleSidebarChange as EventListener
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return collapsed;
};

export default useDesktopSidebarCollapsed;
