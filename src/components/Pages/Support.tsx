import {
  EnvelopeIcon,
  QuestionMarkCircleIcon
} from "@heroicons/react/24/outline";
import { memo } from "react";
import { Link } from "react-router";
import PageLayout from "@/components/Shared/PageLayout";
import { Card, CardHeader } from "@/components/Shared/UI";

const SUPPORT_EMAIL = "bloombetgaming@gmail.com";

const Support = () => {
  return (
    <PageLayout
      description="Get help with your Every1 wallet, creator coins, FanDrops, communities, collaborations, and profile support."
      title="Support"
    >
      <div className="space-y-4">
        <Card>
          <CardHeader
            icon={<EnvelopeIcon className="size-5" />}
            title="Support"
          />
          <div className="space-y-4 p-5">
            <p className="text-gray-600 text-sm leading-6 dark:text-gray-300">
              Need help with deposits, withdrawals, trading creator coins,
              launching a coin, FanDrops, communities, collaboration invites, or
              account access? Email us at{" "}
              <Link className="font-medium" to={`mailto:${SUPPORT_EMAIL}`}>
                {SUPPORT_EMAIL}
              </Link>{" "}
              and include your username, wallet address, and a short summary of
              the issue so we can help faster.
            </p>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/70">
                <p className="font-semibold text-gray-950 dark:text-gray-50">
                  Best for
                </p>
                <p className="mt-2 text-gray-600 text-xs leading-5 dark:text-gray-300">
                  Wallet funding, bank withdrawals, creator coin trades, coin
                  creation issues, profile recovery, verification, and payment
                  support.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/70">
                <p className="font-semibold text-gray-950 dark:text-gray-50">
                  Legal and copyright
                </p>
                <p className="mt-2 text-gray-600 text-xs leading-5 dark:text-gray-300">
                  Send legal, copyright, or urgent trust and safety issues to{" "}
                  <Link className="font-medium" to={`mailto:${SUPPORT_EMAIL}`}>
                    {SUPPORT_EMAIL}
                  </Link>{" "}
                  and use a clear subject line like "Copyright" or "Legal".
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            icon={<QuestionMarkCircleIcon className="size-5" />}
            title="Help Links"
          />
          <div className="flex flex-col gap-2 p-5 text-sm">
            <Link to="/faq">FAQ</Link>
            <Link to="/guidelines">Community Guidelines</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/privacy">Every1 Privacy Policy</Link>
            <Link to="/copyright">Copyright Policy</Link>
          </div>
        </Card>
      </div>
    </PageLayout>
  );
};

export default memo(Support);
