import React, { useState, useEffect, useRef, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, 
  onSnapshot, setDoc, writeBatch, query 
} from "firebase/firestore";
import { 
  getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged 
} from "firebase/auth";
import { 
  Search, Plus, Package, Edit2, Trash2, Move, Download, Upload, AlertCircle, X, ChevronRight
} from "lucide-react";

// --- Firebase 配置 ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'gta-garage-manager';

// --- 常數與樣式 ---
const C = {
  bg: "#09090e",
  panel: "#111118",
  border: "#1e1e2e",
  accent: "#f5c400",
  accentD: "#b38f00",
  red: "#e63946",
  green: "#2ecc71",
  muted: "#6b6b85",
  text: "#ddddf0",
};

// --- 組件 ---

const Toast = ({ toast }) => {
  if (!toast) return null;
  const bg = toast.type === "err" ? C.red : toast.type === "warn" ? C.accentD : C.green;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg shadow-2xl z-[300] flex items-center gap-2 animate-bounce"
         style={{ background: bg, color: "#fff", fontWeight: 600 }}>
      {toast.msg}
    </div>
  );
};

const CapBar = ({ used, cap }) => {
  const pct = cap > 0 ? Math.min(used / cap, 1) : 0;
  const color = pct >= 1 ? C.red : pct > 0.8 ? C.accentD : C.green;
  return (
    <div className="h-1 w-full bg-gray-800 rounded-full overflow-hidden mt-2 mb-4">
      <div 
        className="h-full transition-all duration-500" 
        style={{ width: `${pct * 100}%`, backgroundColor: color }}
      />
    </div>
  );
};

const Modal = ({ title, children, onClose }) => (
  <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
    <div className="bg-[#111118] border-t-4 border-[#f5c400] rounded-xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
      <div className="flex justify-between items-center p-4 border-b border-gray-800">
        <h3 className="text-[#f5c400] font-black uppercase tracking-widest text-sm">{title}</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-white"><X size={20}/></button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

// --- 主程式 ---

export default function App() {
  const [user, setUser] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [garages, setGarages] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filterG, setFilterG] = useState("全部");
  const [toast, setToast] = useState(null);
  const [moveTarget, setMoveTarget] = useState("");
  const [form, setForm] = useState({ 車庫: "", 廠牌: "", 車名: "", 備註: "" });
  const [newG, setNewG] = useState({ name: "", cap: 10 });

  const fileRef = useRef();
  const toastTimer = useRef();

  // Firebase Auth 初始化
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error", err);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Firestore 資料監聽
  useEffect(() => {
    if (!user) return;

    const vCol = collection(db, 'artifacts', appId, 'public', 'data', 'vehicles');
    const gCol = collection(db, 'artifacts', appId, 'public', 'data', 'garages');

    const unsubV = onSnapshot(vCol, (snap) => {
      setVehicles(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => console.error(err));

    const unsubG = onSnapshot(gCol, (snap) => {
      const g = {};
      snap.docs.forEach(d => { g[d.id] = d.data().capacity; });
      setGarages(g);
    }, (err) => console.error(err));

    return () => { unsubV(); unsubG(); };
  }, [user]);

  const showToast = (msg, type = "ok") => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  const addVehicle = async () => {
    if (!form.車庫 || !form.車名.trim()) return showToast("請填寫車庫與車名", "err");
    const used = vehicles.filter(v => v.車庫 === form.車庫).length;
    if (used >= (garages[form.車庫] || 10)) return showToast("車庫已滿！", "err");

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'vehicles'), {
        ...form,
        createdAt: Date.now()
      });
      setModal(null);
      setForm({ 車庫: "", 廠牌: "", 車名: "", 備註: "" });
      showToast("車輛已新增");
    } catch (e) { showToast("新增失敗", "err"); }
  };

  const saveEdit = async () => {
    if (!selected || !form.車名.trim()) return showToast("車名不能為空", "err");
    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vehicles', selected.id), {
        廠牌: form.廠牌,
        車名: form.車名,
        備註: form.備註
      });
      setModal(null); setSelected(null);
      showToast("已儲存變更");
    } catch (e) { showToast("儲存失敗", "err"); }
  };

  const moveVehicle = async () => {
    if (!moveTarget) return showToast("請選擇目標車庫", "err");
    const used = vehicles.filter(v => v.車庫 === moveTarget).length;
    if (used >= (garages[moveTarget] || 10)) return showToast("目標車庫已滿", "err");

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vehicles', selected.id), { 車庫: moveTarget });
      setModal(null); setSelected(null); setMoveTarget("");
      showToast(`已移至 ${moveTarget}`);
    } catch (e) { showToast("移動失敗", "err"); }
  };

  const deleteVehicle = async (id) => {
    // 使用自定義確認邏輯或簡單 confirm (環境允許下)
    if (!window.confirm("確定要刪除這輛車嗎？")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'vehicles', id));
      showToast("已刪除", "warn");
    } catch (e) { showToast("刪除失敗", "err"); }
  };

  const addGarage = async () => {
    const name = newG.name.trim();
    if (!name) return showToast("請輸入車庫名稱", "err");
    if (garages[name]) return showToast("車庫已存在", "err");

    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'garages', name), { capacity: newG.cap });
      setModal(null); setNewG({ name: "", cap: 10 });
      showToast(`${name} 已建立`);
    } catch (e) { showToast("建立失敗", "err"); }
  };

  const handleCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.trim().split("\n");
    if (lines.length < 2) return showToast("無效的 CSV 格式", "err");

    const batch = writeBatch(db);
    const rows = lines.slice(1);
    
    rows.forEach(line => {
      const [garage, brand, name, note] = line.split(",").map(s => s.trim());
      if (name) {
        const vRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'vehicles'));
        batch.set(vRef, { 車庫: garage, 廠牌: brand, 車名: name, 備註: note, createdAt: Date.now() });
        
        // 如果車庫不存在，自動建立預設 10 格
        if (!garages[garage]) {
          const gRef = doc(db, 'artifacts', appId, 'public', 'data', 'garages', garage);
          batch.set(gRef, { capacity: 10 });
        }
      }
    });

    try {
      await batch.commit();
      showToast(`已匯入 ${rows.length} 輛車`);
    } catch (e) { showToast("匯入失敗", "err"); }
    e.target.value = "";
  };

  const exportCSV = () => {
    const header = "車庫,廠牌,車名,備註\n";
    const content = vehicles.map(v => `${v.車庫},${v.廠牌},${v.車名},${v.備註}`).join("\n");
    const blob = new Blob(["\uFEFF" + header + content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `GTA_Vehicles_${new Date().toLocaleDateString()}.csv`;
    link.click();
    showToast("匯出完成");
  };

  // --- 計算邏輯 ---
  const garageNames = useMemo(() => Object.keys(garages).sort(), [garages]);
  
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      const matchS = !search || [v.車名, v.廠牌, v.備註].some(f => f?.toLowerCase().includes(search.toLowerCase()));
      const matchG = filterG === "全部" || v.車庫 === filterG;
      return matchS && matchG;
    });
  }, [vehicles, search, filterG]);

  const displayGarages = useMemo(() => {
    let list = filterG === "全部" ? garageNames : [filterG];
    if (search) {
      list = list.filter(g => filteredVehicles.some(v => v.車庫 === g));
    }
    return list;
  }, [garageNames, filterG, search, filteredVehicles]);

  const duplicates = useMemo(() => {
    const counts = {};
    vehicles.forEach(v => {
      const k = v.車名.trim();
      if (!k) return;
      counts[k] = (counts[k] || []);
      counts[k].push(v);
    });
    return Object.entries(counts).filter(([_, arr]) => arr.length > 1);
  }, [vehicles]);

  const inputStyle = "w-full bg-[#16161f] border border-gray-800 rounded-lg px-4 py-3 text-white focus:border-[#f5c400] outline-none transition-all mb-4";
  const labelStyle = "text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1 block";

  return (
    <div className="min-h-screen bg-[#09090e] text-[#ddddf0] font-sans">
      {/* Header */}
      <header className="sticky top-0 z-[100] bg-[#0d0d14] border-b-2 border-[#f5c400] p-4 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-2">
          <div className="bg-[#f5c400] text-black text-xs font-black px-2 py-1 rounded italic">GTA V</div>
          <h1 className="font-black tracking-tighter text-xl italic uppercase">Garage <span className="text-[#f5c400]">Manager</span></h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => fileRef.current.click()} className="p-2 text-gray-400 hover:text-white transition-colors" title="匯入 CSV"><Upload size={20}/></button>
          <input type="file" ref={fileRef} className="hidden" accept=".csv" onChange={handleCSV} />
          <button onClick={exportCSV} className="p-2 text-gray-400 hover:text-white transition-colors" title="匯出 CSV"><Download size={20}/></button>
          <button onClick={() => setModal("add")} className="bg-[#f5c400] text-black p-2 rounded-lg font-bold hover:bg-[#b38f00] transition-colors"><Plus size={20}/></button>
        </div>
      </header>

      {/* Stats & Search */}
      <div className="p-4 space-y-4">
        <div className="flex gap-4">
          <div className="flex-1 bg-[#111118] border border-gray-800 p-4 rounded-xl text-center">
            <div className="text-2xl font-black text-[#f5c400] leading-none">{vehicles.length}</div>
            <div className="text-[10px] text-gray-500 uppercase mt-1 tracking-widest">總車輛</div>
          </div>
          <div className="flex-1 bg-[#111118] border border-gray-800 p-4 rounded-xl text-center">
            <div className="text-2xl font-black text-[#f5c400] leading-none">{garageNames.length}</div>
            <div className="text-[10px] text-gray-500 uppercase mt-1 tracking-widest">車庫數</div>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" size={16}/>
            <input 
              className="w-full bg-[#111118] border border-gray-800 rounded-lg pl-10 pr-4 py-2 outline-none focus:border-[#f5c400]"
              placeholder="搜尋車名、廠牌..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select 
            className="bg-[#111118] border border-gray-800 rounded-lg px-3 py-2 outline-none focus:border-[#f5c400]"
            value={filterG}
            onChange={(e) => setFilterG(e.target.value)}
          >
            <option>全部</option>
            {garageNames.map(g => <option key={g}>{g}</option>)}
          </select>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
           <button 
            onClick={() => setModal("dupes")}
            className="flex-none flex items-center gap-1 text-xs font-bold border border-gray-800 px-3 py-1.5 rounded-full hover:bg-gray-800 transition-colors"
           >
            <AlertCircle size={14} className={duplicates.length ? "text-red-500" : ""}/> 
            重複檢查 {duplicates.length > 0 && <span className="bg-red-500 text-white px-1.5 rounded-full text-[10px]">{duplicates.length}</span>}
           </button>
           <button 
            onClick={() => setModal("garage")}
            className="flex-none flex items-center gap-1 text-xs font-bold border border-gray-800 px-3 py-1.5 rounded-full hover:bg-gray-800 transition-colors"
           >
            <Package size={14}/> 建立車庫
           </button>
        </div>
      </div>

      {/* Garage List */}
      <main className="p-4 space-y-8 pb-24">
        {loading ? (
          <div className="py-20 text-center text-gray-600 animate-pulse tracking-widest">讀取圖資中...</div>
        ) : displayGarages.length === 0 ? (
          <div className="py-20 text-center text-gray-600">無符合條件的車庫數據</div>
        ) : displayGarages.map(garage => {
          const cars = filteredVehicles.filter(v => v.車庫 === garage);
          const cap = garages[garage] || 10;
          const used = vehicles.filter(v => v.車庫 === garage).length;
          const empty = Math.max(0, cap - used);

          return (
            <div key={garage} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-end mb-2">
                <h2 className="font-black italic text-lg tracking-tight uppercase flex items-center gap-2">
                  <ChevronRight size={18} className="text-[#f5c400]"/> {garage}
                </h2>
                <span className={`text-[10px] font-bold ${used >= cap ? 'text-red-500' : 'text-gray-500'}`}>
                  {used} / {cap} 容納
                </span>
              </div>
              <CapBar used={used} cap={cap} />
              <div className="space-y-2">
                {cars.map((v, i) => (
                  <div key={v.id} className="group bg-[#111118] border border-gray-800 p-3 rounded-lg flex items-center gap-4 hover:border-gray-600 transition-all">
                    <div className="text-[10px] font-mono text-gray-700 w-4">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold truncate text-sm">{v.車名}</div>
                      <div className="flex gap-2 mt-1">
                        {v.廠牌 && <span className="text-[9px] bg-black/40 border border-gray-800 px-1.5 py-0.5 rounded text-gray-500 uppercase">{v.廠牌}</span>}
                        {v.備註 && <span className="text-[9px] text-gray-600 truncate italic">{v.備註}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setSelected(v); setForm(v); setModal("edit"); }} className="p-1.5 hover:text-[#f5c400]"><Edit2 size={14}/></button>
                      <button onClick={() => { setSelected(v); setModal("move"); }} className="p-1.5 hover:text-blue-400"><Move size={14}/></button>
                      <button onClick={() => deleteVehicle(v.id)} className="p-1.5 hover:text-red-500"><Trash2 size={14}/></button>
                    </div>
                  </div>
                ))}
                {empty > 0 && Array.from({ length: Math.min(empty, 5) }).map((_, i) => (
                  <div key={`empty-${i}`} className="border border-dashed border-gray-900 h-10 rounded-lg flex items-center justify-center text-[10px] text-gray-800 tracking-widest font-bold uppercase">
                    空車位
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </main>

      {/* Modals */}
      {modal === "add" && (
        <Modal title="新增車輛" onClose={() => setModal(null)}>
          <label className={labelStyle}>選擇車庫</label>
          <select className={inputStyle} value={form.車庫} onChange={e => setForm({...form, 車庫: e.target.value})}>
            <option value="">-- 選擇車庫 --</option>
            {garageNames.map(g => (
              <option key={g} value={g}>{g} ({vehicles.filter(v=>v.車庫===g).length}/{garages[g]})</option>
            ))}
          </select>
          <label className={labelStyle}>廠牌</label>
          <input className={inputStyle} value={form.廠牌} onChange={e => setForm({...form, 廠牌: e.target.value})} placeholder="例如: Pegassi"/>
          <label className={labelStyle}>車名</label>
          <input className={inputStyle} value={form.車名} onChange={e => setForm({...form, 車名: e.target.value})} placeholder="例如: Zentorno"/>
          <label className={labelStyle}>備註</label>
          <input className={inputStyle} value={form.備註} onChange={e => setForm({...form, 備註: e.target.value})} placeholder="自訂標記..."/>
          <button onClick={addVehicle} className="w-full bg-[#f5c400] text-black font-black py-3 rounded-lg uppercase tracking-widest hover:bg-white transition-colors">確認新增</button>
        </Modal>
      )}

      {modal === "edit" && (
        <Modal title="編輯車輛" onClose={() => setModal(null)}>
          <label className={labelStyle}>廠牌</label>
          <input className={inputStyle} value={form.廠牌} onChange={e => setForm({...form, 廠牌: e.target.value})}/>
          <label className={labelStyle}>車名</label>
          <input className={inputStyle} value={form.車名} onChange={e => setForm({...form, 車名: e.target.value})}/>
          <label className={labelStyle}>備註</label>
          <input className={inputStyle} value={form.備註} onChange={e => setForm({...form, 備註: e.target.value})}/>
          <button onClick={saveEdit} className="w-full bg-[#f5c400] text-black font-black py-3 rounded-lg uppercase tracking-widest hover:bg-white transition-colors">儲存變更</button>
        </Modal>
      )}

      {modal === "move" && selected && (
        <Modal title="移動車輛" onClose={() => setModal(null)}>
          <div className="bg-black/40 p-3 rounded-lg mb-6 border border-gray-800">
            <div className="text-xs text-gray-500 uppercase mb-1">正在移動</div>
            <div className="font-bold text-[#f5c400]">{selected.車名}</div>
            <div className="text-[10px] text-gray-600 mt-1">目前位置: {selected.車庫}</div>
          </div>
          <label className={labelStyle}>目標車庫</label>
          <select className={inputStyle} value={moveTarget} onChange={e => setMoveTarget(e.target.value)}>
            <option value="">-- 選擇目標 --</option>
            {garageNames.filter(g => g !== selected.車庫).map(g => {
              const full = vehicles.filter(v => v.車庫 === g).length >= (garages[g] || 10);
              return <option key={g} value={g} disabled={full}>{g} {full ? '(已滿)' : ''}</option>;
            })}
          </select>
          <button onClick={moveVehicle} className="w-full bg-[#f5c400] text-black font-black py-3 rounded-lg uppercase tracking-widest hover:bg-white transition-colors">確認移動</button>
        </Modal>
      )}

      {modal === "garage" && (
        <Modal title="新增車庫" onClose={() => setModal(null)}>
          <label className={labelStyle}>車庫名稱</label>
          <input className={inputStyle} value={newG.name} onChange={e => setNewG({...newG, name: e.target.value})} placeholder="例如: 艾爾塔街公寓 10 號"/>
          <label className={labelStyle}>容量 (格數)</label>
          <input type="number" className={inputStyle} value={newG.cap} onChange={e => setNewG({...newG, cap: parseInt(e.target.value) || 0})}/>
          <button onClick={addGarage} className="w-full bg-[#f5c400] text-black font-black py-3 rounded-lg uppercase tracking-widest hover:bg-white transition-colors">建立車庫</button>
        </Modal>
      )}

      {modal === "dupes" && (
        <Modal title="重複車輛報告" onClose={() => setModal(null)}>
          <div className="max-h-[60vh] overflow-y-auto space-y-4 pr-2 custom-scrollbar">
            {duplicates.length === 0 ? (
              <div className="text-center py-10 text-gray-600 italic">尚未發現重複的車輛</div>
            ) : duplicates.map(([name, list]) => (
              <div key={name} className="border border-gray-800 rounded-lg p-3">
                <div className="flex justify-between mb-2">
                  <div className="font-bold text-[#f5c400]">{name}</div>
                  <div className="text-[10px] bg-red-500/20 text-red-500 px-2 py-0.5 rounded font-black italic">{list.length}x</div>
                </div>
                <div className="space-y-1">
                  {list.map(v => (
                    <div key={v.id} className="text-[10px] flex justify-between text-gray-500 border-t border-gray-900 pt-1">
                      <span>{v.車庫}</span>
                      <span className="italic opacity-50">{v.備註 || "無備註"}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      <Toast toast={toast} />
      
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #000; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
      `}</style>
    </div>
  );
}
