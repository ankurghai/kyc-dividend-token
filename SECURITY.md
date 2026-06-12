# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| main    | yes       |

## Reporting a vulnerability

Please report security issues privately to your Redbelly deployment contact or open a **private** security advisory on the repository fork.

Do **not** open public issues for exploitable vulnerabilities.

## Scope

In scope:

- `contracts/RWAToken.sol`
- `contracts/DividendDistributor.sol`
- Deployment scripts that set admin/operator roles

Out of scope:

- Mock contracts under `contracts/mocks/`
- Third-party dependencies (OpenZeppelin, Hardhat, wagmi)

## Operational guidance

- Use a multisig for `DEFAULT_ADMIN_ROLE` on production deployments.
- Only rotate the KYC registry between epochs (see `docs/operations.md`).
- Run `npm run slither` and external audit before mainnet launch.
