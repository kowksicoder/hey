import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { createCollaborationRuntime } from "./script/collaborationRuntime.mjs";
import { createFanDropRuntime } from "./script/fandropRuntime.mjs";
import { createFiatRuntime } from "./script/fiatRuntime.mjs";
import { createProfileShareRuntime } from "./script/profileShareRuntime.mjs";
import { createPushRuntime } from "./script/pushRuntime.mjs";
import { createReferralRuntime } from "./script/referralRuntime.mjs";
import { createVerificationRuntime } from "./script/verificationRuntime.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const collaborationRuntime = createCollaborationRuntime({ rootDir: __dirname });
const fanDropRuntime = createFanDropRuntime({ rootDir: __dirname });
const fiatRuntime = createFiatRuntime({ rootDir: __dirname });
const profileShareRuntime = createProfileShareRuntime({ rootDir: __dirname });
const pushRuntime = createPushRuntime({ rootDir: __dirname });
const referralRuntime = createReferralRuntime({ rootDir: __dirname });
const verificationRuntime = createVerificationRuntime({ rootDir: __dirname });

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    react(),
    tailwindcss(),
    {
      configureServer(server) {
        collaborationRuntime.start();
        fanDropRuntime.start();
        fiatRuntime.start();
        pushRuntime.start();
        referralRuntime.start();
        verificationRuntime.start();
        server.middlewares.use(async (request, response, next) => {
          const collaborationHandled =
            await collaborationRuntime.handleApiRequest(request, response);

          if (collaborationHandled) {
            return;
          }

          const fanDropHandled = await fanDropRuntime.handleApiRequest(
            request,
            response
          );

          if (fanDropHandled) {
            return;
          }

          const fiatHandled = await fiatRuntime.handleApiRequest(
            request,
            response
          );

          if (fiatHandled) {
            return;
          }

          const profileShareHandled = await profileShareRuntime.handleRequest(
            request,
            response
          );

          if (profileShareHandled) {
            return;
          }

          const referralHandled = await referralRuntime.handleApiRequest(
            request,
            response
          );

          if (referralHandled) {
            return;
          }

          const handled = await pushRuntime.handleApiRequest(request, response);

          if (handled) {
            return;
          }

          const verificationHandled =
            await verificationRuntime.handleApiRequest(request, response);

          if (verificationHandled) {
            return;
          }

          next();
        });
      },
      name: "every1-browser-push"
    }
  ],
  preview: { allowedHosts: true }
});
