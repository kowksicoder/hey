import "./font.css";
import "./styles.css";

// biome-ignore lint/style/useNodejsImportProtocol: the browser bundle needs the buffer package polyfill.
import { Buffer } from "buffer";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Providers from "@/components/Common/Providers";
import Routes from "./routes";

const analyticsGlobal = globalThis as typeof globalThis & {
  Buffer?: typeof Buffer;
  global?: typeof globalThis;
  umami?: {
    track: (event: string, data?: Record<string, unknown>) => void;
  };
};

if (typeof analyticsGlobal.Buffer === "undefined") {
  analyticsGlobal.Buffer = Buffer;
}

if (typeof analyticsGlobal.global === "undefined") {
  analyticsGlobal.global = analyticsGlobal;
}

if (typeof analyticsGlobal.umami === "undefined") {
  analyticsGlobal.umami = {
    track: () => undefined
  };
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((error) => {
        console.error("Failed to register Every1 service worker", error);
      });
  });
}

createRoot(document.getElementById("_hey_") as HTMLElement).render(
  <StrictMode>
    <Providers>
      <Routes />
    </Providers>
  </StrictMode>
);
