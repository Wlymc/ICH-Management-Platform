/**
 * 夜观星图的行政区示意坐标。
 * 这里只提供省级中心点的近似经纬度，不绘制任何行政边界；
 * 市/县级项目会在所属省份中心附近做确定性散开，用于「意象星图」展示。
 */

const PROVINCE_GEO = {
  北京市: [116.4, 39.9],
  天津市: [117.2, 39.1],
  河北省: [114.5, 38.0],
  山西省: [112.5, 37.9],
  内蒙古自治区: [111.7, 40.8],
  辽宁省: [123.4, 41.8],
  吉林省: [125.3, 43.9],
  黑龙江省: [126.6, 45.8],
  上海市: [121.5, 31.2],
  江苏省: [119.0, 33.0],
  浙江省: [120.2, 29.2],
  安徽省: [117.3, 31.8],
  福建省: [119.3, 26.1],
  江西省: [115.9, 28.7],
  山东省: [117.0, 36.7],
  河南省: [113.6, 34.8],
  湖北省: [114.3, 30.6],
  湖南省: [113.0, 28.2],
  广东省: [113.3, 23.1],
  广西壮族自治区: [108.3, 22.8],
  海南省: [109.7, 19.2],
  重庆市: [106.5, 29.5],
  四川省: [102.7, 30.7],
  贵州省: [106.7, 26.6],
  云南省: [101.5, 25.0],
  西藏自治区: [91.1, 29.6],
  陕西省: [108.9, 35.3],
  甘肃省: [103.8, 36.1],
  青海省: [96.0, 35.6],
  宁夏回族自治区: [106.3, 38.5],
  新疆维吾尔自治区: [85.3, 41.7],
  台湾省: [121.0, 23.7],
  香港特别行政区: [114.2, 22.3],
  澳门特别行政区: [113.5, 22.2],
};

export const STAR_WORLD = { width: 1200, height: 720 };

function project(lon, lat) {
  const x = 60 + ((lon - 73) / (135 - 73)) * 1080;
  const y = 50 + ((54 - lat) / (54 - 18)) * 620;
  return { x, y };
}

export const PROVINCE_POINTS = Object.fromEntries(
  Object.entries(PROVINCE_GEO).map(([name, [lon, lat]]) => [name, project(lon, lat)]),
);

export function hashString(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 确定性伪随机：同一项目每次刷新落在同一位置 */
export function seededUnit(seed, salt = 0) {
  const value = Math.sin((Number(seed) + salt * 97.13) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function provincePoint(name) {
  return PROVINCE_POINTS[name] || { x: STAR_WORLD.width / 2, y: STAR_WORLD.height / 2 };
}
