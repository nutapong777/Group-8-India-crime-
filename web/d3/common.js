/*
 * common.js — filters, aggregation and non-chart DOM for this site.
 * Loads data/dashboard.json (or inline window.__DATA__), holds filter state, computes one "view model"
 * and hands it to window.Charts.render(vm). Each version (D3 / ECharts)
 * only implements the drawing, so the comparison between libraries is fair.
 */
(function () {
  "use strict";

  const TH = {
    states: {
      "Bihar": "พิหาร", "Gujarat": "คุชราต", "Haryana": "หรยาณา", "Karnataka": "กรณาฏกะ",
      "Kerala": "เกรละ", "Madhya Pradesh": "มัธยประเทศ", "Maharashtra": "มหาราษฏระ", "Punjab": "ปัญจาบ",
      "Rajasthan": "ราชสถาน", "Tamil Nadu": "ทมิฬนาฑู", "Uttar Pradesh": "อุตตรประเทศ", "West Bengal": "เบงกอลตะวันตก"
    },
    crimes: {
      "Assault": "ทำร้ายร่างกาย", "Burglary": "บุกรุกลักทรัพย์", "Cybercrime": "อาชญากรรมไซเบอร์",
      "Dowry Deaths": "ฆาตกรรมสินสอด", "Fraud": "ฉ้อโกง", "Kidnapping": "ลักพาตัว", "Murder": "ฆาตกรรม",
      "Rape": "ข่มขืน", "Robbery": "ปล้นทรัพย์", "Theft": "ลักทรัพย์"
    }
  };

  const fmt = {
    int: n => Math.round(n).toLocaleString("en-US"),
    compact: n => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : String(Math.round(n)),
    pct: (n, d = 1) => (n * 100).toFixed(d) + "%",
    num: (n, d = 1) => Number(n).toFixed(d),
    state: s => TH.states[s] || s,
    crime: c => TH.crimes[c] || c
  };

  // metrics the map and the state bar chart can show
  const METRICS = {
    rate: { label: "อัตราอาชญากรรมต่อแสนคนต่อปี", short: "อาชญากรรม/แสนคน/ปี", fmt: v => fmt.num(v, 1) },
    conv: { label: "อัตราลงโทษ", short: "อัตราลงโทษ", fmt: v => fmt.pct(v) },
    chg: { label: "อัตราสั่งฟ้อง", short: "อัตราสั่งฟ้อง", fmt: v => fmt.pct(v) },
    high: { label: "สัดส่วนแถวในกลุ่ม “ยุติธรรมสูง”", short: "สัดส่วนกลุ่มยุติธรรมสูง", fmt: v => fmt.pct(v) }
  };
  const App = { data: null, geo: null, sel: { state: null, crime: null, metric: "rate" }, fmt, TH, METRICS };

  /* ---------- theme tokens (read from CSS so both libraries use the same colors) ---------- */
  App.tokens = function () {
    const cs = getComputedStyle(document.documentElement);
    const v = k => cs.getPropertyValue(k).trim();
    return {
      surface: v("--surface"), nodata: v("--nodata"), ink: v("--ink"), ink2: v("--ink-2"), ink3: v("--ink-3"),
      line: v("--line"), grid: v("--grid"), accent: v("--accent"), muted: v("--muted-mark"),
      cluster: [v("--c0"), v("--c1"), v("--c2"), v("--c3")],
      s1: v("--s1"), s2: v("--s2"),
      pipe: [v("--p1"), v("--p2"), v("--p3")],
      seq: [v("--seq-lo"), v("--seq-mid"), v("--seq-hi")],
      fontBody: v("--f-body"), fontMono: v("--f-mono")
    };
  };

  /* ---------- aggregation ---------- */
  // cube row: [state, crime, year, cases, chargesheeted, convictions, population, c0, c1, c2, c3]
  function filtered(ignoreState, ignoreCrime) {
    const { state, crime } = App.sel;
    const s = ignoreState ? null : state, c = ignoreCrime ? null : crime;
    return App.data.cube.filter(r => (s === null || r[0] === s) && (c === null || r[1] === c));
  }
  function sum(rows) {
    const t = { cases: 0, chg: 0, conv: 0, pop: 0, cl: [0, 0, 0, 0] };
    for (const r of rows) {
      t.cases += r[3]; t.chg += r[4]; t.conv += r[5]; t.pop += r[6];
      t.cl[0] += r[7]; t.cl[1] += r[8]; t.cl[2] += r[9]; t.cl[3] += r[10];
    }
    return t;
  }
  // population is repeated once per crime type in the source rows, so divide by the
  // number of crime types included to get people, then express cases per 100k per year.
  function rate(t, nCrimes) { return t.pop ? t.cases / (t.pop / nCrimes) * 1e5 : 0; }
  function group(rows, key) {
    const m = new Map();
    for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return m;
  }

  App.viewModel = function () {
    const d = App.data, sel = App.sel;
    const nCr = sel.crime === null ? d.crimes.length : 1;
    const all = filtered(false, false);
    const tot = sum(all);

    const kpi = {
      cases: tot.cases,
      chgRate: tot.chg / tot.cases,
      convRate: tot.conv / tot.cases,
      // pop sums across years too, so this ratio is already a per-year mean
      crimeRate: rate(tot, nCr),
      rows: all.length
    };

    const byYearMap = group(all, 2);
    const byYear = d.years.map(y => {
      const t = sum(byYearMap.get(y) || []);
      return { year: y, cases: t.cases, chgRate: t.chg / t.cases, convRate: t.conv / t.cases };
    });

    const stRows = group(filtered(true, false), 0);
    const byState = d.states.map((s, i) => {
      const t = sum(stRows.get(i) || []);
      const n = t.cl.reduce((a, b) => a + b, 0) || 1;
      const o = { i, key: s, label: fmt.state(s), rate: rate(t, nCr), cases: t.cases,
        convRate: t.conv / t.cases, chgRate: t.chg / t.cases, high: t.cl[0] / n };
      o.value = { rate: o.rate, conv: o.convRate, chg: o.chgRate, high: o.high }[sel.metric];
      return o;
    }).sort((a, b) => b.value - a.value);
    const metric = { key: sel.metric, ...METRICS[sel.metric],
      min: Math.min(...byState.map(d => d.value)), max: Math.max(...byState.map(d => d.value)) };

    const crRows = group(filtered(false, true), 1);
    const byCrime = d.crimes.map((c, i) => {
      const t = sum(crRows.get(i) || []);
      return {
        i, key: c, label: fmt.crime(c), cases: t.cases,
        convicted: t.conv / t.cases,
        chargedOnly: (t.chg - t.conv) / t.cases,
        notCharged: (t.cases - t.chg) / t.cases
      };
    }).sort((a, b) => b.convicted - a.convicted);

    // heatmap ignores both filters (overview), highlights the selection
    const heat = [];
    const hm = new Map();
    for (const r of d.cube) {
      const k = r[0] * 100 + r[1];
      if (!hm.has(k)) hm.set(k, []);
      hm.get(k).push(r);
    }
    const stateOrder = byStateOrderAll();
    for (const [k, rows] of hm) {
      const t = sum(rows);
      heat.push({ s: Math.floor(k / 100), c: k % 100, rate: rate(t, 1), cases: t.cases });
    }

    const csRows = group(filtered(true, false), 0);
    const clusterByState = d.states.map((s, i) => {
      const t = sum(csRows.get(i) || []);
      const n = t.cl.reduce((a, b) => a + b, 0) || 1;
      return { i, key: s, label: fmt.state(s), share: t.cl.map(x => x / n), counts: t.cl };
    }).sort((a, b) => b.share[0] - a.share[0]);

    const clusterCounts = tot.cl;

    const scatter = d.sample.filter(p => (sel.state === null || p[0] === sel.state) && (sel.crime === null || p[1] === sel.crime))
      .map(p => ({ s: p[0], c: p[1], year: p[2], x: p[3], y: p[4], conv: p[5], k: p[6], district: p[7] }));

    return {
      sel: { ...sel }, kpi, byYear, byState, byCrime, metric, geo: App.geo,
      heat, heatStates: stateOrder, heatCrimes: d.crimes.map((c, i) => ({ i, key: c, label: fmt.crime(c) })),
      clusters: d.clusters, clusterCounts, clusterByState, scatter,
      scatterMax: { x: Math.max(...d.sample.map(p => p[3])), y: Math.max(...d.sample.map(p => p[4])) }
    };
  };

  function byStateOrderAll() {
    const d = App.data;
    const g = group(d.cube, 0);
    return d.states.map((s, i) => ({ i, key: s, label: fmt.state(s), rate: rate(sum(g.get(i)), d.crimes.length) }))
      .sort((a, b) => b.rate - a.rate);
  }

  /* ---------- selection API used by charts (click to filter) ---------- */
  App.setState = function (i) { App.sel.state = (App.sel.state === i ? null : i); syncControls(); update(); };
  App.setCrime = function (i) { App.sel.crime = (App.sel.crime === i ? null : i); syncControls(); update(); };
  App.setBoth = function (s, c) {
    const same = App.sel.state === s && App.sel.crime === c;
    App.sel.state = same ? null : s; App.sel.crime = same ? null : c; syncControls(); update();
  };

  /* ---------- DOM parts that do not depend on a chart library ---------- */
  function renderKpis(vm) {
    const k = vm.kpi;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("kpi-cases", fmt.int(k.cases));
    set("kpi-chg", fmt.pct(k.chgRate));
    set("kpi-conv", fmt.pct(k.convRate));
    set("kpi-rate", fmt.num(k.crimeRate, 1));
    set("kpi-rate-sub", App.sel.crime === null ? "ทุกประเภทคดี ต่อแสนคนต่อปี" : fmt.crime(App.data.crimes[App.sel.crime]) + " ต่อแสนคนต่อปี");
    const scope = [App.sel.state === null ? "ทุกรัฐ" : fmt.state(App.data.states[App.sel.state]),
                   App.sel.crime === null ? "ทุกประเภทคดี" : fmt.crime(App.data.crimes[App.sel.crime])].join(" · ");
    // one cube row = state x crime x year over 25 districts -> original rows
    set("filter-note", `แสดง: ${scope} · ${fmt.int(k.rows * 25)} แถวข้อมูล`);
  }
  function renderClusterTable(vm) {
    const tb = document.getElementById("cluster-tbody");
    if (!tb) return;
    const tk = App.tokens();
    const total = vm.clusterCounts.reduce((a, b) => a + b, 0) || 1;
    tb.innerHTML = vm.clusters.map((c, i) => `
      <tr>
        <td><span class="sw" style="background:${tk.cluster[i]}"></span><span class="cname">${c.name}</span>
            <span class="cdesc">${c.id} · ${c.name_en} — ${c.desc}</span></td>
        <td class="num">${fmt.int(vm.clusterCounts[i])}</td>
        <td class="num">${fmt.pct(vm.clusterCounts[i] / total)}</td>
        <td class="num">${fmt.num(c.mean.Chargesheet_Rate)}%</td>
        <td class="num">${fmt.num(c.mean.Convictions_Rate)}%</td>
        <td class="num">${fmt.num(c.mean.Crime_Rate_per_100k)}</td>
        <td class="num">${fmt.num(c.mean.Justice_index)}</td>
      </tr>`).join("");
  }
  function renderClusterLegends(vm) {
    const tk = App.tokens();
    const html = vm.clusters.map((c, i) => `<span><i style="background:${tk.cluster[i]}"></i>${c.name}</span>`).join("");
    ["lg-cluster-a", "lg-cluster-b"].forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
  }
  function renderMetricLabels(vm) {
    const m = vm.metric;
    const crime = App.sel.crime === null ? "ทุกประเภทคดี" : fmt.crime(App.data.crimes[App.sel.crime]);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("map-title", m.label + " รายรัฐ");
    set("state-title", m.label + " รายรัฐ");
    set("map-sub", crime + " · 12 รัฐที่มีข้อมูล · คลิกรัฐเพื่อกรอง");
    set("state-sub", crime + " · เรียงจากมากไปน้อย");
    set("map-min", m.fmt(m.min));
    set("map-max", m.fmt(m.max));
  }
  function syncControls() {
    const s = document.getElementById("f-state"), c = document.getElementById("f-crime");
    if (s) s.value = App.sel.state === null ? "" : String(App.sel.state);
    if (c) c.value = App.sel.crime === null ? "" : String(App.sel.crime);
  }
  function buildControls() {
    const d = App.data;
    const s = document.getElementById("f-state"), c = document.getElementById("f-crime");
    s.innerHTML = `<option value="">ทุกรัฐ (12)</option>` + d.states.map((x, i) => `<option value="${i}">${fmt.state(x)} · ${x}</option>`).join("");
    c.innerHTML = `<option value="">ทุกประเภทคดี (10)</option>` + d.crimes.map((x, i) => `<option value="${i}">${fmt.crime(x)} · ${x}</option>`).join("");
    s.addEventListener("change", () => { App.sel.state = s.value === "" ? null : +s.value; update(); });
    c.addEventListener("change", () => { App.sel.crime = c.value === "" ? null : +c.value; update(); });
    const mt = document.getElementById("f-metric");
    if (mt) {
      mt.innerHTML = Object.entries(METRICS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join("");
      mt.value = App.sel.metric;
      mt.addEventListener("change", () => { App.sel.metric = mt.value; update(); });
    }
    document.getElementById("f-reset").addEventListener("click", () => { App.sel.state = null; App.sel.crime = null; syncControls(); update(); });
  }

  let raf = 0;
  function update() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const vm = App.viewModel();
      renderKpis(vm);
      renderClusterTable(vm);
      renderClusterLegends(vm);
      renderMetricLabels(vm);
      const t0 = performance.now();
      window.Charts.render(vm, App.tokens());
      const el = document.getElementById("render-ms");
      if (el) el.textContent = (performance.now() - t0).toFixed(0) + " ms";
    });
  }
  App.update = update;

  async function boot() {
    try {
      if (window.__DATA__ && window.__GEO__) {        // data/*.js loaded by <script> (works on file://)
        App.data = window.__DATA__; App.geo = window.__GEO__;
      } else {
        const [res, geo] = await Promise.all([fetch("data/dashboard.json"), fetch("data/india_states.geojson")]);
        if (!res.ok) throw new Error("HTTP " + res.status);
        if (!geo.ok) throw new Error("HTTP " + geo.status);
        App.data = await res.json();
        App.geo = await geo.json();
      }
    } catch (e) {
      document.getElementById("app-status").textContent =
        "โหลดข้อมูลไม่สำเร็จ: เปิดหน้านี้ผ่านเว็บเซิร์ฟเวอร์ (เช่น python server/serve.py) และตรวจว่าโฟลเดอร์ data/ อยู่ข้าง index.html (" + e.message + ")";
      return;
    }
    document.getElementById("app-status").hidden = true;
    document.getElementById("app").hidden = false;
    buildControls();
    if (window.Charts.init) window.Charts.init();
    update();

    // redraw on resize and on theme change (light/dark)
    let rt = 0;
    const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(update, 120); });
    ro.observe(document.getElementById("app"));
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", update);
    new MutationObserver(update).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  window.App = App;
  document.addEventListener("DOMContentLoaded", boot);
})();
