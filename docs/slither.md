# Slither static analysis

Run locally:

```bash
pip install slither-analyzer
npm run slither
```

## Configuration

See [`slither.config.json`](../slither.config.json). Mock contracts under `contracts/mocks/` are excluded from analysis scope.

## Triage notes (accepted / informational)

| Finding | Status | Rationale |
|---------|--------|-----------|
| `naming-convention` | Excluded | Template follows OZ / project naming |
| `solc-version` | Excluded | Pinned 0.8.24 in hardhat config |
| Reentrancy on `_settle` | Reviewed | `nonReentrant` on external entrypoints; internal `_settle` only called from guarded functions |
| `accountedDividendBalance` accounting | Reviewed | Updated on create, pay, escrow claim, reclaim; stray rescue limited to excess balance |

Re-run after contract changes and document new findings in PR descriptions.
