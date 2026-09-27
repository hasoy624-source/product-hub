/** Convert a yuan input to integer fen without binary floating-point rounding. */
export function yuanToCents(value: string | number): number {
  const yuan = String(value).trim()
  if (!/^\d+(\.\d{1,2})?$/.test(yuan)) throw new Error('净销售额须为非负数，且最多保留两位小数')
  const [whole, fraction = ''] = yuan.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!Number.isSafeInteger(cents)) throw new Error('销售额超出有效范围')
  return cents
}
