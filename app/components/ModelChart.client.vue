<script setup>
import fallbackData from "../../src/data.json";
import {
  onMounted,
  onBeforeUnmount,
  nextTick,
  ref,
  computed,
  watch,
} from "vue";
import { mountAtlas } from "../lib/atlas-engine.js";
import UI from "../lib/preferences.js";
const host = ref(null),
  ready = ref(false),
  chosen = ref(new Set(fallbackData.models.map((m) => m.id))),
  activeView = ref("free");
let atlas = null;
const language = ref(UI.lang),
  label = (zh, en) => (language.value === "zh" ? zh : en);
const failed = ref(false);
const searchQuery = ref("");
const searchOpen = ref(false);
const searchInput = ref(null);
let searchReturnFocus = null;
function closeSearch() {
  searchOpen.value = false;
  searchQuery.value = "";
  searchReturnFocus?.focus();
}
function trapSearchFocus(event) {
  const controls = [
    ...event.currentTarget.querySelectorAll("input, button:not(:disabled)"),
  ];
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
  if (
    event.isComposing ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  if (event.key === "Escape" && searchOpen.value) {
    event.preventDefault();
    closeSearch();
    return;
  }
  if (
    event.key !== "/" ||
    (event.target instanceof Element &&
      event.target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
      ))
  )
    return;
  event.preventDefault();
  searchReturnFocus = document.activeElement;
  searchOpen.value = true;
  await nextTick();
  searchInput.value?.focus();
}
const searchData = ref(fallbackData.models);
const searchResults = computed(() => {
  // Split names at letter/number boundaries too: deep4.1 -> deep + 4.1.
  const words =
    searchQuery.value
      .normalize("NFKC")
      .toLowerCase()
      .match(/\p{L}+|\d+(?:\.\d+)*/gu) || [];
  if (!words.length) return [];
  return searchData.value.filter((model) =>
    words.every((word) =>
      `${model.name} ${model.creator}`
        .normalize("NFKC")
        .toLowerCase()
        .includes(word),
    ),
  );
});
const activeResult = ref(-1);
watch(searchResults, (results) => {
  activeResult.value = results.findIndex(canPlot);
});
async function handleResultKey(event) {
  if (
    event.isComposing ||
    !["ArrowDown", "ArrowUp", "Enter"].includes(event.key)
  )
    return;
  // Native Enter already activates focused result buttons.
  if (event.key === "Enter" && event.target instanceof HTMLButtonElement)
    return;
  event.preventDefault();
  const available = searchResults.value
    .map((model, index) => (canPlot(model) ? index : -1))
    .filter((index) => index >= 0);
  if (!available.length || !ready.value) return;
  if (event.key === "Enter") {
    const model = searchResults.value[activeResult.value];
    if (model && canPlot(model)) await locateModel(model);
    return;
  }
  const current = available.indexOf(activeResult.value);
  const direction = event.key === "ArrowDown" ? 1 : -1;
  activeResult.value =
    available[(current + direction + available.length) % available.length];
  await nextTick();
  document
    .getElementById(`model-result-${activeResult.value}`)
    ?.scrollIntoView({ block: "nearest" });
}
async function handleViewKey(event) {
  const key = { 1: "front", 2: "side", 3: "top", 4: "free" }[event.key];
  if (
    !key ||
    !ready.value ||
    !atlas ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.repeat ||
    event.isComposing ||
    searchOpen.value ||
    event.target.closest?.("input,textarea,select,[contenteditable]")
  )
    return;
  event.preventDefault();
  await atlas.setView(key);
}
const canPlot = (model) =>
  [model.intelligence, model.cost, model.timeSeconds].every(
    (value) =>
      typeof value === "number" && Number.isFinite(value) && value >= 0,
  );
const formatMetric = (value, digits = 2, prefix = "", suffix = "") =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? `${prefix}${value.toFixed(digits)}${suffix}`
    : "—";
const missingMetrics = (model) =>
  [
    ["intelligence", "intelligence"],
    ["cost", "cost"],
    ["timeSeconds", "time"],
  ]
    .filter(
      ([key]) =>
        !(
          typeof model[key] === "number" &&
          Number.isFinite(model[key]) &&
          model[key] >= 0
        ),
    )
    .map(([, label]) => label)
    .join(", ");

async function locateModel(model) {
  if (!atlas || !canPlot(model)) return;
  await atlas.locateModel(model);
  closeSearch();
}

async function resetAll(event) {
  if (
    event &&
    (event.key.toLowerCase() !== "r" ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.repeat ||
      event.isComposing ||
      event.target.closest?.("input,textarea,select,[contenteditable]"))
  )
    return;
  await atlas?.resetAll();
  try {
    sessionStorage.removeItem("ai_model_chart_hidden_ids");
  } catch {}
}
onMounted(async () => {
  await nextTick();
  try {
    atlas = mountAtlas(host.value, {
      onHidden: (ids) => {
        try {
          sessionStorage.setItem(
            "ai_model_chart_hidden_ids",
            JSON.stringify(ids),
          );
        } catch {}
      },
      onPresentation: (ui) => {
        language.value = ui.lang;
      },
      onSnapshot: (next) => {
        searchData.value = next.models;
      },
      onSelection: (ids) => {
        chosen.value = new Set(ids);
      },
      onView: (key) => {
        activeView.value = key;
      },
    });
    try {
      const ids = JSON.parse(
        sessionStorage.getItem("ai_model_chart_hidden_ids") || "[]",
      );
      if (Array.isArray(ids)) for (const id of ids) await atlas.hideModel(id);
    } catch {}
    window.compareLab = atlas;
    window.ready = atlas.ready;
    await atlas.ready;
    ready.value = true;
    window.addEventListener("keydown", handleSearchKey);
    window.addEventListener("keydown", resetAll);
    window.addEventListener("keydown", handleViewKey);
  } catch (error) {
    failed.value = true;
    console.error(error);
  }
});
onBeforeUnmount(() => {
  ready.value = false;
  window.removeEventListener("keydown", handleSearchKey);
  window.removeEventListener("keydown", resetAll);
  window.removeEventListener("keydown", handleViewKey);
  atlas?.destroy();
  if (window.compareLab === atlas) {
    delete window.compareLab;
    delete window.ready;
  }
});
</script>
<template>
  <main aria-label="AI Model Compare">
    <div ref="host" class="atlas-host"></div>
    <div v-if="searchOpen" class="search-overlay" @click.self="closeSearch">
      <section
        class="model-search"
        role="dialog"
        aria-modal="true"
        :aria-label="label('模型搜索', 'Model search')"
        @keydown.tab="trapSearchFocus"
        @keydown="handleResultKey"
      >
        <input
          ref="searchInput"
          v-model="searchQuery"
          type="search"
          :aria-label="label('搜索模型', 'Search models')"
          :placeholder="
            label(
              '搜索模型，例如 6.1 sol high',
              'Search models, e.g. 6.1 sol high',
            )
          "
          autocomplete="off"
          aria-controls="model-search-results"
          :aria-activedescendant="
            activeResult >= 0 ? `model-result-${activeResult}` : undefined
          "
        />
        <p class="search-help">
          {{
            label(
              "↑↓ 选择 · Enter 定位 · Esc 关闭",
              "↑↓ Select · Enter Locate · Esc Close",
            )
          }}
        </p>
        <div
          v-if="searchQuery.trim()"
          class="search-results"
          aria-live="polite"
        >
          <p class="search-summary">
            {{
              searchResults.length
                ? label(
                    "找到 " + searchResults.length + " 个模型",
                    searchResults.length + " models found",
                  )
                : label("没有匹配的模型", "No matching models")
            }}
          </p>
          <ul id="model-search-results">
            <li v-for="(model, index) in searchResults" :key="model.id">
              <button
                :id="`model-result-${index}`"
                type="button"
                :class="{ 'active-result': activeResult === index }"
                @focus="activeResult = index"
                @mouseenter="canPlot(model) && (activeResult = index)"
                :disabled="!ready || !canPlot(model)"
                @click="locateModel(model)"
              >
                <strong>{{ model.name }}</strong>
                <span class="result-metrics">
                  <span
                    >{{ label("能力", "Intelligence") }}
                    <b>{{ formatMetric(model.intelligence) }}</b></span
                  >
                  <span
                    >{{ label("成本", "Cost") }}
                    <b>{{ formatMetric(model.cost, 4, "$") }}</b></span
                  >
                  <span
                    >{{ label("时间", "Time") }}
                    <b>{{
                      formatMetric(
                        typeof model.timeSeconds === "number"
                          ? model.timeSeconds / 60
                          : null,
                        2,
                        "",
                        label(" 分钟", " min"),
                      )
                    }}</b></span
                  >
                </span>
                <small
                  >{{ model.creator }} ·
                  {{
                    canPlot(model)
                      ? !chosen.has(model.id)
                        ? label("显示并定位", "Show and locate")
                        : label("在图中定位", "Locate in chart")
                      : label(
                          "缺少指标，无法定位",
                          `Missing ${missingMetrics(model)}; cannot locate`,
                        )
                  }}</small
                >
              </button>
            </li>
          </ul>
        </div>
      </section>
    </div>

    <p v-if="failed" id="error" role="alert">
      {{
        label(
          "图表加载失败，请确认 WebGL 已启用后刷新。",
          "Chart failed to load. Check that WebGL is enabled and refresh.",
        )
      }}
    </p>
  </main>
</template>
<style scoped>
.search-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: #ffffff66;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: min(18vh, 120px);
}
.model-search {
  width: min(420px, calc(100vw - 36px));
  font-size: 13px;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 16px 48px #0f172a14;
}
.search-help {
  margin: 10px 2px 0;
  font-size: 11px;
  color: #64748b;
}
.usage-help {
  position: absolute;
  left: 18px;
  bottom: 14px;
  z-index: 10;
  margin: 0;
  max-width: calc(100vw - 36px);
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  color: #7b8797;
  font-size: 11px;
  line-height: 1.7;
  pointer-events: none;
}
.model-search input {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  color: #334155;
  font: inherit;
  box-shadow: 0 2px 8px #0000000a;
}
.model-search input:focus {
  outline: 2px solid #93c5fd;
  outline-offset: 1px;
}
.search-results {
  margin-top: 6px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 8px 24px #00000014;
  max-height: min(420px, 65vh);
  overflow: auto;
}
.search-summary {
  margin: 0;
  padding: 10px 12px;
  color: #64748b;
}
.search-results ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.search-results button {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-top: 1px solid #f1f5f9;
  background: white;
  text-align: left;
  cursor: pointer;
  color: #334155;
  font: inherit;
}
.search-results button.active-result,
.search-results button:hover,
.search-results button:focus-visible {
  background: #eff6ff;
}
.search-results button:disabled {
  color: #94a3b8;
  cursor: default;
}
.search-results strong,
.search-results small {
  display: block;
}
.result-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin-top: 7px;
  color: #64748b;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.result-metrics b {
  font-weight: 500;
  color: #475569;
}
.search-results button:disabled .result-metrics,
.search-results button:disabled .result-metrics b {
  color: #94a3b8;
}
.search-results small {
  margin-top: 4px;
  font-size: 11px;
}

.search-overlay {
  background: #00000044;
}
.model-search,
.search-results,
.model-search input,
.search-results button {
  background: var(--atlas-panel);
  color: var(--atlas-text);
  border-color: var(--atlas-border);
}
.search-results button:hover,
.search-results button.active-result {
  background: var(--atlas-selected);
}
.search-results button:disabled {
  color: var(--atlas-muted);
}
.search-help,
.search-summary,
.result-metrics {
  color: var(--atlas-muted);
}
.result-metrics b {
  color: var(--atlas-text);
}
</style>
