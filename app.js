/* SKO Marketing Calendar. Shared team calendar: content, LIVEs, email, promos,
   and paid campaigns (launches and budget changes land on the calendar; what is
   running now is listed under the month). Data lives behind the team passcode
   at jackmorello.com/.netlify/functions/sko-cal. */
(() => {
  "use strict";

  const API = "https://jackmorello.com/.netlify/functions/sko-cal";
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has("local");
  const POLL_MS = 25000;

  // ---------- reference data ----------
  const TYPES = [
    { id: "post", label: "Content", dot: "#173384" },
    { id: "live", label: "LIVE", dot: "#0130C0" },
    { id: "email", label: "Email & SMS", dot: "#88A9E3" },
    { id: "promo", label: "Promo / drop", dot: "#0148FE" },
    { id: "other", label: "Other", dot: "#b3b9cf" },
  ];
  // Where content goes. `code` is what the calendar chip shows.
  const CHANNELS = [
    { id: "TikTok", code: "TT" }, { id: "Instagram", code: "IG" }, { id: "YouTube", code: "YT" },
    { id: "Facebook", code: "FB" }, { id: "X", code: "X" }, { id: "Email", code: "Email" },
    { id: "SMS", code: "SMS" }, { id: "Site", code: "Site" }, { id: "Other", code: "Other" },
  ];
  const CODE = Object.fromEntries(CHANNELS.map((c) => [c.id, c.code]));
  const ACCOUNTS = ["@skopeps", "@skocompound", "Ethan", "Andersen", "Hanna", "Dennis"];
  const chansOf = (e) => (Array.isArray(e.channels) && e.channels.length ? e.channels : e.channel ? [e.channel] : ["Other"]);
  const STATUSES = [
    { id: "idea", label: "Idea" },
    { id: "progress", label: "In progress" },
    { id: "scheduled", label: "Scheduled" },
    { id: "done", label: "Done" },
  ];
  const PLATFORMS = ["TikTok", "Meta", "Google", "OpenAI", "Taboola", "Snapchat", "Reddit", "X", "Other"];
  const LIVE_ACCOUNTS = ["@skopeps", "Ethan", "Andersen", "Other creator"];
  const DURATIONS = [30, 60, 90, 120, 150, 180, 240];

  // The 30-minute block. Minutes are offsets from the start of the block.
  const BEATS = [
    { s: 0, e: 2, title: "Open and reset", body: "Say hi to people in chat by name. Who you are, what's on the table this block. Pin the product. Ask one question chat can answer in a word.", say: "\"We're SKO Compounds. This half hour it's [compound]. Drop what you're researching right now.\"" },
    { s: 2, e: 8, title: "Feature", body: "One compound on camera. Vial in hand, read the label out loud: name, mass, 99% purity. Put its certificate on screen. Say when an order placed now ships.", say: "\"Every batch has its certificate on the product page. Order now and it ships within 24 hours.\"" },
    { s: 8, e: 12, title: "Receipts", key: true, body: "Read one real comment, the harsher the better. Agree with the part that's funny, then prove the part that matters on camera: the certificate, the batch number, a packed box, the shipping label.", say: "\"Fair. The table does wobble. The purity doesn't. Here's the certificate.\"" },
    { s: 12, e: 15, title: "The deal", key: true, body: "Say the live code once, slowly, and hold it up on a card. What it covers and when it ends. Pin the link. Thank orders as they land, without reading out anyone's name, city or order." },
    { s: 15, e: 17, title: "Reset for new people", body: "Twenty seconds for everyone who just joined: who you are, what's pinned, the code. Then move on." },
    { s: 17, e: 23, title: "Second feature", body: "The compound people most often order with the first one, or its bundle. Pack a real order on camera: box, label, tape, into the bin." },
    { s: 23, e: 27, title: "Can't answer that", body: "Read questions from comments and DMs. Anything asking for results, dosing or \"will it help my...\" gets an honest no, then what you can say: purity, mass, and when it ships. The no is the bit. Never wink.", say: "\"I can't tell you that. I can tell you it's 99% pure, it's 10 milligrams, and it ships within a day.\"" },
    { s: 27, e: 30, title: "Close the block", key: true, body: "Last call on the code. Say what's coming next block so people stay. Thank the regulars who caught something. Ask for the follow and the share." },
  ];
  const ROTATION = [
    { name: "Best sellers", note: "Open on the top seller; the second feature is its bundle." },
    { name: "Restock and new", note: "Whatever just came back or just landed. Show that batch's certificate." },
    { name: "Bundles and pairs", note: "Both features are bundles; pack a bundle order on camera." },
    { name: "Receipts and questions", note: "Stretch Receipts and Can't answer that; this is the block regulars stay for." },
  ];
  const SAY = [
    "Research use only.",
    "99% purity and 8× tested. Those are the testing claims; don't add to them.",
    "Every batch's certificate is on the product page.",
    "The 24-hour shipping guarantee.",
    "Over 40,000 orders shipped.",
    "Label names only: SKO-3 RT, SKO-TRZ.",
  ];
  const NEVER = [
    "Results, outcomes, before-and-afters, or what a compound \"does\".",
    "Dosing, mixing for use, injecting, or anything about human use.",
    "Weight-loss words: weight, fat, appetite, GLP, or the generic names behind SKO-3 RT and SKO-TRZ.",
    "A customer's name, city or order.",
    "Any lab result that isn't on screen, or any testing claim beyond 8× tested.",
    "Loyalty perks that aren't live yet.",
  ];

  // ---------- small helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const todayStr = () => ymd(new Date());
  const fmtDay = (s, o = { weekday: "short", month: "short", day: "numeric" }) => (s ? parseYmd(s).toLocaleDateString("en-US", o) : "");
  const fmtShort = (s) => fmtDay(s, { month: "short", day: "numeric" });
  const money = (n) => (n === "" || n == null || isNaN(n) ? "—" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }));
  const per = (c) => (c.budgetType === "lifetime" ? " total" : "/day");
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
  const addMin = (hhmm, m) => {
    if (!hhmm) return null;
    const [h, mi] = hhmm.split(":").map(Number);
    const t = h * 60 + mi + m;
    const hh = Math.floor(((t % 1440) + 1440) % 1440 / 60), mm = ((t % 60) + 60) % 60;
    const ap = hh >= 12 ? "pm" : "am", h12 = hh % 12 || 12;
    return `${h12}:${pad(mm)}${ap}`;
  };
  const clock = (hhmm) => addMin(hhmm, 0) || "";
  const relTime = (m) => `${Math.floor(m / 60)}:${pad(m % 60)}`;
  const host = (u) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "") + x.pathname).replace(/\/$/, ""); } catch { return u; } };

  let toastT;
  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 3200);
  }

  // ---------- state ----------
  const now = new Date();
  const S = {
    entries: [], campaigns: [],
    month: new Date(now.getFullYear(), now.getMonth(), 1),
    off: new Set(LS.get("skocal-off", [])),
    name: LS.get("skocal-name", ""), pass: LS.get("skocal-pass", ""),
    synced: null, failing: false, drawerDate: null,
  };

  // ---------- storage ----------
  const CHUNK = 4 * 1024 * 1024;
  const MAX_FILE = 1024 * 1024 * 1024;
  const LOCAL_FILES = new Map();
  const store = {
    async load() {
      if (LOCAL) return LS.get("skocal-local", { entries: [], campaigns: [] });
      const r = await fetch(API, { headers: { "x-team-pass": S.pass }, cache: "no-store" });
      if (r.status === 401) throw Object.assign(new Error("bad_pass"), { code: "bad_pass" });
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    },
    async put(kind, item) {
      if (LOCAL) {
        const db = LS.get("skocal-local", { entries: [], campaigns: [] }); const k = kind === "entry" ? "entries" : "campaigns";
        const saved = { ...item, updatedAt: new Date().toISOString() };
        db[k] = db[k].filter((x) => x.id !== item.id).concat(saved); LS.set("skocal-local", db); return saved;
      }
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json", "x-team-pass": S.pass }, body: JSON.stringify({ op: "put", kind, item }) });
      if (!r.ok) throw new Error("save " + r.status);
      return (await r.json()).item;
    },
    async putChunk(id, i, blob) {
      if (LOCAL) { LOCAL_FILES.set(`${id}/${i}`, blob); return; }
      const r = await fetch(`${API}?file=${encodeURIComponent(id)}&i=${i}`, { method: "POST", headers: { "x-team-pass": S.pass, "content-type": "application/octet-stream" }, body: blob });
      if (!r.ok) throw new Error("upload " + r.status);
    },
    async getChunk(id, i) {
      if (LOCAL) { const b = LOCAL_FILES.get(`${id}/${i}`); if (!b) throw new Error("missing"); return b; }
      const r = await fetch(`${API}?file=${encodeURIComponent(id)}&i=${i}`, { headers: { "x-team-pass": S.pass } });
      if (!r.ok) throw new Error("download " + r.status);
      return r.blob();
    },
    async delFile(id, chunks) {
      if (LOCAL) { for (let i = 0; i < chunks; i++) LOCAL_FILES.delete(`${id}/${i}`); return; }
      await fetch(API, { method: "POST", headers: { "content-type": "application/json", "x-team-pass": S.pass }, body: JSON.stringify({ op: "delfile", id, chunks }) });
    },
    async del(kind, id) {
      if (LOCAL) {
        const db = LS.get("skocal-local", { entries: [], campaigns: [] }); const k = kind === "entry" ? "entries" : "campaigns";
        db[k] = db[k].filter((x) => x.id !== id); LS.set("skocal-local", db); return;
      }
      const r = await fetch(API, { method: "POST", headers: { "content-type": "application/json", "x-team-pass": S.pass }, body: JSON.stringify({ op: "del", kind, id }) });
      if (!r.ok) throw new Error("delete " + r.status);
    },
  };

  function setSync() {
    const el = $("#sync");
    if (S.failing) { el.textContent = "Can't reach the server. Changes won't save."; el.classList.add("bad"); return; }
    el.classList.remove("bad");
    el.textContent = S.synced ? "Synced " + S.synced.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Loading...";
  }

  async function refresh() {
    try {
      const d = await store.load();
      S.entries = d.entries || []; S.campaigns = d.campaigns || [];
      S.synced = new Date(); S.failing = false;
      renderAll();
    } catch (e) {
      if (e.code === "bad_pass") { LS.del("skocal-pass"); S.pass = ""; showGate("That passcode didn't work."); return; }
      S.failing = true;
    }
    setSync();
  }

  async function save(kind, item) {
    const list = kind === "entry" ? S.entries : S.campaigns;
    const prev = list.find((x) => x.id === item.id);
    item.updatedBy = S.name;
    if (!prev) item.createdBy = S.name;
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = item; else list.push(item);
    renderAll();
    try {
      const saved = await store.put(kind, item);
      const j = list.findIndex((x) => x.id === item.id); if (j >= 0) list[j] = saved;
      S.synced = new Date(); S.failing = false; setSync();
      return true;
    } catch {
      if (prev) list[list.findIndex((x) => x.id === item.id)] = prev; else list.splice(list.findIndex((x) => x.id === item.id), 1);
      renderAll(); S.failing = true; setSync(); toast("Didn't save. Check your connection and try again.");
      return false;
    }
  }

  // ---------- content files ----------
  const fmtSize = (b) => (b >= 1073741824 ? (b / 1073741824).toFixed(1) + " GB" : b >= 1048576 ? (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");

  async function uploadFile(file, onProgress) {
    if (file.size > MAX_FILE) throw new Error("too_big");
    const a = { id: uid(), name: file.name, size: file.size, type: file.type || "application/octet-stream", chunks: Math.max(1, Math.ceil(file.size / CHUNK)), by: S.name, at: new Date().toISOString() };
    let done = 0;
    const next = { i: 0 };
    const worker = async () => {
      while (next.i < a.chunks) {
        const i = next.i++;
        const part = file.slice(i * CHUNK, Math.min(file.size, (i + 1) * CHUNK));
        let tries = 0;
        for (;;) {
          try { await store.putChunk(a.id, i, part); break; }
          catch (e) { if (++tries >= 3) throw e; await new Promise((r) => setTimeout(r, 800 * tries)); }
        }
        done++; onProgress && onProgress(done / a.chunks);
      }
    };
    try { await Promise.all([worker(), worker(), worker()]); }
    catch (e) { store.delFile(a.id, a.chunks).catch(() => {}); throw e; }
    return a;
  }

  async function downloadFile(a, onProgress) {
    const parts = [];
    for (let i = 0; i < a.chunks; i++) { parts.push(await store.getChunk(a.id, i)); onProgress && onProgress((i + 1) / a.chunks); }
    const url = URL.createObjectURL(new Blob(parts, { type: a.type }));
    const link = Object.assign(document.createElement("a"), { href: url, download: a.name });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function dlButton(btn, a) {
    if (btn.disabled) return;
    const label = btn.textContent; btn.disabled = true;
    try { await downloadFile(a, (p) => (btn.textContent = Math.round(p * 100) + "%")); btn.textContent = "Downloaded"; }
    catch { toast("Download failed. Try again."); btn.textContent = label; }
    finally { setTimeout(() => { btn.disabled = false; btn.textContent = label; }, 1500); }
  }

  async function remove(kind, id) {
    const key = kind === "entry" ? "entries" : "campaigns";
    if (kind === "entry") { const e = S.entries.find((x) => x.id === id); (e && e.assets || []).forEach((a) => store.delFile(a.id, a.chunks).catch(() => {})); }
    const prev = S[key];
    S[key] = prev.filter((x) => x.id !== id); renderAll();
    try { await store.del(kind, id); S.synced = new Date(); setSync(); }
    catch { S[key] = prev; renderAll(); toast("Didn't delete. Try again."); }
  }

  // ---------- derived ----------
  function paidEvents() {
    const out = [];
    for (const c of S.campaigns) for (const h of c.history || []) if (h.date) out.push({ date: h.date, c, h });
    return out;
  }
  const curBudget = (c) => Number(c.budget) || 0;
  const isRunning = (c, t = todayStr()) => c.status === "live" && c.start && c.start <= t && (!c.end || c.end >= t);
  function campLabel(c, t = todayStr()) {
    if (c.status === "ended" || (c.end && c.end < t)) return "Ended";
    if (c.status === "paused") return "Paused";
    if (c.start > t) return "Scheduled";
    return "Live";
  }

  // ---------- rendering: month ----------
  function renderFilters() {
    const ch = CHANNELS.map((c) =>
      `<button class="fchip ${S.off.has(c.id) ? "off" : ""}" data-f="${c.id}" aria-pressed="${!S.off.has(c.id)}">${esc(c.id)}</button>`).join("");
    $("#filters").innerHTML = ch + `<button class="fchip paidf ${S.off.has("paid") ? "off" : ""}" data-f="paid" aria-pressed="${!S.off.has("paid")}">Paid lines</button>`;
  }

  const codes = (e) => chansOf(e).map((c) => CODE[c] || c).join(" · ");

  function entryChip(e) {
    const st = `<i class="st ${esc(e.status)}"></i>`;
    const tm = e.time ? `<span class="tm">${esc(clock(e.time))}</span>` : "";
    const acct = e.type === "live" ? (e.live && e.live.account) || "" : e.account || "";
    const where = e.type === "live" ? "LIVE" : codes(e);
    const nf = (e.assets || []).length;
    return `<button class="chip t-${esc(e.type)}" data-entry="${esc(e.id)}" title="${esc(chansOf(e).join(", ") + (acct ? " · " + acct : "") + ": " + e.title + (nf ? ` (${nf} file${nf > 1 ? "s" : ""})` : ""))}">${st}<span class="wh">${esc(where)}</span>${tm}${nf ? `<span class="fl" aria-label="${nf} files">${nf}</span>` : ""}<span class="t">${esc(e.title || "TikTok LIVE")}</span></button>`;
  }

  // Paid is a quiet line at the foot of the day, not a card: the calendar is for content.
  function paidLine({ c, h }) {
    const nm = esc(c.name || c.platform);
    let txt;
    if (h.kind === "launch") txt = `&#9650; ${esc(c.platform)} live · ${money(h.amount)}${per(c)}`;
    else if (h.kind === "budget") txt = `${esc(c.platform)} ${money(h.from)}&rarr;${money(h.amount)}${per(c)}`;
    else txt = `${esc(c.platform)} ${({ pause: "paused", resume: "resumed", end: "ended" })[h.kind] || esc(h.kind)}`;
    return `<button class="pline k-${esc(h.kind)}" data-camp="${esc(c.id)}" title="${nm}">${txt}<span class="pn"> · ${nm}</span></button>`;
  }

  function dayItems(date) {
    const ents = S.entries.filter((e) => e.date === date && chansOf(e).some((c) => !S.off.has(c)))
      .sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    const paid = S.off.has("paid") ? [] : paidEvents().filter((p) => p.date === date);
    return { ents, paid };
  }

  function renderMonth() {
    const m = S.month, y = m.getFullYear(), mo = m.getMonth();
    $("#monthTitle").textContent = m.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const first = new Date(y, mo, 1), offset = first.getDay();
    const dim = new Date(y, mo + 1, 0).getDate();
    const cells = Math.ceil((offset + dim) / 7) * 7;
    const t = todayStr();
    let html = "";
    for (let i = 0; i < cells; i++) {
      const d = new Date(y, mo, 1 - offset + i), ds = ymd(d);
      const out = d.getMonth() !== mo;
      const { ents, paid } = dayItems(ds);
      const chips = ents.map(entryChip);
      const shown = chips.slice(0, 4).join("");
      const more = chips.length > 4 ? `<span class="more-n">+${chips.length - 4} more</span>` : "";
      const lines = paid.length ? `<div class="plines">${paid.slice(0, 2).map(paidLine).join("")}${paid.length > 2 ? `<span class="more-n">+${paid.length - 2} paid</span>` : ""}</div>` : "";
      const dots = ents.map((e) => `<i class="${esc(e.type)}"></i>`).slice(0, 8).join("");
      html += `<div class="day ${out ? "out" : ""} ${ds === t ? "today" : ""} ${paid.length ? "haspaid" : ""}" data-date="${ds}" role="gridcell" tabindex="0" aria-label="${fmtDay(ds)}, ${ents.length} post${ents.length === 1 ? "" : "s"}${paid.length ? ", paid change" : ""}">
        <div class="dn"><b>${d.getDate()}</b><button class="add" data-add="${ds}" aria-label="Add on ${fmtDay(ds)}">+</button></div>
        ${shown}${more}<div class="dots">${dots}</div>${lines}</div>`;
    }
    $("#grid").innerHTML = html;
  }

  // ---------- rendering: paid ----------
  function renderPaid() {
    const t = todayStr();
    const running = S.campaigns.filter((c) => isRunning(c, t)).sort((a, b) => curBudget(b) - curBudget(a));
    const other = S.campaigns.filter((c) => !isRunning(c, t)).sort((a, b) => (b.start || "").localeCompare(a.start || ""));
    const daily = running.filter((c) => c.budgetType !== "lifetime").reduce((s, c) => s + curBudget(c), 0);
    const life = running.filter((c) => c.budgetType === "lifetime").reduce((s, c) => s + curBudget(c), 0);
    const mStart = ymd(S.month), mEnd = ymd(new Date(S.month.getFullYear(), S.month.getMonth() + 1, 0));
    const launched = S.campaigns.filter((c) => c.start >= mStart && c.start <= mEnd).length;
    $("#paidSum").innerHTML = running.length
      ? `<b>${running.length}</b> running · <b>${money(daily)}/day</b> in daily budgets${life ? ` · <b>${money(life)}</b> in lifetime budgets` : ""} · ${launched} launched in ${S.month.toLocaleDateString("en-US", { month: "long" })}`
      : `${launched} launched in ${S.month.toLocaleDateString("en-US", { month: "long" })}`;

    $("#liveTable tbody").innerHTML = running.map((c) => {
      const ch = [...(c.history || [])].reverse().find((h) => h.kind === "budget");
      const last = ch ? `${money(ch.from)} &rarr; ${money(ch.amount)}<div class="s2">${fmtShort(ch.date)}${ch.note ? " · " + esc(ch.note) : ""}</div>` : '<span class="s2">No changes</span>';
      const dest = c.destination ? `<a href="${esc(c.destination)}" target="_blank" rel="noopener">${esc(host(c.destination))}</a>` : "";
      const code = c.code ? `<div class="s2">Code ${esc(c.code)}</div>` : "";
      return `<tr>
        <td><span class="plat">${esc(c.platform)}</span></td>
        <td><div class="nm">${esc(c.name)}</div><div class="s2">${esc([c.account, c.objective].filter(Boolean).join(" · "))}</div></td>
        <td>${fmtShort(c.start)}<div class="s2">Day ${daysBetween(c.start, t) + 1}${c.end ? " of " + (daysBetween(c.start, c.end) + 1) : ""}</div></td>
        <td class="num"><b>${money(curBudget(c))}</b><div class="s2">${c.budgetType === "lifetime" ? "lifetime" : "per day"}</div></td>
        <td>${last}</td>
        <td>${dest}${code}</td>
        <td>${esc(c.owner)}</td>
        <td>${statusSelect(c)}</td>
        <td><div class="rowact"><button data-budget="${esc(c.id)}">Change budget</button><button data-camp="${esc(c.id)}">Edit</button></div></td>
      </tr>`;
    }).join("");
    $("#liveEmpty").hidden = running.length > 0;
    $("#liveTable").parentElement.hidden = running.length === 0;

    $("#otherCount").textContent = other.length ? `(${other.length})` : "(0)";
    $("#otherCamps").hidden = other.length === 0;
    $("#otherBody").innerHTML = other.map((c) => `<tr>
      <td><span class="plat">${esc(c.platform)}</span></td>
      <td><div class="nm">${esc(c.name)}</div><div class="s2">${esc(campLabel(c, t))}</div></td>
      <td>${fmtShort(c.start)}${c.end ? " &ndash; " + fmtShort(c.end) : ""}</td>
      <td class="num">${money(curBudget(c))}<div class="s2">${c.budgetType === "lifetime" ? "lifetime" : "per day"}</div></td>
      <td>${esc(c.owner)}</td>
      <td>${statusSelect(c)}</td>
      <td><div class="rowact"><button data-camp="${esc(c.id)}">Edit</button></div></td></tr>`).join("");
  }

  function statusSelect(c) {
    const opts = [["live", "Live"], ["paused", "Paused"], ["ended", "Ended"]];
    return `<select class="status ${c.status === "live" ? "live" : ""}" data-status="${esc(c.id)}" aria-label="Status of ${esc(c.name)}">${opts.map(([v, l]) => `<option value="${v}" ${c.status === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  }

  // ---------- drawer ----------
  function openDrawer(date) {
    S.drawerDate = date;
    $("#drawerTitle").textContent = fmtDay(date, { weekday: "long", month: "long", day: "numeric" });
    renderDrawer();
    $("#drawer").hidden = false;
  }
  function renderDrawer() {
    if (!S.drawerDate) return;
    const date = S.drawerDate;
    const ents = S.entries.filter((e) => e.date === date).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    const paid = paidEvents().filter((p) => p.date === date);
    $("#drawerList").innerHTML =
      `<div class="sep">Posting</div>` +
      (ents.length ? ents.map(entryChip).join("") : `<p class="none">Nothing scheduled to post yet.</p>`) +
      (paid.length ? `<div class="sep">Paid</div>${paid.map(paidLine).join("")}` : "");
  }
  const closeDrawer = () => { $("#drawer").hidden = true; S.drawerDate = null; };

  // ---------- modal plumbing ----------
  const modal = $("#modal");
  function openModal(html, onReady) {
    modal.innerHTML = html;
    if (!modal.open) modal.showModal();
    onReady && onReady(modal);
    const f = modal.querySelector("input:not([type=hidden]),select,textarea");
    f && f.focus();
  }
  const closeModal = (cancelled) => {
    if (cancelled === true && modal._onCancel) modal._onCancel();
    modal._onCancel = null;
    if (modal.open) modal.close();
    modal.innerHTML = "";
  };
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(true); });
  modal.addEventListener("cancel", (e) => { e.preventDefault(); closeModal(true); });

  const seg = (name, items, val, extra = "") =>
    `<div class="seg" data-seg="${name}" ${extra}>${items.map((i) => `<button type="button" data-v="${esc(i.id)}" class="${i.id === val ? "on" : ""} ${i.id === "live" ? "live" : ""}">${esc(i.label)}</button>`).join("")}</div>`;
  const opt = (list, val) => list.map((v) => `<option ${v === val ? "selected" : ""}>${esc(v)}</option>`).join("");
  const metaLine = (x) => x && x.updatedAt ? `<span class="meta">Last edited by ${esc(x.updatedBy || "someone")}, ${new Date(x.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>` : "<span></span>";

  // ---------- entry editor ----------
  function blankLive() { return { account: LIVE_ACCOUNTS[0], hosts: "", duration: 60, code: "", blocks: [] }; }
  function syncBlocks(live) {
    const n = Math.max(1, Math.round((live.duration || 30) / 30));
    const b = live.blocks || [];
    for (let i = b.length; i < n; i++) b.push({ theme: ROTATION[i % ROTATION.length].name, feature: "", second: "", orders: "", notes: "", done: BEATS.map(() => false) });
    live.blocks = b.slice(0, n);
    return live;
  }

  function editEntry(existing, presetDate) {
    const d = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: uid(), type: "post", title: "", date: presetDate || todayStr(), time: "", channels: ["TikTok"], account: "",
      owner: S.name, status: "idea", link: "", notes: "", assets: [],
    };
    d.channels = chansOf(d); delete d.channel;
    d.assets = d.assets || [];
    d._orig = (existing && existing.assets || []).map((a) => a.id);
    if (d.type === "live") d.live = syncBlocks(d.live || blankLive());
    renderEntryModal(d, !existing);
  }

  function readEntryForm(d) {
    const f = modal.querySelector("form");
    if (!f) return d;
    const g = (n) => (f.elements[n] ? f.elements[n].value.trim() : "");
    Object.assign(d, { title: g("title"), date: g("date"), time: g("time"), owner: g("owner"), link: g("link"), notes: g("notes") });
    if (d.type !== "live") d.account = g("account");
    if (d.type === "live" && d.live) {
      d.live.account = g("account"); d.live.hosts = g("hosts"); d.live.code = g("code");
      d.live.duration = Number(g("duration")) || 60;
      d.live.blocks.forEach((b, i) => {
        b.theme = g(`b${i}theme`); b.feature = g(`b${i}feature`); b.second = g(`b${i}second`);
        b.orders = g(`b${i}orders`); b.notes = g(`b${i}notes`);
        b.done = BEATS.map((_, j) => !!(f.elements[`b${i}c${j}`] && f.elements[`b${i}c${j}`].checked));
      });
      syncBlocks(d.live);
    }
    return d;
  }

  function rosHtml(d) {
    const L = d.live;
    const total = L.blocks.reduce((s, b) => s + (Number(b.orders) || 0), 0);
    return `<div class="ros">
      <h4>Run of show <span class="hint">${L.blocks.length} block${L.blocks.length > 1 ? "s" : ""} of 30 min${total ? ` · ${total} orders logged` : ""}</span></h4>
      ${L.blocks.map((b, i) => {
        const startMin = i * 30;
        const lbl = d.time ? `${addMin(d.time, startMin)} to ${addMin(d.time, startMin + 30)}` : `${relTime(startMin)} to ${relTime(startMin + 30)}`;
        return `<div class="block">
          <div class="block-h"><b>Block ${i + 1}</b><span class="tm">${lbl}</span></div>
          <div class="block-b">
            <label>Focus<select name="b${i}theme">${ROTATION.map((r) => `<option ${r.name === b.theme ? "selected" : ""}>${esc(r.name)}</option>`).join("")}</select></label>
            <label>Feature<input name="b${i}feature" value="${esc(b.feature)}" placeholder="e.g. BPC-157"></label>
            <label>Orders<input name="b${i}orders" value="${esc(b.orders)}" inputmode="numeric" placeholder="after"></label>
            <label class="full">Second feature<input name="b${i}second" value="${esc(b.second)}" placeholder="What people order with it, or its bundle"></label>
            <div class="checks">${BEATS.map((bt, j) => `<label><input type="checkbox" name="b${i}c${j}" ${b.done[j] ? "checked" : ""}><span class="tm">${d.time ? addMin(d.time, startMin + bt.s) : relTime(startMin + bt.s)}</span>${esc(bt.title)}</label>`).join("")}</div>
            <label class="full">Notes<input name="b${i}notes" value="${esc(b.notes)}" placeholder="Best comment, what sold, what to change"></label>
          </div></div>`;
      }).join("")}
    </div>`;
  }

  function renderEntryModal(d, isNew) {
    const live = d.type === "live";
    openModal(`<form method="dialog" novalidate>
      <div class="m-head"><h3 id="modalTitle">${isNew ? "Add to calendar" : "Edit"}</h3><button type="button" class="icon" data-x aria-label="Close">&times;</button></div>
      <div class="m-body">
        <div class="full">${seg("type", TYPES, d.type)}</div>
        <label class="full">${live ? "Session name" : "Title"}<input name="title" value="${esc(d.title)}" required maxlength="140" placeholder="${live ? "Thursday LIVE" : "What's going out"}"></label>
        <label>Date<input name="date" type="date" value="${esc(d.date)}" required></label>
        <label>${live ? "Start time" : "Time"}<input name="time" type="time" value="${esc(d.time)}"></label>
        ${live ? `
          <label>Account<select name="account">${opt(LIVE_ACCOUNTS, d.live.account)}</select></label>
          <label>Length<select name="duration">${DURATIONS.map((m) => `<option value="${m}" ${m === d.live.duration ? "selected" : ""}>${m < 60 ? m + " min" : m / 60 + " hr"}</option>`).join("")}</select></label>
          <label>Hosts<input name="hosts" value="${esc(d.live.hosts)}" placeholder="Who's on camera"></label>
          <label>Live code / deal<input name="code" value="${esc(d.live.code)}" placeholder="Read once, on a card"></label>
        ` : `
          <div class="full"><label style="margin-bottom:5px">Where it posts</label>
            <div class="seg" data-seg="chans">${CHANNELS.map((c) => `<button type="button" data-v="${esc(c.id)}" class="${d.channels.includes(c.id) ? "on" : ""}">${esc(c.id)}</button>`).join("")}</div></div>
          <label>Account<input name="account" list="acctList" value="${esc(d.account || "")}" placeholder="@skopeps"><datalist id="acctList">${ACCOUNTS.map((a) => `<option value="${esc(a)}">`).join("")}</datalist></label>
        `}
        <label>Owner<input name="owner" value="${esc(d.owner)}" maxlength="40"></label>
        <div class="full"><label style="margin-bottom:5px">Status</label>${seg("status", STATUSES, d.status)}</div>
        <div class="full files">
          <label>Content files <span class="hint">Anyone on the team can download these. Up to 1 GB each.</span></label>
          <div class="flist">${(d.assets || []).map((a) => `<div class="frow" data-a="${esc(a.id)}"><span class="fn">${esc(a.name)}</span><span class="fs">${fmtSize(a.size)}${a.by ? " · " + esc(a.by) : ""}</span><button type="button" class="mini" data-dl="${esc(a.id)}">Download</button><button type="button" class="mini x" data-rm="${esc(a.id)}" aria-label="Remove ${esc(a.name)}">&times;</button></div>`).join("")}<div class="uploads"></div></div>
          <label class="upl"><input type="file" multiple data-up>+ Upload files</label>
        </div>
        <label class="full">Link<input name="link" value="${esc(d.link)}" placeholder="Drive folder, draft, or the live post once it's up"></label>
        <label class="full">${live ? "Notes" : "Caption and notes"}<textarea name="notes" placeholder="${live ? "Anything the hosts need" : "Hook, caption, hashtags, CTA, who approves"}">${esc(d.notes)}</textarea></label>
        ${live ? rosHtml(d) : ""}
      </div>
      <div class="m-foot">${metaLine(isNew ? null : d)}<div class="r">
        ${isNew ? "" : '<button type="button" class="btn danger" data-del>Delete</button>'}
        <button type="button" class="ghost" data-x>Cancel</button><button type="submit" class="btn">Save</button></div></div>
    </form>`, (m) => {
      const f = m.querySelector("form");
      d._new = d._new || []; d._rm = d._rm || []; d._busy = d._busy || 0;
      modal._onCancel = () => { d._new.forEach((id) => { const a = d.assets.find((x) => x.id === id); a && store.delFile(a.id, a.chunks).catch(() => {}); }); };
      m.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => closeModal(true)));
      const chans = m.querySelector('[data-seg="chans"]');
      if (chans) chans.onclick = (e) => {
        const b = e.target.closest("button[data-v]"); if (!b) return;
        const v = b.dataset.v, on = d.channels.includes(v);
        if (on && d.channels.length === 1) return; // always posts somewhere
        d.channels = on ? d.channels.filter((x) => x !== v) : [...d.channels, v];
        b.classList.toggle("on", !on);
      };
      m.querySelector("[data-up]").onchange = (e) => {
        const files = [...e.target.files]; e.target.value = "";
        files.forEach(async (file) => {
          if (file.size > MAX_FILE) { toast(`${file.name} is over 1 GB.`); return; }
          const row = document.createElement("div"); row.className = "frow up";
          row.innerHTML = `<span class="fn">${esc(file.name)}</span><span class="fs">${fmtSize(file.size)}</span><span class="bar"><i></i></span>`;
          (modal.querySelector(".uploads") || m.querySelector(".uploads")).append(row);
          d._busy++;
          try {
            const a = await uploadFile(file, (p) => { const i = row.querySelector(".bar i"); if (i) i.style.width = Math.round(p * 100) + "%"; });
            d._busy--; d._new.push(a.id);
            if (!modal.open) { store.delFile(a.id, a.chunks).catch(() => {}); return; }
            readEntryForm(d); d.assets.push(a); renderEntryModal(d, isNew);
          } catch { d._busy--; row.remove(); toast(`${file.name} didn't upload. Try again.`); }
        });
      };
      m.querySelectorAll("[data-dl]").forEach((b) => (b.onclick = () => { const a = d.assets.find((x) => x.id === b.dataset.dl); a && dlButton(b, a); }));
      m.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => {
        const a = d.assets.find((x) => x.id === b.dataset.rm); if (!a || !confirm(`Remove ${a.name}?`)) return;
        readEntryForm(d); d.assets = d.assets.filter((x) => x.id !== a.id);
        if (d._new.includes(a.id)) { d._new = d._new.filter((x) => x !== a.id); store.delFile(a.id, a.chunks).catch(() => {}); } else d._rm.push(a);
        renderEntryModal(d, isNew);
      }));
      m.querySelector('[data-seg="type"]').onclick = (e) => {
        const b = e.target.closest("button[data-v]"); if (!b) return;
        readEntryForm(d); d.type = b.dataset.v;
        if (d.type === "live") { d.live = syncBlocks(d.live || blankLive()); d.channels = ["TikTok"]; }
        renderEntryModal(d, isNew);
      };
      m.querySelector('[data-seg="status"]').onclick = (e) => {
        const b = e.target.closest("button[data-v]"); if (!b) return;
        d.status = b.dataset.v; $$('[data-seg="status"] button', m).forEach((x) => x.classList.toggle("on", x === b));
      };
      if (live) {
        f.elements.duration.onchange = () => { readEntryForm(d); renderEntryModal(d, isNew); };
        f.elements.time.onchange = () => { readEntryForm(d); renderEntryModal(d, isNew); };
      }
      const del = m.querySelector("[data-del]");
      if (del) del.onclick = async () => { if (confirm(`Delete "${d.title || "this"}" and its files?`)) { modal._onCancel(); closeModal(); await remove("entry", d.id); renderDrawer(); } };
      f.onsubmit = async (e) => {
        e.preventDefault(); readEntryForm(d);
        if (d._busy > 0) { toast("Wait for the upload to finish."); return; }
        if (!d.title) { f.elements.title.focus(); f.elements.title.setCustomValidity("Add a title"); f.elements.title.reportValidity(); f.elements.title.setCustomValidity(""); return; }
        if (!d.date) { f.elements.date.focus(); return; }
        if (d.type !== "live") delete d.live; else d.channels = ["TikTok"];
        const gone = d._rm;
        const item = { ...d }; delete item._new; delete item._rm; delete item._busy; delete item._orig;
        closeModal();
        const ok = await save("entry", item);
        if (ok) gone.forEach((a) => store.delFile(a.id, a.chunks).catch(() => {}));
        renderDrawer(); renderLibrary();
      };
    });
  }

  // ---------- campaign editor ----------
  function editCamp(existing) {
    const c = existing ? JSON.parse(JSON.stringify(existing)) : {
      id: uid(), platform: "TikTok", name: "", account: "", objective: "", start: todayStr(), end: "",
      budgetType: "daily", budget: "", status: "live", destination: "", code: "", owner: S.name, notes: "", history: [],
    };
    const isNew = !existing;
    const hist = (c.history || []).slice().sort((a, b) => a.date.localeCompare(b.date)).map((h) => {
      const w = h.kind === "launch" ? `Launched at ${money(h.amount)}${per(c)}` : h.kind === "budget" ? `Budget ${money(h.from)} to ${money(h.amount)}${per(c)}` : { pause: "Paused", resume: "Resumed", end: "Ended" }[h.kind];
      return `<li>${fmtShort(h.date)}: ${w}${h.note ? " · " + esc(h.note) : ""}${h.by ? ` <span class="hint">(${esc(h.by)})</span>` : ""}</li>`;
    }).join("");
    openModal(`<form method="dialog" novalidate>
      <div class="m-head"><h3 id="modalTitle">${isNew ? "Add paid campaign" : "Edit campaign"}</h3><button type="button" class="icon" data-x aria-label="Close">&times;</button></div>
      <div class="m-body">
        <label>Platform<select name="platform">${opt(PLATFORMS, c.platform)}</select></label>
        <label>Ad account<input name="account" value="${esc(c.account)}" placeholder="e.g. SKO Compounds0409"></label>
        <label class="full">Campaign name<input name="name" value="${esc(c.name)}" required maxlength="120" placeholder="As it's named in Ads Manager"></label>
        <label>Launch date<input name="start" type="date" value="${esc(c.start)}" required></label>
        <label>End date <span class="hint">optional</span><input name="end" type="date" value="${esc(c.end)}"></label>
        <div><label style="margin-bottom:5px">Budget type</label>${seg("btype", [{ id: "daily", label: "Daily" }, { id: "lifetime", label: "Lifetime" }], c.budgetType)}</div>
        ${isNew ? `<label>Starting budget ($)<input name="budget" type="number" min="0" step="1" value="${esc(c.budget)}" required></label>`
          : `<label>Current budget<input value="${money(curBudget(c))}${per(c)}" disabled><span class="hint">Use Change budget so the change shows on the calendar.</span></label>`}
        <label>Objective<input name="objective" value="${esc(c.objective)}" placeholder="Purchases, traffic, reach"></label>
        <label>Owner<input name="owner" value="${esc(c.owner)}" maxlength="40"></label>
        <label class="full">Goes to<input name="destination" value="${esc(c.destination)}" placeholder="https://skocompounds.com/lp?lp_code=..."></label>
        <label>Code<input name="code" value="${esc(c.code)}" placeholder="e.g. TIKTOK15"></label>
        <label>Status<select name="status"><option value="live" ${c.status === "live" ? "selected" : ""}>Live</option><option value="paused" ${c.status === "paused" ? "selected" : ""}>Paused</option><option value="ended" ${c.status === "ended" ? "selected" : ""}>Ended</option></select></label>
        <label class="full">Notes<textarea name="notes" placeholder="Creative, audience, what it's testing">${esc(c.notes)}</textarea></label>
        ${hist ? `<div class="full"><label>History</label><ul class="plain" style="margin-top:6px">${hist}</ul></div>` : ""}
      </div>
      <div class="m-foot">${metaLine(isNew ? null : c)}<div class="r">
        ${isNew ? "" : '<button type="button" class="btn danger" data-del>Delete</button>'}
        <button type="button" class="ghost" data-x>Cancel</button><button type="submit" class="btn">Save</button></div></div>
    </form>`, (m) => {
      const f = m.querySelector("form");
      m.querySelectorAll("[data-x]").forEach((b) => (b.onclick = closeModal));
      m.querySelector('[data-seg="btype"]').onclick = (e) => {
        const b = e.target.closest("button[data-v]"); if (!b) return;
        c.budgetType = b.dataset.v; $$('[data-seg="btype"] button', m).forEach((x) => x.classList.toggle("on", x === b));
      };
      const del = m.querySelector("[data-del]");
      if (del) del.onclick = async () => { if (confirm(`Delete "${c.name}"? Its launch and budget changes leave the calendar too.`)) { closeModal(); await remove("campaign", c.id); } };
      f.onsubmit = async (e) => {
        e.preventDefault();
        const g = (n) => (f.elements[n] ? f.elements[n].value.trim() : "");
        const prevStatus = c.status;
        Object.assign(c, { platform: g("platform"), account: g("account"), name: g("name"), start: g("start"), end: g("end"), objective: g("objective"), owner: g("owner"), destination: g("destination"), code: g("code"), status: g("status"), notes: g("notes") });
        if (!c.name) { f.elements.name.reportValidity(); return; }
        if (!c.start) { f.elements.start.focus(); return; }
        if (c.end && c.end < c.start) { toast("End date is before the launch date."); return; }
        if (isNew) {
          const b = Number(g("budget"));
          if (!g("budget") || isNaN(b)) { f.elements.budget.focus(); toast("Add the starting budget."); return; }
          c.budget = b; c.history = [{ date: c.start, kind: "launch", amount: b, by: S.name }];
        } else {
          const l = c.history.find((h) => h.kind === "launch"); if (l) l.date = c.start;
          if (prevStatus !== c.status) pushStatus(c, prevStatus);
        }
        closeModal(); await save("campaign", c);
      };
    });
  }

  function pushStatus(c, prev) {
    const kind = c.status === "ended" ? "end" : c.status === "paused" ? "pause" : prev === "paused" || prev === "ended" ? "resume" : null;
    if (!kind) return;
    c.history = c.history || [];
    c.history.push({ date: todayStr(), kind, by: S.name });
    if (c.status === "ended" && !c.end) c.end = todayStr();
    if (c.status === "live" && c.end && c.end < todayStr()) c.end = "";
  }

  function changeBudget(c0) {
    const c = JSON.parse(JSON.stringify(c0));
    openModal(`<form method="dialog" novalidate>
      <div class="m-head"><h3 id="modalTitle">Change budget: ${esc(c.name)}</h3><button type="button" class="icon" data-x aria-label="Close">&times;</button></div>
      <div class="m-body">
        <label>Now<input value="${money(curBudget(c))}${per(c)}" disabled></label>
        <label>New budget ($${c.budgetType === "lifetime" ? " total" : " per day"})<input name="amt" type="number" min="0" step="1" required></label>
        <label>Takes effect<input name="date" type="date" value="${todayStr()}" required></label>
        <label>Why<input name="note" placeholder="e.g. ROAS held 3× for 3 days"></label>
      </div>
      <div class="m-foot"><span class="hint">It shows on the calendar on that date.</span><div class="r"><button type="button" class="ghost" data-x>Cancel</button><button type="submit" class="btn">Save change</button></div></div>
    </form>`, (m) => {
      const f = m.querySelector("form");
      m.querySelectorAll("[data-x]").forEach((b) => (b.onclick = closeModal));
      f.onsubmit = async (e) => {
        e.preventDefault();
        const amt = Number(f.elements.amt.value), date = f.elements.date.value;
        if (f.elements.amt.value === "" || isNaN(amt)) { f.elements.amt.focus(); return; }
        if (!date) return;
        c.history = c.history || [];
        c.history.push({ date, kind: "budget", from: curBudget(c), amount: amt, note: f.elements.note.value.trim(), by: S.name });
        c.budget = amt;
        closeModal(); await save("campaign", c);
      };
    });
  }

  // ---------- library ----------
  function renderLibrary() {
    const chSel = $("#libCh"), acSel = $("#libAcct");
    const accts = [...new Set(S.entries.map((e) => (e.type === "live" ? (e.live && e.live.account) : e.account)).filter(Boolean))].sort();
    const keepCh = chSel.value, keepAc = acSel.value;
    chSel.innerHTML = `<option value="">Every channel</option>` + CHANNELS.map((c) => `<option ${c.id === keepCh ? "selected" : ""}>${esc(c.id)}</option>`).join("");
    acSel.innerHTML = `<option value="">Every account</option>` + accts.map((a) => `<option ${a === keepAc ? "selected" : ""}>${esc(a)}</option>`).join("");
    const q = $("#libQ").value.trim().toLowerCase(), ch = chSel.value, ac = acSel.value, onlyFiles = $("#libFiles").checked;
    const rows = S.entries.filter((e) => {
      const acct = e.type === "live" ? (e.live && e.live.account) || "" : e.account || "";
      if (ch && !chansOf(e).includes(ch)) return false;
      if (ac && acct !== ac) return false;
      if (onlyFiles && !(e.assets || []).length) return false;
      if (q && !`${e.title} ${e.notes} ${acct} ${chansOf(e).join(" ")}`.toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => (b.date + (b.time || "")).localeCompare(a.date + (a.time || "")));
    $("#libBody").innerHTML = rows.map((e) => {
      const acct = e.type === "live" ? (e.live && e.live.account) || "" : e.account || "";
      const files = (e.assets || []).map((a) => `<button class="mini" data-libdl="${esc(e.id)}|${esc(a.id)}" title="${esc(a.name)} · ${fmtSize(a.size)}">${esc(a.name.length > 22 ? a.name.slice(0, 19) + "..." : a.name)}</button>`).join(" ");
      return `<tr class="lrow" data-entry="${esc(e.id)}">
        <td>${fmtShort(e.date)}${e.time ? `<div class="s2">${esc(clock(e.time))}</div>` : ""}</td>
        <td>${e.type === "live" ? '<span class="plat live">LIVE</span>' : chansOf(e).map((c) => `<span class="plat">${esc(CODE[c] || c)}</span>`).join(" ")}</td>
        <td>${esc(acct)}</td>
        <td><div class="nm">${esc(e.title)}</div>${e.notes ? `<div class="s2 clip">${esc(e.notes)}</div>` : ""}</td>
        <td>${esc((STATUSES.find((s) => s.id === e.status) || {}).label || "")}</td>
        <td class="fcell">${files || '<span class="s2">None</span>'}</td>
        <td>${esc(e.owner)}</td></tr>`;
    }).join("");
    $("#libEmpty").hidden = rows.length > 0;
  }
  ["#libQ", "#libCh", "#libAcct", "#libFiles"].forEach((s) => $(s).addEventListener("input", renderLibrary));

  // ---------- playbook ----------
  function renderPlaybook() {
    $("#beats").innerHTML = BEATS.map((b) => `<li class="beat ${b.key ? "key" : ""}">
      <div class="when">${relTime(b.s)}&ndash;${relTime(b.e)}<b>${b.e - b.s} min</b></div>
      <div><h3>${esc(b.title)}</h3><p>${esc(b.body)}</p>${b.say ? `<div class="say">${esc(b.say)}</div>` : ""}</div></li>`).join("");
    $("#rotation").innerHTML = ROTATION.map((r) => `<li><b>${esc(r.name)}.</b> ${esc(r.note)}</li>`).join("");
    $("#saySo").innerHTML = SAY.map((s) => `<li>${esc(s)}</li>`).join("");
    $("#neverSay").innerHTML = NEVER.map((s) => `<li>${esc(s)}</li>`).join("");
  }

  // ---------- all ----------
  function renderAll() {
    renderFilters(); renderMonth(); renderPaid(); renderDrawer(); renderLibrary();
    $("#whoBtn").textContent = S.name ? `You: ${S.name}` : "";
  }

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    const t = e.target;
    const tab = t.closest(".tab");
    if (tab) {
      $$(".tab").forEach((x) => x.classList.toggle("on", x === tab));
      $$(".view").forEach((v) => (v.hidden = v.id !== "view-" + tab.dataset.tab));
      LS.set("skocal-tab", tab.dataset.tab); closeDrawer(); return;
    }
    const ld = t.closest("[data-libdl]");
    if (ld) {
      e.stopPropagation();
      const [eid, aid] = ld.dataset.libdl.split("|");
      const a = ((S.entries.find((x) => x.id === eid) || {}).assets || []).find((x) => x.id === aid);
      a && dlButton(ld, a); return;
    }
    const fc = t.closest(".fchip");
    if (fc) { const id = fc.dataset.f; S.off.has(id) ? S.off.delete(id) : S.off.add(id); LS.set("skocal-off", [...S.off]); renderAll(); return; }
    const add = t.closest("[data-add]");
    if (add) { e.stopPropagation(); editEntry(null, add.dataset.add); return; }
    const en = t.closest("[data-entry]");
    if (en) { e.stopPropagation(); const x = S.entries.find((y) => y.id === en.dataset.entry); x && editEntry(x); return; }
    const cp = t.closest("[data-camp]");
    if (cp) { e.stopPropagation(); const x = S.campaigns.find((y) => y.id === cp.dataset.camp); x && editCamp(x); return; }
    const bu = t.closest("[data-budget]");
    if (bu) { const x = S.campaigns.find((y) => y.id === bu.dataset.budget); x && changeBudget(x); return; }
    const day = t.closest(".day");
    if (day && !t.closest("button")) { openDrawer(day.dataset.date); return; }
    if (t.closest("[data-close]")) { closeDrawer(); return; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.classList && e.target.classList.contains("day")) { openDrawer(e.target.dataset.date); return; }
    if (e.key === "Escape" && !modal.open) closeDrawer();
    if (modal.open || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (!$("#view-cal").hidden && e.key === "ArrowLeft") shiftMonth(-1);
    if (!$("#view-cal").hidden && e.key === "ArrowRight") shiftMonth(1);
  });
  document.addEventListener("change", async (e) => {
    const s = e.target.closest("[data-status]");
    if (!s) return;
    const c0 = S.campaigns.find((y) => y.id === s.dataset.status); if (!c0) return;
    const c = JSON.parse(JSON.stringify(c0)); const prev = c.status;
    c.status = s.value; pushStatus(c, prev); await save("campaign", c);
  });
  function shiftMonth(n) { S.month = new Date(S.month.getFullYear(), S.month.getMonth() + n, 1); closeDrawer(); renderAll(); }
  $("#prevM").onclick = () => shiftMonth(-1);
  $("#nextM").onclick = () => shiftMonth(1);
  $("#todayBtn").onclick = () => { const d = new Date(); S.month = new Date(d.getFullYear(), d.getMonth(), 1); renderAll(); };
  $("#newEntry").onclick = () => editEntry(null);
  $("#newCamp").onclick = () => editCamp(null);
  $("#drawerAdd").onclick = () => editEntry(null, S.drawerDate);
  $("#whoBtn").onclick = () => {
    openModal(`<form method="dialog"><div class="m-head"><h3 id="modalTitle">Your name</h3><button type="button" class="icon" data-x aria-label="Close">&times;</button></div>
      <div class="m-body"><label class="full">Shown on what you add and edit<input name="n" value="${esc(S.name)}" maxlength="40" required></label></div>
      <div class="m-foot"><button type="button" class="link" data-out>Sign out on this device</button><div class="r"><button type="submit" class="btn">Save</button></div></div></form>`, (m) => {
      m.querySelector("[data-x]").onclick = closeModal;
      m.querySelector("[data-out]").onclick = () => { LS.del("skocal-pass"); LS.del("skocal-name"); location.reload(); };
      m.querySelector("form").onsubmit = (e) => { e.preventDefault(); const v = e.target.elements.n.value.trim(); if (v) { S.name = v; LS.set("skocal-name", v); } closeModal(); renderAll(); };
    });
  };

  // ---------- gate + boot ----------
  function showGate(msg) {
    $("#gate").hidden = false;
    const f = $("#gateForm"); f.elements.name.value = S.name || "";
    $("#gateErr").hidden = !msg; $("#gateErr").textContent = msg || "";
    (S.name ? f.elements.pass : f.elements.name).focus();
  }
  $("#gateForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target; S.name = f.elements.name.value.trim(); S.pass = f.elements.pass.value;
    if (!S.name || !S.pass) return;
    $("#gateErr").hidden = true;
    const btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Checking...";
    try {
      const d = await store.load();
      LS.set("skocal-name", S.name); LS.set("skocal-pass", S.pass);
      S.entries = d.entries || []; S.campaigns = d.campaigns || []; S.synced = new Date(); S.failing = false;
      $("#gate").hidden = true; renderAll(); setSync(); startPolling();
    } catch (err) {
      $("#gateErr").hidden = false;
      $("#gateErr").textContent = err.code === "bad_pass" ? "That passcode didn't work." : "Can't reach the server right now. Try again in a minute.";
    } finally { btn.disabled = false; btn.textContent = "Open calendar"; }
  };

  let pollT;
  function startPolling() {
    clearInterval(pollT);
    pollT = setInterval(() => { if (!document.hidden && !modal.open) refresh(); }, POLL_MS);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && S.pass && !modal.open) refresh(); });

  renderPlaybook();
  renderAll();
  { const t0 = LS.get("skocal-tab", "cal"); const b = $(`.tab[data-tab="${t0}"]`); if (b && t0 !== "cal") b.click(); }
  if (!S.pass || !S.name) { showGate(); }
  else { setSync(); refresh(); startPolling(); }
})();
