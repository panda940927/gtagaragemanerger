import { useState, useEffect, useRef } from “react”;
import {
collection, doc, addDoc, updateDoc, deleteDoc,
onSnapshot, setDoc, writeBatch
} from “firebase/firestore”;
import { db } from “./firebase”;

const C = {
bg: “#09090e”, panel: “#111118”, border: “#1e1e2e”,
accent: “#f5c400”, accentD: “#b38f00”,
red: “#e63946”, green: “#2ecc71”, muted: “#6b6b85”, text: “#ddddf0”,
};

const globalStyle = `*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; } body { background: #09090e; color: #ddddf0; font-family: 'Rajdhani', sans-serif; -webkit-font-smoothing: antialiased; } ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #111118; } ::-webkit-scrollbar-thumb { background: #1e1e2e; border-radius: 2px; } select, input, option { font-family: inherit; } @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } } @keyframes slideUp { from { opacity:0; transform:translateY(40px); } to { opacity:1; transform:translateY(0); } }`;

function parseCSV(text) {
const lines = text.trim().split(”\n”).filter(Boolean);
if (lines.length < 2) return { vehicles: [], garages: {} };
const headers = lines[0].split(”,”).map(function(h) { return h.trim(); });
const garages = {};
const vehicles = lines.slice(1).map(function(line) {
const vals = line.split(”,”).map(function(v) { return v.trim(); });
const obj = {};
headers.forEach(function(h, i) { obj[h] = vals[i] || “”; });
const g = obj[“garage”] || obj[”\u8eca\u5eab”];
const cap = parseInt(obj[”\u5bb9\u91cf”]) || 10;
if (g && !garages[g]) garages[g] = cap;
return {
“\u8eca\u5eab”: obj[”\u8eca\u5eab”] || “”,
“\u5ee0\u724c”: obj[”\u5ee0\u724c”] || “”,
“\u8eca\u540d”: obj[”\u8eca\u540d”] || “”,
“\u5099\u8a3b”: obj[”\u5099\u8a3b”] || “”
};
}).filter(function(v) { return v[”\u8eca\u540d”]; });
return { vehicles: vehicles, garages: garages };
}

function Toast(props) {
if (!props.toast) return null;
const bg = props.toast.type === “err” ? C.red : props.toast.type === “warn” ? C.accentD : C.green;
return (
<div style={{ position:“fixed”, bottom:24, left:“50%”, transform:“translateX(-50%)”, background:bg, color:”#000”, padding:“10px 22px”, fontWeight:800, fontSize:13, letterSpacing:2, borderRadius:4, zIndex:300, textTransform:“uppercase”, boxShadow:“0 6px 24px #0009”, animation:“fadeIn .2s ease”, whiteSpace:“nowrap” }}>
{props.toast.msg}
</div>
);
}

function CapBar(props) {
const pct = props.cap > 0 ? Math.min(props.used / props.cap, 1) : 0;
const color = pct >= 1 ? C.red : pct > 0.7 ? C.accentD : C.green;
return (
<div style={{ height:3, background:”#1a1a28”, borderRadius:2, overflow:“hidden”, marginBottom:14 }}>
<div style={{ height:“100%”, width:(pct*100)+”%”, background:color, borderRadius:2, transition:“width .4s” }} />
</div>
);
}

function Modal(props) {
return (
<div style={{ position:“fixed”, inset:0, background:”#000b”, zIndex:200, display:“flex”, alignItems:“flex-end”, justifyContent:“center” }} onClick={props.onClose}>
<div style={{ background:C.panel, borderTop:“3px solid “+C.accent, borderRadius:“12px 12px 0 0”, width:“100%”, maxWidth:520, padding:“24px 20px 36px”, animation:“slideUp .25s ease” }} onClick={function(e) { e.stopPropagation(); }}>
<div style={{ display:“flex”, justifyContent:“space-between”, alignItems:“center”, marginBottom:20 }}>
<div style={{ fontFamily:”‘Orbitron’,sans-serif”, fontSize:15, fontWeight:900, letterSpacing:3, color:C.accent, textTransform:“uppercase” }}>{props.title}</div>
<button onClick={props.onClose} style={{ background:“none”, border:“none”, color:C.muted, fontSize:20, cursor:“pointer”, lineHeight:1 }}>X</button>
</div>
{props.children}
</div>
</div>
);
}

const inp = { background:”#16161f”, border:“1px solid #1e1e2e”, color:”#ddddf0”, padding:“10px 12px”, borderRadius:4, fontSize:14, outline:“none”, width:“100%”, fontFamily:“inherit” };
const lbl = { fontSize:10, color:”#6b6b85”, letterSpacing:2, display:“block”, marginBottom:5, textTransform:“uppercase” };
const btnP = { background:”#f5c400”, color:”#000”, border:“none”, padding:“11px 20px”, fontWeight:900, fontSize:13, letterSpacing:2, cursor:“pointer”, borderRadius:4, textTransform:“uppercase”, flex:1 };
const btnG = { background:“transparent”, color:”#6b6b85”, border:“1px solid #1e1e2e”, padding:“11px 16px”, fontWeight:700, fontSize:12, letterSpacing:1, cursor:“pointer”, borderRadius:4, textTransform:“uppercase” };

export default function App() {
const [vehicles, setVehicles] = useState([]);
const [garages, setGarages] = useState({});
const [loading, setLoading] = useState(true);
const [modal, setModal] = useState(null);
const [selected, setSelected] = useState(null);
const [search, setSearch] = useState(””);
const [filterG, setFilterG] = useState(”\u5168\u90e8”);
const [toast, setToast] = useState(null);
const [moveTarget, setMoveTarget] = useState(””);
const [form, setForm] = useState({ “\u8eca\u5eab”:””, “\u5ee0\u724c”:””, “\u8eca\u540d”:””, “\u5099\u8a3b”:”” });
const [newG, setNewG] = useState({ name:””, cap:10 });
const fileRef = useRef();
const toastTimer = useRef();

useEffect(function() {
const unsubV = onSnapshot(collection(db, “vehicles”), function(snap) {
setVehicles(snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); }));
setLoading(false);
});
const unsubG = onSnapshot(collection(db, “garages”), function(snap) {
const g = {};
snap.docs.forEach(function(d) { g[d.id] = d.data().capacity; });
setGarages(g);
});
return function() { unsubV(); unsubG(); };
}, []);

function showToast(msg, type) {
clearTimeout(toastTimer.current);
setToast({ msg: msg, type: type || “ok” });
toastTimer.current = setTimeout(function() { setToast(null); }, 2500);
}

async function addVehicle() {
const garage = form[”\u8eca\u5eab”];
const name = form[”\u8eca\u540d”];
if (!garage || !name.trim()) { showToast(”\u8acb\u586b\u5beb\u8eca\u5eab\u8207\u8eca\u540d”, “err”); return; }
const used = vehicles.filter(function(v) { return v[”\u8eca\u5eab”] === garage; }).length;
if (used >= (garages[garage] || 10)) { showToast(”\u8eca\u5eab\u5df2\u6eff\uff01”, “err”); return; }
await addDoc(collection(db, “vehicles”), Object.assign({}, form, { createdAt: Date.now() }));
setModal(null);
setForm({ “\u8eca\u5eab”:””, “\u5ee0\u724c”:””, “\u8eca\u540d”:””, “\u5099\u8a3b”:”” });
showToast(”\u8eca\u8f1b\u5df2\u65b0\u589e”);
}

async function saveEdit() {
if (!selected || !form[”\u8eca\u540d”].trim()) { showToast(”\u8eca\u540d\u4e0d\u80fd\u70ba\u7a7a”, “err”); return; }
await updateDoc(doc(db, “vehicles”, selected.id), {
“\u5ee0\u724c”: form[”\u5ee0\u724c”],
“\u8eca\u540d”: form[”\u8eca\u540d”],
“\u5099\u8a3b”: form[”\u5099\u8a3b”]
});
setModal(null); setSelected(null);
showToast(”\u5df2\u5132\u5b58”);
}

async function moveVehicle() {
if (!moveTarget) { showToast(”\u8acb\u9078\u64c7\u76ee\u6a19\u8eca\u5eab”, “err”); return; }
const used = vehicles.filter(function(v) { return v[”\u8eca\u5eab”] === moveTarget; }).length;
if (used >= (garages[moveTarget] || 10)) { showToast(”\u76ee\u6a19\u8eca\u5eab\u5df2\u6eff\uff01”, “err”); return; }
await updateDoc(doc(db, “vehicles”, selected.id), { “\u8eca\u5eab”: moveTarget });
setModal(null); setSelected(null); setMoveTarget(””);
showToast(”\u5df2\u79fb\u81f3 “ + moveTarget);
}

async function deleteVehicle(id) {
if (!window.confirm(”\u78ba\u5b9a\u8981\u522a\u9664\u9019\u8f1b\u8eca\uff1f”)) return;
await deleteDoc(doc(db, “vehicles”, id));
if (selected && selected.id === id) setSelected(null);
showToast(”\u5df2\u522a\u9664”, “warn”);
}

async function addGarage() {
const name = newG.name.trim();
if (!name) { showToast(”\u8acb\u8f38\u5165\u8eca\u5eab\u540d\u7a31”, “err”); return; }
if (garages[name] !== undefined) { showToast(”\u8eca\u5eab\u5df2\u5b58\u5728”, “err”); return; }
await setDoc(doc(db, “garages”, name), { capacity: newG.cap });
setModal(null); setNewG({ name:””, cap:10 });
showToast(name + “ \u5df2\u65b0\u589e”);
}

async function handleCSV(e) {
const file = e.target.files[0]; if (!file) return;
const text = await file.text();
const parsed = parseCSV(text);
if (!parsed.vehicles.length) { showToast(“CSV \u683c\u5f0f\u932f\u8aa4”, “err”); return; }
const batch = writeBatch(db);
Object.entries(parsed.garages).forEach(function(entry) {
const name = entry[0]; const cap = entry[1];
if (garages[name] === undefined) batch.set(doc(db, “garages”, name), { capacity: cap });
});
parsed.vehicles.forEach(function(v) {
batch.set(doc(collection(db, “vehicles”)), Object.assign({}, v, { createdAt: Date.now() }));
});
await batch.commit();
showToast(”\u5319\u5165 “ + parsed.vehicles.length + “ \u8f1b\u8eca\u8f1b”);
e.target.value = “”;
}

function exportCSV() {
const rows = vehicles.map(function(v) {
return [v[”\u8eca\u5eab”], v[”\u5ee0\u724c”], v[”\u8eca\u540d”], v[”\u5099\u8a3b”]].join(”,”);
});
const csv = [”\u8eca\u5eab,\u5ee0\u724c,\u8eca\u540d,\u5099\u8a3b”].concat(rows).join(”\n”);
const a = document.createElement(“a”);
a.href = URL.createObjectURL(new Blob([csv], { type:“text/csv;charset=utf-8” }));
a.download = “gta_garage.csv”; a.click();
showToast(”\u5df2\u5319\u51fa”);
}

const garageNames = Object.keys(garages).sort();

const filtered = vehicles.filter(function(v) {
const q = search.toLowerCase();
const matchS = !q || [v[”\u8eca\u540d”], v[”\u5ee0\u724c”], v[”\u5099\u8a3b”]].some(function(f) { return f && f.toLowerCase().includes(q); });
const matchG = filterG === “\u5168\u90e8” || v[”\u8eca\u5eab”] === filterG;
return matchS && matchG;
});

function byGarage(name) { return filtered.filter(function(v) { return v[”\u8eca\u5eab”] === name; }); }

const displayGarages = (filterG === “\u5168\u90e8” ? garageNames : garageNames.filter(function(g) { return g === filterG; }))
.filter(function(g) { return !search || byGarage(g).length > 0; });

const duplicates = (function() {
const map = {};
vehicles.forEach(function(v) {
const key = (v[”\u8eca\u540d”] || “”).trim();
if (!key) return;
if (!map[key]) map[key] = [];
map[key].push(v);
});
return Object.entries(map)
.filter(function(e) { return e[1].length >= 2; })
.sort(function(a, b) { return a[0].localeCompare(b[0], “zh-TW”); });
})();

return (
<>
<style>{globalStyle}</style>

```
  <div style={{ background:"#0d0d14", borderBottom:"2px solid #f5c400", padding:"12px 16px", position:"sticky", top:0, zIndex:100, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
    <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:18, fontWeight:900, letterSpacing:3, color:"#f5c400" }}>
      GTA <span style={{ color:"#ddddf0" }}>{"\u8eca\u5eab"}</span>
      <span style={{ background:"#f5c400", color:"#000", fontSize:9, fontWeight:900, padding:"2px 6px", borderRadius:2, marginLeft:8, letterSpacing:2, verticalAlign:"middle" }}>SYNC</span>
    </div>
    <div style={{ display:"flex", gap:6 }}>
      <button style={Object.assign({}, btnG, { padding:"7px 10px", fontSize:11 })} onClick={function() { fileRef.current.click(); }}>{"\u5319\u5165"}</button>
      <input ref={fileRef} type="file" accept=".csv" style={{ display:"none" }} onChange={handleCSV} />
      <button style={Object.assign({}, btnG, { padding:"7px 10px", fontSize:11 })} onClick={exportCSV}>{"\u5319\u51fa"}</button>
      <button style={Object.assign({}, btnP, { flex:"none", padding:"7px 12px", fontSize:12 })} onClick={function() { setForm({ "\u8eca\u5eab":garageNames[0]||"", "\u5ee0\u724c":"", "\u8eca\u540d":"", "\u5099\u8a3b":"" }); setModal("add"); }}>+ {"\u65b0\u589e"}</button>
    </div>
  </div>

  <div style={{ padding:"10px 16px", display:"flex", gap:8, borderBottom:"1px solid #1e1e2e", background:"#111118", flexWrap:"wrap" }}>
    <input style={Object.assign({}, inp, { flex:1, minWidth:120 })} placeholder={"\u641c\u5c0b\u8eca\u540d\u3001\u5ee0\u724c\u2026"} value={search} onChange={function(e) { setSearch(e.target.value); }} />
    <select style={Object.assign({}, inp, { width:"auto", minWidth:100 })} value={filterG} onChange={function(e) { setFilterG(e.target.value); }}>
      <option>{"\u5168\u90e8"}</option>
      {garageNames.map(function(g) { return <option key={g}>{g}</option>; })}
    </select>
    <button
      style={Object.assign({}, btnG, { padding:"8px 10px", fontSize:11, whiteSpace:"nowrap", color: duplicates.length > 0 ? C.red : C.muted, borderColor: duplicates.length > 0 ? "rgba(230,57,70,0.4)" : C.border })}
      onClick={function() { setModal("dupes"); }}
    >
      {"\u91cd\u8907"}{duplicates.length > 0 && <span style={{ background:C.red, color:"#fff", borderRadius:10, padding:"0 5px", fontSize:10, marginLeft:4 }}>{duplicates.length}</span>}
    </button>
    <button style={Object.assign({}, btnG, { padding:"8px 10px", fontSize:11, whiteSpace:"nowrap" })} onClick={function() { setModal("garage"); }}>+ {"\u8eca\u5eab"}</button>
  </div>

  <div style={{ display:"flex", borderBottom:"1px solid #1e1e2e" }}>
    {[{ label:"\u8eca\u8f1b", val:vehicles.length }, { label:"\u8eca\u5eab", val:garageNames.length }, { label:"\u986f\u793a", val:filtered.length }].map(function(s) {
      return (
        <div key={s.label} style={{ flex:1, padding:"10px 0", textAlign:"center", borderRight:"1px solid #1e1e2e" }}>
          <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:20, fontWeight:900, color:"#f5c400" }}>{s.val}</div>
          <div style={{ fontSize:10, color:"#6b6b85", letterSpacing:2 }}>{s.label}</div>
        </div>
      );
    })}
  </div>

  <div style={{ padding:"16px", paddingBottom:80 }}>
    {loading && <div style={{ textAlign:"center", color:"#6b6b85", padding:40, letterSpacing:2 }}>{"\u8f09\u5165\u4e2d\u2026"}</div>}

    {!loading && displayGarages.length === 0 && (
      <div style={{ textAlign:"center", color:"#6b6b85", padding:40 }}>
        <div style={{ fontSize:32, marginBottom:12 }}>{"?"}</div>
        <div style={{ letterSpacing:2 }}>{search ? "\u6c92\u6709\u7b26\u5408\u641c\u5c0b\u7684\u8eca\u8f1b" : "\u5c1a\u7121\u8eca\u5eab"}</div>
      </div>
    )}

    {displayGarages.map(function(garage) {
      const cars = byGarage(garage);
      const cap = garages[garage] || 10;
      const used = vehicles.filter(function(v) { return v["\u8eca\u5eab"] === garage; }).length;
      const empty = Math.max(0, cap - used);
      return (
        <div key={garage} style={{ marginBottom:28, animation:"fadeIn .3s ease" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:6 }}>
            <div style={{ fontFamily:"'Orbitron',sans-serif", fontSize:13, fontWeight:900, letterSpacing:3, color:"#f5c400", textTransform:"uppercase" }}>{garage}</div>
            <span style={{ fontSize:11, color: used >= cap ? C.red : C.muted, fontWeight:700, letterSpacing:1 }}>{used}/{cap} {"\u683c"}</span>
          </div>
          <CapBar used={used} cap={cap} />

          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {cars.map(function(v, i) {
              return (
                <div key={v.id} style={{ background:"#111118", border:"1px solid #1e1e2e", borderRadius:6, padding:"10px 12px", display:"flex", alignItems:"center", gap:10, animation:"fadeIn .2s ease" }}>
                  <div style={{ color:"#6b6b85", fontSize:11, width:20, textAlign:"center", flexShrink:0 }}>{i+1}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:"#ddddf0", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{v["\u8eca\u540d"]}</div>
                    <div style={{ fontSize:11, color:"#6b6b85", marginTop:2 }}>
                      {v["\u5ee0\u724c"] && <span style={{ background:"#1a1a28", border:"1px solid #1e1e2e", padding:"1px 6px", borderRadius:2, marginRight:6, letterSpacing:1 }}>{v["\u5ee0\u724c"]}</span>}
                      {v["\u5099\u8a3b"] && <span>{v["\u5099\u8a3b"]}</span>}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                    <button style={Object.assign({}, btnG, { padding:"5px 9px", fontSize:11 })} onClick={function() { setSelected(v); setForm({ "\u5ee0\u724c":v["\u5ee0\u724c"], "\u8eca\u540d":v["\u8eca\u540d"], "\u5099\u8a3b":v["\u5099\u8a3b"] }); setModal("edit"); }}>{"\u7de8\u8f2f"}</button>
                    <button style={Object.assign({}, btnG, { padding:"5px 9px", fontSize:11 })} onClick={function() { setSelected(v); setMoveTarget(""); setModal("move"); }}>{"\u79fb\u52d5"}</button>
                    <button style={Object.assign({}, btnG, { padding:"5px 9px", fontSize:11, color:C.red, borderColor:"rgba(230,57,70,0.27)" })} onClick={function() { deleteVehicle(v.id); }}>X</button>
                  </div>
                </div>
              );
            })}

            {Array.from({ length: empty }).map(function(_, i) {
              return (
                <div key={"empty-"+i} style={{ border:"1px dashed #1e1e2e", borderRadius:6, padding:"10px 12px", display:"flex", alignItems:"center", gap:10, opacity:0.4 }}>
                  <div style={{ color:"#6b6b85", fontSize:11, width:20, textAlign:"center", flexShrink:0 }}>{used+i+1}</div>
                  <div style={{ fontSize:12, color:"#6b6b85", letterSpacing:1 }}>{"\u7a7a\u8eca\u4f4d"}</div>
                </div>
              );
            })}
          </div>
        </div>
      );
    })}
  </div>

  {modal === "add" && (
    <Modal title={"\u65b0\u589e\u8eca\u8f1b"} onClose={function() { setModal(null); }}>
      {[["\u8eca\u5eab", true], ["\u5ee0\u724c", false], ["\u8eca\u540d", false], ["\u5099\u8a3b", false]].map(function(pair) {
        const field = pair[0]; const isSelect = pair[1];
        return (
          <div key={field} style={{ marginBottom:14 }}>
            <label style={lbl}>{field}</label>
            {isSelect ? (
              <select style={inp} value={form[field]} onChange={function(e) { setForm(function(f) { const n = Object.assign({}, f); n[field] = e.target.value; return n; }); }}>
                <option value="">{"\u2014 \u9078\u64c7\u8eca\u5eab \u2014"}</option>
                {garageNames.map(function(g) {
                  const u = vehicles.filter(function(v) { return v["\u8eca\u5eab"]===g; }).length;
                  return <option key={g} value={g}>{g} ({u}/{garages[g]})</option>;
                })}
              </select>
            ) : (
              <input style={inp} value={form[field]} onChange={function(e) { setForm(function(f) { const n = Object.assign({}, f); n[field] = e.target.value; return n; }); }} placeholder={field === "\u8eca\u540d" ? "\u5fc5\u586b" : "\u9078\u586b"} />
            )}
          </div>
        );
      })}
      <div style={{ display:"flex", gap:8, marginTop:8 }}>
        <button style={btnP} onClick={addVehicle}>{"\u78ba\u8a8d\u65b0\u589e"}</button>
        <button style={btnG} onClick={function() { setModal(null); }}>{"\u53d6\u6d88"}</button>
      </div>
    </Modal>
  )}

  {modal === "edit" && selected && (
    <Modal title={"\u7de8\u8f2f\u8eca\u8f1b"} onClose={function() { setModal(null); }}>
      {["\u5ee0\u724c", "\u8eca\u540d", "\u5099\u8a3b"].map(function(field) {
        return (
          <div key={field} style={{ marginBottom:14 }}>
            <label style={lbl}>{field}</label>
            <input style={inp} value={form[field]} onChange={function(e) { setForm(function(f) { const n = Object.assign({}, f); n[field] = e.target.value; return n; }); }} />
          </div>
        );
      })}
      <div style={{ display:"flex", gap:8, marginTop:8 }}>
        <button style={btnP} onClick={saveEdit}>{"\u5132\u5b58"}</button>
        <button style={btnG} onClick={function() { setModal(null); }}>{"\u53d6\u6d88"}</button>
      </div>
    </Modal>
  )}

  {modal === "move" && selected && (
    <Modal title={"\u79fb\u52d5\u8eca\u8f1b"} onClose={function() { setModal(null); }}>
      <div style={{ marginBottom:16, padding:"10px 12px", background:"#16161f", borderRadius:4, fontSize:13 }}>
        <span style={{ color:"#f5c400", fontWeight:700 }}>{selected["\u8eca\u540d"]}</span>
        <span style={{ color:"#6b6b85" }}> {"\u30fb \u76ee\u524d\u5728"} {selected["\u8eca\u5eab"]}</span>
      </div>
      <div style={{ marginBottom:16 }}>
        <label style={lbl}>{"\u76ee\u6a19\u8eca\u5eab"}</label>
        <select style={inp} value={moveTarget} onChange={function(e) { setMoveTarget(e.target.value); }}>
          <option value="">{"\u2014 \u9078\u64c7\u76ee\u6a19 \u2014"}</option>
          {garageNames.filter(function(g) { return g !== selected["\u8eca\u5eab"]; }).map(function(g) {
            const u = vehicles.filter(function(v) { return v["\u8eca\u5eab"]===g; }).length;
            const full = u >= (garages[g]||10);
            return <option key={g} value={g} disabled={full}>{g} ({u}/{garages[g]}){full?" X \u5df2\u6eff":""}</option>;
          })}
        </select>
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button style={btnP} onClick={moveVehicle}>{"\u78ba\u8a8d\u79fb\u52d5"}</button>
        <button style={btnG} onClick={function() { setModal(null); }}>{"\u53d6\u6d88"}</button>
      </div>
    </Modal>
  )}

  {modal === "garage" && (
    <Modal title={"\u65b0\u589e\u8eca\u5eab"} onClose={function() { setModal(null); }}>
      <div style={{ marginBottom:14 }}>
        <label style={lbl}>{"\u8eca\u5eab\u540d\u7a31"}</label>
        <input style={inp} value={newG.name} onChange={function(e) { setNewG(function(g) { return Object.assign({}, g, { name: e.target.value }); }); }} placeholder="eg. Vespucci Canals" />
      </div>
      <div style={{ marginBottom:16 }}>
        <label style={lbl}>{"\u5bb9\u91cf\uff08\u683c\u6578\uff09"}</label>
        <input type="number" min={1} max={40} style={inp} value={newG.cap} onChange={function(e) { setNewG(function(g) { return Object.assign({}, g, { cap: Number(e.target.value) }); }); }} />
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button style={btnP} onClick={addGarage}>{"\u78ba\u8a8d\u65b0\u589e"}</button>
        <button style={btnG} onClick={function() { setModal(null); }}>{"\u53d6\u6d88"}</button>
      </div>
    </Modal>
  )}

  {modal === "dupes" && (
    <Modal title={"\u91cd\u8907\u8eca\u8f1b (" + duplicates.length + ")"} onClose={function() { setModal(null); }}>
      {duplicates.length === 0 ? (
        <div style={{ color:"#6b6b85", textAlign:"center", padding:"20px 0", letterSpacing:1 }}>{"\u6c92\u6709\u91cd\u8907\u8eca\u8f1b"}</div>
      ) : (
        <div style={{ maxHeight:"60vh", overflowY:"auto", display:"flex", flexDirection:"column", gap:16 }}>
          {duplicates.map(function(entry) {
            const name = entry[0]; const arr = entry[1];
            return (
              <div key={name}>
                <div style={{ fontSize:13, fontWeight:700, color:"#f5c400", marginBottom:6, display:"flex", alignItems:"center", gap:8 }}>
                  {name}
                  <span style={{ background:"rgba(230,57,70,0.13)", color:C.red, border:"1px solid rgba(230,57,70,0.27)", borderRadius:10, padding:"1px 8px", fontSize:10, fontWeight:900 }}>x{arr.length}</span>
                </div>
                {arr.map(function(v) {
                  return (
                    <div key={v.id} style={{ background:"#16161f", border:"1px solid #1e1e2e", borderRadius:4, padding:"8px 10px", marginBottom:4, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <span style={{ fontSize:12, color:"#ddddf0" }}>{v["\u8eca\u5eab"]}</span>
                        {v["\u5099\u8a3b"] && <span style={{ fontSize:11, color:"#6b6b85", marginLeft:8 }}>{v["\u5099\u8a3b"]}</span>}
                      </div>
                      <div style={{ display:"flex", gap:5 }}>
                        <button style={Object.assign({}, btnG, { padding:"4px 8px", fontSize:10 })} onClick={function() { setSelected(v); setMoveTarget(""); setModal("move"); }}>{"\u79fb\u52d5"}</button>
                        <button style={Object.assign({}, btnG, { padding:"4px 8px", fontSize:10, color:C.red, borderColor:"rgba(230,57,70,0.27)" })} onClick={function() { deleteVehicle(v.id); }}>{"\u522a\u9664"}</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  )}

  <Toast toast={toast} />
</>
```

);
}
