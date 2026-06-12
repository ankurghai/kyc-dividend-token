import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { ethers } from "hardhat";
import hre from "hardhat";
import type { DeploymentRecord } from "./deploy";

const HOLDER_COUNT = 20;

function loadDeployment(): DeploymentRecord {
  const path = join(__dirname, "..", "deployments", `${hre.network.name}.json`);
  if (!existsSync(path)) {
    throw new Error(`Missing ${path}. Run deploy first.`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as DeploymentRecord;
}

async function main() {
  if (hre.network.name === "redbellyMainnet") {
    throw new Error("seedDemo is testnet-only");
  }

  const [deployer] = await ethers.getSigners();
  const deployment = loadDeployment();

  const rwaToken = await ethers.getContractAt("RWAToken", deployment.rwaToken);
  const paymentToken = await ethers.getContractAt(
    "MockStableCoin",
    deployment.dividendToken
  );
  const distributor = await ethers.getContractAt(
    "DividendDistributor",
    deployment.distributor
  );

  let mockKyc: Awaited<ReturnType<typeof ethers.getContractAt>> | null = null;
  try {
    mockKyc = await ethers.getContractAt("MockKYCRegistry", deployment.kycRegistry);
  } catch {
    console.log("KYC registry is not MockKYCRegistry — skipping setAllowed");
  }

  const holderWallets = Array.from({ length: HOLDER_COUNT }, () =>
    ethers.Wallet.createRandom().connect(ethers.provider)
  );

  const balanceEach = ethers.parseEther("50");
  const holderAddresses: string[] = [];

  for (let i = 0; i < holderWallets.length; i++) {
    const holder = holderWallets[i];
    holderAddresses.push(holder.address);

    if (deployer.provider) {
      await (
        await deployer.sendTransaction({
          to: holder.address,
          value: ethers.parseEther("0.01"),
        })
      ).wait();
    }

    await rwaToken.mint(holder.address, balanceEach);
    if (mockKyc) {
      await mockKyc.setAllowed(holder.address, i % 2 === 0);
    }
  }

  const totalPool = balanceEach * BigInt(HOLDER_COUNT);
  await paymentToken.mint(deployer.address, totalPool);
  await paymentToken.approve(deployment.distributor, totalPool);

  await (await distributor.createEpoch(totalPool)).wait();
  console.log("Epoch 0 created");

  const receipt = await (
    await distributor.distribute(0, holderAddresses)
  ).wait();
  console.log("Distribution gas:", receipt?.gasUsed.toString());

  const epoch = await distributor.epochs(0);
  const sum = epoch.distributed + epoch.escrowedTotal;
  console.log("\n=== Demo distribution ===");
  console.log("Pool:", totalPool.toString());
  console.log("Paid:", epoch.distributed.toString());
  console.log("Escrowed:", epoch.escrowedTotal.toString());
  console.log("Math check:", sum === totalPool ? "PASS" : "FAIL");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
