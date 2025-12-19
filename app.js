let cars = [];
let nameCount = {};
let carNames = {};

fetch("cars.csv")
  .then(res => res.text())
  .then(text => {
    const rows = text.trim().split("\n");
    const headers = rows
      .shift()
      .replace(/\uFEFF/g, "")
      .replace(/\r/g, "")
      .split(",")
      .map(h => h.trim());

    cars = rows.map(r => {
      const v = r.replace(/\r/g, "").split(",");
      let o = {};
      headers.forEach((h, i) => o[h] = (v[i] ?? "").trim());
      return o;
    });

    countDuplicates();
    initAutocomplete();
    initFilters();
    render(cars);
  });

function countDuplicates() {
  nameCount = {};
  cars.forEach(c => {
    nameCount[c["車名"]] = (nameCount[c["車名"]] || 0) + 1;
  });
}

function initAutocomplete() {
  carNames = [...new Set(cars.map(c => c["車名"]).filter(n => n))];
  const input = document.getElementById("searchInput");
  const list = document.getElementById("autocompleteList");

  input.addEventListener("input", () => {
    const value = input.value.toLowerCase();
    list.innerHTML = "";
    if (!value) return;

    carNames
      .filter(name => name.toLowerCase().includes(value))
      .slice(0, 5)
      .forEach(name => {
        const item = document.createElement("div");
        item.textContent = name;
        item.onclick = () => {
          input.value = name;
          list.innerHTML = "";
          filter();
        };
        list.appendChild(item);
      });
  });
}

function initFilters() {
  fillSelect("garageFilter", "車庫");
  fillSelect("typeFilter", "車型");
  fillSelect("brandFilter", "廠牌");
}

function fillSelect(id, key) {
  const select = document.getElementById(id);
  [...new Set(cars.map(c => c[key]))].forEach(v => {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  });
}

document.getElementById("searchInput").addEventListener("input", filter);
document.getElementById("garageFilter").addEventListener("change", filter);
document.getElementById("typeFilter").addEventListener("change", filter);
document.getElementById("brandFilter").addEventListener("change", filter);
document.getElementById("mergeToggle").addEventListener("change", filter);

function filter() {
  const kw = document.getElementById("searchInput").value.toLowerCase();
  const g = garageFilter.value;
  const t = typeFilter.value;
  const b = brandFilter.value;
  const merge = document.getElementById("mergeToggle").checked;

  // 依條件過濾（不改原始順序）
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

  // 只取重複車名
  const duplicatedNames = new Set(
    Object.keys(nameCount).filter(name => nameCount[name] > 1)
  );

  // 依「第一次出現順序」建立群組
  const groups = {};
  const order = [];

  filtered.forEach(c => {
    const name = c["車名"];
    if (!duplicatedNames.has(name)) return;

    if (!groups[name]) {
      groups[name] = [];
      order.push(name);
    }
    groups[name].push(c);
  });

  // 依群組順序攤平成列表（同名一定排在一起）
  const result = [];
  order.forEach(name => {
    groups[name].forEach(c => result.push(c));
  });

  render(result);
}

function render(list) {
  const tbody = document.querySelector("#resultTable tbody");
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = "<tr><td colspan='5'>找不到</td></tr>";
    return;
  }

  list.forEach(c => {
    const tr = document.createElement("tr");
    if (nameCount[c["車名"]] > 1) tr.classList.add("duplicate");

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
