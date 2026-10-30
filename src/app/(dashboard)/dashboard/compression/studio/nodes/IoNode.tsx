"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";

// ── Node data shapes ──────────────────────────────────────────────────────

export interface IoNodeData {
  variant: "input" | "output";
  tokens: number;
  savingsPercent?: number;
  label?: string;
  [key: string]: unknown;
}

// ── Component ─────────────────────────────────────────────────────────────

export function IoNode({ data }: NodeProps) {
  const { variant, tokens, savingsPercent } = data as IoNodeData;

  const isInput = variant === "input";
  // 67router flow nodes are monochrome: input/output read from the label, not a hue.
  const color = "var(--color-text-main)";

  return (
    <div className="min-w-[120px] rounded-card border border-border-strong bg-surface px-4 py-3 text-center transition-colors duration-200">
      {/* Input only uses source handle; Output only uses target handle */}
      {isInput ? (
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-transparent !border-0 !w-0 !h-0"
        />
      ) : (
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-transparent !border-0 !w-0 !h-0"
        />
      )}

      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.04em] text-text-muted">
        {isInput ? "Input" : "Output"}
      </div>

      <div className="text-base font-semibold tabular-nums" style={{ color }}>
        {(tokens as number).toLocaleString()}
      </div>
      <div className="text-[10px] text-text-muted">tokens</div>

      {!isInput && savingsPercent != null && (
        <div
          className="mt-1 text-[11px] font-semibold"
          style={{ color: "var(--orch-status-success)" }}
          data-testid="io-savings-percent"
        >
          {`-${(savingsPercent as number).toFixed(1)}%`}
        </div>
      )}
    </div>
  );
}

export default IoNode;
