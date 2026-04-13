import { useState, useEffect, useRef } from "react";
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, setDoc, writeBatch
} from "firebase/firestore";
import { db } from "./firebase";

const DEFAULT_TAGS = ["\u5e38\u7528","\u6539\u88dd\u5b8c\u7562","\u5f85\u8ce3","\u5f85\u6539","\u73cd\u85cf","\u5c55\u793a\u7528"];

const C = {
  bg:"#09090e", panel:"#111118", border:"#1e1e2e",
  accent:"#f5c400", accentD:"#b38f00",
  red:"#e63946", green:"#2ecc71", blue:"#3a86ff",
  muted:"#6b6b85", text:"#ddddf0",
};

const globalStyle = `
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{background:#09090e;color:#ddddf0;font-family:'Rajdhani',sans-serif;-webkit-font-smoothing:antialiased;}
  ::-webkit-scrollbar{width:4px;}
  ::-webkit-scrollbar-track{background:#111118;}
  ::-webkit-scrollbar-thumb{background:#1e1e2e;border-radius:2px;}
  select,input,option{font-family:inherit;}
  @keyframes fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
  @keyframes slideUp{from{opacity:0;transform:translateY(40px);}to{opacity:1;transform:translateY(0);}}
  .drag-over{border-color:#f5c400 !important;background:#1a1a10 !important;}
`;

const inp = {background:"#16161f",border:"1px solid #1e1e2e",color:"#ddddf0",padding:"10px 12px",borderRadius:4,fontSize:14,outline:"none",width:"100%",fontFamily:"inherit"};
const lbl = {fontSize:10,color:"#6b6b85",letterSpacing:2,display:"block",marginBottom:5,textTransform:"uppercase"};
const btnP = {background:"#f5c400",color:"#000",border:"none",padding:"11px 20px",fontWeight:900,fontSize:13,letterSpacing:2,cursor:"pointer",borderRadius:4,textTransform:"uppercase",flex:1};
const btnG = {background:"transparent",color:"#6b6b85",border:"1px solid #1e1e2e",padding:"11px 16px",fontWeight:700,fontSize:12,letterSpacing:1,cursor:"pointer",borderRadius:4,textTransform:"uppercase"};

function parseCSV(text) {
  var lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) return {vehicles:[],garages:{}};
  var headers = lines[0].split(",").map(function(h){return h.trim();});
  var garages = {};
  var vehicles = lines.slice(1).map(function(line) {
    var vals = line.split(",").map(function(v){return v.trim();});
    var obj = {};
    headers.forEach(function(h,i){obj[h]=vals[i]||"";});
    var g = obj["\u8eca\u5eab"];
    var cap = parseInt(obj["\u5bb9\u91cf"])||10;
    if (g && !garages[g]) garages[g]=cap;
    return {"\u8eca\u5eab":obj["\u8eca\u5eab"]||"","\u5ee0\u724c":obj["\u5ee0\u724c"]||"","\u8eca\u540d":obj["\u8eca\u540d"]||"","\u6a19\u7c64":obj["\u6a19\u7c64"]||""};
  }).filter(function(v){return v["\u8eca\u540d"];});
  return {vehicles:vehicles,garages:garages};
}

function Toast(p) {
  if (!p.toast) return null;
  var bg = p.toast.type==="err" ? C.red : p.toast.type==="warn" ? C.accentD : C.green;
  return <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:bg,color:"#000",padding:"10px 22px",fontWeight:800,fontSize:13,letterSpacing:2,borderRadius:4,zIndex:400,textTransform:"uppercase",boxShadow:"0 6px 24px #0009",animation:"fadeIn .2s ease",whiteSpace:"nowrap"}}>{p.toast.msg}</div>;
}

function CapBar(p) {
  var pct = p.cap>0 ? Math.min(p.used/p.cap,1) : 0;
  var color = pct>=1 ? C.red : pct>0.7 ? C.accentD : C.green;
  return <div style={{height:3,background:"#1a1a28",borderRadius:2,overflow:"hidden",marginBottom:10}}><div style={{height:"100%",width:(pct*100)+"%",background:color,borderRadius:2,transition:"width .4s"}} /></div>;
}

function Modal(p) {
  return (
    <div style={{position:"fixed",inset:0,background:"#000b",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={p.onClose}>
      <div style={{background:C.panel,borderTop:"3px solid "+C.accent,borderRadius:"12px 12px 0 0",width:"100%",maxWidth:520,padding:"24px 20px 36px",animation:"slideUp .25s ease",maxHeight:"90vh",overflowY:"auto"}} onClick={function(e){e.stopPropagation();}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:15,fontWeight:900,letterSpacing:3,color:C.accent,textTransform:"uppercase"}}>{p.title}</div>
          <button onClick={p.onClose} style={{background:"none",border:"none",color:C.muted,fontSize:20,cursor:"pointer",lineHeight:1}}>X</button>
        </div>
        {p.children}
      </div>
    </div>
  );
}

function TagPill(p) {
  return (
    <span onClick={p.onClick} style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 10px",borderRadius:10,fontSize:11,fontWeight:700,letterSpacing:1,cursor:"pointer",border:"1px solid "+(p.active?C.accent:C.border),background:p.active?C.accent+"22":"transparent",color:p.active?C.accent:C.muted,transition:"all .15s",userSelect:"none"}}>
      {p.label}
      {p.onDelete && <span onClick={function(e){e.stopPropagation();p.onDelete();}} style={{marginLeft:2,opacity:0.6,fontSize:12,lineHeight:1}}>x</span>}
    </span>
  );
}

export default function App() {
  var [vehicles,setVehicles]       = useState([]);
  var [garages,setGarages]         = useState({});
  var [garageOrder,setGarageOrder] = useState([]);
  var [customTags,setCustomTags]   = useState([]);
  var [collapsed,setCollapsed]     = useState({});
  var [loading,setLoading]         = useState(true);
  var [modal,setModal]             = useState(null);
  var [selected,setSelected]       = useState(null);
  var [search,setSearch]           = useState("");
  var [filterG,setFilterG]         = useState("\u5168\u90e8");
  var [filterTags,setFilterTags]   = useState([]);
  var [toast,setToast]             = useState(null);
  var [moveTarget,setMoveTarget]   = useState("");
  var [form,setForm]               = useState({"\u8eca\u5eab":"","\u5ee0\u724c":"","\u8eca\u540d":"","\u6a19\u7c64":""});
  var [formTags,setFormTags]       = useState([]);
  var [newG,setNewG]               = useState({name:"",cap:10});
  var [editCapGarage,setEditCapGarage] = useState(null);
  var [editCapVal,setEditCapVal]   = useState(10);
  var [view,setView]               = useState("main");
  var [batchMode,setBatchMode]     = useState(false);
  var [batchSel,setBatchSel]       = useState([]);
  var [batchTarget,setBatchTarget] = useState("");
  var [dragSrc,setDragSrc]         = useState(null);
  var [newTagInput,setNewTagInput] = useState("");
  var fileRef = useRef();
  var toastTimer = useRef();

  // ── Firestore listeners ──────────────────────────────────────────────────
  useEffect(function() {
    var unsubV = onSnapshot(collection(db,"vehicles"),function(snap){
      setVehicles(snap.docs.map(function(d){return Object.assign({id:d.id},d.data());}));
      setLoading(false);
    });
    var unsubG = onSnapshot(collection(db,"garages"),function(snap){
      var g={};
      snap.docs.forEach(function(d){g[d.id]=d.data().capacity;});
      setGarages(g);
    });
    var unsubM = onSnapshot(doc(db,"meta","settings"),function(snap){
      if (snap.exists()) {
        var d = snap.data();
        if (d.garageOrder) setGarageOrder(d.garageOrder);
        if (d.customTags)  setCustomTags(d.customTags);
        if (d.collapsed)   setCollapsed(d.collapsed);
      }
    });
    return function(){unsubV();unsubG();unsubM();};
  },[]);

  function showToast(msg,type) {
    clearTimeout(toastTimer.current);
    setToast({msg:msg,type:type||"ok"});
    toastTimer.current = setTimeout(function(){setToast(null);},2500);
  }

  // ── Settings helpers ─────────────────────────────────────────────────────
  async function saveMeta(patch) {
    var ref = doc(db,"meta","settings");
    await setDoc(ref,patch,{merge:true});
  }

  // ── Garage ordering ──────────────────────────────────────────────────────
  var orderedGarages = (function(){
    var names = Object.keys(garages);
    var ordered = garageOrder.filter(function(n){return names.includes(n);});
    var rest = names.filter(function(n){return !ordered.includes(n);}).sort();
    return ordered.concat(rest);
  })();

  async function saveOrder(arr) {
    setGarageOrder(arr);
    await saveMeta({garageOrder:arr});
  }

  function onDragStart(e,g) {setDragSrc(g);e.dataTransfer.effectAllowed="move";}
  function onDragOver(e,g)  {e.preventDefault();e.currentTarget.classList.add("drag-over");}
  function onDragLeave(e)   {e.currentTarget.classList.remove("drag-over");}
  async function onDrop(e,g) {
    e.currentTarget.classList.remove("drag-over");
    if (!dragSrc||dragSrc===g) return;
    var arr=orderedGarages.slice();
    arr.splice(arr.indexOf(dragSrc),1);
    arr.splice(arr.indexOf(g),0,dragSrc);
    setDragSrc(null);
    await saveOrder(arr);
  }

  // ── Collapse ─────────────────────────────────────────────────────────────
  async function toggleCollapse(g) {
    var next = Object.assign({},collapsed);
    next[g] = !next[g];
    setCollapsed(next);
    await saveMeta({collapsed:next});
  }

  // ── Custom tags ───────────────────────────────────────────────────────────
  var allTags = DEFAULT_TAGS.concat(customTags.filter(function(t){return !DEFAULT_TAGS.includes(t);}));

  async function addCustomTag() {
    var t = newTagInput.trim();
    if (!t) return;
    if (allTags.includes(t)) {showToast("Tag \u5df2\u5b58\u5728","err");return;}
    var next = customTags.concat([t]);
    setCustomTags(next);
    setNewTagInput("");
    await saveMeta({customTags:next});
    showToast("Tag \u5df2\u65b0\u589e");
  }

  async function deleteCustomTag(t) {
    var next = customTags.filter(function(x){return x!==t;});
    setCustomTags(next);
    await saveMeta({customTags:next});
    // remove tag from filterTags if active
    setFilterTags(function(prev){return prev.filter(function(x){return x!==t;});});
    showToast("Tag \u5df2\u522a\u9664","warn");
  }

  // ── Vehicle CRUD ──────────────────────────────────────────────────────────
  async function addVehicle() {
    var garage=form["\u8eca\u5eab"],name=form["\u8eca\u540d"];
    if (!garage||!name.trim()) {showToast("\u8acb\u586b\u5beb\u8eca\u5eab\u8207\u8eca\u540d","err");return;}
    var used=vehicles.filter(function(v){return v["\u8eca\u5eab"]===garage;}).length;
    if (used>=(garages[garage]||10)) {showToast("\u8eca\u5eab\u5df2\u6eff","err");return;}
    await addDoc(collection(db,"vehicles"),Object.assign({},form,{"\u6a19\u7c64":formTags.join(","),createdAt:Date.now()}));
    setModal(null);setForm({"\u8eca\u5eab":"","\u5ee0\u724c":"","\u8eca\u540d":"","\u6a19\u7c64":""});setFormTags([]);
    showToast("\u8eca\u8f1b\u5df2\u65b0\u589e");
  }

  async function saveEdit() {
    if (!selected||!form["\u8eca\u540d"].trim()) {showToast("\u8eca\u540d\u4e0d\u80fd\u70ba\u7a7a","err");return;}
    await updateDoc(doc(db,"vehicles",selected.id),{"\u5ee0\u724c":form["\u5ee0\u724c"],"\u8eca\u540d":form["\u8eca\u540d"],"\u6a19\u7c64":formTags.join(",")});
    setModal(null);setSelected(null);setFormTags([]);
    showToast("\u5df2\u5132\u5b58");
  }

  async function moveVehicle() {
    if (!moveTarget) {showToast("\u8acb\u9078\u64c7\u76ee\u6a19\u8eca\u5eab","err");return;}
    var used=vehicles.filter(function(v){return v["\u8eca\u5eab"]===moveTarget;}).length;
    if (used>=(garages[moveTarget]||10)) {showToast("\u76ee\u6a19\u8eca\u5eab\u5df2\u6eff","err");return;}
    await updateDoc(doc(db,"vehicles",selected.id),{"\u8eca\u5eab":moveTarget});
    setModal(null);setSelected(null);setMoveTarget("");
    showToast("\u5df2\u79fb\u81f3 "+moveTarget);
  }

  async function deleteVehicle(id) {
    if (!window.confirm("\u78ba\u5b9a\u8981\u522a\u9664\u9019\u8f1b\u8eca\uff1f")) return;
    await deleteDoc(doc(db,"vehicles",id));
    if (selected&&selected.id===id) setSelected(null);
    showToast("\u5df2\u522a\u9664","warn");
  }

  // ── Garage CRUD ───────────────────────────────────────────────────────────
  async function addGarage() {
    var name=newG.name.trim();
    if (!name) {showToast("\u8acb\u8f38\u5165\u8eca\u5eab\u540d\u7a31","err");return;}
    if (garages[name]!==undefined) {showToast("\u8eca\u5eab\u5df2\u5b58\u5728","err");return;}
    await setDoc(doc(db,"garages",name),{capacity:newG.cap});
    await saveOrder(orderedGarages.concat([name]));
    setModal(null);setNewG({name:"",cap:10});
    showToast(name+" \u5df2\u65b0\u589e");
  }

  async function saveCapacity() {
    if (!editCapGarage) return;
    await setDoc(doc(db,"garages",editCapGarage),{capacity:editCapVal});
    setEditCapGarage(null);
    showToast("\u5bb9\u91cf\u5df2\u66f4\u65b0");
  }

  // ── Batch move ────────────────────────────────────────────────────────────
  function toggleBatch(id) {
    setBatchSel(function(prev){return prev.includes(id)?prev.filter(function(x){return x!==id;}):prev.concat([id]);});
  }

  async function doBatchMove() {
    if (!batchTarget) {showToast("\u8acb\u9078\u64c7\u76ee\u6a19\u8eca\u5eab","err");return;}
    var used=vehicles.filter(function(v){return v["\u8eca\u5eab"]===batchTarget;}).length;
    if (used+batchSel.length>(garages[batchTarget]||10)) {showToast("\u76ee\u6a19\u8eca\u5eab\u5bb9\u91cf\u4e0d\u8db3","err");return;}
    var batch=writeBatch(db);
    batchSel.forEach(function(id){batch.update(doc(db,"vehicles",id),{"\u8eca\u5eab":batchTarget});});
    await batch.commit();
    setBatchMode(false);setBatchSel([]);setBatchTarget("");
    showToast("\u5df2\u79fb\u52d5 "+batchSel.length+" \u8f1b");
  }

  // ── CSV ───────────────────────────────────────────────────────────────────
  async function handleCSV(e) {
    var file=e.target.files[0];if (!file) return;
    var text=await file.text();
    var parsed=parseCSV(text);
    if (!parsed.vehicles.length) {showToast("CSV \u683c\u5f0f\u932f\u8aa4","err");return;}
    var batch=writeBatch(db);
    Object.entries(parsed.garages).forEach(function(entry){
      if (garages[entry[0]]===undefined) batch.set(doc(db,"garages",entry[0]),{capacity:entry[1]});
    });
    parsed.vehicles.forEach(function(v){batch.set(doc(collection(db,"vehicles")),Object.assign({},v,{createdAt:Date.now()}));});
    await batch.commit();
    showToast("\u5319\u5165 "+parsed.vehicles.length+" \u8f1b");
    e.target.value="";
  }

  function exportCSV() {
    var rows=vehicles.map(function(v){return [v["\u8eca\u5eab"],v["\u5ee0\u724c"],v["\u8eca\u540d"],v["\u6a19\u7c64"]].join(",");});
    var csv=["\u8eca\u5eab,\u5ee0\u724c,\u8eca\u540d,\u6a19\u7c64"].concat(rows).join("\n");
    var a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    a.download="gta_garage.csv";a.click();
    showToast("\u5df2\u5319\u51fa");
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  var filtered = vehicles.filter(function(v){
    var q=search.toLowerCase();
    var matchS=!q||[v["\u8eca\u540d"],v["\u5ee0\u724c"]].some(function(f){return f&&f.toLowerCase().includes(q);});
    var matchG=filterG==="\u5168\u90e8"||v["\u8eca\u5eab"]===filterG;
    var vTags=(v["\u6a19\u7c64"]||"").split(",").map(function(t){return t.trim();});
    var matchT=filterTags.length===0||filterTags.every(function(t){return vTags.includes(t);});
    return matchS&&matchG&&matchT;
  });

  function byGarage(name){return filtered.filter(function(v){return v["\u8eca\u5eab"]===name;});}

  var displayGarages = (filterG==="\u5168\u90e8" ? orderedGarages : orderedGarages.filter(function(g){return g===filterG;}))
    .filter(function(g){return (!search&&filterTags.length===0)||byGarage(g).length>0;});

  var duplicates = (function(){
    var map={};
    vehicles.forEach(function(v){
      var key=(v["\u8eca\u540d"]||"").trim();if (!key) return;
      if (!map[key]) map[key]=[];
      map[key].push(v);
    });
    return Object.entries(map).filter(function(e){return e[1].length>=2;})
      .sort(function(a,b){return a[0].localeCompare(b[0],"zh-TW");});
  })();

  // ── Stats View ────────────────────────────────────────────────────────────
  function StatsView() {
    var brandMap={};
    vehicles.forEach(function(v){var b=v["\u5ee0\u724c"]||"\u672a\u77e5";brandMap[b]=(brandMap[b]||0)+1;});
    var brands=Object.entries(brandMap).sort(function(a,b){return b[1]-a[1];});
    var maxB=brands.length?brands[0][1]:1;
    var gStats=orderedGarages.map(function(g){
      var used=vehicles.filter(function(v){return v["\u8eca\u5eab"]===g;}).length;
      var cap=garages[g]||10;
      return {name:g,used:used,cap:cap,pct:cap>0?used/cap:0};
    }).sort(function(a,b){return b.pct-a.pct;});
    return (
      <div style={{padding:"16px",paddingBottom:80}}>
        <div style={{marginBottom:28}}>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:12,fontWeight:900,letterSpacing:3,color:C.accent,marginBottom:14}}>{"\u8eca\u5eab\u4f54\u7528\u7387"}</div>
          {gStats.map(function(g){
            var color=g.pct>=1?C.red:g.pct>0.7?C.accentD:C.green;
            return <div key={g.name} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                <span style={{color:C.text}}>{g.name}</span>
                <span style={{color:color,fontWeight:700}}>{g.used}/{g.cap}</span>
              </div>
              <div style={{height:6,background:"#1a1a28",borderRadius:3,overflow:"hidden"}}>
                <div style={{height:"100%",width:(Math.min(g.pct,1)*100)+"%",background:color,borderRadius:3}} />
              </div>
            </div>;
          })}
        </div>
        <div>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:12,fontWeight:900,letterSpacing:3,color:C.accent,marginBottom:14}}>{"\u5ee0\u724c\u5206\u5e03"}</div>
          {brands.map(function(e){return <div key={e[0]} style={{marginBottom:8}}>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}>
              <span style={{color:C.text}}>{e[0]}</span>
              <span style={{color:C.accent,fontWeight:700}}>{e[1]} {"\u8f1b"}</span>
            </div>
            <div style={{height:4,background:"#1a1a28",borderRadius:2,overflow:"hidden"}}>
              <div style={{height:"100%",width:((e[1]/maxB)*100)+"%",background:C.blue,borderRadius:2}} />
            </div>
          </div>;})}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{globalStyle}</style>

      {/* HEADER */}
      <div style={{background:"#0d0d14",borderBottom:"2px solid #f5c400",padding:"12px 16px",position:"sticky",top:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
        <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:18,fontWeight:900,letterSpacing:3,color:"#f5c400"}}>
          GTA <span style={{color:"#ddddf0"}}>{"\u8eca\u5eab"}</span>
          <span style={{background:"#f5c400",color:"#000",fontSize:9,fontWeight:900,padding:"2px 6px",borderRadius:2,marginLeft:8,letterSpacing:2,verticalAlign:"middle"}}>SYNC</span>
        </div>
        <div style={{display:"flex",gap:6}}>
          <button style={Object.assign({},btnG,{padding:"7px 10px",fontSize:11})} onClick={function(){fileRef.current.click();}}>{"\u5319\u5165"}</button>
          <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={handleCSV} />
          <button style={Object.assign({},btnG,{padding:"7px 10px",fontSize:11})} onClick={exportCSV}>{"\u5319\u51fa"}</button>
          <button style={Object.assign({},btnP,{flex:"none",padding:"7px 12px",fontSize:12})} onClick={function(){setForm({"\u8eca\u5eab":orderedGarages[0]||"","\u5ee0\u724c":"","\u8eca\u540d":"","\u6a19\u7c64":""});setFormTags([]);setModal("add");}}>+ {"\u65b0\u589e"}</button>
        </div>
      </div>

      {/* TAB BAR */}
      <div style={{display:"flex",borderBottom:"1px solid #1e1e2e",background:"#0d0d14"}}>
        {[["\u4e3b\u9801","main"],["\u7d71\u8a08","stats"],["\u6a19\u7c64","tags"]].map(function(pair){
          return <button key={pair[1]} onClick={function(){setView(pair[1]);}} style={{flex:1,padding:"10px 0",background:"none",border:"none",borderBottom:view===pair[1]?"2px solid #f5c400":"2px solid transparent",color:view===pair[1]?"#f5c400":"#6b6b85",fontFamily:"'Rajdhani',sans-serif",fontWeight:700,fontSize:13,letterSpacing:2,cursor:"pointer"}}>{pair[0]}</button>;
        })}
      </div>

      {/* STATS */}
      {view==="stats" && <StatsView />}

      {/* TAG EDITOR */}
      {view==="tags" && (
        <div style={{padding:"16px",paddingBottom:80}}>
          <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:12,fontWeight:900,letterSpacing:3,color:C.accent,marginBottom:16}}>{"\u6a19\u7c64\u7ba1\u7406"}</div>

          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:8,textTransform:"uppercase"}}>{"\u9810\u8a2d\u6a19\u7c64"}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {DEFAULT_TAGS.map(function(t){return <span key={t} style={{display:"inline-block",padding:"3px 12px",borderRadius:10,fontSize:11,fontWeight:700,border:"1px solid #1e1e2e",color:C.muted,letterSpacing:1}}>{t}</span>;})}
            </div>
          </div>

          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:8,textTransform:"uppercase"}}>{"\u81ea\u8a02\u6a19\u7c64"}</div>
            {customTags.length===0 && <div style={{color:C.muted,fontSize:12,marginBottom:8}}>{"\u5c1a\u7121\u81ea\u8a02\u6a19\u7c64"}</div>}
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
              {customTags.map(function(t){
                return <TagPill key={t} label={t} active={false} onDelete={function(){deleteCustomTag(t);}} />;
              })}
            </div>
            <div style={{display:"flex",gap:8}}>
              <input style={Object.assign({},inp,{flex:1,padding:"8px 12px",fontSize:13})} value={newTagInput} onChange={function(e){setNewTagInput(e.target.value);}} onKeyDown={function(e){if(e.key==="Enter") addCustomTag();}} placeholder={"\u8f38\u5165\u65b0\u6a19\u7c64\u540d\u7a31\u2026"} />
              <button style={Object.assign({},btnP,{flex:"none",padding:"8px 16px",fontSize:12})} onClick={addCustomTag}>+ {"\u65b0\u589e"}</button>
            </div>
          </div>

          <div style={{borderTop:"1px solid #1e1e2e",paddingTop:16}}>
            <div style={{fontSize:11,color:C.muted,letterSpacing:2,marginBottom:8,textTransform:"uppercase"}}>{"\u6240\u6709\u6a19\u7c64\u9810\u89bd"}</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {allTags.map(function(t){return <TagPill key={t} label={t} active={filterTags.includes(t)} onClick={function(){setFilterTags(function(prev){return prev.includes(t)?prev.filter(function(x){return x!==t;}):prev.concat([t]);});setView("main");}} />;})}
            </div>
            {filterTags.length>0 && <div style={{marginTop:8,fontSize:11,color:C.accent}}>{"* \u9ede\u9078\u6a19\u7c64\u53ef\u76f4\u63a5\u7b2c\u4e00\u9801\u7b5b\u9078"}</div>}
          </div>
        </div>
      )}

      {/* MAIN */}
      {view==="main" && (
        <>
          {/* TOOLBAR */}
          <div style={{padding:"10px 16px",display:"flex",gap:8,borderBottom:"1px solid #1e1e2e",background:"#111118",flexWrap:"wrap"}}>
            <input style={Object.assign({},inp,{flex:1,minWidth:120})} placeholder={"\u641c\u5c0b\u8eca\u540d\u3001\u5ee0\u724c\u2026"} value={search} onChange={function(e){setSearch(e.target.value);}} />
            <select style={Object.assign({},inp,{width:"auto",minWidth:90})} value={filterG} onChange={function(e){setFilterG(e.target.value);}}>
              <option>{"\u5168\u90e8"}</option>
              {orderedGarages.map(function(g){return <option key={g}>{g}</option>;})}
            </select>
            <button style={Object.assign({},btnG,{padding:"8px 10px",fontSize:11,whiteSpace:"nowrap",color:duplicates.length>0?C.red:C.muted,borderColor:duplicates.length>0?"rgba(230,57,70,0.4)":C.border})} onClick={function(){setModal("dupes");}}>
              {"\u91cd\u8907"}{duplicates.length>0&&<span style={{background:C.red,color:"#fff",borderRadius:10,padding:"0 5px",fontSize:10,marginLeft:4}}>{duplicates.length}</span>}
            </button>
            <button style={Object.assign({},btnG,{padding:"8px 10px",fontSize:11,whiteSpace:"nowrap",color:batchMode?C.accent:C.muted,borderColor:batchMode?C.accent:C.border})} onClick={function(){setBatchMode(function(b){return !b;});setBatchSel([]);}}>
              {batchMode?("\u5df2\u9078 "+batchSel.length):"\u6279\u6b21"}
            </button>
            <button style={Object.assign({},btnG,{padding:"8px 10px",fontSize:11,whiteSpace:"nowrap"})} onClick={function(){setModal("garage");}}>+ {"\u8eca\u5eab"}</button>
          </div>

          {/* TAG FILTER BAR */}
          {allTags.length>0&&(
            <div style={{padding:"8px 16px",display:"flex",gap:6,flexWrap:"wrap",borderBottom:"1px solid #1e1e2e",background:"#0d0d14",alignItems:"center"}}>
              {allTags.map(function(tag){
                var active=filterTags.includes(tag);
                return <TagPill key={tag} label={tag} active={active} onClick={function(){setFilterTags(function(prev){return active?prev.filter(function(t){return t!==tag;}):prev.concat([tag]);});}} />;
              })}
              {filterTags.length>0&&<span onClick={function(){setFilterTags([]);}} style={{fontSize:11,color:C.muted,cursor:"pointer",padding:"2px 8px"}}>{"\u6e05\u9664"}</span>}
              <span onClick={function(){setView("tags");}} style={{fontSize:10,color:C.muted,cursor:"pointer",padding:"2px 8px",marginLeft:"auto",letterSpacing:1,borderLeft:"1px solid #1e1e2e",paddingLeft:10}}>{"\u7de8\u8f2f\u6a19\u7c64"}</span>
            </div>
          )}

          {/* STATS ROW */}
          <div style={{display:"flex",borderBottom:"1px solid #1e1e2e"}}>
            {[{label:"\u8eca\u8f1b",val:vehicles.length},{label:"\u8eca\u5eab",val:orderedGarages.length},{label:"\u986f\u793a",val:filtered.length}].map(function(s){
              return <div key={s.label} style={{flex:1,padding:"8px 0",textAlign:"center",borderRight:"1px solid #1e1e2e"}}>
                <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:18,fontWeight:900,color:"#f5c400"}}>{s.val}</div>
                <div style={{fontSize:10,color:"#6b6b85",letterSpacing:2}}>{s.label}</div>
              </div>;
            })}
          </div>

          {/* BATCH BAR */}
          {batchMode&&batchSel.length>0&&(
            <div style={{padding:"10px 16px",background:"#1a1a10",borderBottom:"1px solid "+C.accentD,display:"flex",gap:8,alignItems:"center"}}>
              <span style={{fontSize:12,color:C.accent,flex:1,fontWeight:700}}>{"\u5df2\u9078 "+batchSel.length+" \u8f1b"}</span>
              <select style={Object.assign({},inp,{width:"auto",minWidth:120,fontSize:12,padding:"6px 10px"})} value={batchTarget} onChange={function(e){setBatchTarget(e.target.value);}}>
                <option value="">{"\u9078\u64c7\u76ee\u6a19\u8eca\u5eab"}</option>
                {orderedGarages.map(function(g){var u=vehicles.filter(function(v){return v["\u8eca\u5eab"]===g;}).length;return <option key={g} value={g}>{g} ({u}/{garages[g]})</option>;})}
              </select>
              <button style={Object.assign({},btnP,{flex:"none",padding:"7px 14px",fontSize:12})} onClick={doBatchMove}>{"\u79fb\u52d5"}</button>
              <button style={Object.assign({},btnG,{padding:"7px 10px",fontSize:11})} onClick={function(){setBatchSel([]);setBatchMode(false);}}>{"\u53d6\u6d88"}</button>
            </div>
          )}

          {/* GARAGE LIST */}
          <div style={{padding:"12px 16px",paddingBottom:100}}>
            {loading&&<div style={{textAlign:"center",color:"#6b6b85",padding:40}}>{"\u8f09\u5165\u4e2d\u2026"}</div>}
            {!loading&&displayGarages.length===0&&(
              <div style={{textAlign:"center",color:"#6b6b85",padding:40}}>
                <div style={{fontSize:32,marginBottom:12}}>?</div>
                <div>{search||filterTags.length>0?"\u6c92\u6709\u7b26\u5408\u641c\u5c0b\u7684\u8eca\u8f1b":"\u5c1a\u7121\u8eca\u5eab"}</div>
              </div>
            )}

            {displayGarages.map(function(garage){
              var cars=byGarage(garage);
              var cap=garages[garage]||10;
              var used=vehicles.filter(function(v){return v["\u8eca\u5eab"]===garage;}).length;
              var empty=Math.max(0,cap-used);
              var isCollapsed=!!collapsed[garage];

              return (
                <div key={garage}
                  draggable
                  onDragStart={function(e){onDragStart(e,garage);}}
                  onDragOver={function(e){onDragOver(e,garage);}}
                  onDragLeave={onDragLeave}
                  onDrop={function(e){onDrop(e,garage);}}
                  style={{marginBottom:10,border:"1px solid #1e1e2e",borderRadius:8,overflow:"hidden",transition:"border .2s"}}
                >
                  {/* GARAGE HEADER — tap to collapse */}
                  <div
                    onClick={function(){toggleCollapse(garage);}}
                    style={{padding:"10px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",background:"#0f0f18",userSelect:"none"}}
                  >
                    <span style={{color:C.muted,fontSize:12,cursor:"grab",flexShrink:0}} onMouseDown={function(e){e.stopPropagation();}}>{":::"}</span>
                    <div style={{fontFamily:"'Orbitron',sans-serif",fontSize:12,fontWeight:900,letterSpacing:2,color:"#f5c400",textTransform:"uppercase",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{garage}</div>
                    <span style={{fontSize:11,color:used>=cap?C.red:C.muted,fontWeight:700,flexShrink:0}}>{used}/{cap}</span>
                    <button
                      style={{background:"none",border:"1px solid #1e1e2e",color:C.muted,fontSize:10,padding:"2px 7px",borderRadius:3,cursor:"pointer",flexShrink:0}}
                      onClick={function(e){e.stopPropagation();setEditCapGarage(garage);setEditCapVal(cap);}}
                    >{"\u5bb9\u91cf"}</button>
                    <span style={{color:C.muted,fontSize:14,flexShrink:0,transform:isCollapsed?"rotate(-90deg)":"rotate(0deg)",transition:"transform .2s",display:"inline-block"}}>{"v"}</span>
                  </div>

                  {/* GARAGE BODY */}
                  {!isCollapsed&&(
                    <div style={{padding:"0 12px 12px"}}>
                      <div style={{paddingTop:10}}>
                        <CapBar used={used} cap={cap} />
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:5}}>
                        {cars.map(function(v,i){
                          var vTags=(v["\u6a19\u7c64"]||"").split(",").map(function(t){return t.trim();}).filter(Boolean);
                          var isSel=batchSel.includes(v.id);
                          return (
                            <div key={v.id} onClick={batchMode?function(){toggleBatch(v.id);}:undefined}
                              style={{background:isSel?"#1a1a10":"#111118",border:"1px solid "+(isSel?C.accent:"#1e1e2e"),borderRadius:6,padding:"9px 10px",display:"flex",alignItems:"center",gap:8,cursor:batchMode?"pointer":"default"}}>
                              {batchMode&&<div style={{width:16,height:16,borderRadius:3,border:"1px solid "+(isSel?C.accent:C.muted),background:isSel?C.accent:"transparent",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center"}}>{isSel&&<span style={{color:"#000",fontSize:10,fontWeight:900}}>v</span>}</div>}
                              <div style={{color:"#6b6b85",fontSize:11,width:18,textAlign:"center",flexShrink:0}}>{i+1}</div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{fontWeight:700,fontSize:14,color:"#ddddf0",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v["\u8eca\u540d"]}</div>
                                <div style={{display:"flex",gap:4,marginTop:3,flexWrap:"wrap"}}>
                                  {v["\u5ee0\u724c"]&&<span style={{background:"#1a1a28",border:"1px solid #1e1e2e",padding:"1px 6px",borderRadius:2,fontSize:10,color:C.muted}}>{v["\u5ee0\u724c"]}</span>}
                                  {vTags.map(function(t){return <span key={t} style={{background:C.accent+"18",border:"1px solid "+C.accent+"44",padding:"1px 6px",borderRadius:10,fontSize:10,color:C.accent}}>{t}</span>;})}
                                </div>
                              </div>
                              {!batchMode&&(
                                <div style={{display:"flex",gap:4,flexShrink:0}}>
                                  <button style={Object.assign({},btnG,{padding:"4px 8px",fontSize:10})} onClick={function(){setSelected(v);setForm({"\u5ee0\u724c":v["\u5ee0\u724c"],"\u8eca\u540d":v["\u8eca\u540d"],"\u6a19\u7c64":v["\u6a19\u7c64"]});setFormTags((v["\u6a19\u7c64"]||"").split(",").map(function(t){return t.trim();}).filter(Boolean));setModal("edit");}}>{"\u7de8\u8f2f"}</button>
                                  <button style={Object.assign({},btnG,{padding:"4px 8px",fontSize:10})} onClick={function(){setSelected(v);setMoveTarget("");setModal("move");}}>{"\u79fb\u52d5"}</button>
                                  <button style={Object.assign({},btnG,{padding:"4px 8px",fontSize:10,color:C.red,borderColor:"rgba(230,57,70,0.27)"})} onClick={function(){deleteVehicle(v.id);}}>X</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        {Array.from({length:empty}).map(function(_,i){
                          return <div key={"e"+i} style={{border:"1px dashed #1e1e2e",borderRadius:6,padding:"9px 10px",display:"flex",alignItems:"center",gap:8,opacity:0.3}}>
                            <div style={{color:C.muted,fontSize:11,width:18,textAlign:"center"}}>{used+i+1}</div>
                            <div style={{fontSize:12,color:C.muted}}>{"\u7a7a\u8eca\u4f4d"}</div>
                          </div>;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* MODALS */}

      {modal==="add"&&(
        <Modal title={"\u65b0\u589e\u8eca\u8f1b"} onClose={function(){setModal(null);}}>
          {[["\u8eca\u5eab",true],["\u5ee0\u724c",false],["\u8eca\u540d",false]].map(function(pair){
            var field=pair[0],isSel=pair[1];
            return <div key={field} style={{marginBottom:14}}>
              <label style={lbl}>{field}</label>
              {isSel?(
                <select style={inp} value={form[field]} onChange={function(e){setForm(function(f){var n=Object.assign({},f);n[field]=e.target.value;return n;});}}>
                  <option value="">{"\u2014 \u9078\u64c7\u8eca\u5eab \u2014"}</option>
                  {orderedGarages.map(function(g){var u=vehicles.filter(function(v){return v["\u8eca\u5eab"]===g;}).length;return <option key={g} value={g}>{g} ({u}/{garages[g]})</option>;})}
                </select>
              ):(
                <input style={inp} value={form[field]} onChange={function(e){setForm(function(f){var n=Object.assign({},f);n[field]=e.target.value;return n;});}} placeholder={field==="\u8eca\u540d"?"\u5fc5\u586b":"\u9078\u586b"} />
              )}
            </div>;
          })}
          <div style={{marginBottom:16}}>
            <label style={lbl}>{"\u6a19\u7c64"}</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {allTags.map(function(tag){var active=formTags.includes(tag);return <TagPill key={tag} label={tag} active={active} onClick={function(){setFormTags(function(prev){return active?prev.filter(function(t){return t!==tag;}):prev.concat([tag]);});}} />;  })}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button style={btnP} onClick={addVehicle}>{"\u78ba\u8a8d\u65b0\u589e"}</button>
            <button style={btnG} onClick={function(){setModal(null);}}>{"\u53d6\u6d88"}</button>
          </div>
        </Modal>
      )}

      {modal==="edit"&&selected&&(
        <Modal title={"\u7de8\u8f2f\u8eca\u8f1b"} onClose={function(){setModal(null);}}>
          {["\u5ee0\u724c","\u8eca\u540d"].map(function(field){
            return <div key={field} style={{marginBottom:14}}>
              <label style={lbl}>{field}</label>
              <input style={inp} value={form[field]} onChange={function(e){setForm(function(f){var n=Object.assign({},f);n[field]=e.target.value;return n;});}} />
            </div>;
          })}
          <div style={{marginBottom:16}}>
            <label style={lbl}>{"\u6a19\u7c64"}</label>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {allTags.map(function(tag){var active=formTags.includes(tag);return <TagPill key={tag} label={tag} active={active} onClick={function(){setFormTags(function(prev){return active?prev.filter(function(t){return t!==tag;}):prev.concat([tag]);});}} />;  })}
            </div>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button style={btnP} onClick={saveEdit}>{"\u5132\u5b58"}</button>
            <button style={btnG} onClick={function(){setModal(null);}}>{"\u53d6\u6d88"}</button>
          </div>
        </Modal>
      )}

      {modal==="move"&&selected&&(
        <Modal title={"\u79fb\u52d5\u8eca\u8f1b"} onClose={function(){setModal(null);}}>
          <div style={{marginBottom:16,padding:"10px 12px",background:"#16161f",borderRadius:4,fontSize:13}}>
            <span style={{color:"#f5c400",fontWeight:700}}>{selected["\u8eca\u540d"]}</span>
            <span style={{color:C.muted}}> {"\u30fb \u76ee\u524d\u5728"} {selected["\u8eca\u5eab"]}</span>
          </div>
          <div style={{marginBottom:16}}>
            <label style={lbl}>{"\u76ee\u6a19\u8eca\u5eab"}</label>
            <select style={inp} value={moveTarget} onChange={function(e){setMoveTarget(e.target.value);}}>
              <option value="">{"\u2014 \u9078\u64c7\u76ee\u6a19 \u2014"}</option>
              {orderedGarages.filter(function(g){return g!==selected["\u8eca\u5eab"];}).map(function(g){var u=vehicles.filter(function(v){return v["\u8eca\u5eab"]===g;}).length;var full=u>=(garages[g]||10);return <option key={g} value={g} disabled={full}>{g} ({u}/{garages[g]}){full?" X \u5df2\u6eff":""}</option>;})}
            </select>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button style={btnP} onClick={moveVehicle}>{"\u78ba\u8a8d\u79fb\u52d5"}</button>
            <button style={btnG} onClick={function(){setModal(null);}}>{"\u53d6\u6d88"}</button>
          </div>
        </Modal>
      )}

      {modal==="garage"&&(
        <Modal title={"\u65b0\u589e\u8eca\u5eab"} onClose={function(){setModal(null);}}>
          <div style={{marginBottom:14}}>
            <label style={lbl}>{"\u8eca\u5eab\u540d\u7a31"}</label>
            <input style={inp} value={newG.name} onChange={function(e){setNewG(function(g){return Object.assign({},g,{name:e.target.value});});}} />
          </div>
          <div style={{marginBottom:16}}>
            <label style={lbl}>{"\u5bb9\u91cf"}</label>
            <input type="number" min={1} max={40} style={inp} value={newG.cap} onChange={function(e){setNewG(function(g){return Object.assign({},g,{cap:Number(e.target.value)});});}} />
          </div>
          <div style={{display:"flex",gap:8}}>
            <button style={btnP} onClick={addGarage}>{"\u78ba\u8a8d\u65b0\u589e"}</button>
            <button style={btnG} onClick={function(){setModal(null);}}>{"\u53d6\u6d88"}</button>
          </div>
        </Modal>
      )}

      {editCapGarage&&(
        <Modal title={"\u7de8\u8f2f\u5bb9\u91cf"} onClose={function(){setEditCapGarage(null);}}>
          <div style={{marginBottom:8,color:C.accent,fontWeight:700,fontSize:13}}>{editCapGarage}</div>
          <div style={{marginBottom:16}}>
            <label style={lbl}>{"\u65b0\u5bb9\u91cf"}</label>
            <input type="number" min={1} max={40} style={inp} value={editCapVal} onChange={function(e){setEditCapVal(Number(e.target.value));}} />
          </div>
          <div style={{display:"flex",gap:8}}>
            <button style={btnP} onClick={saveCapacity}>{"\u5132\u5b58"}</button>
            <button style={btnG} onClick={function(){setEditCapGarage(null);}}>{"\u53d6\u6d88"}</button>
          </div>
        </Modal>
      )}

      {modal==="dupes"&&(
        <Modal title={"\u91cd\u8907\u8eca\u8f1b ("+duplicates.length+")"} onClose={function(){setModal(null);}}>
          {duplicates.length===0?(
            <div style={{color:C.muted,textAlign:"center",padding:"20px 0"}}>{"\u6c92\u6709\u91cd\u8907\u8eca\u8f1b"}</div>
          ):(
            <div style={{maxHeight:"60vh",overflowY:"auto",display:"flex",flexDirection:"column",gap:16}}>
              {duplicates.map(function(entry){
                var name=entry[0],arr=entry[1];
                return <div key={name}>
                  <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
                    {name}<span style={{background:"rgba(230,57,70,0.13)",color:C.red,border:"1px solid rgba(230,57,70,0.27)",borderRadius:10,padding:"1px 8px",fontSize:10}}>x{arr.length}</span>
                  </div>
                  {arr.map(function(v){return <div key={v.id} style={{background:"#16161f",border:"1px solid #1e1e2e",borderRadius:4,padding:"8px 10px",marginBottom:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12,color:C.text}}>{v["\u8eca\u5eab"]}</span>
                    <div style={{display:"flex",gap:5}}>
                      <button style={Object.assign({},btnG,{padding:"4px 8px",fontSize:10})} onClick={function(){setSelected(v);setMoveTarget("");setModal("move");}}>{"\u79fb\u52d5"}</button>
                      <button style={Object.assign({},btnG,{padding:"4px 8px",fontSize:10,color:C.red,borderColor:"rgba(230,57,70,0.27)"})} onClick={function(){deleteVehicle(v.id);}}>{"\u522a\u9664"}</button>
                    </div>
                  </div>;})}
                </div>;
              })}
            </div>
          )}
        </Modal>
      )}

      <Toast toast={toast} />
    </>
  );
}
