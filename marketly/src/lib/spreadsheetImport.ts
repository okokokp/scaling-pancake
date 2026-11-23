import { readSheet } from 'read-excel-file/browser';
import writeXlsxFile, { type Column } from 'write-excel-file/browser';
import type { AvailabilityStatus } from '../../shared/types.ts';

export interface ParsedProductImportRow {
  rowIndex: number;
  name: string;
  brand: string;
  category: string;
  price: number;
  stockQuantity: number | null;
  availabilityStatus: AvailabilityStatus;
  description: string;
  imageKey: string;
  imageUrl: string | null;
  error?: string;
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',' || ch === ';') {
      row.push(field.trim());
      field = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(field.trim());
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field.trim());
  if (row.some((c) => c.length > 0)) rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function inferImageKey(name: string, category: string): string {
  const text = `${name} ${category}`.toLowerCase();
  if (text.includes('rtx') || text.includes('gtx') || text.includes('radeon') || text.includes('gpu')) return 'gpu';
  if (text.includes('ryzen') || text.includes('intel') || text.includes('core i') || text.includes('cpu')) return 'cpu';
  if (text.includes('nvme') || text.includes('ssd') || text.includes('m.2')) return 'ssd';
  if (text.includes('ddr') || text.includes('ram') || text.includes('memory')) return 'ram';
  if (text.includes('iphone') || text.includes('apple')) return 'phone';
  if (text.includes('galaxy') || text.includes('xiaomi') || text.includes('pixel') || text.includes('phone')) return 'phone-android';
  if (text.includes('earbud') || text.includes('airpod') || text.includes('head')) return 'earbuds';
  if (text.includes('gan') || text.includes('charg') || text.includes('adapter')) return 'charger';
  if (text.includes('power bank') || text.includes('powerbank') || text.includes('mah')) return 'powerbank';
  if (text.includes('case') || text.includes('glass') || text.includes('magsafe')) return 'case';
  if (text.includes('keyboard')) return 'keyboard';
  if (text.includes('mouse')) return 'mouse';
  if (text.includes('monitor') || text.includes('display') || text.includes('hz')) return 'monitor';
  if (text.includes('psu') || text.includes('watt') || text.includes('80+')) return 'psu';
  if (text.includes('cooler') || text.includes('fan') || text.includes('paste')) return 'cooler';
  if (text.includes('router') || text.includes('wifi') || text.includes('cat6')) return 'router';
  return 'gpu';
}

function normalizeAvailability(raw: string): AvailabilityStatus {
  const s = raw.toLowerCase().trim();
  if (s.includes('out') || s === '0' || s === 'no' || s === 'rupture') return 'out_of_stock';
  if (s.includes('unconfirm')) return 'unconfirmed';
  return 'in_stock';
}

export function mapMatrixToImportRows(matrix: string[][]): ParsedProductImportRow[] {
  if (matrix.length === 0) return [];

  const firstRow = matrix[0].map((c) => normalizeHeader(String(c || '')));
  const looksLikeHeader =
    firstRow.some((h) => h.includes('name') || h.includes('product') || h.includes('title')) &&
    firstRow.some((h) => h.includes('price') || h.includes('dzd'));

  const headers = looksLikeHeader
    ? firstRow
    : ['name', 'brand', 'category', 'price', 'stock', 'availability', 'description', 'photourl'];
  const dataRows = looksLikeHeader ? matrix.slice(1) : matrix;

  const findCol = (candidates: string[], fallbackIdx: number) => {
    const idx = headers.findIndex((h) => candidates.some((c) => h.includes(c)));
    return idx >= 0 ? idx : fallbackIdx;
  };

  const nameIdx = findCol(['productname', 'name', 'title', 'item'], 0);
  const brandIdx = findCol(['brand', 'maker', 'manufacturer'], 1);
  const catIdx = findCol(['category', 'cat', 'type'], 2);
  const priceIdx = findCol(['price', 'dzd', 'cost'], 3);
  const stockIdx = findCol(['stock', 'qty', 'quantity'], 4);
  const availIdx = findCol(['avail', 'status'], 5);
  const descIdx = findCol(['desc', 'spec', 'note'], 6);
  const photoIdx = findCol(['photo', 'imageurl', 'image', 'img', 'url'], 7);

  return dataRows
    .map((cells, idx) => {
      const get = (col: number) => String(cells[col] ?? '').trim();
      const name = get(nameIdx);
      const brand = get(brandIdx) || 'Generic';
      const category = get(catIdx) || 'PC Parts & GPUs';
      const rawPrice = get(priceIdx).replace(/[^0-9.]/g, '');
      const price = Math.round(Number(rawPrice));
      const rawStock = get(stockIdx).replace(/[^0-9]/g, '');
      const stockQuantity = rawStock.length > 0 ? Number(rawStock) : null;
      const availabilityStatus = normalizeAvailability(get(availIdx) || (stockQuantity === 0 ? 'out' : 'in_stock'));
      const description = get(descIdx) || `${brand} ${name}`;
      const rawPhoto = get(photoIdx);
      const imageUrl = rawPhoto.startsWith('https://') || rawPhoto.startsWith('/uploads/') ? rawPhoto : null;

      let error: string | undefined;
      if (!name || name.length < 2) error = 'Missing product name';
      else if (!Number.isFinite(price) || price < 1) error = 'Invalid DZD price';
      else if (rawPhoto && !imageUrl) error = 'Photo URL must start with https://';

      return {
        rowIndex: idx + (looksLikeHeader ? 2 : 1),
        name,
        brand,
        category,
        price: Number.isFinite(price) && price > 0 ? price : 0,
        stockQuantity,
        availabilityStatus,
        description,
        imageKey: inferImageKey(name, category),
        imageUrl,
        error,
      };
    })
    .filter((r) => r.name.length > 0 || r.price > 0);
}

export async function parseSpreadsheetFile(file: File): Promise<ParsedProductImportRow[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv') || file.type === 'text/csv') {
    const text = await file.text();
    return mapMatrixToImportRows(parseCsvMatrix(text));
  }
  const rows = await readSheet(file);
  const matrix = rows.map((row) => row.map((cell) => (cell == null ? '' : String(cell).trim())));
  return mapMatrixToImportRows(matrix);
}

interface TemplateRow {
  name: string;
  brand: string;
  category: string;
  price: number;
  stock: number;
  availability: string;
  description: string;
  photoUrl: string;
}

export async function downloadExcelTemplate(): Promise<void> {
  const columns: Column<TemplateRow>[] = [
    { header: 'Product Name', cell: (r) => r.name, width: 28 },
    { header: 'Brand', cell: (r) => r.brand, width: 18 },
    { header: 'Category', cell: (r) => r.category, width: 22 },
    { header: 'Price (DZD)', cell: (r) => r.price, width: 14 },
    { header: 'Stock Qty', cell: (r) => r.stock, width: 12 },
    { header: 'Availability', cell: (r) => r.availability, width: 16 },
    { header: 'Description', cell: (r) => r.description, width: 40 },
    { header: 'Photo URL (https://)', cell: (r) => r.photoUrl, width: 30 },
  ];

  const sampleData: TemplateRow[] = [
    {
      name: 'GeForce RTX 4070 Super 12GB',
      brand: 'ASUS Dual',
      category: 'PC Parts & GPUs',
      price: 92000,
      stock: 3,
      availability: 'in_stock',
      description: '12GB GDDR6X GPU for 1440p gaming and AI/creator workloads.',
      photoUrl: '',
    },
    {
      name: 'iPhone 16 Pro 256GB',
      brand: 'Apple',
      category: 'Smartphones',
      price: 198000,
      stock: 4,
      availability: 'in_stock',
      description: '6.3-inch 120Hz ProMotion OLED, A18 Pro chip, USB-C.',
      photoUrl: '',
    },
    {
      name: '2TB Kingston KC3000 NVMe SSD',
      brand: 'Kingston',
      category: 'SSD & RAM',
      price: 21500,
      stock: 9,
      availability: 'in_stock',
      description: 'PCIe 4.0 M.2 2280 NVMe SSD up to 7,000 MB/s read.',
      photoUrl: '',
    },
  ];

  await writeXlsxFile(sampleData, {
    columns,
  }).toFile('shopfront-products-template.xlsx');
}
