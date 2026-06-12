import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EligibilitySDKProvider } from "@redbellynetwork/eligibility-sdk";
import { wagmiConfig } from "./wagmi";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App";
import "./styles.css";
import { NETWORK } from "./config";

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <EligibilitySDKProvider config={{ network: NETWORK }}>
            <App />
          </EligibilitySDKProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
