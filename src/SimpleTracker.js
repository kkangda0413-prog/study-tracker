import { useState, useEffect, useCallback, useRef } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase-config";

const STYLE = `
.tt-root {
  --paper: #EAEBE6;
  --paper-card: #F6F6F2;
  --ink: #242620;
  --ink-soft: #767870;
  --ink-faint: #ABADA3;
  --amber: #D98A3D;
  --amber-soft: #F2DEC0;
  --teal: #5E8C86;
  --teal-soft: #DCE9E5;
  --line: #DBDCD5;
  --focus: #3D6B63;
  --font-display: 'Fraunces', Georgia, serif;
  --font-body: 'IBM Plex Sans', -apple-system, sans-serif;
  --font-mono: 'IBM Plex Mono', 'SFMono-Regular', monospace;

  width: 100%;
  min-height: 100vh;
  background: var(--paper);
  font-family: var(--font-body);
  color: var(--ink);
  box-sizing: border-box;
  padding: 28px 16px 60px;
}
.tt-root * { box-sizing: border-box; }

.tt-topbar {
  max-width: 420px;
  margin: 0 auto 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.tt-user {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--ink-soft);
}
.tt-topbar-actions { display: flex; gap: 8px; }
.tt-switch-btn, .tt-logout-btn {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--ink);
  background: var(--paper-card);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 7px 12px;
  cursor: pointer;
}
.tt-switch-btn:hover, .tt-logout-btn:hover { filter: brightness(0.97); }

.tt-inner {
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
}

.tt-header {
  margin-bottom: 22px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 10px;
}
.tt-eyebrow {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-faint);
  margin-bottom: 4px;
}
.tt-date {
  font-family: var(--font-display);
  font-weight: 500;
  font-size: 22px;
  font-style: italic;
  color: var(--ink);
}
.tt-cal-btn {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--teal);
  background: var(--teal-soft);
  border: none;
  border-radius: 10px;
  padding: 8px 12px;
  cursor: pointer;
  white-space: nowrap;
}
.tt-cal-btn:hover { filter: brightness(0.97); }
.tt-today-pill {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--amber);
  background: var(--amber-soft);
  border: none;
  border-radius: 10px;
  padding: 6px 12px;
  cursor: pointer;
  margin-top: 6px;
}

.tt-card {
  background: var(--paper-card);
  border-radius: 16px;
  padding: 26px 22px;
  border: 1px solid var(--line);
}

.tt-hero { text-align: center; margin-bottom: 18px; }
.tt-minutes {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 52px;
  line-height: 1;
  color: var(--ink);
}
.tt-unit {
  font-size: 18px;
  font-weight: 500;
  color: var(--ink-soft);
  margin-left: 4px;
}
.tt-subtext {
  margin-top: 8px;
  font-size: 13px;
  color: var(--ink-soft);
}

.tt-trail {
  min-height: 26px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: center;
  align-items: center;
  margin-bottom: 22px;
  padding: 0 4px;
}
.tt-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--amber);
  display: inline-block;
  animation: tt-pop 0.35s ease-out backwards;
}
.tt-dot-recovery {
  background: var(--teal);
  width: 14px;
  height: 14px;
}
@keyframes tt-pop {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .tt-dot { animation: none; }
}

.tt-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.tt-btn-primary {
  flex: 1;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 15px;
  color: #fff;
  background: var(--amber);
  border: none;
  border-radius: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: filter 0.15s ease;
}
.tt-btn-primary:hover { filter: brightness(1.05); }
.tt-btn-primary:active { filter: brightness(0.95); }
.tt-btn-primary:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}
.tt-btn-ghost {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-soft);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px 14px;
  cursor: pointer;
}
.tt-btn-ghost:disabled { opacity: 0.4; cursor: default; }
.tt-btn-ghost:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.tt-recovery-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--ink-soft);
  cursor: pointer;
  user-select: none;
}
.tt-recovery-toggle input {
  width: 16px;
  height: 16px;
  accent-color: var(--teal);
  cursor: pointer;
}

.tt-divider {
  height: 1px;
  background: var(--line);
  margin: 20px 0 14px;
  border: none;
}

.tt-week-link {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--teal);
  background: none;
  border: none;
  padding: 4px 0;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.tt-week-link:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 2px;
}

.tt-week-panel {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px dashed var(--line);
}
.tt-week-total {
  font-size: 13px;
  color: var(--ink-soft);
  margin-bottom: 10px;
}
.tt-mono { font-family: var(--font-mono); color: var(--ink); font-weight: 600; }
.tt-week-list { list-style: none; margin: 0; padding: 0; }
.tt-week-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 0;
  font-size: 13px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
  background: none;
  border-left: none; border-right: none; border-top: none;
  width: 100%;
  font-family: inherit;
}
.tt-week-item:last-child { border-bottom: none; }
.tt-week-item:hover { background: var(--paper); }
.tt-week-date { color: var(--ink-soft); }
.tt-week-value { font-family: var(--font-mono); color: var(--ink); }
.tt-week-value.is-recovery { color: var(--teal); }

.tt-muted { font-size: 13px; color: var(--ink-faint); }

.tt-reset-row { margin-top: 18px; text-align: center; }
.tt-reset-link {
  font-size: 11px;
  color: var(--ink-faint);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.tt-reset-confirm { font-size: 12px; color: var(--ink-soft); }
.tt-reset-confirm button {
  font-size: 12px;
  background: none;
  border: none;
  color: var(--teal);
  cursor: pointer;
  text-decoration: underline;
  margin: 0 2px;
}

.tt-save-flag {
  text-align: center;
  font-size: 11px;
  color: var(--ink-faint);
  margin-top: 10px;
}

.tt-cal-backdrop {
  position: fixed; inset: 0; z-index: 149;
  background: rgba(36,38,32,0.35);
}
.tt-cal-overlay {
  position: fixed; inset: 0; z-index: 150;
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 70px;
}
.tt-cal-popup {
  background: var(--paper-card);
  border-radius: 16px;
  border: 1px solid var(--line);
  padding: 20px;
  width: 320px;
  box-shadow: 0 8px 40px rgba(36,38,32,0.18);
}
.tt-cal-nav {
  background: none; border: none; cursor: pointer;
  font-size: 20px; color: var(--ink-soft); padding: 4px 8px;
  font-family: var(--font-body);
}
.tt-cal-title {
  font-family: var(--font-display);
  font-style: italic;
  font-weight: 500;
  font-size: 16px;
  color: var(--ink);
}
.tt-cal-dow {
  width: 38px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: var(--ink-faint); font-family: var(--font-body);
}
.tt-cal-day {
  width: 38px; height: 38px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  border-radius: 10px;
  font-size: 13px;
  cursor: pointer;
  font-family: var(--font-body);
  color: var(--ink);
  background: transparent;
  border: none;
  position: relative;
}
.tt-cal-day:hover { background: var(--paper); }
.tt-cal-day.is-today { color: var(--amber); font-weight: 600; }
.tt-cal-day.is-selected { background: var(--ink); color: var(--paper-card); font-weight: 600; }
.tt-cal-day.is-future { color: var(--ink-faint); cursor: default; }
.tt-cal-day.is-future:hover { background: transparent; }
.tt-cal-day .tt-cal-mark {
  width: 4px; height: 4px; border-radius: 50%;
  background: var(--amber);
  position: absolute; bottom: 4px;
}
.tt-cal-day.is-selected .tt-cal-mark { background: var(--paper-card); }
.tt-cal-day .tt-cal-mark.is-recovery { background: var(--teal); }
.tt-cal-go-today {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 7px 16px;
  cursor: pointer;
}
`;

const DAY_MS = 24 * 60 * 60 * 1000;
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function keyToDate(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function monthKey(y, m) { return `${y}-${String(m + 1).padStart(2, "0")}`; }

const DEFAULT_DAY = { blocks: 0, recovery: false };

export default function SimpleTracker({ user, onLogout, onSwitchVersion }) {
  const uid = user.uid;
  const [realToday, setRealToday] = useState(() => dateKey(new Date()));
  const [viewedKey, setViewedKey] = useState(() => dateKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [todayData, setTodayData] = useState(DEFAULT_DAY);
  const [saveError, setSaveError] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const [showWeekly, setShowWeekly] = useState(false);
  const [weekLoading, setWeekLoading] = useState(false);
  const [weekData, setWeekData] = useState([]);

  const [showCal, setShowCal] = useState(false);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [calLoading, setCalLoading] = useState(false);
  const monthCache = useRef({});
  const [, forceTick] = useState(0);

  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const isViewingToday = viewedKey === realToday;

  const loadDay = useCallback(async (dk) => {
    try {
      const ref = doc(db, "users", uid, "simpleDays", dk);
      const snap = await getDoc(ref);
      return snap.exists()
        ? { blocks: snap.data().blocks ?? 0, recovery: snap.data().recovery ?? false }
        : { ...DEFAULT_DAY };
    } catch {
      return { ...DEFAULT_DAY };
    }
  }, [uid]);

  const saveDay = useCallback(async (dk, data) => {
    try {
      const ref = doc(db, "users", uid, "simpleDays", dk);
      await setDoc(ref, data, { merge: true });
      setSaveError(false);
      const mk = dk.slice(0, 7);
      if (monthCache.current[mk]) {
        monthCache.current[mk][dk] = data;
        forceTick((t) => t + 1);
      }
    } catch {
      setSaveError(true);
    }
  }, [uid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const data = await loadDay(viewedKey);
      if (!cancelled) {
        setTodayData(data);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewedKey, loadDay]);

  useEffect(() => {
    const id = setInterval(() => {
      const k = dateKey(new Date());
      setRealToday((prevReal) => {
        if (k !== prevReal) {
          setViewedKey((prevViewed) => (prevViewed === prevReal ? k : prevViewed));
          return k;
        }
        return prevReal;
      });
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const addBlock = useCallback(() => {
    setTodayData((prev) => {
      const next = { ...prev, blocks: prev.blocks + 1 };
      saveDay(viewedKey, next);
      return next;
    });
  }, [viewedKey, saveDay]);

  const undoLast = useCallback(() => {
    setTodayData((prev) => {
      if (prev.blocks === 0) return prev;
      const next = { ...prev, blocks: prev.blocks - 1 };
      saveDay(viewedKey, next);
      return next;
    });
  }, [viewedKey, saveDay]);

  const toggleRecovery = useCallback(() => {
    setTodayData((prev) => {
      const next = { ...prev, recovery: !prev.recovery };
      saveDay(viewedKey, next);
      return next;
    });
  }, [viewedKey, saveDay]);

  const doReset = useCallback(() => {
    const next = { ...DEFAULT_DAY };
    setTodayData(next);
    saveDay(viewedKey, next);
    setConfirmingReset(false);
  }, [viewedKey, saveDay]);

  const openWeekly = useCallback(async () => {
    const next = !showWeekly;
    setShowWeekly(next);
    if (next) {
      setWeekLoading(true);
      const base = keyToDate(realToday);
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(base.getTime() - i * DAY_MS);
        const dk = dateKey(d);
        const data = await loadDay(dk);
        const label = dk === realToday
          ? "오늘"
          : new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(d);
        days.push({ date: dk, label, blocks: data.blocks, recovery: data.recovery });
      }
      if (mounted.current) {
        setWeekData(days);
        setWeekLoading(false);
      }
    }
  }, [showWeekly, realToday, loadDay]);

  // ── Calendar ───────────────────────────────────────────────────────────
  const loadMonth = useCallback(async (y, m) => {
    const mk = monthKey(y, m);
    if (monthCache.current[mk]) return;
    setCalLoading(true);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const todayD = keyToDate(realToday);
    const entries = {};
    const tasks = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(y, m, d);
      if (dateObj > todayD) continue;
      const dk = dateKey(dateObj);
      tasks.push(loadDay(dk).then((data) => { entries[dk] = data; }));
    }
    await Promise.all(tasks);
    monthCache.current[mk] = entries;
    if (mounted.current) {
      setCalLoading(false);
      forceTick((t) => t + 1);
    }
  }, [loadDay, realToday]);

  const openCalendar = useCallback(() => {
    const willOpen = !showCal;
    setShowCal(willOpen);
    if (willOpen) {
      const base = keyToDate(viewedKey);
      setCalYear(base.getFullYear());
      setCalMonth(base.getMonth());
      loadMonth(base.getFullYear(), base.getMonth());
    }
  }, [showCal, viewedKey, loadMonth]);

  const prevMonth = useCallback(() => {
    let y = calYear, m = calMonth - 1;
    if (m < 0) { m = 11; y -= 1; }
    setCalYear(y); setCalMonth(m);
    loadMonth(y, m);
  }, [calYear, calMonth, loadMonth]);

  const nextMonth = useCallback(() => {
    let y = calYear, m = calMonth + 1;
    if (m > 11) { m = 0; y += 1; }
    setCalYear(y); setCalMonth(m);
    loadMonth(y, m);
  }, [calYear, calMonth, loadMonth]);

  const selectCalDate = useCallback((d) => {
    const todayD = keyToDate(realToday);
    if (d > todayD) return;
    setViewedKey(dateKey(d));
    setShowCal(false);
    setShowWeekly(false);
    setConfirmingReset(false);
  }, [realToday]);

  const buildCalendarCells = (y, m) => {
    const firstDow = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const cells = Array.from({ length: firstDow }, () => null);
    for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
    return cells;
  };

  const formattedDate = isViewingToday
    ? new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date())
    : new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(keyToDate(viewedKey));

  const blocks = todayData.blocks;
  const recovery = todayData.recovery;
  const minutes = blocks * 10;

  const weekTotalMinutes = weekData.reduce((sum, d) => sum + d.blocks * 10, 0);

  let subtext;
  if (recovery && blocks === 0) subtext = "이 날은 회복일";
  else if (blocks === 0) subtext = "아직 채운 칸이 없어요";
  else subtext = `${blocks}칸 채웠어요`;

  const calCells = buildCalendarCells(calYear, calMonth);
  const calMonthData = monthCache.current[monthKey(calYear, calMonth)] || {};
  const todayD = keyToDate(realToday);

  return (
    <div className="tt-root">
      <style>{STYLE}</style>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;1,500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@600&display=swap" rel="stylesheet" />

      <div className="tt-topbar">
        <span className="tt-user">{user.displayName}</span>
        <div className="tt-topbar-actions">
          <button className="tt-switch-btn" onClick={onSwitchVersion}>📊 풀 버전 보기</button>
          <button className="tt-logout-btn" onClick={onLogout}>로그아웃</button>
        </div>
      </div>

      <div className="tt-inner">
        <div className="tt-header">
          <div>
            <div className="tt-eyebrow">{isViewingToday ? "오늘" : "기록 보기"}</div>
            <div className="tt-date">{formattedDate}</div>
            {!isViewingToday && (
              <button className="tt-today-pill" onClick={() => setViewedKey(realToday)}>오늘로 돌아가기</button>
            )}
          </div>
          <button className="tt-cal-btn" onClick={openCalendar}>📅 달력</button>
        </div>

        <div className="tt-card">
          {loading ? (
            <p className="tt-muted">불러오는 중...</p>
          ) : (
            <>
              <div className="tt-hero">
                <div className="tt-minutes">
                  {minutes}
                  <span className="tt-unit">분</span>
                </div>
                <div className="tt-subtext">{subtext}</div>
              </div>

              <div className="tt-trail" aria-label={`${blocks}칸`}>
                {Array.from({ length: blocks }).map((_, i) => (
                  <span key={i} className="tt-dot" style={{ animationDelay: `${i * 0.03}s` }} />
                ))}
                {recovery && blocks === 0 && <span className="tt-dot tt-dot-recovery" />}
              </div>

              <div className="tt-actions">
                <button className="tt-btn-primary" onClick={addBlock}>
                  +10분 채우기
                </button>
                <button className="tt-btn-ghost" onClick={undoLast} disabled={blocks === 0}>
                  되돌리기
                </button>
              </div>

              <label className="tt-recovery-toggle">
                <input type="checkbox" checked={recovery} onChange={toggleRecovery} />
                <span>이 날은 회복일이에요</span>
              </label>

              <hr className="tt-divider" />

              <button className="tt-week-link" onClick={openWeekly}>
                {showWeekly ? "주간 보기 닫기" : "이번 주 보기"}
              </button>

              {showWeekly && (
                <div className="tt-week-panel">
                  {weekLoading ? (
                    <p className="tt-muted">불러오는 중...</p>
                  ) : (
                    <>
                      <div className="tt-week-total">
                        이번 주 합계 <span className="tt-mono">{weekTotalMinutes}분</span>
                      </div>
                      <ul className="tt-week-list">
                        {weekData.map((d) => (
                          <li key={d.date}>
                            <button className="tt-week-item" onClick={() => { setViewedKey(d.date); setShowWeekly(false); }}>
                              <span className="tt-week-date">{d.label}</span>
                              <span className={`tt-week-value${d.recovery ? " is-recovery" : ""}`}>
                                {d.recovery ? "회복일" : `${d.blocks * 10}분`}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}

              <div className="tt-reset-row">
                {!confirmingReset ? (
                  <button className="tt-reset-link" onClick={() => setConfirmingReset(true)}>
                    이 날 기록 초기화
                  </button>
                ) : (
                  <span className="tt-reset-confirm">
                    정말 초기화할까요?
                    <button onClick={doReset}>네</button>
                    <button onClick={() => setConfirmingReset(false)}>아니요</button>
                  </span>
                )}
              </div>

              {saveError && <div className="tt-save-flag">저장에 실패했어요, 곧 다시 시도할게요</div>}
            </>
          )}
        </div>
      </div>

      {showCal && (
        <>
          <div className="tt-cal-backdrop" onClick={() => setShowCal(false)} />
          <div className="tt-cal-overlay">
            <div className="tt-cal-popup">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <button className="tt-cal-nav" onClick={prevMonth}>‹</button>
                <span className="tt-cal-title">{calYear}년 {calMonth + 1}월</span>
                <button className="tt-cal-nav" onClick={nextMonth}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,38px)", gap: 2, justifyContent: "center", marginBottom: 4 }}>
                {DOW.map((d) => <div key={d} className="tt-cal-dow">{d}</div>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,38px)", gap: 2, justifyContent: "center" }}>
                {calCells.map((d, i) => {
                  if (!d) return <div key={`e${i}`} />;
                  const dk = dateKey(d);
                  const isFuture = d > todayD;
                  const isToday = dk === realToday;
                  const isSelected = dk === viewedKey;
                  const dayData = calMonthData[dk];
                  const hasBlocks = dayData && dayData.blocks > 0;
                  const hasRecoveryOnly = dayData && dayData.recovery && dayData.blocks === 0;
                  return (
                    <button
                      key={dk}
                      className={`tt-cal-day${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}${isFuture ? " is-future" : ""}`}
                      onClick={() => selectCalDate(d)}
                      disabled={isFuture}
                    >
                      {d.getDate()}
                      {(hasBlocks || hasRecoveryOnly) && (
                        <span className={`tt-cal-mark${hasRecoveryOnly ? " is-recovery" : ""}`} />
                      )}
                    </button>
                  );
                })}
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px dashed var(--line)", display: "flex", justifyContent: "center" }}>
                {calLoading ? (
                  <span className="tt-muted">불러오는 중...</span>
                ) : (
                  <button
                    className="tt-cal-go-today"
                    onClick={() => { selectCalDate(new Date()); setCalYear(new Date().getFullYear()); setCalMonth(new Date().getMonth()); }}
                  >
                    오늘로 이동
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}