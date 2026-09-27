/*
 * ECharts version — the same eight charts, described declaratively as option objects.
 * Receives the same view model as the D3 version (see common.js).
 */
(function () {
  "use strict";
  const { fmt } = window.App;
  const inst = {};
  let T;

  function chart(id, h) {
    const el = document.getElementById(id);
    if (h) el.style.height = h + "px";
    if (!inst[id]) {
      inst[id] = echarts.init(el, null, { renderer: "svg" });
      inst[id].on("click", p => p.data && p.data.onClick && p.data.onClick());
    }
    inst[id].resize();
    return inst[id];
  }
  const row = (k, v, color) =>
    `<div style="display:flex;justify-content:space-between;gap:14px"><span>${color ? `<i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></i>` : ""}${k}</span><span style="font-family:${T.fontMono}">${v}</span></div>`;

  // shared look so ECharts matches the design tokens
  function base() {
    return {
      animationDuration: 300,
      textStyle: { fontFamily: T.fontBody, color: T.ink2 },
      tooltip: {
        backgroundColor: T.surface, borderColor: T.line, borderWidth: 1, padding: [8, 10],
        textStyle: { color: T.ink, fontSize: 12.5, fontFamily: T.fontBody },
        extraCssText: "border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.14);"
      }
    };
  }
  const axisLabel = (extra = {}) => ({ color: T.ink3, fontSize: 11, fontFamily: T.fontMono, ...extra });
  let splitLine; // set per render from theme tokens
  const noAxisLine = { show: false };

  /* 1. cases per year */
  function trend(vm) {
    const data = vm.byYear;
    chart("ch-trend").setOption({
      ...base(),
      grid: { top: 14, right: 60, bottom: 26, left: 52 },
      tooltip: { ...base().tooltip, trigger: "axis", axisPointer: { type: "line", lineStyle: { color: T.ink3, type: "dashed" } },
        formatter: ps => `<b>ปี ${ps[0].name}</b>${row("คดีที่รับแจ้ง", fmt.int(ps[0].value), T.s1)}` },
      xAxis: { type: "category", data: data.map(d => d.year), boundaryGap: false, axisLine: noAxisLine, axisTick: noAxisLine, axisLabel: axisLabel() },
      yAxis: { type: "value", min: 0, splitNumber: 4, axisLabel: axisLabel({ formatter: fmt.compact }), splitLine },
      series: [{
        type: "line", smooth: true, data: data.map(d => d.cases), symbol: "circle", symbolSize: 8, showSymbol: false,
        lineStyle: { width: 2, color: T.s1 }, itemStyle: { color: T.s1, borderColor: T.surface, borderWidth: 2 },
        areaStyle: { color: T.s1, opacity: .12 },
        endLabel: { show: true, formatter: p => fmt.compact(p.value), color: T.ink, fontFamily: T.fontMono, fontWeight: 600, fontSize: 12 }
      }]
    }, true);
  }

  /* 2. chargesheet & conviction rate per year */
  function rates(vm) {
    const data = vm.byYear;
    const s = (key, name, color) => ({
      type: "line", name, smooth: true, data: data.map(d => d[key]), symbol: "circle", symbolSize: 8, showSymbol: false,
      lineStyle: { width: 2, color }, itemStyle: { color, borderColor: T.surface, borderWidth: 2 },
      endLabel: { show: true, formatter: p => `${name} ${fmt.pct(p.value)}`, color: T.ink2, fontSize: 11.5 }
    });
    chart("ch-rates").setOption({
      ...base(),
      grid: { top: 14, right: 88, bottom: 26, left: 44 },
      tooltip: { ...base().tooltip, trigger: "axis", axisPointer: { type: "line", lineStyle: { color: T.ink3, type: "dashed" } },
        formatter: ps => `<b>ปี ${ps[0].name}</b>` + ps.map(p => row("อัตรา" + p.seriesName, fmt.pct(p.value), p.color)).join("") },
      xAxis: { type: "category", data: data.map(d => d.year), boundaryGap: false, axisLine: noAxisLine, axisTick: noAxisLine, axisLabel: axisLabel() },
      yAxis: { type: "value", scale: true, splitNumber: 5, axisLabel: axisLabel({ formatter: v => Math.round(v * 100) + "%" }), splitLine,
        min: v => Math.max(0, Math.floor((v.min - .05) * 20) / 20), max: v => Math.min(1, Math.ceil((v.max + .03) * 20) / 20) },
      series: [s("chgRate", "สั่งฟ้อง", T.s1), s("convRate", "ลงโทษ", T.s2)]
    }, true);
  }

  /* 3. crime rate by state */
  function states(vm) {
    const sel = vm.sel.state;
    const data = vm.byState;
    chart("ch-state").setOption({
      ...base(),
      grid: { top: 4, right: 48, bottom: 8, left: 104 },
      tooltip: { ...base().tooltip, trigger: "item",
        formatter: p => stateTip(p.data.d) },
      xAxis: { type: "value", show: false },
      yAxis: { type: "category", inverse: true, data: data.map(d => d.label), axisLine: noAxisLine, axisTick: noAxisLine,
        axisLabel: { color: T.ink2, fontSize: 12, fontFamily: T.fontBody } },
      series: [{
        type: "bar", barCategoryGap: "28%", cursor: "pointer",
        data: data.map(d => ({
          value: d.value, d, onClick: () => App.setState(d.i),
          itemStyle: { color: sel === null || sel === d.i ? T.accent : T.muted, borderRadius: [0, 4, 4, 0] }
        })),
        label: { show: true, position: "right", formatter: p => vm.metric.fmt(p.value), color: T.ink2, fontFamily: T.fontMono, fontSize: 11 }
      }]
    }, true);
  }

  function stateTip(d) {
    return `<b>${d.label}</b> <span style="color:${T.ink3}">${d.key}</span>` +
      row("อาชญากรรม/แสนคน/ปี", fmt.num(d.rate)) + row("อัตราสั่งฟ้อง", fmt.pct(d.chgRate)) +
      row("อัตราลงโทษ", fmt.pct(d.convRate)) + row("กลุ่มยุติธรรมสูง", fmt.pct(d.high)) + row("คดีรวม", fmt.int(d.cases));
  }

  /* 3b. choropleth map of India (registerMap + map series + visualMap) */
  let mapReady = false;
  function map(vm) {
    if (!mapReady) { echarts.registerMap("india", vm.geo); mapReady = true; }
    const byName = new Map(vm.byState.map(d => [d.key, d]));
    const m = vm.metric, sel = vm.sel.state;
    chart("ch-map").setOption({
      ...base(),
      tooltip: { ...base().tooltip, trigger: "item",
        formatter: p => p.data && p.data.d ? stateTip(p.data.d) : `<b>${p.name}</b><br><span style="color:${T.ink3}">ไม่มีในชุดข้อมูล</span>` },
      visualMap: { show: false, min: m.min, max: m.max, seriesIndex: 0, inRange: { color: T.seq }, outOfRange: { color: T.nodata } },
      series: [{
        type: "map", map: "india", roam: false, layoutCenter: ["50%", "50%"], layoutSize: "96%", selectedMode: false,
        itemStyle: { areaColor: T.nodata, borderColor: T.surface, borderWidth: .8 },
        emphasis: { label: { show: false }, itemStyle: { areaColor: null, borderColor: T.ink, borderWidth: 1.5 } },
        label: { show: false },
        data: vm.geo.features.map(f => {
          const d = byName.get(f.properties.name);
          if (!d) return { name: f.properties.name, value: NaN, cursor: "default", emphasis: { disabled: true } };
          const t = (d.value - m.min) / ((m.max - m.min) || 1);
          const c = t > .55 ? T.surface : T.ink;
          return {
            name: f.properties.name, value: d.value, d, onClick: () => App.setState(d.i),
            itemStyle: sel === d.i ? { borderColor: T.ink, borderWidth: 2 } : undefined,
            label: { show: true, formatter: () => m.fmt(d.value), color: c, fontSize: 11, fontWeight: 600, fontFamily: T.fontMono }
          };
        })
      }]
    }, true);
  }

  /* 4. case outcome by crime type (100% stacked) */
  function pipeline(vm) {
    const data = vm.byCrime, sel = vm.sel.crime;
    const keys = [["convicted", "ลงโทษ"], ["chargedOnly", "สั่งฟ้องแต่ยังไม่ลงโทษ"], ["notCharged", "ไม่ถูกสั่งฟ้อง"]];
    chart("ch-pipeline").setOption({
      ...base(),
      grid: { top: 4, right: 12, bottom: 22, left: 120 },
      tooltip: { ...base().tooltip, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: T.grid, opacity: .5 } },
        formatter: ps => { const d = ps[0].data.d; return `<b>${d.label}</b> <span style="color:${T.ink3}">${d.key}</span>` + keys.map(([k, l], j) => row(l, fmt.pct(d[k]), T.pipe[j])).join("") + row("คดีรวม", fmt.int(d.cases)); } },
      xAxis: { type: "value", max: 1, splitNumber: 5, axisLabel: axisLabel({ formatter: v => Math.round(v * 100) + "%" }), splitLine: { show: false } },
      yAxis: { type: "category", inverse: true, data: data.map(d => d.label), axisLine: noAxisLine, axisTick: noAxisLine,
        axisLabel: { color: T.ink2, fontSize: 12, fontFamily: T.fontBody } },
      series: keys.map(([k, l], j) => ({
        type: "bar", name: l, stack: "all", barCategoryGap: "24%", cursor: "pointer",
        data: data.map(d => ({
          value: d[k], d, onClick: () => App.setCrime(d.i),
          itemStyle: { color: T.pipe[j], opacity: sel === null || sel === d.i ? 1 : .35,
            borderColor: T.surface, borderWidth: 1,
            borderRadius: j === 2 ? [0, 4, 4, 0] : 0 }
        })),
        label: j === 0 ? { show: true, position: "insideLeft", formatter: p => fmt.pct(p.value), color: T.surface, fontFamily: T.fontMono, fontWeight: 600, fontSize: 11 } : { show: false }
      }))
    }, true);
  }

  /* 5. heatmap */
  function heat(vm) {
    const el = document.getElementById("ch-heat");
    el.style.overflowX = "auto";
    el.style.minWidth = "0";
    const inner = el.querySelector(".ec-inner") || Object.assign(el.appendChild(document.createElement("div")), { className: "ec-inner" });
    inner.id = "ch-heat-inner";
    inner.style.cssText = `height:100%;min-width:980px;width:100%`;
    const { state: ss, crime: sc } = vm.sel;
    const ext = [Math.min(...vm.heat.map(d => d.rate)), Math.max(...vm.heat.map(d => d.rate))];
    const yIdx = new Map(vm.heatStates.map((d, k) => [d.i, k]));
    chart("ch-heat-inner").setOption({
      ...base(),
      grid: { top: 36, right: 8, bottom: 8, left: 108 },
      tooltip: { ...base().tooltip, trigger: "item",
        formatter: p => { const d = p.data.d; return `<b>${fmt.state(App.data.states[d.s])} · ${fmt.crime(App.data.crimes[d.c])}</b>${row("อาชญากรรม/แสนคน/ปี", fmt.num(d.rate, 2))}${row("คดีรวม 10 ปี", fmt.int(d.cases))}`; } },
      xAxis: { type: "category", position: "top", data: vm.heatCrimes.map(d => d.label), axisLine: noAxisLine, axisTick: noAxisLine,
        axisLabel: { color: T.ink2, fontSize: 11.5, interval: 0 }, splitArea: { show: false } },
      yAxis: { type: "category", inverse: true, data: vm.heatStates.map(d => d.label), axisLine: noAxisLine, axisTick: noAxisLine,
        axisLabel: { color: T.ink2, fontSize: 12 } },
      visualMap: { show: false, min: ext[0], max: ext[1], dimension: 2, inRange: { color: T.seq } },
      series: [{
        type: "heatmap", cursor: "pointer",
        data: vm.heat.map(d => {
          const on = (ss === d.s && (sc === null || sc === d.c)) || (sc === d.c && ss === null);
          const t = (d.rate - ext[0]) / (ext[1] - ext[0]);
          return {
            value: [d.c, yIdx.get(d.s), d.rate], d, onClick: () => App.setBoth(d.s, d.c),
            itemStyle: { borderColor: on ? T.ink : T.surface, borderWidth: on ? 2 : 2, borderRadius: 3 },
            label: { color: t > .55 ? T.surface : T.ink }
          };
        }),
        label: { show: true, formatter: p => fmt.num(p.value[2], 2), fontFamily: T.fontMono, fontSize: 11, fontWeight: 500 },
        emphasis: { itemStyle: { borderColor: T.ink, borderWidth: 2 } }
      }]
    }, true);
  }

  /* 6. cluster profile (grouped bars on z-scores) */
  function clusterProfile(vm) {
    const vars = [["Chargesheet_Rate", "อัตราสั่งฟ้อง"], ["Convictions_Rate", "อัตราลงโทษ"], ["Crime_Rate_per_100k", "อาชญากรรม/แสน"], ["Justice_index", "Justice index"]];
    const zmax = Math.ceil(Math.max(...vm.clusters.flatMap(c => vars.map(v => Math.abs(c.z[v[0]])))) * 2) / 2;
    chart("ch-cprofile").setOption({
      ...base(),
      grid: { top: 10, right: 8, bottom: 30, left: 40 },
      tooltip: { ...base().tooltip, trigger: "item",
        formatter: p => { const { c, v, i } = p.data; return `<b>${c.name}</b> · ${v[1]}${row("ค่าเฉลี่ยกลุ่ม", fmt.num(c.mean[v[0]], 2))}${row("Z-score", (p.value > 0 ? "+" : "") + p.value.toFixed(2), T.cluster[i])}`; } },
      xAxis: { type: "category", data: vars.map(v => v[1]), axisLine: { lineStyle: { color: T.ink3 } }, axisTick: noAxisLine,
        axisLabel: { color: T.ink2, fontSize: 12, interval: 0 } },
      yAxis: { type: "value", min: -zmax, max: zmax, axisLabel: axisLabel({ formatter: v => (v > 0 ? "+" : "") + v }), splitLine },
      series: vm.clusters.map((c, i) => ({
        type: "bar", name: c.name, barGap: "12%", barCategoryGap: "22%",
        data: vars.map(v => ({
          value: c.z[v[0]], c, v, i,
          itemStyle: { color: T.cluster[i], borderRadius: c.z[v[0]] >= 0 ? [4, 4, 0, 0] : [0, 0, 4, 4] }
        }))
      }))
    }, true);
  }

  /* 7. cluster share per state (100% stacked) */
  function clusterState(vm) {
    const data = vm.clusterByState, sel = vm.sel.state;
    chart("ch-cstate").setOption({
      ...base(),
      grid: { top: 4, right: 12, bottom: 22, left: 104 },
      tooltip: { ...base().tooltip, trigger: "axis", axisPointer: { type: "shadow", shadowStyle: { color: T.grid, opacity: .5 } },
        formatter: ps => { const d = ps[0].data.d; return `<b>${d.label}</b>` + vm.clusters.map((c, j) => row(c.name, fmt.pct(d.share[j]), T.cluster[j])).join(""); } },
      xAxis: { type: "value", max: 1, axisLabel: axisLabel({ formatter: v => Math.round(v * 100) + "%" }), splitLine: { show: false } },
      yAxis: { type: "category", inverse: true, data: data.map(d => d.label), axisLine: noAxisLine, axisTick: noAxisLine,
        axisLabel: { color: T.ink2, fontSize: 12 } },
      series: vm.clusters.map((c, j) => ({
        type: "bar", name: c.name, stack: "all", barCategoryGap: "24%", cursor: "pointer",
        data: data.map(d => ({
          value: d.share[j], d, onClick: () => App.setState(d.i),
          itemStyle: { color: T.cluster[j], opacity: sel === null || sel === d.i ? 1 : .35,
            borderColor: T.surface, borderWidth: 1, borderRadius: j === 3 ? [0, 4, 4, 0] : 0 }
        }))
      }))
    }, true);
  }

  /* 8. scatter small multiples: 4 grids in one instance */
  function scatter(vm) {
    const el = document.getElementById("ch-scatter");
    const cols = el.clientWidth < 640 ? 2 : 4, rows = Math.ceil(4 / cols), ph = 270;
    const c = chart("ch-scatter", rows * ph + 10);
    const pw = el.clientWidth / cols; // grid positions in pixels
    const grids = [], xs = [], ys = [], series = [], titles = [];
    const xMax = Math.ceil(vm.scatterMax.x / 50) * 50, yMax = Math.ceil(vm.scatterMax.y / 20) * 20;
    vm.clusters.forEach((cl, k) => {
      const col = k % cols, r = Math.floor(k / cols);
      grids.push({ left: col * pw + 40, width: pw - 52, top: r * ph + 44, height: ph - 74 });
      xs.push({ gridIndex: k, type: "value", min: 0, max: xMax, splitNumber: 3, axisLine: noAxisLine, axisTick: noAxisLine,
        axisLabel: axisLabel(), splitLine: { show: false }, name: "อาชญากรรม/แสน →", nameLocation: "end", nameGap: -2,
        nameTextStyle: { color: T.ink3, fontSize: 10.5, align: "right", verticalAlign: "top", padding: [18, 0, 0, 0] } });
      ys.push({ gridIndex: k, type: "value", min: 0, max: yMax, splitNumber: 4, axisLabel: axisLabel(), splitLine });
      titles.push({ text: cl.name, subtext: "n=" + fmt.int(vm.scatter.filter(p => p.k === k).length),
        left: col * pw + 34, top: r * ph, itemGap: 2,
        textStyle: { color: T.ink, fontSize: 12.5, fontWeight: 600, fontFamily: T.fontBody },
        subtextStyle: { color: T.ink3, fontSize: 10.5 } });
      series.push({
        type: "scatter", xAxisIndex: k, yAxisIndex: k, symbolSize: 4, silent: true,
        itemStyle: { color: T.muted }, data: vm.scatter.filter(p => p.k !== k).map(p => [p.x, p.y]), z: 1
      });
      series.push({
        type: "scatter", xAxisIndex: k, yAxisIndex: k, symbolSize: 6, z: 2,
        itemStyle: { color: T.cluster[k], opacity: .75, borderColor: T.surface, borderWidth: .6 },
        emphasis: { itemStyle: { borderColor: T.ink, borderWidth: 1.5, opacity: 1 } },
        data: vm.scatter.filter(p => p.k === k).map(p => ({ value: [p.x, p.y], p }))
      });
    });
    c.setOption({
      ...base(),
      title: titles, grid: grids, xAxis: xs, yAxis: ys, series,
      tooltip: { ...base().tooltip, trigger: "item",
        formatter: prm => { const p = prm.data.p; if (!p) return ""; return `<b>${p.district}</b> · ${fmt.state(App.data.states[p.s])}<br>${fmt.crime(App.data.crimes[p.c])} · ${p.year}${row("อาชญากรรม/แสน", fmt.num(p.x, 2), prm.color)}${row("Justice index", fmt.num(p.y, 2))}${row("อัตราลงโทษ", p.conv + "%")}`; } }
    }, true);
  }

  window.Charts = {
    render(vm, tokens) {
      T = tokens;
      splitLine = { lineStyle: { color: T.grid } };
      map(vm); trend(vm); rates(vm); states(vm); pipeline(vm); heat(vm);
      clusterProfile(vm); clusterState(vm); scatter(vm);
    }
  };
})();
