import { http, createConfig, createStorage } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { defineChain } from "viem";

export const redbellyTestnet = defineChain({
  id: 153,
  name: "Redbelly Testnet",
  nativeCurrency: { name: "Redbelly", symbol: "RBNT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://governors.testnet.redbelly.network"] },
  },
  blockExplorers: {
    default: {
      name: "Redbelly Explorer",
      url: "https://explorer.testnet.redbelly.network",
    },
  },
  testnet: true,
});

export const redbellyMainnet = defineChain({
  id: 151,
  name: "Redbelly Mainnet",
  nativeCurrency: { name: "Redbelly", symbol: "RBNT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://governors.mainnet.redbelly.network"] },
  },
  blockExplorers: {
    default: {
      name: "Redbelly Explorer",
      url: "https://explorer.redbelly.network",
    },
  },
});

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const connectors = [
  injected({ shimDisconnect: true }),
  ...(projectId
    ? [
        walletConnect({
          projectId,
          showQrModal: true,
        }),
      ]
    : []),
];

export const wagmiConfig = createConfig({
  chains: [redbellyTestnet, redbellyMainnet],
  connectors,
  storage: createStorage({ storage: localStorage, key: "kyc-dividend-wagmi" }),
  transports: {
    [redbellyTestnet.id]: http(),
    [redbellyMainnet.id]: http(),
  },
});

export const LAST_CONNECTOR_KEY = "kyc-dividend-last-connector";
