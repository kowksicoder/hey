import {
  BrowserRouter,
  Navigate,
  Route,
  Routes as RouterRoutes
} from "react-router";
import ViewAccount from "@/components/Account";
import Bookmarks from "@/components/Bookmarks";
import Coin from "@/components/Coin";
import Layout from "@/components/Common/Layout";
import Create from "@/components/Create";
import Creators from "@/components/Creators";
import ENS from "@/components/ENS";
import ViewGroup from "@/components/Group";
import GroupSettings from "@/components/Group/Settings";
import { default as GroupMonetizeSettings } from "@/components/Group/Settings/Monetize";
import { default as GroupPersonalizeSettings } from "@/components/Group/Settings/Personalize";
import RulesSettings from "@/components/Group/Settings/Rules";
import Groups from "@/components/Groups";
import Home from "@/components/Home";
import Leaderboard from "@/components/Leaderboard";
import Missions from "@/components/Missions";
import Notification from "@/components/Notification";
import Copyright from "@/components/Pages/Copyright";
import Guidelines from "@/components/Pages/Guidelines";
import Privacy from "@/components/Pages/Privacy";
import Support from "@/components/Pages/Support";
import Terms from "@/components/Pages/Terms";
import ViewPost from "@/components/Post";
import Referrals from "@/components/Referrals";
import Search from "@/components/Search";
import AccountSettings from "@/components/Settings";
import BlockedSettings from "@/components/Settings/Blocked";
import CreatorCoinSettings from "@/components/Settings/CreatorCoin";
import DeveloperSettings from "@/components/Settings/Developer";
import FundsSettings from "@/components/Settings/Funds";
import ManagerSettings from "@/components/Settings/Manager";
import { default as AccountMonetizeSettings } from "@/components/Settings/Monetize";
import { default as AccountPersonalizeSettings } from "@/components/Settings/Personalize";
import ProSettings from "@/components/Settings/Pro";
import SessionsSettings from "@/components/Settings/Sessions";
import UsernameSettings from "@/components/Settings/Username";
import VerificationSettings from "@/components/Settings/Verification";
import Custom404 from "@/components/Shared/404";
import Showcase from "@/components/Showcase";
import ShowcaseDetail from "@/components/Showcase/Detail";
import Streaks from "@/components/Streaks";
import Swap from "@/components/Swap";
import FanDrop from "@/components/FanDrop";
import FanDropDetail from "@/components/FanDrop/Detail";
import RewardsSettings from "./components/Settings/Rewards";
import Staff from "./components/Staff";

const Routes = () => {
  return (
    <BrowserRouter>
      <RouterRoutes>
        <Route element={<Create />} path="/create" />
        <Route element={<Layout />} path="/">
          <Route element={<Home />} index />
          <Route element={<Navigate replace to="/" />} path="explore" />
          <Route element={<Coin />} path="coins/:address" />
          <Route element={<FundsSettings />} path="wallet" />
          <Route element={<Creators />} path="creators" />
          <Route element={<Leaderboard />} path="leaderboard" />
          <Route element={<Showcase />} path="showcase" />
          <Route element={<ShowcaseDetail />} path="showcase/:slug" />
          <Route element={<Swap />} path="swap" />
          <Route element={<Referrals />} path="referrals" />
          <Route element={<Navigate replace to="/fandrop" />} path="missions" />
          <Route element={<FanDrop />} path="fandrop" />
          <Route element={<FanDropDetail />} path="fandrop/:slug" />
          <Route element={<Streaks />} path="streaks" />
          <Route element={<Search />} path="search" />
          <Route element={<Groups />} path="groups" />
          <Route element={<Bookmarks />} path="bookmarks" />
          <Route element={<ENS />} path="ens" />
          <Route element={<Notification />} path="notifications" />
          <Route element={<ViewAccount />} path="@:username" />
          <Route element={<ViewAccount />} path="account/:address" />
          <Route element={<ViewAccount />} path="u/:username" />
          <Route path="g/:address">
            <Route element={<ViewGroup />} index />
            <Route path="settings">
              <Route element={<GroupSettings />} index />
              <Route
                element={<GroupPersonalizeSettings />}
                path="personalize"
              />
              <Route element={<GroupMonetizeSettings />} path="monetize" />
              <Route element={<RulesSettings />} path="rules" />
            </Route>
          </Route>
          <Route path="posts/:slug">
            <Route element={<ViewPost />} index />
            <Route element={<ViewPost />} path="quotes" />
          </Route>
          <Route path="settings">
            <Route element={<AccountSettings />} index />
            <Route
              element={<AccountPersonalizeSettings />}
              path="personalize"
            />
            <Route element={<AccountMonetizeSettings />} path="monetize" />
            <Route element={<CreatorCoinSettings />} path="creatorcoin" />
            <Route element={<ProSettings />} path="pro" />
            <Route element={<RewardsSettings />} path="rewards" />
            <Route element={<BlockedSettings />} path="blocked" />
            <Route element={<DeveloperSettings />} path="developer" />
            <Route element={<Navigate replace to="/wallet" />} path="funds" />
            <Route element={<ManagerSettings />} path="manager" />
            <Route element={<SessionsSettings />} path="sessions" />
            <Route element={<UsernameSettings />} path="username" />
            <Route element={<VerificationSettings />} path="verification" />
          </Route>
          <Route path="staff">
            <Route element={<Staff />} index />
          </Route>
          <Route element={<Support />} path="support" />
          <Route element={<Terms />} path="terms" />
          <Route element={<Privacy />} path="privacy" />
          <Route element={<Guidelines />} path="guidelines" />
          <Route element={<Copyright />} path="copyright" />
          <Route element={<Custom404 />} path="*" />
        </Route>
      </RouterRoutes>
    </BrowserRouter>
  );
};

export default Routes;
