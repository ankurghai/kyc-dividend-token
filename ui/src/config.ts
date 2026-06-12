import { redbellyMainnet, redbellyTestnet } from "./wagmi";

export const APP_NAME =
  import.meta.env.VITE_APP_NAME ?? "KYC Dividend Distributor";

export const DISTRIBUTOR_ADDRESS = (import.meta.env.VITE_DISTRIBUTOR_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const RWA_TOKEN_ADDRESS = (import.meta.env.VITE_RWA_TOKEN_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const PAYMENT_TOKEN_ADDRESS = (import.meta.env
  .VITE_PAYMENT_TOKEN_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

export const PAYMENT_TOKEN_DECIMALS = Number(
  import.meta.env.VITE_PAYMENT_TOKEN_DECIMALS ?? "18"
);

export const NETWORK =
  (import.meta.env.VITE_REDBELLY_NETWORK as "testnet" | "mainnet" | "staging") ??
  "testnet";

export const EXPECTED_CHAIN_ID =
  NETWORK === "mainnet" ? redbellyMainnet.id : redbellyTestnet.id;

export const isConfigured = (addr: string) =>
  addr !== "0x0000000000000000000000000000000000000000";

export const EPOCHS_PER_PAGE = 10;
