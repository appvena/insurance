/* Vehicle Protection — v1.6 · Copyright © SRISP 2026 */
import { firebaseConfig, FB_VER, APP_VERSION, COPYRIGHT } from "./config.js";
import { EXT_DEFS, COVER_LABEL, DEFAULT_SETTINGS, DEFAULT_VEHICLES, FUNCS, FUNC_COVERS, CATS, OJK_W1, catOfType, NEW_VEHICLES_152 } from "./data.js";

/* ====================== UTIL ====================== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const clone = o => JSON.parse(JSON.stringify(o));
const fmt = n => new Intl.NumberFormat("id-ID").format(Math.round(n || 0));
const rp = n => "Rp " + fmt(n);
const pct = n => (+n || 0).toLocaleString("id-ID", { maximumFractionDigits: 4 }) + "%";
const parseNum = s => +String(s ?? "").replace(/[^\d]/g, "") || 0;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lines = s => String(s || "").split("\n").map(x => x.trim()).filter(Boolean);
function toast(msg, type = "", ms = 3200) {
  const t = $("#toast"); t.textContent = msg; t.className = "toast show " + type;
  clearTimeout(toast._t); toast._t = setTimeout(() => t.className = "toast", ms);
}
/* ---- Animasi loading: garis progres atas & tombol berputar ---- */
let busyN = 0;
function busy(d) { busyN = Math.max(0, busyN + d); const b = document.getElementById("topbar"); if (b) b.classList.toggle("on", busyN > 0); }
function btnLoad(b, on, txt) {
  if (!b) return;
  if (on) { if (!b.dataset.txt) b.dataset.txt = b.textContent; if (txt) b.textContent = txt; b.classList.add("loading"); b.disabled = true; }
  else { if (b.dataset.txt) b.textContent = b.dataset.txt; delete b.dataset.txt; b.classList.remove("loading"); b.disabled = false; }
}
async function withBtn(b, fn, txt) { if (b && b.classList.contains("loading")) return; btnLoad(b, true, txt); try { return await fn(); } finally { btnLoad(b, false); } }
function hideSplash() {
  const s = document.getElementById("splash"); if (!s) return;
  setTimeout(() => { s.classList.add("out"); setTimeout(() => s.remove(), 400); }, Math.max(0, 450 - performance.now()));
}
const SKEL = n => Array.from({ length: n }, () => `<div class="skrow"><div class="sk" style="width:46%"></div><div class="sk" style="width:72%"></div><div class="sk" style="width:30%"></div></div>`).join("");
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

/* ====================== STATE ====================== */
function mergeDeep(base, extra) {
  if (!extra || typeof extra !== "object") return base;
  for (const k of Object.keys(extra)) {
    const v = extra[k];
    if (v && typeof v === "object" && !Array.isArray(v) && base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) mergeDeep(base[k], v);
    else if (v !== undefined) base[k] = v;
  }
  return base;
}
function normalizeSettings(raw) {
  const s = mergeDeep(clone(DEFAULT_SETTINGS), raw || {});
  if (raw && raw.tiers && !raw.tiersByFunc) FUNCS.forEach(f => FUNC_COVERS[f.key].forEach(cv => { if (raw.tiers[cv]) s.tiersByFunc[f.key][cv] = clone(raw.tiers[cv]); }));
  if (raw && raw.texts && raw.texts.deductible != null && !raw.textsByFunc)
    FUNCS.forEach(f => ["deductible", "clauses", "subjectivity"].forEach(k => { if (raw.texts[k] != null) s.textsByFunc[f.key][k] = raw.texts[k]; }));
  FUNCS.forEach(f => { const t = {}; FUNC_COVERS[f.key].forEach(cv => t[cv] = s.tiersByFunc[f.key][cv] || clone(s.tiersByFunc.PRIBADI.comprehensive)); s.tiersByFunc[f.key] = t; });
  FUNCS.forEach(f => { const fl = {}; ["truck", "bus", "moto"].forEach(k => { fl[k] = {}; FUNC_COVERS[f.key].forEach(cv => { const v = ((s.flatByFunc[f.key] || {})[k] || {})[cv]; fl[k][cv] = v != null ? +v : OJK_W1[cv][k][0]; }); }); s.flatByFunc[f.key] = fl; });
  s.texts = { disclaimer: s.texts.disclaimer };
  delete s.tiers; delete s.updatedAt; delete s.updatedBy;
  return s;
}
let S = normalizeSettings(LS.get("ai_settings"));
const funcLabel = k => (FUNCS.find(f => f.key === k) || { label: k || "-" }).label;
const catInfo = k => CATS.find(c => c.key === k) || CATS[0];
/* Tambahkan sekali kendaraan baru (truk, bus, roda 2) ke daftar lama yang sudah tersimpan */
function mergeNewVehicles() {
  if ((S.vehMerged || []).includes("v1.5.2")) return;
  const has = new Set(VEH.map(v => (v.brand + "|" + v.model).toLowerCase()));
  NEW_VEHICLES_152.forEach(v => { if (!has.has((v.brand + "|" + v.model).toLowerCase())) VEH.push(clone(v)); });
}
const TX = k => S.textsByFunc[k] || S.textsByFunc.PRIBADI;
/* Perluasan tambahan buatan admin: { id, label, rate, desc, clause, funcs: {PRIBADI,DINAS,KOMERSIAL}, active } */
const CX = (func) => (S.customExt || []).filter(x => x.active !== false && x.label && (!func || (x.funcs || {})[func] !== false));
const cxChosen = inp => CX(inp.func).filter(x => (inp.ext || {})["c_" + x.id]);
let VEH = Array.isArray(LS.get("ai_vehicles")) ? LS.get("ai_vehicles") : clone(DEFAULT_VEHICLES);
mergeNewVehicles();
let fb = null, user = null, last = null, lastQuick = null;
let currentId = null, currentRef = null;
let authResolved = false, wantedTab = null, draftsReady = false;

/* ====================== PERHITUNGAN ====================== */
function tierRate(tiers, si) {
  const sorted = [...tiers].sort((a, b) => (a.max ?? Infinity) - (b.max ?? Infinity));
  for (const t of sorted) if (t.max == null || si <= t.max) return { rate: +t.rate, tier: t, sorted };
  const t = sorted[sorted.length - 1]; return { rate: +t.rate, tier: t, sorted };
}
function period(start, end) {
  if (!start || !end) return { factor: 1, days: 365 };
  const d1 = new Date(start + "T00:00:00Z"), d2 = new Date(end + "T00:00:00Z");
  const days = Math.round((d2 - d1) / 864e5);
  if (days <= 0) return { factor: 0, days };
  const oneYear = new Date(d1); oneYear.setUTCFullYear(d1.getUTCFullYear() + 1);
  if (+oneYear === +d2) return { factor: 1, days };
  return { factor: days / 365, days };
}
function calculate(S, inp) {
  const si = inp.price + inp.acc;
  const ft = S.tiersByFunc[inp.func] || S.tiersByFunc.PRIBADI;
  const cover = ft[inp.cover] ? inp.cover : "comprehensive";
  const cat = catInfo(inp.cat).key;
  const baseRate = cat === "car" ? tierRate(ft[cover], si).rate : +(((S.flatByFunc[inp.func] || S.flatByFunc.PRIBADI)[cat] || {})[cover] || 0);
  const startYear = inp.start ? +inp.start.slice(0, 4) : new Date().getFullYear();
  const age = Math.max(0, startYear - (inp.year || startYear));
  const al = S.ageLoading;
  const loadPct = al.enabled && age > al.afterYears ? (age - al.afterYears) * al.pctPerYear : 0;
  const effRate = +(baseRate * (1 + loadPct / 100)).toFixed(4);
  const { factor, days } = period(inp.start, inp.end);
  const out = [];
  const add = (label, base, rate, group) =>
    out.push({ label, base, rate, group, prem: Math.round(base * rate / 100 * factor) });

  if (si > 0) {
    add(COVER_LABEL[cover], si, effRate, "casco");
    EXT_DEFS.forEach(e => { if (inp.ext[e.key]) add(e.label, si, +S.ext[e.key] || 0, "casco"); });
    cxChosen(inp).forEach(x => add(x.label, si, +x.rate || 0, "extra"));
  }
  if (inp.tjh > 0) add("Tanggung Jawab Hukum Pihak III", inp.tjh, +S.tjhRate, "liab");
  if (inp.paD > 0) add("Kecelakaan Diri (PA) Pengemudi", inp.paD, +S.paDriverRate, "liab");
  if (inp.paP > 0) {
    const seats = cat === "moto" ? 2 : inp.seats;   /* roda 2: maksimal 1 penumpang */
    const n = S.paPassPerSeat ? Math.max(1, (seats || 1) - 1) : 1;
    add("Kecelakaan Diri (PA) Penumpang" + (n > 1 ? ` (${n} orang)` : ""), inp.paP * n, +S.paPassRate, "liab");
  }
  const gross = out.reduce((a, l) => a + l.prem, 0);
  const cascoSum = out.filter(l => l.group === "casco").reduce((a, l) => a + l.prem, 0);
  const disc = Math.min(Math.max(+inp.disc || 0, 0), +S.maxDiscount || 0);
  const discAmt = Math.round(cascoSum * disc / 100);
  const net = gross - discAmt;
  const fees = out.length ? (+S.policyCost || 0) + (+S.stampDuty || 0) : 0;
  return { si, baseRate, effRate, loadPct, age, factor, days, lines: out, gross, disc, discAmt, net,
    policyCost: fees ? +S.policyCost : 0, stampDuty: fees ? +S.stampDuty : 0, total: net + fees };
}

/* ====================== KOMPONEN FORM BERSAMA ====================== */
const D = () => S.display;
function fillSelect(sel, opts, keep = true) {
  const prev = sel.value;
  sel.innerHTML = opts.map(o => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join("");
  if (keep && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}
function renderCoverSelect(sel, func = "PRIBADI") {
  const allowed = FUNC_COVERS[func] || ["comprehensive"];
  const opts = [{ v: "comprehensive", t: COVER_LABEL.comprehensive }];
  if (D().tlo && allowed.includes("tlo")) opts.push({ v: "tlo", t: COVER_LABEL.tlo });
  const prev = sel.value; fillSelect(sel, opts);
  return prev === "tlo" && sel.value !== "tlo";
}
function renderYearSelect(sel) {
  const y = new Date().getFullYear();
  const opts = []; for (let i = y + 1; i >= y - 25; i--) opts.push({ v: String(i), t: String(i) });
  fillSelect(sel, opts); if (!sel.dataset.init) { sel.value = String(y); sel.dataset.init = 1; }
}
function renderExt(container, idp, func = "PRIBADI") {
  const box = $(container);
  const prev = {}; box.querySelectorAll("input[type=checkbox]").forEach(i => prev[i.id.slice(idp.length)] = i.checked);
  const items = [...EXT_DEFS.filter(e => D().ext[e.key] !== false).map(e => ({ k: e.key, label: e.label, rate: S.ext[e.key] })),
    ...CX(func).map(x => ({ k: "c_" + x.id, label: x.label, rate: x.rate }))];
  box.innerHTML = items.map(e => `
    <label class="chk"><input type="checkbox" id="${idp}${esc(e.k)}" ${prev[e.k] ? "checked" : ""}>
      <span class="t">${esc(e.label)}</span><span class="r">${pct(e.rate)}</span></label>`).join("")
    || `<p class="hint">Tidak ada perluasan yang ditampilkan.</p>`;
}
function readExt(idp) {
  const box = idp === "ext_" ? $("#extList") : $("#qExtList"), out = {};
  EXT_DEFS.forEach(e => out[e.key] = false);
  box.querySelectorAll("input[type=checkbox]").forEach(i => { const k = i.id.slice(idp.length); if (EXT_DEFS.some(e => e.key === k) ? D().ext[k] !== false : true) out[k] = i.checked; });
  return out;
}
function setExtChecks(idp, ext) {
  const box = idp === "ext_" ? $("#extList") : $("#qExtList");
  box.querySelectorAll("input[type=checkbox]").forEach(i => i.checked = !!(ext || {})[i.id.slice(idp.length)]);
}
function renderLimitSelects(ids) {
  const mk = arr => [{ v: "0", t: "Tidak diambil" }, ...arr.map(n => ({ v: String(n), t: rp(n) }))];
  fillSelect($(ids.tjh), mk(S.tjhLimits)); fillSelect($(ids.paD), mk(S.paLimits)); fillSelect($(ids.paP), mk(S.paLimits));
}
const liabVal = (key, id) => D()[key] ? (+$(id).value || 0) : 0;
function moneyInput(el, after) {
  el.addEventListener("input", () => { const n = parseNum(el.value); el.value = n ? fmt(n) : ""; after && after(el); });
}
function renderResult(p, r) {
  const body = r.lines.map(l => `<tr><td>${esc(l.label)}<div class="hint basehint">${rp(l.base)}${r.factor !== 1 && r.factor > 0 ? ` · ${r.days} hari` : ""}</div></td><td class="num rateCol">${pct(l.rate)}</td><td class="num">${fmt(l.prem)}</td></tr>`).join("")
    || `<tr><td colspan="3" class="hint">Isi harga kendaraan untuk melihat premi.</td></tr>`;
  const cs = D().formula ? 2 : 1;
  const extra = [
    `<tr class="sub"><td colspan="${cs}">Total Premi</td><td class="num">${fmt(r.gross)}</td></tr>`,
    r.discAmt ? `<tr><td colspan="${cs}">Diskon ${pct(r.disc)} (kasko & perluasan)</td><td class="num">−${fmt(r.discAmt)}</td></tr>` : "",
    `<tr><td colspan="${cs}">Biaya Polis</td><td class="num">${fmt(r.policyCost)}</td></tr>`,
    `<tr><td colspan="${cs}">Bea Materai</td><td class="num">${fmt(r.stampDuty)}</td></tr>`,
    `<tr class="tot"><td colspan="${cs}">TOTAL</td><td class="num">${fmt(r.total)}</td></tr>`
  ].join("");
  $(`#${p}Body`).innerHTML = body + extra;
  $(`#${p}Tbl`).classList.toggle("noformula", !D().formula);
  $(`#${p}Total`).textContent = rp(r.total); $(`#${p}TotalM`).textContent = rp(r.total);
  const tags = [];
  if (r.si) { tags.push(`<span class="tag">Harga Pertanggungan ${rp(r.si)}</span>`); if (D().formula) tags.push(`<span class="tag">Rate dasar ${pct(r.baseRate)}</span>`); }
  if (r.loadPct) tags.push(`<span class="tag warn">Loading usia ${r.age} th: +${pct(r.loadPct)}</span>`);
  if (r.factor !== 1) tags.push(`<span class="tag warn">${r.factor ? `Pro-rata ${r.days} hari` : "Periode tidak valid"}</span>`);
  $(`#${p}Meta`).innerHTML = tags.join("");
}
function summaryText(inp, r, title) {
  const out = [`*${title}*`, S.company.brand, ""];
  if (inp.name) out.push(`Tertanggung: ${inp.name}`);
  const veh = `${inp.brand || ""} ${inp.model || ""}`.trim();
  if (veh || inp.year) out.push(`Kendaraan: ${veh || "-"} (${inp.year})${inp.plate ? " · " + inp.plate : ""}`);
  out.push(`Fungsi: ${funcLabel(inp.func)}`, ...(catInfo(inp.cat).key !== "car" ? [`Kategori: ${catInfo(inp.cat).short}`] : []), `Jaminan: ${COVER_LABEL[inp.cover]}`, `Harga Pertanggungan: ${rp(r.si)}`, "");
  r.lines.forEach(l => out.push(`• ${l.label}: ${rp(l.prem)}`));
  if (r.discAmt) out.push(`• Diskon ${pct(r.disc)}: -${rp(r.discAmt)}`);
  out.push(`Total Premi: ${rp(r.net)}`, `Biaya Polis + Materai: ${rp(r.policyCost + r.stampDuty)}`, `*Total Bayar: ${rp(r.total)}*`);
  const k = S.contact; if (k.name || k.wa) out.push("", `Hubungi: ${[k.name, k.wa && "WA " + k.wa].filter(Boolean).join(" · ")}`);
  return out.join("\n");
}

/* ====================== HITUNG CEPAT ====================== */
function readQuick() {
  return {
    func: $("#qFunc").value, cat: $("#qCat").value, cover: $("#qCover").value, price: parseNum($("#qPrice").value), acc: parseNum($("#qAcc").value),
    year: +$("#qYear").value, start: "", end: "", seats: +$("#qSeats").value || 0,
    ext: readExt("qext_"), tjh: liabVal("tjh", "#qTjh"), paD: liabVal("paD", "#qPaD"), paP: liabVal("paP", "#qPaP"),
    disc: +$("#qDisc").value || 0
  };
}
function recalcQuick() { const inp = readQuick(); const r = calculate(S, inp); lastQuick = { inp, r }; renderResult("q", r); saveDrafts(); }
function setQuick(q) {
  setSel($("#qFunc"), q.func || "PRIBADI"); setSel($("#qCat"), q.cat || "car"); renderCoverSelect($("#qCover"), $("#qFunc").value);
  setSel($("#qCover"), q.cover); setSel($("#qYear"), q.year);
  $("#qPrice").value = q.price ? fmt(q.price) : ""; $("#qAcc").value = q.acc ? fmt(q.acc) : "";
  $("#qSeats").value = q.seats || 7;
  renderExt("#qExtList", "qext_", $("#qFunc").value); setExtChecks("qext_", q.ext);
  setSel($("#qTjh"), q.tjh || 0); setSel($("#qPaD"), q.paD || 0); setSel($("#qPaP"), q.paP || 0);
  $("#qDisc").value = q.disc || 0; recalcQuick();
}

/* ====================== PENAWARAN ====================== */
function brands() { return [...new Set(VEH.map(v => v.brand))].sort((a, b) => a.localeCompare(b)); }
function renderBrands() {
  fillSelect($("#fBrand"), [{ v: "", t: "— Pilih merek —" }, ...brands().map(b => ({ v: b, t: b })), { v: "__manual", t: "Lainnya (ketik manual)" }]);
  renderModels(true);
}
function renderModels(keep = false) {
  const b = $("#fBrand").value;
  const list = VEH.map((v, i) => ({ ...v, i })).filter(v => v.brand === b)
    .sort((x, y) => x.type.localeCompare(y.type) || x.model.localeCompare(y.model));
  const opts = [{ v: "", t: b ? "— Pilih model —" : "— Pilih merek dulu —" }];
  list.forEach(v => opts.push({ v: String(v.i), t: `${v.model}  ·  ${v.type}` }));
  if (b) opts.push({ v: "__manual", t: "Lainnya (ketik manual)" });
  fillSelect($("#fModel"), opts, keep);
  if (b === "__manual") $("#fModel").value = "__manual";
  onModel(false);
}
function onModel(fromUser = true) {
  const m = $("#fModel").value, b = $("#fBrand").value;
  const manual = m === "__manual" || b === "__manual";
  $("#manualWrap").hidden = !manual;
  if (fromUser && !manual && m !== "") {
    const v = VEH[+m];
    if (v) {
      $("#fType").value = v.type; setSel($("#fCat"), catOfType(v.type));
      if (v.price > 0 && (!parseNum($("#fPrice").value) || $("#fPrice").dataset.auto === "1")) {
        $("#fPrice").value = fmt(v.price); $("#fPrice").dataset.auto = "1";
      }
    }
  }
  recalc();
}
function readInput() {
  const b = $("#fBrand").value, m = $("#fModel").value;
  const manual = m === "__manual" || b === "__manual";
  const v = !manual && m !== "" ? VEH[+m] : null;
  return {
    name: $("#fName").value.trim(), address: $("#fAddr").value.trim(), phone: $("#fPhone").value.trim(),
    func: $("#fFunc").value, cat: $("#fCat").value, cond: $("#fCond").value,
    brand: b === "__manual" ? "" : b, model: manual ? $("#fModelManual").value.trim() : (v ? v.model : ""),
    vtype: $("#fType").value.trim(), year: +$("#fYear").value,
    plate: $("#fPlate").value.trim().toUpperCase(), color: $("#fColor").value.trim().toUpperCase(),
    chassis: $("#fChassis").value.trim().toUpperCase(), engine: $("#fEngine").value.trim().toUpperCase(),
    seats: +$("#fSeats").value || 0,
    cover: $("#fCover").value, price: parseNum($("#fPrice").value), acc: parseNum($("#fAcc").value),
    accNote: $("#fAccNote").value.trim(), start: $("#fStart").value, end: $("#fEnd").value,
    ext: readExt("ext_"), tjh: liabVal("tjh", "#fTjh"), paD: liabVal("paD", "#fPaD"), paP: liabVal("paP", "#fPaP"),
    disc: +$("#fDisc").value || 0
  };
}
function setSel(sel, val) { const s = String(val ?? ""); if ([...sel.options].some(o => o.value === s)) sel.value = s; }
function setInput(inp) {
  const set = (id, v) => { $(id).value = v ?? ""; };
  set("#fName", inp.name); set("#fAddr", inp.address); set("#fPhone", inp.phone);
  setSel($("#fFunc"), inp.func); setSel($("#fCat"), inp.cat || catOfType(inp.vtype)); setSel($("#fCond"), inp.cond); renderCoverSelect($("#fCover"), $("#fFunc").value);
  const idx = VEH.findIndex(v => v.brand === inp.brand && v.model === inp.model);
  if (idx >= 0) { $("#fBrand").value = inp.brand; renderModels(); $("#fModel").value = String(idx); $("#fModelManual").value = ""; }
  else if (!inp.brand && !inp.model) { $("#fBrand").value = ""; renderModels(); $("#fModelManual").value = ""; }
  else {
    if (inp.brand && brands().includes(inp.brand)) { $("#fBrand").value = inp.brand; renderModels(); $("#fModel").value = "__manual"; }
    else { $("#fBrand").value = "__manual"; renderModels(); }
    $("#fModelManual").value = (inp.brand && !brands().includes(inp.brand) ? inp.brand + " " : "") + (inp.model || "");
  }
  $("#manualWrap").hidden = !($("#fModel").value === "__manual");
  set("#fType", inp.vtype); setSel($("#fYear"), inp.year);
  set("#fPlate", inp.plate); set("#fColor", inp.color); set("#fChassis", inp.chassis); set("#fEngine", inp.engine);
  set("#fSeats", inp.seats || 7); setSel($("#fCover"), inp.cover);
  $("#fPrice").value = inp.price ? fmt(inp.price) : ""; $("#fPrice").dataset.auto = "0";
  $("#fAcc").value = inp.acc ? fmt(inp.acc) : ""; set("#fAccNote", inp.accNote);
  if (inp.start) set("#fStart", inp.start); if (inp.end) set("#fEnd", inp.end);
  renderExt("#extList", "ext_", $("#fFunc").value); setExtChecks("ext_", inp.ext);
  setSel($("#fTjh"), inp.tjh || 0); setSel($("#fPaD"), inp.paD || 0); setSel($("#fPaP"), inp.paP || 0);
  $("#fDisc").value = inp.disc || 0;
  recalc();
}
function recalc() {
  const inp = readInput(); const r = calculate(S, inp); last = { inp, r };
  renderResult("r", r);
  $("#liabHint").textContent = `Premi TJH = limit × ${pct(S.tjhRate)}; PA Pengemudi = limit × ${pct(S.paDriverRate)}; PA Penumpang = limit × ${pct(S.paPassRate)}${S.paPassPerSeat ? " × jumlah penumpang" : ""}.`;
  $("#liabHint").hidden = !D().formula || !(D().tjh || D().paD || D().paP);
  saveDrafts();
}
/* Isian disimpan terus di perangkat, jadi refresh / buka ulang tidak menghilangkan pekerjaan */
function saveDrafts() {
  if (!draftsReady) return;
  if (last) LS.set("ai_draft_calc", { inp: last.inp, id: currentId, ref: currentRef });
  if (lastQuick) LS.set("ai_draft_quick", lastQuick.inp);
}
function restoreDrafts() {
  const c = LS.get("ai_draft_calc");
  if (c && c.inp) { setInput(c.inp); currentId = c.id || null; currentRef = c.ref || null; }
  const q = LS.get("ai_draft_quick"); if (q) setQuick(q);
  draftsReady = true; updateSaveState();
}
function updateSaveState() {
  const el = $("#saveState");
  el.hidden = !currentId; if (currentId) el.textContent = "Tersimpan · " + currentRef;
  saveDrafts();
}
function setDefaultDates() {
  const t = new Date(); const s = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()));
  const e = new Date(s); e.setUTCFullYear(s.getUTCFullYear() + 1);
  $("#fStart").value = s.toISOString().slice(0, 10); $("#fEnd").value = e.toISOString().slice(0, 10);
}
function resetForm() {
  $$("#tab-calc input").forEach(i => { if (i.type === "checkbox") i.checked = false; else if (!["fRegion", "fSeats", "fStart", "fEnd", "fDisc"].includes(i.id)) i.value = ""; });
  $("#fSeats").value = 7; $("#fDisc").value = 0; $("#fBrand").value = ""; renderModels();
  ["#fTjh", "#fPaD", "#fPaP"].forEach(id => $(id).value = "0");
  setDefaultDates(); currentId = null; currentRef = null; updateSaveState(); recalc();
}

/* ====================== TAMPILAN (dari pengaturan) ====================== */
function applySettingsToUI() {
  const keepC = last ? last.inp : null, keepQ = lastQuick ? lastQuick.inp : null;
  $("#hdrBrand").textContent = S.company.brand || "ALEX INSURANCE"; renderHdrLogo();
  $("#fRegion").value = S.region;
  const discOn = +S.maxDiscount > 0;
  $("#discWrap").hidden = !discOn; $("#qDiscWrap").hidden = !discOn;
  $$(".discMax").forEach(e => e.textContent = S.maxDiscount);
  $("#qSeatsWrap").hidden = !(S.paPassPerSeat && D().paP);
  [$("#fCat"), $("#qCat")].forEach(sel => { if (!sel.options.length) fillSelect(sel, CATS.map(c => ({ v: c.key, t: c.short }))); });
  renderCoverSelect($("#fCover"), $("#fFunc").value); renderCoverSelect($("#qCover"), $("#qFunc").value);
  renderExt("#extList", "ext_", $("#fFunc").value); renderExt("#qExtList", "qext_", $("#qFunc").value);
  renderLimitSelects({ tjh: "#fTjh", paD: "#fPaD", paP: "#fPaP" });
  renderLimitSelects({ tjh: "#qTjh", paD: "#qPaD", paP: "#qPaP" });
  $$("[data-liab]").forEach(el => el.hidden = !D()[el.dataset.liab]);
  $$("[data-liab]").forEach(el => el.closest(".row").hidden = !(D().tjh || D().paD || D().paP));
  renderBrands();
  if (keepC) setInput(keepC); else recalc();
  if (keepQ) setQuick(keepQ); else recalcQuick();
  applyTabs();
  if (!$("#tab-home").hidden) renderHome();
  renderPublicExtras();
}
/* Penawaran & Riwayat hanya setelah login. Selama status login belum diketahui (mis. offline),
   dipakai tanda login terakhir di perangkat ini. */
const isAuthed = () => authResolved ? !!user : !!LS.get("ai_authed");
const TABS = ["home", "quick", "calc", "hist", "admin"];
function tabAllowed(t) {
  const a = isAuthed();
  return t === "admin" || (t === "quick" && (a || D().quick)) || (t === "home" && !a && !D().quick)
    || (t === "calc" && a) || (t === "hist" && a && D().history);
}
function applyTabs() {
  TABS.forEach(t => $(`.tab[data-tab="${t}"]`).hidden = !tabAllowed(t));
  $("#adminTabLbl").textContent = isAuthed() ? "Admin" : "Masuk";
  $("#qToFull").closest(".btns").hidden = !isAuthed();
  renderPublicExtras();
  showTab(wantedTab || "quick", true);
}
function showTab(name, auto = false) {
  if (!auto) { wantedTab = name; LS.set("ai_tab", name); }
  if (!tabAllowed(name)) name = tabAllowed("quick") ? "quick" : "home";
  const changed = $(".tab.active")?.dataset.tab !== name;
  $$(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === name));
  TABS.forEach(t => $("#tab-" + t).hidden = t !== name);
  if (name === "hist" && changed) loadHistory();
  if (name === "home" && (changed || !$("#homeBox").innerHTML)) renderHome();
  renderAdminGate();
  if (changed && !auto) window.scrollTo(0, 0);
}

/* ====================== BERANDA, HUBUNGI SAYA & TANYA ADMIN ====================== */
let HERO_IMG = LS.get("ai_hero") || "", heroDirty = false;
let LOGO_IMG = LS.get("ai_logo") || "", logoDirty = false, WHEEL_HTML = null;
function renderHdrLogo() {
  const el = $("#hdrLogo"); if (WHEEL_HTML === null) WHEEL_HTML = el.innerHTML;
  el.innerHTML = LOGO_IMG ? `<img src="${LOGO_IMG}" alt="">` : WHEEL_HTML;
}
const IC = {
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  car: '<path d="M5 17h14M6 17v2M18 17v2"/><path d="M3 13l2-5a2 2 0 0 1 2-1h10a2 2 0 0 1 2 1l2 5v4H3z"/><circle cx="7.5" cy="14" r="1"/><circle cx="16.5" cy="14" r="1"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
  wave: '<path d="M3 12c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/><path d="M3 17c2-3 4-3 6 0s4 3 6 0 4-3 6 0"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  tool: '<path d="M14 7a4 4 0 0 0 5 5l-8 8-3-3 8-8a4 4 0 0 0-2-2z"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14.5A5 5 0 0 1 21 19"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'
};
const ico = k => `<div class="ic"><svg viewBox="0 0 24 24">${IC[k]}</svg></div>`;
const contactWa = () => normPhone(S.contact.wa || S.company.phone);
const waLink = (txt = "Halo, saya ingin konsultasi asuransi kendaraan.") => contactWa() ? `https://wa.me/${contactWa()}?text=${encodeURIComponent(txt)}` : "";
const initials = n => String(n || "").trim().split(/\s+/).slice(0, 2).map(w => w[0] || "").join("").toUpperCase() || "VP";
function contactCardHTML(inHero = false) {
  const k = S.contact, name = k.name || S.company.brand, wa = k.wa || S.company.phone;
  if (!k.name && !wa) return "";
  const body = `<div class="ct"><div class="av">${esc(initials(name))}</div><div><b>${esc(name)}</b>${wa ? `<div class="hint" style="font-size:13.5px">WhatsApp ${esc(wa)}</div>` : ""}</div></div>
    ${waLink() ? `<div class="btns"><a class="btn wa" href="${waLink()}" target="_blank" rel="noopener">Chat WhatsApp</a></div>` : ""}`;
  return inHero ? `<div class="hcard"><h3>Hubungi Saya</h3><p class="hint" style="margin:0 0 6px;font-size:13.5px">Konsultasi gratis seputar perlindungan kendaraan Anda.</p>${body}</div>`
    : `<div class="card"><h2>Hubungi Saya</h2>${body}</div>`;
}
function askCardHTML(id) {
  return `<div class="card" id="${id}"><h2>Tanya Admin</h2>
    <p class="hint" style="margin:-6px 0 12px;font-size:14px">Tinggalkan pertanyaan Anda. Kami akan membalas melalui WhatsApp ke nomor yang Anda isi.</p>
    <form data-ask novalidate>
      <div class="row">
        <div class="f"><label>Nama *</label><input name="name" maxlength="80" autocomplete="name"></div>
        <div class="f"><label>No. HP / WhatsApp *</label><input name="phone" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="08xxxxxxxxxx"></div>
        <div class="f full"><label>Pertanyaan *</label><textarea name="message" maxlength="1000" placeholder="Tulis pertanyaan Anda…"></textarea></div>
      </div>
      <input name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
      <div class="btns"><button class="btn pri" type="submit">Kirim Pertanyaan</button></div>
      <p class="note ask-ok" hidden style="margin-top:12px"></p>
    </form></div>`;
}
function renderPublicExtras() {
  const box = $("#qExtra");
  const html = isAuthed() ? "" : `<div class="grid2">${askCardHTML("qAsk")}${contactCardHTML() || "<div></div>"}</div>`;
  if (box.dataset.sig !== html) { box.innerHTML = html; box.dataset.sig = html; }
  const k = S.contact, wa = k.wa || S.company.phone, name = k.name || "";
  $("#ftContact").innerHTML = (name || wa) ? `Hubungi: ${esc(name)}${name && wa ? " · " : ""}${wa ? (waLink() ? `<a href="${waLink()}" target="_blank" rel="noopener">WA ${esc(wa)}</a>` : "WA " + esc(wa)) : ""}` : "";
}
function renderHome() {
  const c = S.company, h = S.hero, photo = h.style === "photo" && HERO_IMG;
  const ext = {
    flood: ["drop", "Banjir & Angin Topan", "Kerusakan akibat banjir, angin topan, badai, hujan es, dan tanah longsor."],
    eq: ["wave", "Gempa Bumi & Tsunami", "Kerusakan akibat gempa bumi, tsunami, dan letusan gunung berapi."],
    srcc: ["alert", "Huru-hara & Kerusuhan", "Kerusakan akibat huru-hara, pemogokan, dan kerusuhan."],
    ts: ["alert", "Terorisme & Sabotase", "Kerusakan akibat tindakan terorisme dan sabotase."],
    workshop: ["tool", "Bengkel Resmi", "Perbaikan kendaraan di bengkel resmi sesuai merek kendaraan."]
  };
  const extCards = EXT_DEFS.filter(e => D().ext[e.key] !== false).map(e => ext[e.key]);
  CX().forEach(x => extCards.push(["shield", x.label, x.desc || ""]));
  if (D().tjh) extCards.push(["users", "Tanggung Jawab Pihak Ketiga", "Ganti rugi kepada orang lain yang dirugikan akibat kendaraan Anda."]);
  if (D().paD || D().paP) extCards.push(["heart", "Kecelakaan Diri", "Santunan bagi pengemudi dan penumpang yang cedera atau meninggal akibat kecelakaan."]);
  const card = ([i, t, d]) => `<div class="feat">${ico(i)}<b>${esc(t)}</b><p>${esc(d)}</p></div>`;
  const heroSide = contactCardHTML(true) || `<div class="hcard"><h3>Konsultasi Gratis</h3><p class="hint" style="margin:0;font-size:13.5px">Ajukan pertanyaan seputar perlindungan kendaraan Anda, kami bantu jelaskan.</p><div class="btns"><button class="btn pri" data-scroll="#homeAsk">Tanya Admin</button></div></div>`;
  $("#homeBox").innerHTML = `
  <section class="hero2${photo ? " photo" : ""}"${photo ? ` style="--hero:url('${HERO_IMG}')"` : ""}>
    <div>
      <span class="eyebrow">Vehicle Protection</span>
      <h1>${esc(h.title)}</h1>
      <p class="lead">${esc(h.subtitle)}</p>
      <div class="btns">
        ${waLink() ? `<a class="btn acc" href="${waLink()}" target="_blank" rel="noopener">Hubungi via WhatsApp</a>` : ""}
        <button class="btn ghost" data-scroll="#homeAsk">Tanya Admin</button>
      </div>
      <ul class="trust"><li>Tarif mengacu ketentuan OJK</li><li>Rincian premi transparan</li><li>Dibantu hingga polis terbit</li></ul>
    </div>
    ${heroSide}
  </section>

  <h2 class="sec-t">Pilihan Perlindungan</h2>
  <div class="cards">
    ${card(["shield", "Comprehensive (All Risk)", "Menjamin kerusakan sebagian maupun total akibat tabrakan, benturan, terbalik, tergelincir, perbuatan jahat orang lain, dan pencurian."])}
    ${D().tlo ? card(["car", "Total Loss Only (TLO)", "Menjamin kerugian total, yaitu bila biaya perbaikan mencapai 75% atau lebih dari harga kendaraan, atau kendaraan hilang dicuri."]) : ""}
  </div>

  ${extCards.length ? `<h2 class="sec-t">Perluasan Jaminan</h2><div class="cards">${extCards.map(card).join("")}</div>` : ""}

  <h2 class="sec-t">Cara Mengajukan</h2>
  <div class="steps">
    <div class="feat"><b>Konsultasi</b><p>Sampaikan jenis kendaraan, fungsi kendaraan, dan perlindungan yang diinginkan.</p></div>
    <div class="feat"><b>Kirim Dokumen</b><p>STNK yang masih berlaku, KTP tertanggung, dan foto kendaraan dari keempat sisi.</p></div>
    <div class="feat"><b>Survei Kendaraan</b><p>Kondisi kendaraan diperiksa sebelum pertanggungan dimulai.</p></div>
    <div class="feat"><b>Terima Penawaran</b><p>Anda menerima rincian premi, lalu polis diterbitkan setelah persetujuan dan pembayaran.</p></div>
  </div>

  <h2 class="sec-t" id="homeAskT">Ada Pertanyaan?</h2>
  <div class="grid2">${askCardHTML("homeAsk")}${contactCardHTML() || "<div></div>"}</div>

  <h2 class="sec-t">Pertanyaan Umum</h2>
  <details><summary>Apa beda Comprehensive dan TLO?</summary><p>Comprehensive menjamin kerusakan kecil hingga total, sedangkan TLO hanya menjamin bila kerugian mencapai 75% atau lebih dari harga kendaraan atau kendaraan hilang. Premi TLO lebih rendah.</p></details>
  <details><summary>Apakah premi kendaraan pribadi, dinas, dan komersial berbeda?</summary><p>Ya. Kendaraan komersial memiliki risiko pemakaian yang lebih tinggi sehingga rate dan ketentuannya berbeda, dan hanya tersedia jaminan Comprehensive.</p></details>
  <details><summary>Bagaimana premi dihitung?</summary><p>Premi dihitung dari harga pertanggungan kendaraan dikalikan rate sesuai ketentuan OJK untuk ${esc(S.region)}, ditambah perluasan yang dipilih, biaya polis, dan materai.</p></details>
  <details><summary>Apa itu risiko sendiri (deductible)?</summary><p>Bagian kerugian yang ditanggung sendiri oleh tertanggung setiap kali klaim. Besarnya tercantum di penawaran dan polis.</p></details>
  <details><summary>Berapa lama penawaran berlaku?</summary><p>Penawaran berlaku ${esc(S.validityDays)} hari sejak tanggal penawaran dibuat.</p></details>
  ${(c.name || c.address) ? `<p class="hint" style="text-align:center;margin-top:18px">${[c.name, c.address].filter(Boolean).map(esc).join(" · ")}</p>` : ""}`;
}
async function sendQuestion(f) {
  const v = n => f.elements[n].value.trim();
  const name = v("name"), phone = v("phone").replace(/[^\d+]/g, ""), message = v("message");
  if (f.elements.website.value) { f.reset(); return; }
  if (!name) return toast("Nama belum diisi.", "err");
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return toast("Nomor HP / WhatsApp tidak valid.", "err");
  if (message.length < 5) return toast("Pertanyaan terlalu singkat.", "err");
  if (Date.now() - (+LS.get("ai_ask_last") || 0) < 60000) return toast("Tunggu sebentar sebelum mengirim pertanyaan lagi.", "err");
  if (!fb || !navigator.onLine) return toast("Tidak dapat mengirim. Periksa koneksi internet.", "err");
  const btn = f.querySelector("button[type=submit]"); btnLoad(btn, true, "Mengirim…");
  try {
    await fb.F.addDoc(fb.F.collection(fb.db, "inbox"), { name: name.slice(0, 80), phone: phone.slice(0, 20), message: message.slice(0, 1000), status: "baru", createdAt: fb.F.serverTimestamp() });
    LS.set("ai_ask_last", Date.now()); f.reset();
    const ok = f.querySelector(".ask-ok"); ok.hidden = false;
    ok.textContent = `Terima kasih, ${name}. Pertanyaan Anda sudah kami terima dan akan dibalas melalui WhatsApp ke ${phone}.`;
    toast("Pertanyaan terkirim.", "ok");
  } catch { toast("Pertanyaan gagal dikirim. Coba lagi.", "err"); }
  finally { btnLoad(btn, false); }
}

/* ====================== INBOX ADMIN ====================== */
let INBOX = [], inboxUnsub = null, inboxFirst = true;
function startInbox() {
  stopInbox(); if (!fb || !user) return;
  const { collection, query, orderBy, limit, onSnapshot } = fb.F; inboxFirst = true; $("#inboxList").innerHTML = SKEL(2);
  inboxUnsub = onSnapshot(query(collection(fb.db, "inbox"), orderBy("createdAt", "desc"), limit(100)), snap => {
    const before = new Set(INBOX.map(x => x.id));
    INBOX = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!inboxFirst) { const fresh = INBOX.filter(x => !before.has(x.id) && x.status !== "dibalas"); if (fresh.length) toast(`Pertanyaan baru dari ${fresh[0].name}`, "ok", 5000); }
    inboxFirst = false; renderInbox();
  }, () => {});
}
function stopInbox() { if (inboxUnsub) { inboxUnsub(); inboxUnsub = null; } INBOX = []; renderInbox(); }
function waReply(x) {
  const t = `Halo ${x.name}, terima kasih sudah bertanya kepada ${S.contact.name || S.company.brand}.\n\nPertanyaan Anda:\n"${x.message}"\n\n`;
  return `https://wa.me/${normPhone(x.phone)}?text=${encodeURIComponent(t)}`;
}
function renderInbox() {
  const n = INBOX.filter(x => x.status !== "dibalas").length;
  [$("#navBadge"), $("#inboxBadge")].forEach(el => { el.hidden = !n; el.textContent = n > 99 ? "99+" : n; });
  $("#inboxCount").textContent = `${n} belum dibalas`;
  const f = $("#inboxFilter").value, q = $("#inboxSearch").value.trim().toLowerCase();
  const rows = INBOX.filter(x => (f === "all" || (f === "baru" ? x.status !== "dibalas" : x.status === "dibalas"))
    && (!q || `${x.name} ${x.phone} ${x.message}`.toLowerCase().includes(q)));
  $("#inboxList").innerHTML = rows.map(x => {
    const t = x.createdAt && x.createdAt.toDate ? x.createdAt.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "baru saja";
    const done = x.status === "dibalas";
    return `<div class="msg${done ? " done" : ""}"><div class="msg-h"><div><b>${esc(x.name)}</b><div class="hint" style="font-size:13px">${esc(x.phone)} · ${esc(t)}</div></div>
      <span class="tag ${done ? "ok" : "warn"}">${done ? "Sudah dibalas" : "Belum dibalas"}</span></div>
      <p>${esc(x.message)}</p>
      <div class="hact"><a class="btn sm wa" href="${waReply(x)}" target="_blank" rel="noopener" data-reply="${esc(x.id)}">Balas via WA</a>
      <button class="btn sm" data-mark="${esc(x.id)}">${done ? "Tandai belum dibalas" : "Tandai sudah dibalas"}</button>
      <button class="btn sm danger" data-idel="${esc(x.id)}">Hapus</button></div></div>`;
  }).join("") || `<div class="empty">${INBOX.length ? "Tidak ada pesan pada filter ini." : "Belum ada pertanyaan masuk."}</div>`;
}
async function setInboxStatus(id, status) {
  try { await fb.F.updateDoc(fb.F.doc(fb.db, "inbox", id), { status }); } catch { toast("Gagal memperbarui. Coba lagi.", "err"); }
}
function compressImage(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1600 / img.width), cv = document.createElement("canvas");
      cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      let q = 0.82, out = cv.toDataURL("image/jpeg", q);
      while (out.length > 700000 && q > 0.4) { q -= 0.08; out = cv.toDataURL("image/jpeg", q); }
      out.length > 900000 ? rej(new Error("Foto terlalu besar.")) : res(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("File bukan gambar yang valid.")); };
    img.src = url;
  });
}

/* ====================== RIWAYAT ====================== */
const HKEY = "ai_history", HSYNC = "ai_hist_sync", HMAX = 1500;
const tsOf = r => r.updatedAt || r.savedAt || "";
const localAll = () => LS.get(HKEY) || [];                 /* termasuk tanda hapus (tombstone) */
const localHist = () => localAll().filter(r => !r.deleted);
function setLocalAll(arr) {
  /* Simpan maksimal HMAX data. Polis Deal yang masih/baru berakhir selalu dipertahankan untuk pengingat perpanjangan. */
  const now = Date.now(), keep = [], rest = [];
  arr.forEach(r => {
    if (r.deleted) { if (now - new Date(tsOf(r)).getTime() < 90 * 864e5) keep.push(r); return; }
    if (r._dirty || (r.status === "deal" && r.inp && r.inp.end && new Date(r.inp.end).getTime() > now - 45 * 864e5)) keep.push(r); else rest.push(r);
  });
  rest.sort((x, y) => tsOf(y).localeCompare(tsOf(x)));
  LS.set(HKEY, [...keep, ...rest.slice(0, Math.max(0, HMAX - keep.length))]);
}
function putLocal(rec) { const arr = localAll().filter(x => x.id !== rec.id); arr.unshift(rec); setLocalAll(arr); }
/* Kirim satu data ke cloud. Gagal/offline → tetap ditandai _dirty dan dikirim ulang saat sinkron berikutnya. */
function pushCloud(rec) {
  if (!fb || !user) return Promise.resolve(false);
  const { _dirty, ...data } = rec;
  return fb.F.setDoc(fb.F.doc(fb.db, "quotes", rec.id), { ...data, srvAt: fb.F.serverTimestamp() })
    .then(() => { const cur = localAll().find(x => x.id === rec.id); if (cur && cur._dirty && tsOf(cur) === tsOf(rec)) { delete cur._dirty; putLocal(cur); } updateSyncLabel(); return true; })
    .catch(() => false);
}
function writeRecord(rec) { rec._dirty = true; putLocal(rec); pushCloud(rec); return rec; }
let histSync = null;
async function syncHistory(force = false) {
  if (!fb || !user) return;
  const st = LS.get(HSYNC) || {};
  if (!force && st.uid === user.uid && Date.now() - (st.last || 0) < 60000) return;
  if (histSync) return histSync;
  histSync = (async () => {
    busy(1); if (!$("#tab-hist").hidden && !localHist().length) $("#hList").innerHTML = SKEL(3);
    try {
      /* 1) kirim data yang belum tersinkron */
      await Promise.all(localAll().filter(r => r._dirty).map(pushCloud));
      /* 2) ambil hanya data yang berubah sejak sinkron terakhir (hemat kuota baca) */
      const { collection, query, where, getDocs, Timestamp } = fb.F;
      const incr = st.uid === user.uid && st.at;
      const snap = await getDocs(incr ? query(collection(fb.db, "quotes"), where("srvAt", ">", Timestamp.fromMillis(st.at))) : collection(fb.db, "quotes"));
      let maxAt = incr ? st.at : 0;
      const map = new Map(localAll().map(r => [r.id, r]));
      snap.docs.forEach(d => {
        const c = { ...d.data(), id: d.data().id || d.id };
        const at = c.srvAt && c.srvAt.toMillis ? c.srvAt.toMillis() : 0; if (at > maxAt) maxAt = at; delete c.srvAt;
        const l = map.get(c.id);
        if (!l || tsOf(l) <= tsOf(c)) map.set(c.id, c);
      });
      setLocalAll([...map.values()]);
      LS.set(HSYNC, { uid: user.uid, at: maxAt, last: Date.now() });
    } catch {} finally { busy(-1); }
  })().finally(() => { histSync = null; if (!$("#tab-hist").hidden) renderHist(); else renderRenew(); });
  return histSync;
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function quoteRef() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${S.company.prefix || "QS"}/${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}/${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function ensureId() { if (!currentId) { currentId = newId(); currentRef = quoteRef(); } }
function saveRecord(silent = false) {
  ensureId();
  const old = histItems().find(x => x.id === currentId) || {};
  const now = new Date().toISOString();
  const rec = { ...old, id: currentId, ref: currentRef, savedAt: old.savedAt || now, updatedAt: now, inp: clone(last.inp),
    total: last.r.total, gross: last.r.gross, si: last.r.si, by: user?.email || old.by || "", status: old.status || "baru" };
  writeRecord(rec);
  updateSaveState();
  if (!silent) toast("Perhitungan tersimpan ke riwayat.", "ok");
  if (!$("#tab-hist").hidden) renderHist();
  return rec;
}
function loadHistory() { renderHist(); syncHistory(); }
function updateSyncLabel() {
  const pend = localAll().filter(r => r._dirty).length;
  $("#hSrc").textContent = user ? (pend ? `${pend} data menunggu sinkron` : "Tersimpan di perangkat ini dan tersinkron") : "Tersimpan di perangkat ini";
}
function histItems() {
  return localHist().sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
}
function renderHist() {
  const q = $("#hFilter").value.trim().toLowerCase();
  const all = histItems();
  const fs = $("#hStatus").value;
  const rows = all.filter(r => (!q || `${r.inp.name} ${r.inp.plate} ${r.ref} ${r.inp.brand} ${r.inp.model}`.toLowerCase().includes(q))
    && (!fs || (fs === "exp" ? isExpired(r) : (r.status || "baru") === fs)));
  renderRenew();
  $("#hCount").textContent = `${all.length} data`;
  updateSyncLabel();
  $("#hList").innerHTML = rows.map(r => {
    const d = new Date(r.savedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const veh = `${r.inp.brand || ""} ${r.inp.model || ""}`.trim();
    return `<div class="hitem"><div class="hmain"><b>${esc(r.inp.name || "-")}</b>
      <div class="hint">${esc(veh || "-")} (${esc(r.inp.year)})${r.inp.plate ? " · " + esc(r.inp.plate) : ""}</div>
      <div class="hint">${esc(r.ref)} · ${esc(d)}</div>
      <div class="hstat">${isExpired(r) ? `<span class="st st-exp">Kedaluwarsa</span>` : ""}<select class="stsel st-${esc(r.status || "baru")}" data-hst="${esc(r.id)}" aria-label="Ubah status">${ST_OPTS.map(o => `<option value="${o.v}" ${(r.status || "baru") === o.v ? "selected" : ""}>${o.t}</option>`).join("")}</select></div></div>
      <div class="hright"><b>${rp(r.total)}</b><div class="hact">
        <button class="btn sm" data-hopen="${esc(r.id)}">Buka</button>
        <button class="btn sm" data-hpdf="${esc(r.id)}">PDF</button>
        <button class="btn sm danger" data-hdel="${esc(r.id)}">Hapus</button></div></div></div>`;
  }).join("") || `<div class="empty">${all.length ? "Tidak ditemukan." : "Belum ada perhitungan tersimpan.<br>Simpan dari menu Penawaran."}</div>`;
}
/* ---- Status penawaran ---- */
const ST_OPTS = [{ v: "baru", t: "Baru" }, { v: "dikirim", t: "Dikirim" }, { v: "deal", t: "Deal" }, { v: "batal", t: "Batal" }];
const isExpired = r => ["baru", "dikirim"].includes(r.status || "baru") && (Date.now() - new Date(r.savedAt).getTime()) / 864e5 > (+S.validityDays || 14);
function stChip(r) {
  if (isExpired(r)) return `<span class="st st-exp">Kedaluwarsa</span>`;
  const s = r.status || "baru"; return `<span class="st st-${s}">${(ST_OPTS.find(o => o.v === s) || ST_OPTS[0]).t}</span>`;
}
function updateRecord(id, patch) {
  const r = histItems().find(x => x.id === id); if (!r) return null;
  const rec = { ...r, ...patch, updatedAt: new Date().toISOString() };
  return writeRecord(rec);
}
/* ---- Pengingat perpanjangan: polis Deal yang akan/baru berakhir ---- */
const daysTo = s => Math.round((new Date(s + "T00:00:00") - new Date(new Date().toDateString())) / 864e5);
function renewItems() {
  const win = +S.renewDays || 60;
  return histItems().filter(r => r.status === "deal" && !r.renewed && r.inp && r.inp.end)
    .map(r => ({ r, d: daysTo(r.inp.end) })).filter(x => x.d <= win && x.d >= -30).sort((a, b) => a.d - b.d);
}
function renewWaLink(r) {
  const k = S.contact, veh = `${r.inp.brand || ""} ${r.inp.model || ""}`.trim();
  const t = `Halo ${r.inp.name}, kami mengingatkan bahwa polis asuransi kendaraan ${veh}${r.inp.plate ? " (" + r.inp.plate + ")" : ""} akan berakhir pada ${dLong(r.inp.end)}.\n\nApakah ingin kami siapkan penawaran perpanjangan?${k.name ? "\n\nSalam,\n" + k.name : ""}`;
  return `https://wa.me/${normPhone(r.inp.phone)}?text=${encodeURIComponent(t)}`;
}
function renderRenew() {
  const items = renewItems();
  const urgent = items.filter(x => x.d <= 30).length;
  const b = $("#histBadge"); b.hidden = !urgent; b.textContent = urgent;
  $("#renewCard").hidden = !items.length;
  $("#renewCount").textContent = `${items.length} polis`;
  $("#renewList").innerHTML = items.map(({ r, d }) => {
    const veh = `${r.inp.brand || ""} ${r.inp.model || ""}`.trim();
    const due = d < 0 ? `Lewat ${-d} hari` : d === 0 ? "Berakhir hari ini" : `${d} hari lagi`;
    return `<div class="rn"><div class="hmain"><b>${esc(r.inp.name || "-")}</b>
      <div class="hint">${esc(veh)}${r.inp.plate ? " · " + esc(r.inp.plate) : ""}</div>
      <div class="due ${d <= 7 ? "late" : d <= 30 ? "soon" : ""}">${due} · ${esc(dLong(r.inp.end))}</div>
      ${r.remindedAt ? `<div class="hint">Diingatkan ${esc(new Date(r.remindedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short" }))}</div>` : ""}</div>
      <div class="hright"><div class="hact" style="flex-direction:column;align-items:stretch">
        ${r.inp.phone ? `<a class="btn sm wa" href="${renewWaLink(r)}" target="_blank" rel="noopener" data-remind="${esc(r.id)}">Ingatkan via WA</a>` : `<span class="hint">Tanpa nomor WA</span>`}
        <button class="btn sm" data-renew="${esc(r.id)}">Buat perpanjangan</button>
        <button class="btn sm" data-renewdone="${esc(r.id)}">Sudah selesai</button></div></div></div>`;
  }).join("");
}
function startRenewal(id) {
  const r = histItems().find(x => x.id === id); if (!r) return;
  const inp = clone(r.inp), s = r.inp.end, d = new Date(s + "T00:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() + 1);
  inp.start = s; inp.end = d.toISOString().slice(0, 10);
  updateRecord(id, { renewed: true });
  showTab("calc"); setInput(inp); currentId = null; currentRef = null; updateSaveState();
  toast("Penawaran perpanjangan dibuat. Periksa harga kendaraan lalu simpan.");
}
function openRecord(id) {
  const r = histItems().find(x => x.id === id); if (!r) return null;
  showTab("calc"); setInput(r.inp); currentId = r.id; currentRef = r.ref; updateSaveState(); return r;
}
async function deleteRecord(id) {
  const r = histItems().find(x => x.id === id); if (!r || !confirm(`Hapus perhitungan ${r.inp.name || r.ref}?`)) return;
  /* hapus lunak: tanda hapus ikut tersinkron ke perangkat lain, isi data tidak disimpan lagi */
  writeRecord({ id, deleted: true, savedAt: r.savedAt, updatedAt: new Date().toISOString() });
  if (currentId === id) { currentId = null; currentRef = null; updateSaveState(); }
  renderHist(); toast("Dihapus.");
}

/* ====================== PDF ====================== */
const dLong = s => s ? new Date(s + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }) : "-";
const dShort = s => s ? new Date(s + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" }) : "-";
function validate(inp) {
  if (!inp.name) return "Nama tertanggung belum diisi.";
  if (!inp.price) return "Harga kendaraan belum diisi.";
  if (!inp.brand && !inp.model) return "Pilih merek dan model kendaraan.";
  if (!inp.start || !inp.end) return "Isi periode pertanggungan.";
  if (period(inp.start, inp.end).factor <= 0) return "Tanggal akhir harus setelah tanggal mulai.";
  return null;
}
const PDF_LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"];
let pdfLibP = null;
function loadPdfLibs() {
  if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) return Promise.resolve();
  if (!pdfLibP) pdfLibP = PDF_LIBS.reduce((p, src) => p.then(() => new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  })), Promise.resolve()).catch(e => { pdfLibP = null; throw e; });
  return pdfLibP;
}
const pdfReady = () => !!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable);
function buildPdf(ref) {
  if (!pdfReady()) throw new Error("Penyiapan PDF belum selesai. Periksa koneksi internet lalu coba lagi.");
  const { inp, r } = last;
  const { jsPDF } = window.jspdf; const d = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 14, NAVY = [31, 60, 136], AMBER = [242, 169, 59];
  const c = S.company, showF = D().pdfFormula;

  /* Kop model B: kop putih berisi logo & nama, lalu pita biru tipis */
  const K = S.contact, GRAY = [107, 114, 128];
  let LX = M + 23;
  if (LOGO_IMG) {
    try {   /* logo lebar boleh sampai 38 mm, logo persegi sampai 19 mm tinggi */
      const p = d.getImageProperties(LOGO_IMG), k = Math.min(38 / p.width, 19 / p.height), w = p.width * k, hh = p.height * k;
      d.addImage(LOGO_IMG, p.fileType || "PNG", M, 5 + (19 - hh) / 2, w, hh);
      LX = M + Math.max(w, 17) + 5;
    } catch {}
  } else {
    d.setFillColor(...AMBER); d.roundedRect(M + 1, 6, 17, 17, 2.5, 2.5, "F");
    d.setTextColor(...NAVY); d.setFont("helvetica", "bold"); d.setFontSize(11);
    d.text((c.logo || "VP").slice(0, 3), M + 9.5, 16.2, { align: "center" });
  }
  d.setTextColor(...NAVY); d.setFont("helvetica", "bold"); d.setFontSize(15); d.text(c.brand || "", LX, 12.5);
  d.setTextColor(...GRAY); d.setFont("helvetica", "normal"); d.setFontSize(9); if (c.name) d.text(c.name, LX, 17.6);
  d.setFontSize(7.8);
  const info = [c.address, c.phone && "Telp/WA " + c.phone, c.email].filter(Boolean).join("  ·  ");
  if (info) d.text(d.splitTextToSize(info, W - M - LX)[0], LX, 22);
  d.setFillColor(...NAVY); d.rect(0, 27, W, 7.5, "F");
  d.setFillColor(...AMBER); d.rect(0, 34.5, W, 0.9, "F");
  d.setTextColor(255); d.setFont("helvetica", "bold"); d.setFontSize(8.3);
  d.text("PENAWARAN ASURANSI KENDARAAN BERMOTOR", M, 31.9);
  if (K.name || K.wa) { d.setFont("helvetica", "normal"); d.text(`Hubungi: ${[K.name, K.wa && "WA " + K.wa].filter(Boolean).join(" · ")}`, W - M, 31.9, { align: "right" }); }

  d.setTextColor(20); d.setFont("helvetica", "bold"); d.setFontSize(13);
  d.text("QUOTATION SLIP", W / 2, 43, { align: "center" });

  const kv = (rows, startY) => d.autoTable({
    startY, body: rows, theme: "plain", margin: { left: M, right: M },
    styles: { fontSize: 8.6, cellPadding: { top: 0.9, bottom: 0.9, left: 1, right: 1 }, textColor: 25, valign: "top" },
    columnStyles: { 0: { cellWidth: 46, fontStyle: "bold" }, 1: { cellWidth: 7 }, 2: {} }
  });
  const row = (k, v) => [k, ":", v || "-"];
  const next = (g = 3) => d.lastAutoTable.finalY + g;
  const section = (title, y) => {
    if (y > 268) { d.addPage(); y = 18; }
    d.setFillColor(238, 242, 250); d.rect(M, y, W - 2 * M, 6, "F");
    d.setFont("helvetica", "bold"); d.setFontSize(9); d.setTextColor(...NAVY); d.text(title, M + 2, y + 4.2); d.setTextColor(25);
    return y + 7.5;
  };

  kv([
    row("NO. REFERENSI", ref),
    row("JENIS", "PSAKBI - KENDARAAN " + (inp.vtype ? inp.vtype.toUpperCase() : "PENUMPANG")),
    row("TERTANGGUNG", inp.name.toUpperCase()),
    row("ALAMAT", inp.address.toUpperCase()),
    row("PERIODE", `${dLong(inp.start)} s.d ${dLong(inp.end)}${r.factor !== 1 ? ` (${r.days} hari)` : ""}\n(pukul 12.00 siang waktu setempat)`)
  ], 47);

  let y = section("DATA KENDARAAN", next(2));
  kv([
    row("MEREK / MODEL", `${inp.brand} ${inp.model}`.trim().toUpperCase()),
    row("JENIS", inp.vtype.toUpperCase()),
    row("TAHUN PEMBUATAN", String(inp.year)),
    row("NO. POLISI", inp.plate), row("NO. RANGKA", inp.chassis), row("NO. MESIN", inp.engine),
    row("WARNA", inp.color), row("JUMLAH KURSI", inp.seats ? String(inp.seats) : "-"),
    row("FUNGSI", `${inp.func} - ${inp.cond}`),
    row("KATEGORI TARIF", `${catInfo(inp.cat).label} (${catInfo(inp.cat).ojk})`),
    row("PERLENGKAPAN TAMBAHAN", inp.acc ? `${inp.accNote || "Ada"} (IDR ${fmt(inp.acc)})` : (inp.accNote || "Tidak Ada")),
    row("WILAYAH", S.region)
  ], y);

  y = section("JAMINAN & HARGA PERTANGGUNGAN", next(2));
  kv([row("JAMINAN", inp.cover === "comprehensive"
      ? "ALL RISK atas kerugian atau kerusakan fisik kendaraan yang dipertanggungkan akibat sebab apa pun, tunduk pada pengecualian polis"
      : "TOTAL LOSS ONLY atas kerugian total kendaraan yang dipertanggungkan, tunduk pada pengecualian polis")], y);
  const siRows = [["Kendaraan Bermotor", "IDR", fmt(inp.price)]];
  if (inp.acc) siRows.push(["Perlengkapan Tambahan", "IDR", fmt(inp.acc)]);
  siRows.push([{ content: "TOTAL HARGA PERTANGGUNGAN", styles: { fontStyle: "bold" } }, "IDR", { content: fmt(r.si), styles: { fontStyle: "bold" } }]);
  if (inp.tjh) siRows.push(["Limit TJH Pihak III", "IDR", fmt(inp.tjh)]);
  if (inp.paD) siRows.push(["Limit PA Pengemudi", "IDR", fmt(inp.paD)]);
  if (inp.paP) siRows.push(["Limit PA Penumpang" + (S.paPassPerSeat ? " (per orang)" : ""), "IDR", fmt(inp.paP)]);
  d.autoTable({ startY: next(1), body: siRows, theme: "plain", margin: { left: M + 52, right: M },
    styles: { fontSize: 8.6, cellPadding: 0.9 }, columnStyles: { 1: { cellWidth: 12 }, 2: { halign: "right", cellWidth: 40 } } });

  y = section("RISIKO SENDIRI (DEDUCTIBLE)", next(2));
  kv(lines(TX(inp.func).deductible).map(t => ["", "-", t]), y);

  y = section("PERHITUNGAN PREMI", next(2));
  const cs = showF ? 2 : 1;
  const pr = r.lines.map(l => showF
    ? [l.label, `IDR ${fmt(l.base)} x ${pct(l.rate)}${r.factor !== 1 ? ` x ${r.days}/365` : ""}`, fmt(l.prem)]
    : [l.label, fmt(l.prem)]);
  const right = (t, bold) => ({ content: t, colSpan: cs, styles: { halign: "right", fontStyle: bold ? "bold" : "normal" } });
  const foot = [[right("TOTAL PREMI", true), { content: fmt(r.gross), styles: { fontStyle: "bold" } }]];
  if (r.discAmt) foot.push([right(`Diskon ${pct(r.disc)} (kasko & perluasan)`), "-" + fmt(r.discAmt)]);
  foot.push([right("Biaya Polis"), fmt(r.policyCost)]);
  foot.push([right("Bea Materai"), fmt(r.stampDuty)]);
  foot.push([{ content: "TOTAL YANG HARUS DIBAYAR (IDR)", colSpan: cs, styles: { halign: "right", fontStyle: "bold", fillColor: NAVY, textColor: 255 } },
    { content: fmt(r.total), styles: { fontStyle: "bold", fillColor: NAVY, textColor: 255 } }]);
  const head = showF ? [["Jaminan", `Perhitungan (${dShort(inp.start)} - ${dShort(inp.end)})`, "Premi (IDR)"]] : [["Jaminan", "Premi (IDR)"]];
  d.autoTable({
    startY: y, head, body: [...pr, ...foot], theme: "grid", margin: { left: M, right: M },
    headStyles: { fillColor: NAVY, fontSize: 8.6 }, styles: { fontSize: 8.6, cellPadding: 1.6, lineColor: [220, 225, 235] },
    columnStyles: showF ? { 0: { cellWidth: 70 }, 2: { halign: "right", cellWidth: 34 } } : { 1: { halign: "right", cellWidth: 40 } }
  });
  if (r.loadPct && showF) {
    const note = [`Rate kasko termasuk loading usia kendaraan ${r.age} tahun sebesar ${pct(r.loadPct)} (rate dasar ${pct(r.baseRate)}).`];
    d.setFontSize(7.8); d.setTextColor(90); d.text(note, M, next(4)); d.setTextColor(25); d.lastAutoTable.finalY += 4;
  }

  y = section("KETENTUAN", next(3));
  kv([
    row("TERMIN PEMBAYARAN", S.paymentTerm),
    row("MASA BERLAKU", `Penawaran berlaku ${S.validityDays} hari sejak tanggal penawaran`)
  ], y);
  y = section("KLAUSULA & WARRANTY", next(2));
  kv([...lines(TX(inp.func).clauses), ...cxChosen(inp).map(x => (x.clause || "").trim()).filter(Boolean)].map((t, i) => ["", `${i + 1}.`, t]), y);
  y = section("SUBJECTIVITY", next(2));
  kv(lines(TX(inp.func).subjectivity).map(t => ["", "-", t]), y);
  y = section("DISCLAIMER", next(2));
  d.autoTable({ startY: y, body: [[S.texts.disclaimer]], theme: "plain", margin: { left: M, right: M }, styles: { fontSize: 8.2, cellPadding: 1, halign: "justify" } });

  y = next(8); if (y > 255) { d.addPage(); y = 25; }
  const today = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  d.setFontSize(9); d.setFont("helvetica", "normal");
  d.text(`${c.city || ""}${c.city ? ", " : ""}${today}`, W - M, y, { align: "right" });
  d.setFont("helvetica", "bold"); d.text(c.name || c.brand || "", W - M, y + 5, { align: "right" });
  d.setFont("helvetica", "normal"); d.line(W - M - 55, y + 25, W - M, y + 25);
  d.text(c.signer || "Petugas Berwenang", W - M, y + 30, { align: "right" });
  if (K.name || K.wa) { d.setFontSize(8.5); d.setTextColor(90); d.text(`Hubungi: ${[K.name, K.wa && "WA " + K.wa].filter(Boolean).join(" · ")}`, M, y + 30); d.setTextColor(25); }

  const n = d.internal.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    d.setPage(i);
    if (LOGO_IMG && S.pdfWatermark !== false) {   /* watermark logo tipis di tengah halaman */
      try {
        const p = d.getImageProperties(LOGO_IMG), k = Math.min(120 / p.width, 120 / p.height), w = p.width * k, hh = p.height * k;
        d.setGState(new d.GState({ opacity: 0.055 }));
        d.addImage(LOGO_IMG, p.fileType || "PNG", (W - w) / 2, 158 - hh / 2, w, hh, "wm", "FAST");
        d.setGState(new d.GState({ opacity: 1 }));
      } catch {}
    }
    d.setFontSize(7.5); d.setTextColor(120); d.setFont("helvetica", "normal");
    d.line(M, 287, W - M, 287);
    d.text(`${COPYRIGHT} · ${APP_VERSION}`, M, 291);
    d.text(`Ref. ${ref}  ·  Hal. ${i}/${n}`, W - M, 291, { align: "right" });
  }
  const safe = (inp.plate || inp.name || "kendaraan").replace(/[^\w]+/g, "_").slice(0, 30);
  return { blob: d.output("blob"), name: `Penawaran_${safe}_${ref.split("/").slice(1).join("")}.pdf`, ref };
}
function download(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function normPhone(p) {
  let s = String(p || "").replace(/[^\d]/g, "");
  if (s.startsWith("0")) s = "62" + s.slice(1);
  else if (s.startsWith("8")) s = "62" + s;
  return s;
}
function prepare() {
  recalc(); const err = validate(last.inp); if (err) { toast(err, "err"); return null; }
  ensureId();
  let pdf; try { pdf = buildPdf(currentRef); } catch (e) { toast(e.message, "err"); return null; }
  if (D().autoSave) saveRecord(true); else updateSaveState();
  return pdf;
}
function markSent() { if (!currentId) return; const r = histItems().find(x => x.id === currentId); if (r && (r.status || "baru") === "baru") updateRecord(currentId, { status: "dikirim" }); }
function doPdf() {
  return withBtn($("#btnPdf"), async () => {
    if (!pdfReady()) { try { await loadPdfLibs(); } catch { return toast("PDF belum bisa dibuat. Periksa koneksi internet.", "err"); } }
    await new Promise(r => setTimeout(r, 30));
    const pdf = prepare(); if (!pdf) return; download(pdf.blob, pdf.name); toast("PDF berhasil dibuat.", "ok");
  }, "Membuat PDF…");
}
function doWa() { return withBtn($("#btnWa"), doWaInner, "Menyiapkan…"); }
async function doWaInner() {
  if (!pdfReady()) { try { await loadPdfLibs(); } catch { return toast("PDF belum bisa dibuat. Periksa koneksi internet.", "err"); } }
  await new Promise(r => setTimeout(r, 30));
  const pdf = prepare(); if (!pdf) return;
  const text = summaryText(last.inp, last.r, "PENAWARAN ASURANSI KENDARAAN") + `\n\nNo. Ref: ${pdf.ref}\nRincian lengkap pada PDF terlampir.`;
  const file = new File([pdf.blob], pdf.name, { type: "application/pdf" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: pdf.name, text }); markSent(); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  const win = window.open(`https://wa.me/${normPhone(last.inp.phone)}?text=${encodeURIComponent(text)}`, "_blank"); markSent();
  download(pdf.blob, pdf.name);
  toast(win ? "PDF diunduh — lampirkan file tersebut di chat WhatsApp." : "Izinkan pop-up untuk membuka WhatsApp. PDF sudah diunduh.", "", 6000);
}

/* ====================== KONEKSI DATA ====================== */
function setNet(on, msg) { const el = $("#netStatus"); el.hidden = on || !msg; el.textContent = msg || ""; el.className = "pill off"; }
async function initFirebase() {
  try {
    const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    const [A0, A, F] = await Promise.all([import(base + "firebase-app.js"), import(base + "firebase-auth.js"), import(base + "firebase-firestore.js")]);
    const app = A0.initializeApp(firebaseConfig);
    let db;
    try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }   /* data cloud juga tersimpan di perangkat */
    catch { db = F.getFirestore(app); }
    fb = { auth: A.getAuth(app), db, A, F };
    A.onAuthStateChanged(fb.auth, u => {
      const prev = user; user = u; authResolved = true;
      if (u) LS.set("ai_authed", u.email); else { try { localStorage.removeItem("ai_authed"); } catch {} }
      applyTabs(); renderAdminGate();
      if (u) { syncHistory(!prev); startInbox(); if (!prev) loadRemote(true).catch(() => {}); } else stopInbox();
      if (!$("#tab-hist").hidden) renderHist();
    });
    await loadRemote();
    setNet(true, "");
  } catch (e) {
    setNet(false, navigator.onLine ? "" : "Offline"); renderAdminGate();
  }
}
/* Pengaturan hemat kuota: baca 1 dokumen kecil "meta" berisi nomor versi.
   Dokumen besar (pengaturan, kendaraan, foto header, logo) hanya diunduh jika versinya berubah. */
const MKEY = "ai_meta";
async function loadRemote(force = false) {
  if (!fb) return;
  if (admDirty) return;                              /* jangan timpa isian admin yang belum disimpan */
  const lm = LS.get(MKEY) || {};
  if (!force && !user && lm.checked && Date.now() - lm.checked < 5 * 60000) return;
  const { doc, getDoc } = fb.F, db = fb.db;
  busy(1);
  try {
    const ms = await getDoc(doc(db, "config", "meta")); const m = ms.exists() ? ms.data() : null;
    const need = k => !m || !m[k] || m[k] !== lm[k];
    const jobs = [];
    if (need("settings")) jobs.push(getDoc(doc(db, "config", "settings")).then(s => { if (s.exists()) { S = normalizeSettings(s.data()); LS.set("ai_settings", S); } }));
    if (need("vehicles")) jobs.push(getDoc(doc(db, "config", "vehicles")).then(v => { if (v.exists() && Array.isArray(v.data().list) && v.data().list.length) { VEH = v.data().list; mergeNewVehicles(); LS.set("ai_vehicles", VEH); } }));
    if (need("hero") && !heroDirty) jobs.push(getDoc(doc(db, "config", "hero")).then(h => { HERO_IMG = h.exists() ? h.data().image || "" : ""; LS.set("ai_hero", HERO_IMG); }).catch(() => {}));
    if (need("logo") && !logoDirty) jobs.push(getDoc(doc(db, "config", "logo")).then(l => { LOGO_IMG = l.exists() ? l.data().image || "" : ""; LS.set("ai_logo", LOGO_IMG); }).catch(() => {}));
    await Promise.all(jobs);
    LS.set(MKEY, { ...(m || {}), checked: Date.now() });
    if (jobs.length) { applySettingsToUI(); if (fillAdmin.done) fillAdmin(); }
  } finally { busy(-1); }
}
const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };

/* ====================== ADMIN ====================== */
function renderAdminGate() {
  const showAdmin = !$("#tab-admin").hidden;
  $("#fbDown").hidden = !!fb || !showAdmin;
  $("#loginBox").hidden = !fb || !!user;
  $("#adminBox").hidden = !fb || !user;
  if (fb && user && showAdmin) { $("#adminWho").textContent = user.email; $("#admAv").textContent = (user.email[0] || "A").toUpperCase(); if (!isMobile() && !$("#adm").classList.contains("open")) openAdmPane(admPane); if (!fillAdmin.done) { fillAdmin(); fillAdmin.done = true; } }
  if (!user) fillAdmin.done = false;
  updateSaveBar();
}
let adminFunc = "PRIBADI", textFunc = "PRIBADI";
const AT = () => S.tiersByFunc[adminFunc];
function tierRows(key) {
  const tb = $("#tier-" + key);
  if (!AT()[key]) { tb.innerHTML = ""; return; }
  const rows = [...AT()[key]].sort((a, b) => (a.max ?? Infinity) - (b.max ?? Infinity));
  AT()[key] = rows;
  tb.innerHTML = rows.map((t, i) => `<tr>
    <td><input type="number" step="1" min="0" data-tier="${key}" data-i="${i}" data-f="max" value="${t.max == null ? "" : t.max / 1e6}" placeholder="ke atas"></td>
    <td><input type="number" step="0.001" min="0" data-tier="${key}" data-i="${i}" data-f="rate" value="${t.rate}"></td>
    <td><button class="btn danger sm" data-deltier="${key}" data-i="${i}">✕</button></td></tr>`).join("");
}
function renderRateFunc() {
  $$("[data-rfunc]").forEach(b => b.classList.toggle("active", b.dataset.rfunc === adminFunc));
  $$(".rateFuncName").forEach(e => e.textContent = funcLabel(adminFunc));
  $("#tloCard").hidden = !AT().tlo; $("#btnCopyTier").hidden = adminFunc === "PRIBADI";
  tierRows("comprehensive"); tierRows("tlo"); renderFlat();
}
function renderFlat() {
  const fl = S.flatByFunc[adminFunc], tlo = FUNC_COVERS[adminFunc].includes("tlo");
  $$(".flatTlo").forEach(e => e.hidden = !tlo);
  $("#flatRates").innerHTML = ["truck", "bus", "moto"].map(k => `<tr><td style="font-weight:600;font-size:14px">${esc(catInfo(k).short)}<div class="hint">${esc(catInfo(k).ojk)}</div></td>
    <td><input type="number" step="0.001" min="0" data-flat="${k}" data-cv="comprehensive" value="${fl[k].comprehensive}"></td>
    ${tlo ? `<td><input type="number" step="0.001" min="0" data-flat="${k}" data-cv="tlo" value="${fl[k].tlo}"></td>` : ""}</tr>`).join("");
  $("#flatOjk").textContent = "Acuan OJK Wilayah 1 — " + ["truck", "bus", "moto"].map(k => `${catInfo(k).short}: Comprehensive ${pct(OJK_W1.comprehensive[k][0])}–${pct(OJK_W1.comprehensive[k][1])}${tlo ? `, TLO ${pct(OJK_W1.tlo[k][0])}–${pct(OJK_W1.tlo[k][1])}` : ""}`).join(" · ");
}
function fillOjk(idx) {
  FUNC_COVERS[adminFunc].forEach(cv => {
    AT()[cv] = OJK_W1[cv].tiers.map(t => ({ max: t[0], rate: t[1 + idx] }));
    ["truck", "bus", "moto"].forEach(k => S.flatByFunc[adminFunc][k][cv] = OJK_W1[cv][k][idx]);
  });
  renderRateFunc(); setDirty(true);
}
function readTexts() {
  S.textsByFunc[textFunc] = { deductible: $("#aDeduct").value.trim(), clauses: $("#aClauses").value.trim(), subjectivity: $("#aSubj").value.trim() };
}
function renderTextFunc() {
  $$("[data-tfunc]").forEach(b => b.classList.toggle("active", b.dataset.tfunc === textFunc));
  $$(".textFuncName").forEach(e => e.textContent = funcLabel(textFunc));
  $("#btnCopyText").hidden = textFunc === "PRIBADI";
  const t = TX(textFunc); $("#aDeduct").value = t.deductible; $("#aClauses").value = t.clauses; $("#aSubj").value = t.subjectivity;
}
function renderCx() {
  const list = S.customExt || [];
  $("#cxList").innerHTML = list.map((x, i) => `<div class="cx" data-cx="${i}">
    <div class="row">
      <div class="f"><label>Nama perluasan *</label><input data-cf="label" value="${esc(x.label)}" placeholder="cth. Baterai Kendaraan Hybrid / Listrik"></div>
      <div class="f"><label>Rate (%) × Harga Pertanggungan</label><input data-cf="rate" type="number" step="0.001" min="0" value="${esc(x.rate)}"></div>
      <div class="f full"><label>Keterangan di halaman depan</label><input data-cf="desc" value="${esc(x.desc || "")}" placeholder="cth. Menjamin kerusakan baterai kendaraan hybrid dan listrik."></div>
      <div class="f full"><label>Klausula di PDF (tercetak jika perluasan dipilih)</label><input data-cf="clause" value="${esc(x.clause || "")}" placeholder="cth. Klausul Baterai Kendaraan Listrik"></div>
      <div class="f full"><label>Berlaku untuk</label><div class="cx-funcs">
        ${FUNCS.map(f => `<label class="chk"><input type="checkbox" data-cfunc="${f.key}" ${(x.funcs || {})[f.key] !== false ? "checked" : ""}><span class="t">${f.label}</span></label>`).join("")}
        <label class="chk"><input type="checkbox" data-cf="active" ${x.active !== false ? "checked" : ""}><span class="t"><b>Aktif</b></span></label>
      </div></div>
    </div>
    <div class="btns"><button class="btn sm danger" data-cxdel="${i}" style="flex:0 1 auto">Hapus perluasan</button></div></div>`).join("")
    || `<p class="hint">Belum ada perluasan tambahan.</p>`;
}
function readCx() {
  S.customExt = $$("#cxList [data-cx]").map(box => {
    const old = (S.customExt || [])[+box.dataset.cx] || {};
    const val = k => box.querySelector(`[data-cf="${k}"]`);
    const funcs = {}; FUNCS.forEach(f => funcs[f.key] = box.querySelector(`[data-cfunc="${f.key}"]`).checked);
    return { id: old.id || Math.random().toString(36).slice(2, 9), label: val("label").value.trim(), rate: +val("rate").value || 0,
      desc: val("desc").value.trim(), clause: val("clause").value.trim(), funcs, active: val("active").checked };
  });
}
function renderLogoAdmin() {
  $("#lgPrevWrap").hidden = !LOGO_IMG; if (LOGO_IMG) $("#lgPreview").src = LOGO_IMG;
}
function compressLogo(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 512 / Math.max(img.width, img.height)), cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      let out = cv.toDataURL("image/png");
      if (out.length > 350000) { const c2 = document.createElement("canvas"); c2.width = cv.width; c2.height = cv.height; const x = c2.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c2.width, c2.height); x.drawImage(cv, 0, 0); out = c2.toDataURL("image/jpeg", 0.85); }
      out.length > 600000 ? rej(new Error("Logo terlalu besar.")) : res(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("File bukan gambar yang valid.")); };
    img.src = url;
  });
}
function renderHeroAdmin() {
  $("#hPrevWrap").hidden = !HERO_IMG; if (HERO_IMG) $("#hPreview").src = HERO_IMG;
}
function fillAdmin() {
  renderRateFunc(); renderTextFunc(); renderCx();
  $("#aAgeOn").value = S.ageLoading.enabled ? "1" : "0"; $("#aAgeAfter").value = S.ageLoading.afterYears; $("#aAgePct").value = S.ageLoading.pctPerYear;
  $("#extRates").innerHTML = EXT_DEFS.map(e => `<div class="f"><label>${esc(e.label)} (%)</label><input type="number" step="0.001" min="0" data-ext="${e.key}" value="${S.ext[e.key]}"></div>`).join("");
  $("#aTjhRate").value = S.tjhRate; $("#aPaDRate").value = S.paDriverRate; $("#aPaPRate").value = S.paPassRate;
  $("#aTjhLimits").value = S.tjhLimits.map(n => n / 1e6).join(", "); $("#aPaLimits").value = S.paLimits.map(n => n / 1e6).join(", ");
  $("#aPaPerSeat").value = S.paPassPerSeat ? "1" : "0";
  $("#aPolicy").value = S.policyCost; $("#aStamp").value = S.stampDuty; $("#aMaxDisc").value = S.maxDiscount;
  $("#aRegion").value = S.region; $("#aValid").value = S.validityDays; $("#aPayTerm").value = S.paymentTerm;
  $("#dispExt").innerHTML = EXT_DEFS.map(e => `<label class="chk"><input type="checkbox" data-dispext="${e.key}" ${D().ext[e.key] !== false ? "checked" : ""}><span class="t">Perluasan: ${esc(e.label)}</span></label>`).join("");
  $$("[data-disp]").forEach(i => i.checked = !!D()[i.dataset.disp]); $("#aRenewDays").value = S.renewDays || 60;
  $("#aDisc").value = S.texts.disclaimer;
  $("#kName").value = S.contact.name; $("#kWa").value = S.contact.wa;
  renderLogoAdmin(); $("#verNow").textContent = APP_VERSION; $("#lgWm").checked = S.pdfWatermark !== false;
  $("#hTitle").value = S.hero.title; $("#hSub").value = S.hero.subtitle; $("#hStyle").value = S.hero.style; renderHeroAdmin();
  const c = S.company;
  $("#cBrand").value = c.brand; $("#cLogo").value = c.logo; $("#cName").value = c.name; $("#cAddr").value = c.address;
  $("#cPhone").value = c.phone; $("#cEmail").value = c.email; $("#cCity").value = c.city; $("#cSigner").value = c.signer; $("#cPrefix").value = c.prefix;
  renderVeh();
}
function readTiers() {
  $$("[data-flat]").forEach(i => { const f = S.flatByFunc[adminFunc][i.dataset.flat]; if (f) f[i.dataset.cv] = +i.value || 0; });
  for (const key of Object.keys(AT())) {
    $$(`[data-tier="${key}"]`).forEach(inp => {
      const t = AT()[key][+inp.dataset.i]; if (!t) return;
      if (inp.dataset.f === "max") t.max = inp.value === "" ? null : Math.round(+inp.value * 1e6);
      else t.rate = +inp.value || 0;
    });
  }
}
const parseLimits = s => [...new Set(String(s).split(/[,;\s]+/).map(x => +x.replace(",", ".")).filter(x => x > 0).map(x => Math.round(x * 1e6)))].sort((a, b) => a - b);
function collectAdmin() {
  readTiers();
  for (const f of FUNCS) for (const key of Object.keys(S.tiersByFunc[f.key])) {
    const t = S.tiersByFunc[f.key][key], nm = `${COVER_LABEL[key]} — ${f.label}`;
    if (!t.length) throw new Error(`Tabel rate ${nm} kosong.`);
    if (t.filter(x => x.max == null).length > 1) throw new Error(`Tabel ${nm}: hanya satu baris boleh "ke atas".`);
    if (!t.some(x => x.max == null)) t.push({ max: null, rate: t[t.length - 1].rate });
    S.tiersByFunc[f.key][key] = t.sort((a, b) => (a.max ?? Infinity) - (b.max ?? Infinity));
  }
  S.ageLoading = { enabled: $("#aAgeOn").value === "1", afterYears: +$("#aAgeAfter").value || 0, pctPerYear: +$("#aAgePct").value || 0 };
  $$("[data-ext]").forEach(i => S.ext[i.dataset.ext] = +i.value || 0);
  S.tjhRate = +$("#aTjhRate").value || 0; S.paDriverRate = +$("#aPaDRate").value || 0; S.paPassRate = +$("#aPaPRate").value || 0;
  S.tjhLimits = parseLimits($("#aTjhLimits").value); S.paLimits = parseLimits($("#aPaLimits").value);
  S.paPassPerSeat = $("#aPaPerSeat").value === "1";
  S.policyCost = +$("#aPolicy").value || 0; S.stampDuty = +$("#aStamp").value || 0;
  S.maxDiscount = Math.min(100, Math.max(0, +$("#aMaxDisc").value || 0));
  S.region = $("#aRegion").value.trim() || "Wilayah 1"; S.validityDays = +$("#aValid").value || 14; S.paymentTerm = $("#aPayTerm").value.trim();
  $$("[data-disp]").forEach(i => S.display[i.dataset.disp] = i.checked);
  S.renewDays = Math.min(180, Math.max(7, +$("#aRenewDays").value || 60));
  $$("[data-dispext]").forEach(i => S.display.ext[i.dataset.dispext] = i.checked);
  readCx();
  S.customExt.forEach((x, i) => { if (!x.label) throw new Error(`Perluasan tambahan nomor ${i + 1}: nama belum diisi.`); });
  readTexts(); S.texts = { disclaimer: $("#aDisc").value.trim() };
  S.pdfWatermark = $("#lgWm").checked;
  S.vehMerged = [...new Set([...(S.vehMerged || []), "v1.5.2"])];
  S.contact = { name: $("#kName").value.trim(), wa: $("#kWa").value.trim() };
  S.hero = { style: $("#hStyle").value, title: $("#hTitle").value.trim() || DEFAULT_SETTINGS.hero.title, subtitle: $("#hSub").value.trim() || DEFAULT_SETTINGS.hero.subtitle };
  S.company = { brand: $("#cBrand").value.trim(), logo: $("#cLogo").value.trim().toUpperCase(), name: $("#cName").value.trim(), address: $("#cAddr").value.trim(),
    phone: $("#cPhone").value.trim(), email: $("#cEmail").value.trim(), city: $("#cCity").value.trim(), signer: $("#cSigner").value.trim(), prefix: $("#cPrefix").value.trim() || "QS" };
}
async function saveAll() {
  try { collectAdmin(); } catch (e) { return toast(e.message, "err"); }
  const btn = $("#btnSave"); btnLoad(btn, true, "Menyimpan…"); busy(1);
  try {
    const { doc, setDoc, serverTimestamp } = fb.F, db = fb.db;
    const stamp = Date.now(), lm = LS.get(MKEY) || {}, nm = { settings: lm.settings || 0, vehicles: lm.vehicles || 0, hero: lm.hero || 0, logo: lm.logo || 0 };
    const firstClean = !S.clean16; S.clean16 = true;      /* tulis ulang sekali untuk menghapus email admin dari data publik lama */
    const t = { updatedAt: serverTimestamp() };           /* tidak lagi menyimpan email admin di data yang bisa dibaca publik */
    await setDoc(doc(db, "config", "settings"), { ...clone(S), ...t }); nm.settings = stamp;
    const vh = hashStr(JSON.stringify(VEH));
    if (firstClean || vh !== LS.get("ai_veh_hash")) { await setDoc(doc(db, "config", "vehicles"), { list: VEH, ...t }); nm.vehicles = stamp; LS.set("ai_veh_hash", vh); }
    if (firstClean || heroDirty) { await setDoc(doc(db, "config", "hero"), { image: HERO_IMG, ...t }); heroDirty = false; LS.set("ai_hero", HERO_IMG); nm.hero = stamp; }
    if (firstClean || logoDirty) { await setDoc(doc(db, "config", "logo"), { image: LOGO_IMG, ...t }); logoDirty = false; LS.set("ai_logo", LOGO_IMG); nm.logo = stamp; }
    await setDoc(doc(db, "config", "meta"), nm);
    LS.set(MKEY, { ...nm, checked: Date.now() });
    autoBackup().catch(() => {});
    LS.set("ai_settings", S); LS.set("ai_vehicles", VEH);
    applySettingsToUI(); fillAdmin(); setDirty(false); showTab("admin"); toast("Pengaturan tersimpan.", "ok");
  } catch (e) {
    toast(e.code === "permission-denied" ? "Akses ditolak. Akun ini tidak memiliki izin admin." : "Gagal menyimpan. Periksa koneksi lalu coba lagi.", "err", 6000);
  } finally { btnLoad(btn, false); busy(-1); }
}
let vehLimit = 50;
function renderVeh() {
  const q = $("#vFilter").value.trim().toLowerCase();
  const rows = VEH.map((v, i) => ({ ...v, i })).filter(v => !q || `${v.brand} ${v.type} ${v.model}`.toLowerCase().includes(q))
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.type.localeCompare(b.type) || a.model.localeCompare(b.model));
  $("#vCount").textContent = `${VEH.length} unit`;
  const shown = rows.slice(0, vehLimit);
  $("#vBody").innerHTML = (shown.map(v => `<tr>
    <td>${esc(v.brand)}</td><td><span class="vtype">${esc(v.type)}</span></td><td>${esc(v.model)}</td>
    <td><input type="number" inputmode="numeric" min="0" data-vprice="${v.i}" value="${v.price || ""}" placeholder="Harga acuan (Rp)" aria-label="Harga acuan ${esc(v.model)}"></td>
    <td><button class="btn danger sm" data-vdel="${v.i}" aria-label="Hapus ${esc(v.model)}">✕</button></td></tr>`).join("")
    + (rows.length > shown.length ? `<tr class="vmore-row"><td colspan="5" class="vmore"><span class="hint">Menampilkan ${shown.length} dari ${rows.length}. Gunakan pencarian untuk cepat menemukan.</span><br><button class="btn sm" id="btnVehMore" style="margin-top:8px">Tampilkan lebih banyak</button></td></tr>` : ""))
    || `<tr><td colspan="5" class="hint">Tidak ditemukan.</td></tr>`;
  $("#brandList").innerHTML = brands().map(b => `<option value="${esc(b)}">`).join("");
  $("#typeList").innerHTML = [...new Set(VEH.map(v => v.type))].sort().map(t => `<option value="${esc(t)}">`).join("");
}
async function reauth(pw) {
  const { EmailAuthProvider, reauthenticateWithCredential } = fb.A;
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pw));
}
const authMsg = e => ({
  "auth/invalid-credential": "Email atau password salah.", "auth/wrong-password": "Password salah.",
  "auth/user-not-found": "Akun tidak ditemukan.", "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi nanti.",
  "auth/weak-password": "Password minimal 6 karakter.", "auth/email-already-in-use": "Email sudah dipakai akun lain.",
  "auth/invalid-email": "Format email tidak valid.", "auth/requires-recent-login": "Silakan login ulang lalu coba lagi.",
  "auth/network-request-failed": "Koneksi bermasalah."
}[e.code] || "Terjadi kesalahan. Coba lagi.");

/* ====================== PWA ====================== */
let deferredPrompt = null, swWaiting = null, reloading = false, swReg = null;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function initPwa() {
  if (isStandalone()) document.documentElement.classList.add("standalone");
  if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
    navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => {
      swReg = reg;
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) showUpdate(w); });
      });
      setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
    }).catch(() => {});
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading) { skipUnload = true; location.reload(); } });
  }
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferredPrompt = e; if (!isStandalone()) $("#btnInstall").hidden = false; });
  window.addEventListener("appinstalled", () => { $("#btnInstall").hidden = true; deferredPrompt = null; toast("Aplikasi terpasang.", "ok"); });
  if (isIOS && !isStandalone()) $("#btnInstall").hidden = false;
  $("#btnInstall").addEventListener("click", async () => {
    if (deferredPrompt) { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $("#btnInstall").hidden = true; }
    else if (isIOS) $("#iosModal").hidden = false;
  });
  $("#iosClose").addEventListener("click", () => $("#iosModal").hidden = true);
  $("#btnUpd").addEventListener("click", () => { reloading = true; saveDrafts(); $("#updBar").hidden = true; swWaiting && swWaiting.postMessage("SKIP_WAITING"); });
  window.addEventListener("online", () => { if (fb) { setNet(true, ""); loadRemote(true).catch(() => {}); syncHistory(true); } else initFirebase(); });
  window.addEventListener("offline", () => setNet(false, "Offline"));
  initExitGuard();
}
function showUpdate(w) { swWaiting = w; $("#updBar").hidden = false; }

/* Tombol kembali → dialog konfirmasi. Tutup tab/jendela → konfirmasi bawaan browser.
   Refresh tetap menyimpan isian (lihat saveDrafts). */
let guardArmed = false, exiting = false, skipUnload = false;
function armGuard() { if (guardArmed || exiting) return; guardArmed = true; history.pushState({ aiGuard: 1 }, ""); }
function initExitGuard() {
  ["pointerdown", "keydown", "touchstart"].forEach(ev => window.addEventListener(ev, armGuard, { capture: true, passive: true }));
  window.addEventListener("popstate", () => {
    if (exiting) return;
    guardArmed = false;
    const open = ["#iosModal", "#exitModal"].map(id => $(id)).find(m => !m.hidden);
    if (open) { open.hidden = true; armGuard(); return; }
    if (admPaneOpenMobile()) { closeAdmPane(); armGuard(); return; }
    $("#exitModal").hidden = false;
  });
  $("#exitNo").addEventListener("click", () => { $("#exitModal").hidden = true; armGuard(); });
  $("#exitYes").addEventListener("click", () => {
    saveDrafts(); exiting = true; $("#exitModal").hidden = true;
    history.back();
    setTimeout(() => { try { window.close(); } catch {} }, 150);
    setTimeout(() => { exiting = false; toast("Tekan tombol kembali sekali lagi untuk menutup aplikasi."); }, 700);
  });
  window.addEventListener("keydown", e => { if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r")) skipUnload = true; });
  window.addEventListener("beforeunload", e => { saveDrafts(); if (exiting || skipUnload) return; e.preventDefault(); e.returnValue = ""; });
  window.addEventListener("pagehide", saveDrafts);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveDrafts(); });
}

/* ====================== EVENT ====================== */
function bind() {
  $$(".tab").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
  $("#subtabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-sub]"); if (!b) return;
    readTiers();
    $$("#subtabs button").forEach(x => x.classList.toggle("active", x === b));
    $$("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== b.dataset.sub);
  });

  document.addEventListener("click", e => { const g = e.target.closest("[data-goto]"); if (g) showTab(g.dataset.goto); });
  $$("[data-jump]").forEach(b => b.addEventListener("click", () => $(b.dataset.jump).scrollIntoView({ behavior: "smooth", block: "start" })));
  // Hitung cepat
  moneyInput($("#qPrice")); moneyInput($("#qAcc"));
  $("#tab-quick").addEventListener("input", recalcQuick);
  $("#tab-quick").addEventListener("change", recalcQuick);
  $("#qDisc").addEventListener("change", () => { if (+$("#qDisc").value > S.maxDiscount) { $("#qDisc").value = S.maxDiscount; toast(`Diskon maksimal ${S.maxDiscount}%`); recalcQuick(); } });
  $("#qCopy").addEventListener("click", async () => {
    recalcQuick(); if (!lastQuick.r.lines.length) return toast("Isi harga kendaraan dulu.", "err");
    const t = summaryText(lastQuick.inp, lastQuick.r, "SIMULASI PREMI ASURANSI KENDARAAN");
    try { await navigator.clipboard.writeText(t); toast("Hasil disalin.", "ok"); } catch { toast("Gagal menyalin.", "err"); }
  });
  $("#qShare").addEventListener("click", async () => {
    recalcQuick(); if (!lastQuick.r.lines.length) return toast("Isi harga kendaraan dulu.", "err");
    const t = summaryText(lastQuick.inp, lastQuick.r, "SIMULASI PREMI ASURANSI KENDARAAN");
    if (navigator.share) { try { await navigator.share({ text: t }); return; } catch (e) { if (e.name === "AbortError") return; } }
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, "_blank");
  });
  $("#qToFull").addEventListener("click", () => {
    const q = readQuick();
    resetForm(); showTab("calc");
    setSel($("#fFunc"), q.func); setSel($("#fCat"), q.cat); renderCoverSelect($("#fCover"), $("#fFunc").value); setSel($("#fCover"), q.cover); setSel($("#fYear"), q.year);
    $("#fPrice").value = q.price ? fmt(q.price) : ""; $("#fAcc").value = q.acc ? fmt(q.acc) : "";
    if (S.paPassPerSeat) $("#fSeats").value = q.seats || 7;
    renderExt("#extList", "ext_", $("#fFunc").value); setExtChecks("ext_", q.ext);
    setSel($("#fTjh"), q.tjh); setSel($("#fPaD"), q.paD); setSel($("#fPaP"), q.paP); $("#fDisc").value = q.disc;
    recalc(); toast("Lengkapi data tertanggung dan kendaraan.");
  });
  $("#qReset").addEventListener("click", () => {
    $("#qPrice").value = ""; $("#qAcc").value = ""; $("#qDisc").value = 0;
    $$("#qExtList input").forEach(i => i.checked = false); ["#qTjh", "#qPaD", "#qPaP"].forEach(s => $(s).value = "0"); recalcQuick();
  });

  // Penawaran
  $("#fBrand").addEventListener("change", () => renderModels());
  $("#fModel").addEventListener("change", () => onModel(true));
  moneyInput($("#fPrice"), el => el.dataset.auto = "0"); moneyInput($("#fAcc"));
  $("#fStart").addEventListener("change", () => {
    const s = $("#fStart").value; if (!s) return;
    const d = new Date(s + "T00:00:00Z"); d.setUTCFullYear(d.getUTCFullYear() + 1);
    $("#fEnd").value = d.toISOString().slice(0, 10); recalc();
  });
  $("#tab-calc").addEventListener("input", recalc);
  $("#tab-calc").addEventListener("change", recalc);
  $("#fDisc").addEventListener("change", () => { if (+$("#fDisc").value > S.maxDiscount) { $("#fDisc").value = S.maxDiscount; toast(`Diskon maksimal ${S.maxDiscount}%`); recalc(); } });
  $("#btnPdf").addEventListener("click", doPdf);
  $("#btnWa").addEventListener("click", doWa);
  $("#btnSaveRec").addEventListener("click", () => { recalc(); const err = validate(last.inp); if (err) return toast(err, "err"); saveRecord(); });
  $("#btnReset").addEventListener("click", () => { if (confirm("Mulai penawaran baru? Isian saat ini dikosongkan (yang sudah disimpan tetap ada di riwayat).")) resetForm(); });

  // Riwayat
  $("#hFilter").addEventListener("input", renderHist);
  $("#hList").addEventListener("click", e => {
    const o = e.target.closest("[data-hopen]"), p = e.target.closest("[data-hpdf]"), d = e.target.closest("[data-hdel]");
    if (o) { openRecord(o.dataset.hopen); toast("Perhitungan dibuka."); }
    if (p) { if (openRecord(p.dataset.hpdf)) doPdf(); }
    if (d) deleteRecord(d.dataset.hdel);
  });
  $("#hList").addEventListener("change", e => { const s = e.target.closest("[data-hst]"); if (s) { updateRecord(s.dataset.hst, { status: s.value }); renderHist(); toast("Status diperbarui."); } });
  $("#hStatus").addEventListener("change", renderHist);
  $("#renewList").addEventListener("click", e => {
    const rm = e.target.closest("[data-remind]"); if (rm) { updateRecord(rm.dataset.remind, { remindedAt: new Date().toISOString() }); setTimeout(renderHist, 300); }
    const rn = e.target.closest("[data-renew]"); if (rn) startRenewal(rn.dataset.renew);
    const dn = e.target.closest("[data-renewdone]"); if (dn && confirm("Tandai pengingat ini sudah selesai?")) { updateRecord(dn.dataset.renewdone, { renewed: true }); renderHist(); }
  });

  // Admin
  $("#btnLogin").addEventListener("click", async () => {
    const b = $("#btnLogin"); btnLoad(b, true, "Masuk…");
    try { await fb.A.signInWithEmailAndPassword(fb.auth, $("#lEmail").value.trim(), $("#lPass").value); $("#lPass").value = ""; toast("Berhasil masuk.", "ok"); }
    catch (e) { toast(authMsg(e), "err"); } finally { btnLoad(b, false); }
  });
  $("#lPass").addEventListener("keydown", e => { if (e.key === "Enter") $("#btnLogin").click(); });
  $("#lnkForgot").addEventListener("click", async e => {
    e.preventDefault(); const em = $("#lEmail").value.trim(); if (!em) return toast("Isi email dulu.", "err");
    try { await fb.A.sendPasswordResetEmail(fb.auth, em); toast("Link reset password dikirim ke " + em, "ok", 5000); } catch (er) { toast(authMsg(er), "err"); }
  });
  $("#btnLogout").addEventListener("click", () => { if (admDirty && !confirm("Ada perubahan yang belum disimpan. Tetap keluar?")) return; setDirty(false); fb.A.signOut(fb.auth); });
  $("#btnSave").addEventListener("click", saveAll);

  document.addEventListener("click", e => {
    const add = e.target.closest("[data-addtier]");
    if (add) { readTiers(); const k = add.dataset.addtier; const t = AT()[k]; const open = t.find(x => x.max == null);
      const lastMax = Math.max(0, ...t.filter(x => x.max != null).map(x => x.max));
      if (open) t.splice(t.indexOf(open), 0, { max: lastMax + 100e6, rate: open.rate }); else t.push({ max: null, rate: 1 });
      tierRows(k); }
    const del = e.target.closest("[data-deltier]");
    if (del) { readTiers(); const k = del.dataset.deltier; if (AT()[k].length <= 1) return toast("Minimal satu baris.", "err"); AT()[k].splice(+del.dataset.i, 1); tierRows(k); }
    const vd = e.target.closest("[data-vdel]");
    if (vd) { const v = VEH[+vd.dataset.vdel]; if (confirm(`Hapus ${v.brand} ${v.model}?`)) { VEH.splice(+vd.dataset.vdel, 1); renderVeh(); renderBrands(); } }
  });
  $("#vBody").addEventListener("change", e => { const i = e.target.dataset.vprice; if (i != null) VEH[+i].price = +e.target.value || 0; });
  $("#vFilter").addEventListener("input", () => { vehLimit = 50; renderVeh(); });
  $("#vBody").addEventListener("click", e => { if (e.target.closest("#btnVehMore")) { vehLimit += 100; renderVeh(); } });
  $("#btnAddVeh").addEventListener("click", () => {
    const v = { brand: $("#vBrand").value.trim(), type: $("#vType").value.trim() || "Lainnya", model: $("#vModel").value.trim(), price: +$("#vPrice").value || 0 };
    if (!v.brand || !v.model) return toast("Merek dan model wajib diisi.", "err");
    if (VEH.some(x => x.brand.toLowerCase() === v.brand.toLowerCase() && x.model.toLowerCase() === v.model.toLowerCase())) return toast("Kendaraan sudah ada.", "err");
    VEH.push(v); $("#vModel").value = ""; $("#vPrice").value = ""; renderVeh(); renderBrands();
    toast("Ditambahkan. Klik Simpan untuk menyimpan.", "ok");
  });
  $("#btnResetVeh").addEventListener("click", () => {
    if (!confirm("Ganti daftar kendaraan dengan daftar bawaan? Kendaraan tambahan & harga acuan akan hilang setelah disimpan.")) return;
    VEH = clone(DEFAULT_VEHICLES); renderVeh(); renderBrands(); toast("Daftar bawaan dimuat. Klik Simpan untuk menerapkan.");
  });
  $("#btnChgPass").addEventListener("click", async () => {
    const cur = $("#pCur").value, n1 = $("#pNew").value, n2 = $("#pNew2").value;
    if (!cur || !n1) return toast("Lengkapi isian password.", "err");
    if (n1 !== n2) return toast("Konfirmasi password tidak sama.", "err");
    if (n1.length < 6) return toast("Password minimal 6 karakter.", "err");
    try { await reauth(cur); await fb.A.updatePassword(user, n1); ["#pCur", "#pNew", "#pNew2"].forEach(i => $(i).value = ""); toast("Password berhasil diganti.", "ok"); }
    catch (e) { toast(authMsg(e), "err"); }
  });
  $("#btnChgEmail").addEventListener("click", async () => {
    const em = $("#eNew").value.trim(), cur = $("#eCur").value;
    if (!em || !cur) return toast("Isi email baru dan password.", "err");
    try { await reauth(cur); await fb.A.verifyBeforeUpdateEmail(user, em); $("#eCur").value = "";
      toast(`Link verifikasi dikirim ke ${em}. Klik link tersebut untuk menyelesaikan penggantian email.`, "ok", 7000); }
    catch (e) { toast(authMsg(e), "err"); }
  });
}

/* ====================== ADMIN: MENU DAFTAR + HALAMAN ISI ====================== */
const ADM_TITLES = { backup: "Cadangan", inbox: "Inbox", rate: "Rate kasko", ext: "Perluasan & biaya", text: "Teks polis", veh: "Kendaraan", disp: "Tampilan", front: "Halaman depan", comp: "Perusahaan", acct: "Akun" };
const SAVE_PANES = ["rate", "ext", "text", "veh", "disp", "front", "comp"];
let admDirty = false, admPane = "inbox";
const isMobile = () => matchMedia("(max-width: 760px)").matches;
const admPaneOpenMobile = () => !$("#tab-admin").hidden && !$("#adminBox").hidden && $("#adm").classList.contains("open") && isMobile();
function setDirty(v) { admDirty = v; updateSaveBar(); }
function updateSaveBar() {
  const bar = $("#saveBar"), open = $("#adm").classList.contains("open") || !isMobile();
  bar.hidden = $("#adminBox").hidden || !(admDirty || (open && SAVE_PANES.includes(admPane)));
  bar.classList.toggle("dirty", admDirty);
  $("#saveTxt").textContent = admDirty ? "Ada perubahan yang belum disimpan" : "Semua perubahan tersimpan";
  document.body.classList.toggle("has-savebar", !bar.hidden && !$("#tab-admin").hidden);
}
function openAdmPane(sub) {
  readTiers();
  if (sub === "backup") loadBackups();
  admPane = sub;
  $$("#subtabs .mi").forEach(x => x.classList.toggle("active", x.dataset.sub === sub));
  $$("[data-pane]").forEach(p => p.hidden = p.dataset.pane !== sub);
  $("#admTitle").textContent = ADM_TITLES[sub] || "";
  $("#adm").classList.add("open"); updateSaveBar(); window.scrollTo(0, 0);
}
function closeAdmPane() { $("#adm").classList.remove("open"); updateSaveBar(); window.scrollTo(0, 0); }
/* ====================== CADANGAN ====================== */
const BK_APP = "vehicle-protection-backup";
const tsIso = t => t && t.toDate ? t.toDate().toISOString() : (t || null);
function buildBackup() {
  readTiers();
  return {
    app: BK_APP, version: APP_VERSION, createdAt: new Date().toISOString(), by: user?.email || "",
    settings: clone(S), vehicles: VEH, hero: HERO_IMG, logo: LOGO_IMG,
    quotes: $("#bkQuotes").checked ? histItems() : [],
    inbox: $("#bkInbox").checked ? INBOX.map(x => ({ ...x, createdAt: tsIso(x.createdAt) })) : []
  };
}
function downloadBackup() {
  const data = buildBackup(), d = new Date(), p = n => String(n).padStart(2, "0");
  const name = `vpro-cadangan-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
  download(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }), name);
  toast(`Cadangan diunduh: ${name}`, "ok", 5000);
}
function applySettingsBackup(settings, vehicles) {
  S = normalizeSettings(settings);
  if (Array.isArray(vehicles) && vehicles.length) VEH = vehicles;
  fillAdmin(); applySettingsToUI(); setDirty(true);
}
async function restoreFromFile(file) {
  let data; try { data = JSON.parse(await file.text()); } catch { return toast("File tidak bisa dibaca. Pastikan file cadangan .json.", "err"); }
  if (!data || data.app !== BK_APP || !data.settings) return toast("Ini bukan file cadangan aplikasi ini.", "err");
  const nq = (data.quotes || []).length, ni = (data.inbox || []).length;
  const when = data.createdAt ? new Date(data.createdAt).toLocaleString("id-ID") : "-";
  if (!confirm(`Pulihkan cadangan tanggal ${when}?\n\n• Pengaturan & ${(data.vehicles || []).length} kendaraan\n• ${nq} riwayat penawaran\n• ${ni} pesan Inbox\n\nPengaturan baru berlaku setelah klik Simpan.`)) return;
  applySettingsBackup(data.settings, data.vehicles);
  if (typeof data.hero === "string") { HERO_IMG = data.hero; heroDirty = true; renderHeroAdmin(); }
  if (typeof data.logo === "string") { LOGO_IMG = data.logo; logoDirty = true; renderLogoAdmin(); renderHdrLogo(); }
  if (nq) {
    const have = new Set(localAll().map(r => r.id));
    data.quotes.filter(r => r && r.id && !have.has(r.id)).forEach(r => { r.updatedAt = r.updatedAt || r.savedAt || new Date().toISOString(); r._dirty = true; putLocal(r); });
    syncHistory(true);
  }
  if (ni && fb && user) {
    const { doc, setDoc, Timestamp } = fb.F;
    await Promise.all(data.inbox.filter(x => x && x.id).map(({ id, ...x }) => setDoc(doc(fb.db, "inbox", id), { ...x, createdAt: x.createdAt ? Timestamp.fromDate(new Date(x.createdAt)) : Timestamp.now() }).catch(() => {})));
  }
  toast("Cadangan dimuat. Periksa lalu klik Simpan untuk menerapkan pengaturan.", "ok", 6000);
}
async function autoBackup() {
  if (!fb || !user) return;
  const { collection, addDoc, serverTimestamp, query, orderBy, getDocs, deleteDoc } = fb.F;
  await addDoc(collection(fb.db, "backups"), { at: serverTimestamp(), by: user.email, version: APP_VERSION, settings: clone(S), vehicles: VEH });
  const { limit } = fb.F;
  const snap = await getDocs(query(collection(fb.db, "backups"), orderBy("at", "desc"), limit(25)));
  await Promise.all(snap.docs.slice(20).map(d => deleteDoc(d.ref)));
}
let BACKUPS = [];
async function loadBackups() {
  const box = $("#bkList");
  if (!fb || !user) { box.innerHTML = `<p class="hint">Masuk untuk melihat cadangan otomatis.</p>`; return; }
  box.innerHTML = SKEL(3);
  try {
    const { collection, query, orderBy, limit, getDocs } = fb.F;
    const snap = await getDocs(query(collection(fb.db, "backups"), orderBy("at", "desc"), limit(20)));
    BACKUPS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    box.innerHTML = BACKUPS.map((b, i) => {
      const t = b.at && b.at.toDate ? b.at.toDate().toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
      return `<div class="bk"><div><b>${esc(t)}</b><div class="hint">${esc(b.by || "")} · ${esc(b.version || "")}${i === 0 ? " · terbaru" : ""}</div></div><button class="btn sm" data-bkrestore="${i}">Pulihkan</button></div>`;
    }).join("") || `<p class="hint">Belum ada cadangan otomatis. Cadangan pertama dibuat saat Anda klik Simpan.</p>`;
  } catch { box.innerHTML = `<p class="hint">Cadangan otomatis belum dapat dimuat. Periksa koneksi.</p>`; }
}
/* ====================== MODE GELAP ====================== */
const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
const sysDark = () => matchMedia("(prefers-color-scheme: dark)").matches;
function applyTheme() {
  const pref = LS.get("ai_theme"), dark = pref ? pref === "dark" : sysDark();
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  $("#btnTheme").innerHTML = dark ? SUN : MOON;
  $("#btnTheme").title = dark ? "Mode terang" : "Mode gelap";
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? "#141e3a" : "#1f3c88";
}
function enhanceFiles() {
  $$('input[type=file]').forEach(inp => {
    if (inp.closest(".filepick")) return;
    const lab = document.createElement("label"); lab.className = "filepick";
    inp.parentNode.insertBefore(lab, inp); lab.appendChild(inp);
    lab.insertAdjacentHTML("beforeend", `<span class="btn sm">Pilih file</span><span class="fname">Belum ada file dipilih</span>`);
    inp.addEventListener("change", () => { const f = inp.files && inp.files[0]; if (f) lab.querySelector(".fname").textContent = f.name; });
  });
}
function bindTheme() {
  applyTheme();
  $("#btnTheme").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme === "dark";
    LS.set("ai_theme", dark ? "light" : "dark"); applyTheme();
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!LS.get("ai_theme")) applyTheme(); });
}
function bindAdmin14() {
  $("#btnBkDown").addEventListener("click", downloadBackup);
  $("#bkFile").addEventListener("change", async e => { const f = e.target.files[0]; if (f) await restoreFromFile(f); e.target.value = ""; });
  $("#bkList").addEventListener("click", e => {
    const b = e.target.closest("[data-bkrestore]"); if (!b) return;
    const bk = BACKUPS[+b.dataset.bkrestore]; if (!bk) return;
    if (confirm("Muat pengaturan dari cadangan ini? Pengaturan baru berlaku setelah klik Simpan.")) { applySettingsBackup(bk.settings, bk.vehicles); toast("Cadangan dimuat. Klik Simpan untuk menerapkan.", "ok", 5000); }
  });
  $("#subtabs").addEventListener("click", e => { const b = e.target.closest("[data-sub]"); if (b) openAdmPane(b.dataset.sub); }, true);
  $("#admBack").addEventListener("click", () => closeAdmPane());
  const box = $("#adminBox");
  const ignore = t => t.closest('[data-pane="inbox"],[data-pane="acct"]') || ["vFilter"].includes(t.id);
  ["input", "change"].forEach(ev => box.addEventListener(ev, e => { if (!ignore(e.target)) setDirty(true); }));
  box.addEventListener("click", e => {
    if (e.target.closest("[data-addtier],[data-deltier],[data-cxdel],#btnAddCx,#btnCopyTier,#btnCopyText,#btnAddVeh,[data-vdel],#btnResetVeh,#btnHeroDel,#btnLogoDel")) setTimeout(() => setDirty(true), 0);
  });
  window.addEventListener("resize", updateSaveBar);
  $("#lgFile").addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    try { LOGO_IMG = await compressLogo(file); logoDirty = true; renderLogoAdmin(); renderHdrLogo(); setDirty(true); toast("Logo siap. Klik Simpan untuk menerapkan."); }
    catch (er) { toast(er.message, "err"); } finally { e.target.value = ""; }
  });
  $("#btnLogoDel").addEventListener("click", () => { LOGO_IMG = ""; logoDirty = true; renderLogoAdmin(); renderHdrLogo(); toast("Logo dihapus. Klik Simpan untuk menerapkan."); });
  $("#btnCheckUpd").addEventListener("click", async () => {
    if (!swReg) return toast("Pembaruan otomatis aktif setelah aplikasi dibuka dari alamat situsnya.");
    toast("Memeriksa pembaruan…");
    try { await swReg.update(); } catch {}
    setTimeout(() => { if (swReg.waiting || swReg.installing) showUpdate(swReg.waiting || swReg.installing); else toast("Aplikasi sudah versi terbaru (" + APP_VERSION + ").", "ok"); }, 1500);
  });
}
function bindV12() {
  [["#fFunc", "#fCover", "#extList", "ext_", () => recalc()], ["#qFunc", "#qCover", "#qExtList", "qext_", () => recalcQuick()]].forEach(([fs, cs, el, idp, fn]) =>
    $(fs).addEventListener("change", () => {
      if (renderCoverSelect($(cs), $(fs).value)) toast("TLO tidak tersedia untuk kendaraan komersial. Jaminan diganti ke Comprehensive.");
      renderExt(el, idp, $(fs).value); fn();
    }));
  document.addEventListener("submit", e => { const f = e.target.closest("form[data-ask]"); if (f) { e.preventDefault(); sendQuestion(f); } });
  document.addEventListener("click", async e => {
    const sc = e.target.closest("[data-scroll]"); if (sc) { const t = $(sc.dataset.scroll); t && t.scrollIntoView({ behavior: "smooth", block: "start" }); }
    const rf = e.target.closest("[data-rfunc]"); if (rf) { readTiers(); adminFunc = rf.dataset.rfunc; renderRateFunc(); }
    const tf = e.target.closest("[data-tfunc]"); if (tf) { readTexts(); textFunc = tf.dataset.tfunc; renderTextFunc(); }
    const of_ = e.target.closest("[data-ojkfill]");
    if (of_ && confirm(`Isi semua tabel rate ${funcLabel(adminFunc)} dengan tarif OJK Wilayah 1 ${of_.dataset.ojkfill === "1" ? "batas atas" : "batas bawah"}?`)) { readTiers(); fillOjk(+of_.dataset.ojkfill); toast("Tarif OJK diisi. Klik Simpan untuk menerapkan."); }
    if (e.target.closest("#btnCopyTier") && confirm(`Salin tabel rate Pribadi ke ${funcLabel(adminFunc)}?`)) {
      readTiers();
      Object.keys(AT()).forEach(k => AT()[k] = clone(S.tiersByFunc.PRIBADI[k]));
      Object.keys(S.flatByFunc[adminFunc]).forEach(k => FUNC_COVERS[adminFunc].forEach(cv => S.flatByFunc[adminFunc][k][cv] = S.flatByFunc.PRIBADI[k][cv])); renderRateFunc(); toast("Tabel disalin. Klik Simpan untuk menyimpan.");
    }
    if (e.target.closest("#btnCopyText") && confirm(`Salin teks polis Pribadi ke ${funcLabel(textFunc)}?`)) {
      S.textsByFunc[textFunc] = clone(S.textsByFunc.PRIBADI); renderTextFunc(); toast("Teks disalin. Klik Simpan untuk menyimpan.");
    }
    const rp_ = e.target.closest("[data-reply]"); if (rp_) setInboxStatus(rp_.dataset.reply, "dibalas");
    const mk = e.target.closest("[data-mark]"); if (mk) { const x = INBOX.find(i => i.id === mk.dataset.mark); if (x) setInboxStatus(x.id, x.status === "dibalas" ? "baru" : "dibalas"); }
    const dl = e.target.closest("[data-idel]"); if (dl && confirm("Hapus pesan ini?")) { try { await fb.F.deleteDoc(fb.F.doc(fb.db, "inbox", dl.dataset.idel)); } catch { toast("Gagal menghapus. Coba lagi.", "err"); } }
  });
  $("#btnAddCx").addEventListener("click", () => {
    readCx(); S.customExt.push({ id: Math.random().toString(36).slice(2, 9), label: "", rate: 0, desc: "", clause: "", funcs: { PRIBADI: true, DINAS: true, KOMERSIAL: true }, active: true });
    renderCx(); const last = $$("#cxList [data-cx]").pop(); last && last.querySelector('[data-cf="label"]').focus();
  });
  $("#cxList").addEventListener("click", e => {
    const b = e.target.closest("[data-cxdel]"); if (!b) return;
    readCx(); const x = S.customExt[+b.dataset.cxdel];
    if (confirm(`Hapus perluasan "${x.label || "tanpa nama"}"?`)) { S.customExt.splice(+b.dataset.cxdel, 1); renderCx(); toast("Dihapus. Klik Simpan untuk menerapkan."); }
  });
  $("#inboxFilter").addEventListener("change", renderInbox);
  $("#inboxSearch").addEventListener("input", renderInbox);
  $("#hFile").addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    try { HERO_IMG = await compressImage(file); heroDirty = true; $("#hStyle").value = "photo"; renderHeroAdmin(); toast("Foto siap. Klik Simpan untuk menerapkan."); }
    catch (er) { toast(er.message, "err"); } finally { e.target.value = ""; }
  });
  $("#btnHeroDel").addEventListener("click", () => { HERO_IMG = ""; heroDirty = true; $("#hStyle").value = "pattern"; renderHeroAdmin(); toast("Foto dihapus. Klik Simpan untuk menerapkan."); });
}

/* ====================== START ====================== */
renderYearSelect($("#fYear")); renderYearSelect($("#qYear")); setDefaultDates();
wantedTab = new URLSearchParams(location.search).get("tab") || LS.get("ai_tab") || "quick";
bindTheme(); enhanceFiles(); bind(); bindV12(); bindAdmin14(); applySettingsToUI(); restoreDrafts(); applyTabs(); hideSplash();
setTimeout(() => (window.requestIdleCallback || setTimeout)(() => loadPdfLibs().catch(() => {})), 2500);
renderRenew();
initPwa(); initFirebase();
