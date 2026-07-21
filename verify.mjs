import pkg from 'xlsx';
const { readFile, utils } = pkg;
const files = ['1520_D', '1530_L', '1700_D', '_All_D'];
for (const f of files) {
  const wb = readFile(`../split_excel/${f}.xlsx`);
  const sn = wb.SheetNames[0];
  const rows = utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: null });
  // Buscar header dinámicamente
  let hdrIdx = -1, iSerie = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    if (!rows[i]) continue;
    const low = rows[i].map(c => String(c ?? '').toLowerCase().trim());
    if (low.includes('serie')) { hdrIdx = i; iSerie = low.indexOf('serie'); break; }
  }
  let cnt = 0;
  if (hdrIdx >= 0) {
    for (let i = hdrIdx + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      if (r[iSerie] && String(r[iSerie]).trim()) cnt++;
    }
  }
  console.log(`  ${f}: header en row ${hdrIdx}, Serie en col ${iSerie}, rows con data = ${cnt}`);
}
