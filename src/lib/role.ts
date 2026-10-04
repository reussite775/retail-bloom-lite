import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { membershipQuery } from "./data";

export function useRole() {
  const { session } = useAuth();
  const uid = session?.user.id ?? "";
  const q = useQuery({ ...membershipQuery(uid), enabled: !!uid });
  return { shopId: q.data?.shopId ?? uid, isAdmin: q.data?.isAdmin ?? false, loading: q.isLoading };
}
