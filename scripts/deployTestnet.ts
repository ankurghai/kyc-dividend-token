import { deployContracts } from "./deploy";
import { execSync } from "child_process";
import hre from "hardhat";

async function main() {
  await deployContracts();

  execSync(`npx hardhat run scripts/genUiEnv.ts --network ${hre.network.name}`, {
    stdio: "inherit",
  });

  const network = hre.network.name;
  if (network === "redbellyTestnet" || network === "hardhat") {
    try {
      execSync(`npx hardhat run scripts/seedDemo.ts --network ${network}`, {
        stdio: "inherit",
      });
    } catch (err) {
      console.warn("seedDemo skipped or failed:", err);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
