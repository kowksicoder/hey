import {
  ArrowRightIcon,
  CreditCardIcon,
  PaintBrushIcon,
  QuestionMarkCircleIcon,
  ShieldCheckIcon
} from "@heroicons/react/24/outline";
import { Link } from "react-router";
import SingleAccount from "@/components/Shared/Account/SingleAccount";
import BackButton from "@/components/Shared/BackButton";
import NotLoggedIn from "@/components/Shared/NotLoggedIn";
import PageLayout from "@/components/Shared/PageLayout";
import { Card, CardHeader } from "@/components/Shared/UI";
import type { AccountFragment } from "@/indexer/generated";
import { useAccountStore } from "@/store/persisted/useAccountStore";

const AccountSettings = () => {
  const { currentAccount } = useAccountStore();

  if (!currentAccount) {
    return <NotLoggedIn />;
  }

  const settingsPages = [
    {
      icon: <PaintBrushIcon className="size-5" />,
      title: "Personalize",
      url: "/settings/personalize"
    },
    {
      icon: <CreditCardIcon className="size-5" />,
      title: "Wallet",
      url: "/wallet"
    },
    {
      icon: <ShieldCheckIcon className="size-5" />,
      title: "Official profile",
      url: "/settings/verification"
    },
    {
      icon: <QuestionMarkCircleIcon className="size-5" />,
      title: "FAQ",
      url: "/settings/faq"
    }
  ];

  return (
    <PageLayout title="Settings">
      <Card>
        <div className="hidden md:block">
          <CardHeader icon={<BackButton path="/" />} title="Settings" />
        </div>
        <div className="p-5">
          <SingleAccount
            account={currentAccount as AccountFragment}
            isBig
            showUserPreview={false}
          />
        </div>
        <div className="divider" />
        <div className="py-3">
          {settingsPages.map((page) => (
            <Link
              className="flex items-center justify-between px-5 py-3 hover:bg-gray-100 dark:hover:bg-gray-800"
              key={page.url}
              to={page.url}
            >
              <div className="flex items-center space-x-2">
                {page.icon}
                <div>{page.title}</div>
              </div>
              <ArrowRightIcon className="size-4" />
            </Link>
          ))}
        </div>
      </Card>
    </PageLayout>
  );
};

export default AccountSettings;
