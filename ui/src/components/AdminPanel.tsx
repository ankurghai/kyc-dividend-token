import { useState } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { isAddress } from "viem";
import { distributorAbi } from "../abi";
import { DISTRIBUTOR_ADDRESS } from "../config";
import { decodeContractError } from "../utils/decodeError";

export function AdminPanel() {
  const { address } = useAccount();
  const [epochId, setEpochId] = useState("0");
  const [treasury, setTreasury] = useState("");
  const [newWindowDays, setNewWindowDays] = useState("90");

  const { data: paused } = useReadContract({
    address: DISTRIBUTOR_ADDRESS,
    abi: distributorAbi,
    functionName: "paused",
  });

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const onReclaim = () => {
    const to = treasury || address;
    if (!to || !isAddress(to)) {
      alert("Enter a valid treasury address");
      return;
    }
    writeContract({
      address: DISTRIBUTOR_ADDRESS,
      abi: distributorAbi,
      functionName: "reclaim",
      args: [BigInt(epochId || "0"), to],
    });
  };

  const onSetWindow = () => {
    const days = Number(newWindowDays);
    if (!Number.isFinite(days) || days <= 0) {
      alert("Enter a positive number of days");
      return;
    }
    const seconds = BigInt(Math.round(days * 86400));
    writeContract({
      address: DISTRIBUTOR_ADDRESS,
      abi: distributorAbi,
      functionName: "setReclaimWindow",
      args: [seconds],
    });
  };

  const onTogglePause = () => {
    writeContract({
      address: DISTRIBUTOR_ADDRESS,
      abi: distributorAbi,
      functionName: paused ? "unpause" : "pause",
    });
  };

  return (
    <div className="card">
      <strong>Admin panel</strong>
      <p className="muted">
        DEFAULT_ADMIN_ROLE only. While paused, distribute, claim, and reclaim
        are all blocked.
      </p>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="secondary" onClick={onTogglePause} disabled={isPending}>
          {paused ? "Unpause distributor" : "Pause distributor"}
        </button>
        {paused ? <span className="badge warn">paused</span> : null}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Epoch to reclaim</label>
        <input value={epochId} onChange={(e) => setEpochId(e.target.value)} style={{ width: 80 }} />
        <label style={{ marginLeft: 12 }}>Treasury (defaults to your address)</label>
        <input
          placeholder="0x…"
          value={treasury}
          onChange={(e) => setTreasury(e.target.value)}
          style={{ minWidth: 280 }}
        />
        <button onClick={onReclaim} disabled={isPending} style={{ marginLeft: 8 }}>
          Reclaim remainder
        </button>
      </div>

      <div>
        <label>New reclaim window (days, future epochs only)</label>
        <input
          value={newWindowDays}
          onChange={(e) => setNewWindowDays(e.target.value)}
          style={{ width: 80 }}
        />
        <button onClick={onSetWindow} disabled={isPending} style={{ marginLeft: 8 }}>
          Update window
        </button>
      </div>

      {error ? <p className="error">{decodeContractError(error)}</p> : null}
      {isSuccess ? <p className="success">Admin transaction confirmed.</p> : null}
    </div>
  );
}
