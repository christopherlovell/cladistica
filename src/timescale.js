// Geological time periods (ICS 2023)
// Each entry: [name, startMa, endMa, level]
// level: 0 = era, 1 = period, 2 = epoch

export const GEO_PERIODS = [
  // Eras
  { name: 'Mesozoic', start: 252, end: 66, level: 0 },
  { name: 'Cenozoic', start: 66, end: 0, level: 0 },

  // Periods
  { name: 'Triassic', start: 252, end: 201, level: 1 },
  { name: 'Jurassic', start: 201, end: 145, level: 1 },
  { name: 'Cretaceous', start: 145, end: 66, level: 1 },
  { name: 'Paleogene', start: 66, end: 23, level: 1 },
  { name: 'Neogene', start: 23, end: 2.6, level: 1 },

  // Epochs
  { name: 'Early Triassic', start: 252, end: 247, level: 2 },
  { name: 'Middle Triassic', start: 247, end: 237, level: 2 },
  { name: 'Late Triassic', start: 237, end: 201, level: 2 },
  { name: 'Early Jurassic', start: 201, end: 174, level: 2 },
  { name: 'Middle Jurassic', start: 174, end: 163, level: 2 },
  { name: 'Late Jurassic', start: 163, end: 145, level: 2 },
  { name: 'Early Cretaceous', start: 145, end: 100, level: 2 },
  { name: 'Late Cretaceous', start: 100, end: 66, level: 2 },
];

// Colors for period bands (subtle, for background)
export const PERIOD_COLORS = {
  'Triassic': '#8b494920',
  'Jurassic': '#4a6b8b20',
  'Cretaceous': '#4a8b5920',
  'Paleogene': '#8b7b4a20',
  'Neogene': '#8b6b4a20',
};

// Slightly different shades for epoch alternation
export const EPOCH_COLORS_ALT = {
  'Early Triassic': '#8b494918',
  'Middle Triassic': '#8b494928',
  'Late Triassic': '#8b494918',
  'Early Jurassic': '#4a6b8b18',
  'Middle Jurassic': '#4a6b8b28',
  'Late Jurassic': '#4a6b8b18',
  'Early Cretaceous': '#4a8b5918',
  'Late Cretaceous': '#4a8b5928',
};
