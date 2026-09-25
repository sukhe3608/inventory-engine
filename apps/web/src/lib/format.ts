export function formatMoney(amount: number, currency: string, language: 'en' | 'hi' = 'en'): string {
  const locale = language === 'hi' ? 'hi-IN' : 'en-IN';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString(locale)}`;
  }
}

export function formatNumber(amount: number, language: 'en' | 'hi' = 'en'): string {
  const locale = language === 'hi' ? 'hi-IN' : 'en-IN';
  return new Intl.NumberFormat(locale).format(amount);
}

export function formatDate(value: string | null | undefined, language: 'en' | 'hi' = 'en'): string {
  if (!value) return '—';
  const locale = language === 'hi' ? 'hi-IN' : 'en-IN';
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return tens[t] + (o ? ' ' + ones[o] : '');
}

function threeDigits(n: number): string {
  if (n < 100) return twoDigits(n);
  const h = Math.floor(n / 100);
  const r = n % 100;
  return ones[h] + ' hundred' + (r ? ' ' + twoDigits(r) : '');
}

/** Indian numbering system: crore / lakh / thousand. */
export function amountInWords(amount: number): string {
  if (!isFinite(amount)) return '';
  if (amount === 0) return 'Zero only';
  const rupees = Math.floor(Math.abs(amount));
  const paise = Math.round((Math.abs(amount) - rupees) * 100);
  let words = '';

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  const parts: string[] = [];
  if (crore) parts.push(threeDigits(crore) + ' crore');
  if (lakh) parts.push(twoDigits(lakh) + ' lakh');
  if (thousand) parts.push(twoDigits(thousand) + ' thousand');
  if (rest) parts.push(threeDigits(rest));
  words = parts.join(' ');

  if (words) {
    words = words.charAt(0).toUpperCase() + words.slice(1) + ' Rupees';
  }
  if (paise > 0) {
    words = (words ? words + ' and ' : '') + twoDigits(paise) + (paise === 1 ? ' Paise' : ' Paise');
  }
  return (words || 'Zero') + ' only';
}