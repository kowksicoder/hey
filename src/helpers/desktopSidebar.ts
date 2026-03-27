export const DESKTOP_SIDEBAR_STATE_KEY = "every1.desktopSidebarCollapsed";
export const DESKTOP_SIDEBAR_CHANGE_EVENT = "every1:desktop-sidebar-change";

export const getDesktopSidebarCollapsed = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const savedState = window.localStorage.getItem(DESKTOP_SIDEBAR_STATE_KEY);

  if (savedState !== null) {
    return savedState === "true";
  }

  return window.innerWidth < 1320;
};

export const persistDesktopSidebarCollapsed = (collapsed: boolean) => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    DESKTOP_SIDEBAR_STATE_KEY,
    collapsed ? "true" : "false"
  );

  if (typeof document !== "undefined") {
    document.documentElement.dataset.desktopSidebar = collapsed
      ? "collapsed"
      : "expanded";
  }

  window.dispatchEvent(
    new CustomEvent(DESKTOP_SIDEBAR_CHANGE_EVENT, {
      detail: { collapsed }
    })
  );
};
