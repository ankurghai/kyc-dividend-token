import { decodeErrorResult } from "viem";
import { distributorAbi } from "../abi";

const ERROR_MESSAGES: Record<string, string> = {
  AlreadyClaimed: "You have already claimed this epoch.",
  NotKycAllowed: "Your address is not KYC-verified on Redbelly.",
  EscrowClaimWindowExpired: "The escrow claim window has expired.",
  ReclaimWindowActive: "Reclaim is not available until the escrow window closes.",
  NoEscrowBalance: "No escrow balance for your address.",
  EpochReclaimed: "This epoch has been reclaimed and is closed.",
  InvalidEpoch: "Invalid epoch number.",
  ZeroAddress: "A required address was zero.",
  ZeroAmount: "Amount must be greater than zero.",
  ZeroWindow: "Reclaim window must be greater than zero.",
  InsufficientRescuableBalance: "Cannot rescue committed dividend funds.",
};

export function decodeContractError(error: unknown): string {
  if (!error || typeof error !== "object") return "Transaction failed.";

  const err = error as { message?: string; data?: `0x${string}`; shortMessage?: string };
  const raw = err.shortMessage ?? err.message ?? "";

  if (err.data) {
    try {
      const decoded = decodeErrorResult({ abi: distributorAbi, data: err.data });
      const friendly = ERROR_MESSAGES[decoded.errorName];
      if (friendly) return friendly;
      return decoded.errorName;
    } catch {
      // fall through
    }
  }

  for (const [name, msg] of Object.entries(ERROR_MESSAGES)) {
    if (raw.includes(name)) return msg;
  }

  if (raw.includes("Pausable: paused")) return "Contract is paused.";
  if (raw.includes("User rejected")) return "Transaction rejected in wallet.";

  return raw.length > 200 ? raw.slice(0, 200) + "…" : raw || "Transaction failed.";
}
