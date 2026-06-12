import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "";
const MAINNET_RPC_URL =
  process.env.REDBELLY_MAINNET_RPC_URL ??
  "https://governors.mainnet.redbelly.network";
const TESTNET_RPC_URL =
  process.env.REDBELLY_TESTNET_RPC_URL ??
  "https://governors.testnet.redbelly.network";

const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  etherscan: {
    // Blockscout-based explorers accept any non-empty API key string.
    apiKey: {
      redbellyTestnet: process.env.EXPLORER_API_KEY ?? "blockscout",
      redbellyMainnet: process.env.EXPLORER_API_KEY ?? "blockscout",
    },
    customChains: [
      {
        network: "redbellyTestnet",
        chainId: 153,
        urls: {
          apiURL: "https://explorer.testnet.redbelly.network/api",
          browserURL: "https://explorer.testnet.redbelly.network",
        },
      },
      {
        network: "redbellyMainnet",
        chainId: 151,
        urls: {
          apiURL: "https://explorer.redbelly.network/api",
          browserURL: "https://explorer.redbelly.network",
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
  networks: {
    hardhat: {
      accounts: {
        count: 510,
        accountsBalance: "10000000000000000000000",
      },
      blockGasLimit: 100_000_000,
      ...(process.env.RUN_FORK_TESTS === "1"
        ? {
            forking: {
              url: MAINNET_RPC_URL,
            },
          }
        : process.env.RUN_FORK_TESTS_TESTNET === "1"
          ? {
              forking: {
                url: TESTNET_RPC_URL,
              },
            }
          : {}),
    },
    redbellyTestnet: {
      url: TESTNET_RPC_URL,
      chainId: 153,
      accounts,
    },
    redbellyMainnet: {
      url: MAINNET_RPC_URL,
      chainId: 151,
      accounts,
    },
  },
};

export default config;
