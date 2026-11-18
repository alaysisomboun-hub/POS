// Code 128B encoding table (values 0..106)
// Each entry represents 6 bar/space widths (bar, space, bar, space, bar, space); stop code (106) has 7 widths.
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

export interface BarcodeBar {
  x: number;
  width: number;
}

export function encodeCode128B(rawValue: string): { bars: BarcodeBar[]; totalWidth: number } {
  // Sanitize to printable ASCII 32..126 for Code 128B
  const sanitized = rawValue
    .split('')
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .join('')
    .slice(0, 48);

  if (!sanitized) {
    return { bars: [], totalWidth: 0 };
  }

  const START_B = 104;
  const STOP = 106;
  const codes: number[] = [START_B];
  let checksum = START_B;

  for (let i = 0; i < sanitized.length; i++) {
    const val = sanitized.charCodeAt(i) - 32;
    codes.push(val);
    checksum += val * (i + 1);
  }

  codes.push(checksum % 103);
  codes.push(STOP);

  const bars: BarcodeBar[] = [];
  let cursor = 0;

  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code] ?? CODE128_PATTERNS[0];
    for (let j = 0; j < pattern.length; j++) {
      const width = Number(pattern[j]);
      const isBar = j % 2 === 0;
      if (isBar) {
        bars.push({ x: cursor, width });
      }
      cursor += width;
    }
  }

  return { bars, totalWidth: cursor };
}

export function generateEan13InternalBarcode(): string {
  // Prefix 200 (in-store use) + 9 random digits + EAN-13 check digit
  const prefix = '200';
  let digits = prefix;
  for (let i = 0; i < 9; i++) {
    digits += Math.floor(Math.random() * 10).toString();
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const num = Number(digits[i]);
    sum += i % 2 === 0 ? num : num * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${digits}${checkDigit}`;
}

export function generateSkuCode(prefix = 'SKU'): string {
  const clean = prefix.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || 'SKU';
  const suffix = Math.floor(100000 + Math.random() * 900000);
  return `${clean}-${suffix}`;
}
