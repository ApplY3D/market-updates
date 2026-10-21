export interface MarketGenerator {
  generate(batchSize: number): Uint32Array;
  dispose(): void;
}

export type GeneratorFactory = (seed: bigint, instrumentCount: number) => MarketGenerator;

export interface Scheduler {
  now(): number;
  /** Returns a cancel function. */
  schedule(task: () => void, delayMs: number): () => void;
}
