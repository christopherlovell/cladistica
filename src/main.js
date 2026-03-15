import * as d3 from 'd3';
import { getNodeColor } from './colors.js';
import { GEO_PERIODS, EPOCH_COLORS_ALT } from './timescale.js';
import treeData from '../data/dinosauria.json';

// ── State ──
let root;
let currentView = 'rectangular'; // 'radial' | 'rectangular'
let timelineEnabled = false;
let svg, g, gTimelineBands, gTimelineHeaders, gTree, zoomBehavior;
let width, height;
let spacingH = 1, spacingV = 1;

// ── Init ──
function init() {
  root = d3.hierarchy(treeData.tree);
  root.descendants().forEach(d => {
    d._children = d.children;
  });

  // Start fully collapsed, then open one showcase path
  collapseAll(root);
  expandPath(root, [
    'Avemetatarsalia', 'Dinosauromorpha', 'Dinosauriformes',
    'Dinosauria', 'Saurischia', 'Theropoda', 'Tetanurae',
    'Coelurosauria', 'Tyrannosauroidea', 'Tyrannosauridae', 'Tyrannosaurus'
  ]);

  const container = document.getElementById('viz');
  const rect = container.getBoundingClientRect();
  width = rect.width;
  height = rect.height;

  svg = d3.select('#viz')
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  // Bands layer: moves with full zoom (behind tree)
  gTimelineBands = svg.append('g').attr('class', 'timeline-bands-layer');
  // Main group: tree content
  g = svg.append('g');
  gTree = g.append('g').attr('class', 'tree-layer');
  // Headers layer: follows horizontal zoom only, pinned to top
  gTimelineHeaders = svg.append('g').attr('class', 'timeline-headers-layer');

  zoomBehavior = d3.zoom()
    .scaleExtent([0.2, 8])
    .on('zoom', (e) => {
      g.attr('transform', e.transform);
      // Bands follow full transform but extend beyond viewport
      gTimelineBands.attr('transform', e.transform);
      // Headers: reposition elements using the transform values
      // instead of scaling the group (which distorts text)
      updateTimelineHeaderPositions(e.transform);
    });

  svg.call(zoomBehavior);

  resetView();

  render();
  setupControls();
  setupSearch();

  window.addEventListener('resize', () => {
    const rect = document.getElementById('viz').getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    svg.attr('width', width).attr('height', height);
  });
}

// ── Render ──
function render() {
  const layoutRoot = computeLayoutDirect();
  const nodes = layoutRoot.descendants();
  const links = layoutRoot.links();

  // Render timeline bands if enabled
  renderTimeline(layoutRoot);

  // Links
  const linkSel = gTree.selectAll('.link')
    .data(links, d => linkId(d));

  linkSel.exit().transition().duration(300).style('opacity', 0).remove();

  const linkEnter = linkSel.enter()
    .append('path')
    .attr('class', 'link')
    .style('opacity', 0);

  linkSel.merge(linkEnter)
    .transition().duration(500)
    .style('opacity', 1)
    .attr('d', d => linkPath(d))
    .attr('stroke', d => getNodeColor(d.target));

  // Nodes
  const nodeSel = gTree.selectAll('.node')
    .data(nodes, d => nodeId(d));

  nodeSel.exit().transition().duration(300).style('opacity', 0).remove();

  const nodeEnter = nodeSel.enter()
    .append('g')
    .attr('class', d => {
      let cls = 'node';
      if (d.children || d.data._origHasChildren) cls += ' has-children';
      if (d.data._origCollapsed) cls += ' collapsed';
      return cls;
    })
    .style('opacity', 0)
    .attr('transform', d => nodeTransform(d));

  nodeEnter.append('circle')
    .attr('r', d => nodeRadius(d))
    .attr('fill', d => d.children ? 'var(--bg)' : getNodeColor(d))
    .attr('stroke', d => getNodeColor(d));

  nodeEnter.append('text')
    .attr('class', d => {
      const rank = d.data.rank;
      if (rank === 'genus' || rank === 'species') return 'label-genus';
      if (rank === 'clade' || rank === 'order') return 'label-clade';
      return '';
    })
    .text(d => d.data.name);

  // Update positions
  const merged = nodeSel.merge(nodeEnter);

  merged.transition().duration(500)
    .style('opacity', 1)
    .attr('transform', d => nodeTransform(d));

  merged.select('circle')
    .transition().duration(500)
    .attr('r', d => nodeRadius(d))
    .attr('fill', d => d.children ? 'var(--bg)' : getNodeColor(d))
    .attr('stroke', d => getNodeColor(d));

  merged.select('text')
    .transition().duration(500)
    .attr('dy', '0.31em')
    .attr('x', d => labelX(d))
    .attr('text-anchor', d => labelAnchor(d))
    .attr('transform', d => labelRotation(d));

  // Events
  merged
    .on('click', (event, d) => onNodeClick(event, d))
    .on('dblclick', (event, d) => onNodeDblClick(event, d))
    .on('mouseenter', (event, d) => showTooltip(event, d))
    .on('mousemove', (event) => moveTooltip(event))
    .on('mouseleave', () => hideTooltip());
}

// ── Timeline rendering ──
let timeScale = null;
const HEADER_HEIGHT = 100; // height of the fixed header area

function renderTimeline(layoutRoot) {
  gTimelineBands.selectAll('*').remove();
  gTimelineHeaders.selectAll('*').remove();

  if (!timelineEnabled || currentView !== 'rectangular') {
    timeScale = null;
    return;
  }

  const maxMa = 255;
  const minMa = 0;
  const treeW = Math.max(maxMa * 10 * spacingH, 800);
  timeScale = d3.scaleLinear()
    .domain([maxMa, minMa])
    .range([0, treeW]);

  // ── Bands: rendered in tree coordinate space, extend far vertically ──
  const bandTop = -2000;
  const bandBottom = 8000;
  const bandHeight = bandBottom - bandTop;

  const epochs = GEO_PERIODS.filter(p => p.level === 2 && p.start <= maxMa);
  gTimelineBands.selectAll('.epoch-band')
    .data(epochs)
    .join('rect')
    .attr('class', 'epoch-band')
    .attr('x', d => timeScale(Math.min(d.start, maxMa)))
    .attr('y', bandTop)
    .attr('width', d => timeScale(Math.max(d.end, minMa)) - timeScale(Math.min(d.start, maxMa)))
    .attr('height', bandHeight)
    .attr('fill', d => EPOCH_COLORS_ALT[d.name] || 'transparent');

  const periods = GEO_PERIODS.filter(p => p.level === 1 && p.start <= maxMa && p.start > minMa);
  gTimelineBands.selectAll('.period-line')
    .data(periods)
    .join('line')
    .attr('class', 'period-line')
    .attr('x1', d => timeScale(d.start))
    .attr('x2', d => timeScale(d.start))
    .attr('y1', bandTop)
    .attr('y2', bandBottom)
    .attr('stroke', 'var(--border)')
    .attr('stroke-width', 1)
    .attr('stroke-dasharray', '4 3')
    .attr('opacity', 0.5);

  // ── Headers: fixed to top of viewport ──
  // These are in their own group that only follows horizontal transform.
  // We draw a background so labels are readable over the tree.
  // SVG starts below the page header (main has padding-top: 52px),
  // so y=0 in SVG space is flush with the top of the content area.
  const headerTop = 0;

  // Helper to compute centre x for a period/epoch
  const cx = d => (timeScale(Math.min(d.start, maxMa)) + timeScale(Math.max(d.end, minMa))) / 2;

  gTimelineHeaders.append('rect')
    .attr('class', 'timeline-header-bg')
    .attr('x', -500)
    .attr('y', headerTop)
    .attr('width', width + 1000)
    .attr('height', HEADER_HEIGHT)
    .attr('fill', 'var(--bg)')
    .attr('opacity', 0.95);

  // Period labels
  const periodsForLabels = GEO_PERIODS.filter(p => p.level === 1 && p.end < maxMa);
  gTimelineHeaders.selectAll('.period-label')
    .data(periodsForLabels)
    .join('text')
    .attr('class', 'period-label')
    .attr('data-ox', d => cx(d))
    .attr('x', d => cx(d))
    .attr('y', headerTop + 26)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--text)')
    .attr('font-family', 'system-ui, -apple-system, sans-serif')
    .attr('font-size', '16px')
    .attr('font-weight', '700')
    .attr('letter-spacing', '0.08em')
    .text(d => d.name.toUpperCase());

  // Epoch labels — wrap onto two lines if the text doesn't fit
  const epochSel = gTimelineHeaders.selectAll('.epoch-label')
    .data(epochs)
    .join('text')
    .attr('class', 'epoch-label')
    .attr('data-ox', d => cx(d))
    .attr('x', d => cx(d))
    .attr('y', headerTop + 48)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--text)')
    .attr('font-family', 'system-ui, -apple-system, sans-serif')
    .attr('font-size', '12px')
    .attr('font-weight', '400')
    .attr('letter-spacing', '0.06em');

  epochSel.each(function(d) {
    const el = d3.select(this);
    const bandWidth = Math.abs(timeScale(Math.max(d.end, minMa)) - timeScale(Math.min(d.start, maxMa)));
    const words = d.name.split(' ');

    if (words.length > 1 && bandWidth < d.name.length * 8) {
      el.text(null);
      el.append('tspan')
        .attr('x', el.attr('x'))
        .attr('dy', '0')
        .text(words[0]);
      el.append('tspan')
        .attr('x', el.attr('x'))
        .attr('dy', '1.3em')
        .text(words.slice(1).join(' '));
    } else {
      el.text(d.name);
    }
  });

  // Ma ticks
  const ticks = d3.range(0, maxMa + 1, 10);
  gTimelineHeaders.selectAll('.ma-tick')
    .data(ticks)
    .join('text')
    .attr('class', 'ma-tick')
    .attr('data-ox', d => timeScale(d))
    .attr('x', d => timeScale(d))
    .attr('y', headerTop + 78)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--text)')
    .attr('font-family', 'system-ui, -apple-system, sans-serif')
    .attr('font-size', '10px')
    .attr('font-weight', '400')
    .attr('letter-spacing', '0.04em')
    .attr('opacity', 0.8)
    .text(d => `${d} Ma`);

  // Period boundary ticks in header
  gTimelineHeaders.selectAll('.period-tick')
    .data(periods)
    .join('line')
    .attr('class', 'period-tick')
    .attr('data-ox', d => timeScale(d.start))
    .attr('x1', d => timeScale(d.start))
    .attr('x2', d => timeScale(d.start))
    .attr('y1', headerTop)
    .attr('y2', headerTop + HEADER_HEIGHT)
    .attr('stroke', 'var(--border)')
    .attr('stroke-width', 1)
    .attr('opacity', 0.6);

  // Bottom border of header
  gTimelineHeaders.append('line')
    .attr('class', 'timeline-header-border')
    .attr('x1', -500)
    .attr('x2', width + 500)
    .attr('y1', headerTop + HEADER_HEIGHT)
    .attr('y2', headerTop + HEADER_HEIGHT)
    .attr('stroke', 'var(--border)')
    .attr('stroke-width', 1)
    .attr('opacity', 0.6);
}

function updateTimelineHeaderPositions(transform) {
  if (!timelineEnabled || !timeScale) return;

  const k = transform.k;
  const tx = transform.x;

  // Reposition all header elements: newX = originalX * k + tx
  gTimelineHeaders.selectAll('.period-label, .epoch-label, .ma-tick')
    .each(function() {
      const el = d3.select(this);
      const ox = +el.attr('data-ox');
      el.attr('x', ox * k + tx);
      // Also update tspan x values for wrapped text
      el.selectAll('tspan').attr('x', ox * k + tx);
    });

  gTimelineHeaders.selectAll('.period-tick')
    .each(function() {
      const el = d3.select(this);
      const ox = +el.attr('data-ox');
      el.attr('x1', ox * k + tx).attr('x2', ox * k + tx);
    });

  // Background and bottom border just need to span the viewport
  gTimelineHeaders.select('.timeline-header-bg')
    .attr('x', -tx / 1 - 500)
    .attr('width', width / 1 + 1000);

  gTimelineHeaders.select('.timeline-header-border')
    .attr('x1', -tx / 1 - 500)
    .attr('x2', width / 1 + 500);
}

// ── Direct layout ──
function computeLayoutDirect() {
  // Collect visible nodes via DFS
  function walk(node, depth, parent) {
    const entry = {
      data: { ...node.data, _origHasChildren: !!node._children && node._children.length > 0, _origCollapsed: !!node._collapsed },
      depth,
      parent,
      children: null,
      _origNode: node
    };

    if (node.children && !node._collapsed) {
      const kids = [];
      for (const child of node.children) {
        const childEntry = walk(child, depth + 1, entry);
        kids.push(childEntry);
      }
      entry.children = kids.length ? kids : null;
    }
    return entry;
  }

  const layoutRoot = walk(root, 0, null);

  // Convert to d3 hierarchy
  function toPlain(entry) {
    const obj = {
      name: entry.data.name, rank: entry.data.rank, info: entry.data.info,
      timeRange: entry.data.timeRange, _origHasChildren: entry.data._origHasChildren,
      _origCollapsed: entry.data._origCollapsed, _origNode: entry._origNode
    };
    if (entry.children) {
      obj.children = entry.children.map(toPlain);
    }
    return obj;
  }

  const h = d3.hierarchy(toPlain(layoutRoot));

  if (currentView === 'radial') {
    const maxDepth = d3.max(h.descendants(), d => d.depth) || 1;
    const radius = Math.min(width, height) / 2 - 60;
    const layout = d3.cluster()
      .size([360, radius])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / (a.depth || 1));
    layout(h);
    h.descendants().forEach(d => {
      d.y = (d.depth / maxDepth) * radius;
    });
  } else {
    const leafCount = h.leaves().length;
    const treeH = Math.max(leafCount * 22 * spacingV, 400);

    if (timelineEnabled) {
      // Use time scale for x positioning
      const maxMa = 255;
      const treeW = Math.max(maxMa * 10 * spacingH, 800);
      const tScale = d3.scaleLinear().domain([maxMa, 0]).range([0, treeW]);

      // First do a normal cluster layout for y positions
      const layout = d3.cluster().size([treeH, treeW]);
      layout(h);

      // Override x (stored as .y in cluster coords) with time-based position
      h.descendants().forEach(d => {
        const tr = d.data.timeRange;
        if (tr) {
          d.y = tScale(tr[0]);
        }
      });
    } else {
      const treeW = Math.max((h.height || 1) * 130 * spacingH, 400);
      const layout = d3.cluster().size([treeH, treeW]);
      layout(h);
    }
  }

  return h;
}

// ── Geometry helpers ──
function nodeTransform(d) {
  if (currentView === 'radial') {
    return `rotate(${d.x - 90}) translate(${d.y}, 0)`;
  }
  return `translate(${d.y}, ${d.x})`;
}

function linkPath(d) {
  if (currentView === 'radial') {
    return `M${radialPoint(d.target.x, d.target.y)}C${radialPoint(d.target.x, (d.source.y + d.target.y) / 2)} ${radialPoint(d.source.x, (d.source.y + d.target.y) / 2)} ${radialPoint(d.source.x, d.source.y)}`;
  }
  // Elbow connector: horizontal then vertical (more conventional for cladograms)
  if (timelineEnabled) {
    return `M${d.source.y},${d.source.x}H${d.target.y}V${d.target.x}`;
  }
  return `M${d.target.y},${d.target.x}C${(d.source.y + d.target.y) / 2},${d.target.x} ${(d.source.y + d.target.y) / 2},${d.source.x} ${d.source.y},${d.source.x}`;
}

function radialPoint(angle, radius) {
  const a = (angle - 90) / 180 * Math.PI;
  return `${radius * Math.cos(a)},${radius * Math.sin(a)}`;
}

function nodeRadius(d) {
  if (d.data._origCollapsed) return 6;
  if (!d.children && !d.data._origHasChildren) return 4;
  return 5;
}

function labelX(d) {
  if (currentView === 'radial') {
    return d.x < 180 ? 10 : -10;
  }
  return d.children ? -10 : 10;
}

function labelAnchor(d) {
  if (currentView === 'radial') {
    return d.x < 180 ? 'start' : 'end';
  }
  return d.children ? 'end' : 'start';
}

function labelRotation(d) {
  if (currentView === 'radial') {
    return d.x >= 180 ? 'rotate(180)' : '';
  }
  return '';
}

function nodeId(d) {
  return d.ancestors().map(a => a.data.name).reverse().join('/');
}

function linkId(d) {
  return nodeId(d.source) + '->' + nodeId(d.target);
}

// ── Interaction ──
function onNodeClick(event, d) {
  event.stopPropagation();
  showDetail(d);
}

function onNodeDblClick(event, d) {
  event.stopPropagation();

  const orig = d.data._origNode;

  // Toggle collapse if has children
  if (orig._children && orig._children.length > 0) {
    if (orig._collapsed) {
      orig._collapsed = false;
      orig.children = orig._children;
      for (const child of orig.children) {
        if (child._children && child._children.length > 0) {
          child._collapsed = true;
          child.children = null;
        }
      }
    } else {
      orig._collapsed = true;
      orig.children = null;
    }
    render();
  }
}

// ── Collapse/Expand helpers ──
function collapseAll(node) {
  if (node._children && node._children.length > 0) {
    if (node === root) {
      node._collapsed = false;
      node.children = node._children;
      for (const child of node.children) {
        collapseAll(child);
      }
    } else {
      node._collapsed = true;
      node.children = null;
      for (const child of node._children) {
        collapseAll(child);
      }
    }
  }
}

function expandPath(node, names) {
  if (names.length === 0) return;
  if (!node._children) return;
  node._collapsed = false;
  node.children = node._children;
  const next = names[0];
  for (const child of node.children) {
    if (child.data.name === next) {
      expandPath(child, names.slice(1));
    }
  }
}

function expandAll(node) {
  if (node._children && node._children.length > 0) {
    node._collapsed = false;
    node.children = node._children;
    for (const child of node.children) {
      expandAll(child);
    }
  }
}

// ── Tooltip ──
const tooltip = document.getElementById('tooltip');

function showTooltip(event, d) {
  const info = d.data.info || {};
  let html = `<span class="tt-name">${d.data.name}</span><span class="tt-rank">${d.data.rank || ''}</span>`;
  if (d.data.timeRange) {
    const [from, to] = d.data.timeRange;
    html += `<div class="tt-time">${from}–${to === 0 ? 'present' : to + ' Ma'}</div>`;
  }
  tooltip.innerHTML = html;
  tooltip.classList.add('visible');
  moveTooltip(event);
}

function moveTooltip(event) {
  const pad = 12;
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + 280 > window.innerWidth) x = event.clientX - 280 - pad;
  if (y + 80 > window.innerHeight) y = event.clientY - 80 - pad;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

function hideTooltip() {
  tooltip.classList.remove('visible');
}

// ── Detail panel ──
function showDetail(d) {
  const panel = document.getElementById('detail-panel');
  const info = d.data.info || {};

  document.getElementById('detail-name').textContent = d.data.name;
  document.getElementById('detail-rank').textContent = d.data.rank || 'taxon';
  document.getElementById('detail-description').textContent = info.description || '';

  const meta = document.getElementById('detail-meta');
  meta.innerHTML = '';

  if (d.data.timeRange) {
    const [from, to] = d.data.timeRange;
    addMeta(meta, 'Time range', `${from} – ${to === 0 ? 'present' : to} Ma`);
  }
  if (info.diet) addMeta(meta, 'Diet', info.diet);
  if (info.length_m) addMeta(meta, 'Length', `~${info.length_m} m`);

  if (d.data.timeRange && d.data.timeRange[1] === 0) {
    addMeta(meta, 'Status', 'Extant');
  } else {
    addMeta(meta, 'Status', 'Extinct');
  }

  panel.classList.remove('hidden');
  panel.classList.add('visible');
}

function addMeta(container, label, value) {
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  container.appendChild(dt);
  container.appendChild(dd);
}

// ── Controls ──
function setupControls() {
  const btnRadial = document.getElementById('btn-radial');
  const btnRect = document.getElementById('btn-rectangular');
  const btnTimeline = document.getElementById('btn-timeline');

  btnRadial.addEventListener('click', () => {
    if (currentView === 'radial') return;
    currentView = 'radial';
    btnRadial.classList.add('active');
    btnRect.classList.remove('active');
    resetView();
    render();
  });

  btnRect.addEventListener('click', () => {
    if (currentView === 'rectangular') return;
    currentView = 'rectangular';
    btnRect.classList.add('active');
    btnRadial.classList.remove('active');
    resetView();
    render();
  });

  btnTimeline.addEventListener('click', () => {
    timelineEnabled = !timelineEnabled;
    btnTimeline.classList.toggle('active', timelineEnabled);
    if (timelineEnabled && currentView !== 'rectangular') {
      currentView = 'rectangular';
      btnRect.classList.add('active');
      btnRadial.classList.remove('active');
    }
    resetView();
    render();
  });

  document.getElementById('btn-hzoom-in').addEventListener('click', () => {
    spacingH = Math.min(5, spacingH * 1.25);
    render();
  });
  document.getElementById('btn-hzoom-out').addEventListener('click', () => {
    spacingH = Math.max(0.2, spacingH / 1.25);
    render();
  });
  document.getElementById('btn-vzoom-in').addEventListener('click', () => {
    spacingV = Math.min(5, spacingV * 1.25);
    render();
  });
  document.getElementById('btn-vzoom-out').addEventListener('click', () => {
    spacingV = Math.max(0.2, spacingV / 1.25);
    render();
  });

  document.getElementById('btn-collapse-all').addEventListener('click', () => {
    collapseAll(root);
    render();
  });

  document.getElementById('btn-expand-all').addEventListener('click', () => {
    expandAll(root);
    render();
  });

  document.getElementById('detail-close').addEventListener('click', () => {
    const panel = document.getElementById('detail-panel');
    panel.classList.remove('visible');
    panel.classList.add('hidden');
  });

  // Click on background to close detail
  svg.on('click', () => {
    const panel = document.getElementById('detail-panel');
    panel.classList.remove('visible');
    panel.classList.add('hidden');
  });
}

function resetView() {
  let t;
  if (currentView === 'radial') {
    t = d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85);
  } else if (timelineEnabled) {
    t = d3.zoomIdentity.translate(width / 6, height / 2 - 40).scale(0.8);
  } else {
    t = d3.zoomIdentity.translate(width / 6, height / 2 - 100).scale(1);
  }
  svg.transition().duration(500).call(zoomBehavior.transform, t);
}

// ── Search ──
function setupSearch() {
  const input = document.getElementById('search');
  const resultsList = document.getElementById('search-results');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) {
      resultsList.classList.remove('open');
      clearHighlights();
      return;
    }

    const all = root.descendants();
    const matches = all.filter(d => d.data.name.toLowerCase().includes(q));

    resultsList.innerHTML = '';
    if (matches.length === 0) {
      resultsList.classList.remove('open');
      clearHighlights();
      return;
    }

    matches.slice(0, 12).forEach(m => {
      const li = document.createElement('li');
      li.innerHTML = `${m.data.name}<span class="rank">${m.data.rank || ''}</span>`;
      li.addEventListener('click', () => {
        input.value = m.data.name;
        resultsList.classList.remove('open');
        highlightNode(m);
        expandToNode(m);
        render();
      });
      resultsList.appendChild(li);
    });

    resultsList.classList.add('open');
  });

  input.addEventListener('blur', () => {
    setTimeout(() => resultsList.classList.remove('open'), 200);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      resultsList.classList.remove('open');
      clearHighlights();
    }
  });
}

function expandToNode(target) {
  let node = target;
  while (node) {
    if (node._collapsed) {
      node._collapsed = false;
      node.children = node._children;
    }
    node = node.parent;
  }
}

let highlightedNode = null;

function highlightNode(origNode) {
  highlightedNode = origNode;
  applyHighlights();
}

function clearHighlights() {
  highlightedNode = null;
  gTree.selectAll('.node').classed('search-match', false).classed('dimmed', false);
  gTree.selectAll('.link').classed('dimmed', false).classed('highlighted', false);
}

function applyHighlights() {
  if (!highlightedNode) return;

  const ancestorPath = new Set();
  let n = highlightedNode;
  while (n) {
    ancestorPath.add(n.data.name);
    n = n.parent;
  }

  gTree.selectAll('.node')
    .classed('search-match', d => d.data.name === highlightedNode.data.name)
    .classed('dimmed', d => !ancestorPath.has(d.data.name));

  gTree.selectAll('.link')
    .classed('highlighted', d => ancestorPath.has(d.target.data.name) && ancestorPath.has(d.source.data.name))
    .classed('dimmed', d => !(ancestorPath.has(d.target.data.name) && ancestorPath.has(d.source.data.name)));
}

// ── Start ──
document.addEventListener('DOMContentLoaded', init);
