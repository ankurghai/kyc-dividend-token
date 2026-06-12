import { useReadContract } from "wagmi";
import { distributorAbi } from "../abi";
import { DISTRIBUTOR_ADDRESS, isConfigured } from "../config";

/** Zero bytes32 — DEFAULT_ADMIN_ROLE in AccessControl. */
export const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export function useIsAdmin(address?: `0x${string}`) {
  const { data, isLoading } = useReadContract({
    address: DISTRIBUTOR_ADDRESS,
    abi: distributorAbi,
    functionName: "hasRole",
    args: address ? [DEFAULT_ADMIN_ROLE, address] : undefined,
    query: {
      enabled: Boolean(address) && isConfigured(DISTRIBUTOR_ADDRESS),
    },
  });

  return { isAdmin: data === true, isLoading };
}
