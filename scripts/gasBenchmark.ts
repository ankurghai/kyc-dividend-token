import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { ethers } from "hardhat";

const HOLDER_COUNTS = [20, 50, 100, 500];
const GAS_LIMIT_PER_RECIPIENT = 80_000;

async function runBenchmark(holderCount: number) {
  const signers = await ethers.getSigners();
  const operator = signers[0];
  const holders = signers.slice(1, 1 + holderCount);

  if (holders.length < holderCount) {
    throw new Error(
      `Need at least ${holderCount + 1} signers; only ${signers.length} available`
    );
  }

  const kycRegistry = await ethers.deployContract("MockKYCRegistry");
  const paymentToken = await ethers.deployContract("MockStableCoin");
  const rwaToken = await ethers.deployContract("RWAToken", [
    "RWA",
    "RWA",
    0,
    operator.address,
    await kycRegistry.getAddress(),
    0,
  ]);
  const distributor = await ethers.deployContract("DividendDistributor", [
    await rwaToken.getAddress(),
    await paymentToken.getAddress(),
    await kycRegistry.getAddress(),
    90n * 24n * 60n * 60n,
    operator.address,
    operator.address,
    0,
  ]);

  const snapshotRole = await rwaToken.SNAPSHOT_ROLE();
  await rwaToken.grantRole(snapshotRole, await distributor.getAddress());
  const minterRole = await rwaToken.MINTER_ROLE();
  await rwaToken.grantRole(minterRole, operator.address);

  const balanceEach = ethers.parseEther("100");
  for (const holder of holders) {
    await rwaToken.mint(holder.address, balanceEach);
    await kycRegistry.setAllowed(holder.address, true);
  }

  const totalPool = balanceEach * BigInt(holderCount);
  await paymentToken.mint(operator.address, totalPool);
  await paymentToken.approve(await distributor.getAddress(), totalPool);

  const createTx = await distributor.createEpoch(totalPool);
  const createReceipt = await createTx.wait();

  const recipients = holders.map((h) => h.address);
  const batchSize = 100;
  let distributeGas = 0n;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const distributeTx = await distributor.distribute(0, batch);
    const distributeReceipt = await distributeTx.wait();
    distributeGas += distributeReceipt!.gasUsed;
  }
  const gasPerRecipient = Number(distributeGas) / holderCount;

  return {
    holderCount,
    createGas: Number(createReceipt!.gasUsed),
    distributeGas: Number(distributeGas),
    gasPerRecipient: Math.round(gasPerRecipient),
    withinLimit: gasPerRecipient <= GAS_LIMIT_PER_RECIPIENT,
  };
}

function buildMarkdownTable(
  results: Awaited<ReturnType<typeof runBenchmark>>[]
): string {
  const lines = [
    "| Holders | createEpoch gas | distribute gas | gas / recipient | < 80,000 |",
    "|--------:|----------------:|---------------:|----------------:|:--------:|",
  ];

  for (const row of results) {
    lines.push(
      `| ${row.holderCount} | ${row.createGas.toLocaleString()} | ${row.distributeGas.toLocaleString()} | ${row.gasPerRecipient.toLocaleString()} | ${row.withinLimit ? "yes" : "no"} |`
    );
  }

  return lines.join("\n");
}

function updateDocsTable(table: string) {
  const docsPath = join(__dirname, "..", "README.md");
  if (!existsSync(docsPath)) {
    return;
  }

  const markerStart = "<!-- GAS_BENCHMARK_START -->";
  const markerEnd = "<!-- GAS_BENCHMARK_END -->";
  let content = readFileSync(docsPath, "utf8");

  if (content.includes(markerStart) && content.includes(markerEnd)) {
    content = content.replace(
      new RegExp(`${markerStart}[\\s\\S]*?${markerEnd}`),
      `${markerStart}\n${table}\n${markerEnd}`
    );
    writeFileSync(docsPath, content);
  }
}

async function main() {
  const results = [];

  for (const count of HOLDER_COUNTS) {
    console.log(`\nBenchmarking ${count} holders...`);
    const result = await runBenchmark(count);
    results.push(result);
    console.log(
      `  distribute: ${result.distributeGas} gas (${result.gasPerRecipient} / recipient) — ${
        result.withinLimit ? "PASS" : "FAIL"
      }`
    );
  }

  const table = buildMarkdownTable(results);
  console.log("\n=== Gas benchmark results ===\n");
  console.log(table);

  const allPass = results.every((r) => r.withinLimit);
  if (!allPass) {
    console.error("\nOne or more benchmarks exceeded 80,000 gas per recipient.");
    process.exitCode = 1;
  }

  updateDocsTable(table);
  writeFileSync(
    join(__dirname, "..", "docs", "gas-benchmark-results.md"),
    `# Gas Benchmark Results\n\n${table}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
