/** Minimal ABIs for the dividend distribution UI. */

export const distributorAbi = [
  {
    type: "function",
    name: "epochCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "epochs",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "snapshotId", type: "uint256" },
      { name: "totalPool", type: "uint256" },
      { name: "supplyAt", type: "uint256" },
      { name: "createdAt", type: "uint256" },
      { name: "distributed", type: "uint256" },
      { name: "escrowedTotal", type: "uint256" },
      { name: "reclaimWindow", type: "uint256" },
      { name: "reclaimed", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "reclaimWindow",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "entitlement",
    stateMutability: "view",
    inputs: [
      { name: "epoch", type: "uint256" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "escrow",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "hasClaimed",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256" },
      { name: "", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [{ name: "epoch", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimEscrow",
    stateMutability: "nonpayable",
    inputs: [{ name: "epoch", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "createEpoch",
    stateMutability: "nonpayable",
    inputs: [{ name: "totalPool", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "distribute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "epoch", type: "uint256" },
      { name: "recipients", type: "address[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reclaim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "epoch", type: "uint256" },
      { name: "to", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setReclaimWindow",
    stateMutability: "nonpayable",
    inputs: [{ name: "newWindow", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "pause",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "unpause",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "error",
    name: "AlreadyClaimed",
    inputs: [],
  },
  {
    type: "error",
    name: "NotKycAllowed",
    inputs: [],
  },
  {
    type: "error",
    name: "EscrowClaimWindowExpired",
    inputs: [],
  },
  {
    type: "error",
    name: "ReclaimWindowActive",
    inputs: [],
  },
  {
    type: "error",
    name: "NoEscrowBalance",
    inputs: [],
  },
  {
    type: "error",
    name: "EpochReclaimed",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidEpoch",
    inputs: [],
  },
  {
    type: "event",
    name: "Paid",
    inputs: [
      { name: "epoch", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Escrowed",
    inputs: [
      { name: "epoch", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Skipped",
    inputs: [
      { name: "epoch", type: "uint256", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "reason", type: "string", indexed: false },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

export const rwaTransferEventAbi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;
