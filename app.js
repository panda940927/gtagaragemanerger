let cars = [];
let nameCount = {};

fetch("cars.csv")
  .then(res => res.text())
  .then(text => {
    const rows = text.trim().split("\n");
    const headers = rows.shift().split(",");

    cars = rows.map(r => {
      const v = r.split(",");
      let o = {};
      headers.forEach((h, i) => o[h] = v[i]);
      return o;
    });

    countDuplicates();
    initFilters();
    render(cars);
  });

function countDuplicates() {
  nameCount = {};
  cars.forEach(c => {
    nameCount[c["車名"]] = (nameCount[c["車名"]] || 0) + 1;
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

function filter() {
  const kw = document.getElementById("searchInput").value.toLowerCase();
  const g = garageFilter.value;
  const t = typeFilter.value;
  const b = brandFilter.value;

  const result = cars.filter(c =>
    c["車名"].toLowerCase().includes(kw) &&
    (!g || c["車庫"] === g) &&
    (!t || c["車型"] === t) &&
    (!b || c["廠牌"] === b)
  );

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