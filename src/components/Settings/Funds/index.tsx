import NotLoggedIn from "@/components/Shared/NotLoggedIn";
import PageLayout from "@/components/Shared/PageLayout";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import Balances from "./Balances";

const FundsSettings = () => {
  const { currentAccount } = useAccountStore();

  if (!currentAccount) {
    return <NotLoggedIn />;
  }

  return (
    <PageLayout
      description="Manage deposits, cash out, swaps, and wallet balances."
      title="Wallet"
      zeroTopMargin
    >
      <Balances />
    </PageLayout>
  );
};

export default FundsSettings;
