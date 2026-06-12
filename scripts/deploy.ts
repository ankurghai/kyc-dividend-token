import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { ethers } from "hardhat";
import hre from "hardhat";
import { clientConfig, RECLAIM_WINDOW_SECONDS } from "../client.config";
import { getKycRegistryForNetwork } from "../test/helpers/registry";

export interface DeploymentRecord {
  network: string;
  chainId: number;
  deployer: string;
  admin: string;
  operator: string;
  rwaToken: string;
  dividendToken: string;
  kycRegistry: string;
  distributor: string;
  reclaimWindowSeconds: string;
  adminDelaySeconds: number;
  deployedAt: string;
  dividendTokenDecimals?: number;
}

export async function deployContracts(): Promise<DeploymentRecord> {
  const [deployer] = await ethers.getSigners();
  const network = hre.network.name;
  const chainId = Number((await ethers.provider.getNetwork()).chainId);

  const admin = clientConfig.adminAddress || deployer.address;
  const operator = clientConfig.operatorAddress || admin;

  let kycRegistryAddress = getKycRegistryForNetwork(network);
  let deployedMockKyc = false;

  if (!kycRegistryAddress) {
    const mock = await ethers.deployContract("MockKYCRegistry");
    kycRegistryAddress = await mock.getAddress();
    deployedMockKyc = true;
    console.log("Deployed MockKYCRegistry:", kycRegistryAddress);
  } else {
    console.log("Using KYC registry:", kycRegistryAddress);
  }

  let dividendTokenAddress = clientConfig.dividendTokenAddress;
  let deployedMockStable = false;

  if (!dividendTokenAddress || !ethers.isAddress(dividendTokenAddress)) {
    if (network === "redbellyMainnet") {
      throw new Error("DIVIDEND_TOKEN_ADDRESS is required on mainnet");
    }
    const mockStable = await ethers.deployContract("MockStableCoin");
    dividendTokenAddress = await mockStable.getAddress();
    deployedMockStable = true;
    console.log("Deployed MockStableCoin:", dividendTokenAddress);
  } else {
    console.log("Using dividend token:", dividendTokenAddress);
  }

  const cap = BigInt(clientConfig.token.cap);

  // RWAToken is deployed with the DEPLOYER as initial admin so the script can
  // grant roles (SNAPSHOT_ROLE to the distributor, operational roles to the
  // final admin). Admin power is then handed over via the two-step
  // beginDefaultAdminTransfer / acceptDefaultAdminTransfer flow.
  const rwaToken = await ethers.deployContract("RWAToken", [
    clientConfig.token.name,
    clientConfig.token.symbol,
    cap,
    deployer.address,
    kycRegistryAddress,
    clientConfig.adminDelaySeconds,
  ]);
  const rwaAddress = await rwaToken.getAddress();

  const distributor = await ethers.deployContract("DividendDistributor", [
    rwaAddress,
    dividendTokenAddress,
    kycRegistryAddress,
    RECLAIM_WINDOW_SECONDS,
    admin,
    operator,
    clientConfig.adminDelaySeconds,
  ]);
  const distributorAddress = await distributor.getAddress();

  const snapshotRole = await rwaToken.SNAPSHOT_ROLE();
  await (await rwaToken.grantRole(snapshotRole, distributorAddress)).wait();

  if (admin !== deployer.address) {
    // Hand operational roles to the final admin, then start the two-step
    // admin transfer. The deployer keeps DEFAULT_ADMIN_ROLE until the admin
    // calls acceptDefaultAdminTransfer() after the configured delay.
    const minterRole = await rwaToken.MINTER_ROLE();
    const pauserRole = await rwaToken.PAUSER_ROLE();
    await (await rwaToken.grantRole(minterRole, admin)).wait();
    await (await rwaToken.grantRole(pauserRole, admin)).wait();
    await (await rwaToken.beginDefaultAdminTransfer(admin)).wait();
    console.log(
      `RWAToken admin transfer started → ${admin}. ` +
        `The admin must call acceptDefaultAdminTransfer() after the ` +
        `${clientConfig.adminDelaySeconds}s delay to complete it.`
    );
  } else {
    console.log("Admin and deployer are the same address");
  }

  const dividendToken = await ethers.getContractAt(
    "MockStableCoin",
    dividendTokenAddress
  );
  let dividendTokenDecimals = 18;
  try {
    dividendTokenDecimals = Number(await dividendToken.decimals());
  } catch {
    const erc20 = await ethers.getContractAt(
      ["function decimals() view returns (uint8)"],
      dividendTokenAddress
    );
    dividendTokenDecimals = Number(await erc20.decimals());
  }

  const record: DeploymentRecord = {
    network,
    chainId,
    deployer: deployer.address,
    admin,
    operator,
    rwaToken: rwaAddress,
    dividendToken: dividendTokenAddress,
    kycRegistry: kycRegistryAddress,
    distributor: distributorAddress,
    reclaimWindowSeconds: RECLAIM_WINDOW_SECONDS.toString(),
    adminDelaySeconds: clientConfig.adminDelaySeconds,
    deployedAt: new Date().toISOString(),
    dividendTokenDecimals,
  };

  const outDir = join(__dirname, "..", "deployments");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${network}.json`);
  writeFileSync(outPath, JSON.stringify(record, null, 2));
  console.log("\nWrote deployment record:", outPath);

  console.log("\n=== Deployment summary ===");
  console.log("RWAToken:", rwaAddress);
  console.log("Dividend token:", dividendTokenAddress);
  console.log("KYC registry:", kycRegistryAddress, deployedMockKyc ? "(mock)" : "");
  console.log("DividendDistributor:", distributorAddress);
  if (deployedMockStable) console.log("(MockStableCoin deployed for testnet demo)");

  return record;
}

async function main() {
  await deployContracts();
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
