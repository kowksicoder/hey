import { Navigate } from "react-router";
import { useAccountStore } from "@/store/persisted/useAccountStore";

const Missions = () => {
  const { currentAccount } = useAccountStore();

  if (!currentAccount) {
    return <Navigate replace to="/fandrop" />;
  }

  return <Navigate replace to="/fandrop" />;
};

export default Missions;
