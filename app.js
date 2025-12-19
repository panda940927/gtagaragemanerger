let cars = [];
let nameCount = {};
let carNames = [];

/* =====================
   讀取 Google Sheets CSV
   ===================== */
fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vRLMSXEUjhen7SnHhiGSbKut1T4wmULYu7EuwKw3H6zkFQ6Z79u1MH8qscf6p0LwQ/pub?output=csv")
  .then(res => {
    if (!res.ok) throw new Error("CSV 載入失敗");
    return res.text();
  })
  .then(text => {
    const rows = text.trim().split("\n");

    const headers = rows
      .shift()
      .replace(/\uFEFF/g, "")
      .replace(/\r/g, "")
      .split(",")
      .map(h => h.trim());

    cars = rows.map(r => {
      const values = r.replace(/\r/g, "").split(",");
      let obj = {};
      headers.forEach((h, i) => {
        obj[h] = (values[i] ?? "").trim();
      });
      return obj;
    });

    countDuplicates();
    initAutocomplete();
    initFilters();
    render(cars);
  })
  .catch(err => {
    console.error(err);
    document.getElementById("resultCount").textContent =
      "❌ 無法載入 Google Sheets";
  });

/* =====================
   計算重複車名
   ===================== */
function countDuplicates() {
  nameCount = {};
  cars.forEach(c => {
    const name = c["車名"];
    if (!name) return;
    nameCount[name] = (nameCount[name] || 0) + 1;
  });
}

/* =====================
   AutoComplete（車名）
   ===================== */
function initAutocomplete() {
  carNames = [...new Set(cars.map(c => c["車名"]).filter(Boolean))];

  const input = document.getElementById("searchInput");
  const list = document.getElementById("autocompleteList");

  input.addEventListener("input", () => {
    const kw = input.value.toLowerCase();
    list.innerHTML = "";
    if (!kw) return;

    carNames
      .filter(name => name.toLowerCase().includes(kw))
      .slice(0, 5)
      .forEach(name => {
        const div = document.createElement("div");
        div.textContent = name;
        div.onclick = () => {
          input.value = name;
          list.innerHTML = "";
          filter();
        };
        list.appendChild(div);
      });
  });
}

/* =====================
   初始化下拉選單
   ===================== */
function initFilters() {
  fillSelect("garageFilter", "車庫");
  fillSelect("typeFilter", "車型");
  fillSelect("brandFilter", "廠牌");
}

function fillSelect(id, key) {
  const select = document.getElementById(id);
  const values = [...new Set(cars.map(c => c[key]).filter(Boolean))];

  values.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

/* =====================
   事件監聽
   ===================== */
document.getElementById("searchInput").addEventListener("input", filter);
document.getElementById("garageFilter").addEventListener("change", filter);
document.getElementById("typeFilter").addEventListener("change", filter);
document.getElementById("brandFilter").addEventListener("change", filter);
document.getElementById("mergeToggle").addEventListener("change", filter);

/* =====================
   篩選邏輯
   ===================== */
function filter() {
  const kw = document.getElementById("searchInput").value.toLowerCase();
  const g = garageFilter.value;
  const t = typeFilter.value;
  const b = brandFilter.value;
  const merge = document.getElementById("mergeToggle").checked;

  let filtered = cars.filter(c =>
    (c["車名"] || "").toLowerCase().includes(kw) &&
    (!g || c["車庫"] === g) &&
    (!t || c["車型"] === t) &&
    (!b || c["廠牌"] === b)
  );

  if (!merge) {
    render(filtered);
    return;
  }

  /* 合併同名（依原始順序） */
  const duplicated = new Set(
    Object.keys(nameCount).filter(n => nameCount[n] > 1)
  );

  const groups = {};
  const order = [];

  filtered.forEach(c => {
    const name = c["車名"];
    if (!duplicated.has(name)) return;

    if (!groups[name]) {
      groups[name] = [];
      order.push(name);
    }
    groups[name].push(c);
  });

  const result = [];
  order.forEach(name => {
    groups[name].forEach(c => result.push(c));
  });

  render(result);
}

/* =====================
   畫面渲染
   ===================== */
function render(list) {
  const tbody = document.querySelector("#resultTable tbody");
  const countDiv = document.getElementById("resultCount");

  tbody.innerHTML = "";
  countDiv.textContent = `搜尋結果：${list.length} 筆`;

  if (list.length === 0) {
    tbody.innerHTML = "<tr><td colspan='5'>找不到資料</td></tr>";
    return;
  }

  list.forEach(c => {
    const tr = document.createElement("tr");

    if (nameCount[c["車名"]] > 1) {
      tr.classList.add("duplicate");
    }

    tr.innerHTML = `
      <td>${c["車庫"]}</td>
      <td>${c["車型"]}</td>
      <td>${c["廠牌"]}</td>
      <td>${c["車名"]}</td>
      <td>${nameCount[c["車名"]] > 1 ? "重複" : ""}</td>
    `;
    tbody.appendChild(tr);
  });
}