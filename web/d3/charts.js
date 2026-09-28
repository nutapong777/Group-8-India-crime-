/*
 * D3.js version — every mark, axis, tooltip and interaction is built by hand.
 * Receives the same view model as the ECharts version (see common.js).
 */
(function () {
  "use strict";
  const { fmt } = window.App;
  const tipEl = document.getElementById("tip");
  let T; // theme tokens for the current render

  /* ---------------- transitions ----------------
   * Every render redraws the SVG, so each chart remembers where its marks were
   * (MEM) and animates from there to the new values. No memory yet = grow in from zero.
   * App.animate is false on window resize and for prefers-reduced-motion.
   */
  const DUR = 650;
  const MEM = {};                       // chartId -> Map(key -> previous geometry/value)
  const anim = () => window.App.animate;
  const ease = d3.easeCubicOut;
  function tr(sel, delay = 0, name) {   // a transition, or an instant one when animation is off
    return sel.transition(name).duration(anim() ? DUR : 0).delay(anim() ? delay : 0).ease(ease);
  }
  function mem(id) { return MEM[id] || (MEM[id] = new Map()); }
  // number text that counts from its previous value
  function countText(sel, from, to, f) {
    sel.text(f(to));
    if (!anim()) return;
    tr(sel).textTween(() => { const i = d3.interpolateNumber(from, to); return t => f(i(t)); });
  }

  /* ---------------- helpers ---------------- */
  function frame(id, minW = 0) {
    const el = document.getElementById(id);
    el.innerHTML = "";
    const w = Math.max(el.clientWidth, minW), h = el.clientHeight;
    const svg = d3.select(el).append("svg")
      .attr("width", w).attr("height", h).attr("viewBox", `0 0 ${w} ${h}`)
      .style("display", "block").style("font-family", T.fontBody);
    return { svg, w, h };
  }
  function tip(html, ev) {
    tipEl.innerHTML = html;
    tipEl.style.opacity = 1;
    const r = tipEl.getBoundingClientRect();
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
    tipEl.style.left = x + "px"; tipEl.style.top = y + "px";
  }
  function hideTip() { tipEl.style.opacity = 0; }
  const row = (k, v, color) =>
    `<div class="t-row"><span>${color ? `<i style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></i>` : ""}${k}</span><span>${v}</span></div>`;

  function styleAxis(g, { grid = false, gridLen = 0, horizontal = false } = {}) {
    g.select(".domain").remove();
    g.selectAll(".tick text").attr("fill", T.ink3).style("font-size", "11px").style("font-family", T.fontMono);
    g.selectAll(".tick line").attr("stroke", T.grid);
    if (grid) g.selectAll(".tick line").attr(horizontal ? "y2" : "x2", horizontal ? -gridLen : gridLen);
  }
  // bar with 4px rounded data-end only (anchored end stays square)
  function hBarPath(x, y, w, h, r = 4) {
    r = Math.min(r, w, h / 2);
    if (w <= 0) return "";
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  }
  function vBarPath(x, y0, y1, w, r = 4) { // y0 = baseline, y1 = data end (can be above or below)
    const up = y1 < y0, hgt = Math.abs(y0 - y1);
    r = Math.min(r, w / 2, hgt);
    if (hgt === 0) return "";
    return up
      ? `M${x},${y0}V${y1 + r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 + r}V${y0}Z`
      : `M${x},${y0}V${y1 - r}Q${x},${y1} ${x + r},${y1}H${x + w - r}Q${x + w},${y1} ${x + w},${y1 - r}V${y0}Z`;
  }

  /* ---------------- 1. cases per year (area + line + crosshair) ---------------- */
  function trend(vm) {
    const { svg, w, h } = frame("ch-trend");
    const m = { t: 14, r: 56, b: 26, l: 52 };
    const data = vm.byYear;
    const x = d3.scalePoint(data.map(d => d.year), [m.l, w - m.r]);
    const y = d3.scaleLinear([0, d3.max(data, d => d.cases) * 1.12], [h - m.b, m.t]).nice();
    svg.append("g").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(4).tickFormat(fmt.compact).tickSize(0).tickPadding(8))
      .call(g => { styleAxis(g); g.selectAll(".tick").append("line").attr("x2", w - m.l - m.r).attr("stroke", T.grid); g.selectAll(".tick line").lower(); });
    svg.append("g").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).tickValues(w < 520 ? data.map(d => d.year).filter((y, i) => i % 2 === 0) : null).tickSize(0).tickPadding(8).tickFormat(d => String(d)))
      .call(g => styleAxis(g));
    const area = d3.area().x(d => x(d.year)).y0(y(0)).y1(d => y(d.cases)).curve(d3.curveMonotoneX);
    const line = d3.line().x(d => x(d.year)).y(d => y(d.cases)).curve(d3.curveMonotoneX);
    const M = mem("trend"), p = M.get("p");
    const last = data[data.length - 1];
    const aPath = svg.append("path").attr("fill", T.s1).attr("opacity", .12).attr("d", p ? p.area : area(data.map(d => ({ ...d, cases: 0 }))));
    tr(aPath).attr("d", area(data));
    const lPath = svg.append("path").attr("fill", "none").attr("stroke", T.s1).attr("stroke-width", 2).attr("d", p ? p.line : line(data));
    if (p) tr(lPath).attr("d", line(data));
    else drawIn(lPath);
    const dot = svg.append("circle").attr("cx", x(last.year)).attr("cy", p ? p.cy : y(last.cases)).attr("r", 4.5)
      .attr("fill", T.s1).attr("stroke", T.surface).attr("stroke-width", 2);
    tr(dot).attr("cy", y(last.cases));
    const lab = svg.append("text").attr("x", x(last.year) + 8).attr("y", (p ? p.cy : y(last.cases)) + 4)
      .attr("fill", T.ink).style("font", `600 12px ${T.fontMono}`);
    tr(lab).attr("y", y(last.cases) + 4);
    countText(lab, p ? p.v : 0, last.cases, fmt.compact);
    M.set("p", { area: area(data), line: line(data), cy: y(last.cases), v: last.cases });
    crosshair(svg, x, data, m, h, (d) => [[x(d.year), y(d.cases), T.s1]],
      d => `<b>ปี ${d.year}</b>${row("คดีที่รับแจ้ง", fmt.int(d.cases), T.s1)}`);
  }

  // stroke-dash draw-in for a line the first time it appears
  function drawIn(path) {
    if (!anim()) return;
    const L = path.node().getTotalLength();
    path.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L)
      .transition().duration(DUR * 1.4).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0)
      .on("end", function () { d3.select(this).attr("stroke-dasharray", null); });
  }

  // shared crosshair for line charts
  function crosshair(svg, x, data, m, h, pts, html) {
    const g = svg.append("g").style("pointer-events", "none").attr("opacity", 0);
    const vline = g.append("line").attr("y1", m.t).attr("y2", h - m.b).attr("stroke", T.ink3).attr("stroke-dasharray", "3 3");
    const dots = g.append("g");
    const xs = data.map(d => x(d.year));
    svg.append("rect").attr("x", m.l - 10).attr("y", 0).attr("width", xs[xs.length - 1] - m.l + 20).attr("height", h)
      .attr("fill", "transparent")
      .on("pointermove", ev => {
        const [mx] = d3.pointer(ev);
        const i = d3.minIndex(xs, v => Math.abs(v - mx));
        const d = data[i];
        g.attr("opacity", 1);
        vline.attr("x1", xs[i]).attr("x2", xs[i]);
        dots.selectAll("circle").data(pts(d)).join("circle")
          .attr("cx", p => p[0]).attr("cy", p => p[1]).attr("r", 4.5)
          .attr("fill", p => p[2]).attr("stroke", T.surface).attr("stroke-width", 2);
        tip(html(d), ev);
      })
      .on("pointerleave", () => { g.attr("opacity", 0); hideTip(); });
  }

  /* ---------------- 2. chargesheet & conviction rate per year ---------------- */
  function rates(vm) {
    const { svg, w, h } = frame("ch-rates");
    const m = { t: 14, r: 96, b: 26, l: 44 };
    const data = vm.byYear;
    const x = d3.scalePoint(data.map(d => d.year), [m.l, w - m.r]);
    const lo = d3.min(data, d => d.convRate), hi = d3.max(data, d => d.chgRate);
    const y = d3.scaleLinear([Math.max(0, lo - .06), Math.min(1, hi + .04)], [h - m.b, m.t]).nice();
    svg.append("g").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => Math.round(d * 100) + "%").tickSize(0).tickPadding(8))
      .call(g => { styleAxis(g); g.selectAll(".tick").append("line").attr("x2", w - m.l - m.r).attr("stroke", T.grid); });
    svg.append("g").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).tickValues(w < 520 ? data.map(d => d.year).filter((y, i) => i % 2 === 0) : null).tickSize(0).tickPadding(8).tickFormat(String)).call(g => styleAxis(g));
    const series = [
      { key: "chgRate", label: "สั่งฟ้อง", color: T.s1 },
      { key: "convRate", label: "ลงโทษ", color: T.s2 }
    ];
    const M = mem("rates");
    for (const s of series) {
      const ln = d3.line().x(d => x(d.year)).y(d => y(d[s.key])).curve(d3.curveMonotoneX);
      const p = M.get(s.key), last = data[data.length - 1];
      const path = svg.append("path").attr("fill", "none").attr("stroke", s.color).attr("stroke-width", 2).attr("d", p ? p.d : ln(data));
      if (p) tr(path).attr("d", ln(data)); else drawIn(path);
      const t = svg.append("text").attr("x", x(last.year) + 8).attr("y", (p ? p.y : y(last[s.key])) + 4)
        .attr("fill", T.ink2).style("font", `500 11.5px ${T.fontBody}`);
      tr(t).attr("y", y(last[s.key]) + 4);
      countText(t, p ? p.v : last[s.key], last[s.key], v => `${s.label} ${fmt.pct(v)}`);
      M.set(s.key, { d: ln(data), y: y(last[s.key]), v: last[s.key] });
    }
    crosshair(svg, x, data, m, h, d => series.map(s => [x(d.year), y(d[s.key]), s.color]),
      d => `<b>ปี ${d.year}</b>${row("อัตราสั่งฟ้อง", fmt.pct(d.chgRate), T.s1)}${row("อัตราลงโทษ", fmt.pct(d.convRate), T.s2)}`);
  }

  /* ---------------- 3. crime rate by state (horizontal bars, click to filter) ---------------- */
  function states(vm) {
    const { svg, w, h } = frame("ch-state");
    const m = { t: 4, r: 48, b: 8, l: 104 };
    const data = vm.byState;
    const y = d3.scaleBand(data.map(d => d.key), [m.t, h - m.b]).padding(.28);
    const x = d3.scaleLinear([0, d3.max(data, d => d.value)], [m.l, w - m.r]);
    const selected = vm.sel.state;
    const g = svg.append("g").selectAll("g").data(data).join("g").style("cursor", "pointer")
      .on("click", (ev, d) => App.setState(d.i))
      .on("pointermove", (ev, d) => tip(stateTip(d), ev))
      .on("pointerleave", hideTip);
    const M = mem("state"), bh = y.bandwidth();
    // each row starts where it was last time (rank + length) and moves to its new place
    g.attr("transform", d => `translate(0,${M.has(d.key) ? M.get(d.key).y - y(d.key) : 0})`);
    tr(g).attr("transform", "translate(0,0)");
    g.append("rect").attr("x", 0).attr("width", w).attr("y", d => y(d.key) - 3).attr("height", bh + 6).attr("fill", "transparent");
    g.append("path").attr("fill", d => selected === null || selected === d.i ? T.accent : T.muted)
      .attr("d", d => hBarPath(m.l, y(d.key), M.has(d.key) ? M.get(d.key).w : 0, bh))
      .each(function (d, i) {
        const from = M.has(d.key) ? M.get(d.key).w : 0, to = x(d.value) - m.l;
        tr(d3.select(this), M.has(d.key) ? 0 : i * 35).attrTween("d", () => t => hBarPath(m.l, y(d.key), from + (to - from) * t, bh));
      });
    g.append("text").attr("x", m.l - 8).attr("y", d => y(d.key) + bh / 2).attr("dy", ".35em")
      .attr("text-anchor", "end").attr("fill", d => selected === d.i ? T.ink : T.ink2)
      .style("font", d => `${selected === d.i ? 600 : 400} 12px ${T.fontBody}`).text(d => d.label);
    g.append("text").attr("y", d => y(d.key) + bh / 2).attr("dy", ".35em")
      .attr("fill", T.ink2).style("font", `500 11px ${T.fontMono}`)
      .attr("x", d => m.l + (M.has(d.key) ? M.get(d.key).w : 0) + 6)
      .each(function (d, i) {
        const el = d3.select(this), prev = M.get(d.key);
        tr(el, prev ? 0 : i * 35).attr("x", x(d.value) + 6);
        countText(el, prev && prev.metric === vm.metric.key ? prev.v : (prev ? d.value : 0), d.value, vm.metric.fmt);
      });
    data.forEach(d => M.set(d.key, { y: y(d.key), w: x(d.value) - m.l, v: d.value, metric: vm.metric.key }));
  }

  function stateTip(d) {
    return `<b>${d.label}</b> <span style="color:${T.ink3}">${d.key}</span>
      ${row("อาชญากรรม/แสนคน/ปี", fmt.num(d.rate))}${row("อัตราสั่งฟ้อง", fmt.pct(d.chgRate))}
      ${row("อัตราลงโทษ", fmt.pct(d.convRate))}${row("กลุ่มยุติธรรมสูง", fmt.pct(d.high))}${row("คดีรวม", fmt.int(d.cases))}`;
  }

  /* ---------------- 3b. choropleth map of India ---------------- */
  function map(vm) {
    const { svg, w, h } = frame("ch-map");
    const byName = new Map(vm.byState.map(d => [d.key, d]));
    const m = vm.metric;
    const color = d3.scaleLinear([m.min, (m.min + m.max) / 2, m.max], T.seq).interpolate(d3.interpolateLab);
    const proj = d3.geoMercator().fitExtent([[8, 8], [w - 8, h - 8]], vm.geo);
    const path = d3.geoPath(proj);
    const sel = vm.sel.state;
    const feats = vm.geo.features;
    const g = svg.append("g");
    const M = mem("map");
    const fillOf = f => byName.has(f.properties.name) ? color(byName.get(f.properties.name).value) : T.nodata;
    g.selectAll("path").data(feats).join("path")
      .attr("d", path)
      .attr("fill", f => M.get(f.properties.name) || (byName.has(f.properties.name) ? T.seq[0] : T.nodata))
      .call(sel => tr(sel).attr("fill", fillOf))
      .attr("stroke", T.surface).attr("stroke-width", .8)
      .style("cursor", f => byName.has(f.properties.name) ? "pointer" : "default")
      .on("click", (ev, f) => { const d = byName.get(f.properties.name); if (d) App.setState(d.i); })
      .on("pointermove", (ev, f) => {
        const d = byName.get(f.properties.name);
        tip(d ? stateTip(d) : `<b>${f.properties.name}</b><br><span style="color:${T.ink3}">ไม่มีในชุดข้อมูล</span>`, ev);
      })
      .on("pointerleave", hideTip);
    // selected state on top with an ink outline
    if (sel !== null) {
      const f = feats.find(f => f.properties.name === App.data.states[sel]);
      if (f) {
        const o = g.append("path").attr("d", path(f)).attr("fill", "none").attr("stroke", T.ink).attr("stroke-width", 2)
          .style("pointer-events", "none").attr("opacity", 0);
        tr(o).attr("opacity", 1);
      }
    }
    feats.forEach(f => M.set(f.properties.name, fillOf(f)));
    // value labels on the 12 states (names are in the tooltip and the bar chart beside the map)
    const t = d3.scaleLinear([m.min, m.max], [0, 1]);
    const lab = svg.append("g").style("pointer-events", "none");
    for (const f of feats) {
      const d = byName.get(f.properties.name);
      if (!d) continue;
      const [cx, cy] = path.centroid(f);
      const dark = t(d.value) > .55;
      const el = lab.append("text").attr("x", cx).attr("y", cy).attr("dy", ".35em").attr("text-anchor", "middle")
        .attr("fill", dark ? T.surface : T.ink).style("font", `600 11px ${T.fontMono}`);
      const prev = M.get("v:" + d.key);
      countText(el, prev && prev.metric === m.key ? prev.v : d.value, d.value, m.fmt);
      M.set("v:" + d.key, { v: d.value, metric: m.key });
    }
  }

  // 100% stacked rows: each row slides to its new rank, each segment morphs from its previous span
  function stackRows(id, rows, parts, colors, x, y) {
    const M = mem(id), bh = y.bandwidth();
    rows.attr("transform", d => `translate(0,${M.has(d.key) ? M.get(d.key).y - y(d.key) : 0})`);
    tr(rows, 0, "move").attr("transform", "translate(0,0)");
    rows.each(function (d, r) {
      const gg = d3.select(this), prev = M.get(d.key), segs = [];
      let acc = 0;
      parts(d).forEach((v, j, arr) => {
        const last = j === arr.length - 1;
        const x0 = x(acc), wSeg = Math.max(0, x(acc + v) - x0 - (last ? 0 : 2)); // 2px surface gap
        const from = prev ? prev.segs[j] : { x0: x(0), w: 0 };
        gg.append("path").attr("fill", colors[j]).attr("d", seg(from.x0, from.w))
          .call(p => tr(p, prev ? 0 : r * 40 + j * 60).attrTween("d", () => t =>
            seg(from.x0 + (x0 - from.x0) * t, from.w + (wSeg - from.w) * t)));
        function seg(a, ww) { return last ? hBarPath(a, y(d.key), ww, bh) : `M${a},${y(d.key)}h${ww}v${bh}h${-ww}Z`; }
        segs.push({ x0, w: wSeg });
        acc += v;
      });
      M.set(d.key, { y: y(d.key), segs });
    });
  }

  /* ---------------- 4. case outcome by crime type (100% stacked) ---------------- */
  function pipeline(vm) {
    const { svg, w, h } = frame("ch-pipeline");
    const m = { t: 4, r: 12, b: 22, l: 120 };
    const data = vm.byCrime;
    const keys = [["convicted", "ลงโทษ"], ["chargedOnly", "สั่งฟ้องแต่ยังไม่ลงโทษ"], ["notCharged", "ไม่ถูกสั่งฟ้อง"]];
    const y = d3.scaleBand(data.map(d => d.key), [m.t, h - m.b]).padding(.24);
    const x = d3.scaleLinear([0, 1], [m.l, w - m.r]);
    svg.append("g").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => d * 100 + "%").tickSize(0).tickPadding(8)).call(g => styleAxis(g));
    const sel = vm.sel.crime;
    const rows = svg.append("g").selectAll("g").data(data).join("g").style("cursor", "pointer")
      .attr("opacity", d => mem("pipe-o").get(d.key) ?? 1)
      .on("click", (ev, d) => App.setCrime(d.i))
      .on("pointermove", (ev, d) => tip(`<b>${d.label}</b> <span style="color:${T.ink3}">${d.key}</span>
          ${keys.map(([k, l], j) => row(l, fmt.pct(d[k]), T.pipe[j])).join("")}${row("คดีรวม", fmt.int(d.cases))}`, ev))
      .on("pointerleave", hideTip);
    rows.append("rect").attr("x", 0).attr("width", w).attr("y", d => y(d.key) - 3).attr("height", y.bandwidth() + 6).attr("fill", "transparent");
    const prevConv = new Map([...mem("pipe-v")]);
    stackRows("pipe", rows, d => keys.map(([k]) => d[k]), T.pipe, x, y);
    rows.append("text").attr("x", x(0) + 8).attr("y", d => y(d.key) + y.bandwidth() / 2).attr("dy", ".35em")
      .attr("fill", T.surface).style("font", `600 11px ${T.fontMono}`)
      .each(function (d) { countText(d3.select(this), prevConv.get(d.key) ?? d.convicted, d.convicted, v => fmt.pct(v)); });
    data.forEach(d => mem("pipe-v").set(d.key, d.convicted));
    tr(rows, 0, "fade").attr("opacity", d => sel === null || sel === d.i ? 1 : .35);
    data.forEach(d => mem("pipe-o").set(d.key, sel === null || sel === d.i ? 1 : .35));
    rows.append("text").attr("x", m.l - 8).attr("y", d => y(d.key) + y.bandwidth() / 2).attr("dy", ".35em")
      .attr("text-anchor", "end").attr("fill", T.ink2).style("font", `400 12px ${T.fontBody}`).text(d => d.label);
  }

  /* ---------------- 5. heatmap state x crime ---------------- */
  function heat(vm) {
    const el = document.getElementById("ch-heat");
    el.style.overflowX = "auto";
    const { svg, w, h } = frame("ch-heat", 980);
    const m = { t: 44, r: 8, b: 8, l: 108 };
    const rowsK = vm.heatStates.map(d => d.i), cols = vm.heatCrimes.map(d => d.i);
    const y = d3.scaleBand(rowsK, [m.t, h - m.b]).padding(.06);
    const x = d3.scaleBand(cols, [m.l, w - m.r]).padding(.06);
    const ext = d3.extent(vm.heat, d => d.rate);
    const color = d3.scaleLinear([ext[0], (ext[0] + ext[1]) / 2, ext[1]], T.seq).interpolate(d3.interpolateLab);
    const t = d3.scaleLinear(ext, [0, 1]);
    const { state: ss, crime: sc } = vm.sel;
    svg.append("g").selectAll("text").data(vm.heatCrimes).join("text")
      .attr("x", d => x(d.i) + x.bandwidth() / 2).attr("y", m.t - 10).attr("text-anchor", "middle")
      .attr("fill", d => sc === d.i ? T.ink : T.ink2).style("font", d => `${sc === d.i ? 600 : 400} 11.5px ${T.fontBody}`)
      .text(d => d.label);
    svg.append("g").selectAll("text").data(vm.heatStates).join("text")
      .attr("x", m.l - 8).attr("y", d => y(d.i) + y.bandwidth() / 2).attr("dy", ".35em").attr("text-anchor", "end")
      .attr("fill", d => ss === d.i ? T.ink : T.ink2).style("font", d => `${ss === d.i ? 600 : 400} 12px ${T.fontBody}`)
      .text(d => d.label);
    const cells = svg.append("g").selectAll("g").data(vm.heat).join("g").style("cursor", "pointer")
      .on("click", (ev, d) => App.setBoth(d.s, d.c))
      .on("pointermove", (ev, d) => tip(`<b>${fmt.state(App.data.states[d.s])} · ${fmt.crime(App.data.crimes[d.c])}</b>
          ${row("อาชญากรรม/แสนคน/ปี", fmt.num(d.rate, 2))}${row("คดีรวม 10 ปี", fmt.int(d.cases))}`, ev))
      .on("pointerleave", hideTip);
    const first = !mem("heat").has("done");
    const rowIdx = new Map(vm.heatStates.map((d, k) => [d.i, k]));
    if (first && anim()) cells.attr("opacity", 0).transition().duration(DUR * .7).ease(ease)
      .delay(d => (rowIdx.get(d.s) + d.c) * 28).attr("opacity", 1);
    const on = d => (ss === d.s && (sc === null || sc === d.c)) || (sc === d.c && ss === null);
    cells.append("rect").attr("x", d => x(d.c)).attr("y", d => y(d.s)).attr("width", x.bandwidth()).attr("height", y.bandwidth())
      .attr("rx", 3).attr("fill", d => color(d.rate))
      .attr("stroke", T.ink).attr("stroke-width", 2).attr("stroke-opacity", d => mem("heat").get(d.s * 100 + d.c) ? 1 : 0)
      .call(r => tr(r).attr("stroke-opacity", d => on(d) ? 1 : 0));
    vm.heat.forEach(d => mem("heat").set(d.s * 100 + d.c, on(d)));
    mem("heat").set("done", true);
    // high end of the ramp is far from the surface in both themes, so use surface-colored text there
    cells.append("text").attr("x", d => x(d.c) + x.bandwidth() / 2).attr("y", d => y(d.s) + y.bandwidth() / 2).attr("dy", ".35em")
      .attr("text-anchor", "middle").style("font", `500 11px ${T.fontMono}`).style("pointer-events", "none")
      .attr("fill", d => t(d.rate) > .55 ? T.surface : T.ink)
      .text(d => fmt.num(d.rate, 2));
  }

  /* ---------------- 6. cluster profile (grouped bars on z-scores) ---------------- */
  function clusterProfile(vm) {
    const { svg, w, h } = frame("ch-cprofile");
    const m = { t: 10, r: 8, b: 30, l: 40 };
    const vars = [["Chargesheet_Rate", "อัตราสั่งฟ้อง"], ["Convictions_Rate", "อัตราลงโทษ"], ["Crime_Rate_per_100k", "อาชญากรรม/แสน"], ["Justice_index", "Justice index"]];
    const x0 = d3.scaleBand(vars.map(v => v[0]), [m.l, w - m.r]).paddingInner(.22).paddingOuter(.06);
    const x1 = d3.scaleBand(vm.clusters.map((c, i) => i), [0, x0.bandwidth()]).padding(.12);
    const zmax = d3.max(vm.clusters, c => d3.max(vars, v => Math.abs(c.z[v[0]])));
    const y = d3.scaleLinear([-zmax, zmax], [h - m.b, m.t]).nice();
    svg.append("g").attr("transform", `translate(${m.l},0)`)
      .call(d3.axisLeft(y).ticks(6).tickSize(0).tickPadding(8).tickFormat(d => (d > 0 ? "+" : "") + d))
      .call(g => { styleAxis(g); g.selectAll(".tick").append("line").attr("x2", w - m.l - m.r).attr("stroke", T.grid); });
    svg.append("line").attr("x1", m.l).attr("x2", w - m.r).attr("y1", y(0)).attr("y2", y(0)).attr("stroke", T.ink3);
    svg.append("g").selectAll("text").data(vars).join("text")
      .attr("x", v => x0(v[0]) + x0.bandwidth() / 2).attr("y", h - 8).attr("text-anchor", "middle")
      .attr("fill", T.ink2).style("font", `400 12px ${T.fontBody}`).text(v => v[1]);
    const g = svg.append("g").selectAll("g").data(vars).join("g").attr("transform", v => `translate(${x0(v[0])},0)`);
    const first = !mem("cprof").has("done");
    g.selectAll("path").data(v => vm.clusters.map((c, i) => ({ v, c, i }))).join("path")
      .attr("d", d => vBarPath(x1(d.i), y(0), y(d.c.z[d.v[0]]), x1.bandwidth()))
      .call(p => { if (first && anim()) p.attr("d", d => vBarPath(x1(d.i), y(0), y(0) - 0.01, x1.bandwidth()))
        .transition().duration(DUR).delay(d => vars.findIndex(v => v === d.v) * 90 + d.i * 45).ease(ease)
        .attrTween("d", d => { const z = d.c.z[d.v[0]]; return t => vBarPath(x1(d.i), y(0), y(z * t), x1.bandwidth()); }); })
      .attr("fill", d => T.cluster[d.i])
      .on("pointermove", (ev, d) => tip(`<b>${d.c.name}</b> · ${d.v[1]}
          ${row("ค่าเฉลี่ยกลุ่ม", fmt.num(d.c.mean[d.v[0]], 2))}${row("Z-score", (d.c.z[d.v[0]] > 0 ? "+" : "") + d.c.z[d.v[0]].toFixed(2), T.cluster[d.i])}`, ev))
      .on("pointerleave", hideTip);
    mem("cprof").set("done", true);
  }

  /* ---------------- 7. cluster share per state (100% stacked) ---------------- */
  // (cluster profile is global data: it only animates the first time it is drawn)
  function clusterState(vm) {
    const { svg, w, h } = frame("ch-cstate");
    const m = { t: 4, r: 12, b: 22, l: 104 };
    const data = vm.clusterByState;
    const y = d3.scaleBand(data.map(d => d.key), [m.t, h - m.b]).padding(.24);
    const x = d3.scaleLinear([0, 1], [m.l, w - m.r]);
    svg.append("g").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d => d * 100 + "%").tickSize(0).tickPadding(8)).call(g => styleAxis(g));
    const sel = vm.sel.state;
    const rows = svg.append("g").selectAll("g").data(data).join("g").style("cursor", "pointer")
      .attr("opacity", d => mem("cs-o").get(d.key) ?? 1)
      .on("click", (ev, d) => App.setState(d.i))
      .on("pointermove", (ev, d) => tip(`<b>${d.label}</b>${vm.clusters.map((c, j) => row(c.name, fmt.pct(d.share[j]), T.cluster[j])).join("")}`, ev))
      .on("pointerleave", hideTip);
    rows.append("rect").attr("x", 0).attr("width", w).attr("y", d => y(d.key) - 3).attr("height", y.bandwidth() + 6).attr("fill", "transparent");
    stackRows("cstate", rows, d => d.share, T.cluster, x, y);
    tr(rows, 0, "fade").attr("opacity", d => sel === null || sel === d.i ? 1 : .35);
    data.forEach(d => mem("cs-o").set(d.key, sel === null || sel === d.i ? 1 : .35));
    rows.append("text").attr("x", m.l - 8).attr("y", d => y(d.key) + y.bandwidth() / 2).attr("dy", ".35em")
      .attr("text-anchor", "end").attr("fill", T.ink2).style("font", `400 12px ${T.fontBody}`).text(d => d.label);
  }

  /* ---------------- 8. scatter small multiples ---------------- */
  function scatter(vm) {
    const el = document.getElementById("ch-scatter");
    const cols = el.clientWidth < 640 ? 2 : 4;
    const rowsN = Math.ceil(4 / cols);
    el.style.height = (rowsN * 270 + 10) + "px";
    const { svg, w } = frame("ch-scatter");
    const pw = w / cols, ph = 270;
    const m = { t: 26, r: 12, b: 30, l: 40 };
    const x = d3.scaleLinear([0, vm.scatterMax.x], [m.l, pw - m.r]).nice();
    const y = d3.scaleLinear([0, vm.scatterMax.y], [ph - m.b, m.t]).nice();
    const key = `${vm.sel.state}|${vm.sel.crime}`, changed = mem("scatter").get("key") !== key;
    mem("scatter").set("key", key);
    vm.clusters.forEach((c, k) => {
      const g = svg.append("g").attr("transform", `translate(${(k % cols) * pw},${Math.floor(k / cols) * ph})`);
      g.append("text").attr("x", m.l).attr("y", 14).attr("fill", T.ink).style("font", `600 12.5px ${T.fontBody}`).text(c.name + "  ·  n=" + fmt.int(vm.scatter.filter(p => p.k === k).length));
      g.append("circle").attr("cx", m.l - 10).attr("cy", 10).attr("r", 4).attr("fill", T.cluster[k]);
      g.append("g").attr("transform", `translate(0,${ph - m.b})`)
        .call(d3.axisBottom(x).ticks(4).tickSize(0).tickPadding(6)).call(a => styleAxis(a));
      g.append("g").attr("transform", `translate(${m.l},0)`)
        .call(d3.axisLeft(y).ticks(4).tickSize(0).tickPadding(6))
        .call(a => { styleAxis(a); a.selectAll(".tick").append("line").attr("x2", pw - m.l - m.r).attr("stroke", T.grid); });
      const others = vm.scatter.filter(p => p.k !== k), mine = vm.scatter.filter(p => p.k === k);
      g.append("g").selectAll("circle").data(others).join("circle")
        .attr("cx", p => x(p.x)).attr("cy", p => y(p.y)).attr("r", 2).attr("fill", T.muted);
      const pts = g.append("g").selectAll("circle").data(mine).join("circle")
        .attr("cx", p => x(p.x)).attr("cy", p => y(p.y)).attr("r", 3).attr("fill", T.cluster[k]).attr("fill-opacity", .75)
        .attr("stroke", T.surface).attr("stroke-width", .6);
      if (changed && anim()) pts.attr("r", 0).transition().duration(DUR).ease(d3.easeBackOut)
        .delay(p => Math.min(700, (x(p.x) - m.l) * 1.6)).attr("r", 3);
      // nearest-point hover via Delaunay
      if (mine.length) {
        const del = d3.Delaunay.from(mine, p => x(p.x), p => y(p.y));
        const ring = g.append("circle").attr("r", 6).attr("fill", "none").attr("stroke", T.ink).attr("stroke-width", 1.5).attr("opacity", 0);
        g.append("rect").attr("x", m.l).attr("y", m.t).attr("width", pw - m.l - m.r).attr("height", ph - m.t - m.b).attr("fill", "transparent")
          .on("pointermove", ev => {
            const [mx, my] = d3.pointer(ev);
            const p = mine[del.find(mx, my)];
            ring.attr("cx", x(p.x)).attr("cy", y(p.y)).attr("opacity", 1);
            tip(`<b>${p.district}</b> · ${fmt.state(App.data.states[p.s])}<br>${fmt.crime(App.data.crimes[p.c])} · ${p.year}
              ${row("อาชญากรรม/แสน", fmt.num(p.x, 2), T.cluster[k])}${row("Justice index", fmt.num(p.y, 2))}${row("อัตราลงโทษ", p.conv + "%")}`, ev);
          })
          .on("pointerleave", () => { ring.attr("opacity", 0); hideTip(); });
      }
      g.append("text").attr("x", pw - m.r).attr("y", ph - 2).attr("text-anchor", "end").attr("fill", T.ink3)
        .style("font", `400 10.5px ${T.fontBody}`).text("อาชญากรรม/แสน →");
    });
  }

  window.Charts = {
    render(vm, tokens) {
      T = tokens;
      map(vm); trend(vm); rates(vm); states(vm); pipeline(vm); heat(vm);
      clusterProfile(vm); clusterState(vm); scatter(vm);
    }
  };
})();
