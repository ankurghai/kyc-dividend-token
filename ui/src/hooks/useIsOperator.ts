import { useReadContract } from "wagmi";
import { keccak256, toBytes } from "viem";
import { distributorAbi } from "../abi";
import { DISTRIBUTOR_ADDRESS, isConfigured } from "../config";

/** keccak256("OPERATOR_ROLE") — matches the constant in DividendDistributor. */
export const OPERATOR_ROLE = keccak256(toBytes("OPERATOR_ROLE"));

/**
 * Checks AccessControl.hasRole(OPERATOR_ROLE, account) on the distributor.
 * Used to hide the operator panel from regular holders. Display-only — the
 * contract still enforces the role on every operator function.
 */
export function useIsOperator(address?: `0x${string}`) {
  const { data, isLoading } = useReadContract({
    address: DISTRIBUTOR_ADDRESS,
    abi: distributorAbi,
    functionName: "hasRole",
    args: address ? [OPERATOR_ROLE, address] : undefined,
    query: {
      enabled: Boolean(address) && isConfigured(DISTRIBUTOR_ADDRESS),
    },
  });

  return { isOperator: data === true, isLoading };
}
