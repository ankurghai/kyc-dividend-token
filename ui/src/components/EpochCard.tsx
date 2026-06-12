import { useEffect } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { distributorAbi } from "../abi";
import { DISTRIBUTOR_ADDRESS } from "../config";
import { useKycPermission } from "../hooks/useKycPermission";
import { usePaymentToken } from "../hooks/usePaymentToken";
import { decodeContractError } from "../utils/decodeError";
import { formatTokenAmount } from "../utils/formatToken";

export function EpochCard({ epochId }: { epochId: bigint }) {
  const { address } = useAccount();
  const { isPermitted, isLoading: kycLoading } = useKycPermission(address);
  const { decimals, symbol } = usePaymentToken();

  const { data: epoch } = useReadContract({
    address: DISTRIBUTOR_ADDRESS,
    abi: distributorAbi,
    functionName: "epochs",
    args: [epochId],
  });

  const { data: entitlement, refetch: refetchEntitlement } = useReadContract({
    address: DISTRIBUTOR_ADDRESS,
    abi: distributorAbi,
    functionName: "entitlement",
    args: address ? [epochId, address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { data: escrowAmount, refetch: refetchEscrow } = useReadContract({
    address: DISTRIBUTOR_ADDRESS,
    abi: distributorAbi,
    functionName: "escrow",
    args: address ? [epochId, address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { data: claimed, refetch: refetchClaimed } = useReadContract({
    address: DISTRIBUTOR_ADDRESS,
    abi: distributorAbi,
    functionName: "hasClaimed",
    args: address ? [epochId, address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const { writeContract, data: txHash, isPending, error: txError } = useWriteContract();
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: Boolean(txHash) },
  });

  useEffect(() => {
    if (txConfirmed) {
      refetchEntitlement();
      refetchEscrow();
      refetchClaimed();
    }
  }, [txConfirmed, refetchEntitlement, refetchEscrow, refetchClaimed]);

  if (!epoch) return null;

  const [, totalPool, , createdAt, distributed, escrowedTotal, reclaimWindow, reclaimed] = epoch;
  const deadline = new Date(Number(createdAt + reclaimWindow) * 1000);
  const windowOpen = Date.now() / 1000 <= Number(createdAt + reclaimWindow);

  const canClaim = !reclaimed && !claimed && (entitlement ?? 0n) > 0n;
  const canClaimEscrow = !reclaimed && windowOpen && (escrowAmount ?? 0n) > 0n;

  const fmt = (v: bigint) => formatTokenAmount(v, decimals, symbol);

  const onClaim = () => {
    if (
      !isPermitted &&
      !window.confirm(
        "Your address has no chain permission (KYC). Claiming now will escrow your dividend until you verify. Continue?"
      )
    ) {
      return;
    }
    writeContract({
      address: DISTRIBUTOR_ADDRESS,
      abi: distributorAbi,
      functionName: "claim",
      args: [epochId],
    });
  };

  const onClaimEscrow = () => {
    writeContract({
      address: DISTRIBUTOR_ADDRESS,
      abi: distributorAbi,
      functionName: "claimEscrow",
      args: [epochId],
    });
  };

  return (
    <div className="card">
      <div className="row">
        <strong>Epoch #{epochId.toString()}</strong>
        {reclaimed ? (
          <span className="badge warn">closed (reclaimed)</span>
        ) : windowOpen ? (
          <span className="badge ok">escrow window open until {deadline.toLocaleDateString()}</span>
        ) : (
          <span className="badge neutral">escrow window expired</span>
        )}
      </div>
      <p className="muted">
        Pool {fmt(totalPool)} · paid {fmt(distributed)} · escrowed {fmt(escrowedTotal)}
      </p>

      <div className="row">
        <div>
          <div>
            Your entitlement: <strong>{fmt(entitlement ?? 0n)}</strong>
            {claimed ? <span className="muted"> (settled)</span> : null}
          </div>
          <div>
            Your escrow: <strong>{fmt(escrowAmount ?? 0n)}</strong>
          </div>
        </div>
        <div>
          <button onClick={onClaim} disabled={!canClaim || isPending || kycLoading}>
            {isPending ? "Confirming…" : "Claim dividend"}
          </button>{" "}
          <button
            className="secondary"
            onClick={onClaimEscrow}
            disabled={!canClaimEscrow || !isPermitted || isPending || kycLoading}
            title={
              !isPermitted && (escrowAmount ?? 0n) > 0n
                ? "Requires chain permission (KYC) — verify first"
                : undefined
            }
          >
            Claim escrow
          </button>
        </div>
      </div>

      {txError ? <p className="error">{decodeContractError(txError)}</p> : null}
      {txConfirmed ? <p className="success">Transaction confirmed.</p> : null}
    </div>
  );
}
