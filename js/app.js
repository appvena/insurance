/* Vehicle Protection — v1.2 · Copyright © SRISP 2026 */
import { firebaseConfig, FB_VER, APP_VERSION, COPYRIGHT } from "./config.js";
import { EXT_DEFS, COVER_LABEL, DEFAULT_SETTINGS, DEFAULT_VEHICLES, FUNCS, FUNC_COVERS } from "./data.js";

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
  s.texts = { disclaimer: s.texts.disclaimer };
  delete s.tiers; delete s.updatedAt; delete s.updatedBy;
  return s;
}
let S = normalizeSettings(LS.get("ai_settings"));
const funcLabel = k => (FUNCS.find(f => f.key === k) || { label: k || "-" }).label;
const TX = k => S.textsByFunc[k] || S.textsByFunc.PRIBADI;
let VEH = Array.isArray(LS.get("ai_vehicles")) ? LS.get("ai_vehicles") : clone(DEFAULT_VEHICLES);
let fb = null, user = null, last = null, lastQuick = null;
let currentId = null, currentRef = null, cloudHist = null;
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
  const { rate: baseRate } = tierRate(ft[cover], si);
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
  }
  if (inp.tjh > 0) add("Tanggung Jawab Hukum Pihak III", inp.tjh, +S.tjhRate, "liab");
  if (inp.paD > 0) add("Kecelakaan Diri (PA) Pengemudi", inp.paD, +S.paDriverRate, "liab");
  if (inp.paP > 0) {
    const n = S.paPassPerSeat ? Math.max(1, (inp.seats || 1) - 1) : 1;
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
function renderExt(container, idp) {
  const box = $(container);
  const prev = Object.fromEntries(EXT_DEFS.map(e => [e.key, document.getElementById(idp + e.key)?.checked ?? false]));
  box.innerHTML = EXT_DEFS.filter(e => D().ext[e.key] !== false).map(e => `
    <label class="chk"><input type="checkbox" id="${idp}${e.key}" ${prev[e.key] ? "checked" : ""}>
      <span class="t">${esc(e.label)}</span><span class="r">${pct(S.ext[e.key])}</span></label>`).join("")
    || `<p class="hint">Tidak ada perluasan yang ditampilkan.</p>`;
}
function readExt(idp) { return Object.fromEntries(EXT_DEFS.map(e => [e.key, D().ext[e.key] !== false && !!document.getElementById(idp + e.key)?.checked])); }
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
  out.push(`Fungsi: ${funcLabel(inp.func)}`, `Jaminan: ${COVER_LABEL[inp.cover]}`, `Harga Pertanggungan: ${rp(r.si)}`, "");
  r.lines.forEach(l => out.push(`• ${l.label}: ${rp(l.prem)}`));
  if (r.discAmt) out.push(`• Diskon ${pct(r.disc)}: -${rp(r.discAmt)}`);
  out.push(`Total Premi: ${rp(r.net)}`, `Biaya Polis + Materai: ${rp(r.policyCost + r.stampDuty)}`, `*Total Bayar: ${rp(r.total)}*`);
  const k = S.contact; if (k.name || k.wa) out.push("", `Hubungi: ${[k.name, k.wa && "WA " + k.wa].filter(Boolean).join(" · ")}`);
  return out.join("\n");
}

/* ====================== HITUNG CEPAT ====================== */
function readQuick() {
  return {
    func: $("#qFunc").value, cover: $("#qCover").value, price: parseNum($("#qPrice").value), acc: parseNum($("#qAcc").value),
    year: +$("#qYear").value, start: "", end: "", seats: +$("#qSeats").value || 0,
    ext: readExt("qext_"), tjh: liabVal("tjh", "#qTjh"), paD: liabVal("paD", "#qPaD"), paP: liabVal("paP", "#qPaP"),
    disc: +$("#qDisc").value || 0
  };
}
function recalcQuick() { const inp = readQuick(); const r = calculate(S, inp); lastQuick = { inp, r }; renderResult("q", r); saveDrafts(); }
function setQuick(q) {
  setSel($("#qFunc"), q.func || "PRIBADI"); renderCoverSelect($("#qCover"), $("#qFunc").value);
  setSel($("#qCover"), q.cover); setSel($("#qYear"), q.year);
  $("#qPrice").value = q.price ? fmt(q.price) : ""; $("#qAcc").value = q.acc ? fmt(q.acc) : "";
  $("#qSeats").value = q.seats || 7;
  EXT_DEFS.forEach(e => { const el = document.getElementById("qext_" + e.key); if (el) el.checked = !!(q.ext || {})[e.key]; });
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
      $("#fType").value = v.type;
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
    func: $("#fFunc").value, cond: $("#fCond").value,
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
  setSel($("#fFunc"), inp.func); setSel($("#fCond"), inp.cond); renderCoverSelect($("#fCover"), $("#fFunc").value);
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
  EXT_DEFS.forEach(e => { const el = document.getElementById("ext_" + e.key); if (el) el.checked = !!(inp.ext || {})[e.key]; });
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
  $("#hdrBrand").textContent = S.company.brand || "ALEX INSURANCE";
  $("#fRegion").value = S.region;
  const discOn = +S.maxDiscount > 0;
  $("#discWrap").hidden = !discOn; $("#qDiscWrap").hidden = !discOn;
  $$(".discMax").forEach(e => e.textContent = S.maxDiscount);
  $("#qSeatsWrap").hidden = !(S.paPassPerSeat && D().paP);
  renderCoverSelect($("#fCover"), $("#fFunc").value); renderCoverSelect($("#qCover"), $("#qFunc").value);
  renderExt("#extList", "ext_"); renderExt("#qExtList", "qext_");
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
  const btn = f.querySelector("button[type=submit]"); btn.disabled = true; btn.textContent = "Mengirim…";
  try {
    await fb.F.addDoc(fb.F.collection(fb.db, "inbox"), { name: name.slice(0, 80), phone: phone.slice(0, 20), message: message.slice(0, 1000), status: "baru", createdAt: fb.F.serverTimestamp() });
    LS.set("ai_ask_last", Date.now()); f.reset();
    const ok = f.querySelector(".ask-ok"); ok.hidden = false;
    ok.textContent = `Terima kasih, ${name}. Pertanyaan Anda sudah kami terima dan akan dibalas melalui WhatsApp ke ${phone}.`;
    toast("Pertanyaan terkirim.", "ok");
  } catch { toast("Pertanyaan gagal dikirim. Coba lagi.", "err"); }
  finally { btn.disabled = false; btn.textContent = "Kirim Pertanyaan"; }
}

/* ====================== INBOX ADMIN ====================== */
let INBOX = [], inboxUnsub = null, inboxFirst = true;
function startInbox() {
  stopInbox(); if (!fb || !user) return;
  const { collection, query, orderBy, limit, onSnapshot } = fb.F; inboxFirst = true;
  inboxUnsub = onSnapshot(query(collection(fb.db, "inbox"), orderBy("createdAt", "desc"), limit(300)), snap => {
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
const HKEY = "ai_history";
const localHist = () => LS.get(HKEY) || [];
const setLocalHist = a => LS.set(HKEY, a.slice(0, 300));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function quoteRef() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return `${S.company.prefix || "QS"}/${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}/${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function ensureId() { if (!currentId) { currentId = newId(); currentRef = quoteRef(); } }
function saveRecord(silent = false) {
  ensureId();
  const rec = { id: currentId, ref: currentRef, savedAt: new Date().toISOString(), inp: clone(last.inp),
    total: last.r.total, gross: last.r.gross, si: last.r.si, by: user?.email || "" };
  const arr = localHist().filter(x => x.id !== rec.id); arr.unshift(rec); setLocalHist(arr);
  if (cloudHist) { cloudHist = cloudHist.filter(x => x.id !== rec.id); cloudHist.unshift(rec); }
  if (fb && user) fb.F.setDoc(fb.F.doc(fb.db, "quotes", rec.id), rec).catch(() => {});
  updateSaveState();
  if (!silent) toast("Perhitungan tersimpan ke riwayat.", "ok");
  if (!$("#tab-hist").hidden) renderHist();
  return rec;
}
async function loadHistory() {
  if (fb && user) {
    try {
      const { collection, query, orderBy, limit, getDocs } = fb.F;
      const snap = await getDocs(query(collection(fb.db, "quotes"), orderBy("savedAt", "desc"), limit(300)));
      cloudHist = snap.docs.map(d => d.data());
    } catch { cloudHist = null; }
  } else cloudHist = null;
  renderHist();
}
function histItems() {
  const map = new Map();
  [...(cloudHist || []), ...localHist()].forEach(r => { const o = map.get(r.id); if (!o || o.savedAt < r.savedAt) map.set(r.id, r); });
  return [...map.values()].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
function renderHist() {
  const q = $("#hFilter").value.trim().toLowerCase();
  const all = histItems();
  const rows = all.filter(r => !q || `${r.inp.name} ${r.inp.plate} ${r.ref} ${r.inp.brand} ${r.inp.model}`.toLowerCase().includes(q));
  $("#hCount").textContent = `${all.length} data`;
  $("#hSrc").textContent = cloudHist ? "Tersimpan dan tersinkron di semua perangkat Anda" : "Tersimpan di perangkat ini";
  $("#hList").innerHTML = rows.map(r => {
    const d = new Date(r.savedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    const veh = `${r.inp.brand || ""} ${r.inp.model || ""}`.trim();
    return `<div class="hitem"><div class="hmain"><b>${esc(r.inp.name || "-")}</b>
      <div class="hint">${esc(veh || "-")} (${esc(r.inp.year)})${r.inp.plate ? " · " + esc(r.inp.plate) : ""}</div>
      <div class="hint">${esc(r.ref)} · ${esc(d)}</div></div>
      <div class="hright"><b>${rp(r.total)}</b><div class="hact">
        <button class="btn sm" data-hopen="${esc(r.id)}">Buka</button>
        <button class="btn sm" data-hpdf="${esc(r.id)}">PDF</button>
        <button class="btn sm danger" data-hdel="${esc(r.id)}">Hapus</button></div></div></div>`;
  }).join("") || `<div class="empty">${all.length ? "Tidak ditemukan." : "Belum ada perhitungan tersimpan.<br>Simpan dari menu Penawaran."}</div>`;
}
function openRecord(id) {
  const r = histItems().find(x => x.id === id); if (!r) return null;
  showTab("calc"); setInput(r.inp); currentId = r.id; currentRef = r.ref; updateSaveState(); return r;
}
async function deleteRecord(id) {
  const r = histItems().find(x => x.id === id); if (!r || !confirm(`Hapus perhitungan ${r.inp.name || r.ref}?`)) return;
  setLocalHist(localHist().filter(x => x.id !== id));
  if (cloudHist) cloudHist = cloudHist.filter(x => x.id !== id);
  if (fb && user) { try { await fb.F.deleteDoc(fb.F.doc(fb.db, "quotes", id)); } catch { toast("Gagal menghapus. Coba lagi.", "err"); } }
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
function buildPdf(ref) {
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error("Library PDF belum termuat. Sambungkan internet sekali agar tersimpan untuk offline.");
  const { inp, r } = last;
  const { jsPDF } = window.jspdf; const d = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, M = 14, NAVY = [11, 42, 91], AMBER = [245, 166, 35];
  const c = S.company, showF = D().pdfFormula;

  d.setFillColor(...NAVY); d.rect(0, 0, W, 26, "F");
  d.setFillColor(...AMBER); d.roundedRect(M, 6, 14, 14, 2, 2, "F");
  d.setTextColor(...NAVY); d.setFont("helvetica", "bold"); d.setFontSize(10);
  d.text((c.logo || "AI").slice(0, 3), M + 7, 14.6, { align: "center" });
  d.setTextColor(255); d.setFontSize(15); d.text(c.brand || "", M + 18, 12);
  d.setFont("helvetica", "normal"); d.setFontSize(8.5);
  d.text([c.name, c.address].filter(Boolean).join("  ·  "), M + 18, 17);
  d.text([c.phone && "Telp/WA " + c.phone, c.email].filter(Boolean).join("  ·  "), M + 18, 21.5);
  const K = S.contact;
  if (K.name || K.wa) {
    d.setFont("helvetica", "bold"); d.setFontSize(8.5); d.text("HUBUNGI", W - M, 11, { align: "right" });
    d.setFont("helvetica", "normal"); d.setFontSize(9.5);
    if (K.name) d.text(K.name, W - M, 16, { align: "right" });
    if (K.wa) d.text("WA " + K.wa, W - M, 21, { align: "right" });
  }

  d.setTextColor(20); d.setFont("helvetica", "bold"); d.setFontSize(13);
  d.text("QUOTATION SLIP", W / 2, 35, { align: "center" });
  d.setFontSize(9); d.setFont("helvetica", "normal");
  d.text("PENAWARAN ASURANSI KENDARAAN BERMOTOR", W / 2, 40, { align: "center" });

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
  ], 45);

  let y = section("DATA KENDARAAN", next(2));
  kv([
    row("MEREK / MODEL", `${inp.brand} ${inp.model}`.trim().toUpperCase()),
    row("JENIS", inp.vtype.toUpperCase()),
    row("TAHUN PEMBUATAN", String(inp.year)),
    row("NO. POLISI", inp.plate), row("NO. RANGKA", inp.chassis), row("NO. MESIN", inp.engine),
    row("WARNA", inp.color), row("JUMLAH KURSI", inp.seats ? String(inp.seats) : "-"),
    row("FUNGSI", `${inp.func} - ${inp.cond}`),
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
  kv(lines(TX(inp.func).clauses).map((t, i) => ["", `${i + 1}.`, t]), y);
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
    d.setPage(i); d.setFontSize(7.5); d.setTextColor(120); d.setFont("helvetica", "normal");
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
function doPdf() { const pdf = prepare(); if (!pdf) return; download(pdf.blob, pdf.name); toast("PDF berhasil dibuat.", "ok"); }
async function doWa() {
  const pdf = prepare(); if (!pdf) return;
  const text = summaryText(last.inp, last.r, "PENAWARAN ASURANSI KENDARAAN") + `\n\nNo. Ref: ${pdf.ref}\nRincian lengkap pada PDF terlampir.`;
  const file = new File([pdf.blob], pdf.name, { type: "application/pdf" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: pdf.name, text }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  const win = window.open(`https://wa.me/${normPhone(last.inp.phone)}?text=${encodeURIComponent(text)}`, "_blank");
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
    fb = { auth: A.getAuth(app), db: F.getFirestore(app), A, F };
    A.onAuthStateChanged(fb.auth, u => {
      user = u; authResolved = true;
      if (u) LS.set("ai_authed", u.email); else { try { localStorage.removeItem("ai_authed"); } catch {} }
      applyTabs(); renderAdminGate();
      if (!$("#tab-hist").hidden) loadHistory(); else cloudHist = null;
      if (u) { syncLocalToCloud(); startInbox(); } else stopInbox();
    });
    await loadRemote();
    setNet(true, "");
  } catch (e) {
    setNet(false, navigator.onLine ? "" : "Offline"); renderAdminGate();
  }
}
async function loadRemote() {
  const { doc, getDoc } = fb.F;
  const [s, v, hr] = await Promise.all([getDoc(doc(fb.db, "config", "settings")), getDoc(doc(fb.db, "config", "vehicles")), getDoc(doc(fb.db, "config", "hero")).catch(() => null)]);
  if (s.exists()) { S = normalizeSettings(s.data()); LS.set("ai_settings", S); }
  if (hr && hr.exists() && !heroDirty) { HERO_IMG = hr.data().image || ""; LS.set("ai_hero", HERO_IMG); }
  if (v.exists() && Array.isArray(v.data().list) && v.data().list.length) { VEH = v.data().list; LS.set("ai_vehicles", VEH); }
  applySettingsToUI();
}
async function syncLocalToCloud() {
  const items = localHist(); if (!items.length || !fb || !user) return;
  try { await Promise.all(items.map(r => fb.F.setDoc(fb.F.doc(fb.db, "quotes", r.id), r))); } catch {}
}

/* ====================== ADMIN ====================== */
function renderAdminGate() {
  const showAdmin = !$("#tab-admin").hidden;
  $("#fbDown").hidden = !!fb || !showAdmin;
  $("#loginBox").hidden = !fb || !!user;
  $("#adminBox").hidden = !fb || !user;
  if (fb && user && showAdmin) { $("#adminWho").textContent = "Masuk sebagai " + user.email; if (!fillAdmin.done) { fillAdmin(); fillAdmin.done = true; } }
  if (!user) fillAdmin.done = false;
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
  tierRows("comprehensive"); tierRows("tlo");
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
function renderHeroAdmin() {
  $("#hPrevWrap").hidden = !HERO_IMG; if (HERO_IMG) $("#hPreview").src = HERO_IMG;
}
function fillAdmin() {
  renderRateFunc(); renderTextFunc();
  $("#aAgeOn").value = S.ageLoading.enabled ? "1" : "0"; $("#aAgeAfter").value = S.ageLoading.afterYears; $("#aAgePct").value = S.ageLoading.pctPerYear;
  $("#extRates").innerHTML = EXT_DEFS.map(e => `<div class="f"><label>${esc(e.label)} (%)</label><input type="number" step="0.001" min="0" data-ext="${e.key}" value="${S.ext[e.key]}"></div>`).join("");
  $("#aTjhRate").value = S.tjhRate; $("#aPaDRate").value = S.paDriverRate; $("#aPaPRate").value = S.paPassRate;
  $("#aTjhLimits").value = S.tjhLimits.map(n => n / 1e6).join(", "); $("#aPaLimits").value = S.paLimits.map(n => n / 1e6).join(", ");
  $("#aPaPerSeat").value = S.paPassPerSeat ? "1" : "0";
  $("#aPolicy").value = S.policyCost; $("#aStamp").value = S.stampDuty; $("#aMaxDisc").value = S.maxDiscount;
  $("#aRegion").value = S.region; $("#aValid").value = S.validityDays; $("#aPayTerm").value = S.paymentTerm;
  $("#dispExt").innerHTML = EXT_DEFS.map(e => `<label class="chk"><input type="checkbox" data-dispext="${e.key}" ${D().ext[e.key] !== false ? "checked" : ""}><span class="t">Perluasan: ${esc(e.label)}</span></label>`).join("");
  $$("[data-disp]").forEach(i => i.checked = !!D()[i.dataset.disp]);
  $("#aDisc").value = S.texts.disclaimer;
  $("#kName").value = S.contact.name; $("#kWa").value = S.contact.wa;
  $("#hTitle").value = S.hero.title; $("#hSub").value = S.hero.subtitle; $("#hStyle").value = S.hero.style; renderHeroAdmin();
  const c = S.company;
  $("#cBrand").value = c.brand; $("#cLogo").value = c.logo; $("#cName").value = c.name; $("#cAddr").value = c.address;
  $("#cPhone").value = c.phone; $("#cEmail").value = c.email; $("#cCity").value = c.city; $("#cSigner").value = c.signer; $("#cPrefix").value = c.prefix;
  renderVeh();
}
function readTiers() {
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
  $$("[data-dispext]").forEach(i => S.display.ext[i.dataset.dispext] = i.checked);
  readTexts(); S.texts = { disclaimer: $("#aDisc").value.trim() };
  S.contact = { name: $("#kName").value.trim(), wa: $("#kWa").value.trim() };
  S.hero = { style: $("#hStyle").value, title: $("#hTitle").value.trim() || DEFAULT_SETTINGS.hero.title, subtitle: $("#hSub").value.trim() || DEFAULT_SETTINGS.hero.subtitle };
  S.company = { brand: $("#cBrand").value.trim(), logo: $("#cLogo").value.trim().toUpperCase(), name: $("#cName").value.trim(), address: $("#cAddr").value.trim(),
    phone: $("#cPhone").value.trim(), email: $("#cEmail").value.trim(), city: $("#cCity").value.trim(), signer: $("#cSigner").value.trim(), prefix: $("#cPrefix").value.trim() || "QS" };
}
async function saveAll() {
  try { collectAdmin(); } catch (e) { return toast(e.message, "err"); }
  const btn = $("#btnSave"); btn.disabled = true; btn.textContent = "Menyimpan…";
  try {
    const { doc, setDoc, serverTimestamp } = fb.F;
    const meta = { updatedAt: serverTimestamp(), updatedBy: user.email };
    await setDoc(doc(fb.db, "config", "settings"), { ...clone(S), ...meta });
    await setDoc(doc(fb.db, "config", "vehicles"), { list: VEH, ...meta });
    if (heroDirty) { await setDoc(doc(fb.db, "config", "hero"), { image: HERO_IMG, ...meta }); heroDirty = false; LS.set("ai_hero", HERO_IMG); }
    LS.set("ai_settings", S); LS.set("ai_vehicles", VEH);
    applySettingsToUI(); fillAdmin(); showTab("admin"); toast("Pengaturan tersimpan.", "ok");
  } catch (e) {
    toast(e.code === "permission-denied" ? "Akses ditolak. Akun ini tidak memiliki izin admin." : "Gagal menyimpan. Periksa koneksi lalu coba lagi.", "err", 6000);
  } finally { btn.disabled = false; btn.textContent = "💾 Simpan Pengaturan"; }
}
function renderVeh() {
  const q = $("#vFilter").value.trim().toLowerCase();
  const rows = VEH.map((v, i) => ({ ...v, i })).filter(v => !q || `${v.brand} ${v.type} ${v.model}`.toLowerCase().includes(q))
    .sort((a, b) => a.brand.localeCompare(b.brand) || a.type.localeCompare(b.type) || a.model.localeCompare(b.model));
  $("#vCount").textContent = `${VEH.length} unit`;
  $("#vBody").innerHTML = rows.map(v => `<tr>
    <td>${esc(v.brand)}</td><td>${esc(v.type)}</td><td>${esc(v.model)}</td>
    <td><input type="number" min="0" data-vprice="${v.i}" value="${v.price || ""}" placeholder="—" style="width:140px"></td>
    <td><button class="btn danger sm" data-vdel="${v.i}">✕</button></td></tr>`).join("") || `<tr><td colspan="5" class="hint">Tidak ditemukan.</td></tr>`;
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
let deferredPrompt = null, swWaiting = null, reloading = false;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
function initPwa() {
  if (isStandalone()) document.documentElement.classList.add("standalone");
  if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
    navigator.serviceWorker.register("sw.js").then(reg => {
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) showUpdate(w); });
      });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
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
  window.addEventListener("online", () => { if (fb) { setNet(true, ""); loadRemote().catch(() => {}); } else initFirebase(); });
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
    setSel($("#fFunc"), q.func); renderCoverSelect($("#fCover"), $("#fFunc").value); setSel($("#fCover"), q.cover); setSel($("#fYear"), q.year);
    $("#fPrice").value = q.price ? fmt(q.price) : ""; $("#fAcc").value = q.acc ? fmt(q.acc) : "";
    if (S.paPassPerSeat) $("#fSeats").value = q.seats || 7;
    EXT_DEFS.forEach(e => { const el = document.getElementById("ext_" + e.key); if (el) el.checked = q.ext[e.key]; });
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

  // Admin
  $("#btnLogin").addEventListener("click", async () => {
    const b = $("#btnLogin"); b.disabled = true;
    try { await fb.A.signInWithEmailAndPassword(fb.auth, $("#lEmail").value.trim(), $("#lPass").value); $("#lPass").value = ""; toast("Berhasil masuk.", "ok"); }
    catch (e) { toast(authMsg(e), "err"); } finally { b.disabled = false; }
  });
  $("#lPass").addEventListener("keydown", e => { if (e.key === "Enter") $("#btnLogin").click(); });
  $("#lnkForgot").addEventListener("click", async e => {
    e.preventDefault(); const em = $("#lEmail").value.trim(); if (!em) return toast("Isi email dulu.", "err");
    try { await fb.A.sendPasswordResetEmail(fb.auth, em); toast("Link reset password dikirim ke " + em, "ok", 5000); } catch (er) { toast(authMsg(er), "err"); }
  });
  $("#btnLogout").addEventListener("click", () => fb.A.signOut(fb.auth));
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
  $("#vFilter").addEventListener("input", renderVeh);
  $("#btnAddVeh").addEventListener("click", () => {
    const v = { brand: $("#vBrand").value.trim(), type: $("#vType").value.trim() || "Lainnya", model: $("#vModel").value.trim(), price: +$("#vPrice").value || 0 };
    if (!v.brand || !v.model) return toast("Merek dan model wajib diisi.", "err");
    if (VEH.some(x => x.brand.toLowerCase() === v.brand.toLowerCase() && x.model.toLowerCase() === v.model.toLowerCase())) return toast("Kendaraan sudah ada.", "err");
    VEH.push(v); $("#vModel").value = ""; $("#vPrice").value = ""; renderVeh(); renderBrands();
    toast("Ditambahkan. Klik Simpan Pengaturan untuk menyimpan.", "ok");
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

function bindV12() {
  [["#fFunc", "#fCover", () => recalc()], ["#qFunc", "#qCover", () => recalcQuick()]].forEach(([fs, cs, fn]) =>
    $(fs).addEventListener("change", () => { if (renderCoverSelect($(cs), $(fs).value)) toast("TLO tidak tersedia untuk kendaraan komersial. Jaminan diganti ke Comprehensive."); fn(); }));
  document.addEventListener("submit", e => { const f = e.target.closest("form[data-ask]"); if (f) { e.preventDefault(); sendQuestion(f); } });
  document.addEventListener("click", async e => {
    const sc = e.target.closest("[data-scroll]"); if (sc) { const t = $(sc.dataset.scroll); t && t.scrollIntoView({ behavior: "smooth", block: "start" }); }
    const rf = e.target.closest("[data-rfunc]"); if (rf) { readTiers(); adminFunc = rf.dataset.rfunc; renderRateFunc(); }
    const tf = e.target.closest("[data-tfunc]"); if (tf) { readTexts(); textFunc = tf.dataset.tfunc; renderTextFunc(); }
    if (e.target.closest("#btnCopyTier") && confirm(`Salin tabel rate Pribadi ke ${funcLabel(adminFunc)}?`)) {
      Object.keys(AT()).forEach(k => AT()[k] = clone(S.tiersByFunc.PRIBADI[k])); renderRateFunc(); toast("Tabel disalin. Klik Simpan Pengaturan untuk menyimpan.");
    }
    if (e.target.closest("#btnCopyText") && confirm(`Salin teks polis Pribadi ke ${funcLabel(textFunc)}?`)) {
      S.textsByFunc[textFunc] = clone(S.textsByFunc.PRIBADI); renderTextFunc(); toast("Teks disalin. Klik Simpan Pengaturan untuk menyimpan.");
    }
    const rp_ = e.target.closest("[data-reply]"); if (rp_) setInboxStatus(rp_.dataset.reply, "dibalas");
    const mk = e.target.closest("[data-mark]"); if (mk) { const x = INBOX.find(i => i.id === mk.dataset.mark); if (x) setInboxStatus(x.id, x.status === "dibalas" ? "baru" : "dibalas"); }
    const dl = e.target.closest("[data-idel]"); if (dl && confirm("Hapus pesan ini?")) { try { await fb.F.deleteDoc(fb.F.doc(fb.db, "inbox", dl.dataset.idel)); } catch { toast("Gagal menghapus. Coba lagi.", "err"); } }
  });
  $("#inboxFilter").addEventListener("change", renderInbox);
  $("#inboxSearch").addEventListener("input", renderInbox);
  $("#hFile").addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    try { HERO_IMG = await compressImage(file); heroDirty = true; $("#hStyle").value = "photo"; renderHeroAdmin(); toast("Foto siap. Klik Simpan Pengaturan untuk menerapkan."); }
    catch (er) { toast(er.message, "err"); } finally { e.target.value = ""; }
  });
  $("#btnHeroDel").addEventListener("click", () => { HERO_IMG = ""; heroDirty = true; $("#hStyle").value = "pattern"; renderHeroAdmin(); toast("Foto dihapus. Klik Simpan Pengaturan untuk menerapkan."); });
}

/* ====================== START ====================== */
renderYearSelect($("#fYear")); renderYearSelect($("#qYear")); setDefaultDates();
wantedTab = new URLSearchParams(location.search).get("tab") || LS.get("ai_tab") || "quick";
bind(); bindV12(); applySettingsToUI(); restoreDrafts(); applyTabs();
initPwa(); initFirebase();
