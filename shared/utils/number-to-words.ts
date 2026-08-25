export function numberToWords(num: number): string {
  const ones = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const onesFeminine = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
  const scales = [
    { value: 1000000000, singular: 'миллиард', dual: 'миллиарда', plural: 'миллиардов' },
    { value: 1000000, singular: 'миллион', dual: 'миллиона', plural: 'миллионов' },
    { value: 1000, singular: 'тысяча', dual: 'тысячи', plural: 'тысяч' },
  ];

  if (num === 0) return 'ноль';

  let result = '';
  let absNum = Math.abs(Math.floor(num));

  for (const scale of scales) {
    const quotient = Math.floor(absNum / scale.value);
    if (quotient > 0) {
      result += convertHundreds(quotient, scale.value === 1000 ? onesFeminine : ones, teens, tens, hundreds) + ' ';
      result += getScaleName(quotient, scale.singular, scale.dual, scale.plural) + ' ';
      absNum %= scale.value;
    }
  }

  const hundreds_digit = Math.floor(absNum / 100);
  if (hundreds_digit > 0) result += hundreds[hundreds_digit] + ' ';

  const remainder = absNum % 100;
  if (remainder >= 20) {
    const tens_digit = Math.floor(remainder / 10);
    const ones_digit = remainder % 10;
    result += tens[tens_digit] + ' ';
    if (ones_digit > 0) result += ones[ones_digit] + ' ';
  } else if (remainder >= 10) {
    result += teens[remainder - 10] + ' ';
  } else if (remainder > 0) {
    result += ones[remainder] + ' ';
  }

  return result.trim().replace(/\s+/g, ' ');
}

function convertHundreds(num: number, ones: string[], teens: string[], tens: string[], hundreds: string[]): string {
  let result = '';
  const h = Math.floor(num / 100);
  if (h > 0) result += hundreds[h] + ' ';

  const remainder = num % 100;
  if (remainder >= 20) {
    const t = Math.floor(remainder / 10);
    const o = remainder % 10;
    result += tens[t] + ' ';
    if (o > 0) result += ones[o] + ' ';
  } else if (remainder >= 10) {
    result += teens[remainder - 10] + ' ';
  } else if (remainder > 0) {
    result += ones[remainder] + ' ';
  }
  return result.trim();
}

function getScaleName(num: number, singular: string, dual: string, plural: string): string {
  const lastDigit = num % 10;
  const lastTwoDigits = num % 100;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return plural;
  }
  if (lastDigit === 1) {
    return singular;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return dual;
  }
  return plural;
}

function getCurrencyName(num: number, singular: string, dual: string, plural: string): string {
  const lastDigit = num % 10;
  const lastTwoDigits = num % 100;
  
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return plural;
  }
  if (lastDigit === 1) {
    return singular;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return dual;
  }
  return plural;
}

// Для сумм: "Одна тысяча восемьсот рублей 00 копеек"
export function amountToWords(amount: number): string {
  const rubles = Math.floor(amount);
  const kopecks = Math.round((amount - rubles) * 100);
  
  const rublesText = numberToWords(rubles)
    .split(' ')
    .map((word, index, arr) => {
      if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      return word;
    })
    .join(' ');

  const rublesWord = getCurrencyName(rubles, 'рубль', 'рубля', 'рублей');
  const kopecksWord = getCurrencyName(kopecks, 'копейка', 'копейки', 'копеек');
  return `${rublesText} ${rublesWord} ${kopecks.toString().padStart(2, '0')} ${kopecksWord}`;
}
