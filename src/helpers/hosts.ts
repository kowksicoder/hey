const APP_HOSTNAME = "app.every1-app.onrender.com";
const MARKETING_HOSTS = new Set([
  "every1-app.onrender.com",
  "www.every1-app.onrender.com"
]);

const isLocalHostname = (hostname: string) =>
  hostname === "localhost" || hostname === "127.0.0.1";

export const shouldServeMarketingLanding = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return MARKETING_HOSTS.has(window.location.hostname);
};

export const getAppOrigin = () => {
  if (typeof window === "undefined") {
    return `https://${APP_HOSTNAME}`;
  }

  const { origin, hostname } = window.location;

  if (isLocalHostname(hostname) || hostname === APP_HOSTNAME) {
    return origin;
  }

  return `https://${APP_HOSTNAME}`;
};

export const getAppUrl = (path = "/") => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return new URL(normalizedPath, `${getAppOrigin()}/`).toString();
};
