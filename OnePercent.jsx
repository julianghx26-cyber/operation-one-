import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Cell
} from "recharts";
import {
  LayoutDashboard, ListTree, CalendarDays, LineChart as LineChartIcon,
  Layers, AlertTriangle, Bot, Wallet, BookOpen, GraduationCap,
  StickyNote, Settings as SettingsIcon, Plus, Upload, Download, Search,
  X, Trash2, Pencil, ImagePlus, ChevronLeft, ChevronRight, Check, Info,
  Clock, Wifi, WifiOff, RefreshCw, Eye, EyeOff, Target, Award, FlaskConical,
  ClipboardList, Link2, ShieldAlert
} from "lucide-react";

/* ============================================================
   CONSTANTS
   ============================================================ */

const APP_NAME = "ONE PERCENT";

const INSTRUMENTS = {
  NQ:  { name: "E-mini Nasdaq-100", pointValue: 20,  tick: 0.25 },
  MNQ: { name: "Micro Nasdaq-100",  pointValue: 2,   tick: 0.25 },
  ES:  { name: "E-mini S&P 500",    pointValue: 50,  tick: 0.25 },
  MES: { name: "Micro S&P 500",     pointValue: 5,   tick: 0.25 },
  YM:  { name: "E-mini Dow",        pointValue: 5,   tick: 1 },
  MYM: { name: "Micro Dow",         pointValue: 0.5, tick: 1 },
  RTY: { name: "E-mini Russell",    pointValue: 50,  tick: 0.1 },
  M2K: { name: "Micro Russell",     pointValue: 5,   tick: 0.1 },
  BTC: { name: "Bitcoin Futures",   pointValue: 5,   tick: 5 },
  SPY: { name: "SPY ETF",           pointValue: 1,   tick: 0.01 },
};

const SETUPS = [
  "Liquidity Sweep", "FVG", "IFVG", "Order Block", "Breaker Block", "BOS",
  "CHoCH", "VWAP Mean Reversion", "SMT", "Volume Imbalance", "Liquidity Void",
  "ERL", "IRL", "Mean Reversion", "Order Flow", "Delta", "CVD", "Other",
];

const MISTAKES = [
  "Entered too early", "Entered too late", "Moved SL", "Took profit too early",
  "Overtraded", "Revenge trade", "FOMO", "Ignored setup", "Oversized position",
  "Traded outside session", "Broke risk rules", "No confirmation",
  "Poor execution", "Other",
];

const SESSIONS = ["Asian", "London", "New York"];
const KILL_ZONES = ["Asian", "London", "NY AM", "NY PM"];
const MARKET_CONDITIONS = ["Trending", "Ranging", "Choppy", "Reversal"];
const PROP_FIRMS = ["None / Personal", "Topstep", "Lucid Trading", "Alpha Futures", "Other"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const RANGE_OPTIONS = ["Today", "7D", "30D", "3M", "6M", "1Y", "All Time"];

const TZ_OPTIONS = [
  { label: "Local Time", value: "__local__" },
  { label: "New York", value: "America/New_York" },
  { label: "Chicago", value: "America/Chicago" },
  { label: "London", value: "Europe/London" },
  { label: "UTC", value: "UTC" },
  { label: "Custom", value: "__custom__" },
];

// Session / kill-zone windows are defined in America/New_York wall-clock time,
// which is the standard reference used across futures markets. They are
// commonly-cited approximations (ICT-style kill zones in particular have no
// single official definition) so they're editable in Settings.
const DEFAULT_SESSION_DEFS = {
  Asian:      { start: "19:00", end: "04:00" },
  London:     { start: "03:00", end: "12:00" },
  "New York": { start: "08:00", end: "17:00" },
};
const DEFAULT_KILLZONE_DEFS = {
  Asian:   { start: "20:00", end: "22:00" },
  London:  { start: "02:00", end: "05:00" },
  "NY AM": { start: "08:30", end: "11:00" },
  "NY PM": { start: "13:30", end: "16:00" },
};

const DEFAULT_SETTINGS = {
  startingBalance: 50000,
  currentBalance: 50000,
  dailyLossLimit: 1000,
  maxDrawdownLimit: 2000,
  riskPerTradePercent: 1,
  accountType: "Evaluation",
  propFirm: "None / Personal",
  tradingTimezone: "America/New_York",
  customTimezone: "",
  sessionDefs: DEFAULT_SESSION_DEFS,
  killzoneDefs: DEFAULT_KILLZONE_DEFS,
};

const emptyTrade = () => ({
  id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  date: new Date().toISOString().slice(0, 10),
  time: new Date().toTimeString().slice(0, 5),
  instrument: "NQ",
  account: "Main",
  direction: "Long",
  entryPrice: "",
  stopLoss: "",
  takeProfit: "",
  exitPrice: "",
  contracts: "1",
  commission: "0",
  fees: "0",
  session: "New York",
  killZone: "NY AM",
  sessionAuto: true,
  marketCondition: "Trending",
  setups: [],
  setupQuality: 5,
  executionQuality: 5,
  riskMgmtQuality: 5,
  psychologyQuality: 5,
  mistakes: [],
  notes: "",
  strategyId: "",
  hasScreenshots: false,
});

/* ============================================================
   CALCULATIONS
   ============================================================ */

function num(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }

function computeTradeMetrics(trade) {
  const pv = (INSTRUMENTS[trade.instrument] || { pointValue: 1 }).pointValue;
  const dir = trade.direction === "Long" ? 1 : -1;
  const entry = num(trade.entryPrice), stop = num(trade.stopLoss), target = num(trade.takeProfit), exit = num(trade.exitPrice);
  const contracts = num(trade.contracts) || 0;
  const commission = num(trade.commission), fees = num(trade.fees);
  const riskDollar = Math.abs(entry - stop) * contracts * pv;
  const rewardDollar = Math.abs(target - entry) * contracts * pv;
  const rr = riskDollar > 0 ? rewardDollar / riskDollar : 0;
  const hasExit = trade.exitPrice !== "" && trade.exitPrice !== undefined && trade.exitPrice !== null;
  const grossPnl = hasExit ? (exit - entry) * dir * contracts * pv : 0;
  const netPnl = hasExit ? grossPnl - commission - fees : 0;
  const actualR = riskDollar > 0 && hasExit ? netPnl / riskDollar : 0;
  return { riskDollar, rewardDollar, rr, grossPnl, netPnl, actualR, hasExit, pv };
}
function withMetrics(trade) { return { ...trade, __m: computeTradeMetrics(trade) }; }

function inRange(dateStr, range) {
  if (range === "All Time") return true;
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  if (range === "Today") return d.toDateString() === now.toDateString();
  const days = { "7D": 7, "30D": 30, "3M": 90, "6M": 182, "1Y": 365 }[range] || 36500;
  const start = new Date(now); start.setDate(start.getDate() - days);
  return d >= start;
}

function aggregateStats(trades) {
  const closed = trades.filter((t) => t.__m.hasExit);
  const total = closed.length;
  const wins = closed.filter((t) => t.__m.netPnl > 0);
  const losses = closed.filter((t) => t.__m.netPnl < 0);
  const be = closed.filter((t) => t.__m.netPnl === 0);
  const grossProfit = wins.reduce((s, t) => s + t.__m.netPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.__m.netPnl, 0));
  const netPnl = grossProfit - grossLoss;
  const winRate = total ? (wins.length / total) * 100 : 0;
  const lossRate = total ? (losses.length / total) * 100 : 0;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
  const expectancy = (winRate / 100) * avgWin - (lossRate / 100) * avgLoss;
  const rrValues = closed.filter((t) => t.__m.riskDollar > 0).map((t) => t.__m.rr);
  const avgRR = rrValues.length ? rrValues.reduce((a, b) => a + b, 0) / rrValues.length : 0;
  const best = closed.reduce((m, t) => (t.__m.netPnl > (m?.__m.netPnl ?? -Infinity) ? t : m), null);
  const worst = closed.reduce((m, t) => (t.__m.netPnl < (m?.__m.netPnl ?? Infinity) ? t : m), null);
  const chron = [...closed].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  let curWin = 0, curLoss = 0, bestWinStreak = 0, worstLossStreak = 0;
  for (const t of chron) {
    if (t.__m.netPnl > 0) { curWin++; curLoss = 0; } else if (t.__m.netPnl < 0) { curLoss++; curWin = 0; } else { curWin = 0; curLoss = 0; }
    bestWinStreak = Math.max(bestWinStreak, curWin); worstLossStreak = Math.max(worstLossStreak, curLoss);
  }
  return { total, wins: wins.length, losses: losses.length, breakeven: be.length, grossProfit, grossLoss, netPnl,
    winRate, lossRate, avgWin, avgLoss, profitFactor, expectancy, avgRR, best, worst, bestWinStreak, worstLossStreak, chron };
}

function equityCurve(closedChron, startingBalance) {
  let bal = startingBalance;
  const points = [{ idx: 0, date: "Start", balance: bal }];
  closedChron.forEach((t, i) => { bal += t.__m.netPnl; points.push({ idx: i + 1, date: t.date, balance: Math.round(bal * 100) / 100 }); });
  return points;
}
function maxDrawdown(points) {
  let peak = -Infinity, maxDd = 0, maxDdPct = 0;
  for (const p of points) { peak = Math.max(peak, p.balance); const dd = peak - p.balance; maxDd = Math.max(maxDd, dd); maxDdPct = Math.max(maxDdPct, peak > 0 ? (dd / peak) * 100 : 0); }
  return { maxDd, maxDdPct };
}
function groupBy(arr, keyFn) { const m = new Map(); for (const item of arr) { const k = keyFn(item); if (!m.has(k)) m.set(k, []); m.get(k).push(item); } return m; }
function fmtMoney(n) { const sign = n < 0 ? "-" : ""; return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtPct(n) { return `${n.toFixed(1)}%`; }
function fmtNum(n, d = 2) { return Number.isFinite(n) ? n.toFixed(d) : "—"; }

/* ============================================================
   TIMEZONE / SESSION ENGINE
   ============================================================ */

function resolveTz(settings) {
  if (settings.tradingTimezone === "__local__") return Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (settings.tradingTimezone === "__custom__") return settings.customTimezone || "America/New_York";
  return settings.tradingTimezone;
}

function parseHM(hm) { const [h, m] = hm.split(":").map(Number); return h * 60 + m; }

// current wall-clock time in a given IANA tz, in seconds-since-midnight
function nowSecondsInTz(tz) {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const parts = Object.fromEntries(dtf.formatToParts(new Date()).map((p) => [p.type, p.value]));
    const h = parts.hour === "24" ? 0 : Number(parts.hour);
    return h * 3600 + Number(parts.minute) * 60 + Number(parts.second);
  } catch (e) { return null; }
}

// Convert a wall-clock date+time entered in `fromTz` into the equivalent
// wall-clock minutes-of-day in `toTz`, correctly handling DST via the IANA
// database (no fixed hour offsets).
function convertWallTime(dateStr, timeStr, fromTz, toTz) {
  try {
    const [y, mo, d] = dateStr.split("-").map(Number);
    const [hh, mm] = timeStr.split(":").map(Number);
    let guess = Date.UTC(y, mo - 1, d, hh, mm, 0);
    for (let i = 0; i < 3; i++) {
      const dtf = new Intl.DateTimeFormat("en-US", { timeZone: fromTz, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const p = Object.fromEntries(dtf.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
      const shownUtc = Date.UTC(+p.year, +p.month - 1, +p.day, p.hour === "24" ? 0 : +p.hour, +p.minute, +p.second);
      const errorMs = shownUtc - Date.UTC(y, mo - 1, d, hh, mm, 0);
      guess -= errorMs;
    }
    const outFmt = new Intl.DateTimeFormat("en-US", { timeZone: toTz, hour12: false, hour: "2-digit", minute: "2-digit" });
    const outParts = Object.fromEntries(outFmt.formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    const h = outParts.hour === "24" ? 0 : Number(outParts.hour);
    return h * 60 + Number(outParts.minute);
  } catch (e) { return null; }
}

function inWindow(startMin, endMin, t) {
  if (startMin <= endMin) return t >= startMin && t < endMin;
  return t >= startMin || t < endMin;
}

function windowStatus(startMin, endMin, nowTotalSec) {
  const DAY = 86400, startSec = startMin * 60, endSec = endMin * 60;
  const wraps = startMin > endMin;
  const active = wraps ? (nowTotalSec >= startSec || nowTotalSec < endSec) : (nowTotalSec >= startSec && nowTotalSec < endSec);
  let secondsRemaining = 0, secondsToStart = 0;
  if (active) {
    secondsRemaining = wraps && nowTotalSec >= startSec ? (DAY - nowTotalSec + endSec) : (endSec - nowTotalSec);
  } else {
    secondsToStart = nowTotalSec < startSec ? (startSec - nowTotalSec) : (DAY - nowTotalSec + startSec);
  }
  return { active, secondsRemaining, secondsToStart };
}

function classifyByMinute(defs, order, minute) {
  for (const name of order) {
    const d = defs[name]; if (!d) continue;
    if (inWindow(parseHM(d.start), parseHM(d.end), minute)) return name;
  }
  return null;
}

function fmtHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}

function useTicker(intervalMs = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick((x) => x + 1), intervalMs); return () => clearInterval(id); }, [intervalMs]);
}

/* ============================================================
   STORAGE HELPERS
   ============================================================ */

async function storageGet(key, fallback) {
  try { const res = await window.storage.get(key, false); if (!res) return fallback; return JSON.parse(res.value); }
  catch (e) { return fallback; }
}
async function storageSet(key, value) { try { await window.storage.set(key, JSON.stringify(value), false); return true; } catch (e) { return false; } }
async function storageDelete(key) { try { await window.storage.delete(key, false); } catch (e) { /* ignore */ } }

/* ============================================================
   UI PRIMITIVES + GLOBAL STYLE
   ============================================================ */

const GlobalStyle = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap');
    :root{
      --bg:#0a0b0d; --panel:#121317; --panel2:#17181d; --border:#26282e;
      --text:#e7e8ea; --dim:#8b8d93; --dim2:#5c5e66;
      --amber:#d4a64a; --amber-dim:#8a6f35; --green:#22c55e; --green-dim:#163b26;
      --red:#ef4444; --red-dim:#3b1616; --blue:#5b8def; --blue-dim:#16233b;
    }
    * { box-sizing: border-box; }
    .tj-root{ background:var(--bg); color:var(--text); min-height:100%; font-family:'IBM Plex Sans', system-ui, sans-serif; font-size:14px; display:flex; width:100%; }
    .tj-mono{ font-family:'IBM Plex Mono', monospace; }
    .tj-sidebar{ width:220px; flex-shrink:0; background:var(--panel); border-right:1px solid var(--border); display:flex; flex-direction:column; padding:18px 10px; overflow-y:auto; }
    .tj-brand{ padding:4px 10px 18px 10px; border-bottom:1px solid var(--border); margin-bottom:12px;}
    .tj-brand-title{ font-family:'IBM Plex Mono'; font-weight:700; font-size:16px; letter-spacing:1px; color:var(--amber); }
    .tj-brand-sub{ color:var(--dim2); font-size:11px; margin-top:2px;}
    .tj-navgroup{ color:var(--dim2); font-size:10px; text-transform:uppercase; letter-spacing:0.6px; margin:14px 10px 4px 10px; }
    .tj-navitem{ display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:5px; color:var(--dim); cursor:pointer; font-size:13px; margin-bottom:1px; border:1px solid transparent; transition:background .12s, color .12s; }
    .tj-navitem:hover{ background:var(--panel2); color:var(--text); }
    .tj-navitem.active{ background:var(--panel2); color:var(--amber); border-color:var(--border); }
    .tj-main{ flex:1; min-width:0; padding:22px 28px 60px 28px; overflow-x:hidden; }
    .tj-h1{ font-size:19px; font-weight:600; margin:0 0 2px 0; }
    .tj-sub{ color:var(--dim); font-size:12.5px; margin:0 0 20px 0; }
    .tj-grid{ display:grid; gap:12px; }
    .tj-card{ background:var(--panel); border:1px solid var(--border); border-radius:6px; padding:14px 16px; }
    .tj-kpi-label{ color:var(--dim); font-size:11px; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:6px;}
    .tj-kpi-value{ font-family:'IBM Plex Mono'; font-size:20px; font-weight:600; }
    .tj-pos{ color:var(--green); } .tj-neg{ color:var(--red); } .tj-neutral{ color:var(--text); } .tj-info{ color:var(--blue); }
    .tj-btn{ background:var(--panel2); border:1px solid var(--border); color:var(--text); padding:7px 12px; border-radius:5px; font-size:12.5px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:border-color .12s; }
    .tj-btn:hover{ border-color:var(--amber-dim); }
    .tj-btn.primary{ background:var(--amber); color:#1a1305; border-color:var(--amber); font-weight:600; }
    .tj-btn.primary:hover{ opacity:0.92; }
    .tj-btn.danger{ color:var(--red); }
    .tj-btn.disabled{ opacity:0.45; cursor:not-allowed; pointer-events:none; }
    .tj-input, .tj-select, .tj-textarea{ width:100%; background:var(--bg); border:1px solid var(--border); color:var(--text); padding:7px 9px; border-radius:5px; font-size:13px; font-family:inherit; }
    .tj-input:focus, .tj-select:focus, .tj-textarea:focus{ outline:none; border-color:var(--amber-dim); }
    .tj-label{ color:var(--dim); font-size:11px; margin-bottom:4px; display:block; text-transform:uppercase; letter-spacing:0.4px;}
    .tj-field{ margin-bottom:10px; }
    .tj-chip{ display:inline-flex; align-items:center; gap:4px; padding:4px 9px; border-radius:20px; border:1px solid var(--border); font-size:11.5px; cursor:pointer; color:var(--dim); user-select:none; }
    .tj-chip.selected{ background:var(--amber-dim); border-color:var(--amber); color:#f2e2bd; }
    .tj-table{ width:100%; border-collapse:collapse; font-size:12.5px; }
    .tj-table th{ text-align:left; color:var(--dim); font-weight:500; font-size:11px; text-transform:uppercase; letter-spacing:0.4px; padding:8px 10px; border-bottom:1px solid var(--border); white-space:nowrap; }
    .tj-table td{ padding:8px 10px; border-bottom:1px solid var(--border); white-space:nowrap; }
    .tj-table tr:hover td{ background:var(--panel2); cursor:pointer; }
    .tj-badge{ padding:2px 7px; border-radius:4px; font-size:11px; font-family:'IBM Plex Mono'; }
    .tj-badge.win{ background:var(--green-dim); color:var(--green); }
    .tj-badge.loss{ background:var(--red-dim); color:var(--red); }
    .tj-badge.be{ background:var(--panel2); color:var(--dim); }
    .tj-modal-backdrop{ position:fixed; inset:0; background:rgba(0,0,0,0.6); display:flex; align-items:flex-start; justify-content:center; z-index:100; padding:30px 16px; overflow-y:auto; }
    .tj-modal{ background:var(--panel); border:1px solid var(--border); border-radius:8px; width:100%; max-width:720px; padding:20px 22px 22px 22px; }
    .tj-modal-header{ display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }
    .tj-tabbar{ display:flex; gap:4px; border-bottom:1px solid var(--border); margin-bottom:16px; flex-wrap:wrap; }
    .tj-tabbtn{ padding:8px 12px; font-size:12.5px; color:var(--dim); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
    .tj-tabbtn.active{ color:var(--amber); border-color:var(--amber); }
    .tj-empty{ text-align:center; padding:50px 20px; color:var(--dim); }
    .tj-empty-title{ color:var(--text); font-size:14px; margin-bottom:6px; }
    .tj-section-title{ font-size:13px; font-weight:600; margin:18px 0 8px 0; color:var(--text); }
    .tj-scroll{ overflow-x:auto; }
    ::-webkit-scrollbar{ width:8px; height:8px; }
    ::-webkit-scrollbar-thumb{ background:var(--border); border-radius:4px; }
    .tj-day-cell{ border:1px solid var(--border); border-radius:5px; min-height:64px; padding:6px 7px; cursor:pointer; transition:border-color .12s; }
    .tj-day-cell:hover{ border-color:var(--amber-dim); }
    .tj-day-cell.profit{ background:rgba(34,197,94,0.08); }
    .tj-day-cell.loss{ background:rgba(239,68,68,0.08); }
    .tj-msg-user{ background:var(--panel2); border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:10px; }
    .tj-msg-ai{ background:transparent; border-left:2px solid var(--amber-dim); padding:4px 0 4px 12px; margin-bottom:16px; white-space:pre-wrap; line-height:1.55; }
    .tj-progress-bar{ height:8px; background:var(--panel2); border-radius:4px; overflow:hidden; border:1px solid var(--border); }
    .tj-progress-fill{ height:100%; background:var(--amber); }
    .tj-dot{ display:inline-block; width:8px; height:8px; border-radius:50%; margin-right:6px; }
  `}</style>
);

function Kpi({ label, value, tone }) {
  const cls = tone === "pos" ? "tj-pos" : tone === "neg" ? "tj-neg" : tone === "info" ? "tj-info" : "tj-neutral";
  return (<div className="tj-card"><div className="tj-kpi-label">{label}</div><div className={`tj-kpi-value tj-mono ${cls}`}>{value}</div></div>);
}
function Chip({ label, selected, onClick }) { return (<span className={`tj-chip ${selected ? "selected" : ""}`} onClick={onClick}>{selected && <Check size={11} />} {label}</span>); }
function Field({ label, children }) { return (<div className="tj-field"><label className="tj-label">{label}</label>{children}</div>); }
function ProgressBar({ pct, color }) { return (<div className="tj-progress-bar"><div className="tj-progress-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color || "var(--amber)" }} /></div>); }

/* ============================================================
   SESSION / KILL ZONE WIDGETS (Dashboard)
   ============================================================ */

function MarketSessionsCard({ settings }) {
  useTicker(1000);
  const nowSec = nowSecondsInTz("America/New_York");
  if (nowSec == null) return null;

  const rows = SESSIONS.map((name) => {
    const d = settings.sessionDefs[name] || DEFAULT_SESSION_DEFS[name];
    const st = windowStatus(parseHM(d.start), parseHM(d.end), nowSec);
    return { name, d, ...st };
  });
  const active = rows.filter((r) => r.active).sort((a, b) => a.secondsRemaining - b.secondsRemaining)[0];
  const next = rows.filter((r) => !r.active).sort((a, b) => a.secondsToStart - b.secondsToStart)[0];

  return (
    <div className="tj-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="tj-kpi-label" style={{ marginBottom: 0 }}>Market Sessions (ET)</div>
        {active ? (
          <span className="tj-mono tj-pos" style={{ fontSize: 12 }}>● {active.name} — {fmtHMS(active.secondsRemaining)} remaining</span>
        ) : next ? (
          <span className="tj-mono" style={{ fontSize: 12, color: "var(--dim)" }}>{next.name} opens in {fmtHMS(next.secondsToStart)}</span>
        ) : null}
      </div>
      <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {rows.map((r) => (
          <div key={r.name} className="tj-card" style={{ background: "var(--panel2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{r.name}</span>
              <span className="tj-dot" style={{ background: r.active ? "var(--green)" : "var(--dim2)" }} />
            </div>
            <div className="tj-mono" style={{ fontSize: 11, color: "var(--dim)", marginTop: 4 }}>{r.d.start} – {r.d.end} ET</div>
            <div className="tj-mono" style={{ fontSize: 12, marginTop: 6 }}>
              {r.active ? <span className="tj-pos">ACTIVE — {fmtHMS(r.secondsRemaining)}</span> : <span style={{ color: "var(--dim)" }}>Starts in {fmtHMS(r.secondsToStart)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KillZonesCard({ settings }) {
  useTicker(1000);
  const nowSec = nowSecondsInTz("America/New_York");
  if (nowSec == null) return null;
  const rows = KILL_ZONES.map((name) => {
    const d = settings.killzoneDefs[name] || DEFAULT_KILLZONE_DEFS[name];
    const st = windowStatus(parseHM(d.start), parseHM(d.end), nowSec);
    return { name, d, ...st };
  });
  return (
    <div className="tj-card">
      <div className="tj-kpi-label" style={{ marginBottom: 10 }}>Kill Zones (ET)</div>
      <div className="tj-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        {rows.map((r) => (
          <div key={r.name} className="tj-card" style={{ background: "var(--panel2)" }}>
            <div style={{ fontWeight: 600, fontSize: 12.5 }}>{r.name} KZ</div>
            <div className="tj-mono" style={{ fontSize: 10.5, color: "var(--dim)", marginTop: 4 }}>{r.d.start} – {r.d.end}</div>
            <div className="tj-mono" style={{ fontSize: 11.5, marginTop: 6 }}>
              {r.active ? <span className="tj-pos">🟢 ACTIVE — {fmtHMS(r.secondsRemaining)}</span> : <span style={{ color: "var(--dim)" }}>🔴 Next in {fmtHMS(r.secondsToStart)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionTimeline({ settings }) {
  useTicker(5000);
  const nowSec = nowSecondsInTz("America/New_York");
  if (nowSec == null) return null;
  const nowPct = (nowSec / 86400) * 100;
  const W = 1000, H = 70;
  const barY = 18, barH = 20;

  const toX = (min) => (min / 1440) * W;
  const segs = [];
  SESSIONS.forEach((name, i) => {
    const d = settings.sessionDefs[name] || DEFAULT_SESSION_DEFS[name];
    const s = parseHM(d.start), e = parseHM(d.end);
    const color = ["#5b8def", "#d4a64a", "#22c55e"][i];
    if (s <= e) segs.push({ x: toX(s), w: toX(e) - toX(s), color, name });
    else { segs.push({ x: toX(s), w: toX(1440) - toX(s), color, name }); segs.push({ x: 0, w: toX(e), color, name }); }
  });
  const kzMarks = KILL_ZONES.map((name) => {
    const d = settings.killzoneDefs[name] || DEFAULT_KILLZONE_DEFS[name];
    const s = parseHM(d.start), e = parseHM(d.end);
    return { x: toX(s), w: Math.max(2, toX(e) - toX(s)), name };
  });

  return (
    <div className="tj-card">
      <div className="tj-kpi-label" style={{ marginBottom: 10 }}>24h Session Timeline (ET)</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="70" preserveAspectRatio="none">
        <rect x={0} y={barY} width={W} height={barH} fill="#17181d" stroke="#26282e" />
        {segs.map((s, i) => <rect key={i} x={s.x} y={barY} width={s.w} height={barH} fill={s.color} opacity={0.35} />)}
        {kzMarks.map((k, i) => <rect key={i} x={k.x} y={barY + barH + 4} width={k.w} height={6} fill="#d4a64a" />)}
        <line x1={(nowSec / 86400) * W} x2={(nowSec / 86400) * W} y1={barY - 4} y2={barY + barH + 14} stroke="#ef4444" strokeWidth={2} />
        {[0, 6, 12, 18, 24].map((h) => (
          <text key={h} x={(h / 24) * W} y={H - 2} fill="#5c5e66" fontSize="9" fontFamily="IBM Plex Mono">{String(h).padStart(2, "0")}:00</text>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 14, marginTop: 4, flexWrap: "wrap" }}>
        {SESSIONS.map((s, i) => (
          <span key={s} style={{ fontSize: 11, color: "var(--dim)" }}>
            <span className="tj-dot" style={{ background: ["#5b8def", "#d4a64a", "#22c55e"][i] }} />{s}
          </span>
        ))}
        <span style={{ fontSize: 11, color: "var(--dim)" }}><span className="tj-dot" style={{ background: "#d4a64a" }} />Kill Zones</span>
        <span style={{ fontSize: 11, color: "var(--dim)" }}><span className="tj-dot" style={{ background: "#ef4444" }} />Now</span>
      </div>
    </div>
  );
}

function MarketStatusBadge({ settings }) {
  useTicker(1000);
  const nowSec = nowSecondsInTz("America/New_York");
  if (nowSec == null) return null;
  const kzRows = KILL_ZONES.map((name) => {
    const d = settings.killzoneDefs[name] || DEFAULT_KILLZONE_DEFS[name];
    return { name, ...windowStatus(parseHM(d.start), parseHM(d.end), nowSec) };
  });
  const activeKz = kzRows.find((r) => r.active);
  const sessRows = SESSIONS.map((name) => {
    const d = settings.sessionDefs[name] || DEFAULT_SESSION_DEFS[name];
    return { name, ...windowStatus(parseHM(d.start), parseHM(d.end), nowSec) };
  });
  const activeSess = sessRows.find((r) => r.active);
  return (
    <div className="tj-card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span className="tj-dot" style={{ background: activeKz ? "var(--green)" : "var(--dim2)" }} />
      <span className="tj-mono" style={{ fontSize: 12.5 }}>
        {activeKz ? `${activeKz.name} Kill Zone — ACTIVE, ends in ${fmtHMS(activeKz.secondsRemaining)}` : "No kill zone currently active"}
        {activeSess ? ` · Session: ${activeSess.name}` : ""}
      </span>
    </div>
  );
}

/* ============================================================
   TRADE FORM
   ============================================================ */

function TradeForm({ initial, onSave, onClose, riskLimitPercent, startingBalance, settings, strategies }) {
  const [t, setT] = useState(initial || emptyTrade());
  const m = useMemo(() => computeTradeMetrics(t), [t]);
  const riskPct = startingBalance > 0 ? (m.riskDollar / startingBalance) * 100 : 0;
  const overRisk = riskLimitPercent > 0 && riskPct > riskLimitPercent;

  // Auto-detect session / kill zone from entry date+time using configured trading timezone
  useEffect(() => {
    if (!t.sessionAuto || !t.date || !t.time) return;
    const tz = resolveTz(settings);
    const etMin = convertWallTime(t.date, t.time, tz, "America/New_York");
    if (etMin == null) return;
    const sess = classifyByMinute(settings.sessionDefs, ["New York", "London", "Asian"], etMin) || t.session;
    const kz = classifyByMinute(settings.killzoneDefs, ["NY PM", "NY AM", "London", "Asian"], etMin);
    setT((p) => ({ ...p, session: sess, killZone: kz || p.killZone }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.date, t.time]);

  const set = (k) => (e) => setT((p) => ({ ...p, [k]: e.target.value }));
  const setManual = (k) => (e) => setT((p) => ({ ...p, [k]: e.target.value, sessionAuto: false }));
  const toggleSetup = (s) => setT((p) => ({ ...p, setups: p.setups.includes(s) ? p.setups.filter((x) => x !== s) : [...p.setups, s] }));
  const toggleMistake = (s) => setT((p) => ({ ...p, mistakes: p.mistakes.includes(s) ? p.mistakes.filter((x) => x !== s) : [...p.mistakes, s] }));

  const invalid = t.entryPrice === "" || t.stopLoss === "" || t.takeProfit === "" || num(t.contracts) <= 0 ||
    (t.direction === "Long" && num(t.stopLoss) >= num(t.entryPrice)) ||
    (t.direction === "Short" && num(t.stopLoss) <= num(t.entryPrice));

  return (
    <div className="tj-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tj-modal">
        <div className="tj-modal-header">
          <div className="tj-h1" style={{ marginBottom: 0 }}>{initial ? "Edit Trade" : "New Trade"}</div>
          <span className="tj-btn" onClick={onClose}><X size={14} /></span>
        </div>

        <div className="tj-section-title">Basic Information</div>
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <Field label="Date"><input type="date" className="tj-input" value={t.date} onChange={set("date")} /></Field>
          <Field label="Time"><input type="time" className="tj-input" value={t.time} onChange={set("time")} /></Field>
          <Field label="Instrument">
            <select className="tj-select" value={t.instrument} onChange={set("instrument")}>{Object.keys(INSTRUMENTS).map((k) => <option key={k} value={k}>{k}</option>)}</select>
          </Field>
          <Field label="Direction"><select className="tj-select" value={t.direction} onChange={set("direction")}><option>Long</option><option>Short</option></select></Field>
          <Field label="Account"><input className="tj-input" value={t.account} onChange={set("account")} /></Field>
          <Field label="Entry Price"><input type="number" step="any" className="tj-input" value={t.entryPrice} onChange={set("entryPrice")} /></Field>
          <Field label="Stop Loss"><input type="number" step="any" className="tj-input" value={t.stopLoss} onChange={set("stopLoss")} /></Field>
          <Field label="Take Profit"><input type="number" step="any" className="tj-input" value={t.takeProfit} onChange={set("takeProfit")} /></Field>
          <Field label="Exit Price (blank if open)"><input type="number" step="any" className="tj-input" value={t.exitPrice} onChange={set("exitPrice")} /></Field>
          <Field label="Contracts"><input type="number" step="1" min="1" className="tj-input" value={t.contracts} onChange={set("contracts")} /></Field>
          <Field label="Commission ($)"><input type="number" step="any" className="tj-input" value={t.commission} onChange={set("commission")} /></Field>
          <Field label="Fees ($)"><input type="number" step="any" className="tj-input" value={t.fees} onChange={set("fees")} /></Field>
        </div>

        <div className="tj-card" style={{ marginTop: 4, marginBottom: 4 }}>
          <div className="tj-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
            <div><div className="tj-kpi-label">Risk $</div><div className="tj-mono">{fmtMoney(m.riskDollar)}</div></div>
            <div><div className="tj-kpi-label">Risk %</div><div className={`tj-mono ${overRisk ? "tj-neg" : ""}`}>{fmtPct(riskPct)}</div></div>
            <div><div className="tj-kpi-label">Reward $</div><div className="tj-mono">{fmtMoney(m.rewardDollar)}</div></div>
            <div><div className="tj-kpi-label">R:R</div><div className="tj-mono">{fmtNum(m.rr)}</div></div>
            <div><div className="tj-kpi-label">Gross P&amp;L</div><div className={`tj-mono ${m.grossPnl > 0 ? "tj-pos" : m.grossPnl < 0 ? "tj-neg" : ""}`}>{m.hasExit ? fmtMoney(m.grossPnl) : "—"}</div></div>
            <div><div className="tj-kpi-label">Net P&amp;L</div><div className={`tj-mono ${m.netPnl > 0 ? "tj-pos" : m.netPnl < 0 ? "tj-neg" : ""}`}>{m.hasExit ? fmtMoney(m.netPnl) : "—"}</div></div>
            <div><div className="tj-kpi-label">Realized R</div><div className="tj-mono">{m.hasExit ? fmtNum(m.actualR) : "—"}</div></div>
          </div>
          {overRisk && <div className="tj-neg" style={{ marginTop: 8, fontSize: 12, display: "flex", gap: 6, alignItems: "center" }}><AlertTriangle size={14} /> Risk exceeds your configured risk limit ({riskLimitPercent}%).</div>}
          {invalid && <div style={{ marginTop: 8, fontSize: 12, color: "var(--dim)" }}>Enter entry, stop and target, with the stop on the correct side of entry for a {t.direction.toLowerCase()} trade.</div>}
        </div>

        <div className="tj-section-title">Market {t.sessionAuto && <span style={{ fontWeight: 400, color: "var(--dim)", fontSize: 11 }}>(session/kill zone auto-detected from entry time — change to override)</span>}</div>
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <Field label="Session"><select className="tj-select" value={t.session} onChange={setManual("session")}>{SESSIONS.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Kill Zone"><select className="tj-select" value={t.killZone} onChange={setManual("killZone")}>{KILL_ZONES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Market Condition"><select className="tj-select" value={t.marketCondition} onChange={set("marketCondition")}>{MARKET_CONDITIONS.map((s) => <option key={s}>{s}</option>)}</select></Field>
        </div>

        <div className="tj-section-title">Setup (select any)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{SETUPS.map((s) => <Chip key={s} label={s} selected={t.setups.includes(s)} onClick={() => toggleSetup(s)} />)}</div>

        {strategies.length > 0 && (
          <>
            <div className="tj-section-title">Strategy Lab Link</div>
            <select className="tj-select" value={t.strategyId} onChange={set("strategyId")}>
              <option value="">— none —</option>
              {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </>
        )}

        <div className="tj-section-title">Trade Quality (1–10)</div>
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          {[["setupQuality", "Setup"], ["executionQuality", "Execution"], ["riskMgmtQuality", "Risk Mgmt"], ["psychologyQuality", "Psychology"]].map(([k, l]) => (
            <Field key={k} label={`${l}: ${t[k]}`}><input type="range" min="1" max="10" className="tj-input" value={t[k]} onChange={set(k)} style={{ padding: 0 }} /></Field>
          ))}
        </div>

        <div className="tj-section-title">Mistakes (if any)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{MISTAKES.map((s) => <Chip key={s} label={s} selected={t.mistakes.includes(s)} onClick={() => toggleMistake(s)} />)}</div>

        <div className="tj-section-title">Trade Notes</div>
        <textarea className="tj-textarea" rows={3} value={t.notes} onChange={set("notes")} placeholder="What happened, what you saw, how you executed..." />

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <span className="tj-btn" onClick={onClose}>Cancel</span>
          <span className={`tj-btn primary ${invalid ? "disabled" : ""}`} onClick={() => { if (!invalid) onSave(t); }}><Check size={14} /> Save Trade</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   SCREENSHOTS
   ============================================================ */

function resizeImage(file, maxW = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

function ScreenshotSlot({ label, value, onChange }) {
  const inputRef = useRef(null);
  return (
    <div className="tj-card" style={{ padding: 10 }}>
      <div className="tj-kpi-label" style={{ marginBottom: 8 }}>{label}</div>
      {value ? (
        <div style={{ position: "relative" }}>
          <img src={value} alt={label} style={{ width: "100%", borderRadius: 4, display: "block" }} />
          <span className="tj-btn danger" style={{ position: "absolute", top: 6, right: 6, padding: "4px 7px" }} onClick={() => onChange(null)}><Trash2 size={12} /></span>
        </div>
      ) : (
        <div onClick={() => inputRef.current?.click()} onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onChange(await resizeImage(f)); }}
          style={{ border: "1px dashed var(--border)", borderRadius: 4, height: 110, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--dim)", flexDirection: "column", gap: 6 }}>
          <ImagePlus size={18} /><span style={{ fontSize: 11 }}>Upload or drag & drop</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => { const f = e.target.files?.[0]; if (f) onChange(await resizeImage(f)); e.target.value = ""; }} />
    </div>
  );
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function Dashboard({ trades, settings, range, setRange }) {
  const filtered = useMemo(() => trades.filter((t) => inRange(t.date, range)).map(withMetrics), [trades, range]);
  const stats = useMemo(() => aggregateStats(filtered), [filtered]);
  const chronAll = useMemo(() => trades.map(withMetrics).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).filter((t) => t.__m.hasExit), [trades]);
  const eqAll = useMemo(() => equityCurve(chronAll, settings.startingBalance), [chronAll, settings.startingBalance]);
  const dd = useMemo(() => maxDrawdown(eqAll), [eqAll]);
  const dailyPnl = useMemo(() => {
    const m = groupBy(stats.chron, (t) => t.date);
    return Array.from(m.entries()).map(([date, arr]) => ({ date, pnl: arr.reduce((s, t) => s + t.__m.netPnl, 0) })).sort((a, b) => a.date.localeCompare(b.date));
  }, [stats.chron]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div><div className="tj-h1">Dashboard</div><div className="tj-sub">{APP_NAME} — performance overview, {range}</div></div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {RANGE_OPTIONS.map((r) => (
            <span key={r} className="tj-btn" style={{ background: r === range ? "var(--amber-dim)" : "var(--panel2)", borderColor: r === range ? "var(--amber)" : "var(--border)" }} onClick={() => setRange(r)}>{r}</span>
          ))}
        </div>
      </div>

      <MarketStatusBadge settings={settings} />
      <div style={{ height: 12 }} />
      <div className="tj-grid" style={{ gridTemplateColumns: "1fr" }}>
        <MarketSessionsCard settings={settings} />
        <KillZonesCard settings={settings} />
        <SessionTimeline settings={settings} />
      </div>

      {trades.length === 0 ? (
        <div className="tj-card tj-empty" style={{ marginTop: 14 }}>
          <div className="tj-empty-title">No trades recorded yet.</div>
          <div>Go to <strong>Trades</strong> and log your first operation to unlock performance KPIs, the equity curve and analytics.</div>
        </div>
      ) : (
        <>
          <div className="tj-section-title">Performance KPIs</div>
          <div className="tj-grid" style={{ gridTemplateColumns: "repeat(6,1fr)" }}>
            <Kpi label="Net P&L" value={fmtMoney(stats.netPnl)} tone={stats.netPnl >= 0 ? "pos" : "neg"} />
            <Kpi label="Win Rate" value={fmtPct(stats.winRate)} />
            <Kpi label="Profit Factor" value={Number.isFinite(stats.profitFactor) ? fmtNum(stats.profitFactor) : "∞"} />
            <Kpi label="Expectancy" value={fmtMoney(stats.expectancy)} tone={stats.expectancy >= 0 ? "pos" : "neg"} />
            <Kpi label="Avg R:R" value={fmtNum(stats.avgRR)} />
            <Kpi label="Max Drawdown" value={fmtMoney(dd.maxDd)} tone="neg" />
            <Kpi label="Gross Profit" value={fmtMoney(stats.grossProfit)} tone="pos" />
            <Kpi label="Gross Loss" value={fmtMoney(-stats.grossLoss)} tone="neg" />
            <Kpi label="Loss Rate" value={fmtPct(stats.lossRate)} />
            <Kpi label="Average Win" value={fmtMoney(stats.avgWin)} tone="pos" />
            <Kpi label="Average Loss" value={fmtMoney(-stats.avgLoss)} tone="neg" />
            <Kpi label="Total Trades" value={stats.total} />
            <Kpi label="Winning Trades" value={stats.wins} tone="pos" />
            <Kpi label="Losing Trades" value={stats.losses} tone="neg" />
            <Kpi label="Breakeven Trades" value={stats.breakeven} />
            <Kpi label="Best Trade" value={stats.best ? fmtMoney(stats.best.__m.netPnl) : "—"} tone="pos" />
            <Kpi label="Worst Trade" value={stats.worst ? fmtMoney(stats.worst.__m.netPnl) : "—"} tone="neg" />
            <Kpi label="Best Win Streak" value={stats.bestWinStreak} />
          </div>

          <div className="tj-section-title">Equity Curve (all time)</div>
          <div className="tj-card">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={eqAll}>
                <defs><linearGradient id="eq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#d4a64a" stopOpacity={0.35} /><stop offset="100%" stopColor="#d4a64a" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="#26282e" strokeDasharray="3 3" />
                <XAxis dataKey="idx" stroke="#5c5e66" tick={{ fontSize: 11 }} />
                <YAxis stroke="#5c5e66" tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip contentStyle={{ background: "#121317", border: "1px solid #26282e", fontSize: 12 }} />
                <ReferenceLine y={settings.startingBalance} stroke="#5c5e66" strokeDasharray="4 4" />
                <Area type="monotone" dataKey="balance" stroke="#d4a64a" fill="url(#eq)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="tj-section-title">Daily P&L — {range}</div>
          <div className="tj-card">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyPnl}>
                <CartesianGrid stroke="#26282e" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#5c5e66" tick={{ fontSize: 10 }} />
                <YAxis stroke="#5c5e66" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#121317", border: "1px solid #26282e", fontSize: 12 }} />
                <ReferenceLine y={0} stroke="#5c5e66" />
                <Bar dataKey="pnl">{dailyPnl.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? "#22c55e" : "#ef4444"} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   TRADE LIBRARY
   ============================================================ */

function TradeLibrary({ trades, strategies, onEdit, onDelete, onOpen, onNew }) {
  const [q, setQ] = useState(""); const [fInstrument, setFInstrument] = useState("All");
  const [fDirection, setFDirection] = useState("All"); const [fResult, setFResult] = useState("All");
  const stratName = (id) => strategies.find((s) => s.id === id)?.name || "";

  const filtered = useMemo(() => trades.map(withMetrics).filter((t) => {
    if (fInstrument !== "All" && t.instrument !== fInstrument) return false;
    if (fDirection !== "All" && t.direction !== fDirection) return false;
    if (fResult !== "All") { const res = t.__m.netPnl > 0 ? "Win" : t.__m.netPnl < 0 ? "Loss" : "Breakeven"; if (res !== fResult) return false; }
    if (q) { const hay = `${t.instrument} ${t.setups.join(" ")} ${t.notes} ${t.session} ${stratName(t.strategyId)}`.toLowerCase(); if (!hay.includes(q.toLowerCase())) return false; }
    return true;
  }).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)), [trades, q, fInstrument, fDirection, fResult]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div><div className="tj-h1">Trade Library</div><div className="tj-sub">{filtered.length} of {trades.length} trades</div></div>
        <span className="tj-btn primary" onClick={onNew}><Plus size={14} /> New Trade</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0 14px 0" }}>
        <div style={{ position: "relative", minWidth: 200 }}><Search size={13} style={{ position: "absolute", left: 8, top: 9, color: "var(--dim)" }} /><input className="tj-input" style={{ paddingLeft: 26 }} placeholder="Search notes, setup, strategy..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="tj-select" style={{ width: 140 }} value={fInstrument} onChange={(e) => setFInstrument(e.target.value)}><option>All</option>{Object.keys(INSTRUMENTS).map((k) => <option key={k}>{k}</option>)}</select>
        <select className="tj-select" style={{ width: 130 }} value={fDirection} onChange={(e) => setFDirection(e.target.value)}><option>All</option><option>Long</option><option>Short</option></select>
        <select className="tj-select" style={{ width: 140 }} value={fResult} onChange={(e) => setFResult(e.target.value)}><option>All</option><option>Win</option><option>Loss</option><option>Breakeven</option></select>
      </div>
      {trades.length === 0 ? (
        <div className="tj-card tj-empty"><div className="tj-empty-title">No trades recorded yet.</div><div>Click "New Trade" to log your first operation.</div></div>
      ) : (
        <div className="tj-card tj-scroll" style={{ padding: 0 }}>
          <table className="tj-table">
            <thead><tr><th>Date</th><th>Instrument</th><th>Dir</th><th>Entry</th><th>Exit</th><th>Contracts</th><th>R:R</th><th>Net P&L</th><th>Result</th><th>Strategy</th><th></th></tr></thead>
            <tbody>
              {filtered.map((t) => {
                const res = !t.__m.hasExit ? "Open" : t.__m.netPnl > 0 ? "Win" : t.__m.netPnl < 0 ? "Loss" : "BE";
                return (
                  <tr key={t.id} onClick={() => onOpen(t)}>
                    <td className="tj-mono">{t.date} {t.time}</td><td>{t.instrument}</td><td>{t.direction}</td>
                    <td className="tj-mono">{t.entryPrice}</td><td className="tj-mono">{t.exitPrice || "—"}</td><td className="tj-mono">{t.contracts}</td>
                    <td className="tj-mono">{fmtNum(t.__m.rr, 2)}</td>
                    <td className={`tj-mono ${t.__m.netPnl > 0 ? "tj-pos" : t.__m.netPnl < 0 ? "tj-neg" : ""}`}>{t.__m.hasExit ? fmtMoney(t.__m.netPnl) : "—"}</td>
                    <td><span className={`tj-badge ${res === "Win" ? "win" : res === "Loss" ? "loss" : "be"}`}>{res}</span></td>
                    <td style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{stratName(t.strategyId) || "—"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <span className="tj-btn" style={{ padding: "4px 6px", marginRight: 4 }} onClick={() => onEdit(t)}><Pencil size={12} /></span>
                      <span className="tj-btn danger" style={{ padding: "4px 6px" }} onClick={() => onDelete(t.id)}><Trash2 size={12} /></span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   TRADE REVIEW
   ============================================================ */

function TradeReview({ trade, shots, strategies, onClose, onSaveShots, onEdit }) {
  const m = computeTradeMetrics(trade);
  const [local, setLocal] = useState(shots || {});
  const save = (slot) => (val) => { const next = { ...local, [slot]: val }; setLocal(next); onSaveShots(trade.id, next); };
  const strat = strategies.find((s) => s.id === trade.strategyId);

  return (
    <div className="tj-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tj-modal" style={{ maxWidth: 860 }}>
        <div className="tj-modal-header">
          <div><div className="tj-h1" style={{ marginBottom: 0 }}>{trade.instrument} · {trade.direction} · {trade.date}</div><div className="tj-sub" style={{ marginBottom: 0 }}>{trade.session} session · {trade.killZone} · {trade.marketCondition}{strat ? ` · Strategy: ${strat.name}` : ""}</div></div>
          <div style={{ display: "flex", gap: 8 }}><span className="tj-btn" onClick={() => onEdit(trade)}><Pencil size={13} /> Edit</span><span className="tj-btn" onClick={onClose}><X size={14} /></span></div>
        </div>
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <Kpi label="Entry" value={trade.entryPrice} /><Kpi label="Stop Loss" value={trade.stopLoss} /><Kpi label="Take Profit" value={trade.takeProfit} /><Kpi label="Exit" value={trade.exitPrice || "—"} />
          <Kpi label="R:R Planned" value={fmtNum(m.rr)} /><Kpi label="Realized R" value={m.hasExit ? fmtNum(m.actualR) : "—"} />
          <Kpi label="Net P&L" value={m.hasExit ? fmtMoney(m.netPnl) : "—"} tone={m.netPnl > 0 ? "pos" : m.netPnl < 0 ? "neg" : "neutral"} />
          <Kpi label="Result" value={!m.hasExit ? "Open" : m.netPnl > 0 ? "Win" : m.netPnl < 0 ? "Loss" : "Breakeven"} tone={m.netPnl > 0 ? "pos" : m.netPnl < 0 ? "neg" : "neutral"} />
        </div>
        <div className="tj-section-title">Setups &amp; Mistakes</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>{trade.setups.map((s) => <span key={s} className="tj-badge be">{s}</span>)}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{trade.mistakes.length ? trade.mistakes.map((s) => <span key={s} className="tj-badge loss">{s}</span>) : <span className="tj-sub" style={{ marginBottom: 0 }}>No mistakes logged.</span>}</div>
        <div className="tj-section-title">Trade Quality</div>
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}><Kpi label="Setup" value={`${trade.setupQuality}/10`} /><Kpi label="Execution" value={`${trade.executionQuality}/10`} /><Kpi label="Risk Mgmt" value={`${trade.riskMgmtQuality}/10`} /><Kpi label="Psychology" value={`${trade.psychologyQuality}/10`} /></div>
        {trade.notes && (<><div className="tj-section-title">Notes</div><div className="tj-card">{trade.notes}</div></>)}
        <div className="tj-section-title">Screenshots — Before → Entry → During → After</div>
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          <ScreenshotSlot label="Before Entry" value={local.before} onChange={save("before")} />
          <ScreenshotSlot label="Entry" value={local.entry} onChange={save("entry")} />
          <ScreenshotSlot label="During Trade" value={local.during} onChange={save("during")} />
          <ScreenshotSlot label="After Exit" value={local.after} onChange={save("after")} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CALENDAR
   ============================================================ */

function JournalCalendar({ trades, onOpenDay }) {
  const [cursor, setCursor] = useState(new Date());
  const withM = useMemo(() => trades.map(withMetrics).filter((t) => t.__m.hasExit), [trades]);
  const byDay = useMemo(() => groupBy(withM, (t) => t.date), [withM]);
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const first = new Date(year, month, 1); const startOffset = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = []; for (let i = 0; i < startOffset; i++) cells.push(null); for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const monthLabel = cursor.toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div className="tj-h1">Journal Calendar</div><div className="tj-sub">Daily P&L at a glance</div></div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="tj-btn" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={14} /></span>
          <div className="tj-mono" style={{ minWidth: 140, textAlign: "center" }}>{monthLabel}</div>
          <span className="tj-btn" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={14} /></span>
        </div>
      </div>
      <div className="tj-card" style={{ marginTop: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginBottom: 6 }}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} style={{ textAlign: "center", color: "var(--dim)", fontSize: 11 }}>{d}</div>)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const dayTrades = byDay.get(dateStr) || []; const pnl = dayTrades.reduce((s, t) => s + t.__m.netPnl, 0);
            const cls = dayTrades.length === 0 ? "" : pnl > 0 ? "profit" : pnl < 0 ? "loss" : "";
            return (
              <div key={i} className={`tj-day-cell ${cls}`} onClick={() => dayTrades.length && onOpenDay(dateStr, dayTrades)}>
                <div className="tj-mono" style={{ fontSize: 11, color: "var(--dim)" }}>{d}</div>
                {dayTrades.length > 0 && (<><div className={`tj-mono ${pnl > 0 ? "tj-pos" : pnl < 0 ? "tj-neg" : ""}`} style={{ fontSize: 12, marginTop: 4 }}>{fmtMoney(pnl)}</div><div style={{ fontSize: 10, color: "var(--dim)" }}>{dayTrades.length} trade{dayTrades.length > 1 ? "s" : ""}</div></>)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayDetail({ date, dayTrades, onClose, onOpenTrade }) {
  const stats = aggregateStats(dayTrades);
  return (
    <div className="tj-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tj-modal">
        <div className="tj-modal-header"><div className="tj-h1" style={{ marginBottom: 0 }}>{date}</div><span className="tj-btn" onClick={onClose}><X size={14} /></span></div>
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}><Kpi label="Net P&L" value={fmtMoney(stats.netPnl)} tone={stats.netPnl >= 0 ? "pos" : "neg"} /><Kpi label="Trades" value={stats.total} /><Kpi label="Win Rate" value={fmtPct(stats.winRate)} /><Kpi label="Avg R:R" value={fmtNum(stats.avgRR)} /></div>
        <div className="tj-section-title">Trades</div>
        <div className="tj-scroll"><table className="tj-table"><thead><tr><th>Time</th><th>Instrument</th><th>Dir</th><th>Setups</th><th>Net P&L</th></tr></thead>
          <tbody>{dayTrades.map((t) => (<tr key={t.id} onClick={() => onOpenTrade(t)}><td className="tj-mono">{t.time}</td><td>{t.instrument}</td><td>{t.direction}</td><td>{t.setups.join(", ")}</td><td className={`tj-mono ${t.__m.netPnl > 0 ? "tj-pos" : t.__m.netPnl < 0 ? "tj-neg" : ""}`}>{fmtMoney(t.__m.netPnl)}</td></tr>))}</tbody>
        </table></div>
      </div>
    </div>
  );
}

/* ============================================================
   ANALYTICS: STRATEGIES / MISTAKES / TIME & SESSIONS
   ============================================================ */

function StrategyPerformance({ trades }) {
  const closed = useMemo(() => trades.map(withMetrics).filter((t) => t.__m.hasExit), [trades]);
  const bySetup = useMemo(() => {
    const map = new Map();
    closed.forEach((t) => (t.setups.length ? t.setups : ["(none tagged)"]).forEach((s) => { if (!map.has(s)) map.set(s, []); map.get(s).push(t); }));
    return Array.from(map.entries()).map(([name, arr]) => ({ name, stats: aggregateStats(arr) })).sort((a, b) => b.stats.netPnl - a.stats.netPnl);
  }, [closed]);
  if (closed.length === 0) return <div className="tj-card tj-empty"><div className="tj-empty-title">No closed trades yet.</div>Log trades with setups tagged to see performance broken down by strategy.</div>;
  const best = bySetup[0], worst = bySetup[bySetup.length - 1];
  const mostConsistent = [...bySetup].filter((s) => s.stats.total >= 3).sort((a, b) => b.stats.winRate - a.stats.winRate)[0];
  return (
    <div>
      <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <Kpi label="Best Setup" value={best ? best.name : "—"} tone="pos" />
        <Kpi label="Worst Setup" value={worst ? worst.name : "—"} tone="neg" />
        <Kpi label="Most Consistent" value={mostConsistent ? mostConsistent.name : "Insufficient data (need ≥3 trades)"} />
      </div>
      <div className="tj-section-title">By Setup Tag</div>
      <div className="tj-card tj-scroll" style={{ padding: 0 }}>
        <table className="tj-table"><thead><tr><th>Setup</th><th>Trades</th><th>Win Rate</th><th>Avg R</th><th>Net P&L</th><th>Profit Factor</th></tr></thead>
          <tbody>{bySetup.map((s) => (<tr key={s.name}><td>{s.name}</td><td className="tj-mono">{s.stats.total}</td><td className="tj-mono">{fmtPct(s.stats.winRate)}</td><td className="tj-mono">{fmtNum(s.stats.avgRR)}</td><td className={`tj-mono ${s.stats.netPnl >= 0 ? "tj-pos" : "tj-neg"}`}>{fmtMoney(s.stats.netPnl)}</td><td className="tj-mono">{Number.isFinite(s.stats.profitFactor) ? fmtNum(s.stats.profitFactor) : "∞"}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function MistakeAnalyzer({ trades }) {
  const closed = useMemo(() => trades.map(withMetrics).filter((t) => t.__m.hasExit), [trades]);
  const losers = closed.filter((t) => t.__m.netPnl < 0);
  const counts = useMemo(() => {
    const m = new Map();
    closed.forEach((t) => t.mistakes.forEach((mi) => { if (!m.has(mi)) m.set(mi, { total: 0, losses: 0, pnl: 0 }); const e = m.get(mi); e.total++; e.pnl += t.__m.netPnl; if (t.__m.netPnl < 0) e.losses++; }));
    return Array.from(m.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total);
  }, [closed]);
  const topMistake = counts[0]; const lossesWithMistakes = losers.filter((t) => t.mistakes.length > 0).length;
  const lossMistakePct = losers.length ? (lossesWithMistakes / losers.length) * 100 : 0;
  const cleanTrades = closed.filter((t) => t.mistakes.length === 0); const cleanStats = aggregateStats(cleanTrades);
  const messyStats = aggregateStats(closed.filter((t) => t.mistakes.length > 0));
  if (closed.length === 0) return <div className="tj-card tj-empty"><div className="tj-empty-title">No closed trades yet.</div>Log mistakes on trades to see recurring patterns here.</div>;
  return (
    <div>
      <div className="tj-card" style={{ marginBottom: 14 }}>
        {topMistake ? (
          <div style={{ lineHeight: 1.7 }}>
            <div>Your most common logged mistake is <strong className="tj-neg">{topMistake.name}</strong> ({topMistake.total} occurrence{topMistake.total > 1 ? "s" : ""}).</div>
            {losers.length > 0 && <div>{fmtPct(lossMistakePct)} of your losing trades have at least one mistake tagged.</div>}
            {cleanTrades.length >= 5 && messyStats.total >= 5 && <div>Trades with no mistakes tagged have a {fmtPct(cleanStats.winRate)} win rate vs {fmtPct(messyStats.winRate)} on trades where a mistake was logged.</div>}
          </div>
        ) : <div>No mistakes have been tagged on any trade yet — keep logging them consistently for this section to surface patterns.</div>}
      </div>
      <div className="tj-section-title">Frequency by Mistake Type</div>
      <div className="tj-card tj-scroll" style={{ padding: 0 }}>
        <table className="tj-table"><thead><tr><th>Mistake</th><th>Occurrences</th><th>Of which losses</th><th>Total P&L impact</th></tr></thead>
          <tbody>{counts.map((c) => (<tr key={c.name}><td>{c.name}</td><td className="tj-mono">{c.total}</td><td className="tj-mono">{c.losses}</td><td className={`tj-mono ${c.pnl >= 0 ? "tj-pos" : "tj-neg"}`}>{fmtMoney(c.pnl)}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

function TimeAndSessions({ trades }) {
  const closed = useMemo(() => trades.map(withMetrics).filter((t) => t.__m.hasExit), [trades]);
  const byWeekday = useMemo(() => WEEKDAYS.map((name, idx) => ({ name: name.slice(0, 3), stats: aggregateStats(closed.filter((t) => new Date(t.date + "T00:00:00").getDay() === idx)) })), [closed]);
  const byKillZone = useMemo(() => KILL_ZONES.map((kz) => ({ name: kz, stats: aggregateStats(closed.filter((t) => t.killZone === kz)) })), [closed]);
  const bySession = useMemo(() => SESSIONS.map((s) => ({ name: s, stats: aggregateStats(closed.filter((t) => t.session === s)) })), [closed]);
  if (closed.length === 0) return <div className="tj-card tj-empty"><div className="tj-empty-title">No closed trades yet.</div>This page will surface your best weekdays, sessions and kill zones once you have data.</div>;
  const bestDay = [...byWeekday].filter((d) => d.stats.total > 0).sort((a, b) => b.stats.netPnl - a.stats.netPnl)[0];
  return (
    <div>
      {bestDay && <div className="tj-card" style={{ marginBottom: 14 }}>Your best day of the week by net P&L is <strong className="tj-pos">{bestDay.name}</strong> ({fmtMoney(bestDay.stats.netPnl)} across {bestDay.stats.total} trades, {fmtPct(bestDay.stats.winRate)} win rate).</div>}
      <div className="tj-section-title">Net P&L by Day of Week</div>
      <div className="tj-card">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={byWeekday.map((d) => ({ name: d.name, pnl: d.stats.netPnl }))}>
            <CartesianGrid stroke="#26282e" strokeDasharray="3 3" /><XAxis dataKey="name" stroke="#5c5e66" tick={{ fontSize: 11 }} /><YAxis stroke="#5c5e66" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ background: "#121317", border: "1px solid #26282e", fontSize: 12 }} /><ReferenceLine y={0} stroke="#5c5e66" />
            <Bar dataKey="pnl">{byWeekday.map((d, i) => <Cell key={i} fill={d.stats.netPnl >= 0 ? "#22c55e" : "#ef4444"} />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="tj-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div><div className="tj-section-title">Performance by Kill Zone</div>
          <div className="tj-card tj-scroll" style={{ padding: 0 }}><table className="tj-table"><thead><tr><th>Kill Zone</th><th>Trades</th><th>Win Rate</th><th>Avg R</th><th>Net P&L</th></tr></thead>
            <tbody>{byKillZone.map((k) => (<tr key={k.name}><td>{k.name}</td><td className="tj-mono">{k.stats.total}</td><td className="tj-mono">{k.stats.total ? fmtPct(k.stats.winRate) : "—"}</td><td className="tj-mono">{k.stats.total ? fmtNum(k.stats.avgRR) : "—"}</td><td className={`tj-mono ${k.stats.netPnl >= 0 ? "tj-pos" : "tj-neg"}`}>{k.stats.total ? fmtMoney(k.stats.netPnl) : "—"}</td></tr>))}</tbody>
          </table></div>
        </div>
        <div><div className="tj-section-title">Performance by Session</div>
          <div className="tj-card tj-scroll" style={{ padding: 0 }}><table className="tj-table"><thead><tr><th>Session</th><th>Trades</th><th>Win Rate</th><th>Avg R</th><th>Net P&L</th><th>Profit Factor</th></tr></thead>
            <tbody>{bySession.map((k) => (<tr key={k.name}><td>{k.name}</td><td className="tj-mono">{k.stats.total}</td><td className="tj-mono">{k.stats.total ? fmtPct(k.stats.winRate) : "—"}</td><td className="tj-mono">{k.stats.total ? fmtNum(k.stats.avgRR) : "—"}</td><td className={`tj-mono ${k.stats.netPnl >= 0 ? "tj-pos" : "tj-neg"}`}>{k.stats.total ? fmtMoney(k.stats.netPnl) : "—"}</td><td className="tj-mono">{k.stats.total && Number.isFinite(k.stats.profitFactor) ? fmtNum(k.stats.profitFactor) : k.stats.total ? "∞" : "—"}</td></tr>))}</tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

function Profitability({ trades, settings }) {
  const closed = useMemo(() => trades.map(withMetrics).filter((t) => t.__m.hasExit), [trades]);
  const stats = aggregateStats(closed); const eq = equityCurve(stats.chron, settings.startingBalance); const dd = maxDrawdown(eq);
  let verdict = "INSUFFICIENT DATA", verdictColor = "var(--dim)", explanation = "You need at least 20 closed trades before a profitability verdict is statistically meaningful.";
  if (stats.total >= 20) {
    if (stats.netPnl > 0 && stats.profitFactor > 1.1 && stats.expectancy > 0) { verdict = "PROFITABLE"; verdictColor = "var(--green)"; explanation = `Across ${stats.total} trades your expectancy is positive (${fmtMoney(stats.expectancy)} per trade) with a profit factor of ${fmtNum(stats.profitFactor)}. This reflects a statistical edge in your recorded history — it does not guarantee future results.`; }
    else if (stats.netPnl <= 0 || stats.expectancy <= 0) { verdict = "NOT PROFITABLE"; verdictColor = "var(--red)"; explanation = `Across ${stats.total} trades your net result is ${fmtMoney(stats.netPnl)} with expectancy of ${fmtMoney(stats.expectancy)} per trade. On this evidence you do not currently have a positive edge.`; }
    else { verdict = "MARGINAL"; verdictColor = "var(--amber)"; explanation = `Your results are close to breakeven. Profit factor ${fmtNum(stats.profitFactor)} does not yet show a clear, durable edge.`; }
  }
  return (
    <div>
      <div className="tj-card" style={{ marginBottom: 16, borderColor: verdictColor }}>
        <div className="tj-kpi-label">Verdict</div><div className="tj-mono" style={{ fontSize: 26, fontWeight: 700, color: verdictColor }}>{verdict}</div>
        <div style={{ marginTop: 8, color: "var(--dim)", lineHeight: 1.6 }}>{explanation}</div>
      </div>
      <div className="tj-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        <Kpi label="Win Rate" value={fmtPct(stats.winRate)} /><Kpi label="Profit Factor" value={Number.isFinite(stats.profitFactor) ? fmtNum(stats.profitFactor) : "∞"} />
        <Kpi label="Expectancy" value={fmtMoney(stats.expectancy)} tone={stats.expectancy >= 0 ? "pos" : "neg"} /><Kpi label="Avg R" value={fmtNum(stats.avgRR)} />
        <Kpi label="Net P&L" value={fmtMoney(stats.netPnl)} tone={stats.netPnl >= 0 ? "pos" : "neg"} /><Kpi label="Max Drawdown" value={fmtMoney(dd.maxDd)} tone="neg" />
        <Kpi label="Average Win" value={fmtMoney(stats.avgWin)} tone="pos" /><Kpi label="Average Loss" value={fmtMoney(-stats.avgLoss)} tone="neg" />
        <Kpi label="Payoff Ratio" value={stats.avgLoss ? fmtNum(stats.avgWin / stats.avgLoss) : "—"} /><Kpi label="Consecutive Wins" value={stats.bestWinStreak} />
        <Kpi label="Consecutive Losses" value={stats.worstLossStreak} /><Kpi label="Total Trades" value={stats.total} />
      </div>
      <div style={{ marginTop: 14, fontSize: 12, color: "var(--dim)" }}>A Sharpe ratio requires a consistent per-period return series and a risk-free rate assumption; with discretionary futures trades of irregular size it's easy to compute and easy to misread, so it's intentionally left out until you have a large, regular sample. Ask One Percent AI for a rough estimate with caveats if you want one.</div>
    </div>
  );
}

/* ============================================================
   JOURNAL NOTES
   ============================================================ */

const NOTE_TYPES = ["Trade", "Daily", "Strategy", "Psychology", "Market", "General"];
const NOTE_TAGS = ["FVG", "Liquidity", "Delta", "Order Flow", "VWAP", "Psychology", "Mistake", "Good Trade", "Bad Trade"];

function Notes({ notes, trades, onSave, onDelete }) {
  const [editing, setEditing] = useState(null); const [filterType, setFilterType] = useState("All"); const [q, setQ] = useState("");
  const filtered = useMemo(() => notes.filter((n) => { if (filterType !== "All" && n.type !== filterType) return false; if (q && !(`${n.title} ${n.content} ${n.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase()))) return false; return true; }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [notes, filterType, q]);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div><div className="tj-h1">Journal Notes</div><div className="tj-sub">{notes.length} notes — unlimited, taggable, searchable</div></div>
        <span className="tj-btn primary" onClick={() => setEditing({ id: null, type: "General", title: "", content: "", tags: [], relatedTradeId: "" })}><Plus size={14} /> New Note</span>
      </div>
      <div style={{ display: "flex", gap: 8, margin: "10px 0 14px 0", flexWrap: "wrap" }}>
        <select className="tj-select" style={{ width: 150 }} value={filterType} onChange={(e) => setFilterType(e.target.value)}><option>All</option>{NOTE_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <div style={{ position: "relative", minWidth: 220 }}><Search size={13} style={{ position: "absolute", left: 8, top: 9, color: "var(--dim)" }} /><input className="tj-input" style={{ paddingLeft: 26 }} placeholder="Search notes..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {filtered.length === 0 ? (
        <div className="tj-card tj-empty"><div className="tj-empty-title">No notes yet.</div>Create your first note — trade reviews, daily journal, psychology reflections, anything.</div>
      ) : (
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          {filtered.map((n) => (
            <div key={n.id} className="tj-card" style={{ cursor: "pointer" }} onClick={() => setEditing(n)}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span className="tj-badge be">{n.type}</span><span className="tj-btn danger" style={{ padding: "2px 6px" }} onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}><Trash2 size={11} /></span></div>
              <div style={{ fontWeight: 600, margin: "8px 0 4px 0" }}>{n.title || "(untitled)"}</div>
              <div style={{ color: "var(--dim)", fontSize: 12.5, maxHeight: 60, overflow: "hidden" }}>{n.content}</div>
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>{n.tags.map((t) => <span key={t} className="tj-badge be" style={{ fontSize: 10 }}>{t}</span>)}</div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div className="tj-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="tj-modal">
            <div className="tj-modal-header"><div className="tj-h1" style={{ marginBottom: 0 }}>{editing.id ? "Edit Note" : "New Note"}</div><span className="tj-btn" onClick={() => setEditing(null)}><X size={14} /></span></div>
            <div className="tj-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Type"><select className="tj-select" value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>{NOTE_TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
              <Field label="Related Trade (optional)"><select className="tj-select" value={editing.relatedTradeId} onChange={(e) => setEditing({ ...editing, relatedTradeId: e.target.value })}><option value="">— none —</option>{trades.map((t) => <option key={t.id} value={t.id}>{t.date} {t.instrument} {t.direction}</option>)}</select></Field>
            </div>
            <Field label="Title"><input className="tj-input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="Content"><textarea className="tj-textarea" rows={8} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} /></Field>
            <div className="tj-label">Tags</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>{NOTE_TAGS.map((t) => <Chip key={t} label={t} selected={editing.tags.includes(t)} onClick={() => setEditing({ ...editing, tags: editing.tags.includes(t) ? editing.tags.filter((x) => x !== t) : [...editing.tags, t] })} />)}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><span className="tj-btn" onClick={() => setEditing(null)}>Cancel</span><span className="tj-btn primary" onClick={() => { onSave(editing); setEditing(null); }}><Check size={14} /> Save Note</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   GENERIC AI CHAT (One Percent AI) — real calls to Claude
   ============================================================ */

const IMAGE_ANALYSIS_NOTE = `The user may attach a chart/platform screenshot (TradingView, ATAS, Bookmap, footprint, DOM, heatmap, volume profile, etc.). When an image is present, clearly separate "What I can actually observe in the image" (only things visibly legible in the screenshot) from "What I'm inferring" (interpretation beyond what's directly visible). Never claim to read exact numbers you cannot clearly see. You have no live market data feed — if asked about current prices, live volume/delta, or breaking news, say plainly that you don't have real-time market data access rather than inventing values.`;

function AiChat({ systemPrompt, suggestions, placeholder, emptyHint, onStudySeconds }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const fileRef = useRef(null);
  const mountedAt = useRef(Date.now());

  useEffect(() => () => { if (onStudySeconds) onStudySeconds(Math.round((Date.now() - mountedAt.current) / 1000)); }, []);

  const attachImage = async (file) => {
    const dataUrl = await resizeImage(file, 1100, 0.75);
    setPendingImage(dataUrl);
  };

  const buildContent = (question, imageDataUrl) => {
    if (!imageDataUrl) return question;
    const base64 = imageDataUrl.split(",")[1];
    return [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
      { type: "text", text: question || "¿Qué estás viendo en esta imagen?" },
    ];
  };

  const ask = async (question) => {
    if ((!question.trim() && !pendingImage) || loading) return;
    const content = buildContent(question, pendingImage);
    const newMsgs = [...messages, { role: "user", content, displayImage: pendingImage, displayText: question }];
    setMessages(newMsgs); setInput(""); setPendingImage(null); setLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1300, system: `${systemPrompt}\n\n${IMAGE_ANALYSIS_NOTE}`, messages: newMsgs.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      const text = (data.content || []).map((b) => b.text || "").join("\n") || "No pude generar una respuesta con los datos disponibles.";
      setMessages((p) => [...p, { role: "assistant", content: text }]);
    } catch (e) {
      setMessages((p) => [...p, { role: "assistant", content: "Hubo un error al consultar la IA. Intenta de nuevo." }]);
    } finally { setLoading(false); }
  };

  return (
    <div>
      <div className="tj-card" style={{ minHeight: 220, marginBottom: 12 }}>
        {messages.length === 0 ? <div style={{ color: "var(--dim)" }}>{emptyHint}</div> :
          messages.map((m, i) => m.role === "user" ? (
            <div key={i} className="tj-msg-user">
              <strong>Tú:</strong> {m.displayText}
              {m.displayImage && <img src={m.displayImage} alt="attached chart" style={{ display: "block", maxWidth: 260, borderRadius: 5, marginTop: 8 }} />}
            </div>
          ) : <div key={i} className="tj-msg-ai">{m.content}</div>)}
        {loading && <div className="tj-msg-ai" style={{ color: "var(--dim)" }}>Pensando...</div>}
      </div>
      {suggestions?.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>{suggestions.map((s) => <span key={s} className="tj-chip" onClick={() => ask(s)}>{s}</span>)}</div>}
      {pendingImage && (
        <div className="tj-card" style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <img src={pendingImage} alt="preview" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 4 }} />
          <span style={{ fontSize: 12, color: "var(--dim)" }}>Screenshot attached — se enviará con tu próximo mensaje</span>
          <span className="tj-btn danger" style={{ padding: "4px 6px", marginLeft: "auto" }} onClick={() => setPendingImage(null)}><X size={12} /></span>
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <span className="tj-btn" onClick={() => fileRef.current?.click()} title="Attach chart screenshot"><ImagePlus size={14} /></span>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) attachImage(f); e.target.value = ""; }} />
        <input className="tj-input" placeholder={placeholder} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask(input)} />
        <span className="tj-btn primary" onClick={() => ask(input)}>Enviar</span>
      </div>
    </div>
  );
}

function buildDataSummary(trades, settings) {
  const closed = trades.map(withMetrics).filter((t) => t.__m.hasExit);
  const stats = aggregateStats(closed);
  const bySetup = {};
  closed.forEach((t) => (t.setups.length ? t.setups : ["(untagged)"]).forEach((s) => { bySetup[s] = bySetup[s] || { trades: 0, netPnl: 0, wins: 0 }; bySetup[s].trades++; bySetup[s].netPnl += t.__m.netPnl; if (t.__m.netPnl > 0) bySetup[s].wins++; }));
  const mistakeCounts = {}; closed.forEach((t) => t.mistakes.forEach((m) => { mistakeCounts[m] = (mistakeCounts[m] || 0) + 1; }));
  return {
    account: settings,
    summaryStats: { totalTrades: stats.total, wins: stats.wins, losses: stats.losses, winRate: Number(stats.winRate.toFixed(2)), profitFactor: Number.isFinite(stats.profitFactor) ? Number(stats.profitFactor.toFixed(2)) : null, expectancy: Number(stats.expectancy.toFixed(2)), netPnl: Number(stats.netPnl.toFixed(2)), avgWin: Number(stats.avgWin.toFixed(2)), avgLoss: Number(stats.avgLoss.toFixed(2)), avgRR: Number(stats.avgRR.toFixed(2)), bestWinStreak: stats.bestWinStreak, worstLossStreak: stats.worstLossStreak },
    performanceBySetup: bySetup, mistakeFrequency: mistakeCounts,
    trades: closed.slice(-150).map((t) => ({ date: t.date, time: t.time, instrument: t.instrument, direction: t.direction, setups: t.setups, mistakes: t.mistakes, session: t.session, killZone: t.killZone, netPnl: Number(t.__m.netPnl.toFixed(2)), rr: Number(t.__m.rr.toFixed(2)) })),
  };
}

const KNOWLEDGE_ENGINE_PREAMBLE = `You are One Percent AI, a general-purpose trading knowledge and analysis engine — not a chatbot limited to a fixed list of preset questions. You can discuss essentially any trading-related topic the user raises, even if it isn't explicitly listed anywhere in this app's UI: futures (NQ/MNQ, ES/MES, YM/MYM, RTY/M2K and others), stocks, ETFs, forex, crypto, options, market structure (BOS/CHoCH/MSS), liquidity, FVG/IFVG, order blocks, breaker blocks, order flow, Delta, Cumulative Delta/CVD, footprint charts, DOM/Level 2, volume profile, VWAP and anchored VWAP, mean reversion, market microstructure, auction market theory, statistics, probability, quantitative trading, backtesting, Monte Carlo simulation, risk management, position sizing, expectancy, profit factor, Sharpe/Sortino, drawdown, risk of ruin, trading psychology, strategy development, trade management, execution, slippage, market sessions, kill zones, prop firm concepts, and trading platforms/software. Always separate three kinds of information in your answers when relevant: "Educational Knowledge" (general trading concepts and theory), "My Journal Data" (facts drawn only from the user's own trades/notes/strategies provided to you), and "Live Market Data" (you have NO live market data feed — if the user asks about current prices, live volume, live Delta, breaking news, or present market conditions, say plainly that you don't have real-time access instead of inventing numbers). For a genuinely complex or unfamiliar conceptual question, teach it in depth using this structure: 1) What it is, 2) How it works, 3) Why it matters, 4) How to identify it, 5) Example, 6) Practical application, 7) Common mistakes, 8) How it relates to other concepts, 9) An exercise, 10) A comprehension question. For advanced/research-level questions, you may also include: theory, supporting evidence, relevant formulas, known limitations, practical applications, and references when you genuinely have them — never fabricate a citation or a study that doesn't exist. For simple factual questions, just answer directly and concisely — don't force the full framework onto something that doesn't need it. If the user gives you a raw strategy idea (e.g. "quiero usar Liquidity Sweep + Delta + FVG"), help convert it into testable rules following this pipeline: Market Conditions → Setup → Confirmation → Entry → Stop Loss → Take Profit → Risk → Invalidation → Backtesting → Statistics — and never silently rewrite the user's own stated rules; propose changes explicitly as "Suggestion:" with your reasoning. Never present a forecast, prediction, or a "buy/sell now" call as fact — you teach reasoning, not signals. When you don't know something or don't have enough data, say so directly instead of inventing information.`;

const ANALYSIS_FRAMEWORK = `When analyzing performance, structure your answer distinguishing: "Observed Data" (raw numbers from the journal), "Historical Result" (what happened, plainly stated), "Statistical Analysis" (what those numbers mean statistically, including confidence caveats when sample size is small), "Educational Explanation" (the underlying trading concept), and "Potential Interpretation" (your best-guess reading, explicitly flagged as an opinion, never a certainty or a prediction). Never present a forecast or a "buy/sell now" signal as fact.`;

function TradeAnalyst({ trades, settings }) {
  const dataSummary = useMemo(() => buildDataSummary(trades, settings), [trades, settings]);
  const closedCount = trades.filter((t) => t.exitPrice).length;
  const system = `${KNOWLEDGE_ENGINE_PREAMBLE}\n\nYou are currently in "Trade Analyst" mode, embedded in the user's personal trading journal. For anything about the user's own performance, answer ONLY using the JSON data provided below — never invent trades or numbers. If data is insufficient, say so explicitly. You can still freely answer general trading-knowledge questions beyond this data. ${ANALYSIS_FRAMEWORK} Respond in the same language the user writes in (Spanish or English). User's trading data as JSON:\n\n${JSON.stringify(dataSummary)}`;
  return (
    <div>
      <div className="tj-h1">Trade Analyst</div>
      <div className="tj-sub">One Percent AI — analiza tu historial real de trades</div>
      {closedCount < 10 && <div className="tj-card" style={{ marginBottom: 14, display: "flex", gap: 8 }}><Info size={16} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} /><div>Tienes {closedCount} trades cerrados. El análisis será más confiable con al menos 20–30 operaciones, pero puedes preguntar lo que quieras.</div></div>}
      <AiChat systemPrompt={system} placeholder="Pregunta sobre tu rendimiento..." emptyHint="Haz una pregunta sobre tu rendimiento, o prueba una sugerencia abajo."
        suggestions={["¿Cuál es mi estrategia más rentable?", "¿Por qué estoy perdiendo dinero?", "¿En qué horario tengo mejor rendimiento?", "¿Qué errores repito?", "Muéstrame mis mejores 5 trades", "¿Estoy mejorando?"]} />
    </div>
  );
}

function ChartAnalysis() {
  const system = `${KNOWLEDGE_ENGINE_PREAMBLE}\n\nYou are currently in "Chart Analysis" mode. The user will typically attach a screenshot from a charting/order-flow platform (TradingView, ATAS, Bookmap, a footprint chart, DOM, a heatmap, or a volume profile) and ask what it shows. Be rigorous about separating what you can actually read in the image from what you're inferring — never state a specific price, volume or Delta number as fact unless it's clearly legible in the screenshot. Respond in the same language the user writes in.`;
  return (
    <div>
      <div className="tj-h1">Chart Analysis</div>
      <div className="tj-sub">Sube una captura (TradingView, ATAS, Bookmap, footprint, DOM, heatmap, volume profile) y pregúntale a la IA</div>
      <AiChat systemPrompt={system} placeholder="Pregunta sobre el gráfico adjunto..." emptyHint="Adjunta una captura con el ícono de imagen y pregunta, por ejemplo: '¿Qué estás viendo aquí?' o '¿Dónde está la absorción?'"
        suggestions={["¿Qué estás viendo aquí?", "Explícame este Delta", "¿Dónde está la absorción?", "¿Qué significa este imbalance?", "¿Qué estructura de mercado aparece?"]} />
    </div>
  );
}

/* ============================================================
   LEARNING CENTER — curriculum, tutor, quizzes, progress
   ============================================================ */

const LEARNING_PATH = [
  { level: 1, title: "Foundations", topics: ["Market Structure", "Liquidity Basics", "Candlesticks", "Volume", "Risk Management"] },
  { level: 2, title: "Intermediate", topics: ["FVG", "Order Blocks", "VWAP", "Volume Profile", "Delta", "CVD"] },
  { level: 3, title: "Advanced", topics: ["Footprint Charts", "Order Flow", "Absorption", "Imbalances", "Market Microstructure"] },
  { level: 4, title: "Quantitative", topics: ["Probability", "Statistics", "Expectancy", "Backtesting", "Monte Carlo", "Risk of Ruin"] },
  { level: 5, title: "Strategy Development", topics: ["Build a Strategy", "Backtest", "Analyze Results", "Optimize", "Forward Test", "Journal & Evaluate"] },
];

const QUIZ_BANK = {
  "Market Structure": [
    { q: "What does BOS stand for?", options: ["Break of Structure", "Bid Order Spread", "Bottom of Session"], correct: 0 },
    { q: "A CHoCH typically signals:", options: ["Trend continuation", "A potential shift in trend direction", "A liquidity void"], correct: 1 },
  ],
  "Delta": [
    { q: "Delta measures:", options: ["The difference between buy and sell volume at market", "The price change of an instrument", "The number of contracts traded"], correct: 0 },
    { q: "Cumulative Delta (CVD) is:", options: ["Delta reset every session", "A running sum of delta over time", "The delta of options only"], correct: 1 },
  ],
  "VWAP": [
    { q: "VWAP stands for:", options: ["Volume Weighted Average Price", "Variable Weighted Asset Position", "Volatility Weighted Average Price"], correct: 0 },
    { q: "Mean reversion around VWAP assumes:", options: ["Price always trends away from VWAP", "Price tends to revert toward the average after deviating", "VWAP predicts news events"], correct: 1 },
  ],
  "Expectancy": [
    { q: "Expectancy per trade is calculated as:", options: ["(Win Rate × Avg Win) − (Loss Rate × Avg Loss)", "Avg Win ÷ Avg Loss", "Net P&L ÷ Total Trades only"], correct: 0 },
    { q: "A positive expectancy means:", options: ["Every trade will be a winner", "On average, each trade is expected to be profitable over a large sample", "The strategy has zero risk"], correct: 1 },
  ],
  "Risk of Ruin": [
    { q: "Risk of Ruin estimates:", options: ["The probability of losing your entire trading capital given your edge and sizing", "The maximum profit possible", "The average trade duration"], correct: 0 },
  ],
};

function TopicBadge({ status }) {
  const map = { completed: ["var(--green)", "Completed"], in_progress: ["var(--amber)", "In Progress"], not_started: ["var(--dim2)", "Not Started"] };
  const [color, label] = map[status] || map.not_started;
  return <span className="tj-badge be" style={{ color }}>{label}</span>;
}

function LearningPathView({ progress, onSetStatus, onAskTutor }) {
  const allTopics = LEARNING_PATH.flatMap((l) => l.topics);
  const completedCount = allTopics.filter((t) => progress[t]?.status === "completed").length;
  return (
    <div>
      <div className="tj-h1">My Learning Path</div>
      <div className="tj-sub">{completedCount} of {allTopics.length} topics completed</div>
      {LEARNING_PATH.map((lvl) => {
        const doneInLevel = lvl.topics.filter((t) => progress[t]?.status === "completed").length;
        return (
          <div key={lvl.level} style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div className="tj-section-title" style={{ margin: 0 }}>Level {lvl.level} — {lvl.title}</div>
              <span className="tj-sub" style={{ marginBottom: 0 }}>{doneInLevel}/{lvl.topics.length}</span>
            </div>
            <ProgressBar pct={(doneInLevel / lvl.topics.length) * 100} />
            <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginTop: 8 }}>
              {lvl.topics.map((topic) => {
                const status = progress[topic]?.status || "not_started";
                return (
                  <div key={topic} className="tj-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{topic}</span><TopicBadge status={status} />
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      <span className="tj-btn" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => onAskTutor(topic)}>Learn with AI</span>
                      <select className="tj-select" style={{ width: 120, padding: "3px 6px", fontSize: 11 }} value={status} onChange={(e) => onSetStatus(topic, e.target.value)}>
                        <option value="not_started">Not Started</option><option value="in_progress">In Progress</option><option value="completed">Completed</option>
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AiTutor({ progress, onStudySeconds, presetTopic, onConsumePreset }) {
  const [system, setSystem] = useState(null);
  const topicsSummary = Object.entries(progress).map(([t, v]) => `${t}: ${v.status}`).join("; ") || "no topics started yet";
  const baseSystem = `${KNOWLEDGE_ENGINE_PREAMBLE}\n\nYou are currently in "AI Tutor" mode inside the Learning Center, acting as a structured trading teacher. After a full lesson on a concept, ask "¿Quieres probar un ejercicio?" (or the English equivalent if the user writes in English). Keep answers educational, never give live buy/sell signals or price predictions. ${ANALYSIS_FRAMEWORK} The user's current learning progress: ${topicsSummary}. Respond in the same language the user writes in.`;

  return (
    <div>
      <div className="tj-h1">AI Tutor — One Percent AI</div>
      <div className="tj-sub">Enseña orden por orden: concepto → ejemplo → aplicación → ejercicio → resumen</div>
      <AiChat
        key={presetTopic || "default"}
        systemPrompt={baseSystem}
        onStudySeconds={onStudySeconds}
        placeholder="Pregunta sobre cualquier concepto de trading..."
        emptyHint={presetTopic ? `Cargando lección sobre ${presetTopic}...` : "Pregunta '¿Qué es Delta?' o elige un tema abajo."}
        suggestions={["Enséñame qué es un FVG", "Explícame Cumulative Delta", "¿Qué es Risk of Ruin?", "Enséñame VWAP mean reversion", "¿Qué necesito saber antes de Order Flow?"]}
      />
    </div>
  );
}

function QuizzesView({ progress, onQuizResult }) {
  const [active, setActive] = useState(null); const [answers, setAnswers] = useState({}); const [submitted, setSubmitted] = useState(false);
  const topics = Object.keys(QUIZ_BANK);
  const start = (topic) => { setActive(topic); setAnswers({}); setSubmitted(false); };
  const submit = () => {
    const qs = QUIZ_BANK[active]; const correct = qs.filter((q, i) => answers[i] === q.correct).length;
    const pct = (correct / qs.length) * 100; setSubmitted(true); onQuizResult(active, pct);
  };
  return (
    <div>
      <div className="tj-h1">Quizzes</div>
      <div className="tj-sub">Comprueba tu conocimiento — aprobar con ≥70% marca el tema como completado</div>
      {!active ? (
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          {topics.map((t) => (
            <div key={t} className="tj-card" style={{ cursor: "pointer" }} onClick={() => start(t)}>
              <div style={{ fontWeight: 600 }}>{t}</div>
              <div className="tj-sub" style={{ marginBottom: 6 }}>{QUIZ_BANK[t].length} questions</div>
              <TopicBadge status={progress[t]?.status || "not_started"} />
            </div>
          ))}
          <div className="tj-card">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Otros temas</div>
            <div className="tj-sub">Para temas fuera de este banco, pídele al AI Tutor que te haga un quiz conversacional sobre cualquier concepto.</div>
          </div>
        </div>
      ) : (
        <div className="tj-card">
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}><div className="tj-h1" style={{ marginBottom: 0 }}>{active}</div><span className="tj-btn" onClick={() => setActive(null)}><X size={14} /></span></div>
          {QUIZ_BANK[active].map((q, i) => (
            <div key={i} style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8, fontWeight: 500 }}>{i + 1}. {q.q}</div>
              {q.options.map((o, oi) => {
                const chosen = answers[i] === oi;
                const showCorrect = submitted && oi === q.correct;
                const showWrong = submitted && chosen && oi !== q.correct;
                return (
                  <div key={oi} onClick={() => !submitted && setAnswers({ ...answers, [i]: oi })}
                    style={{ padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 5, marginBottom: 6, cursor: submitted ? "default" : "pointer",
                      background: chosen ? "var(--panel2)" : "transparent", borderColor: showCorrect ? "var(--green)" : showWrong ? "var(--red)" : "var(--border)" }}>
                    {o}
                  </div>
                );
              })}
            </div>
          ))}
          {!submitted ? (
            <span className={`tj-btn primary ${Object.keys(answers).length < QUIZ_BANK[active].length ? "disabled" : ""}`} onClick={submit}>Submit</span>
          ) : (
            <div className="tj-card" style={{ background: "var(--panel2)" }}>
              Score: {Object.entries(answers).filter(([i, a]) => QUIZ_BANK[active][i].correct === a).length}/{QUIZ_BANK[active].length}
              <div style={{ marginTop: 8 }}><span className="tj-btn" onClick={() => start(active)}>Retry</span> <span className="tj-btn" onClick={() => setActive(null)}>Back to Quizzes</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProgressView({ progress, studyTimeSec }) {
  const byLevel = LEARNING_PATH.map((lvl) => ({ ...lvl, done: lvl.topics.filter((t) => progress[t]?.status === "completed").length }));
  const quizScores = Object.entries(progress).filter(([, v]) => v.lastQuizPct != null);
  return (
    <div>
      <div className="tj-h1">My Progress</div>
      <div className="tj-sub">Real progress from your quiz results and manually tracked topics — nothing fabricated</div>
      <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <Kpi label="Topics Completed" value={Object.values(progress).filter((p) => p.status === "completed").length} tone="pos" />
        <Kpi label="Topics In Progress" value={Object.values(progress).filter((p) => p.status === "in_progress").length} />
        <Kpi label="Study Time (AI Tutor)" value={`${Math.round(studyTimeSec / 60)} min`} />
      </div>
      <div className="tj-section-title">By Category</div>
      {byLevel.map((lvl) => (
        <div key={lvl.level} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}><span>{lvl.title}</span><span>{lvl.done}/{lvl.topics.length}</span></div>
          <ProgressBar pct={(lvl.done / lvl.topics.length) * 100} />
        </div>
      ))}
      <div className="tj-section-title">Quiz Scores</div>
      {quizScores.length === 0 ? <div className="tj-card tj-empty">No quizzes taken yet.</div> : (
        <div className="tj-card tj-scroll" style={{ padding: 0 }}>
          <table className="tj-table"><thead><tr><th>Topic</th><th>Last Score</th></tr></thead>
            <tbody>{quizScores.map(([t, v]) => <tr key={t}><td>{t}</td><td className="tj-mono">{v.lastQuizPct.toFixed(0)}%</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   KNOWLEDGE NOTES (Learning Center — separate from Journal Notes)
   ============================================================ */

function KnowledgeNotes({ notes, onSave, onDelete }) {
  const [editing, setEditing] = useState(null);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div><div className="tj-h1">Knowledge Notes</div><div className="tj-sub">Notas de estudio — separadas de las notas del Journal</div></div>
        <span className="tj-btn primary" onClick={() => setEditing({ id: null, title: "", content: "", tags: [] })}><Plus size={14} /> New Note</span>
      </div>
      {notes.length === 0 ? <div className="tj-card tj-empty"><div className="tj-empty-title">No knowledge notes yet.</div>Escribe lo que aprendas aquí; My Rules y AI Suggestions en cada estrategia se mantienen separadas de esto.</div> : (
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          {notes.map((n) => (
            <div key={n.id} className="tj-card" style={{ cursor: "pointer" }} onClick={() => setEditing(n)}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontWeight: 600 }}>{n.title || "(untitled)"}</span><span className="tj-btn danger" style={{ padding: "2px 6px" }} onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}><Trash2 size={11} /></span></div>
              <div style={{ color: "var(--dim)", fontSize: 12.5, maxHeight: 60, overflow: "hidden", marginTop: 6 }}>{n.content}</div>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <div className="tj-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="tj-modal">
            <div className="tj-modal-header"><div className="tj-h1" style={{ marginBottom: 0 }}>{editing.id ? "Edit Note" : "New Note"}</div><span className="tj-btn" onClick={() => setEditing(null)}><X size={14} /></span></div>
            <Field label="Title"><input className="tj-input" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="Content"><textarea className="tj-textarea" rows={10} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} /></Field>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><span className="tj-btn" onClick={() => setEditing(null)}>Cancel</span><span className="tj-btn primary" onClick={() => { onSave(editing); setEditing(null); }}><Check size={14} /> Save</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   LIBRARY (books / papers) — legal, user-curated
   ============================================================ */

const SEED_LIBRARY = [
  { id: "l1", title: "CME Group Education", author: "CME Group", topic: "Futures", level: "Beginner", description: "Free official futures education from the exchange itself — contract specs, margining, order types.", source: "CME Group (free)", url: "https://www.cmegroup.com/education.html" },
  { id: "l2", title: "Investor.gov Resources", author: "U.S. SEC", topic: "Risk Management", level: "Beginner", description: "Free, official investor-protection and risk education from the SEC.", source: "SEC Investor.gov (free)", url: "https://www.investor.gov" },
  { id: "l3", title: "CFTC Learn and Protect", author: "CFTC", topic: "Futures", level: "Beginner", description: "Official free guidance on futures/derivatives trading and fraud protection from the CFTC.", source: "CFTC (free)", url: "https://www.cftc.gov/LearnAndProtect" },
];

function LibraryView({ resources, onAdd, onDelete }) {
  const [q, setQ] = useState(""); const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", author: "", topic: "Order Flow", level: "Beginner", description: "", source: "", url: "" });
  const filtered = resources.filter((r) => `${r.title} ${r.author} ${r.topic}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div><div className="tj-h1">Learning Library</div><div className="tj-sub">Solo material legal y gratuito — nada con copyright pirateado</div></div>
        <span className="tj-btn primary" onClick={() => setAdding(true)}><Plus size={14} /> Add Resource</span>
      </div>
      <div style={{ margin: "10px 0 14px 0", maxWidth: 320 }}><input className="tj-input" placeholder="Buscar en la biblioteca..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="tj-card" style={{ marginBottom: 14, fontSize: 12, color: "var(--dim)" }}>
        Solo incluí unos pocos recursos oficiales y gratuitos que puedo confirmar (educación de CME Group, SEC Investor.gov, CFTC). No precargué libros o papers con copyright porque no puedo verificar que sean legalmente gratuitos sin buscarlo — pídeme fuera de este artifact que busque recursos gratuitos reales sobre un tema específico y los agrego aquí.
      </div>
      <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {filtered.map((r) => (
          <div key={r.id} className="tj-card">
            <div style={{ display: "flex", justifyContent: "space-between" }}><span className="tj-badge be">{r.level}</span>{!SEED_LIBRARY.some((s) => s.id === r.id) && <span className="tj-btn danger" style={{ padding: "2px 6px" }} onClick={() => onDelete(r.id)}><Trash2 size={11} /></span>}</div>
            <div style={{ fontWeight: 600, margin: "8px 0 2px 0" }}>{r.title}</div>
            <div style={{ fontSize: 11.5, color: "var(--dim)" }}>{r.author} · {r.topic}</div>
            <div style={{ fontSize: 12.5, margin: "8px 0" }}>{r.description}</div>
            <div style={{ fontSize: 11, color: "var(--dim)" }}>{r.source}</div>
            {r.url && <a className="tj-link" href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>Open →</a>}
          </div>
        ))}
      </div>
      {adding && (
        <div className="tj-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setAdding(false)}>
          <div className="tj-modal">
            <div className="tj-modal-header"><div className="tj-h1" style={{ marginBottom: 0 }}>Add Resource</div><span className="tj-btn" onClick={() => setAdding(false)}><X size={14} /></span></div>
            <Field label="Title"><input className="tj-input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></Field>
            <Field label="Author"><input className="tj-input" value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} /></Field>
            <div className="tj-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Topic"><input className="tj-input" value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} /></Field>
              <Field label="Level"><select className="tj-select" value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value })}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></Field>
            </div>
            <Field label="Description"><textarea className="tj-textarea" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
            <Field label="Source"><input className="tj-input" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} placeholder="e.g. Author's free website, Creative Commons, OpenStax" /></Field>
            <Field label="URL"><input className="tj-input" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} /></Field>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <span className="tj-btn" onClick={() => setAdding(false)}>Cancel</span>
              <span className="tj-btn primary" onClick={() => { onAdd({ ...draft, id: `lib_${Date.now()}` }); setAdding(false); setDraft({ title: "", author: "", topic: "Order Flow", level: "Beginner", description: "", source: "", url: "" }); }}><Check size={14} /> Add</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   STRATEGY LAB
   ============================================================ */

const emptyStrategy = () => ({
  id: `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  name: "", description: "", linkedSetups: [], rules: "", entryModel: "", confirmation: "",
  invalidation: "", stopLoss: "", takeProfit: "", observations: "", backtestNotes: "", mistakes: "", improvements: "",
  createdAt: new Date().toISOString(),
});

function StrategyLabList({ strategies, trades, onOpen, onNew, onDelete }) {
  const perf = (s) => {
    const linked = trades.map(withMetrics).filter((t) => t.__m.hasExit && s.linkedSetups.length > 0 && s.linkedSetups.every((tag) => t.setups.includes(tag)));
    return aggregateStats(linked);
  };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div><div className="tj-h1">Strategy Lab</div><div className="tj-sub">Cada estrategia es un notebook independiente, conectado a tus trades reales</div></div>
        <span className="tj-btn primary" onClick={onNew}><Plus size={14} /> New Strategy</span>
      </div>
      {strategies.length === 0 ? (
        <div className="tj-card tj-empty"><div className="tj-empty-title">No strategies yet.</div>Crea tu primera estrategia — reglas, modelo de entrada, notas de backtesting, todo en un solo lugar.</div>
      ) : (
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          {strategies.map((s) => {
            const p = perf(s);
            return (
              <div key={s.id} className="tj-card" style={{ cursor: "pointer" }} onClick={() => onOpen(s)}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{s.name || "(untitled strategy)"}</span>
                  <span className="tj-btn danger" style={{ padding: "2px 6px" }} onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}><Trash2 size={11} /></span>
                </div>
                <div style={{ fontSize: 12, color: "var(--dim)", margin: "6px 0" }}>{s.description || "No description"}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>{s.linkedSetups.map((t) => <span key={t} className="tj-badge be" style={{ fontSize: 10 }}>{t}</span>)}</div>
                {p.total > 0 ? (
                  <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                    <div><div className="tj-kpi-label" style={{ fontSize: 9 }}>Trades</div><div className="tj-mono">{p.total}</div></div>
                    <div><div className="tj-kpi-label" style={{ fontSize: 9 }}>Win Rate</div><div className="tj-mono">{fmtPct(p.winRate)}</div></div>
                    <div><div className="tj-kpi-label" style={{ fontSize: 9 }}>Net P&L</div><div className={`tj-mono ${p.netPnl >= 0 ? "tj-pos" : "tj-neg"}`} style={{ fontSize: 12 }}>{fmtMoney(p.netPnl)}</div></div>
                  </div>
                ) : <div style={{ fontSize: 11.5, color: "var(--dim)" }}>No linked trades yet — tag trades with all of this strategy's setups, or link them directly from Trade entry.</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StrategyLabDetail({ strategy, trades, shots, onClose, onSave, onSaveShots }) {
  const [s, setS] = useState(strategy);
  const [tab, setTab] = useState("notebook");
  const set = (k) => (e) => setS((p) => ({ ...p, [k]: e.target.value }));
  const toggleSetup = (tagName) => setS((p) => ({ ...p, linkedSetups: p.linkedSetups.includes(tagName) ? p.linkedSetups.filter((x) => x !== tagName) : [...p.linkedSetups, tagName] }));

  const linkedTrades = useMemo(() => trades.map(withMetrics).filter((t) => t.__m.hasExit && s.linkedSetups.length > 0 && s.linkedSetups.every((tag) => t.setups.includes(tag)) || t.strategyId === s.id), [trades, s.linkedSetups, s.id]);
  const stats = aggregateStats(linkedTrades);

  const dataSummary = useMemo(() => ({
    strategy: { name: s.name, rules: s.rules, entryModel: s.entryModel, confirmation: s.confirmation, invalidation: s.invalidation, stopLoss: s.stopLoss, takeProfit: s.takeProfit, myObservations: s.observations, myMistakeNotes: s.mistakes },
    performance: { trades: stats.total, winRate: Number(stats.winRate.toFixed(2)), avgR: Number(stats.avgRR.toFixed(2)), netPnl: Number(stats.netPnl.toFixed(2)), profitFactor: Number.isFinite(stats.profitFactor) ? Number(stats.profitFactor.toFixed(2)) : null, expectancy: Number(stats.expectancy.toFixed(2)) },
    recentTrades: linkedTrades.slice(-40).map((t) => ({ date: t.date, netPnl: Number(t.__m.netPnl.toFixed(2)), mistakes: t.mistakes, session: t.session, killZone: t.killZone })),
  }), [s, stats, linkedTrades]);

  const system = `${KNOWLEDGE_ENGINE_PREAMBLE}\n\nYou are currently in "Strategy Coach" mode, working inside the strategy notebook "${s.name || "(untitled)"}". For anything about this strategy or its linked trades, use ONLY the data provided below. Distinguish clearly between "My Rules" (exactly what the user wrote — never rewrite these silently), "General Trading Knowledge" (established concepts), and "AI Suggestions" (your own ideas, always prefixed with "Suggestion:" and explained). ${ANALYSIS_FRAMEWORK} Never give live buy/sell signals. Respond in the same language the user writes in. Strategy + performance data as JSON:\n\n${JSON.stringify(dataSummary)}`;

  return (
    <div className="tj-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="tj-modal" style={{ maxWidth: 900 }}>
        <div className="tj-modal-header">
          <input className="tj-input tj-h1" style={{ fontSize: 18, fontWeight: 600, border: "none", padding: 0, background: "transparent" }} value={s.name} onChange={set("name")} placeholder="Strategy name" />
          <div style={{ display: "flex", gap: 8 }}><span className="tj-btn primary" onClick={() => onSave(s)}><Check size={14} /> Save</span><span className="tj-btn" onClick={onClose}><X size={14} /></span></div>
        </div>

        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: 8 }}>
          <Kpi label="Linked Trades" value={stats.total} />
          <Kpi label="Win Rate" value={stats.total ? fmtPct(stats.winRate) : "—"} />
          <Kpi label="Avg R" value={stats.total ? fmtNum(stats.avgRR) : "—"} />
          <Kpi label="Net P&L" value={stats.total ? fmtMoney(stats.netPnl) : "—"} tone={stats.netPnl >= 0 ? "pos" : "neg"} />
        </div>

        <div className="tj-tabbar">
          {["notebook", "rules", "screenshots", "coach"].map((tb) => (
            <div key={tb} className={`tj-tabbtn ${tab === tb ? "active" : ""}`} onClick={() => setTab(tb)}>{tb === "notebook" ? "Notebook" : tb === "rules" ? "Rules & Setup" : tb === "screenshots" ? "Screenshots" : "AI Strategy Coach"}</div>
          ))}
        </div>

        {tab === "rules" && (
          <div>
            <Field label="Description"><textarea className="tj-textarea" rows={2} value={s.description} onChange={set("description")} /></Field>
            <div className="tj-section-title" style={{ marginTop: 0 }}>Linked Setup Tags (trade counts toward this strategy if it has ALL of these tags)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>{SETUPS.map((tg) => <Chip key={tg} label={tg} selected={s.linkedSetups.includes(tg)} onClick={() => toggleSetup(tg)} />)}</div>
            <Field label="Rules"><textarea className="tj-textarea" rows={5} value={s.rules} onChange={set("rules")} placeholder="1. Identify external liquidity...\n2. Wait for sweep...\n3. ..." /></Field>
            <div className="tj-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="Entry Model"><textarea className="tj-textarea" rows={3} value={s.entryModel} onChange={set("entryModel")} /></Field>
              <Field label="Confirmation"><textarea className="tj-textarea" rows={3} value={s.confirmation} onChange={set("confirmation")} /></Field>
              <Field label="Invalidation"><textarea className="tj-textarea" rows={3} value={s.invalidation} onChange={set("invalidation")} /></Field>
              <Field label="Ideal Session"><input className="tj-input" value={s.idealSession || ""} onChange={set("idealSession")} /></Field>
              <Field label="Stop Placement"><textarea className="tj-textarea" rows={2} value={s.stopLoss} onChange={set("stopLoss")} /></Field>
              <Field label="Target"><textarea className="tj-textarea" rows={2} value={s.takeProfit} onChange={set("takeProfit")} /></Field>
            </div>
          </div>
        )}

        {tab === "notebook" && (
          <div>
            <Field label="My Observations (unlimited)"><textarea className="tj-textarea" rows={6} value={s.observations} onChange={set("observations")} /></Field>
            <Field label="Backtesting Notes"><textarea className="tj-textarea" rows={4} value={s.backtestNotes} onChange={set("backtestNotes")} /></Field>
            <Field label="Mistakes"><textarea className="tj-textarea" rows={3} value={s.mistakes} onChange={set("mistakes")} /></Field>
            <Field label="Improvements"><textarea className="tj-textarea" rows={3} value={s.improvements} onChange={set("improvements")} /></Field>
          </div>
        )}

        {tab === "screenshots" && <StrategyScreenshots shots={shots} onSave={(next) => onSaveShots(s.id, next)} />}

        {tab === "coach" && (
          <AiChat systemPrompt={system} placeholder="Pregunta sobre esta estrategia..." emptyHint="Pregúntale al coach sobre esta estrategia específica."
            suggestions={["Explícame esta estrategia", "¿Qué estoy haciendo mal?", "Analiza mis trades de esta estrategia", "¿Cuál es mi expectancy aquí?", "Ayúdame a crear un checklist", "Hazme preguntas para comprobar si entiendo la estrategia"]} />
        )}
      </div>
    </div>
  );
}

function StrategyScreenshots({ shots, onSave }) {
  const [local, setLocal] = useState(shots || []);
  const inputRef = useRef(null);
  const addFile = async (f) => { const img = await resizeImage(f); const next = [...local, { id: `img_${Date.now()}`, image: img }]; setLocal(next); onSave(next); };
  const remove = (id) => { const next = local.filter((x) => x.id !== id); setLocal(next); onSave(next); };
  return (
    <div>
      <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        {local.map((im) => (
          <div key={im.id} className="tj-card" style={{ padding: 8, position: "relative" }}>
            <img src={im.image} style={{ width: "100%", borderRadius: 4 }} alt="strategy example" />
            <span className="tj-btn danger" style={{ position: "absolute", top: 12, right: 12, padding: "4px 6px" }} onClick={() => remove(im.id)}><Trash2 size={11} /></span>
          </div>
        ))}
        <div onClick={() => inputRef.current?.click()} style={{ border: "1px dashed var(--border)", borderRadius: 4, minHeight: 100, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--dim)", flexDirection: "column", gap: 6 }}>
          <ImagePlus size={18} /><span style={{ fontSize: 11 }}>Add example screenshot</span>
        </div>
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile(f); e.target.value = ""; }} />
    </div>
  );
}

/* ============================================================
   API CONNECTIONS (architecture-only, honest about limitations)
   ============================================================ */

function maskKey(v) { if (!v) return ""; const s = String(v); return s.length <= 4 ? "••••" : `••••••••••••${s.slice(-4)}`; }

function ApiConnections({ connections, onSave, onDelete }) {
  const [adding, setAdding] = useState(null);
  const [reveal, setReveal] = useState({});
  const [testResult, setTestResult] = useState({});

  const draftDefault = () => ({ id: `conn_${Date.now()}`, nickname: "", platform: "Topstep", apiKey: "", apiSecret: "", accountId: "", environment: "Demo", status: "disconnected", lastSync: null, tradesImported: 0 });

  const test = (conn) => {
    setTestResult((p) => ({ ...p, [conn.id]: "testing" }));
    setTimeout(() => {
      setTestResult((p) => ({ ...p, [conn.id]: "no_backend" }));
      onSave({ ...conn, status: "error" });
    }, 700);
  };

  const statusDot = (status) => ({ connected: "var(--green)", connecting: "var(--amber)", error: "var(--red)", disconnected: "var(--dim2)" }[status] || "var(--dim2)");
  const statusLabel = (status) => ({ connected: "🟢 Connected", connecting: "🟡 Connecting", error: "⚠ Error", disconnected: "🔴 Disconnected" }[status] || "🔴 Disconnected");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div><div className="tj-h1">API Connections</div><div className="tj-sub">Arquitectura preparada para brokers/prop firms — sin conexiones simuladas</div></div>
        <span className="tj-btn primary" onClick={() => setAdding(draftDefault())}><Plus size={14} /> Add Connection</span>
      </div>

      <div className="tj-card" style={{ marginBottom: 14, display: "flex", gap: 8 }}>
        <ShieldAlert size={16} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--dim)" }}>
          Esta app corre como un artifact del navegador sin backend propio: no puedo llamar a APIs privadas de Topstep, Lucid Trading, Alpha Futures u otras plataformas porque no tengo documentación oficial ni un servidor seguro para hacer esas llamadas autenticadas. Lo que sí existe aquí es la arquitectura completa (Connection Manager → Trade Normalizer → Database → Analytics) lista para conectarse en cuanto exista un backend real. Tus credenciales se guardan en el almacenamiento personal y privado del artifact — no en un vault cifrado de nivel empresarial — y nunca se muestran completas después de guardarlas.
        </div>
      </div>

      {connections.length === 0 ? (
        <div className="tj-card tj-empty"><div className="tj-empty-title">No connections configured.</div>Agrega una para dejar lista la configuración de tu prop firm o broker.</div>
      ) : (
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(2,1fr)" }}>
          {connections.map((c) => (
            <div key={c.id} className="tj-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontWeight: 600 }}>{c.nickname || c.platform}</div><div className="tj-sub" style={{ marginBottom: 0 }}>{c.platform} · {c.environment}</div></div>
                <span className="tj-mono" style={{ fontSize: 12 }}>{statusLabel(c.status)}</span>
              </div>
              <div style={{ marginTop: 10, fontSize: 12 }}>
                <div>API Key: <span className="tj-mono">{reveal[c.id] ? c.apiKey : maskKey(c.apiKey)}</span> <span onClick={() => setReveal((p) => ({ ...p, [c.id]: !p[c.id] }))} style={{ cursor: "pointer", color: "var(--dim)" }}>{reveal[c.id] ? <EyeOff size={12} /> : <Eye size={12} />}</span></div>
                <div>Account ID: <span className="tj-mono">{c.accountId || "—"}</span></div>
                <div>Last Sync: <span className="tj-mono">{c.lastSync || "Never"}</span></div>
                <div>Trades Imported: <span className="tj-mono">{c.tradesImported}</span></div>
              </div>
              {testResult[c.id] === "no_backend" && (
                <div className="tj-card" style={{ marginTop: 10, borderColor: "var(--red)", fontSize: 11.5 }}>
                  <strong className="tj-neg">Connection Error</strong><br />
                  Unable to synchronize trades: no live API connector is available in this environment for {c.platform}. Please verify official API documentation is available before a backend integration can be built.
                </div>
              )}
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <span className="tj-btn" onClick={() => setAdding(c)}><Pencil size={12} /> Edit</span>
                <span className="tj-btn" onClick={() => test(c)}><RefreshCw size={12} /> Test Connection</span>
                <span className="tj-btn disabled"><RefreshCw size={12} /> Sync Trades</span>
                <span className="tj-btn danger" onClick={() => onDelete(c.id)}><Trash2 size={12} /> Disconnect</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <div className="tj-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setAdding(null)}>
          <div className="tj-modal">
            <div className="tj-modal-header"><div className="tj-h1" style={{ marginBottom: 0 }}>Connection</div><span className="tj-btn" onClick={() => setAdding(null)}><X size={14} /></span></div>
            <Field label="Nickname"><input className="tj-input" value={adding.nickname} onChange={(e) => setAdding({ ...adding, nickname: e.target.value })} /></Field>
            <Field label="Platform"><select className="tj-select" value={adding.platform} onChange={(e) => setAdding({ ...adding, platform: e.target.value })}>{PROP_FIRMS.filter((p) => p !== "None / Personal").map((p) => <option key={p}>{p}</option>)}</select></Field>
            <div className="tj-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label="API Key"><input type="password" className="tj-input" value={adding.apiKey} onChange={(e) => setAdding({ ...adding, apiKey: e.target.value })} /></Field>
              <Field label="API Secret"><input type="password" className="tj-input" value={adding.apiSecret} onChange={(e) => setAdding({ ...adding, apiSecret: e.target.value })} /></Field>
              <Field label="Account ID"><input className="tj-input" value={adding.accountId} onChange={(e) => setAdding({ ...adding, accountId: e.target.value })} /></Field>
              <Field label="Environment"><select className="tj-select" value={adding.environment} onChange={(e) => setAdding({ ...adding, environment: e.target.value })}><option>Live</option><option>Demo/Test</option></select></Field>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--dim)", marginBottom: 12 }}>Tus claves nunca se muestran completas después de guardar y nunca aparecen en mensajes de error.</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <span className="tj-btn" onClick={() => setAdding(null)}>Cancel</span>
              <span className="tj-btn primary" onClick={() => { onSave(adding); setAdding(null); }}><Check size={14} /> Save Connection</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SETTINGS
   ============================================================ */

function SettingsView({ settings, onSave, onImport, onExport, onExportReport }) {
  const [s, setS] = useState(settings);
  const set = (k) => (e) => setS((p) => ({ ...p, [k]: e.target.value }));
  const setSessionDef = (name, field) => (e) => setS((p) => ({ ...p, sessionDefs: { ...p.sessionDefs, [name]: { ...p.sessionDefs[name], [field]: e.target.value } } }));
  const setKzDef = (name, field) => (e) => setS((p) => ({ ...p, killzoneDefs: { ...p.killzoneDefs, [name]: { ...p.killzoneDefs[name], [field]: e.target.value } } }));
  const fileRef = useRef(null); const [importPreview, setImportPreview] = useState(null);

  const parseCsv = (text) => {
    const lines = text.trim().split(/\r?\n/); const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const rows = lines.slice(1).map((line) => { const cells = line.split(","); const obj = {}; headers.forEach((h, i) => (obj[h] = (cells[i] || "").trim())); return obj; });
    const errors = [];
    const parsed = rows.map((r, i) => {
      const rowErrors = [];
      if (!r.date) rowErrors.push("missing date"); if (!r.instrument) rowErrors.push("missing instrument");
      if (!r.entryprice || isNaN(parseFloat(r.entryprice))) rowErrors.push("invalid entry price");
      if (rowErrors.length) errors.push({ row: i + 2, issues: rowErrors });
      return { ...emptyTrade(), date: r.date || new Date().toISOString().slice(0, 10), time: r.time || "09:30", instrument: (r.instrument || "NQ").toUpperCase(),
        direction: /short/i.test(r.direction) ? "Short" : "Long", entryPrice: r.entryprice || "", stopLoss: r.stoploss || "", takeProfit: r.takeprofit || "", exitPrice: r.exitprice || "",
        contracts: r.contracts || "1", commission: r.commission || "0", fees: r.fees || "0", setups: r.setup ? r.setup.split(";").map((x) => x.trim()).filter(Boolean) : [], notes: r.notes || "" };
    });
    return { parsed, errors };
  };
  const handleFile = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader(); reader.onload = () => setImportPreview(parseCsv(String(reader.result))); reader.readAsText(f); e.target.value = "";
  };

  return (
    <div>
      <div className="tj-h1">Settings</div>
      <div className="tj-sub">Account, timezone, sessions, import and export</div>

      <div className="tj-section-title">Account</div>
      <div className="tj-card">
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          <Field label="Starting Balance ($)"><input type="number" className="tj-input" value={s.startingBalance} onChange={set("startingBalance")} /></Field>
          <Field label="Current Balance ($)"><input type="number" className="tj-input" value={s.currentBalance} onChange={set("currentBalance")} /></Field>
          <Field label="Daily Loss Limit ($)"><input type="number" className="tj-input" value={s.dailyLossLimit} onChange={set("dailyLossLimit")} /></Field>
          <Field label="Max Drawdown Limit ($)"><input type="number" className="tj-input" value={s.maxDrawdownLimit} onChange={set("maxDrawdownLimit")} /></Field>
          <Field label="Risk per Trade (%)"><input type="number" step="0.1" className="tj-input" value={s.riskPerTradePercent} onChange={set("riskPerTradePercent")} /></Field>
          <Field label="Account Type"><input className="tj-input" value={s.accountType} onChange={set("accountType")} /></Field>
          <Field label="Prop Firm"><select className="tj-select" value={s.propFirm} onChange={set("propFirm")}>{PROP_FIRMS.map((p) => <option key={p}>{p}</option>)}</select></Field>
        </div>
      </div>

      <div className="tj-section-title">Trading Timezone</div>
      <div className="tj-card">
        <div className="tj-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Field label="Timezone">
            <select className="tj-select" value={s.tradingTimezone} onChange={set("tradingTimezone")}>{TZ_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          </Field>
          {s.tradingTimezone === "__custom__" && <Field label="Custom IANA timezone (e.g. Asia/Tokyo)"><input className="tj-input" value={s.customTimezone} onChange={set("customTimezone")} /></Field>}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--dim)" }}>Se usa para interpretar la hora en que registras un trade. La clasificación de Session/Kill Zone se calcula siempre correctamente contra America/New_York usando la base de datos de husos horarios (maneja DST automáticamente, no una diferencia fija de horas).</div>
      </div>

      <div className="tj-section-title">Session Windows (America/New_York, editable)</div>
      <div className="tj-card">
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
          {SESSIONS.map((name) => (
            <div key={name}>
              <div className="tj-label">{name}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="time" className="tj-input" value={s.sessionDefs[name].start} onChange={setSessionDef(name, "start")} />
                <input type="time" className="tj-input" value={s.sessionDefs[name].end} onChange={setSessionDef(name, "end")} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="tj-section-title">Kill Zone Windows (America/New_York, editable)</div>
      <div className="tj-card">
        <div className="tj-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
          {KILL_ZONES.map((name) => (
            <div key={name}>
              <div className="tj-label">{name}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="time" className="tj-input" value={s.killzoneDefs[name].start} onChange={setKzDef(name, "start")} />
                <input type="time" className="tj-input" value={s.killzoneDefs[name].end} onChange={setKzDef(name, "end")} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 8 }}>Estos son horarios comúnmente citados (estilo ICT) — no existe un estándar oficial único, por eso son editables.</div>
      </div>

      <span className="tj-btn primary" onClick={() => onSave(s)}><Check size={14} /> Save Settings</span>

      <div className="tj-section-title">Import Trades (CSV)</div>
      <div className="tj-card">
        <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 10 }}>Columnas esperadas: date, time, instrument, direction, entryprice, stoploss, takeprofit, exitprice, contracts, commission, fees, setup (separado por ;), notes.</div>
        <span className="tj-btn" onClick={() => fileRef.current?.click()}><Upload size={14} /> Choose CSV File</span>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFile} />
        {importPreview && (
          <div style={{ marginTop: 14 }}>
            <div className="tj-section-title" style={{ marginTop: 0 }}>Preview — {importPreview.parsed.length} rows</div>
            {importPreview.errors.length > 0 && (
              <div className="tj-card" style={{ borderColor: "var(--red)", marginBottom: 10 }}>
                <div className="tj-neg" style={{ fontWeight: 600, marginBottom: 6 }}>{importPreview.errors.length} row(s) have issues:</div>
                {importPreview.errors.slice(0, 10).map((e, i) => <div key={i} style={{ fontSize: 12 }}>Row {e.row}: {e.issues.join(", ")}</div>)}
              </div>
            )}
            <div className="tj-scroll" style={{ maxHeight: 240, overflowY: "auto" }}>
              <table className="tj-table"><thead><tr><th>Date</th><th>Instrument</th><th>Dir</th><th>Entry</th><th>Exit</th><th>Setups</th></tr></thead>
                <tbody>{importPreview.parsed.slice(0, 30).map((t, i) => <tr key={i}><td>{t.date}</td><td>{t.instrument}</td><td>{t.direction}</td><td>{t.entryPrice}</td><td>{t.exitPrice}</td><td>{t.setups.join(", ")}</td></tr>)}</tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <span className="tj-btn primary" onClick={() => { onImport(importPreview.parsed); setImportPreview(null); }}><Check size={14} /> Import {importPreview.parsed.length} Trades</span>
              <span className="tj-btn" onClick={() => setImportPreview(null)}>Cancel</span>
            </div>
          </div>
        )}
      </div>

      <div className="tj-section-title">Export</div>
      <div className="tj-card" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <span className="tj-btn" onClick={onExport}><Download size={14} /> Export CSV</span>
        <span className="tj-btn" onClick={onExportReport}><Download size={14} /> Export Performance Report (text)</span>
      </div>
    </div>
  );
}

/* ============================================================
   LIMITATIONS NOTE
   ============================================================ */

function LimitationsNote() {
  return (
    <div className="tj-card" style={{ marginTop: 22, fontSize: 12, color: "var(--dim)", lineHeight: 1.6 }}>
      <strong style={{ color: "var(--text)" }}>Honestidad sobre el alcance técnico de {APP_NAME}:</strong> esta app corre como un artifact de una sola página, no un backend multiusuario. Los datos persisten de forma privada para ti mediante el almacenamiento del artifact. No hay autenticación real de múltiples usuarios. Las conexiones API en Settings → API Connections son arquitectura lista para futuras integraciones, no conexiones en vivo: no llamo a APIs privadas de brokers/prop firms sin documentación oficial, y el almacenamiento de claves aquí no es un vault cifrado de nivel empresarial. Los horarios de sesión y kill zone se calculan con la base de datos de husos horarios IANA (DST correcto), pero sus ventanas son convenciones de mercado comúnmente citadas, no un estándar oficial único — por eso son editables. Los screenshots se suben manualmente porque una captura automática de TradingView requeriría permisos de API externos que no existen aquí. One Percent AI sí hace llamadas reales a la API de Anthropic con tus datos como contexto en cada sección donde aparece, y puede analizar capturas de pantalla que adjuntes (Chart Analysis, Trade Analyst, AI Tutor, Strategy Coach) — pero no tiene acceso a datos de mercado en vivo (precios, volumen o Delta en tiempo real), así que nunca inventa esos valores cuando no puede verlos en la imagen.
    </div>
  );
}

/* ============================================================
   MAIN APP
   ============================================================ */

const JOURNAL_NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "trades", label: "Trades", icon: ListTree },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "profitability", label: "Am I Profitable?", icon: Wallet },
];
const ANALYTICS_NAV = [
  { id: "strategies", label: "Strategy Performance", icon: Layers },
  { id: "mistakes", label: "Mistake Analyzer", icon: AlertTriangle },
  { id: "time", label: "Time & Sessions", icon: LineChartIcon },
  { id: "ai_trade", label: "Trade Analyst", icon: Bot },
  { id: "notes", label: "Journal Notes", icon: StickyNote },
];
const LEARNING_NAV = [
  { id: "ai_tutor", label: "AI Tutor", icon: GraduationCap },
  { id: "chart_analysis", label: "Chart Analysis", icon: ImagePlus },
  { id: "learning_path", label: "My Learning Path", icon: Target },
  { id: "strategy_lab", label: "Strategy Lab", icon: FlaskConical },
  { id: "knowledge_notes", label: "Knowledge Notes", icon: StickyNote },
  { id: "library", label: "Library", icon: BookOpen },
  { id: "quizzes", label: "Quizzes", icon: ClipboardList },
  { id: "progress", label: "My Progress", icon: Award },
];
const SETTINGS_NAV = [
  { id: "settings", label: "Settings", icon: SettingsIcon },
  { id: "connections", label: "API Connections", icon: Link2 },
];

export default function App() {
  const [tab, setTab] = useState("dashboard");
  const [trades, setTrades] = useState([]);
  const [notes, setNotes] = useState([]);
  const [knowledgeNotes, setKnowledgeNotes] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [connections, setConnections] = useState([]);
  const [libraryResources, setLibraryResources] = useState(SEED_LIBRARY);
  const [progress, setProgress] = useState({});
  const [studyTimeSec, setStudyTimeSec] = useState(0);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [range, setRange] = useState("30D");

  const [formOpen, setFormOpen] = useState(false);
  const [editTrade, setEditTrade] = useState(null);
  const [reviewTrade, setReviewTrade] = useState(null);
  const [reviewShots, setReviewShots] = useState({});
  const [dayDetail, setDayDetail] = useState(null);
  const [openStrategy, setOpenStrategy] = useState(null);
  const [strategyShots, setStrategyShots] = useState([]);
  const [tutorPresetTopic, setTutorPresetTopic] = useState(null);

  useEffect(() => {
    (async () => {
      setTrades(await storageGet("trades-list", []));
      setNotes(await storageGet("notes-list", []));
      setKnowledgeNotes(await storageGet("knowledge-notes-list", []));
      setStrategies(await storageGet("strategies-list", []));
      setConnections(await storageGet("connections-list", []));
      const lib = await storageGet("library-resources-list", null);
      setLibraryResources(lib || SEED_LIBRARY);
      setProgress(await storageGet("learning-progress", {}));
      setStudyTimeSec(await storageGet("study-time-sec", 0));
      const s = await storageGet("settings", DEFAULT_SETTINGS);
      setSettings({ ...DEFAULT_SETTINGS, ...s, sessionDefs: { ...DEFAULT_SESSION_DEFS, ...(s.sessionDefs || {}) }, killzoneDefs: { ...DEFAULT_KILLZONE_DEFS, ...(s.killzoneDefs || {}) } });
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) storageSet("trades-list", trades); }, [trades, loaded]);
  useEffect(() => { if (loaded) storageSet("notes-list", notes); }, [notes, loaded]);
  useEffect(() => { if (loaded) storageSet("knowledge-notes-list", knowledgeNotes); }, [knowledgeNotes, loaded]);
  useEffect(() => { if (loaded) storageSet("strategies-list", strategies); }, [strategies, loaded]);
  useEffect(() => { if (loaded) storageSet("connections-list", connections); }, [connections, loaded]);
  useEffect(() => { if (loaded) storageSet("library-resources-list", libraryResources); }, [libraryResources, loaded]);
  useEffect(() => { if (loaded) storageSet("learning-progress", progress); }, [progress, loaded]);
  useEffect(() => { if (loaded) storageSet("study-time-sec", studyTimeSec); }, [studyTimeSec, loaded]);
  useEffect(() => { if (loaded) storageSet("settings", settings); }, [settings, loaded]);

  const saveTrade = (t) => { setTrades((prev) => (prev.some((p) => p.id === t.id) ? prev.map((p) => (p.id === t.id ? t : p)) : [...prev, t])); setFormOpen(false); setEditTrade(null); };
  const deleteTrade = (id) => { setTrades((prev) => prev.filter((t) => t.id !== id)); storageDelete(`shots:${id}`); };
  const openReview = async (t) => { setReviewShots(await storageGet(`shots:${t.id}`, {})); setReviewTrade(t); };
  const saveShots = async (id, shots) => { await storageSet(`shots:${id}`, shots); setTrades((prev) => prev.map((t) => (t.id === id ? { ...t, hasScreenshots: Object.values(shots).some(Boolean) } : t))); };

  const saveNote = (n) => { const now = new Date().toISOString(); setNotes((prev) => (n.id ? prev.map((p) => (p.id === n.id ? { ...n, updatedAt: now } : p)) : [...prev, { ...n, id: `n_${Date.now()}`, createdAt: now, updatedAt: now }])); };
  const deleteNote = (id) => setNotes((prev) => prev.filter((n) => n.id !== id));

  const saveKnowledgeNote = (n) => setKnowledgeNotes((prev) => (n.id ? prev.map((p) => (p.id === n.id ? n : p)) : [...prev, { ...n, id: `kn_${Date.now()}` }]));
  const deleteKnowledgeNote = (id) => setKnowledgeNotes((prev) => prev.filter((n) => n.id !== id));

  const openStrategyDetail = async (s) => { setStrategyShots(await storageGet(`strategy-shots:${s.id}`, [])); setOpenStrategy(s); };
  const saveStrategy = (s) => { setStrategies((prev) => (prev.some((p) => p.id === s.id) ? prev.map((p) => (p.id === s.id ? s : p)) : [...prev, s])); setOpenStrategy(null); };
  const deleteStrategy = (id) => { setStrategies((prev) => prev.filter((s) => s.id !== id)); storageDelete(`strategy-shots:${id}`); };
  const saveStrategyShots = async (id, shots) => { await storageSet(`strategy-shots:${id}`, shots); setStrategyShots(shots); };

  const saveConnection = (c) => setConnections((prev) => (prev.some((p) => p.id === c.id) ? prev.map((p) => (p.id === c.id ? c : p)) : [...prev, c]));
  const deleteConnection = (id) => setConnections((prev) => prev.filter((c) => c.id !== id));

  const addLibraryResource = (r) => setLibraryResources((prev) => [...prev, r]);
  const deleteLibraryResource = (id) => setLibraryResources((prev) => prev.filter((r) => r.id !== id));

  const setTopicStatus = (topic, status) => setProgress((prev) => ({ ...prev, [topic]: { ...(prev[topic] || {}), status } }));
  const recordQuizResult = (topic, pct) => setProgress((prev) => ({ ...prev, [topic]: { ...(prev[topic] || {}), lastQuizPct: pct, status: pct >= 70 ? "completed" : "in_progress" } }));
  const addStudySeconds = (sec) => setStudyTimeSec((prev) => prev + (sec || 0));

  const importTrades = (parsed) => setTrades((prev) => [...prev, ...parsed]);
  const exportCsv = () => {
    const headers = ["date", "time", "instrument", "direction", "entryPrice", "stopLoss", "takeProfit", "exitPrice", "contracts", "commission", "fees", "setups", "netPnl"];
    const rows = trades.map((t) => { const m = computeTradeMetrics(t); return [t.date, t.time, t.instrument, t.direction, t.entryPrice, t.stopLoss, t.takeProfit, t.exitPrice, t.contracts, t.commission, t.fees, t.setups.join(";"), m.hasExit ? m.netPnl.toFixed(2) : ""].join(","); });
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "trades_export.csv"; a.click();
  };
  const exportReport = () => {
    const closed = trades.map(withMetrics).filter((t) => t.__m.hasExit); const stats = aggregateStats(closed);
    const lines = [`${APP_NAME} — PERFORMANCE REPORT`, new Date().toLocaleString(), "", `Total Trades: ${stats.total}`, `Win Rate: ${fmtPct(stats.winRate)}`, `Profit Factor: ${Number.isFinite(stats.profitFactor) ? fmtNum(stats.profitFactor) : "∞"}`, `Expectancy: ${fmtMoney(stats.expectancy)}`, `Net P&L: ${fmtMoney(stats.netPnl)}`, `Average Win: ${fmtMoney(stats.avgWin)}`, `Average Loss: ${fmtMoney(-stats.avgLoss)}`, `Best Win Streak: ${stats.bestWinStreak}`, `Worst Loss Streak: ${stats.worstLossStreak}`];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "performance_report.txt"; a.click();
  };

  if (!loaded) return (<div className="tj-root"><GlobalStyle /><div style={{ margin: "auto", color: "var(--dim)" }}>Loading {APP_NAME}...</div></div>);

  const renderNavGroup = (items) => items.map((n) => (
    <div key={n.id} className={`tj-navitem ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}><n.icon size={15} /> {n.label}</div>
  ));

  return (
    <div className="tj-root">
      <GlobalStyle />
      <div className="tj-sidebar">
        <div className="tj-brand"><div className="tj-brand-title tj-mono">◆ {APP_NAME}</div><div className="tj-brand-sub">Trading Journal &amp; Learning Center</div></div>
        <div className="tj-navgroup">Journal</div>{renderNavGroup(JOURNAL_NAV)}
        <div className="tj-navgroup">Analytics</div>{renderNavGroup(ANALYTICS_NAV)}
        <div className="tj-navgroup">Learning Center</div>{renderNavGroup(LEARNING_NAV)}
        <div className="tj-navgroup">System</div>{renderNavGroup(SETTINGS_NAV)}
      </div>

      <div className="tj-main">
        {tab === "dashboard" && <Dashboard trades={trades} settings={settings} range={range} setRange={setRange} />}
        {tab === "trades" && <TradeLibrary trades={trades} strategies={strategies} onEdit={(t) => { setEditTrade(t); setFormOpen(true); }} onDelete={deleteTrade} onOpen={openReview} onNew={() => { setEditTrade(null); setFormOpen(true); }} />}
        {tab === "calendar" && <JournalCalendar trades={trades} onOpenDay={(date, dayTrades) => setDayDetail({ date, dayTrades })} />}
        {tab === "profitability" && <Profitability trades={trades} settings={settings} />}

        {tab === "strategies" && (<div><div className="tj-h1">Strategy Performance</div><div className="tj-sub">Comparación por setup — a nivel de tag individual</div><StrategyPerformance trades={trades} /></div>)}
        {tab === "mistakes" && (<div><div className="tj-h1">Trade Mistake Analyzer</div><div className="tj-sub">Patrones calculados solo a partir de tus trades reales</div><MistakeAnalyzer trades={trades} /></div>)}
        {tab === "time" && (<div><div className="tj-h1">Time &amp; Session Analysis</div><div className="tj-sub">¿Cuándo tienes mejor rendimiento?</div><TimeAndSessions trades={trades} /></div>)}
        {tab === "ai_trade" && <TradeAnalyst trades={trades} settings={settings} />}
        {tab === "notes" && <Notes notes={notes} trades={trades} onSave={saveNote} onDelete={deleteNote} />}

        {tab === "ai_tutor" && <AiTutor progress={progress} onStudySeconds={addStudySeconds} presetTopic={tutorPresetTopic} onConsumePreset={() => setTutorPresetTopic(null)} />}
        {tab === "chart_analysis" && <ChartAnalysis />}
        {tab === "learning_path" && <LearningPathView progress={progress} onSetStatus={setTopicStatus} onAskTutor={(topic) => { setTutorPresetTopic(topic); setTab("ai_tutor"); }} />}
        {tab === "strategy_lab" && <StrategyLabList strategies={strategies} trades={trades} onOpen={openStrategyDetail} onNew={() => openStrategyDetail(emptyStrategy())} onDelete={deleteStrategy} />}
        {tab === "knowledge_notes" && <KnowledgeNotes notes={knowledgeNotes} onSave={saveKnowledgeNote} onDelete={deleteKnowledgeNote} />}
        {tab === "library" && <LibraryView resources={libraryResources} onAdd={addLibraryResource} onDelete={deleteLibraryResource} />}
        {tab === "quizzes" && <QuizzesView progress={progress} onQuizResult={recordQuizResult} />}
        {tab === "progress" && <ProgressView progress={progress} studyTimeSec={studyTimeSec} />}

        {tab === "settings" && <SettingsView settings={settings} onSave={setSettings} onImport={importTrades} onExport={exportCsv} onExportReport={exportReport} />}
        {tab === "connections" && <ApiConnections connections={connections} onSave={saveConnection} onDelete={deleteConnection} />}

        <LimitationsNote />
      </div>

      {formOpen && <TradeForm initial={editTrade} onClose={() => { setFormOpen(false); setEditTrade(null); }} onSave={saveTrade} riskLimitPercent={num(settings.riskPerTradePercent)} startingBalance={num(settings.currentBalance) || num(settings.startingBalance)} settings={settings} strategies={strategies} />}
      {reviewTrade && <TradeReview trade={reviewTrade} shots={reviewShots} strategies={strategies} onClose={() => setReviewTrade(null)} onSaveShots={saveShots} onEdit={(t) => { setReviewTrade(null); setEditTrade(t); setFormOpen(true); }} />}
      {dayDetail && <DayDetail date={dayDetail.date} dayTrades={dayDetail.dayTrades} onClose={() => setDayDetail(null)} onOpenTrade={(t) => { setDayDetail(null); openReview(t); }} />}
      {openStrategy && <StrategyLabDetail strategy={openStrategy} trades={trades} shots={strategyShots} onClose={() => setOpenStrategy(null)} onSave={saveStrategy} onSaveShots={saveStrategyShots} />}
    </div>
  );
}
