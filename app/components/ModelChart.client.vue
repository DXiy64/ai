<script setup>
import Plotly from 'plotly.js-dist-min';
import fallbackData from '../../src/data.json';
let data = fallbackData;
import { onMounted, onBeforeUnmount, nextTick, ref, computed, watch } from 'vue';

const STORAGE_KEY = 'ai_model_chart_hidden_ids';

function getStoredHiddenIds() {
  if (typeof window === 'undefined' || !window.sessionStorage) return new Set();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveStoredHiddenIds(idsSet) {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...idsSet]));
  } catch {}
}

function clearStoredHiddenIds() {
  if (typeof window === 'undefined' || !window.sessionStorage) return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}

const chart = ref(null);
const failed = ref(false);
const searchQuery = ref('');
const searchOpen = ref(false);
const searchInput = ref(null);
let searchReturnFocus = null;
function closeSearch() {
  searchOpen.value = false;
  searchQuery.value = '';
  searchReturnFocus?.focus();
}
function trapSearchFocus(event) {
  const controls = [...event.currentTarget.querySelectorAll('input, button:not(:disabled)')];
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}
async function handleSearchKey(event) {
  if (event.isComposing || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape' && searchOpen.value) {
    event.preventDefault();
    closeSearch();
    return;
  }
  if (event.key !== '/' || event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  event.preventDefault();
  searchReturnFocus = document.activeElement;
  searchOpen.value = true;
  await nextTick();
  searchInput.value?.focus();
}
const searchData = ref(data.models);
const searchResults = computed(() => {
  // Split names at letter/number boundaries too: deep4.1 -> deep + 4.1.
  const words = searchQuery.value.normalize('NFKC').toLowerCase().match(/\p{L}+|\d+(?:\.\d+)*/gu) || [];
  if (!words.length) return [];
  return searchData.value.filter(model => words.every(word =>
    `${model.name} ${model.creator}`.normalize('NFKC').toLowerCase().includes(word)
  ));
});
const activeResult = ref(-1);
watch(searchResults, results => {
  activeResult.value = results.findIndex(canPlot);
});
async function handleResultKey(event) {
  if (event.isComposing || !['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
  // Native Enter already activates focused result buttons.
  if (event.key === 'Enter' && event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  const available = searchResults.value.map((model, index) => canPlot(model) ? index : -1).filter(index => index >= 0);
  if (!available.length || !ready) return;
  if (event.key === 'Enter') {
    const model = searchResults.value[activeResult.value];
    if (model && canPlot(model)) await locateModel(model);
    return;
  }
  const current = available.indexOf(activeResult.value);
  const direction = event.key === 'ArrowDown' ? 1 : -1;
  activeResult.value = available[(current + direction + available.length) % available.length];
  await nextTick();
  document.getElementById(`model-result-${activeResult.value}`)?.scrollIntoView({ block: 'nearest' });
}
const canPlot = model => [model.intelligence, model.cost, model.timeSeconds]
  .every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0);
const formatMetric = (value, digits = 2, prefix = '', suffix = '') =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? `${prefix}${value.toFixed(digits)}${suffix}` : '—';
const formatReleaseDate = value =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value) && Number.isFinite(Date.parse(value))
    ? value.slice(0, 10) : '—';
const missingMetrics = model => [
  ['intelligence', 'intelligence'], ['cost', 'cost'], ['timeSeconds', 'time']
].filter(([key]) => !(typeof model[key] === 'number' && Number.isFinite(model[key]) && model[key] >= 0))
  .map(([, label]) => label).join(', ');

async function locateModel(model) {
  if (!ready || !canPlot(model)) return;
  if (hiddenIds.value.has(model.id)) {
    hiddenIds.value = new Set([...hiddenIds.value].filter(id => id !== model.id));
    saveStoredHiddenIds(hiddenIds.value);
    await Plotly.react(chart.value, createTraces(), getLayout(false), config);
  }
  centerOnPoint({ x: model.intelligence, y: model.cost, z: model.timeSeconds / 60 });
  closeSearch();
}
const initialCamera = () => ({ eye: { x: 1.65, y: 1.65, z: 1.1 }, up: { x: 0, y: 0, z: 1 }, projection: { type: 'perspective' } });
const currentView = ref('4');
const planeViews = {
  '1': { eye: { x: 0, y: 1.3, z: 0 }, up: { x: 0, y: 0, z: -1 }, hidden: 'yaxis' },
  '2': { eye: { x: 1.3, y: 0, z: 0 }, up: { x: 0, y: 0, z: -1 }, hidden: 'xaxis' },
  '3': { eye: { x: 0, y: 0, z: 1.3 }, up: { x: 0, y: -1, z: 0 }, hidden: 'zaxis' }
};
const viewCamera = () => currentView.value === '4' ? initialCamera() : {
  eye: { ...planeViews[currentView.value].eye }, up: { ...planeViews[currentView.value].up }, center: { x: 0, y: 0, z: 0 }, projection: { type: 'orthographic' }
};
async function handleViewKey(event) {
  if (!['1', '2', '3', '4'].includes(event.key) || event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing || searchOpen.value) return;
  if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  if (!ready || !chart.value) return;
  event.preventDefault();
  currentView.value = event.key;
  hoveredModelId = null;
  hoveredPoint = null;
  await Plotly.react(chart.value, createTraces(), getLayout(true), config).catch(console.error);
}
let ready = false;
let hoveredModelId = null;
let hoveredPoint = null;

const hiddenIds = ref(getStoredHiddenIds());
const hiddenCount = computed(() => hiddenIds.value.size);

let models = data.models.filter(m => [m.intelligence, m.cost, m.timeSeconds].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0));
let providers = [...new Set(models.map(m => m.creator))].sort();
const colors = {
  OpenAI: '#25805c',
  Anthropic: '#c16e47',
  Meta: '#1877d2',
  Google: '#9366ce',
  NVIDIA: '#659626',
  SpaceXAI: '#6d5abe',
  'Institute of Foundation Models': '#405cc5'
};
const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function modelRange(key, scale = 1) {
  const maximum = Math.max(0, ...models.filter(model => !hiddenIds.value.has(model.id)).map(model => model[key] / scale));
  if (!maximum) return [0, 1];
  const roughStep = maximum / 8;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const step = [1, 2, 5, 10].find(value => value * magnitude >= roughStep) * magnitude;
  return [0, Math.ceil(maximum / step) * step];
}

const axis = (title, range, color, hideZero = false, prefix = '') => {
  const rough = range[1] / 8;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].find(value => value * magnitude >= rough) * magnitude;
  const ticks = Array.from({ length: Math.round(range[1] / step) + 1 }, (_, index) => index * step);
  return ({
  title: { text: currentView.value === '4' ? title : '', font: { size: 13, color } },
  gridcolor: '#e0e6ee',
  zeroline: false,
  linecolor: '#d5dce5',
  showbackground: false,
  tickfont: { size: 11, color },
  color,
  showline: false,
  linewidth: 1,
  showspikes: false,
  tickmode: 'array',
  tickvals: ticks,
  ticktext: ticks.map(value => hideZero && value === 0 ? '' : `${prefix}${value}`),
  autorange: false,
  range
  });
};

function createTraces() {
  const currentHidden = hiddenIds.value;
  return providers.map(provider => {
    const group = models.filter(m => m.creator === provider && !currentHidden.has(m.id));
    return {
      type: 'scatter3d',
      mode: 'markers',
      name: provider,
      x: group.map(m => m.intelligence),
      y: group.map(m => m.cost),
      z: group.map(m => m.timeSeconds / 60),
      text: group.map(m => escape(m.name)),
      hovertext: group.map(m => formatReleaseDate(m.releaseDate)),
      customdata: group.map(m => m.id),
      marker: {
        size: group.map(() => 5),
        color: colors[provider] || (group[0] && group[0].color),
        opacity: 0.9,
        line: { color: '#ffffff', width: 0.6 }
      },
      hovertemplate:
        '<b>%{text}</b><br>Release date: %{hovertext}<br>Intelligence Index: %{x:.2f}<br>Cost per Task: $%{y:.4f}<br>Time per Task: %{z:.2f} min<br><span style="color:#94a3b8;font-size:11px;">Double-click to center · Right-click to hide</span><extra>' +
        escape(provider) +
        '</extra>'
    };
  }).map(trace => {
    if (currentView.value === '4') return trace;
    const original = { x: trace.x, y: trace.y, z: trace.z };
    return {
      ...trace, type: 'scatter',
      x: currentView.value === '2' ? original.y : original.x,
      y: currentView.value === '3' ? original.y : original.z,
      z: undefined,
      marker: { ...trace.marker, size: 9 },
      hovertext: trace.customdata.map(id => {
        const model = models.find(model => model.id === id);
        return `<b>${escape(model.name)}</b><br>Release date: ${formatReleaseDate(model.releaseDate)}<br>Intelligence Index: ${model.intelligence.toFixed(2)}<br>Cost per Task: $${model.cost.toFixed(4)}<br>Time per Task: ${(model.timeSeconds / 60).toFixed(2)} min`;
      }),
      hovertemplate: '%{hovertext}<extra>' + escape(trace.name) + '</extra>'
    };
  });
}

const config = { responsive: true, displayModeBar: false, scrollZoom: true, doubleClick: false };

function getPlaneLayout(reset) {
  const horizontal = currentView.value === '2' ? 'cost' : 'intelligence';
  const vertical = currentView.value === '3' ? 'cost' : 'timeSeconds';
  const titles = { intelligence: 'Intelligence Index', cost: 'Cost per Task (USD)', timeSeconds: 'Time per Task (min)' };
  const colors = { intelligence: '#7b9bc9', cost: '#7ba58b', timeSeconds: '#a18bc5' };
  const planeAxis = key => ({
    title: { text: titles[key], standoff: 16, font: { size: 13, color: colors[key] } },
    range: key === 'intelligence' ? modelRange(key) : modelRange(key, key === 'timeSeconds' ? 60 : 1).reverse(),
    autorange: false, automargin: true, gridcolor: '#e0e6ee', zeroline: false,
    tickfont: { size: 11, color: colors[key] }, tickprefix: key === 'cost' ? '$' : '',
    linecolor: '#d5dce5', fixedrange: false
  });
  return {
    paper_bgcolor: '#ffffff', plot_bgcolor: '#ffffff',
    font: { family: 'Segoe UI, Microsoft YaHei, sans-serif', color: '#465366' },
    margin: { l: 75, r: 30, t: 30, b: 90 }, showlegend: false, dragmode: 'pan',
    uirevision: reset ? Date.now() : (chart.value?.layout?.uirevision ?? 'plane'),
    xaxis: planeAxis(horizontal), yaxis: planeAxis(vertical),
    hoverlabel: { bgcolor: '#ffffff', bordercolor: '#cbd5e1', font: { color: '#26354a', size: 12 } }
  };
}

const getLayout = (resetCamera = false) => currentView.value !== '4' ? getPlaneLayout(resetCamera) : ({
  paper_bgcolor: '#ffffff',
  plot_bgcolor: '#ffffff',
  font: { family: 'Segoe UI, Microsoft YaHei, sans-serif', color: '#465366' },
  margin: currentView.value === '4' ? { l: 20, r: 20, t: 20, b: 20 } : { l: 65, r: 30, t: 25, b: 75 },
  annotations: currentView.value === '4' ? [] : [
    { x: 0.5, y: 0, xref: 'paper', yref: 'paper', yshift: -18, text: currentView.value === '2' ? 'Cost per Task (USD)' : 'Intelligence Index', showarrow: false, font: { size: 13, color: currentView.value === '2' ? '#7ba58b' : '#7b9bc9' } },
    { x: 0, y: 0.5, xref: 'paper', yref: 'paper', xshift: -40, text: currentView.value === '3' ? 'Cost per Task (USD)' : 'Time per Task (min)', textangle: -90, showarrow: false, font: { size: 13, color: currentView.value === '3' ? '#7ba58b' : '#a18bc5' } }
  ],
  showlegend: false,
  uirevision: resetCamera ? Date.now() : (chart.value?.layout?.uirevision ?? 'model-chart-camera'),
  scene: {
    xaxis: { ...axis('X · Intelligence Index', modelRange('intelligence'), '#7b9bc9'), visible: planeViews[currentView.value]?.hidden !== 'xaxis' },
    yaxis: { ...axis('Y · Cost per Task (USD)', modelRange('cost'), '#7ba58b', true, '$'), visible: planeViews[currentView.value]?.hidden !== 'yaxis' },
    zaxis: { ...axis('Z · Time per Task (min)', modelRange('timeSeconds', 60), '#a18bc5', true), visible: planeViews[currentView.value]?.hidden !== 'zaxis' },
    annotations: [{
      x: modelRange('intelligence')[1] - 0.001,
      y: modelRange('cost')[0] + 0.001,
      z: modelRange('timeSeconds', 60)[0] + 0.001,
      text: '◇ Ideal corner',
      hovertext: 'Higher intelligence · Lower cost · Less time',
      showarrow: true,
      arrowhead: 0,
      arrowcolor: '#94a3b8',
      arrowwidth: 1,
      ax: 0,
      ay: 32,
      font: { size: 11, color: '#64748b' },
      bgcolor: 'rgba(255,255,255,0.85)',
      borderpad: 4
    }],
    aspectmode: currentView.value === '4' ? 'cube' : 'manual',

    camera: resetCamera ? viewCamera() : structuredClone(chart.value?._fullLayout?.scene?.camera ?? viewCamera()),
    dragmode: currentView.value === '4' ? 'orbit' : 'pan'
  },
  hoverlabel: { bgcolor: '#ffffff', bordercolor: '#cbd5e1', font: { color: '#26354a', size: 12 } }
});

async function hideModel(id) {
  if (!id || !ready || !chart.value) return;
  hiddenIds.value = new Set([...hiddenIds.value, id]);
  saveStoredHiddenIds(hiddenIds.value);
  hoveredModelId = null;
  hoveredPoint = null;
  await Plotly.react(chart.value, createTraces(), getLayout(false), config).catch(console.error);
}

function centerOnPoint(pt) {
  if (!pt || !ready || !chart.value) return;
  if (currentView.value !== '4') {
    const layout = chart.value._fullLayout;
    const x = currentView.value === '2' ? pt.y : pt.x;
    const y = currentView.value === '3' ? pt.y : pt.z;
    const centered = (range, value) => [value - (range[1] - range[0]) / 2, value + (range[1] - range[0]) / 2];
    Plotly.relayout(chart.value, { 'xaxis.range': centered(layout.xaxis.range, x), 'yaxis.range': centered(layout.yaxis.range, y) }).catch(console.error);
    return;
  }
  const scene = chart.value._fullLayout?.scene;
  const xr = modelRange('intelligence');
  const yr = modelRange('cost');
  const zr = modelRange('timeSeconds', 60);
  // Plotly maps each axis into a centered scene cube before applying the camera.
  const toScene = (range, value, aspect = 1) =>
    ((value - range[0]) / (range[1] - range[0]) - 0.5) * aspect;
  const center = {
    x: toScene(xr, pt.x, scene?.aspectratio?.x),
    y: toScene(yr, pt.y, scene?.aspectratio?.y),
    z: toScene(zr, pt.z, scene?.aspectratio?.z)
  };
  if (!Object.values(center).every(Number.isFinite)) return;

  const camera = scene?.camera || initialCamera();
  const previousCenter = camera.center || { x: 0, y: 0, z: 0 };
  const eye = Object.fromEntries(['x', 'y', 'z'].map(key => [
    key, camera.eye[key] + center[key] - previousCenter[key]
  ]));
  // Translate eye and target together to preserve viewing direction and distance.
  Plotly.relayout(chart.value, {
    'scene.camera': { up: { ...camera.up }, projection: { ...camera.projection }, center, eye },
    // Camera relayout can rerun gl3d autorange against its rescaled coordinates.
    // Keep the existing data bounds explicit so repeated centering stays stable.
    'scene.xaxis.autorange': false,
    'scene.yaxis.autorange': false,
    'scene.zaxis.autorange': false,
    'scene.xaxis.range': xr,
    'scene.yaxis.range': yr,
    'scene.zaxis.range': zr
  }).catch(console.error);
}

async function resetAll(event) {
  if (event) {
    if (event.key.toLowerCase() !== 'r' || event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing) return;
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
  }
  if (!ready || !chart.value) return;

  hiddenIds.value = new Set();
  clearStoredHiddenIds();
  hoveredModelId = null;
  hoveredPoint = null;

  await Plotly.react(chart.value, createTraces(), getLayout(true), config).catch(console.error);
  if (currentView.value === '4') Plotly.relayout(chart.value, { 'scene.camera': initialCamera() }).catch(console.error);
}

function handleContextMenu(event) {
  event.preventDefault();
  if (hoveredModelId) {
    hideModel(hoveredModelId);
  }
}

function handleDblClick(event) {
  if (event) event.preventDefault();
  if (hoveredPoint) {
    centerOnPoint(hoveredPoint);
  }
}

onMounted(async () => {
  await nextTick();
  try {
    try {
      const response = await fetch('/api/data', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Data HTTP ${response.status}`);
      const latest = await response.json();
      if (!Array.isArray(latest.models) || latest.models.length < 100) throw new Error('Invalid model data');
      const knownDates = new Map(fallbackData.models.map(model => [model.id, model.releaseDate]));
      data = { ...latest, models: latest.models.map(model => ({ ...model, releaseDate: model.releaseDate ?? knownDates.get(model.id) ?? null })) };
      searchData.value = data.models;
      models = data.models.filter(m => [m.intelligence, m.cost, m.timeSeconds].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0));
      providers = [...new Set(models.map(m => m.creator))].sort();
    } catch (error) {
      console.warn('Using bundled model snapshot', error);
    }
    await Plotly.newPlot(chart.value, createTraces(), { ...getLayout(true), camera: initialCamera() }, config);
    ready = true;

    chart.value.on('plotly_hover', (eventData) => {
      if (eventData?.points?.length) {
        const p = eventData.points[0];
        hoveredModelId = p.customdata;
        const model = models.find(model => model.id === p.customdata);
        hoveredPoint = model ? { x: model.intelligence, y: model.cost, z: model.timeSeconds / 60 } : null;
      }
    });

    chart.value.on('plotly_unhover', () => {
      hoveredModelId = null;
      hoveredPoint = null;
    });

    chart.value.on('plotly_click', (eventData) => {
      if (eventData?.points?.length) {
        const p = eventData.points[0];
        hoveredModelId = p.customdata;
        const model = models.find(model => model.id === p.customdata);
        hoveredPoint = model ? { x: model.intelligence, y: model.cost, z: model.timeSeconds / 60 } : null;
      }
    });

    chart.value.on('plotly_doubleclick', () => false);

    chart.value.addEventListener('dblclick', handleDblClick);
    chart.value.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', resetAll);
    window.addEventListener('keydown', handleSearchKey);
    window.addEventListener('keydown', handleViewKey);
  } catch (error) {
    failed.value = true;
    console.error(error);
  }
});

onBeforeUnmount(() => {
  ready = false;
  window.removeEventListener('keydown', resetAll);
  window.removeEventListener('keydown', handleSearchKey);
  window.removeEventListener('keydown', handleViewKey);
  if (chart.value) {
    chart.value.removeEventListener('dblclick', handleDblClick);
    chart.value.removeEventListener('contextmenu', handleContextMenu);
    Plotly.purge(chart.value);
  }
});
</script>

<template>
  <main aria-label="AI Model 3D Chart">
    <div v-if="searchOpen" class="search-overlay" @click.self="closeSearch">
    <section class="model-search" role="dialog" aria-modal="true" aria-label="Model search" @keydown.tab="trapSearchFocus" @keydown="handleResultKey">
      <input ref="searchInput" v-model="searchQuery" type="search" aria-label="Search models" placeholder="Search models, e.g. 6.1 sol high" autocomplete="off" aria-controls="model-search-results" :aria-activedescendant="activeResult >= 0 ? `model-result-${activeResult}` : undefined" />
      <p class="search-help">↑↓ Select · Enter Locate · Esc Close</p>
      <div v-if="searchQuery.trim()" class="search-results" aria-live="polite">
        <p class="search-summary">{{ searchResults.length ? `${searchResults.length} models found` : 'No matching models' }}</p>
        <ul id="model-search-results">
          <li v-for="(model, index) in searchResults" :key="model.id">
            <button :id="`model-result-${index}`" type="button" :class="{ 'active-result': activeResult === index }" @focus="activeResult = index" @mouseenter="canPlot(model) && (activeResult = index)" :disabled="!ready || !canPlot(model)" @click="locateModel(model)">
              <strong>{{ model.name }}</strong>
              <small>Release date: {{ formatReleaseDate(model.releaseDate) }}</small>
              <span class="result-metrics">
                <span>Intelligence <b>{{ formatMetric(model.intelligence) }}</b></span>
                <span>Cost <b>{{ formatMetric(model.cost, 4, '$') }}</b></span>
                <span>Time <b>{{ formatMetric(typeof model.timeSeconds === 'number' ? model.timeSeconds / 60 : null, 2, '', ' min') }}</b></span>
              </span>
              <small>{{ model.creator }} · {{ canPlot(model) ? (hiddenIds.has(model.id) ? 'Show and locate' : 'Locate in chart') : `Missing ${missingMetrics(model)}; cannot locate` }}</small>
            </button>
          </li>
        </ul>
      </div>
    </section>
    </div>
    <p class="usage-help"><span>/ Search · Double-click Center · Right-click Hide · R Reset</span><span>1, 2, 3, 4 Switch views</span></p>
    <div id="chart" :ref="el => chart = el" aria-label="X: Intelligence Index; Y: Cost per Task (USD); Z: Time per Task (min)" />
    <div v-if="hiddenCount > 0" id="reset-tip" @click="resetAll">
      {{ hiddenCount }} models hidden · <span class="action">Press R or click to reset</span>
    </div>
    <p v-if="failed" id="error" role="alert">Chart failed to load. Check that WebGL is enabled and refresh.</p>
  </main>
</template>

<style scoped>
.search-overlay { position: fixed; inset: 0; z-index: 20; background: #ffffff66; display: flex; justify-content: center; align-items: flex-start; padding-top: min(18vh, 120px); }
.model-search { width: min(420px, calc(100vw - 36px)); font-size: 13px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; box-shadow: 0 16px 48px #0f172a14; }
.search-help { margin: 10px 2px 0; font-size: 11px; color: #64748b; }
.usage-help { position: absolute; left: 18px; bottom: 14px; z-index: 10; margin: 0; max-width: calc(100vw - 36px); display: flex; flex-wrap: wrap; gap: 4px 16px; color: #7b8797; font-size: 11px; line-height: 1.7; pointer-events: none; }
.model-search input { box-sizing: border-box; width: 100%; padding: 10px 12px; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; color: #334155; font: inherit; box-shadow: 0 2px 8px #0000000a; }
.model-search input:focus { outline: 2px solid #93c5fd; outline-offset: 1px; }
.search-results { margin-top: 6px; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 8px 24px #00000014; max-height: min(420px, 65vh); overflow: auto; }
.search-summary { margin: 0; padding: 10px 12px; color: #64748b; }
.search-results ul { list-style: none; margin: 0; padding: 0; }
.search-results button { display: block; width: 100%; padding: 10px 12px; border: 0; border-top: 1px solid #f1f5f9; background: white; text-align: left; cursor: pointer; color: #334155; font: inherit; }
.search-results button.active-result, .search-results button:hover, .search-results button:focus-visible { background: #eff6ff; }
.search-results button:disabled { color: #94a3b8; cursor: default; }
.search-results strong, .search-results small { display: block; }
.result-metrics { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 7px; color: #64748b; font-size: 11px; font-variant-numeric: tabular-nums; }
.result-metrics b { font-weight: 500; color: #475569; }
.search-results button:disabled .result-metrics, .search-results button:disabled .result-metrics b { color: #94a3b8; }
.search-results small { margin-top: 4px; font-size: 11px; }

#reset-tip {
  position: absolute;
  top: 16px;
  right: 18px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 12px;
  color: #64748b;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  user-select: none;
  backdrop-filter: blur(4px);
  transition: all 0.2s ease;
  z-index: 10;
}
#reset-tip:hover {
  background: #ffffff;
  border-color: #cbd5e1;
  color: #334155;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}
#reset-tip .action {
  color: #2563eb;
  font-weight: 500;
}
</style>
