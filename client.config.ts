/**
 * Single source of truth for client-specific configuration.
 * Edit this file when forking the template.
 */
export const clientConfig = {
  token: {
    name: process.env.TOKEN_NAME ?? "RWA REIT",
    symbol: process.env.TOKEN_SYMBOL ?? "RREIT",
    /** 0 = uncapped */
    cap: process.env.TOKEN_CAP ?? "0",
  },
  /** Dividend payment token. Leave empty on testnet to deploy MockStableCoin. Required on mainnet. */
  dividendTokenAddress: process.env.DIVIDEND_TOKEN_ADDRESS ?? "",
  kycRegistry: {
    mainnet: process.env.KYC_REGISTRY_ADDRESS ?? "",
    testnet: process.env.KYC_REGISTRY_ADDRESS_TESTNET ?? "",
  },
  reclaimWindowDays: Number(process.env.RECLAIM_WINDOW_DAYS ?? "90"),
  /** Explicit admin/operator (defaults to deployer if unset). */
  adminAddress: process.env.ADMIN_ADDRESS ?? "",
  operatorAddress: process.env.OPERATOR_ADDRESS ?? "",
  /** Two-step admin transfer delay in seconds (0 for tests). */
  adminDelaySeconds: Number(process.env.ADMIN_DELAY_SECONDS ?? "86400"),
  ui: {
    appName: process.env.VITE_APP_NAME ?? "KYC Dividend Distributor",
    network: (process.env.VITE_REDBELLY_NETWORK ?? "testnet") as
      | "testnet"
      | "mainnet"
      | "staging",
  },
} as const;

export const RECLAIM_WINDOW_SECONDS =
  BigInt(clientConfig.reclaimWindowDays) * 86400n;
