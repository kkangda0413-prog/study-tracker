import { useState, useEffect, useRef, useCallback } from "react";
import {
  doc, getDoc, setDoc, onSnapshot, collection,
  updateDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase-config";

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { id: "1", name: "전공수학", color: "#B8D4E8" },
  { id: "2", name: "수교론",   color: "#C5E1C5" },
  { id: "3", name: "교육학",  color: "#F5D5C0" },
  { id: "4", name: "기타",    color: "#D8C5E8" },
];
const HOURS = Array.from({ length: 23 }, (_, i) => (i + 4) % 24);
const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function dateToKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function keyToDate(k) {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function getWeekKey(d) {
  const day = new Date(d); day.setHours(0,0,0,0);
  const monday = new Date(day);
  monday.setDate(day.getDate() - ((day.getDay() + 6) % 7));
  return dateToKey(monday);
}
function getWeekDays(weekKey) {
  const monday = keyToDate(weekKey);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i); return dateToKey(d);
  });
}
function getTodayKey() { return dateToKey(new Date()); }
function timeLabel(h) {
  const ampm = h < 12 ? "오전" : "오후";
  const hh = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${ampm} ${hh}시`;
}
function formatDate(key) {
  return keyToDate(key).toLocaleDateString("ko-KR", { month:"long", day:"numeric", weekday:"short" });
}
function formatMonth(y, m) { return `${y}년 ${m+1}월`; }
function slotKey(h, m) { return `${h}_${m}`; }

// ─── Firestore paths (per user) ───────────────────────────────────────────────
// /users/{uid}/config         → { categories }
// /users/{uid}/weeks/{weekKey} → { goals: [...] }
// /users/{uid}/days/{dateKey}  → { goals: [...], timetable: {}, reflection: "" }

export default function StudyTracker({ user, onLogout, onSwitchVersion }) {
  const uid = user.uid;
  const realToday = getTodayKey();

  // ── UI State ──────────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(realToday);
  const [calYear, setCalYear]   = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [showCal, setShowCal]   = useState(false);
  const [activeTab, setActiveTab] = useState("timetable");
  const [certModal, setCertModal] = useState(false);
  const [editCat, setEditCat]   = useState(false);
  const [eraseMode, setEraseMode] = useState(false);
  const [selectedCat, setSelectedCat] = useState("1");
  const [newCatName, setNewCatName]   = useState("");
  const [newCatColor, setNewCatColor] = useState("#FFD6D6");
  const [newWeekGoal, setNewWeekGoal] = useState("");
  const [newDailyGoal, setNewDailyGoal] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Data State ────────────────────────────────────────────────────────────
  const [categories, setCategories]     = useState(DEFAULT_CATEGORIES);
  const [weeklyGoalsMap, setWeeklyGoalsMap] = useState({});  // { weekKey: Goal[] }
  const [dailyMap, setDailyMap]         = useState({});       // { dateKey: { goals, timetable, reflection } }

  // ── Refs for debouncing timetable writes ──────────────────────────────────
  const isDragging  = useRef(false);
  const dragValue   = useRef(null);
  // pendingTT holds unsaved slot changes accumulated during a drag session
  const pendingTT   = useRef({});
  const debounceRef = useRef(null);

  const selectedWeekKey = getWeekKey(keyToDate(selectedDate));
  const weekDays = getWeekDays(selectedWeekKey);

  // ── Derived data ───────────────────────────────────────────────────────────
  const curDay      = dailyMap[selectedDate] ?? { goals: [], timetable: {}, reflection: "" };
  const curTT       = curDay.timetable ?? {};
  const curDailyGoals = curDay.goals ?? [];
  const curReflection = curDay.reflection ?? "";
  const curWeekGoals  = weeklyGoalsMap[selectedWeekKey] ?? [];

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = categories.map(c => ({
    ...c, mins: Object.values(curTT).filter(v => v === c.id).length * 10,
  }));
  const totalMins = stats.reduce((a, b) => a + b.mins, 0);
  const weekDone = curWeekGoals.filter(g => g.done).length;
  const weekPct  = curWeekGoals.length ? Math.round(weekDone / curWeekGoals.length * 100) : 0;
  const dayDone  = curDailyGoals.filter(g => g.done).length;
  const dayPct   = curDailyGoals.length ? Math.round(dayDone / curDailyGoals.length * 100) : 0;

  // ═══════════════════════════════════════════════════════════════════════════
  // Firestore: real-time listener for config (categories)
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const ref = doc(db, "users", uid, "config", "main");
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.categories) setCategories(data.categories);
      }
    });
    return unsub;
  }, [uid]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Firestore: real-time listener for current week's goals
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const ref = doc(db, "users", uid, "weeks", selectedWeekKey);
    const unsub = onSnapshot(ref, snap => {
      setWeeklyGoalsMap(prev => ({
        ...prev,
        [selectedWeekKey]: snap.exists() ? (snap.data().goals ?? []) : [],
      }));
    });
    return unsub;
  }, [uid, selectedWeekKey]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Firestore: real-time listener for viewed days (selected week)
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const unsubs = weekDays.map(dk => {
      const ref = doc(db, "users", uid, "days", dk);
      return onSnapshot(ref, snap => {
        setDailyMap(prev => ({
          ...prev,
          [dk]: snap.exists()
            ? { goals: snap.data().goals ?? [], timetable: snap.data().timetable ?? {}, reflection: snap.data().reflection ?? "" }
            : { goals: [], timetable: {}, reflection: "" },
        }));
      });
    });
    return () => unsubs.forEach(u => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, selectedWeekKey]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Drag cleanup
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const up = () => { isDragging.current = false; };
    window.addEventListener("mouseup", up);
    window.addEventListener("touchend", up);
    return () => { window.removeEventListener("mouseup", up); window.removeEventListener("touchend", up); };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // Save helpers
  // ═══════════════════════════════════════════════════════════════════════════
  async function saveCategories(cats) {
    await setDoc(doc(db, "users", uid, "config", "main"), { categories: cats, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function saveWeekGoals(weekKey, goals) {
    await setDoc(doc(db, "users", uid, "weeks", weekKey), { goals, updatedAt: serverTimestamp() }, { merge: true });
  }

  async function saveDayField(dateKey, field, value) {
    await setDoc(doc(db, "users", uid, "days", dateKey), { [field]: value, updatedAt: serverTimestamp() }, { merge: true });
  }

  // ─── Timetable: optimistic local update + debounced Firestore write ────────
  function applySlot(h, m6, val) {
    const sk = slotKey(h, m6);
    // 1) Optimistic local update
    setDailyMap(prev => {
      const old = prev[selectedDate] ?? { goals: [], timetable: {}, reflection: "" };
      const newTT = { ...old.timetable };
      if (val == null) delete newTT[sk]; else newTT[sk] = val;
      return { ...prev, [selectedDate]: { ...old, timetable: newTT } };
    });
    // 2) Accumulate pending changes (val may be null, meaning "erase this slot")
    pendingTT.current[sk] = val;
    // 3) Debounce: flush after 600ms of inactivity
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (Object.keys(pendingTT.current).length === 0) return;
      const patch = { ...pendingTT.current };
      pendingTT.current = {};
      try {
        // NOTE: setDoc(..., {merge:true}) deep-merges nested map fields, so
        // keys we deleted locally would silently survive on the server.
        // We must fully REPLACE the timetable field instead of merging it.
        const ref = doc(db, "users", uid, "days", selectedDate);
        const snap = await getDoc(ref);
        const existing = snap.exists() ? (snap.data().timetable ?? {}) : {};
        const merged = { ...existing };
        Object.entries(patch).forEach(([k, v]) => {
          if (v == null) delete merged[k]; else merged[k] = v;
        });
        if (snap.exists()) {
          await updateDoc(ref, { timetable: merged, updatedAt: serverTimestamp() });
        } else {
          await setDoc(ref, { timetable: merged, updatedAt: serverTimestamp() });
        }
      } catch (e) {
        console.error("Timetable save error:", e);
      }
    }, 600);
  }

  function handleSlotDown(h, m6) {
    isDragging.current = true;
    if (eraseMode) { dragValue.current = null; applySlot(h, m6, null); }
    else { dragValue.current = selectedCat; applySlot(h, m6, selectedCat); }
  }
  function handleSlotEnter(h, m6) {
    if (isDragging.current) applySlot(h, m6, dragValue.current);
  }
  function handleSlotRightClick(e, h, m6) { e.preventDefault(); applySlot(h, m6, null); }

  // ─── Weekly Goals ──────────────────────────────────────────────────────────
  async function addWeekGoal() {
    if (!newWeekGoal.trim()) return;
    const next = [...curWeekGoals, { id: Date.now().toString(), text: newWeekGoal.trim(), done: false }];
    setNewWeekGoal(""); setWeeklyGoalsMap(p => ({ ...p, [selectedWeekKey]: next }));
    await saveWeekGoals(selectedWeekKey, next);
  }
  async function toggleWeekGoal(id) {
    const next = curWeekGoals.map(g => g.id === id ? { ...g, done: !g.done } : g);
    setWeeklyGoalsMap(p => ({ ...p, [selectedWeekKey]: next }));
    await saveWeekGoals(selectedWeekKey, next);
  }
  async function deleteWeekGoal(id) {
    const next = curWeekGoals.filter(g => g.id !== id);
    setWeeklyGoalsMap(p => ({ ...p, [selectedWeekKey]: next }));
    await saveWeekGoals(selectedWeekKey, next);
  }

  // ─── Daily Goals ───────────────────────────────────────────────────────────
  async function updateDailyGoals(next) {
    setDailyMap(p => ({ ...p, [selectedDate]: { ...curDay, goals: next } }));
    await saveDayField(selectedDate, "goals", next);
  }
  async function addDailyGoal() {
    if (!newDailyGoal.trim()) return;
    const next = [...curDailyGoals, { id: Date.now().toString(), text: newDailyGoal.trim(), done: false, progress: 0 }];
    setNewDailyGoal(""); await updateDailyGoals(next);
  }
  async function toggleDailyGoal(id) {
    await updateDailyGoals(curDailyGoals.map(g => g.id === id ? { ...g, done: !g.done, progress: g.done ? g.progress : 100 } : g));
  }
  async function setDailyProgress(id, val) {
    await updateDailyGoals(curDailyGoals.map(g => g.id === id ? { ...g, progress: Number(val) } : g));
  }
  async function deleteDailyGoal(id) { await updateDailyGoals(curDailyGoals.filter(g => g.id !== id)); }

  // ─── Reflection ────────────────────────────────────────────────────────────
  const reflDebounce = useRef(null);
  function handleReflectionChange(val) {
    setDailyMap(p => ({ ...p, [selectedDate]: { ...curDay, reflection: val } }));
    clearTimeout(reflDebounce.current);
    reflDebounce.current = setTimeout(() => saveDayField(selectedDate, "reflection", val), 800);
  }

  // ─── Categories ────────────────────────────────────────────────────────────
  async function addCategory() {
    if (!newCatName.trim()) return;
    const next = [...categories, { id: Date.now().toString(), name: newCatName.trim(), color: newCatColor }];
    setNewCatName(""); setCategories(next); await saveCategories(next);
  }
  async function deleteCategory(id) {
    const next = categories.filter(c => c.id !== id);
    setCategories(next);
    if (selectedCat === id) setSelectedCat(next[0]?.id ?? "");
    await saveCategories(next);
  }

  // ─── Calendar ─────────────────────────────────────────────────────────────
  function buildCalendar(y, m) {
    const first = new Date(y, m, 1).getDay();
    const days  = new Date(y, m + 1, 0).getDate();
    const cells = Array.from({ length: first }, () => null);
    for (let d = 1; d <= days; d++) cells.push(new Date(y, m, d));
    return cells;
  }
  function selectDate(d) { setSelectedDate(dateToKey(d)); setShowCal(false); }
  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y-1); setCalMonth(11); } else setCalMonth(m => m-1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y+1); setCalMonth(0); } else setCalMonth(m => m+1);
  }
  const calCells = buildCalendar(calYear, calMonth);
  const shortDate = dk => { const d = keyToDate(dk); return `${d.getMonth()+1}/${d.getDate()}`; };
  const weekLabel = `${shortDate(weekDays[0])} ~ ${shortDate(weekDays[6])}`;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ fontFamily:"'Noto Sans KR',sans-serif", background:"#f5f6fa", minHeight:"100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet" />
      <style>{CSS}</style>

      {/* ── Header ── */}
      <div style={S.header}>
        <div>
          <h1 style={S.headerTitle}>📚 학습 트래커</h1>
          <p style={S.headerSub}>{user.displayName} · {user.email}</p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          <div style={S.statChip}>
            <div style={{ fontSize:10, color:"#6B7CFF" }}>선택일 학습</div>
            <div style={{ fontSize:17, fontWeight:700, color:"#3D4EC6" }}>{Math.floor(totalMins/60)}h {totalMins%60}m</div>
          </div>
          <button style={S.certBtn} onClick={() => setCertModal(true)}>📸 인증하기</button>
          <button style={S.switchBtn} onClick={onSwitchVersion}>🎯 심플 모드</button>
          <button style={S.logoutBtn} onClick={onLogout}>로그아웃</button>
        </div>
      </div>

      {/* ── Date bar ── */}
      <div style={S.datebar}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10, flexWrap:"wrap" }}>
          <button style={S.calTrigger} onClick={() => { setShowCal(c=>!c); setCalYear(keyToDate(selectedDate).getFullYear()); setCalMonth(keyToDate(selectedDate).getMonth()); }}>
            📅 {selectedDate === realToday ? "오늘" : formatDate(selectedDate)} <span style={{ color:"#6B7CFF", fontSize:11 }}>▼</span>
          </button>
          {selectedDate !== realToday && (
            <button style={S.todayBtn} onClick={() => setSelectedDate(realToday)}>오늘로</button>
          )}
          <span style={{ fontSize:12, color:"#999", marginLeft:"auto" }}>주간 {weekLabel}</span>
        </div>
        <div style={{ display:"flex", gap:4 }}>
          {weekDays.map(dk => {
            const d = keyToDate(dk);
            const isSelected = dk === selectedDate;
            const isTd = dk === realToday;
            const hasData = Object.keys((dailyMap[dk]?.timetable) ?? {}).length > 0 || (dailyMap[dk]?.goals ?? []).length > 0;
            return (
              <button key={dk} className={`wday${isSelected?" wday-active":""}${hasData?" wday-dot":""}`}
                onClick={() => setSelectedDate(dk)}
                style={{ color: isSelected?"white": isTd?"#6B7CFF":"#888" }}>
                <span style={{ fontSize:11 }}>{DAY_NAMES[d.getDay()]}</span>
                <span style={{ fontSize:15, fontWeight: isTd||isSelected?700:400 }}>{d.getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Calendar popup ── */}
      {showCal && (
        <>
          <div onClick={() => setShowCal(false)} style={S.calBackdrop} />
          <div style={S.calOverlay}>
            <div style={S.calPopup}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                <button style={S.calNav} onClick={prevMonth}>‹</button>
                <span style={{ fontWeight:600, fontSize:15, color:"#111" }}>{formatMonth(calYear,calMonth)}</span>
                <button style={S.calNav} onClick={nextMonth}>›</button>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,38px)", gap:2, justifyContent:"center", marginBottom:6 }}>
                {["일","월","화","수","목","금","토"].map(d => (
                  <div key={d} style={{ width:38, height:28, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#aaa", fontWeight:500 }}>{d}</div>
                ))}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,38px)", gap:2, justifyContent:"center" }}>
                {calCells.map((d, i) => {
                  if (!d) return <div key={`e${i}`} />;
                  const key = dateToKey(d);
                  const isSel = key === selectedDate;
                  const isTd  = key === realToday;
                  const inWk  = weekDays.includes(key);
                  return (
                    <div key={key} onClick={() => selectDate(d)}
                      style={{ width:38, height:36, display:"flex", alignItems:"center", justifyContent:"center",
                        borderRadius:8, fontSize:13, cursor:"pointer",
                        background: isSel?"#6B7CFF": isTd?"#EEF0FF": inWk?"rgba(107,124,255,0.08)":"transparent",
                        color: isSel?"white": isTd?"#6B7CFF":"#333",
                        fontWeight: isSel||isTd?700:400,
                      }}>
                      {d.getDate()}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop:14, paddingTop:12, borderTop:"0.5px solid #eee", display:"flex", justifyContent:"center" }}>
                <button onClick={() => { selectDate(new Date()); setCalYear(new Date().getFullYear()); setCalMonth(new Date().getMonth()); }}
                  style={{ fontSize:13, padding:"6px 20px", background:"#6B7CFF", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontFamily:"inherit" }}>
                  오늘로 이동
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Tabs ── */}
      <div style={S.tabBar}>
        {[["timetable","⏱ 타임테이블"],["goals","🎯 목표 관리"],["reflection","✍️ 성찰 노트"]].map(([k,l]) => (
          <button key={k} className={`tab${activeTab===k?" tab-active":""}`} onClick={() => setActiveTab(k)}>{l}</button>
        ))}
      </div>

      <div style={{ padding:"18px 18px 48px", maxWidth:900, margin:"0 auto" }}>

        {/* ══ TIMETABLE ══ */}
        {activeTab === "timetable" && <>
          {/* Category chips */}
          <div style={S.card}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
              <span style={S.cardTitle}>카테고리</span>
              <button style={S.editBtn} onClick={() => setEditCat(e=>!e)}>{editCat?"완료":"✏️ 편집"}</button>
            </div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              <button className={`chip${eraseMode?" chip-erase":""}`} onClick={() => setEraseMode(true)}>🧹 지우개</button>
              {categories.map(c => (
                <div key={c.id} style={{ display:"flex", alignItems:"center", gap:4 }}>
                  <button className={`chip${!eraseMode&&selectedCat===c.id?" chip-sel":""}`}
                    style={{ background:c.color, color:"#333" }}
                    onClick={() => { setSelectedCat(c.id); setEraseMode(false); }}>
                    {c.name}
                  </button>
                  {editCat && <button style={S.delBtn} onClick={() => deleteCategory(c.id)}>×</button>}
                </div>
              ))}
            </div>
            {editCat && (
              <div style={S.addRow}>
                <input style={S.input} placeholder="새 카테고리" value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key==="Enter"&&addCategory()} />
                <input type="color" value={newCatColor} onChange={e => setNewCatColor(e.target.value)} style={S.colorPicker} />
                <button style={S.addBtn} onClick={addCategory}>추가</button>
              </div>
            )}
          </div>

          {/* Timetable grid */}
          <div style={{ ...S.card, padding:16, overflowX:"auto" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12, flexWrap:"wrap" }}>
              <span style={S.cardTitle}>타임테이블</span>
              <span style={{ fontSize:12, padding:"2px 8px", borderRadius:20, background:"#EEF0FF", color:"#6B7CFF" }}>{formatDate(selectedDate)}</span>
              <span style={{ fontSize:11, color:"#aaa" }}>드래그로 색칠 · 우클릭/지우개로 삭제</span>
            </div>
            <div style={{ minWidth:380 }}>
              <div style={{ display:"grid", gridTemplateColumns:"54px repeat(6,1fr)", gap:1, marginBottom:2 }}>
                <div />
                {[0,10,20,30,40,50].map(m => (
                  <div key={m} style={{ fontSize:10, color:"#bbb", textAlign:"center" }}>{m}분</div>
                ))}
              </div>
              {HOURS.map(h => (
                <div key={h} style={{ display:"grid", gridTemplateColumns:"54px repeat(6,1fr)", gap:1, marginBottom:1 }}>
                  <div style={{ fontSize:11, color:"#888", display:"flex", alignItems:"center", justifyContent:"flex-end", paddingRight:6 }}>{timeLabel(h)}</div>
                  {[0,1,2,3,4,5].map(m6 => {
                    const cat = categories.find(c => c.id === curTT[slotKey(h,m6)]);
                    return (
                      <div key={m6} className="slot"
                        style={{ height:22, background: cat?cat.color:"#f0f0f3", borderRadius:3, border:"0.5px solid #e8e8ec" }}
                        onMouseDown={() => handleSlotDown(h, m6)}
                        onMouseEnter={() => handleSlotEnter(h, m6)}
                        onContextMenu={e => handleSlotRightClick(e, h, m6)}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div style={S.card}>
            <div style={{ ...S.cardTitle, marginBottom:14 }}>📊 오늘 통계</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:10 }}>
              {stats.filter(s=>s.mins>0).map(s => (
                <div key={s.id} style={{ background:"#f8f8fa", borderRadius:10, padding:"12px 14px", borderLeft:`4px solid ${s.color}` }}>
                  <div style={{ fontSize:12, color:"#888" }}>{s.name}</div>
                  <div style={{ fontSize:18, fontWeight:700, color:"#222" }}>{Math.floor(s.mins/60)>0?`${Math.floor(s.mins/60)}h `:""}{s.mins%60}m</div>
                </div>
              ))}
              {totalMins===0 && <div style={{ color:"#bbb", fontSize:14, gridColumn:"1/-1", textAlign:"center", padding:16 }}>이 날의 학습 기록이 없습니다</div>}
              {totalMins>0 && (
                <div style={{ background:"#EEF0FF", borderRadius:10, padding:"12px 14px", borderLeft:"4px solid #6B7CFF" }}>
                  <div style={{ fontSize:12, color:"#6B7CFF" }}>총 학습</div>
                  <div style={{ fontSize:18, fontWeight:700, color:"#3D4EC6" }}>{Math.floor(totalMins/60)}h {totalMins%60}m</div>
                </div>
              )}
            </div>
          </div>
        </>}

        {/* ══ GOALS ══ */}
        {activeTab === "goals" && <>
          {/* Weekly */}
          <div style={S.card}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
              <span style={S.cardTitle}>📅 주간 목표</span>
              <span style={{ fontSize:12, background:"#f0f0f5", color:"#888", padding:"2px 10px", borderRadius:20 }}>{weekLabel}</span>
              <span style={{ fontSize:13, fontWeight:700, color:"#6B7CFF", marginLeft:"auto" }}>{weekPct}%</span>
            </div>
            <div style={S.progBar}><div style={{ ...S.progFill, width:`${weekPct}%`, background:"#6B7CFF" }} /></div>
            {curWeekGoals.map(g => (
              <div key={g.id} style={S.goalRow}>
                <input type="checkbox" checked={g.done} onChange={() => toggleWeekGoal(g.id)} style={{ accentColor:"#6B7CFF", width:16, height:16, cursor:"pointer" }} />
                <span style={{ flex:1, fontSize:14, textDecoration:g.done?"line-through":"none", color:g.done?"#bbb":"#222" }}>{g.text}</span>
                <button style={S.delBtn} onClick={() => deleteWeekGoal(g.id)}>×</button>
              </div>
            ))}
            {curWeekGoals.length===0 && <div style={S.empty}>이 주의 목표를 추가해보세요</div>}
            <div style={S.addRow}>
              <input style={S.input} placeholder="주간 목표 입력..." value={newWeekGoal} onChange={e => setNewWeekGoal(e.target.value)} onKeyDown={e => e.key==="Enter"&&addWeekGoal()} />
              <button style={S.addBtn} onClick={addWeekGoal}>추가</button>
            </div>
          </div>

          {/* Daily */}
          <div style={S.card}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
              <span style={S.cardTitle}>✅ 일별 목표</span>
              <span style={{ fontSize:12, background:"#f0f0f5", color:"#888", padding:"2px 10px", borderRadius:20 }}>{formatDate(selectedDate)}</span>
              <span style={{ fontSize:13, fontWeight:700, color:"#00B894", marginLeft:"auto" }}>{dayPct}%</span>
            </div>
            <div style={S.progBar}><div style={{ ...S.progFill, width:`${dayPct}%`, background:"#00B894" }} /></div>
            {/* Mini week strip */}
            <div style={{ display:"flex", gap:4, margin:"10px 0 14px", padding:8, background:"#f8f8fa", borderRadius:10 }}>
              {weekDays.map(dk => {
                const d = keyToDate(dk); const isSel = dk===selectedDate; const isTd = dk===realToday;
                const has = (dailyMap[dk]?.goals??[]).length>0;
                return (
                  <button key={dk} className={`wday${isSel?" wday-active":""}${has?" wday-dot":""}`}
                    onClick={() => setSelectedDate(dk)}
                    style={{ color: isSel?"white": isTd?"#6B7CFF":"#888" }}>
                    <span style={{ fontSize:10 }}>{DAY_NAMES[d.getDay()]}</span>
                    <span style={{ fontSize:14, fontWeight:isTd||isSel?700:400 }}>{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
            {curDailyGoals.map(g => (
              <div key={g.id} style={{ padding:"10px 0", borderBottom:"0.5px solid #f0f0f0" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                  <input type="checkbox" checked={g.done} onChange={() => toggleDailyGoal(g.id)} style={{ accentColor:"#00B894", width:16, height:16, cursor:"pointer" }} />
                  <span style={{ flex:1, fontSize:14, textDecoration:g.done?"line-through":"none", color:g.done?"#bbb":"#222" }}>{g.text}</span>
                  <span style={{ fontSize:12, fontWeight:700, color:"#00B894", minWidth:32, textAlign:"right" }}>{g.progress}%</span>
                  <button style={S.delBtn} onClick={() => deleteDailyGoal(g.id)}>×</button>
                </div>
                <div style={{ paddingLeft:26 }}>
                  <input type="range" min="0" max="100" step="5" value={g.progress} onChange={e => setDailyProgress(g.id,e.target.value)} style={{ width:"100%", accentColor:"#00B894" }} />
                  <div style={S.progBar}><div style={{ ...S.progFill, width:`${g.progress}%`, background:"#00B894" }} /></div>
                </div>
              </div>
            ))}
            {curDailyGoals.length===0 && <div style={S.empty}>이 날의 목표를 추가해보세요</div>}
            <div style={S.addRow}>
              <input style={S.input} placeholder="목표 입력..." value={newDailyGoal} onChange={e => setNewDailyGoal(e.target.value)} onKeyDown={e => e.key==="Enter"&&addDailyGoal()} />
              <button style={S.addBtn} onClick={addDailyGoal}>추가</button>
            </div>
          </div>
        </>}

        {/* ══ REFLECTION ══ */}
        {activeTab === "reflection" && (
          <div style={S.card}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14, flexWrap:"wrap" }}>
              <span style={S.cardTitle}>✍️ 성찰 & 보완점</span>
              <span style={{ fontSize:12, background:"#f0f0f5", color:"#888", padding:"2px 10px", borderRadius:20 }}>{formatDate(selectedDate)}</span>
            </div>
            {/* Mini week strip */}
            <div style={{ display:"flex", gap:4, marginBottom:14, padding:8, background:"#f8f8fa", borderRadius:10 }}>
              {weekDays.map(dk => {
                const d = keyToDate(dk); const isSel = dk===selectedDate; const isTd = dk===realToday;
                const has = !!(dailyMap[dk]?.reflection?.trim());
                return (
                  <button key={dk} className={`wday${isSel?" wday-active":""}${has?" wday-dot":""}`}
                    onClick={() => setSelectedDate(dk)}
                    style={{ color: isSel?"white": isTd?"#6B7CFF":"#888" }}>
                    <span style={{ fontSize:10 }}>{DAY_NAMES[d.getDay()]}</span>
                    <span style={{ fontSize:14, fontWeight:isTd||isSel?700:400 }}>{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
            <textarea
              value={curReflection}
              onChange={e => handleReflectionChange(e.target.value)}
              placeholder={"오늘 공부하면서 느낀 점, 잘된 점, 부족했던 점을 기록해보세요.\n\n예)\n- 집중 잘 됐던 과목:\n- 어려웠던 부분:\n- 내일 더 신경 쓸 것:"}
              style={{ width:"100%", minHeight:260, padding:14, border:"0.5px solid #e8e8ec", borderRadius:10, fontSize:14, fontFamily:"inherit", lineHeight:1.8, color:"#222", background:"#f8f8fa", resize:"vertical" }}
            />
            <div style={{ marginTop:10, display:"flex", gap:8, flexWrap:"wrap" }}>
              {["집중도 ★★★★★","내용 이해 잘 됨","계획 대비 달성 O","개념 복습 필요","내일 더 집중!"].map(tag => (
                <button key={tag} onClick={() => handleReflectionChange((curReflection?curReflection+"\n":"")+tag)}
                  style={{ fontSize:12, padding:"4px 10px", border:"0.5px solid #e0e0e0", borderRadius:20, cursor:"pointer", background:"#f8f8fa", color:"#666", fontFamily:"inherit" }}>
                  + {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ══ Cert Modal ══ */}
      {certModal && (
        <div style={S.modalOverlay} onClick={e => { if(e.target===e.currentTarget) setCertModal(false); }}>
          <div style={S.certBox}>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:22, fontWeight:700, color:"#3D4EC6" }}>📚 학습 인증</div>
              <div style={{ fontSize:13, color:"#666", marginTop:4 }}>{formatDate(selectedDate)}</div>
            </div>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, color:"#aaa", fontWeight:600, letterSpacing:"0.5px", marginBottom:6 }}>타임테이블</div>
              {HOURS.map(h => {
                const hasAny = [0,1,2,3,4,5].some(m6 => curTT[slotKey(h,m6)]);
                if (!hasAny) return null;
                return (
                  <div key={h} style={{ display:"grid", gridTemplateColumns:"38px repeat(6,1fr)", gap:1, marginBottom:1 }}>
                    <div style={{ fontSize:9, color:"#bbb", display:"flex", alignItems:"center", justifyContent:"flex-end", paddingRight:4 }}>{timeLabel(h)}</div>
                    {[0,1,2,3,4,5].map(m6 => {
                      const cat = categories.find(c => c.id === curTT[slotKey(h,m6)]);
                      return <div key={m6} style={{ height:13, background:cat?cat.color:"#f0f0f0", borderRadius:2 }} />;
                    })}
                  </div>
                );
              })}
              {totalMins===0 && <div style={{ color:"#ccc", fontSize:13, textAlign:"center", padding:8 }}>기록 없음</div>}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
              <div style={{ background:"#EEF0FF", borderRadius:10, padding:12, textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#6B7CFF" }}>총 학습</div>
                <div style={{ fontSize:20, fontWeight:700, color:"#3D4EC6" }}>{Math.floor(totalMins/60)}h {totalMins%60}m</div>
              </div>
              <div style={{ background:"#E8F8F1", borderRadius:10, padding:12, textAlign:"center" }}>
                <div style={{ fontSize:11, color:"#00B894" }}>일별 달성률</div>
                <div style={{ fontSize:20, fontWeight:700, color:"#007A5E" }}>{dayPct}%</div>
              </div>
            </div>
            <div style={{ marginBottom:16 }}>
              {stats.filter(s=>s.mins>0).map(s => (
                <div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                  <div style={{ width:10, height:10, borderRadius:"50%", background:s.color }} />
                  <div style={{ fontSize:13, color:"#333", flex:1 }}>{s.name}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:"#333" }}>{Math.floor(s.mins/60)>0?`${Math.floor(s.mins/60)}h `:""}{s.mins%60}m</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={() => setCertModal(false)} style={{ flex:1, padding:12, border:"0.5px solid #ddd", borderRadius:10, background:"#f8f8f8", cursor:"pointer", fontSize:14, fontFamily:"inherit" }}>닫기</button>
              <button onClick={() => alert("📸 이 화면을 캡처해서 스터디원에게 공유하세요!")}
                style={{ flex:2, padding:12, background:"#6B7CFF", color:"white", border:"none", borderRadius:10, cursor:"pointer", fontSize:14, fontFamily:"inherit", fontWeight:600 }}>
                📸 캡처 안내
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const S = {
  header: { background:"#fff", borderBottom:"0.5px solid #eee", padding:"14px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10, position:"sticky", top:0, zIndex:100 },
  headerTitle: { fontSize:19, fontWeight:700, color:"#1a1a2e", letterSpacing:"-0.3px", margin:0 },
  headerSub: { fontSize:12, color:"#999", marginTop:2, margin:0 },
  statChip: { background:"#f0f0f5", padding:"7px 14px", borderRadius:10 },
  certBtn: { padding:"9px 16px", background:"#6B7CFF", color:"white", border:"none", borderRadius:10, cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:500 },
  switchBtn: { padding:"9px 14px", background:"#f0f0f5", color:"#6B7CFF", border:"0.5px solid #d4d6f5", borderRadius:10, cursor:"pointer", fontSize:13, fontFamily:"inherit", fontWeight:500 },
  logoutBtn: { padding:"9px 14px", background:"#f5f5f5", color:"#888", border:"0.5px solid #e0e0e0", borderRadius:10, cursor:"pointer", fontSize:13, fontFamily:"inherit" },
  datebar: { background:"#fff", borderBottom:"0.5px solid #eee", padding:"12px 20px" },
  calTrigger: { display:"flex", alignItems:"center", gap:8, padding:"7px 14px", background:"#f0f0f5", border:"0.5px solid #e0e0e0", borderRadius:10, cursor:"pointer", fontFamily:"inherit", fontSize:14, fontWeight:500, color:"#333" },
  todayBtn: { fontSize:12, color:"#6B7CFF", background:"#EEF0FF", border:"none", borderRadius:8, padding:"5px 12px", cursor:"pointer", fontFamily:"inherit" },
  calBackdrop: { position:"fixed", inset:0, zIndex:149, background:"rgba(0,0,0,0.3)" },
  calOverlay: { position:"fixed", inset:0, zIndex:150, display:"flex", alignItems:"flex-start", justifyContent:"center", paddingTop:70, pointerEvents:"none" },
  calPopup: { background:"#ffffff", borderRadius:16, border:"1px solid #e8e8ec", padding:20, width:320, boxShadow:"0 8px 40px rgba(0,0,0,0.18)", pointerEvents:"all" },
  calNav: { background:"none", border:"none", cursor:"pointer", fontSize:20, color:"#555", padding:"4px 8px" },
  tabBar: { background:"#fff", borderBottom:"0.5px solid #eee", display:"flex", padding:"0 20px" },
  card: { background:"#fff", borderRadius:14, border:"0.5px solid #eee", padding:20, marginBottom:16 },
  cardTitle: { fontWeight:600, fontSize:14, color:"#1a1a2e" },
  editBtn: { fontSize:12, color:"#6B7CFF", background:"none", border:"0.5px solid #6B7CFF", borderRadius:6, padding:"3px 10px", cursor:"pointer", fontFamily:"inherit" },
  delBtn: { background:"none", border:"none", cursor:"pointer", color:"#ccc", fontSize:18, padding:"0 4px", lineHeight:1, borderRadius:4 },
  addRow: { display:"flex", gap:8, marginTop:12 },
  input: { flex:1, padding:"7px 12px", border:"0.5px solid #e0e0e0", borderRadius:8, fontFamily:"inherit", fontSize:14, background:"#f8f8fa", color:"#333" },
  colorPicker: { width:40, height:36, border:"0.5px solid #e0e0e0", borderRadius:8, cursor:"pointer", padding:2 },
  addBtn: { padding:"7px 16px", background:"#6B7CFF", color:"white", border:"none", borderRadius:8, cursor:"pointer", fontSize:14, fontFamily:"inherit", fontWeight:500, whiteSpace:"nowrap" },
  progBar: { height:7, background:"#f0f0f0", borderRadius:4, overflow:"hidden", marginBottom:16 },
  progFill: { height:"100%", borderRadius:4, transition:"width 0.4s" },
  goalRow: { display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"0.5px solid #f5f5f5" },
  empty: { color:"#ccc", fontSize:13, textAlign:"center", padding:"10px 0" },
  modalOverlay: { position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 },
  certBox: { background:"#fff", borderRadius:20, padding:32, maxWidth:480, width:"94%", color:"#1a1a1a", maxHeight:"90vh", overflowY:"auto" },
};

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .slot { cursor: pointer; user-select: none; }
  .slot:hover { opacity: 0.75; }
  .tab { background:none; border:none; cursor:pointer; padding:8px 18px; font-size:14px; font-family:inherit; color:#999; border-bottom:2px solid transparent; transition:all 0.15s; }
  .tab-active { color:#1a1a2e; border-bottom:2px solid #6B7CFF; font-weight:500; }
  .chip { display:inline-flex; align-items:center; gap:6px; padding:6px 14px; border-radius:20px; font-size:13px; cursor:pointer; border:2px solid transparent; font-family:inherit; font-weight:500; background:#f0f0f5; color:#555; transition:all 0.15s; }
  .chip-sel { border-color:#6B7CFF; box-shadow:0 0 0 2px rgba(107,124,255,0.2); }
  .chip-erase { border-color:#FF6B6B; box-shadow:0 0 0 2px rgba(255,107,107,0.2); }
  .wday { flex:1; padding:6px 0; border:none; background:none; cursor:pointer; font-size:12px; font-family:inherit; border-radius:8px; display:flex; flex-direction:column; align-items:center; gap:2px; transition:background 0.12s; }
  .wday:hover { background:#f0f0f5; }
  .wday-active { background:#6B7CFF; color:white !important; }
  .wday-dot::after { content:''; width:4px; height:4px; border-radius:50%; background:#00B894; display:block; }
  .wday-active.wday-dot::after { background:rgba(255,255,255,0.7); }
`;
