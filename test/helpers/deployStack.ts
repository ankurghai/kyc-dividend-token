import { ethers } from "hardhat";
import { RECLAIM_WINDOW_SECONDS } from "../../client.config";

export const ADMIN_DELAY = 0;

export async function deployStack() {
  const signers = await ethers.getSigners();
  const [owner, operator, ...holders] = signers;

  const kycRegistry = await ethers.deployContract("MockKYCRegistry");
  const paymentToken = await ethers.deployContract("MockStableCoin");
  const rwaToken = await ethers.deployContract("RWAToken", [
    "RWA REIT",
    "RREIT",
    0,
    owner.address,
    await kycRegistry.getAddress(),
    ADMIN_DELAY,
  ]);

  const distributor = await ethers.deployContract("DividendDistributor", [
    await rwaToken.getAddress(),
    await paymentToken.getAddress(),
    await kycRegistry.getAddress(),
    RECLAIM_WINDOW_SECONDS,
    owner.address,
    operator.address,
    ADMIN_DELAY,
  ]);

  const snapshotRole = await rwaToken.SNAPSHOT_ROLE();
  await rwaToken.grantRole(snapshotRole, await distributor.getAddress());

  return {
    owner,
    operator,
    holders,
    kycRegistry,
    paymentToken,
    rwaToken,
    distributor,
  };
}
