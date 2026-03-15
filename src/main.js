import * as d3 from 'd3';
import { getNodeColor } from './colors.js';
import treeData from '../data/dinosauria.json';

// ── State ──
let root;
let currentView = 'radial'; // 'radial' | 'rectangular'
let svg, g, zoomBehavior;
let width, height;

// ── Init ──
function init() {
  root = d3.hierarchy(treeData.tree);
  root.descendants().forEach(d => {
    d._children = d.children;
  });

  const container = document.getElementById('viz');
  const rect = container.getBoundingClientRect();
  width = rect.width;
  height = rect.height;

  svg = d3.select('#viz')
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  g = svg.append('g');

  zoomBehavior = d3.zoom()
    .scaleExtent([0.2, 5])
    .on('zoom', (e) => g.attr('transform', e.transform));

  svg.call(zoomBehavior);

  // Initial center
  const initialTransform = d3.zoomIdentity
    .translate(width / 2, height / 2)
    .scale(0.85);
  svg.call(zoomBehavior.transform, initialTransform);

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

// ── Layout ──
function computeLayout() {
  const visibleRoot = pruneCollapsed(root);

  if (currentView === 'radial') {
    const radius = Math.min(width, height) / 2 - 80;
    const layout = d3.cluster()
      .size([360, radius])
      .separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth);
    layout(visibleRoot);

    visibleRoot.descendants().forEach(d => {
      d.y = d.depth * (radius / visibleRoot.height);
    });
  } else {
    const leafCount = visibleRoot.leaves().length;
    const treeHeight = Math.max(leafCount * 20, height - 100);
    const treeWidth = Math.max(visibleRoot.height * 180, width - 300);

    const layout = d3.cluster().size([treeHeight, treeWidth]);
    layout(visibleRoot);
  }

  return visibleRoot;
}

// Prune collapsed nodes — return a new hierarchy for layout
function pruneCollapsed(node) {
  const obj = { ...node.data };
  if (node.children && !node._collapsed) {
    obj.children = node.children.map(c => pruneCollapsed(c).data);
  } else {
    delete obj.children;
  }

  const newRoot = d3.hierarchy(obj);
  // Map back the _collapsed and original data
  const originals = node.descendants();
  const newNodes = newRoot.descendants();

  newNodes.forEach((n, i) => {
    if (i < originals.length) {
      n._orig = originals[i];
    }
  });

  return newRoot;
}

// ── Render ──
function render() {
  const layoutRoot = computeLayoutDirect();
  const nodes = layoutRoot.descendants();
  const links = layoutRoot.links();

  // Links
  const linkSel = g.selectAll('.link')
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
  const nodeSel = g.selectAll('.node')
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

// ── Direct layout (simpler approach without prune/remap issues) ──
function computeLayoutDirect() {
  // Collect visible nodes via DFS
  const flatNodes = [];
  const flatLinks = [];

  function walk(node, depth, parent) {
    const entry = {
      data: { ...node.data, _origHasChildren: !!node._children && node._children.length > 0, _origCollapsed: !!node._collapsed },
      depth,
      parent,
      children: null,
      _origNode: node
    };
    flatNodes.push(entry);

    if (node.children && !node._collapsed) {
      const kids = [];
      for (const child of node.children) {
        const childEntry = walk(child, depth + 1, entry);
        kids.push(childEntry);
        flatLinks.push({ source: entry, target: childEntry });
      }
      entry.children = kids.length ? kids : null;
    }
    return entry;
  }

  const layoutRoot = walk(root, 0, null);

  // Convert to d3 hierarchy
  function toPlain(entry) {
    const obj = { name: entry.data.name, rank: entry.data.rank, info: entry.data.info, timeRange: entry.data.timeRange, _origHasChildren: entry.data._origHasChildren, _origCollapsed: entry.data._origCollapsed, _origNode: entry._origNode };
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
    // Space depths evenly
    h.descendants().forEach(d => {
      d.y = (d.depth / maxDepth) * radius;
    });
  } else {
    const leafCount = h.leaves().length;
    const treeH = Math.max(leafCount * 22, 400);
    const treeW = Math.max((h.height || 1) * 200, 600);
    const layout = d3.cluster().size([treeH, treeW]);
    layout(h);
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
    } else {
      orig._collapsed = true;
      orig.children = null;
    }
    render();
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

  const extinct = d.data.extinct !== undefined ? d.data.extinct : true;
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
  if (currentView === 'radial') {
    const t = d3.zoomIdentity.translate(width / 2, height / 2).scale(0.85);
    svg.transition().duration(500).call(zoomBehavior.transform, t);
  } else {
    const t = d3.zoomIdentity.translate(80, -50).scale(0.75);
    svg.transition().duration(500).call(zoomBehavior.transform, t);
  }
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
  // Expand all ancestors
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
  g.selectAll('.node').classed('search-match', false).classed('dimmed', false);
  g.selectAll('.link').classed('dimmed', false).classed('highlighted', false);
}

function applyHighlights() {
  if (!highlightedNode) return;

  // Build set of ancestor names for the highlighted node
  const ancestorPath = new Set();
  let n = highlightedNode;
  while (n) {
    ancestorPath.add(n.data.name);
    n = n.parent;
  }

  g.selectAll('.node')
    .classed('search-match', d => d.data.name === highlightedNode.data.name)
    .classed('dimmed', d => !ancestorPath.has(d.data.name));

  g.selectAll('.link')
    .classed('highlighted', d => ancestorPath.has(d.target.data.name) && ancestorPath.has(d.source.data.name))
    .classed('dimmed', d => !(ancestorPath.has(d.target.data.name) && ancestorPath.has(d.source.data.name)));
}

// ── Start ──
document.addEventListener('DOMContentLoaded', init);
