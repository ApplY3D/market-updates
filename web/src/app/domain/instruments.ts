// prettier-ignore
const SYMBOLS = [
  'ALFA', 'BETA', 'GAMA', 'DELT', 'EPSI', 'ZETA', 'HETA', 'THET', 'IOTA', 'KAPA',
  'LAMB', 'MUON', 'NUXA', 'XION', 'OMIC', 'PIRA', 'RHOX', 'SIGM', 'TAUX', 'UPSI',
  'PHIX', 'CHIX', 'PSIX', 'OMEG', 'AURA', 'BORA', 'CYAN', 'DUNE', 'EMBR', 'FLUX',
  'GLOW', 'HALO', 'IRIS', 'JADE', 'KITE', 'LUNA', 'MOSS', 'NOVA', 'ONYX', 'PEAK',
  'QUIL', 'RUNE', 'SAGE', 'TIDE', 'UMBR', 'VALE', 'WISP', 'XENO', 'YARN', 'ZEST',
] as const;

export const symbolFor = (index: number): string => SYMBOLS[index] ?? `I${index}`;
