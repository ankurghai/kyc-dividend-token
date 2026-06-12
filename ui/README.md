# Dividend Distributor UI

Boilerplate React dashboard for the KYC-gated dividend distribution contracts.
Built with Vite, wagmi v2, viem, and the Redbelly eligibility SDK.

## What it does

- Connects an injected wallet (MetaMask etc.) on Redbelly Testnet (153) or Mainnet (151)
- Shows the user's KYC status via **`useHasChainPermission`** from
  `@redbellynetwork/eligibility-sdk` — the same on-chain permission state the
  `DividendDistributor` reads through `IKYCRegistry.isAllowed` at settlement time
- Lists all distribution epochs with pool / paid / escrowed totals and the
  escrow claim deadline
- Per epoch, shows the connected holder's entitlement and escrow balance, with
  **Claim dividend** (`claim`) and **Claim escrow** (`claimEscrow`) actions
- Operator panel for `approve` → `createEpoch` → `distribute`

## How hasChainPermission gates transactions

The hook is a **pre-flight check**; the contract is the authoritative enforcer.

| Action | Gating behavior |
|--------|-----------------|
| `claim` | If the address lacks chain permission, the UI warns that the dividend will be **escrowed, not paid**, and asks for confirmation before sending |
| `claimEscrow` | Button is **disabled** until `hasChainPermission` returns true, because the contract reverts `NotKycAllowed` otherwise |
| status badge | Header shows live verified / not-verified state with a manual refresh |

See `src/hooks/useKycPermission.ts` (wrapper) and `src/components/EpochCard.tsx`
(usage).

## Setup

```bash
cd ui
npm install
cp .env.example .env   # fill in the deployed contract addresses
npm run dev
```

`VITE_DISTRIBUTOR_ADDRESS`, `VITE_RWA_TOKEN_ADDRESS`, and
`VITE_PAYMENT_TOKEN_ADDRESS` come from the output of `npm run deploy:testnet`
in the project root.

## Notes

- The eligibility SDK's hooks are built on wagmi's `useReadContract`, so the
  app must be wrapped in `WagmiProvider` + `QueryClientProvider` (`src/main.tsx`).
- If the SDK package version in `package.json` doesn't resolve, check the
  current package name/version at
  https://docs.redbelly.network/pages/eligibility-sdk/installation/
- Amounts are rendered with `formatEther` (18-decimal payment token). Adjust if
  your dividend token uses different decimals.
