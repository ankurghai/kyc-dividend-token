import { useHasChainPermission } from "@redbellynetwork/eligibility-sdk";

/**
 * Thin wrapper around Redbelly's useHasChainPermission hook.
 *
 * The SDK hook reads the on-chain KYC/permission state (the same state the
 * DividendDistributor checks via IKYCRegistry.isAllowed at settlement time),
 * so this is a pre-flight check: it lets the UI warn the user or disable
 * actions BEFORE a transaction is sent. The contract remains the
 * authoritative enforcement point.
 */
export function useKycPermission(address?: `0x${string}`) {
  const { data, error, isLoading, refetch } = useHasChainPermission(
    address ?? ""
  );

  return {
    /** true once the chain confirms the address has permission */
    isPermitted: data === true,
    isLoading,
    error,
    refetch,
  };
}
