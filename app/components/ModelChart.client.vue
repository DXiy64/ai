<script setup>
import Plotly from 'plotly.js-gl3d-dist-min';
import data from '../../src/data.json';
import { onMounted, onBeforeUnmount, nextTick, ref, computed } from 'vue';

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
const initialCamera = () => ({ eye: { x: 1.65, y: 1.65, z: 1.1 }, up: { x: 0, y: 0, z: 1 }, projection: { type: 'perspective' } });
let ready = false;
let hoveredModelId = null;
let hoveredPoint = null;

const hiddenIds = ref(getStoredHiddenIds());
const hiddenCount = computed(() => hiddenIds.value.size);

const models = data.models.filter(m => [m.intelligence, m.cost, m.timeSeconds].every(v => typeof v === 'number' && Number.isFinite(v) && v >= 0));
const providers = [...new Set(models.map(m => m.creator))].sort();
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

const axis = title => ({
  title: { text: title, font: { size: 13, color: '#465366' } },
  gridcolor: '#e0e6ee',
  zerolinecolor: '#c5cfdb',
  linecolor: '#c5cfdb',
  showbackground: false,
  tickfont: { size: 11, color: '#69768a' },
  color: '#465366',
  showspikes: false,
  autorange: true
});

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
      customdata: group.map(m => m.id),
      marker: {
        size: 5,
        color: colors[provider] || (group[0] && group[0].color),
        opacity: 0.9,
        line: { color: '#ffffff', width: 0.6 }
      },
      hovertemplate:
        '<b>%{text}</b><br>Intelligence Index: %{x:.2f}<br>Cost per Task: $%{y:.4f}<br>Time per Task: %{z:.2f} min<br><span style="color:#94a3b8;font-size:11px;">左键双击居中 · 右键点击隐藏此点</span><extra>' +
        escape(provider) +
        '</extra>'
    };
  });
}

const config = { responsive: true, displayModeBar: false, scrollZoom: true };

const getLayout = (resetCamera = false) => ({
  paper_bgcolor: '#ffffff',
  plot_bgcolor: '#ffffff',
  font: { family: 'Segoe UI, Microsoft YaHei, sans-serif', color: '#465366' },
  margin: { l: 20, r: 20, t: 20, b: 20 },
  showlegend: false,
  uirevision: resetCamera ? Date.now() : 'model-chart-camera',
  scene: {
    xaxis: axis('X · Intelligence Index'),
    yaxis: { ...axis('Y · Cost per Task (USD)'), tickprefix: '$' },
    zaxis: axis('Z · Time per Task (min)'),
    aspectmode: 'cube',
    ...(resetCamera ? { camera: initialCamera() } : {}),
    dragmode: 'orbit'
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
  const scene = chart.value._fullLayout?.scene;
  const rangeOf = (ax, fallback) => {
    const r = scene?.[ax]?.range;
    if (Array.isArray(r) && r.length === 2 && r.every(v => Number.isFinite(v))) return r;
    return fallback;
  };
  const xs = models.map(m => m.intelligence);
  const ys = models.map(m => m.cost);
  const zs = models.map(m => m.timeSeconds / 60);
  const fallbackRange = arr => {
    const lo = Math.min(...arr);
    const hi = Math.max(...arr);
    const pad = (hi - lo) * 0.05 || 1;
    return [lo - pad, hi + pad];
  };
  const xr = rangeOf('xaxis', fallbackRange(xs));
  const yr = rangeOf('yaxis', fallbackRange(ys));
  const zr = rangeOf('zaxis', fallbackRange(zs));
  const recenter = (r, v) => {
    const span = r[1] - r[0];
    if (!Number.isFinite(span) || span <= 0) return null;
    return [v - span / 2, v + span / 2];
  };
  const nx = recenter(xr, pt.x);
  const ny = recenter(yr, pt.y);
  const nz = recenter(zr, pt.z);
  const update = {};
  if (nx) update['scene.xaxis.range'] = nx;
  if (ny) update['scene.yaxis.range'] = ny;
  if (nz) update['scene.zaxis.range'] = nz;
  if (Object.keys(update).length) {
    Plotly.relayout(chart.value, update).catch(console.error);
  }
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
  Plotly.relayout(chart.value, { 'scene.camera': initialCamera() }).catch(console.error);
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
    await Plotly.newPlot(chart.value, createTraces(), { ...getLayout(true), camera: initialCamera() }, config);
    ready = true;

    chart.value.on('plotly_hover', (eventData) => {
      if (eventData?.points?.length) {
        const p = eventData.points[0];
        hoveredModelId = p.customdata;
        hoveredPoint = { x: p.x, y: p.y, z: p.z };
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
        hoveredPoint = { x: p.x, y: p.y, z: p.z };
      }
    });

    chart.value.on('plotly_doubleclick', () => false);

    chart.value.addEventListener('dblclick', handleDblClick);
    chart.value.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', resetAll);
  } catch (error) {
    failed.value = true;
    console.error(error);
  }
});

onBeforeUnmount(() => {
  ready = false;
  window.removeEventListener('keydown', resetAll);
  if (chart.value) {
    chart.value.removeEventListener('dblclick', handleDblClick);
    chart.value.removeEventListener('contextmenu', handleContextMenu);
    Plotly.purge(chart.value);
  }
});
</script>

<template>
  <main aria-label="AI 模型三维图">
    <div id="chart" :ref="el => chart = el" aria-label="X：Intelligence Index；Y：Cost per Task（USD）；Z：Time per Task（分钟）" />
    <div v-if="hiddenCount > 0" id="reset-tip" @click="resetAll">
      已隐藏 {{ hiddenCount }} 个模型 · <span class="action">按 R 或点击重置</span>
    </div>
    <p v-if="failed" id="error" role="alert">图表加载失败，请确认浏览器支持 WebGL 后刷新。</p>
  </main>
</template>

<style scoped>
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
