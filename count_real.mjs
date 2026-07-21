import pkg from 'xlsx';
const { readFile, utils } = pkg;
const wb = readFile('../cama.xlsx', { sheets: ['1520'] });
const ws = wb.Sheets['1520'];
const rows = utils.sheet_to_json(ws, { header: 1, defval: null });
let real = 0;
for (let i = 2; i < rows.length; i++) {
  const r = rows[i];
  if (!r) continue;
  if (r[9] && String(r[9]).trim()) real++;
}
console.log('Filas reales con SERIE:', real);
console.log('Partidas únicas:', new Set(rows.slice(2).filter(r=>r && r[6]).map(r=>String(r[6]))).size);
