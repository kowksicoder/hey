import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useClickAway, useDebounce } from "@uidotdev/usehooks";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import SingleAccount from "@/components/Shared/Account/SingleAccount";
import Loader from "@/components/Shared/Loader";
import { Card, Form, Input, useZodForm } from "@/components/Shared/UI";
import getAccount from "@/helpers//getAccount";
import cn from "@/helpers/cn";
import { searchPublicEvery1Profiles } from "@/helpers/every1";
import { buildAccountFromEvery1Profile } from "@/helpers/privy";
import { hasSupabaseConfig } from "@/helpers/supabase";
import {
  type AccountFragment,
  AccountsOrderBy,
  type AccountsRequest,
  PageSize,
  useAccountsLazyQuery
} from "@/indexer/generated";
import { useAccountLinkStore } from "@/store/non-persisted/navigation/useAccountLinkStore";
import { useSearchStore } from "@/store/persisted/useSearchStore";
import RecentAccounts from "./RecentAccounts";

interface SearchProps {
  className?: string;
  dropdownClassName?: string;
  inputClassName?: string;
  placeholder?: string;
}

const ValidationSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1, { message: "Enter something to search" })
    .max(100, { message: "Query should not exceed 100 characters" })
});

const normalizeSearchType = (value?: null | string) => {
  const normalized = value?.trim().toLowerCase();

  if (!normalized) {
    return "coins";
  }

  if (normalized === "accounts") {
    return "creators";
  }

  if (normalized === "groups") {
    return "communities";
  }

  return normalized;
};

const Search = ({
  className = "",
  dropdownClassName = "",
  inputClassName = "",
  placeholder = "Search..."
}: SearchProps) => {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const q = searchParams.get("q") || "";
  const type = searchParams.get("type");
  const { setCachedAccount } = useAccountLinkStore();
  const { addAccount } = useSearchStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const [accounts, setAccounts] = useState<AccountFragment[]>([]);
  const [isSearchingProfiles, setIsSearchingProfiles] = useState(false);
  const hasConfiguredSupabase = hasSupabaseConfig();

  const form = useZodForm({
    defaultValues: { query: "" },
    schema: ValidationSchema
  });

  const query = form.watch("query");
  const debouncedSearchText = useDebounce<string>(
    query,
    pathname === "/search" ? 250 : 500
  );

  useEffect(() => {
    if (pathname !== "/search") {
      return;
    }

    if (q === form.getValues("query")) {
      return;
    }

    form.reset({ query: q });
  }, [form, pathname, q]);

  const handleReset = useCallback(() => {
    setShowDropdown(false);
    setAccounts([]);
    form.reset({ query: "" });

    if (pathname === "/search") {
      const nextType = normalizeSearchType(type);
      navigate(`/search?type=${nextType}`, { replace: true });
    }
  }, [form, navigate, pathname, type]);

  const dropdownRef = useClickAway(() => {
    handleReset();
  }) as MutableRefObject<HTMLDivElement>;

  const [searchAccounts, { loading: loadingLensAccounts }] =
    useAccountsLazyQuery();
  const loading = hasConfiguredSupabase
    ? isSearchingProfiles
    : loadingLensAccounts;

  const handleSubmit = useCallback(
    ({ query }: z.infer<typeof ValidationSchema>) => {
      const search = query.trim();
      const nextType = normalizeSearchType(type);

      umami.track("search");

      if (pathname === "/search") {
        navigate(`/search?q=${encodeURIComponent(search)}&type=${nextType}`, {
          replace: true
        });
        setShowDropdown(false);
        return;
      }

      navigate(`/search?q=${encodeURIComponent(search)}&type=coins`);
      handleReset();
    },
    [handleReset, navigate, pathname, type]
  );

  const handleShowDropdown = useCallback(() => {
    setShowDropdown(true);
  }, []);

  useEffect(() => {
    if (pathname === "/search") {
      const nextType = normalizeSearchType(type);
      const trimmedSearch = debouncedSearchText.trim();

      if (trimmedSearch === q.trim()) {
        return;
      }

      if (!trimmedSearch) {
        navigate(`/search?type=${nextType}`, { replace: true });
        return;
      }

      navigate(
        `/search?q=${encodeURIComponent(trimmedSearch)}&type=${nextType}`,
        {
          replace: true
        }
      );
      return;
    }

    if (!showDropdown) {
      return;
    }

    if (pathname !== "/search" && showDropdown && debouncedSearchText) {
      if (hasConfiguredSupabase) {
        let cancelled = false;

        setIsSearchingProfiles(true);

        void searchPublicEvery1Profiles(debouncedSearchText, 10)
          .then((profiles) => {
            if (cancelled) {
              return;
            }

            setAccounts(
              profiles.map((profile) => buildAccountFromEvery1Profile(profile))
            );
          })
          .catch(() => {
            if (!cancelled) {
              setAccounts([]);
            }
          })
          .finally(() => {
            if (!cancelled) {
              setIsSearchingProfiles(false);
            }
          });

        return () => {
          cancelled = true;
        };
      }

      const request: AccountsRequest = {
        filter: { searchBy: { localNameQuery: debouncedSearchText } },
        orderBy: AccountsOrderBy.BestMatch,
        pageSize: PageSize.Fifty
      };

      searchAccounts({ variables: { request } }).then((res) => {
        if (res.data?.accounts?.items) {
          setAccounts(res.data.accounts.items);
        }
      });
    } else if (!debouncedSearchText) {
      setAccounts([]);
      setIsSearchingProfiles(false);
    }
  }, [
    debouncedSearchText,
    hasConfiguredSupabase,
    navigate,
    pathname,
    q,
    searchAccounts,
    showDropdown,
    type
  ]);
  useEffect(() => {
    if (pathname === "/search") {
      setShowDropdown(false);
    }
  }, [pathname, q]);

  useEffect(() => {
    if (pathname === "/search") {
      setAccounts([]);
      setIsSearchingProfiles(false);
    }
  }, [pathname, debouncedSearchText]);

  return (
    <div className={cn("w-full", className)}>
      <Form form={form} onSubmit={handleSubmit}>
        <Input
          className={cn("px-3 py-3 text-sm", inputClassName)}
          iconLeft={<MagnifyingGlassIcon />}
          iconRight={
            <XMarkIcon
              className={cn("cursor-pointer", query ? "visible" : "invisible")}
              onClick={handleReset}
            />
          }
          onClick={handleShowDropdown}
          placeholder={placeholder}
          type="text"
          {...form.register("query")}
        />
      </Form>
      {pathname !== "/search" && showDropdown ? (
        <div
          className={cn("fixed z-10 mt-2 w-[360px]", dropdownClassName)}
          ref={dropdownRef}
        >
          <Card className="max-h-[80vh] overflow-y-auto py-2">
            {!debouncedSearchText && (
              <RecentAccounts onAccountClick={handleReset} />
            )}
            {loading ? (
              <Loader className="my-3" message="Searching users" small />
            ) : (
              <>
                {accounts.map((account) => (
                  <div
                    className="cursor-pointer px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-800"
                    key={account.address}
                    onClick={() => {
                      setCachedAccount(account);
                      addAccount(account.address);
                      navigate(getAccount(account).link);
                      handleReset();
                    }}
                  >
                    <SingleAccount
                      account={account}
                      hideFollowButton
                      hideUnfollowButton
                      linkToAccount={false}
                      showUserPreview={false}
                    />
                  </div>
                ))}
                {accounts.length ? null : (
                  <div className="px-4 py-2">
                    Try searching for people or keywords
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
};

export default Search;
