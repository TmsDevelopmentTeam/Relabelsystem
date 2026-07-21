import pkg from 'xlsx';
const { readFile, utils } = pkg;
const wb = readFile('../cama.xlsx', { sheets: ['1520'] });
const ws = wb.Sheets['1520'];
const rows = utils.sheet_to_json(ws, { header: 1, defval: null });
console.log('rows total:', rows.length);
for (let i = 0; i < 5; i++) console.log('Row', i, ':', JSON.stringify(rows[i]));
console.log('...');
console.log('Last row:', JSON.stringify(rows[rows.length - 1]));
