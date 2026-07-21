import pkg from 'xlsx';
const { readFile } = pkg;
console.log('reading...');
const wb = readFile('../cama.xlsx', { sheetRows: 5 });
console.log('SHEETS:', wb.SheetNames);
