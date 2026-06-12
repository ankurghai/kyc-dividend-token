# Forking this template

Use this checklist when deploying for a new issuer.

## 1. Branding and metadata

Edit [`client.config.ts`](../client.config.ts):

- `token.name` / `token.symbol` — your RWA security token
- `token.cap` — max supply (0 = uncapped)
- `ui.appName` — dashboard title

## 2. Dividend payment token

See [README — Dividend payment token](../README.md#dividend-payment-token) for decimals, amount scaling, and compatibility notes.

- **Testnet:** leave `DIVIDEND_TOKEN_ADDRESS` empty to deploy `MockStableCoin`, or set a test stablecoin address.
- **Mainnet:** set `DIVIDEND_TOKEN_ADDRESS` to your production dividend token (e.g. USDC-style 6-decimal token).

The UI reads decimals/symbol on-chain; set `VITE_PAYMENT_TOKEN_DECIMALS` in generated `ui/.env` as a fallback.

## 3. KYC registry

Set in `.env`:

- `KYC_REGISTRY_ADDRESS` — mainnet Redbelly registry
- `KYC_REGISTRY_ADDRESS_TESTNET` — testnet registry

The distributor stores the registry address at deploy time and allows admin migration via `setKycRegistry` (see [operations.md](./operations.md)).

## 4. Reclaim window

Default: 90 days (`RECLAIM_WINDOW_DAYS` env or `client.config.ts`).

Per-epoch windows are frozen at epoch creation; changing the global window only affects **future** epochs.

## 5. Roles and multisig

Set before deploy:

- `ADMIN_ADDRESS` — receives `DEFAULT_ADMIN_ROLE` (use a multisig)
- `OPERATOR_ADDRESS` — runs `createEpoch` / `distribute`
- `ADMIN_DELAY_SECONDS` — two-step admin transfer delay (recommended ≥ 86400)

The deploy key should **not** retain admin if you set explicit addresses.

## 6. Optional RWA transfer policy

`RWAToken` ships with KYC transfer hook **disabled**. Enable via:

```solidity
setKycTransfersEnabled(true)
```

Only enable if your compliance model requires on-chain transfer gating.

## 7. UI

After deploy:

```bash
npm run gen:ui-env
npm run ui:dev
```

Optional: `VITE_WALLETCONNECT_PROJECT_ID` for WalletConnect in `ui/.env`.

## 8. Verification

```bash
npm run verify:testnet
npm run verify:mainnet
```

Ensure explorer API keys are configured if required by your Hardhat verify plugin setup.
