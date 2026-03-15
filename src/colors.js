const CLADE_COLORS = {
  'Pseudosuchia': '#8b949e',
  'Pterosauria': '#d2a8ff',
  'Herrerasauridae': '#ffa657',
  'Theropoda': '#f47067',
  'Coelophysidae': '#f47067',
  'Ceratosauria': '#ff7b72',
  'Tetanurae': '#f47067',
  'Megalosauridae': '#f47067',
  'Spinosauridae': '#f47067',
  'Allosauridae': '#f47067',
  'Coelurosauria': '#f47067',
  'Tyrannosauridae': '#f47067',
  'Ornithomimosauria': '#ffa198',
  'Maniraptora': '#f47067',
  'Dromaeosauridae': '#f47067',
  'Troodontidae': '#ffa198',
  'Avialae': '#f47067',
  'Sauropodomorpha': '#a5d6ff',
  'Sauropoda': '#79c0ff',
  'Diplodocidae': '#79c0ff',
  'Brachiosauridae': '#79c0ff',
  'Titanosauria': '#79c0ff',
  'Ornithischia': '#7ee787',
  'Thyreophora': '#56d364',
  'Stegosauria': '#56d364',
  'Ankylosauria': '#3fb950',
  'Neornithischia': '#7ee787',
  'Ornithopoda': '#7ee787',
  'Hadrosauridae': '#7ee787',
  'Marginocephalia': '#3fb950',
  'Pachycephalosauria': '#3fb950',
  'Ceratopsia': '#3fb950',
  'Ceratopsidae': '#3fb950',
};

// Walk up the tree to find the nearest ancestor with a color
export function getNodeColor(d) {
  let node = d;
  while (node) {
    if (CLADE_COLORS[node.data.name]) {
      return CLADE_COLORS[node.data.name];
    }
    node = node.parent;
  }
  return '#8b949e';
}
