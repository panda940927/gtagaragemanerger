const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/1ngihsglCAWUUFCVOSJZSt3P4Pscxrr2q/pub?output=csv";

fetch(SHEET_CSV_URL)
  .then(res => {
    if (!res.ok) throw new Error("CSV 載入失敗");
    return res.text();
  })
  .then(text => {
    if (!text || text.length < 10) {
      throw new Error("CSV 內容為空");
    }

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
      headers.forEach((h, i) => {
        o[h] = (v[i] ?? "").trim();
      });
      return o;
    });

    countDuplicates();
    initAutocomplete();
    initFilters();
    render(cars);
  })
  .catch(err => {
    console.error("❌ 讀取 Google Sheets 失敗", err);
    const tbody = document.querySelector("#resultTable tbody");
    const countDiv = document.getElementById("resultCount");
    countDiv.textContent = "❌ 無法載入資料（請確認 Google Sheets 已發佈）";
    tbody.innerHTML =
      "<tr><td colspan='5'>資料載入失敗，請稍後再試</td></tr>";
  });