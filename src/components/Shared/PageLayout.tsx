import type { ReactNode } from "react";
import { memo } from "react";
import MetaTags, { type MetaTagsProps } from "@/components/Common/MetaTags";
import SignupButton from "@/components/Shared/Navbar/SignupButton";
import cn from "@/helpers/cn";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import LoginButton from "./LoginButton";
import Search from "./Search";
import Sidebar from "./Sidebar";

interface AuthButtonsProps {
  className?: string;
}

const AuthButtons = ({ className }: AuthButtonsProps) => {
  const { currentAccount } = useAccountStore();

  if (currentAccount) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-x-2", className)}>
      <SignupButton className="w-full" />
      <LoginButton className="w-full" />
    </div>
  );
};

interface PageLayoutProps {
  title?: string;
  description?: string;
  image?: MetaTagsProps["image"];
  children: ReactNode;
  sidebar?: ReactNode;
  desktopSidebarClassName?: string;
  hideDesktopSidebar?: boolean;
  hideSearch?: boolean;
  mobileFullscreen?: boolean;
  preferDrawerSearch?: boolean;
  type?: MetaTagsProps["type"];
  url?: MetaTagsProps["url"];
  zeroTopMargin?: boolean;
}

const PageLayout = ({
  title,
  children,
  description,
  image,
  sidebar = <Sidebar />,
  desktopSidebarClassName,
  hideDesktopSidebar = false,
  hideSearch = false,
  mobileFullscreen = false,
  preferDrawerSearch = false,
  type,
  url,
  zeroTopMargin = false
}: PageLayoutProps) => {
  return (
    <>
      <MetaTags
        description={description}
        image={image}
        title={title}
        type={type}
        url={url}
      />
      <div
        className={cn("w-full min-w-0 flex-1", {
          "mt-0 mb-0 space-y-0 md:mt-5 md:mb-5 md:space-y-5": mobileFullscreen,
          "mt-0 mb-16 space-y-5 md:mt-5 md:mb-5":
            !mobileFullscreen && zeroTopMargin,
          "mt-5 mb-16 space-y-5 md:mb-5": !mobileFullscreen && !zeroTopMargin
        })}
      >
        <AuthButtons
          className={cn(
            { "mt-5": zeroTopMargin },
            "hidden w-full md:ml-auto md:flex md:w-[22.5rem] md:px-0 lg:hidden"
          )}
        />
        {children}
      </div>
      {hideDesktopSidebar ? null : (
        <aside
          className={cn(
            "no-scrollbar sticky top-5 mt-5 hidden max-h-screen w-[22.5rem] shrink-0 flex-col gap-y-5 overflow-y-auto lg:flex",
            desktopSidebarClassName
          )}
        >
          <AuthButtons />
          {!hideSearch && !preferDrawerSearch ? <Search /> : null}
          {sidebar}
        </aside>
      )}
    </>
  );
};

export default memo(PageLayout);
