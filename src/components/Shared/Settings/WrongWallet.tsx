import WalletSelector from "@/components/Shared/Auth/WalletSelector";
import { H5 } from "@/components/Shared/UI";

const WrongWallet = () => {
  return (
    <div className="space-y-2 p-5">
      <div className="space-y-3 pb-2">
        <H5>Use the wallet that owns this account</H5>
        <p>
          This account is tied to a different wallet. Connect or link the
          correct external wallet below to manage it.
        </p>
      </div>
      <WalletSelector />
    </div>
  );
};

export default WrongWallet;
