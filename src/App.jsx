import { useState, useEffect, useRef } from "react";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, setDoc, getDocs, writeBatch
} from "firebase/firestore";
import { db } from "./firebase";

// ── constants ──────────────────────────────────────────────────────────────
const C = {
  bg:       "#09090e",
  panel:    "#111118",
  border:   "#1e1e2e",
  accent:   "#f5c400",
  accentD:  "#b38f00",
  red:      "#e63946",
  green:    "#2ecc71",
  muted:    "#6b6b85",
  text:     "#ddddf0",
};

const css = String.raw;
const globalStyle = css`
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; color: ${C.text}; font-family: 'Rajdhani', sans-serif; -webkit-font-smoothing: antialiased; }
  ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: ${C.panel}; } ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
  select, input, option { font-family: inherit; }
  @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
  @keyframes slideUp { from { opacity:0; transform:translateY(40px); } to { opacity:1; transform:translateY(0); } }
`;

// ── helpers ────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return { vehicles: [], garages: {} };
  const headers = lines[0].split(",").map(h => h.trim());
  const garages = {};
  const vehicles = lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    const g = obj["車庫"];
    const cap = parseInt(obj["容量"]) || 10;
    if (g && !garages[g]) garages[g] = cap;
    return { 車庫: obj["車庫"] || "", 廠牌: obj["廠牌"] || "", 車名: obj["車名"] || "", 備註: obj["備註"] || "" };
  }).filter(v => v.車名);
  return { vehicles, garages };
}

// ── sub-components ─────────────────────────────────────────────────────────
function Toast({ toast }) {
  if (!toast) return null;
  const bg = toast.type === "err" ? C.red : toast.type === "warn" ? C.accentD : C.green;
  return (
    <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", background:bg, color:"#000", padding:"10px 22px", fontWeight:800, fontSize:13, letterSpacing:2, borderRadius:4, zIndex:300, textTransform:"uppercase", boxShadow:"0 6px 24px #0009", animation:"fadeIn .2s ease", whiteSpace:"nowrap" }}>
      {toast.msg}
    </div>
  );
}

function CapBar({ used, cap }) {
  const pct = cap > 0 ? Math.min(used / cap, 1) : 0;
  const color = pct >= 1 ? C.red : pct > 0.7 ? C.accentD : C.green;
  return (
    <div style={{ height:3, background:"#1a1a28", borderRadius:2, overflow:"hidden", marginBottom:14 }}>
      <div style={{ height:"100%", width:`${pct*100}%`, background:color, borderRadius:2, transition:"width .4s" }} />
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"#000b", zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:C.panel, borderTop:`3px solid ${C.accent}`, borderRadius:"12px 12px 0 0", width:"100%", maxWidth:520, padding:"24px 20px 36px", animation:"slideUp .25s ease" }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:15, fontWeight:900, letterSpacing:3, color:C.accent, textTransform:"uppercase" }}>{title}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:C.muted, fontSize:20, cursor:"pointer", lineHeight:1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inp = { background:"#16161f", border:`1px solid ${C.border}`, color:C.text, padding:"10px 12px", borderRadius:4, fontSize:14, outline:"none", width:"100%", fontFamily:"inherit" };
const lbl = { fontSize:10, color:C.muted, letterSpacing:2, display:"block", marginBottom:5, textTransform:"uppercase" };
const btnP = { background:C.accent, color:"#000", border:"none", padding:"11px 20px", fontWeight:900, fontSize:13, letterSpacing:2, cursor:"pointer", borderRadius:4, textTransform:"uppercase", flex:1 };
const btnG = { background:"transparent", color:C.muted, border:`1px solid ${C.border}`, padding:"11px 16px", fontWeight:700, fontSize:12, letterSpacing:1, cursor:"pointer", borderRadius:4, textTransform:"uppercase" };

// ── main app ───────────────────────────────────────────────────────────────
export default function App() {
  const [vehicles, setVehicles]   = useState([]);
  const [garages, setGarages]     = useState({});   // { name: capacity }
  const [loading, setLoading]     = useState(true);
  const [modal, setModal]         = useState(null);  // 'add'|'move'|'garage'|'edit'
  const [selected, setSelected]   = useState(null);
  const [search, setSearch]       = useState("");
  const [filterG, setFilterG]     = useState("全部");
  const [toast, setToast]         = useState(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [form, setForm]           = useState({ 車庫:"", 廠牌:"", 車名:"", 備註:"" });
  const [newG, setNewG]           = useState({ name:"", cap:10 });
  const fileRef = useRef();
  const toastTimer = useRef();

  // ── Firestore listeners ──────────────────────────────────────────────────
  useEffect(() => {
    const unsubV = onSnapshot(collection(db, "vehicles"), snap => {
      setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    const unsubG = onSnapshot(collection(db, "garages"), snap => {
      const g = {};
      snap.docs.forEach(d => { g[d.id] = d.data().capacity; });
      setGarages(g);
    });
    return () => { unsubV(); unsubG(); };
  }, []);

  const showToast = (msg, type = "ok") => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  // ── Firestore writes ─────────────────────────────────────────────────────
  const addVehicle = async () => {
    if (!form.車庫 || !form.車名.trim()) { showToast("請填寫車庫與車名", "err"); return; }
    const used = vehicles.filter(v => v.車庫 === form.車庫).length;
    if (used >= (garages[form.車庫] || 10)) { showToast("車庫已滿！", "err"); return; }
    await addDoc(collection(db, "vehicles"), { ...form, createdAt: Date.now() });
    setModal(null); setForm({ 車庫:"", 廠牌:"", 車名:"", 備註:"" });
    showToast("車輛已新增");
  };

  const saveEdit = async () => {
    if (!selected || !form.車名.trim()) { showToast("車名不能為空", "err"); return; }
    await updateDoc(doc(db, "vehicles", selected.id), { 廠牌:form.廠牌, 車名:form.車名, 備註:form.備註 });
    setModal(null); setSelected(null);
    showToast("已儲存");
  };

  const moveVehicle = async () => {
    if (!moveTarget) { showToast("請選擇目標車庫", "err"); return; }
    const used = vehicles.filter(v => v.車庫 === moveTarget).length;
    if (used >= (garages[moveTarget] || 10)) { showToast("目標車庫已滿！", "err"); return; }
    await updateDoc(doc(db, "vehicles", selected.id), { 車庫: moveTarget });
    setModal(null); setSelected(null); setMoveTarget("");
    showToast(`已移至 ${moveTarget}`);
  };

  const deleteVehicle = async (id) => {
    if (!window.confirm("確定要刪除這輛車？")) return;
    await deleteDoc(doc(db, "vehicles", id));
    if (selected?.id === id) setSelected(null);
    showToast("已刪除", "warn");
  };

  const addGarage = async () => {
    const name = newG.name.trim();
    if (!name) { showToast("請輸入車庫名稱", "err"); return; }
    if (garages[name] !== undefined) { showToast("車庫已存在", "err"); return; }
    await setDoc(doc(db, "garages", name), { capacity: newG.cap });
    setModal(null); setNewG({ name:"", cap:10 });
    showToast(`${name} 已新增`);
  };

  const handleCSV = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const text = await file.text();
    const { vehicles: vs, garages: gs } = parseCSV(text);
    if (!vs.length) { showToast("CSV 格式錯誤", "err"); return; }
    const batch = writeBatch(db);
    // add garages
    Object.entries(gs).forEach(([name, cap]) => {
      if (garages[name] === undefined) batch.set(doc(db, "garages", name), { capacity: cap });
    });
    // add vehicles
    vs.forEach(v => { batch.set(doc(collection(db, "vehicles")), { ...v, createdAt: Date.now() }); });
    await batch.commit();
    showToast(`匯入 ${vs.length} 輛車輛`);
    e.target.value = "";
  };

  const exportCSV = () => {
    const rows = vehicles.map(v => [v.車庫, v.廠牌, v.車名, v.備註].join(","));
    const csv = ["車庫,廠牌,車名,備註", ...rows].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type:"text/csv;charset=utf-8" }));
    a.download = "gta_garage.csv"; a.click();
    showToast("已匯出");
  };

  // ── derived data ──────────────────────────────────────────────────────────
  const garageNames = Object.keys(garages).sort();
  const filtered = vehicles.filter(v => {
    const q = search.toLowerCase();
    const matchS = !q || [v.車名, v.廠牌, v.備註].some(f => f?.toLowerCase().includes(q));
    const matchG = filterG === "全部" || v.車庫 === filterG;
    return matchS && matchG;
  });
  const byGarage = name => filtered.filter(v => v.車庫 === name);
  const displayGarages = filterG === "全部" ? garageNames : garageNames.filter(g => g === filterG);

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{globalStyle}</style>

      {/* HEADER */}
      <div style={{ background:"#0d0d14", borderBottom:`2px solid ${C.accent}`, padding:"12px 16px", position:"sticky", top:0, zIndex:100, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
        <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:18, fontWeight:900, letterSpacing:3, color:C.accent }}>
          GTA <span style={{ color:C.text }}>車庫</span>
          <span style={{ background:C.accent, color:"#000", fontSize:9, fontWeight:900, padding:"2px 6px", borderRadius:2, marginLeft:8, letterSpacing:2, verticalAlign:"middle" }}>SYNC</span>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          <button style={{ ...btnG, padding:"7px 10px", fontSize:11 }} onClick={() => fileRef.current.click()}>匯入</button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }} onChange={handleCSV} />
          <button style={{ ...btnG, padding:"7px 10px", fontSize:11 }} onClick={exportCSV}>匯出</button>
          <button style={{ ...btnP, flex:"none", padding:"7px 12px", fontSize:12 }} onClick={() => { setForm({ 車庫:garageNames[0]||"", 廠牌:"", 車名:"", 備註:"" }); setModal("add"); }}>＋ 新增</button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div style={{ padding:"10px 16px", display:"flex", gap:8, borderBottom:`1px solid ${C.border}`, background:C.panel }}>
        <input style={{ ...inp, flex:1 }} placeholder="搜尋車名、廠牌…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ ...inp, width:"auto", minWidth:110 }} value={filterG} onChange={e => setFilterG(e.target.value)}>
          <option>全部</option>
          {garageNames.map(g => <option key={g}>{g}</option>)}
        </select>
        <button style={{ ...btnG, padding:"8px 10px", fontSize:11, whiteSpace:"nowrap" }} onClick={() => setModal("garage")}>＋ 車庫</button>
      </div>

      {/* STATS ROW */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${C.border}`, overflowX:"auto" }}>
        {[{ label:"車輛", val:vehicles.length }, { label:"車庫", val:garageNames.length }, { label:"顯示", val:filtered.length }].map(s => (
          <div key={s.label} style={{ flex:1, padding:"10px 0", textAlign:"center", borderRight:`1px solid ${C.border}` }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:20, fontWeight:900, color:C.accent }}>{s.val}</div>
            <div style={{ fontSize:10, color:C.muted, letterSpacing:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* CONTENT */}
      <div style={{ padding:"16px", paddingBottom:80 }}>
        {loading && <div style={{ textAlign:"center", color:C.muted, padding:40, letterSpacing:2 }}>載入中…</div>}

        {!loading && displayGarages.length === 0 && (
          <div style={{ textAlign:"center", color:C.muted, padding:40 }}>
            <div style={{ fontSize:32, marginBottom:12 }}>🏚️</div>
            <div style={{ letterSpacing:2 }}>尚無車庫，點右上角「＋ 車庫」新增</div>
          </div>
        )}

        {displayGarages.map(garage => {
          const cars = byGarage(garage);
          const cap = garages[garage] || 10;
          const used = vehicles.filter(v => v.車庫 === garage).length;
          return (
            <div key={garage} style={{ marginBottom:28, animation:"fadeIn .3s ease" }}>
              {/* garage header */}
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6 }}>
                <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:13, fontWeight:900, letterSpacing:3, color:C.accent, textTransform:"uppercase" }}>{garage}</div>
                <span style={{ fontSize:11, color: used >= cap ? C.red : C.muted, fontWeight:700, letterSpacing:1 }}>{used}/{cap} 格</span>
              </div>
              <CapBar used={used} cap={cap} />

              {cars.length === 0 ? (
                <div style={{ color:C.muted, fontSize:12, padding:"8px 0", letterSpacing:1 }}>— 無符合車輛 —</div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                  {cars.map((v, i) => (
                    <div key={v.id} style={{ background:C.panel, border:`1px solid ${C.border}`, borderRadius:6, padding:"10px 12px", display:"flex", alignItems:"center", gap:10, animation:"fadeIn .2s ease" }}>
                      <div style={{ color:C.muted, fontSize:11, width:20, textAlign:"center", flexShrink:0 }}>{i+1}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:14, color:C.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v.車名}</div>
                        <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>
                          {v.廠牌 && <span style={{ background:"#1a1a28", border:`1px solid ${C.border}`, padding:"1px 6px", borderRadius:2, marginRight:6, letterSpacing:1 }}>{v.廠牌}</span>}
                          {v.備註 && <span>{v.備註}</span>}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                        <button style={{ ...btnG, padding:"5px 9px", fontSize:11 }} onClick={() => { setSelected(v); setForm({ 廠牌:v.廠牌, 車名:v.車名, 備註:v.備註 }); setModal("edit"); }}>編輯</button>
                        <button style={{ ...btnG, padding:"5px 9px", fontSize:11 }} onClick={() => { setSelected(v); setMoveTarget(""); setModal("move"); }}>移動</button>
                        <button style={{ ...btnG, padding:"5px 9px", fontSize:11, color:C.red, borderColor:`${C.red}44` }} onClick={() => deleteVehicle(v.id)}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── MODALS ── */}

      {/* Add Vehicle */}
      {modal === "add" && (
        <Modal title="新增車輛" onClose={() => setModal(null)}>
          {[["車庫", true], ["廠牌", false], ["車名", false], ["備註", false]].map(([field, isSelect]) => (
            <div key={field} style={{ marginBottom:14 }}>
              <label style={lbl}>{field}</label>
              {isSelect ? (
                <select style={inp} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}>
                  <option value="">— 選擇車庫 —</option>
                  {garageNames.map(g => { const used = vehicles.filter(v => v.車庫===g).length; return <option key={g} value={g}>{g} ({used}/{garages[g]})</option>; })}
                </select>
              ) : (
                <input style={inp} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} placeholder={field === "車名" ? "必填" : "選填"} />
              )}
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <button style={btnP} onClick={addVehicle}>確認新增</button>
            <button style={btnG} onClick={() => setModal(null)}>取消</button>
          </div>
        </Modal>
      )}

      {/* Edit Vehicle */}
      {modal === "edit" && selected && (
        <Modal title="編輯車輛" onClose={() => setModal(null)}>
          {["廠牌","車名","備註"].map(field => (
            <div key={field} style={{ marginBottom:14 }}>
              <label style={lbl}>{field}</label>
              <input style={inp} value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))} />
            </div>
          ))}
          <div style={{ display:"flex", gap:8, marginTop:8 }}>
            <button style={btnP} onClick={saveEdit}>儲存</button>
            <button style={btnG} onClick={() => setModal(null)}>取消</button>
          </div>
        </Modal>
      )}

      {/* Move Vehicle */}
      {modal === "move" && selected && (
        <Modal title="移動車輛" onClose={() => setModal(null)}>
          <div style={{ marginBottom:16, padding:"10px 12px", background:"#16161f", borderRadius:4, fontSize:13 }}>
            <span style={{ color:C.accent, fontWeight:700 }}>{selected.車名}</span>
            <span style={{ color:C.muted }}> · 目前在 {selected.車庫}</span>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={lbl}>目標車庫</label>
            <select style={inp} value={moveTarget} onChange={e => setMoveTarget(e.target.value)}>
              <option value="">— 選擇目標 —</option>
              {garageNames.filter(g => g !== selected.車庫).map(g => {
                const used = vehicles.filter(v => v.車庫===g).length;
                const full = used >= (garages[g]||10);
                return <option key={g} value={g} disabled={full}>{g} ({used}/{garages[g]}){full?" ✗ 已滿":""}</option>;
              })}
            </select>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button style={btnP} onClick={moveVehicle}>確認移動</button>
            <button style={btnG} onClick={() => setModal(null)}>取消</button>
          </div>
        </Modal>
      )}

      {/* Add Garage */}
      {modal === "garage" && (
        <Modal title="新增車庫" onClose={() => setModal(null)}>
          <div style={{ marginBottom:14 }}>
            <label style={lbl}>車庫名稱</label>
            <input style={inp} value={newG.name} onChange={e => setNewG(g => ({ ...g, name: e.target.value }))} placeholder="例：Vespucci Canals" />
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={lbl}>容量（格數）</label>
            <input type="number" min={1} max={40} style={inp} value={newG.cap} onChange={e => setNewG(g => ({ ...g, cap: Number(e.target.value) }))} />
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button style={btnP} onClick={addGarage}>確認新增</button>
            <button style={btnG} onClick={() => setModal(null)}>取消</button>
          </div>
        </Modal>
      )}

      <Toast toast={toast} />
    </>
  );
}
