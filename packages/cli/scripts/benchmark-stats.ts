export const summarize = (samples: number[]) => {
  if (!samples.length || samples.some((sample) => !Number.isFinite(sample))) {
    throw new Error("Expected finite benchmark samples.");
  }
  const sorted = samples.toSorted((a, b) => a - b);
  const upper = sorted[Math.floor(sorted.length / 2)];
  const lower = sorted[Math.floor((sorted.length - 1) / 2)];
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
  if (upper === undefined || lower === undefined || p95 === undefined) {
    throw new Error("Missing benchmark samples.");
  }
  return { median: (lower + upper) / 2, p95 };
};
