import Plotly from "plotly.js-gl3d-dist-min";
import sourceData from "../../src/data.json";
import * as ModelCatalog from "./catalog.js";
import AtlasUI from "./preferences.js";
import markup from "./panel.html?raw";
import { validateSnapshot } from "./snapshot.js";
import { fitAxis, metricTicks } from "./plane-fit.js";

export function mountAtlas(root, options = {}) {
  root.innerHTML = markup;
  let disposed = false;
  const removers = [];
  const listen = (target, event, callback, config) => {
    target.addEventListener(event, callback, config);
    removers.push(() => target.removeEventListener(event, callback, config));
  };
  const UI = AtlasUI,
    t = (key, values) => UI.t(key, values);
  const clone = (x) => JSON.parse(JSON.stringify(x)),
    esc = (s) =>
      String(s).replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const three = root.querySelector("#chart3d"),
    plane = root.querySelector("#chart2d"),
    panel = root.querySelector(".panel"),
    picker = root.querySelector("#picker");
  let snapshot = sourceData,
    catalog = ModelCatalog.buildCatalog(snapshot.models),
    models = catalog.models,
    families = catalog.families,
    series = catalog.series;
  const effortNames = {
    "non-reasoning": "不思考",
    reasoning: "思考",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Xhigh",
    max: "Max",
  };
  const identity = ModelCatalog.identity;
  const selected = new Set(models.map((m) => m.id));
  let active = "free",
    resetVersion = 0,
    busy = false,
    renderRequested = false,
    threeBound = false,
    resizeFrame = 0,
    planeBound = false,
    planeZoomValue = 1,
    correctingPlane = false,
    syncFrame = 0,
    lastDataMeta = {};
  const MAX_PLANE_ZOOM = 50;
  let wheelRanges = null,
    wheelTargets = null,
    wheelFrame = 0,
    wheelBusy = false,
    currentPlaneRanges = null,
    planeFrame = null,
    planeAutoFit = true,
    frameGeometry = "";
  const initialCamera = {
    eye: { x: 1.65, y: -1.65, z: 1.1 },
    up: { x: 0, y: 0, z: 1 },
    center: { x: 0, y: 0, z: 0 },
    projection: { type: "perspective" },
  };
  let camera3d = clone(initialCamera);
  const metrics = {
    ability: {
      name: "能力",
      title: "能力 · Intelligence Index（越高越好）",
      axis3d: "能力 · Intelligence Index",
      range: [0, 60],
      step: 10,
      format: ".0f",
      get: (m) => m.intelligence,
    },
    cost: {
      name: "成本",
      title: "成本 · 美元 / 任务（越低越好）",
      axis3d: "成本 · USD / 任务",
      range: [0, 9],
      step: 2,
      format: ".0f",
      prefix: "$",
      get: (m) => m.cost,
    },
    time: {
      name: "时间",
      title: "时间 · 分钟 / 任务（越低越好）",
      axis3d: "时间 · 分钟 / 任务",
      range: [0, 75],
      step: 15,
      format: ".0f",
      get: (m) => m.timeSeconds / 60,
    },
  };
  function updateMetricRanges() {
    for (const [key, spec] of Object.entries(metrics)) {
      const minimum = key === "ability" ? 60 : key === "cost" ? 9 : 75;
      const maximum = Math.max(minimum, ...models.map(spec.get));
      const rough = maximum > minimum ? maximum * 1.05 : minimum;
      const power = 10 ** Math.floor(Math.log10(rough));
      spec.range = [
        0,
        maximum === minimum ? minimum : Math.ceil(rough / power) * power,
      ];
    }
  }
  // Embedded snapshots must receive the same full-data bounds as live updates.
  updateMetricRanges();
  const views = {
    free: { name: "自由视图", hint: "拖动旋转 · 滚轮缩放 · 仅显示散点" },
    front: { name: "正视图 · 能力 × 时间", x: "ability", y: "time" },
    side: { name: "侧视图 · 成本 × 时间", x: "cost", y: "time" },
    top: { name: "俯视图 · 能力 × 成本", x: "ability", y: "cost" },
  };
  function margin() {
    const mobile = matchMedia("(max-width:600px)").matches;
    return mobile
      ? {
          l: 66,
          r: 26,
          t: Math.min(
            innerHeight - 170,
            Math.ceil(panel.getBoundingClientRect().bottom) + 58,
          ),
          b: 96,
        }
      : {
          l: Math.ceil(panel.getBoundingClientRect().right) + 75,
          r: 58,
          t: 100,
          b: 96,
        };
  }
  function visibleGroups() {
    return families
      .map((f) => ({
        ...f,
        models: f.models.filter((m) => selected.has(m.id)),
      }))
      .filter((f) => f.models.length);
  }
  function hoverTemplate() {
    return (
      "<b>%{customdata[0]}</b><br>" +
      t("ability") +
      ": %{customdata[1]:.2f}<br>" +
      t("cost") +
      ": $%{customdata[2]:.4f} / " +
      (UI.lang === "zh" ? "任务" : "task") +
      "<br>" +
      t("time") +
      ": %{customdata[3]:.2f} " +
      t("minutesTask") +
      "<extra></extra>"
    );
  }
  function pointStyle() {
    return {
      size: Math.min(10, 6 * Math.pow(planeZoomValue, 0.18)),
      width: Math.min(2.2, 1.3 * Math.pow(planeZoomValue, 0.16)),
    };
  }
  function colour(f, line = false) {
    let c = line ? f.lineColor : f.color;
    if (UI.theme === "dark")
      c = c.replace("44%", "64%").replace(", .48)", ", .65)");
    return c;
  }
  function dataFor(f) {
    return f.models.map((m) => [
      esc(m.name),
      m.intelligence,
      m.cost,
      m.timeSeconds / 60,
      m.id,
      m.effort,
    ]);
  }
  function tracesFor(key) {
    const groups = visibleGroups();
    if (key === "free") {
      const models = groups.flatMap((f) => f.models);
      // One WebGL trace keeps the draw cost independent of version count.
      return [
        {
          type: "scatter3d",
          mode: "markers",
          customdata: groups.flatMap(dataFor),
          hovertemplate: hoverTemplate(),
          showlegend: false,
          x: models.map(metrics.ability.get),
          y: models.map(metrics.cost.get),
          z: models.map(metrics.time.get),
          marker: {
            // Match upstream's per-point sizes: gl3d normalizes arrays
            // differently from a scalar, which otherwise renders twice as large.
            size: models.map(() => 5),
            color: groups.flatMap((f) => f.models.map(() => colour(f))),
            opacity: 0.9,
            line: { color: "#ffffff", width: 0.6 },
          },
        },
      ];
    }
    return groups.map((f) => {
      const common = {
        name: f.name,
        legendgroup: f.key,
        customdata: dataFor(f),
        hovertemplate: hoverTemplate(),
        showlegend: false,
      };
      const v = views[key],
        style = pointStyle(),
        connect =
          f.models.length > 1 &&
          f.models.every((m) => m.rank !== null) &&
          new Set(f.models.map((m) => m.rank)).size === f.models.length;
      return {
        ...common,
        type: "scatter",
        mode: connect ? "lines+markers" : "markers",
        x: f.models.map(metrics[v.x].get),
        y: f.models.map(metrics[v.y].get),
        line: { color: colour(f, true), width: style.width, shape: "linear" },
        marker: {
          size: style.size,
          color: colour(f),
          opacity: 0.92,
          line: { color: UI.palette.bg, width: 0.5 },
        },
        connectgaps: false,
      };
    });
  }

  function resetPlaneFit() {
    planeFrame = null;
    planeAutoFit = true;
    currentPlaneRanges = null;
    planeZoomValue = 1;
    resetVersion++;
    wheelRanges = null;
    wheelTargets = null;
    cancelAnimationFrame(wheelFrame);
    wheelFrame = 0;
  }
  function preparePlaneFrame() {
    const m = margin(),
      width = Math.max(40, innerWidth - m.l - m.r),
      height = Math.max(40, innerHeight - m.t - m.b);
    const signature = [...selected].sort().join("|"),
      geometry = width + ":" + height;
    if (
      !planeFrame ||
      planeFrame.view !== active ||
      planeFrame.selection !== signature ||
      (planeAutoFit && frameGeometry !== geometry)
    ) {
      resetPlaneFit();
      const view = views[active],
        chosen = models.filter((model) => selected.has(model.id)),
        style = pointStyle();
      planeFrame = {
        view: active,
        selection: signature,
        ranges: {
          [view.x]: fitAxis(
            chosen.map(metrics[view.x].get),
            metrics[view.x].range,
            width,
            style,
          ),
          [view.y]: fitAxis(
            chosen.map(metrics[view.y].get),
            metrics[view.y].range,
            height,
            style,
          ),
        },
      };
      frameGeometry = geometry;
    }
  }
  const planeBounds = (key) => planeFrame?.ranges[key] || metrics[key].range;
  async function fitSelected() {
    if (active === "free") return setView("free");
    resetPlaneFit();
    await render();
  }

  function axis2d(key) {
    const s = metrics[key],
      p = UI.palette;
    return {
      title: { text: s.title, font: { size: 12, color: p.text }, standoff: 16 },
      range:
        key === "ability"
          ? clone(planeBounds(key))
          : clone(planeBounds(key)).reverse(),
      autorange: false,
      nticks: 8,
      exponentformat: "none",
      tickprefix: s.prefix || "",
      tickfont: { size: 11, color: p.muted },
      tickangle: 0,
      automargin: true,
      gridcolor: p.grid,
      zeroline: false,
      showline: true,
      linecolor: p.border,
      ticks: "outside",
      ticklen: 4,
      tickcolor: p.border,
      fixedrange: false,
    };
  }
  function planeAxis(key, axis) {
    const spec = axis2d(key);
    if (
      currentPlaneRanges?.view === active &&
      currentPlaneRanges.revision === resetVersion
    )
      spec.range = clone(currentPlaneRanges[axis]);
    const ticks = metricTicks(spec.range);
    spec.tickmode = "array";
    spec.tickvals = ticks.values;
    spec.tickformat = ticks.format;
    return spec;
  }
  function axis3d(key) {
    const s = metrics[key],
      p = UI.palette;
    const color = (
      UI.theme === "dark"
        ? { ability: "#9db9e5", cost: "#9ac8ae", time: "#c3a7e8" }
        : { ability: "#7b9bc9", cost: "#7ba58b", time: "#a18bc5" }
    )[key];
    return {
      title: { text: s.axis3d, font: { size: 13, color } },
      range: clone(s.range),
      autorange: false,
      dtick: s.step,
      tickformat: s.format,
      tickprefix: s.prefix || "",
      tickfont: { size: 11, color },
      tickangle: 0,
      showaxeslabels: true,
      showbackground: true,
      backgroundcolor: p.plane,
      gridcolor: p.grid,
      zerolinecolor: p.border,
      showspikes: false,
    };
  }
  function updateOverlay() {
    if (disposed) return;
    const m = margin(),
      v = views[active],
      caption = root.querySelector("#axis-caption");
    caption.textContent =
      active === "free"
        ? t("threeCaption")
        : t("axisCaption", { x: metrics[v.x].name, y: metrics[v.y].name });
    Object.assign(caption.style, {
      left: m.l + "px",
      width: Math.max(80, innerWidth - m.l - m.r) + "px",
      top: m.t - 48 + "px",
    });
    const empty = root.querySelector("#empty");
    empty.hidden = selected.size !== 0;
    empty.innerHTML =
      esc(t("empty")) + "<small>" + esc(t("emptyHint")) + "</small>";
    Object.assign(empty.style, {
      left: m.l + "px",
      width: Math.max(80, innerWidth - m.l - m.r) + "px",
      top: m.t + (innerHeight - m.t - m.b) / 2 + "px",
    });
    const status = root.querySelector("#status");
    status.textContent =
      v.name +
      (active === "free"
        ? ""
        : " · " +
          new Intl.NumberFormat(UI.lang === "zh" ? "zh-CN" : "en", {
            maximumFractionDigits: 1,
          }).format(planeZoomValue) +
          "×");
    status.title = active === "free" ? "" : t("zoomLimit");
    root.querySelector("#hint").textContent = t(
      active === "free" ? "freeHint" : "planeHint",
    );
  }
  function boundRange(range, key) {
    const full = planeBounds(key),
      extent = full[1] - full[0],
      lo = Math.min(...range),
      hi = Math.max(...range),
      span = Math.max(extent / MAX_PLANE_ZOOM, Math.min(extent, hi - lo)),
      start = Math.max(full[0], Math.min(full[1] - span, (lo + hi - span) / 2)),
      result = [start, start + span];
    return key === "ability" ? result : result.reverse();
  }
  async function syncPlaneViewport() {
    if (active === "free" || correctingPlane || !plane._fullLayout?.xaxis)
      return;
    correctingPlane = true;
    try {
      const v = views[active],
        patch = {};
      for (const [axis, key] of [
        ["xaxis", v.x],
        ["yaxis", v.y],
      ]) {
        const current = plane._fullLayout[axis].range,
          next = boundRange(current, key),
          tolerance = (planeBounds(key)[1] - planeBounds(key)[0]) * 1e-8;
        const ticks = metricTicks(next);
        if (
          JSON.stringify(plane._fullLayout[axis].tickvals) !==
          JSON.stringify(ticks.values)
        ) {
          patch[axis + ".tickvals"] = ticks.values;
          patch[axis + ".tickformat"] = ticks.format;
        }
        if (current.some((n, i) => Math.abs(n - next[i]) > tolerance)) {
          patch[axis + ".range"] = next;
          patch[axis + ".autorange"] = false;
        }
      }
      if (Object.keys(patch).length) await Plotly.relayout(plane, patch);
      const l = plane._fullLayout,
        z = (axis, key) =>
          (planeBounds(key)[1] - planeBounds(key)[0]) /
          Math.abs(l[axis].range[1] - l[axis].range[0]);
      planeZoomValue = Math.max(
        1,
        Math.min(MAX_PLANE_ZOOM, Math.sqrt(z("xaxis", v.x) * z("yaxis", v.y))),
      );
      currentPlaneRanges = {
        view: active,
        revision: resetVersion,
        x: clone(l.xaxis.range),
        y: clone(l.yaxis.range),
      };
      const s = pointStyle();
      if (
        plane.data.length &&
        (Math.abs((plane.data[0].marker?.size ?? 0) - s.size) > 0.025 ||
          Math.abs((plane.data[0].line?.width ?? 0) - s.width) > 0.012 ||
          ((planeZoomValue < 1.00001 ||
            planeZoomValue > MAX_PLANE_ZOOM - 0.001) &&
            (Math.abs((plane.data[0].marker?.size ?? 0) - s.size) > 1e-6 ||
              Math.abs((plane.data[0].line?.width ?? 0) - s.width) > 1e-6)))
      )
        await Plotly.restyle(plane, {
          "marker.size": s.size,
          "line.width": s.width,
        });
      updateOverlay();
    } finally {
      correctingPlane = false;
    }
  }
  function schedulePlaneSync() {
    cancelAnimationFrame(syncFrame);
    syncFrame = requestAnimationFrame(() =>
      syncPlaneViewport().catch(console.error),
    );
  }
  async function flushPlaneWheel() {
    if (wheelBusy) return;
    wheelBusy = true;
    try {
      while (wheelRanges) {
        const target = wheelRanges;
        wheelRanges = null;
        if (
          active === "free" ||
          target.revision !== resetVersion ||
          target.view !== active
        )
          continue;
        correctingPlane = true;
        try {
          await Plotly.relayout(plane, {
            "xaxis.range": target.x,
            "xaxis.autorange": false,
            "yaxis.range": target.y,
            "yaxis.autorange": false,
          });
        } finally {
          correctingPlane = false;
        }
        await syncPlaneViewport();
      }
    } finally {
      wheelBusy = false;
    }
  }
  function planeWheel(event) {
    if (active === "free" || !plane._fullLayout?.xaxis) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const l = plane._fullLayout,
      r = plane.getBoundingClientRect(),
      px = event.clientX - r.left - l.xaxis._offset,
      py = event.clientY - r.top - l.yaxis._offset;
    if (px < 0 || px > l.xaxis._length || py < 0 || py > l.yaxis._length)
      return;
    const v = views[active],
      previous =
        (wheelBusy || wheelFrame) && wheelTargets?.revision === resetVersion
          ? wheelTargets
          : { x: clone(l.xaxis.range), y: clone(l.yaxis.range) },
      fraction = { x: px / l.xaxis._length, y: 1 - py / l.yaxis._length },
      pixels =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? l.yaxis._length
            : 1);
    let factor = Math.exp(Math.max(-200, Math.min(200, pixels)) * 0.0015),
      minFactor = 0,
      maxFactor = Infinity;
    for (const [axis, key] of [
      ["x", v.x],
      ["y", v.y],
    ]) {
      const full = planeBounds(key)[1] - planeBounds(key)[0],
        span = Math.abs(previous[axis][1] - previous[axis][0]);
      minFactor = Math.max(minFactor, full / MAX_PLANE_ZOOM / span);
      maxFactor = Math.min(maxFactor, full / span);
    }
    factor = Math.max(minFactor, Math.min(maxFactor, factor));
    if (Math.abs(factor - 1) < 1e-10) return;
    planeAutoFit = false;
    const next = { view: active, revision: resetVersion };
    for (const [axis, key] of [
      ["x", v.x],
      ["y", v.y],
    ]) {
      const range = previous[axis],
        anchor = range[0] + fraction[axis] * (range[1] - range[0]);
      next[axis] = boundRange(
        range.map((value) => anchor + (value - anchor) * factor),
        key,
      );
    }
    wheelTargets = next;
    wheelRanges = next;
    if (!wheelFrame)
      wheelFrame = requestAnimationFrame(() => {
        wheelFrame = 0;
        flushPlaneWheel().catch(console.error);
      });
  }
  function bindPlaneEvents() {
    if (planeBound) return;
    plane.on("plotly_relayout", schedulePlaneSync);
    listen(plane, "wheel", planeWheel, {
      capture: true,
      passive: false,
    });
    listen(
      plane,
      "pointerdown",
      () => {
        planeAutoFit = false;
        wheelRanges = null;
        wheelTargets = null;
        cancelAnimationFrame(wheelFrame);
        wheelFrame = 0;
      },
      true,
    );
    bindPointActions(plane);
    listen(plane, "dblclick", () => fitSelected().catch(console.error));
    planeBound = true;
  }

  let hovered = null;
  const sessionHidden = new Set();
  function bindPointActions(el) {
    el.on("plotly_hover", (e) => {
      hovered = e.points?.[0]?.customdata?.[4] ?? null;
    });
    el.on("plotly_unhover", () => {
      hovered = null;
    });
    listen(el, "contextmenu", (e) => {
      e.preventDefault();
      if (hovered) hideModel(hovered);
    });
    if (el === three)
      listen(el, "dblclick", (e) => {
        e.preventDefault();
        if (hovered) {
          const m = models.find((m) => m.id === hovered);
          if (m) locateModel(m);
        }
      });
  }
  async function hideModel(id) {
    if (!selected.has(id)) return;
    selected.delete(id);
    sessionHidden.add(id);
    options.onHidden?.([...sessionHidden]);
    syncPicker();
    await render();
  }
  async function resetAll() {
    sessionHidden.clear();
    options.onHidden?.([]);
    models.forEach((m) => selected.add(m.id));
    syncPicker();
    await setView(active);
  }
  async function locateModel(model) {
    if (!ModelCatalog.complete(model)) return;
    selected.add(model.id);
    sessionHidden.delete(model.id);
    options.onHidden?.([...sessionHidden]);
    syncPicker();
    await render();
    if (active === "free") {
      const scene = three._fullLayout?.scene,
        toScene = (key, value, aspect = 1) =>
          ((value - metrics[key].range[0]) /
            (metrics[key].range[1] - metrics[key].range[0]) -
            0.5) *
          aspect;
      const center = {
        x: toScene("ability", model.intelligence, scene?.aspectratio?.x),
        y: toScene("cost", model.cost, scene?.aspectratio?.y),
        z: toScene("time", model.timeSeconds / 60, scene?.aspectratio?.z),
      };
      const current = camera3d.center || { x: 0, y: 0, z: 0 },
        eye = Object.fromEntries(
          ["x", "y", "z"].map((key) => [
            key,
            camera3d.eye[key] + center[key] - current[key],
          ]),
        );
      camera3d = { ...camera3d, center, eye };
      await Plotly.relayout(three, { "scene.camera": clone(camera3d) });
    } else {
      const v = views[active],
        patch = {};
      for (const [axis, key] of [
        ["xaxis", v.x],
        ["yaxis", v.y],
      ]) {
        const range = plane._fullLayout[axis].range,
          span = range[1] - range[0],
          value = metrics[key].get(model);
        patch[axis + ".range"] = boundRange(
          [value - span / 2, value + span / 2],
          key,
        );
      }
      await Plotly.relayout(plane, patch);
      await syncPlaneViewport();
    }
  }

  async function render() {
    if (disposed) return;
    if (busy) {
      renderRequested = true;
      return;
    }
    busy = true;
    try {
      do {
        renderRequested = false;
        if (active !== "free") preparePlaneFrame();
        const key = active,
          m = margin(),
          p = UI.palette,
          font = {
            family: "Segoe UI, Microsoft YaHei, sans-serif",
            color: p.text,
          },
          base = {
            paper_bgcolor: p.bg,
            plot_bgcolor: p.bg,
            font,
            margin: m,
            showlegend: false,
            hoverlabel: {
              bgcolor: p.panel,
              bordercolor: p.border,
              font: { color: p.text, size: 12 },
            },
          };
        if (key === "free") {
          await Plotly.react(
            three,
            tracesFor(key),
            {
              ...base,
              uirevision: "3d-" + resetVersion,
              scene: {
                xaxis: axis3d("ability"),
                yaxis: axis3d("cost"),
                zaxis: axis3d("time"),
                aspectmode: "cube",
                camera: clone(camera3d),
                dragmode: "orbit",
                annotations: [
                  {
                    x: metrics.ability.range[1] - 0.001,
                    y: 0.001,
                    z: 0.001,
                    text: t("idealCorner"),
                    hovertext: t("idealHint"),
                    showarrow: true,
                    arrowhead: 0,
                    arrowcolor: p.muted,
                    arrowwidth: 1,
                    ax: 0,
                    ay: 32,
                    font: { size: 11, color: p.text },
                    bgcolor: p.panel,
                    borderpad: 4,
                  },
                ],
              },
            },
            {
              responsive: true,
              displayModeBar: false,
              scrollZoom: true,
              doubleClick: false,
            },
          );
          if (!threeBound) {
            three.on("plotly_relayout", (e) => {
              camera3d = clone(
                e["scene.camera"] ||
                  three._fullLayout?.scene?._scene?.getCamera() ||
                  camera3d,
              );
            });
            bindPointActions(three);
            threeBound = true;
          }
        } else {
          const v = views[key];
          await Plotly.react(
            plane,
            tracesFor(key),
            {
              ...base,
              uirevision: key + "-" + resetVersion,
              dragmode: "pan",
              hovermode: "closest",
              hoverdistance: 14,
              xaxis: planeAxis(v.x, "x"),
              yaxis: planeAxis(v.y, "y"),
              annotations: [
                {
                  xref: "paper",
                  yref: "paper",
                  x: 0.01,
                  y: 0.015,
                  text: t("worse"),
                  showarrow: false,
                  xanchor: "left",
                  yanchor: "bottom",
                  font: { size: 10, color: p.muted },
                  bgcolor: p.bg,
                },
                {
                  xref: "paper",
                  yref: "paper",
                  x: 0.99,
                  y: 0.985,
                  text: t("better"),
                  showarrow: false,
                  xanchor: "right",
                  yanchor: "top",
                  font: { size: 11, color: p.better },
                  bgcolor: p.bg,
                },
              ],
            },
            {
              responsive: true,
              displayModeBar: false,
              scrollZoom: true,
              doubleClick: false,
            },
          );
          bindPlaneEvents();
          await syncPlaneViewport();
        }
        updateOverlay();
      } while (renderRequested);
    } finally {
      busy = false;
    }
  }
  async function setView(key) {
    options.onView?.(key);
    active = key;
    resetPlaneFit();
    root.querySelector("#fit-selected").hidden = false;
    resetVersion++;
    wheelRanges = null;
    wheelTargets = null;
    currentPlaneRanges = null;
    cancelAnimationFrame(wheelFrame);
    wheelFrame = 0;
    planeZoomValue = 1;
    if (key === "free") camera3d = clone(initialCamera);
    three.hidden = key !== "free";
    plane.hidden = key === "free";
    root.querySelectorAll("[data-view]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.view === key));
      b.title = t("reset", { name: views[b.dataset.view].name });
    });
    await render();
    if ((key === "free" ? three : plane)._fullLayout)
      await Plotly.Plots.resize(key === "free" ? three : plane);
  }
  function syncPicker() {
    options.onSelection?.([...selected], models);
    root.querySelector("#selection-summary").textContent =
      t("chosen", { n: selected.size }) + " / " + models.length;
    updateOverlay();
  }
  function drawPicker() {
    syncPicker();
  }
  root.querySelector("#fit-selected").onclick = () =>
    fitSelected().catch(console.error);
  document
    .querySelectorAll("[data-view]")
    .forEach(
      (b) => (b.onclick = () => setView(b.dataset.view).catch(console.error)),
    );
  function resize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(async () => {
      updateOverlay();
      const el = active === "free" ? three : plane;
      if (active !== "free" && planeAutoFit) {
        await render();
        return;
      }
      if (el._fullLayout) {
        await Plotly.relayout(el, { margin: margin() });
        await Plotly.Plots.resize(el);
      }
    });
  }
  const dataStatus = document.createElement("span");
  dataStatus.id = "data-status";
  root.querySelector(".notes").append(dataStatus);
  const panelHead = document.createElement("div");
  panelHead.className = "panel-head";
  const heading = panel.querySelector("h1");
  heading.before(panelHead);
  panelHead.append(heading);
  function applyPresentation() {
    options.onPresentation?.(UI);
    document.title = t("appTitle");
    heading.textContent = t("appTitle");
    for (const [key, s] of Object.entries(metrics)) {
      s.name = t(key);
      s.title = t(key + "Title");
      s.axis3d = t(key + "3d");
    }
    for (const [key, v] of Object.entries(views)) {
      v.name =
        t(key) +
        (key === "free"
          ? ""
          : " · " + metrics[v.x].name + " × " + metrics[v.y].name);
    }
    root.querySelectorAll("[data-view]").forEach((button) => {
      const key = button.dataset.view,
        v = views[key];
      button.innerHTML =
        esc(t(key)) +
        "<span>" +
        (key === "free"
          ? "3D"
          : esc(metrics[v.x].name + " × " + metrics[v.y].name)) +
        "</span>";
      button.title = t("reset", { name: v.name });
    });
    const notes = root.querySelector(".notes");
    notes.innerHTML = t("notes").split("|").map(esc).join("<br>");
    notes.append(dataStatus);
    root.querySelector("#fit-selected").textContent = t("fit");
    root.querySelector("#fit-selected").title = t("fitHelp");
    document
      .querySelector("nav")
      .setAttribute(
        "aria-label",
        UI.lang === "zh" ? "选择视图" : "Choose view",
      );
    showDataStatus(lastDataMeta);
    updateOverlay();
  }
  function showDataStatus(meta = {}) {
    lastDataMeta = meta;
    const date = new Intl.DateTimeFormat(UI.lang === "zh" ? "zh-CN" : "en-GB", {
      timeZone: "Asia/Shanghai",
      month: UI.lang === "zh" ? "2-digit" : "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(snapshot.retrievedAt));
    const state =
      meta.status === "refreshing"
        ? "checking"
        : meta.via === "cloudflare"
          ? "projectChecks"
          : meta.status === "retained"
            ? "retained"
            : "local";
    dataStatus.textContent = t("snapshot", { date }) + " · " + t(state);
    dataStatus.title =
      t("dataHelp") + (meta.error ? " " + t("sourceState") + meta.error : "");
  }
  function applySnapshot(next) {
    try {
      validateSnapshot(next);
    } catch {
      throw Error(t("invalid"));
    }
    if (Date.parse(next.retrievedAt) < Date.parse(snapshot.retrievedAt))
      return false;
    // Older KV snapshots predate the release-date field. Keep known metadata
    // by stable ID until the existing Cloudflare schedule publishes the new schema.
    const knownDates = new Map(
      snapshot.models.map((m) => [m.id, m.releaseDate]),
    );
    next = {
      ...next,
      models: next.models.map((m) =>
        !Object.hasOwn(m, "releaseDate") && knownDates.get(m.id)
          ? { ...m, releaseDate: knownDates.get(m.id) }
          : m,
      ),
    };
    const updated = ModelCatalog.buildCatalog(next.models);
    if (updated.models.length < 100) throw Error(t("tooFew"));
    if (JSON.stringify(next.models) === JSON.stringify(snapshot.models)) {
      snapshot = next;
      return false;
    }
    const allSelected = selected.size === models.length,
      oldChosen = new Set(selected);
    snapshot = next;
    options.onSnapshot?.(next);
    catalog = updated;
    models = updated.models;
    families = updated.families;
    series = updated.series;
    selected.clear();
    for (const m of models)
      if (allSelected || oldChosen.has(m.id)) selected.add(m.id);
    updateMetricRanges();
    if (planeAutoFit) planeFrame = null;
    drawPicker();
    render().catch(console.error);
    return true;
  }
  let polling = false,
    requestController = null;
  async function pollSnapshot() {
    if (disposed || polling || location.protocol === "file:") return;
    polling = true;
    requestController = new AbortController();
    try {
      const r = await fetch("/api/data", {
        cache: "no-store",
        signal: AbortSignal.any([
          AbortSignal.timeout(15000),
          requestController.signal,
        ]),
      });
      if (!r.ok) throw Error(t("unavailable"));
      const next = await r.json();
      if (disposed) return;
      applySnapshot(next);
      showDataStatus({ status: "ready", via: "cloudflare" });
    } catch (e) {
      if (disposed) return;
      showDataStatus({ status: "retained", error: e.message });
    } finally {
      polling = false;
    }
  }
  const observer = new ResizeObserver(resize);
  observer.observe(panel);
  listen(window, "resize", resize);
  applyPresentation();
  drawPicker();
  showDataStatus();
  const ready = setView("free");
  ready.then(pollSnapshot).catch(console.error);
  const interval = null;
  const api = {
    ready,
    get selectedModels() {
      return models.filter((m) => selected.has(m.id));
    },
    locateModel,
    resetAll,
    hideModel,
    destroy() {
      disposed = true;
      requestController?.abort();
      observer.disconnect();
      clearInterval(interval);
      for (const frame of [resizeFrame, syncFrame, wheelFrame])
        cancelAnimationFrame(frame);
      for (const remove of removers) remove();
      Plotly.purge(three);
      Plotly.purge(plane);
    },
    setView,
    fitSelected,
    get autoFit() {
      return planeAutoFit;
    },
    identity,
    applySnapshot,
    pollSnapshot,
    get active() {
      return active;
    },
    get busy() {
      return (
        busy || renderRequested || correctingPlane || wheelBusy || !!wheelFrame
      );
    },
    get zoom() {
      return planeZoomValue;
    },
    get maxZoom() {
      return MAX_PLANE_ZOOM;
    },
    get selected() {
      return [...selected];
    },
    get families() {
      return families;
    },
    get series() {
      return series;
    },
    get models() {
      return models;
    },
    metrics,
    visibleGroups,
  };

  return api;
}
