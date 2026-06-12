import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import hre from "hardhat";
import { clientConfig } from "../client.config";
import type { DeploymentRecord } from "./deploy";

function main() {
  const path = join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Run deploy first.`);
  }

  const deployment = JSON.parse(readFileSync(path, "utf8")) as DeploymentRecord;

  const envLines = [
    `VITE_DISTRIBUTOR_ADDRESS=${deployment.distributor}`,
    `VITE_RWA_TOKEN_ADDRESS=${deployment.rwaToken}`,
    `VITE_PAYMENT_TOKEN_ADDRESS=${deployment.dividendToken}`,
    `VITE_REDBELLY_NETWORK=${
      hre.network.name === "redbellyMainnet" ? "mainnet" : clientConfig.ui.network
    }`,
    `VITE_APP_NAME=${clientConfig.ui.appName}`,
    deployment.dividendTokenDecimals !== undefined
      ? `VITE_PAYMENT_TOKEN_DECIMALS=${deployment.dividendTokenDecimals}`
      : "",
  ].filter(Boolean);

  const outPath = join(__dirname, "..", "ui", ".env");
  writeFileSync(outPath, envLines.join("\n") + "\n");
  console.log("Wrote", outPath);
}

main();
