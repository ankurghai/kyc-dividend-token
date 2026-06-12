import { readFileSync, existsSync } from "fs";
import { join } from "path";
import hre from "hardhat";
import { clientConfig } from "../client.config";
import type { DeploymentRecord } from "./deploy";

async function main() {
  const path = join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Deploy first.`);
  }

  const d = JSON.parse(readFileSync(path, "utf8")) as DeploymentRecord;

  await hre.run("verify:verify", {
    address: d.rwaToken,
    constructorArguments: [
      clientConfig.token.name,
      clientConfig.token.symbol,
      BigInt(clientConfig.token.cap),
      d.admin,
      d.kycRegistry,
      clientConfig.adminDelaySeconds,
    ],
  });

  await hre.run("verify:verify", {
    address: d.distributor,
    constructorArguments: [
      d.rwaToken,
      d.dividendToken,
      d.kycRegistry,
      BigInt(d.reclaimWindowSeconds),
      d.admin,
      d.operator,
      clientConfig.adminDelaySeconds,
    ],
  });

  console.log("Verification submitted for RWAToken and DividendDistributor");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
