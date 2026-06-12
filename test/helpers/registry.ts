import { ethers } from "ethers";
import { clientConfig } from "../../client.config";

export const KYC_REGISTRY_ADDRESS_MAINNET = clientConfig.kycRegistry.mainnet;

export const KYC_REGISTRY_ADDRESS_TESTNET = clientConfig.kycRegistry.testnet;

export function hasMainnetKycRegistry(): boolean {
  return Boolean(
    KYC_REGISTRY_ADDRESS_MAINNET &&
      ethers.isAddress(KYC_REGISTRY_ADDRESS_MAINNET)
  );
}

export function hasTestnetKycRegistry(): boolean {
  return Boolean(
    KYC_REGISTRY_ADDRESS_TESTNET &&
      ethers.isAddress(KYC_REGISTRY_ADDRESS_TESTNET)
  );
}

export function getKycRegistryForNetwork(networkName: string): string | undefined {
  if (networkName === "redbellyMainnet" && hasMainnetKycRegistry()) {
    return KYC_REGISTRY_ADDRESS_MAINNET;
  }
  if (networkName === "redbellyTestnet" && hasTestnetKycRegistry()) {
    return KYC_REGISTRY_ADDRESS_TESTNET;
  }
  return undefined;
}
