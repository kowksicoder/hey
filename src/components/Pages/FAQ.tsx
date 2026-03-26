import {
  QuestionMarkCircleIcon,
  SparklesIcon
} from "@heroicons/react/24/outline";
import { Link } from "react-router";
import BackButton from "@/components/Shared/BackButton";
import PageLayout from "@/components/Shared/PageLayout";
import { Card, CardHeader } from "@/components/Shared/UI";

const SUPPORT_EMAIL = "bloombetgaming@gmail.com";

const faqItems = [
  {
    answer:
      "Every1 is a creator-first platform where people can launch creator coins, trade with Naira, join communities, run FanDrops, and grow public profiles around their work.",
    question: "What is Every1?"
  },
  {
    answer:
      "Go to Create, choose the mode you want, fill in your coin details, upload your cover image, and confirm the launch from your wallet. Creator and community coins launch immediately after confirmation. Collaboration coins are proposed first, then launched after the collaborator accepts.",
    question: "How do I create a coin?"
  },
  {
    answer:
      "You can trade creator coins from the Swap page or directly from a coin’s detail page. The app now supports Naira-first trading flows as the main experience.",
    question: "Where can I trade creator coins?"
  },
  {
    answer:
      "Open Wallet to fund your Every1 Naira balance, then use that balance to buy creator coins. When you sell later, the returned value goes back into your Naira wallet balance.",
    question: "How does the Naira wallet work?"
  },
  {
    answer:
      "Yes. Open Wallet, choose Withdraw, pick your bank details, enter the amount you want to cash out, and submit the payout request.",
    question: "Can I withdraw to my bank?"
  },
  {
    answer:
      "FanDrop is a time-limited reward campaign where fans complete simple actions like joining, inviting friends, or optional buy steps to improve their rank and earn creator coin rewards.",
    question: "What is a FanDrop?"
  },
  {
    answer:
      "Community coins are for shared groups and community identity. Collaboration coins are for two or more creators launching one shared coin with agreed splits and approvals.",
    question: "What’s the difference between community and collaboration coins?"
  },
  {
    answer:
      "Right now, creators still pay normal Base gas when creating a coin because the launch is confirmed from the creator’s wallet onchain.",
    question: "Do creators pay gas to create coins?"
  },
  {
    answer: `Email ${SUPPORT_EMAIL} with your username, wallet address, and a short description of the issue. This is the best contact for wallet, trade, coin, verification, FanDrop, and account support.`,
    question: "How do I contact support?"
  }
];

const FAQ = () => {
  return (
    <PageLayout
      description="Quick answers about Every1 wallets, creator coins, trading, FanDrops, communities, and support."
      title="FAQ"
    >
      <div className="space-y-4">
        <Card>
          <CardHeader icon={<BackButton path="/settings" />} title="FAQ" />
          <div className="space-y-4 p-5">
            <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-800 dark:bg-gray-900/70">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-blue-600/10 p-2 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
                  <SparklesIcon className="size-5" />
                </div>
                <div>
                  <p className="font-semibold text-gray-950 text-sm dark:text-gray-50">
                    Quick platform guide
                  </p>
                  <p className="mt-1 text-gray-600 text-xs leading-5 dark:text-gray-300">
                    Every1 is designed to feel simple: fund your wallet, trade
                    creator coins, join communities, run FanDrops, and withdraw
                    later without needing deep crypto knowledge.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {faqItems.map((item) => (
                <details
                  className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-900/70"
                  key={item.question}
                >
                  <summary className="cursor-pointer list-none font-semibold text-gray-950 text-sm dark:text-gray-50">
                    <div className="flex items-center gap-2">
                      <QuestionMarkCircleIcon className="size-4 shrink-0 text-blue-600 dark:text-blue-300" />
                      <span>{item.question}</span>
                    </div>
                  </summary>
                  <p className="mt-3 pl-6 text-gray-600 text-xs leading-6 dark:text-gray-300">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4 text-sm dark:border-gray-800 dark:bg-gray-900/70">
              <p className="font-semibold text-gray-950 dark:text-gray-50">
                Need more help?
              </p>
              <p className="mt-2 text-gray-600 text-xs leading-5 dark:text-gray-300">
                If you need account, wallet, trade, or creator support, head to{" "}
                <Link className="font-medium" to="/support">
                  Support
                </Link>{" "}
                or email{" "}
                <Link className="font-medium" to={`mailto:${SUPPORT_EMAIL}`}>
                  {SUPPORT_EMAIL}
                </Link>
                .
              </p>
            </div>
          </div>
        </Card>
      </div>
    </PageLayout>
  );
};

export default FAQ;
