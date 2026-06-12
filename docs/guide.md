# KYC-Gated Dividend Distribution Guide

> **Production template:** contracts include pausable controls, explicit admin/operator roles,
> optional KYC transfer hook on `RWAToken`, admin-updatable KYC registry, and `rescueToken`.
> See [forking.md](./forking.md) and [operations.md](./operations.md) for deploy and runbooks.

## Table of Contents

1. [Problem Statement](#1-problem-statement)
2. [Solution Overview](#2-solution-overview)
3. [Architecture](#3-architecture)
4. [Contract Reference](#4-contract-reference)
5. [Two-Step Distribution Flow](#5-two-step-distribution-flow)
6. [Escrow and Reclaim Lifecycle](#6-escrow-and-reclaim-lifecycle)
7. [Epoch and Double-Claim Prevention](#7-epoch-and-double-claim-prevention)
8. [KYC Integration](#8-kyc-integration)
9. [Dividend Math](#9-dividend-math)
10. [Gas Optimization](#10-gas-optimization)
11. [Testing and Coverage](#11-testing-and-coverage)
12. [Deployment Runbook](#12-deployment-runbook)

---

## 1. Problem Statement

Tokenized REITs and bonds must verify each recipient has valid KYC at the **exact moment of dividend payment**. Manual verification through transfer agents is expensive, slow, and error-prone.

This project implements an on-chain dividend distribution system that:

- Records holder balances at a point in time using OpenZeppelin `ERC20Snapshot`
- Pays only KYC-verified holders during distribution
- Escrows funds for ineligible holders with a configurable reclaim window (default 90 days)
- Prevents double-claiming within the same distribution epoch

---

## 2. Solution Overview

The system consists of three primary on-chain components:

| Contract | Role |
|----------|------|
| `RWAToken` | ERC-20 security token with snapshot capability |
| `MockStableCoin` | ERC-20 payment token (stablecoin) for dividends |
| `DividendDistributor` | Orchestrates epochs, KYC checks, payments, and escrow |

KYC eligibility is read directly from the Redbelly KYC registry via `IKYCRegistry.isAllowed(address)`.

---

## 3. Architecture

```
Operator                    DividendDistributor              RWAToken
   |                              |                            |
   |-- createEpoch(pool) -------->|-- snapshot() ------------->|
   |                              |-- transferFrom(pool)       |
   |                              |                            |
   |-- distribute(epoch,[]) ----->|-- balanceOfAt (snapshot) -->|
   |                              |-- isAllowed (KYC registry) |
   |                              |-- pay OR escrow            |
   |                              |                            |
Holder -- claim(epoch) --------->| (same settle logic)        |
Holder -- claimEscrow(epoch) --->| (if later KYC valid)       |
Owner  -- reclaim(epoch) ------->| (after 90-day window)      |
```

**Design principles:**

- Snapshot captures *who held how much* at dividend record date
- KYC is checked at *distribution time*, not snapshot time
- Hybrid distribution: operator batch-push plus holder self-claim
- Single `hasClaimed[epoch][account]` map prevents double-claiming

---

## 4. Contract Reference

### 4.1 RWAToken

Extends OpenZeppelin `ERC20Snapshot` and `AccessControl`.

| Function | Access | Description |
|----------|--------|-------------|
| `mint(to, amount)` | `MINTER_ROLE` | Mint security tokens |
| `snapshot()` | `SNAPSHOT_ROLE` | Capture point-in-time balances |
| `balanceOfAt(account, id)` | public view | Balance at snapshot |
| `totalSupplyAt(id)` | public view | Supply at snapshot |

Roles:

- `DEFAULT_ADMIN_ROLE` — grant/revoke roles
- `MINTER_ROLE` — mint tokens
- `SNAPSHOT_ROLE` — granted to `DividendDistributor`

### 4.2 DividendDistributor

| Function | Access | Description |
|----------|--------|-------------|
| `createEpoch(totalPool)` | `OPERATOR_ROLE` | Snapshot + fund pool (records amount actually received) |
| `distribute(epoch, recipients[])` | `OPERATOR_ROLE` | Batch settle recipients; already-claimed addresses are skipped, not reverted |
| `claim(epoch)` | any holder | Self-claim entitlement; reverts `AlreadyClaimed` if settled |
| `claimEscrow(epoch)` | escrowed holder | Claim after becoming KYC-eligible, within the epoch's window |
| `reclaim(epoch, to)` | `DEFAULT_ADMIN_ROLE` | Recover unclaimed funds to treasury `to` after window |
| `setReclaimWindow(seconds)` | `DEFAULT_ADMIN_ROLE` | Update window for **future epochs only** |

All fund-moving functions are protected with `nonReentrant`.

**Events:**

- `EpochCreated` — new distribution epoch (includes the window captured for that epoch)
- `Paid` — eligible recipient paid
- `Escrowed` — ineligible recipient escrowed
- `Skipped` — recipient skipped, with reason (`"zero balance"` or `"already claimed"`)
- `EscrowClaimed` — escrow released to now-eligible holder
- `Reclaimed` — unclaimed funds sent to treasury
- `ReclaimWindowUpdated` — default window changed (future epochs)

### 4.3 IKYCRegistry

```solidity
interface IKYCRegistry {
    function isAllowed(address account) external view returns (bool);
}
```

On Redbelly mainnet, deploy with `KYC_REGISTRY_ADDRESS=0xcb385cD90ca6b219798F57B4a7958897e91A9163`.

---

## 5. Two-Step Distribution Flow

### Step 1: Record date (snapshot)

The operator calls `createEpoch(totalPool)`:

1. `RWAToken.snapshot()` records current holder balances
2. `totalSupplyAt(snapshotId)` is stored for pro-rata math
3. `totalPool` stablecoins are transferred into the distributor — the epoch stores the balance **actually received**, so fee-on-transfer tokens cannot undercollateralize the pool
4. The current `reclaimWindow` is captured into the epoch and fixed for its lifetime

No KYC check occurs at this step.

### Step 2: Payment date (distribution)

The operator calls `distribute(epoch, holders[])` and/or holders call `claim(epoch)`:

For each recipient:

1. Read `balanceOfAt(recipient, snapshotId)` — snapshot balance
2. Compute entitlement: `balance * totalPool / supplyAt`
3. Call `kycRegistry.isAllowed(recipient)` — **live KYC check**
4. If allowed → transfer stablecoin, emit `Paid`
5. If not allowed → credit escrow mapping, emit `Escrowed`
6. If zero balance → emit `Skipped`

---

## 6. Escrow and Reclaim Lifecycle

### Escrow (ineligible at distribution)

When a holder fails KYC at distribution time, their entitlement is stored in `escrow[epoch][account]` and counted in `escrowedTotal`. Funds remain in the distributor contract.

### claimEscrow (holder becomes eligible)

Within the epoch's reclaim window (default 90 days, fixed at epoch creation), a holder who later passes KYC can call `claimEscrow(epoch)`:

- Requires `isAllowed(msg.sender) == true` at call time
- Transfers escrowed amount to holder
- Emits `EscrowClaimed`

### reclaim (issuer recovery)

After `createdAt + epoch.reclaimWindow`, the admin calls `reclaim(epoch, treasury)`:

- Transfers `totalPool - distributed` to the given treasury address
- Includes unclaimed escrow and rounding remainder
- Sets `reclaimed = true`; no further settlements allowed

Because the window is per-epoch, `setReclaimWindow` cannot shorten or extend the escrow claim deadline of an epoch that already exists.

---

## 7. Epoch and Double-Claim Prevention

Each distribution creates an epoch (0-indexed). Settlement sets `hasClaimed[epoch][account] = true` before any transfer.

This single guard covers:

- Operator `distribute` then holder `claim` on same epoch — `claim` reverts `AlreadyClaimed`
- Holder `claim` then operator `distribute` on same epoch — batch **skips** the address with `Skipped("already claimed")` and continues, so a self-claiming holder cannot block (DoS) the operator's batch
- Repeated `distribute` calls or duplicate addresses within one batch — skipped, never paid twice

---

## 8. KYC Integration

### On-chain check

The distributor calls the KYC registry directly:

```solidity
if (kycRegistry.isAllowed(account)) {
    // pay
} else {
    // escrow
}
```

### Timing

| Moment | KYC checked? |
|--------|--------------|
| `createEpoch` / snapshot | No |
| `distribute` / `claim` | Yes — per recipient |
| `claimEscrow` | Yes — must be allowed now |

### Testnet vs production

| Environment | Registry |
|-------------|----------|
| Unit tests | `MockKYCRegistry` with `setAllowed` |
| Testnet demo | Live registry via `KYC_REGISTRY_ADDRESS_TESTNET`, or `MockKYCRegistry` if unset |
| Production | Live Redbelly KYC registry address |

### Off-chain SDK

Redbelly's `useHasChainPermission` React hook reads the same on-chain state for UI gating. The distributor does not use the SDK; it calls `isAllowed` on-chain, which is the authoritative check. The boilerplate UI in `ui/` calls `hasChainPermission` as a pre-flight check before submitting `claim` / `claimEscrow` transactions — see `ui/README.md`.

### Security hardening

- **Per-epoch reclaim window** — captured at `createEpoch`; admin cannot retroactively change escrow deadlines
- **Batch DoS resistance** — already-claimed addresses are skipped with an event, never reverting the batch
- **Reentrancy** — `nonReentrant` on `createEpoch`, `distribute`, `claim`, `claimEscrow`, `reclaim`; checks-effects-interactions throughout
- **Received-amount accounting** — `createEpoch` records the balance delta, not the requested amount
- **Input validation** — zero-address and zero-value constructor/function arguments revert with named custom errors
- **Treasury reclaim** — recovered funds go to an explicit `to` address, not implicitly to the caller

---

## 9. Dividend Math

Pro-rata entitlement per holder:

```
entitlement = balanceAtSnapshot * totalPool / totalSupplyAtSnapshot
```

Integer division floors each amount. The distributor caps each settlement to the remaining unallocated pool (`totalPool - distributed - escrowedTotal`), ensuring no over-allocation.

**Invariant after full settlement:**

```
epoch.distributed + epoch.escrowedTotal == epoch.totalPool
```

The deploy script and test suite assert this equality.

---

## 10. Gas Optimization

Techniques applied in `DividendDistributor`:

- Immutable references for `token`, `paymentToken`, `kycRegistry`
- Cached epoch fields in `_entitlement`
- `unchecked` loop increment in `distribute`
- Early return on zero balance (emit `Skipped`, no transfer)
- Single `hasClaimed` SSTORE per recipient
- Solidity optimizer enabled (`runs: 200`)

### Benchmark results

Run: `npm run benchmark`

<!-- GAS_BENCHMARK_START -->
| Holders | createEpoch gas | distribute gas | gas / recipient | < 80,000 |
|--------:|----------------:|---------------:|----------------:|:--------:|
| 20 | 263,104 | 1,326,396 | 66,320 | yes |
| 50 | 263,116 | 3,207,041 | 64,141 | yes |
| 100 | 263,116 | 6,342,114 | 63,421 | yes |
| 500 | 263,116 | 31,680,534 | 63,361 | yes |
<!-- GAS_BENCHMARK_END -->

**Target:** gas per verified recipient ≤ 80,000.

---

## 11. Testing and Coverage

### Run tests

```bash
npm test
```

### Coverage

```bash
npm run coverage
```

**Target:** ≥ 90% line coverage on `DividendDistributor` and `RWAToken`.

**Latest run:** 98.81% statements, 98.04% lines, 100% functions (all contracts). The only uncovered branches are two defensive guards in `_entitlement` that are unreachable under floor-division math.

### Test scenarios

- Snapshot and pool funding on `createEpoch`
- Pro-rata payment to eligible holders
- Escrow for ineligible holders with `Escrowed` event
- `Skipped` event for zero-balance addresses
- Double-claim prevention (distribute + claim, claim + distribute, duplicate batch entries)
- Batch distribute is not blocked by front-running self-claims
- `claimEscrow` after KYC status changes
- `reclaim` before/after window, to explicit treasury, closed-epoch behavior
- Per-epoch reclaim window immune to later `setReclaimWindow` changes
- Math invariant: `distributed + escrowed == totalPool`
- Access control on operator and admin functions
- Constructor/input validation (zero address, zero window, zero pool, zero supply)

---

## 12. Deployment Runbook

### Prerequisites

- Node.js and npm
- Funded deployer wallet on Redbelly Testnet (chain ID 153)
- RBNT for gas (faucet via FAUCETME on testnet)

### Environment

Copy `.env.example` to `.env`:

```
PRIVATE_KEY=0x...
REDBELLY_TESTNET_RPC_URL=https://governors.testnet.redbelly.network
KYC_REGISTRY_ADDRESS_TESTNET=0x...   # testnet KYC registry; uses mock if omitted
```

### Commands

```bash
npm install
npm run compile
npm test
npm run coverage
npm run benchmark
npm run deploy:testnet
```

### Post-deploy checklist

1. Grant `SNAPSHOT_ROLE` on `RWAToken` to `DividendDistributor` (done in deploy script)
2. Mint RWA tokens to holder addresses
3. Configure KYC allowlist on registry (or mock `setAllowed`)
4. Fund operator with stablecoin; approve distributor
5. `createEpoch(totalPool)` then `distribute(epoch, allHolders)`
6. Verify: eligible paid, ineligible escrowed, events emitted
7. Assert: `distributed + escrowed == totalPool`

### Network details

| Network | RPC | Chain ID |
|---------|-----|----------|
| Redbelly Testnet | `https://governors.testnet.redbelly.network` | 153 |
| Redbelly Mainnet | `https://governors.mainnet.redbelly.network` | 151 |

---

## Appendix: File Layout

```
contracts/
  RWAToken.sol
  DividendDistributor.sol
  GatedAction.sol
  interfaces/IKYCRegistry.sol
  mocks/MockKYCRegistry.sol
  mocks/MockStableCoin.sol
test/
  DividendDistributor.test.ts
  KYCRegistry.test.ts
  helpers/registry.ts
scripts/
  gasBenchmark.ts
  deployTestnet.ts
  isAllowed.ts
docs/
  gas-benchmark-results.md
ui/
  (React boilerplate — claim/escrow dashboard gated by hasChainPermission, see ui/README.md)
```

---

*Document version 1.1 — KYC-Gated Dividend Distribution for Redbelly Network*
