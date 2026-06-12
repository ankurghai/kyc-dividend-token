import { useEffect, useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWalletClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { isAddress, parseEventLogs } from "viem";
import { distributorAbi, erc20Abi, rwaTransferEventAbi } from "../abi";
import {
  DISTRIBUTOR_ADDRESS,
  PAYMENT_TOKEN_ADDRESS,
  RWA_TOKEN_ADDRESS,
} from "../config";
import { usePaymentToken } from "../hooks/usePaymentToken";
import { decodeContractError } from "../utils/decodeError";
import { formatTokenAmount, parseTokenAmount } from "../utils/formatToken";

const CHUNK_SIZE = 100;
const ZERO = "0x0000000000000000000000000000000000000000";

type DistributionResult = {
  paid: { recipient: string; amount: bigint }[];
  escrowed: { recipient: string; amount: bigint }[];
  skipped: { recipient: string; reason: string }[];
};

export function OperatorPanel() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { decimals, symbol } = usePaymentToken();

  const [pool, setPool] = useState("");
  const [epochId, setEpochId] = useState("0");
  const [recipients, setRecipients] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [results, setResults] = useState<DistributionResult | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (!receipt) return;
    const paid = parseEventLogs({ abi: distributorAbi, logs: receipt.logs, eventName: "Paid" });
    const escrowed = parseEventLogs({
      abi: distributorAbi,
      logs: receipt.logs,
      eventName: "Escrowed",
    });
    const skipped = parseEventLogs({
      abi: distributorAbi,
      logs: receipt.logs,
      eventName: "Skipped",
    });

    setResults((prev) => ({
      paid: [
        ...(prev?.paid ?? []),
        ...paid.map((e) => ({
          recipient: e.args.recipient as string,
          amount: e.args.amount as bigint,
        })),
      ],
      escrowed: [
        ...(prev?.escrowed ?? []),
        ...escrowed.map((e) => ({
          recipient: e.args.recipient as string,
          amount: e.args.amount as bigint,
        })),
      ],
      skipped: [
        ...(prev?.skipped ?? []),
        ...skipped.map((e) => ({
          recipient: e.args.recipient as string,
          reason: e.args.reason as string,
        })),
      ],
    }));
  }, [receipt]);

  const parseRecipients = () =>
    recipients
      .split(/[\s,]+/)
      .map((a) => a.trim())
      .filter((a) => a.length > 0);

  const onApprove = () => {
    writeContract({
      address: PAYMENT_TOKEN_ADDRESS,
      abi: erc20Abi,
      functionName: "approve",
      args: [DISTRIBUTOR_ADDRESS, parseTokenAmount(pool, decimals)],
    });
  };

  const onCreateEpoch = () => {
    writeContract({
      address: DISTRIBUTOR_ADDRESS,
      abi: distributorAbi,
      functionName: "createEpoch",
      args: [parseTokenAmount(pool, decimals)],
    });
  };

  const onDiscoverHolders = async () => {
    if (!publicClient) return;
    setDiscovering(true);
    try {
      const logs = await publicClient.getLogs({
        address: RWA_TOKEN_ADDRESS,
        event: rwaTransferEventAbi[0],
        fromBlock: 0n,
        toBlock: "latest",
      });

      const holders = new Set<string>();
      for (const log of logs) {
        const from = log.args.from as string;
        const to = log.args.to as string;
        if (from !== ZERO) holders.add(from);
        if (to !== ZERO) holders.add(to);
      }

      // Drop addresses with zero current balance — distributing to them only
      // burns gas on Skipped events. (Plain parallel reads: Redbelly has no
      // registered Multicall3 in our chain config.)
      const candidates = Array.from(holders) as `0x${string}`[];
      const balances = await Promise.all(
        candidates.map((holder) =>
          publicClient
            .readContract({
              address: RWA_TOKEN_ADDRESS,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [holder],
            })
            .catch(() => 0n)
        )
      );
      const current = candidates.filter((_, i) => balances[i] > 0n);

      setRecipients(current.join("\n"));
    } finally {
      setDiscovering(false);
    }
  };

  const onDistribute = async () => {
    const list = parseRecipients();
    const invalid = list.filter((a) => !isAddress(a));
    if (invalid.length > 0) {
      alert(`Invalid addresses:\n${invalid.join("\n")}`);
      return;
    }

    setResults({ paid: [], escrowed: [], skipped: [] });
    setBatchError(null);

    if (!walletClient || list.length <= CHUNK_SIZE) {
      writeContract({
        address: DISTRIBUTOR_ADDRESS,
        abi: distributorAbi,
        functionName: "distribute",
        args: [BigInt(epochId || "0"), list as `0x${string}`[]],
      });
      return;
    }

    try {
      for (let i = 0; i < list.length; i += CHUNK_SIZE) {
      const batch = list.slice(i, i + CHUNK_SIZE) as `0x${string}`[];
      const hash = await walletClient.writeContract({
        address: DISTRIBUTOR_ADDRESS,
        abi: distributorAbi,
        functionName: "distribute",
        args: [BigInt(epochId || "0"), batch],
      });
      const batchReceipt = await publicClient!.waitForTransactionReceipt({ hash });
      const paid = parseEventLogs({
        abi: distributorAbi,
        logs: batchReceipt.logs,
        eventName: "Paid",
      });
      const escrowed = parseEventLogs({
        abi: distributorAbi,
        logs: batchReceipt.logs,
        eventName: "Escrowed",
      });
      const skipped = parseEventLogs({
        abi: distributorAbi,
        logs: batchReceipt.logs,
        eventName: "Skipped",
      });

      setResults((prev) => ({
        paid: [
          ...(prev?.paid ?? []),
          ...paid.map((e) => ({
            recipient: e.args.recipient as string,
            amount: e.args.amount as bigint,
          })),
        ],
        escrowed: [
          ...(prev?.escrowed ?? []),
          ...escrowed.map((e) => ({
            recipient: e.args.recipient as string,
            amount: e.args.amount as bigint,
          })),
        ],
        skipped: [
          ...(prev?.skipped ?? []),
          ...skipped.map((e) => ({
            recipient: e.args.recipient as string,
            reason: e.args.reason as string,
          })),
        ],
      }));
      }
    } catch (err) {
      setBatchError(
        `Batch failed partway — results above are complete for finished batches. ` +
          `Re-run distribute with the same list; settled holders are skipped automatically. ` +
          `(${decodeContractError(err)})`
      );
    }
  };

  return (
    <div className="card">
      <strong>Operator panel</strong>
      <p className="muted">
        OPERATOR_ROLE only. KYC is checked per recipient at distribution time.
      </p>

      <div style={{ marginBottom: 16 }}>
        <label>Dividend pool ({symbol})</label>
        <div className="row">
          <input
            placeholder="e.g. 1000"
            value={pool}
            onChange={(e) => setPool(e.target.value)}
          />
          <button className="secondary" onClick={onApprove} disabled={isPending}>
            1. Approve
          </button>
          <button onClick={onCreateEpoch} disabled={isPending || !pool}>
            2. Create epoch
          </button>
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label>Epoch ID</label>
        <input
          value={epochId}
          onChange={(e) => setEpochId(e.target.value)}
          style={{ width: 90, marginRight: 12 }}
        />
        <button className="secondary" onClick={onDiscoverHolders} disabled={discovering}>
          {discovering ? "Scanning…" : "Discover holders from Transfer logs"}
        </button>
      </div>

      <textarea
        rows={4}
        placeholder="Recipient addresses (one per line)"
        value={recipients}
        onChange={(e) => setRecipients(e.target.value)}
      />

      <button
        onClick={onDistribute}
        disabled={isPending || recipients.trim() === ""}
        style={{ marginTop: 8 }}
      >
        3. Distribute ({parseRecipients().length} recipients, chunks of {CHUNK_SIZE})
      </button>

      {error ? <p className="error">{decodeContractError(error)}</p> : null}
      {batchError ? <p className="error">{batchError}</p> : null}
      {isSuccess ? <p className="success">Distribution transaction confirmed.</p> : null}

      {results && (results.paid.length > 0 || results.escrowed.length > 0 || results.skipped.length > 0) ? (
        <div style={{ marginTop: 12 }}>
          <strong>Results</strong>
          <p className="muted">
            Paid: {results.paid.length} · Escrowed: {results.escrowed.length} · Skipped:{" "}
            {results.skipped.length}
          </p>
          <ul className="muted" style={{ fontSize: "0.85rem", maxHeight: 160, overflow: "auto" }}>
            {results.paid.slice(0, 20).map((r) => (
              <li key={`p-${r.recipient}`}>
                Paid {r.recipient.slice(0, 8)}… {formatTokenAmount(r.amount, decimals, symbol)}
              </li>
            ))}
            {results.escrowed.slice(0, 20).map((r) => (
              <li key={`e-${r.recipient}`}>
                Escrowed {r.recipient.slice(0, 8)}…{" "}
                {formatTokenAmount(r.amount, decimals, symbol)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
