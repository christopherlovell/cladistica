# Cladistica

Interactive phylogenetic tree visualisation. Explore evolutionary relationships through zoomable, collapsible cladograms with geological timeline alignment.

**Live site:** [christopherlovell.co.uk/cladistica](https://christopherlovell.co.uk/cladistica/)

## Features

- **Radial and rectangular** tree layouts
- **Geological timeline** mode — taxa positioned by first appearance, with period/epoch bands
- **Collapsible nodes** — double-click to expand/collapse branches
- **Search** with lineage highlighting
- **Detail panel** with descriptions, time ranges, diet, and body length
- **Horizontal/vertical spacing** controls

## Development

```bash
npm install
npm run dev
```

## Data

Currently includes a Dinosauria phylogeny (~146 taxa from Archosauria to Aves). The data format is a nested JSON tree — see `data/dinosauria.json`.

### Attribution

The dinosaur catalogue referenced during development is maintained by [Aldo Cavini Benedetti](https://docs.google.com/spreadsheets/d/1rgflfIWW6x2h6jRRTe6cRO4YWc3mEKzVmJ7UzREFNq8/edit?gid=22644609#gid=22644609). Phylogenetic placement follows Benton (2005), Nesbitt (2011), and Baron et al. (2017).

## License

ISC
