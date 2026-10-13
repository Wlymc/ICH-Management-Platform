/**
 * 全国 34 个省级行政区 + 省份解析。
 * 名录 CSV 里用的是简称（贵州、内蒙古、新疆），这里是唯一权威映射。
 */
export const PROVINCES = [
  { name: '北京市', short: '北京', code: '110000', order: 1 },
  { name: '天津市', short: '天津', code: '120000', order: 2 },
  { name: '河北省', short: '河北', code: '130000', order: 3 },
  { name: '山西省', short: '山西', code: '140000', order: 4 },
  { name: '内蒙古自治区', short: '内蒙古', code: '150000', order: 5 },
  { name: '辽宁省', short: '辽宁', code: '210000', order: 6 },
  { name: '吉林省', short: '吉林', code: '220000', order: 7 },
  { name: '黑龙江省', short: '黑龙江', code: '230000', order: 8 },
  { name: '上海市', short: '上海', code: '310000', order: 9 },
  { name: '江苏省', short: '江苏', code: '320000', order: 10 },
  { name: '浙江省', short: '浙江', code: '330000', order: 11 },
  { name: '安徽省', short: '安徽', code: '340000', order: 12 },
  { name: '福建省', short: '福建', code: '350000', order: 13 },
  { name: '江西省', short: '江西', code: '360000', order: 14 },
  { name: '山东省', short: '山东', code: '370000', order: 15 },
  { name: '河南省', short: '河南', code: '410000', order: 16 },
  { name: '湖北省', short: '湖北', code: '420000', order: 17 },
  { name: '湖南省', short: '湖南', code: '430000', order: 18 },
  { name: '广东省', short: '广东', code: '440000', order: 19 },
  { name: '广西壮族自治区', short: '广西', code: '450000', order: 20 },
  { name: '海南省', short: '海南', code: '460000', order: 21 },
  { name: '重庆市', short: '重庆', code: '500000', order: 22 },
  { name: '四川省', short: '四川', code: '510000', order: 23 },
  { name: '贵州省', short: '贵州', code: '520000', order: 24 },
  { name: '云南省', short: '云南', code: '530000', order: 25 },
  { name: '西藏自治区', short: '西藏', code: '540000', order: 26 },
  { name: '陕西省', short: '陕西', code: '610000', order: 27 },
  { name: '甘肃省', short: '甘肃', code: '620000', order: 28 },
  { name: '青海省', short: '青海', code: '630000', order: 29 },
  { name: '宁夏回族自治区', short: '宁夏', code: '640000', order: 30 },
  { name: '新疆维吾尔自治区', short: '新疆', code: '650000', order: 31 },
  { name: '台湾省', short: '台湾', code: '710000', order: 32 },
  { name: '香港特别行政区', short: '香港', code: '810000', order: 33 },
  { name: '澳门特别行政区', short: '澳门', code: '820000', order: 34 },
];

/** 简称 / 全称 / 去后缀 → 全称 */
export const PROVINCE_ALIAS = new Map();
for (const item of PROVINCES) {
  PROVINCE_ALIAS.set(item.name, item.name);
  PROVINCE_ALIAS.set(item.short, item.name);
  PROVINCE_ALIAS.set(item.name.replace(/(省|市|自治区|特别行政区|壮族|回族|维吾尔)$/g, ''), item.name);
}

// 长名优先，避免"内蒙古"被"内蒙古自治区"以外的规则截断
const MATCH_ORDER = [...PROVINCES].sort((a, b) => b.name.length - a.name.length);

/**
 * 从任意文本里解析出省份全称。
 * 能处理：`贵州`、`贵州省`、`贵州省台江县`、`新疆维吾尔自治区克孜勒苏柯尔克孜自治州`。
 * 解析不出返回 null（调用方不要阻断导入，原文照存）。
 */
export function parseProvince(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (PROVINCE_ALIAS.has(raw)) return PROVINCE_ALIAS.get(raw);
  for (const province of MATCH_ORDER) {
    if (raw.startsWith(province.name)) return province.name;
  }
  for (const province of MATCH_ORDER) {
    if (raw.startsWith(province.short)) return province.name;
  }
  for (const province of MATCH_ORDER) {
    if (raw.includes(province.name)) return province.name;
  }
  return null;
}

/**
 * 在自然语言句子里找省份（如「找出内蒙古的民俗项目」）。
 * 按长名优先匹配，避免"山西/陕西"这类近形混淆。
 */
export function findProvinceInText(text) {
  const raw = String(text || '');
  if (!raw) return null;
  for (const province of MATCH_ORDER) {
    if (raw.includes(province.name)) return province.name;
  }
  const shorts = [...PROVINCES].sort((a, b) => b.short.length - a.short.length);
  for (const province of shorts) {
    if (raw.includes(province.short)) return province.name;
  }
  return null;
}
