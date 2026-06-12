# Redbelly KYC Dividend Template

Production-ready template for KYC-gated dividend distribution on Redbelly Network.

## Quickstart

```bash
git clone <your-fork> && cd kyc-dividend-template
npm run setup
# Edit .env and client.config.ts (token name, admin multisig, dividend token)
npm run deploy:testnet   # writes deployments/redbellyTestnet.json + ui/.env
npm run ui:dev           # open the operator/holder UI
```

## Features

- **Snapshot dividends** — pro-rata distribution from `ERC20Snapshot` balances
- **KYC at payment time** — `IKYCRegistry.isAllowed()` with escrow + reclaim window
- **Production contracts** — pausable, supply cap, optional transfer hook, admin delay, rescue
- **Split deploy** — `deploy.ts` (production) + `seedDemo.ts` (testnet demo only)
- **Any-decimal dividend token** — contract uses raw ERC-20 units; UI reads decimals on-chain
- **UI** — wallet connect, admin/operator panels, token decimals, error decoding

## Scripts

| Command | Description |
|---------|-------------|
| `npm test` | Contract unit tests |
| `npm run coverage` | Solidity coverage (≥90% target) |
| `npm run benchmark` | Gas benchmark (<80k/recipient) |
| `npm run deploy:testnet` | Deploy + verify + seed demo on testnet |
| `npm run gen:ui-env` | Regenerate `ui/.env` from deployments JSON |
| `npm run ui:dev` | Vite dev server |

## Documentation

- [Full guide](docs/guide.md) — architecture, contracts, math, testing
- [Forking checklist](docs/forking.md) — what to change for your issuer
- [Operations runbook](docs/operations.md) — per-epoch workflow and incidents
- [Gas results](docs/gas-benchmark-results.md)

## Configuration

Single source of truth: [`client.config.ts`](client.config.ts) — consumed by deploy scripts and referenced by the UI via generated `ui/.env`.

## Dividend payment token

`DividendDistributor` is **decimal-agnostic**: it never calls `decimals()`. All pool, entitlement, and payout values are raw ERC-20 **smallest units**. Tokens with 6, 8, or 18 decimals all work, and the RWA token’s decimals can differ from the dividend token’s.

### Deploy setup

- Set `DIVIDEND_TOKEN_ADDRESS` in [`.env.example`](.env.example) (required on mainnet; on testnet, leave empty to deploy `MockStableCoin`).
- When calling `createEpoch(totalPool)` or approving in the operator UI, pass **smallest units**, not human-readable amounts.

| Human amount | Decimals | `totalPool` value |
|--------------|----------|-------------------|
| 1 USDC | 6 | `1_000_000` |
| 1,000 USDC | 6 | `1_000_000_000` |
| 1 token | 18 | `1_000_000_000_000_000_000` |

Approve the same raw amount before `createEpoch`.

### UI

The operator UI reads `decimals()` and `symbol()` on-chain. After deploy, `npm run deploy:testnet` (or `npm run gen:ui-env`) writes `VITE_PAYMENT_TOKEN_DECIMALS` into `ui/.env` as a fallback.

### Token compatibility

- **Recommended:** standard non-rebasing ERC-20 (e.g. USDC-style stablecoin).
- **Inbound fee-on-transfer:** supported — the epoch stores the balance actually received, not the requested amount.
- **Avoid:** rebasing tokens and outbound fee-on-transfer tokens (can cause accounting drift).
- **Fixed at deploy:** one `dividendToken` address per deployment (immutable).

See also: [Forking checklist — dividend token](docs/forking.md#2-dividend-payment-token) · [Operations runbook](docs/operations.md)

<!-- GAS_BENCHMARK_START -->
| Holders | createEpoch gas | distribute gas | gas / recipient | < 80,000 |
|--------:|----------------:|---------------:|----------------:|:--------:|
| 20 | 263,108 | 1,326,382 | 66,319 | yes |
| 50 | 263,120 | 3,207,027 | 64,141 | yes |
| 100 | 263,120 | 6,342,100 | 63,421 | yes |
| 500 | 263,120 | 31,680,464 | 63,361 | yes |
<!-- GAS_BENCHMARK_END -->

## License

MIT — see [LICENSE](LICENSE).
