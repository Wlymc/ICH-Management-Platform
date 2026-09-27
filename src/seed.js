import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from './config.js';
import { all, count, get, insert, run } from './db.js';
import { ensureUser } from './auth.js';
import { nowIso } from './util.js';

const CATEGORIES = [
  { name: '民间文学', code: 'Ⅰ', summary: '口头传统与民间叙事，包括传说、故事、歌谣、谚语、史诗等。' },
  { name: '传统音乐', code: 'Ⅱ', summary: '民间器乐、声乐与宗教音乐等传统音乐表现形式。' },
  { name: '传统舞蹈', code: 'Ⅲ', summary: '在民间长期流传的舞蹈形态，多与节令、信仰和劳作相关。' },
  { name: '传统戏剧', code: 'Ⅳ', summary: '地方戏曲、木偶戏、皮影戏等综合表演艺术。' },
  { name: '曲艺', code: 'Ⅴ', summary: '说唱艺术，包括评话、弹词、鼓书、琴书等。' },
  { name: '传统体育、游艺与杂技', code: 'Ⅵ', summary: '传统武术、竞技游艺与杂技技巧。' },
  { name: '传统美术', code: 'Ⅶ', summary: '绘画、雕塑、剪刻、刺绣、灯彩等造型艺术。' },
  { name: '传统技艺', code: 'Ⅷ', summary: '与生产生活密切相关的传统工艺与手工技艺。' },
  { name: '传统医药', code: 'Ⅸ', summary: '中医药传统知识与实践，含疗法、炮制、养生等。' },
  { name: '民俗', code: 'Ⅹ', summary: '节令、礼仪、信仰、饮食服饰等民间风俗。' },
];

const LEVELS = [
  { name: '国家级', weight: 4, sort_order: 1 },
  { name: '省级', weight: 3, sort_order: 2 },
  { name: '市级', weight: 2, sort_order: 3 },
  { name: '县级', weight: 1, sort_order: 4 },
];

const REGION_TREE = [
  {
    name: '江苏省',
    code: '320000',
    children: [
      { name: '南京市', code: '320100', children: [
        { name: '秦淮区', code: '320104' },
        { name: '江宁区', code: '320115' },
        { name: '高淳区', code: '320118' },
      ] },
      { name: '苏州市', code: '320500', children: [
        { name: '姑苏区', code: '320508' },
        { name: '吴中区', code: '320506' },
        { name: '常熟市', code: '320581' },
      ] },
      { name: '扬州市', code: '321000', children: [
        { name: '广陵区', code: '321002' },
        { name: '江都区', code: '321012' },
      ] },
      { name: '南通市', code: '320600', children: [
        { name: '崇川区', code: '320602' },
        { name: '如皋市', code: '320682' },
      ] },
      { name: '徐州市', code: '320300', children: [
        { name: '云龙区', code: '320303' },
        { name: '邳州市', code: '320382' },
      ] },
      { name: '无锡市', code: '320200', children: [
        { name: '梁溪区', code: '320213' },
        { name: '宜兴市', code: '320282' },
      ] },
    ],
  },
];

const BATCHES = ['第一批', '第二批', '第三批', '第四批', '第五批'];
const ORG_TYPES = ['传习所', '非遗展示馆', '民俗博物馆', '生产性保护基地', '传承基地', '非遗工坊'];

const PROJECT_NAMES = {
  民间文学: [
    '江南水乡起源传说',
    '古运河船工号子与口头叙事',
    '地方谚语与谜语集成',
    '民间长歌吟诵',
    '历史人物口头传说',
    '村落创世故事讲述',
  ],
  传统音乐: [
    '古琴艺术',
    '民间吹打乐',
    '江南丝竹',
    '劳动号子',
    '山地民歌调',
    '寺庙梵呗音乐',
  ],
  传统舞蹈: [
    '龙舞',
    '狮舞',
    '秧歌舞',
    '花鼓灯',
    '傩舞',
    '灯彩舞',
  ],
  传统戏剧: [
    '地方皮影戏',
    '杖头木偶戏',
    '傩戏',
    '地方折子戏唱腔',
    '目连戏',
    '采茶戏',
  ],
  曲艺: [
    '评话',
    '弹词',
    '鼓书',
    '快板书',
    '琴书',
    '民间说唱小调',
  ],
  '传统体育、游艺与杂技': [
    '传统太极拳法',
    '蹴鞠竞技',
    '抖空竹',
    '顶技杂技',
    '龙舟竞渡',
    '传统武术套路',
  ],
  传统美术: [
    '木版年画印制技艺',
    '民间剪纸',
    '传统刺绣',
    '惠山泥塑',
    '秦淮灯彩',
    '留青竹刻',
  ],
  传统技艺: [
    '蓝印花布印染技艺',
    '手工造纸技艺',
    '传统木作营造技艺',
    '手工制瓷技艺',
    '金银细工制作技艺',
    '传统酿造技艺',
  ],
  传统医药: [
    '传统中药炮制技艺',
    '中医正骨疗法',
    '传统针灸疗法',
    '地方草药采集与应用',
    '传统膏方制作技艺',
    '药膳配制技艺',
  ],
  民俗: [
    '传统节令庙会',
    '宗族祭祖礼仪',
    '传统婚俗',
    '端午龙舟民俗',
    '地方茶俗',
    '丰收节庆习俗',
  ],
};

const ORG_SEEDS = [
  { city: '南京市', type: '非遗展示馆', name: '南京秦淮非遗展示馆', open: 1, hours: '周二至周日 9:00-17:00（周一闭馆）', exp: '金陵灯彩制作体验、非遗小课堂（需预约）' },
  { city: '南京市', type: '传习所', name: '江宁手工技艺传习所', open: 1, hours: '周一至周六 9:30-16:30', exp: '竹编、木作基础体验' },
  { city: '苏州市', type: '非遗工坊', name: '姑苏绣艺非遗工坊', open: 1, hours: '每日 10:00-18:00', exp: '苏绣入门体验课，2 小时/场' },
  { city: '苏州市', type: '生产性保护基地', name: '吴中印染技艺生产性保护基地', open: 1, hours: '周一至周五 9:00-17:00，团体预约', exp: '蓝印花布扎染体验' },
  { city: '苏州市', type: '民俗博物馆', name: '常熟民俗文化博物馆', open: 1, hours: '周二至周日 9:00-16:30', exp: '节令民俗展陈、年画拓印' },
  { city: '扬州市', type: '传承基地', name: '广陵古琴传承基地', open: 1, hours: '周二至周日 10:00-17:00', exp: '古琴雅集、入门指法体验' },
  { city: '扬州市', type: '传习所', name: '江都漆器传习所', open: 1, hours: '周一至周六 8:30-17:00', exp: '漆艺观摩与打磨体验' },
  { city: '南通市', type: '非遗展示馆', name: '崇川蓝印非遗展示馆', open: 1, hours: '周二至周日 9:00-17:00', exp: '印染纹样拓印、手帕制作' },
  { city: '南通市', type: '非遗工坊', name: '如皋风筝非遗工坊', open: 0, hours: '需提前电话预约', exp: '风筝扎制与彩绘' },
  { city: '徐州市', type: '民俗博物馆', name: '云龙民俗陈列馆', open: 1, hours: '周二至周日 9:00-16:00', exp: '汉风民俗展、传统游艺体验' },
  { city: '徐州市', type: '传承基地', name: '邳州剪纸传承基地', open: 0, hours: '预约开放', exp: '剪纸技法教学' },
  { city: '无锡市', type: '非遗展示馆', name: '梁溪非遗体验中心', open: 1, hours: '每日 9:30-20:00', exp: '泥塑、竹刻、茶俗体验' },
];

const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '高', '林', '罗', '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹', '彭', '曾', '肖', '田', '董', '袁', '潘', '于', '蒋', '蔡'];
const GIVEN_NAMES = ['锦文', '承宗', '慧兰', '文华', '守艺', '国良', '秀珍', '志远', '素芬', '德昌', '雅琴', '立本', '桂英', '永年', '晓云', '正清', '巧英', '明轩', '淑芳', '建平', '玉梅', '国栋', '丽华', '宗明', '兰英', '学文', '凤仪', '瑞祥', '秀云', '仲达', '慧珍', '长庚', '美玲', '继祖', '秋萍', '宝善', '桂芳', '守拙', '云芳', '传薪'];
const ETHNICS = ['汉族', '汉族', '汉族', '汉族', '汉族', '回族', '蒙古族', '土家族', '苗族'];
const STORY_TITLES = [
  '一把刻刀，四十年守一门手艺',
  '从学徒到传承人：手上的功夫不能丢',
  '她把老纹样带回年轻人的生活',
  '戏台上的第三代人',
  '守着一口老窑过日子',
  '草药香里长大的孩子',
  '让老曲子重新被人哼唱',
  '手上的茧，是最好的老师',
  '师徒之间，传的是规矩',
  '把节令习俗讲给孩子听',
];

function insertRegionTree(tree, parentId = null, level = 'province', order = 0) {
  for (let index = 0; index < tree.length; index += 1) {
    const node = tree[index];
    const existing = get('SELECT id FROM region WHERE name = ? AND IFNULL(parent_id, 0) = ?', [node.name, parentId ?? 0]);
    let id = existing?.id;
    if (!id) {
      id = insert('region', {
        name: node.name,
        parent_id: parentId,
        region_level: level,
        code: node.code || '',
        sort_order: index + 1,
      });
    }
    if (node.children) {
      const childLevel = level === 'province' ? 'city' : 'county';
      insertRegionTree(node.children, id, childLevel, order);
    }
  }
}

function ensureDicts() {
  for (let index = 0; index < CATEGORIES.length; index += 1) {
    const item = CATEGORIES[index];
    const existing = get('SELECT id FROM heritage_category WHERE name = ?', [item.name]);
    if (!existing) {
      insert('heritage_category', { name: item.name, code: item.code, summary: item.summary, sort_order: index + 1 });
    }
  }
  for (const level of LEVELS) {
    if (!get('SELECT id FROM heritage_level WHERE name = ?', [level.name])) {
      insert('heritage_level', level);
    }
  }
  insertRegionTree(REGION_TREE);
  for (let index = 0; index < BATCHES.length; index += 1) {
    if (!get("SELECT id FROM dict_item WHERE kind = 'batch' AND name = ?", [BATCHES[index]])) {
      insert('dict_item', { kind: 'batch', name: BATCHES[index], sort_order: index + 1 });
    }
  }
  for (let index = 0; index < ORG_TYPES.length; index += 1) {
    if (!get("SELECT id FROM dict_item WHERE kind = 'org_type' AND name = ?", [ORG_TYPES[index]])) {
      insert('dict_item', { kind: 'org_type', name: ORG_TYPES[index], sort_order: index + 1 });
    }
  }
}

function svgPlaceholder({ title, subtitle, hue, variant }) {
  const h1 = hue;
  const h2 = (hue + 42) % 360;
  const shapes = [
    `<circle cx="640" cy="120" r="150" fill="rgba(255,255,255,.10)"/><circle cx="640" cy="120" r="96" fill="none" stroke="rgba(255,255,255,.24)" stroke-width="2"/>`,
    `<rect x="-60" y="330" width="920" height="240" fill="rgba(255,255,255,.08)"/><circle cx="150" cy="140" r="110" fill="rgba(255,255,255,.10)"/>`,
    `<path d="M0 400 Q200 300 400 400 T800 400 L800 500 L0 500 Z" fill="rgba(255,255,255,.12)"/>`,
    `<g stroke="rgba(255,255,255,.22)" fill="none" stroke-width="2"><path d="M120 480 C 200 300 420 260 660 180"/><path d="M180 500 C 280 340 460 300 700 230"/></g>`,
  ];
  const safeTitle = String(title).slice(0, 22);
  const safeSubtitle = String(subtitle || '').slice(0, 30);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500" role="img" aria-label="${safeTitle}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="hsl(${h1},48%,34%)"/><stop offset="100%" stop-color="hsl(${h2},52%,22%)"/>
  </linearGradient></defs>
  <rect width="800" height="500" fill="url(#g)"/>
  ${shapes[variant % shapes.length]}
  <g opacity=".92">
    <text x="60" y="392" font-family="Noto Sans SC, Microsoft YaHei, sans-serif" font-size="46" font-weight="700" fill="#fff">${safeTitle}</text>
    <text x="62" y="440" font-family="Noto Sans SC, Microsoft YaHei, sans-serif" font-size="24" fill="rgba(255,255,255,.82)">${safeSubtitle}</text>
    <text x="62" y="88" font-family="Noto Sans SC, Microsoft YaHei, sans-serif" font-size="20" letter-spacing="6" fill="rgba(255,255,255,.7)">非遗数字档案</text>
  </g>
</svg>`;
}

function wavTone(frequency, seconds = 2, rate = 8000) {
  const samples = rate * seconds;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const value = Math.sin((2 * Math.PI * frequency * i) / rate) * 0.28 * 32767;
    data.writeInt16LE(Math.round(value), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

function writeSeedFile(relativePath, content, { binary = false } = {}) {
  const target = path.join(PATHS.uploads, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) {
    fs.writeFileSync(target, binary ? content : Buffer.from(content, 'utf8'));
  }
  return relativePath;
}

function pickRegion(index) {
  const regions = all("SELECT id, name, region_level FROM region ORDER BY sort_order, id");
  const counties = regions.filter((r) => r.region_level === 'county');
  return counties[index % counties.length];
}

function buildProjects(adminId, editorId) {
  const categories = all('SELECT id, name, code FROM heritage_category ORDER BY sort_order');
  const levels = all('SELECT id, name FROM heritage_level ORDER BY sort_order');
  const levelByName = new Map(levels.map((l) => [l.name, l.id]));
  const orgs = all('SELECT id, name FROM organization ORDER BY id');
  const rows = [];
  let seq = 0;
  for (let c = 0; c < categories.length; c += 1) {
    const category = categories[c];
    // 防御性回退：即使新增类目未维护名称清单，也要保证该类目下有示例项目
    const names = PROJECT_NAMES[category.name]
      || Array.from({ length: 6 }, (_, index) => `${category.name}代表性项目（${index + 1}）`);
    for (let j = 0; j < names.length; j += 1) {
      seq += 1;
      const levelName = j === 0 ? '国家级' : j <= 2 ? '省级' : j <= 4 ? '市级' : '县级';
      const region = pickRegion(seq * 3 + j);
      const org = orgs[seq % orgs.length];
      const status = seq === 59 ? 'pending' : seq === 60 ? 'draft' : seq === 41 ? 'rejected' : 'published';
      const owner = seq > 54 ? editorId : adminId;
      rows.push({
        code: `JS-${String(c + 1).padStart(2, '0')}-${String(j + 1).padStart(4, '0')}`,
        name: category.name === '传统美术' && j === 4 ? '秦淮灯彩' : names[j],
        category_id: category.id,
        level_id: levelByName.get(levelName),
        batch: BATCHES[Math.min(j, 4)],
        published_year: 2006 + j * 3 + (levelName === '国家级' ? 0 : 1),
        region_id: region.id,
        organization_id: org?.id ?? null,
        protection_unit: org?.name ?? `${region.name}文化馆`,
        summary: `${names[j]}流传于${region.name}一带，是当地民众在生产生活中形成的传统${category.name}表现形式，历经数代人的口传心授与技艺积累，至今仍在社区、节庆与日常生活中活态传承。本项目以师徒传承为主要方式，兼具地域性、集体性与流变性，是观察江南民间文化的重要窗口。`,
        history: `据地方文献与口述记忆，${names[j]}可追溯至明清时期，最初服务于祭祀、节令与农事活动，后逐渐固定为社区公共文化生活的组成部分。二十世纪以来，随着社会结构变迁，传承方式由家族内传逐步扩展为公开传习。`,
        feature: `${names[j]}讲究手上功夫与即兴变化的结合：工具、材料多取自本地，工序繁复而依赖经验判断；表现形式上强调程式与个人风格的统一，同一技艺在不同村落会形成各自面貌。`,
        lineage: `第一代传人可考为清末民初时期的手艺人，此后主要通过家族与师徒方式延续。目前已有较为清晰的三至四代传承谱系，代表传承人长期在本地开展带徒授艺与展示交流。`,
        keywords: [category.name, region.name, names[j], '活态传承'].join('、'),
        featured: j === 0 && c % 2 === 0 ? 1 : j === 1 && c % 2 === 1 ? 1 : 0,
        video_url: j === 0 && c % 3 === 0 ? 'https://www.bilibili.com/video/BV1xx411c7mD' : '',
        cover_path: '',
        status,
        review_note: seq === 41 ? '申报材料缺少历史渊源与传承谱系描述，请补充影像资料后重新提交。' : '',
        created_by: owner,
        reviewed_by: status === 'published' ? adminId : null,
        review_at: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
    }
  }
  return rows;
}

function buildInheritors(adminId, editorId) {
  const levels = all('SELECT id, name FROM heritage_level ORDER BY sort_order');
  const levelByName = new Map(levels.map((l) => [l.name, l.id]));
  const rows = [];
  for (let k = 0; k < 40; k += 1) {
    const categoryIndex = k % 10;
    const region = pickRegion(k * 5 + 2);
    const levelName = k % 8 === 0 ? '国家级' : k % 3 === 0 ? '省级' : k % 2 === 0 ? '市级' : '县级';
    const gender = k % 3 === 0 ? '女' : '男';
    const birthYear = 1943 + ((k * 7) % 45);
    const name = `${SURNAMES[k % SURNAMES.length]}${GIVEN_NAMES[k % GIVEN_NAMES.length]}`;
    const status = k === 39 ? 'pending' : 'published';
    rows.push({
      code: `JS-CR-${String(k + 1).padStart(4, '0')}`,
      name,
      gender,
      ethnic: ETHNICS[k % ETHNICS.length],
      birth_month: `${birthYear}-${String(((k % 12) + 1)).padStart(2, '0')}`,
      level_id: levelByName.get(levelName),
      region_id: region.id,
      batch: BATCHES[Math.min(k % 5, 4)],
      certified_year: 2007 + (k % 5) * 3,
      address: `${region.name}${['文化街', '老城区', '工坊巷', '传承基地'][k % 4]}${10 + (k % 80)}号`,
      story_title: STORY_TITLES[k % STORY_TITLES.length],
      experience: `${name}自少年时期随家中长辈接触${CATEGORIES[categoryIndex].name}，二十世纪八十年代起专职从事相关技艺实践，先后参与本地普查、记录与展示活动，并在社区、学校开设公益传习课程，累计带徒多人。`,
      skill: `其技艺特点是工序把控精准、纹样与曲调保存完整，能够在传统程式基础上进行适度创新；同时注重将口传知识与文字、影像记录结合，便于后续研究与教学。`,
      honors: `代表作多次参加省市级非遗展示与交流活动；曾获地方传统技艺展演优秀奖，并被聘为中小学传统文化校外辅导员。`,
      featured: k % 5 === 0 ? 1 : 0,
      video_url: '',
      photo_path: '',
      status,
      review_note: '',
      created_by: k > 34 ? editorId : adminId,
      reviewed_by: status === 'published' ? adminId : null,
      review_at: null,
      created_at: nowIso(),
      updated_at: nowIso(),
    });
  }
  return rows;
}

function buildOrganizations(adminId) {
  const regions = all("SELECT id, name, parent_id FROM region WHERE region_level = 'city' ORDER BY sort_order");
  return ORG_SEEDS.map((seed, index) => {
    const region = regions.find((r) => r.name === seed.city) || regions[index % regions.length];
    const counties = all('SELECT id, name FROM region WHERE parent_id = ? ORDER BY sort_order', [region.id]);
    const county = counties.length ? counties[index % counties.length] : region;
    return {
      code: `JD-${String(index + 1).padStart(4, '0')}`,
      name: seed.name,
      org_type: seed.type,
      region_id: county.id,
      address: `${region.name}${county.name}${['文化路', '古街', '非遗街区', '文博巷'][index % 4]}${8 + index * 3}号`,
      manager: `${SURNAMES[(index + 3) % SURNAMES.length]}${GIVEN_NAMES[(index + 11) % GIVEN_NAMES.length]}`,
      phone: `0${[25, 512, 514, 513, 516, 510][index % 6]}-8${String(1000000 + index * 137).slice(0, 7)}`,
      email: `ich.center${index + 1}@example.com`,
      founded_year: 1998 + (index % 18),
      is_open: seed.open,
      open_hours: seed.hours,
      traffic: `可乘公交至${county.name}文化中心站，步行约 5 分钟；自驾可停靠${county.name}文体中心地下停车场。`,
      experience: seed.exp,
      featured: index % 4 === 0 ? 1 : 0,
      intro: `${seed.name}是依托本地非物质文化遗产资源设立的${seed.type}，承担项目建档、传承人联络、技艺传习与公众展示等职能，常年面向学校、社区和游客开展公益讲解与体验活动。`,
      cover_path: '',
      status: 'published',
      review_note: '',
      created_by: adminId,
      reviewed_by: adminId,
      review_at: nowIso(),
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  });
}

function seedFilesAndAttachments() {
  if (count('SELECT COUNT(*) AS n FROM attachment') > 0) {
    ensureSeedFiles();
    return;
  }
  const categories = all('SELECT id, name, sort_order FROM heritage_category ORDER BY sort_order');
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const projects = all("SELECT id, name, code, category_id, cover_path FROM project WHERE status = 'published' ORDER BY id");
  const inheritors = all("SELECT id, name, level_id FROM inheritor WHERE status = 'published' ORDER BY id");

  let imageSeq = 0;
  const attachments = [];

  projects.forEach((project, index) => {
    const category = categoryById.get(project.category_id);
    const hue = ((category?.sort_order ?? 1) - 1) * 33 + 8;
    const shots = index % 3 === 0 ? 3 : 2;
    for (let n = 0; n < shots; n += 1) {
      imageSeq += 1;
      const relative = `seed/project-${project.id}-${n + 1}.svg`;
      writeSeedFile(relative, svgPlaceholder({
        title: project.name,
        subtitle: ['技艺实录', '传承现场', '作品细节'][n % 3],
        hue,
        variant: n + (index % 4),
      }));
      attachments.push({
        owner_type: 'project',
        owner_id: project.id,
        kind: 'image',
        title: `${project.name}·${['技艺实录', '传承现场', '作品细节'][n % 3]}`,
        note: '示例占位影像，实际使用时请替换为真实采集的图片资料。',
        file_name: `project-${project.id}-${n + 1}.svg`,
        file_path: relative,
        file_size: 0,
        mime_type: 'image/svg+xml',
        external_url: '',
        uploaded_by: 1,
        created_at: nowIso(),
      });
      if (n === 0) {
        run('UPDATE project SET cover_path = ? WHERE id = ?', [relative, project.id]);
      }
    }
    if (index % 9 === 0) {
      const relative = `seed/audio-${project.id}.wav`;
      writeSeedFile(relative, wavTone(196 + (index % 6) * 44), { binary: true });
      attachments.push({
        owner_type: 'project',
        owner_id: project.id,
        kind: 'audio',
        title: `${project.name}·采集音频样例`,
        note: '示例音频（程序生成的单音），用于演示音频档案的在线播放能力。',
        file_name: `audio-${project.id}.wav`,
        file_path: relative,
        file_size: 32044,
        mime_type: 'audio/wav',
        external_url: '',
        uploaded_by: 1,
        created_at: nowIso(),
      });
    }
  });

  inheritors.forEach((inheritor, index) => {
    const hue = 20 + ((inheritor.level_id || 1) * 47) % 300;
    const relative = `seed/inheritor-${inheritor.id}.svg`;
    writeSeedFile(relative, svgPlaceholder({
      title: inheritor.name,
      subtitle: '传承人影像',
      hue,
      variant: index % 4,
    }));
    run('UPDATE inheritor SET photo_path = ? WHERE id = ?', [relative, inheritor.id]);
    attachments.push({
      owner_type: 'inheritor',
      owner_id: inheritor.id,
      kind: 'image',
      title: `${inheritor.name}·肖像与工作照`,
      note: '示例占位影像，实际使用时请替换为真实采集的照片。',
      file_name: `inheritor-${inheritor.id}.svg`,
      file_path: relative,
      file_size: 0,
      mime_type: 'image/svg+xml',
      external_url: '',
      uploaded_by: 1,
      created_at: nowIso(),
    });
  });

  const organizations = all('SELECT id, name, org_type FROM organization ORDER BY id');
  organizations.forEach((organization, index) => {
    const relative = `seed/org-${organization.id}.svg`;
    writeSeedFile(relative, svgPlaceholder({
      title: organization.name,
      subtitle: organization.org_type,
      hue: 160 + index * 11,
      variant: index % 4,
    }));
    run('UPDATE organization SET cover_path = ? WHERE id = ?', [relative, organization.id]);
    attachments.push({
      owner_type: 'organization',
      owner_id: organization.id,
      kind: 'image',
      title: `${organization.name}·场馆影像`,
      note: '示例占位影像。',
      file_name: `org-${organization.id}.svg`,
      file_path: relative,
      file_size: 0,
      mime_type: 'image/svg+xml',
      external_url: '',
      uploaded_by: 1,
      created_at: nowIso(),
    });
  });

  for (const item of attachments) insert('attachment', item);
}

/** 保证示例文件存在（数据库已存在时可重复调用） */
function ensureSeedFiles() {
  const rows = all("SELECT file_path, file_name FROM attachment WHERE file_path LIKE 'seed/%'");
  const missing = rows.filter((row) => !fs.existsSync(path.join(PATHS.uploads, row.file_path)));
  if (!missing.length) return;
  const byId = new Map();
  for (const row of missing) {
    const match = row.file_path.match(/seed\/(project|inheritor|org)-(\d+)/);
    if (!match) continue;
    const [, kind, id] = match;
    byId.set(`${kind}-${id}`, { kind, id: Number(id), row });
  }
  for (const { kind, id } of byId.values()) {
    if (kind === 'project') {
      const project = get('SELECT id, name, category_id FROM project WHERE id = ?', [id]);
      if (!project) continue;
      const category = get('SELECT sort_order FROM heritage_category WHERE id = ?', [project.category_id]);
      for (let n = 1; n <= 3; n += 1) {
        writeSeedFile(`seed/project-${id}-${n}.svg`, svgPlaceholder({
          title: project.name,
          subtitle: ['技艺实录', '传承现场', '作品细节'][n - 1],
          hue: ((category?.sort_order ?? 1) - 1) * 33 + 8,
          variant: n,
        }));
      }
      const audioPath = `seed/audio-${id}.wav`;
      if (missing.some((row) => row.file_path === audioPath)) {
        writeSeedFile(audioPath, wavTone(220), { binary: true });
      }
    } else if (kind === 'inheritor') {
      const inheritor = get('SELECT id, name, level_id FROM inheritor WHERE id = ?', [id]);
      if (inheritor) {
        writeSeedFile(`seed/inheritor-${id}.svg`, svgPlaceholder({
          title: inheritor.name,
          subtitle: '传承人影像',
          hue: 20 + ((inheritor.level_id || 1) * 47) % 300,
          variant: id % 4,
        }));
      }
    } else {
      const organization = get('SELECT id, name, org_type FROM organization WHERE id = ?', [id]);
      if (organization) {
        writeSeedFile(`seed/org-${id}.svg`, svgPlaceholder({
          title: organization.name,
          subtitle: organization.org_type,
          hue: 160 + id * 11,
          variant: id % 4,
        }));
      }
    }
  }
}

export function seedAll() {
  const adminId = ensureUser({ username: 'admin', password: 'Admin@123', displayName: '系统管理员', role: 'admin' });
  const editorId = ensureUser({ username: 'editor', password: 'Editor@123', displayName: '名录录入员', role: 'editor' });

  ensureDicts();

  if (count('SELECT COUNT(*) AS n FROM organization') === 0) {
    for (const row of buildOrganizations(adminId)) insert('organization', row);
  }

  if (count('SELECT COUNT(*) AS n FROM project') === 0) {
    for (const row of buildProjects(adminId, editorId)) insert('project', row);
  }

  if (count('SELECT COUNT(*) AS n FROM inheritor') === 0) {
    for (const row of buildInheritors(adminId, editorId)) insert('inheritor', row);
  }

  if (count('SELECT COUNT(*) AS n FROM project_inheritor') === 0) {
    const projects = all('SELECT id, category_id FROM project ORDER BY id');
    const inheritors = all('SELECT id FROM inheritor ORDER BY id');
    inheritors.forEach((inheritor, k) => {
      const categoryIndex = k % 10;
      const category = all('SELECT id FROM heritage_category ORDER BY sort_order')[categoryIndex];
      const pool = projects.filter((p) => Number(p.category_id) === Number(category?.id));
      if (!pool.length) return;
      const first = pool[k % pool.length];
      const second = pool[(k + 1) % pool.length];
      run('INSERT OR IGNORE INTO project_inheritor (project_id, inheritor_id, is_representative) VALUES (?, ?, 1)', [first.id, inheritor.id]);
      if (second && second.id !== first.id) {
        run('INSERT OR IGNORE INTO project_inheritor (project_id, inheritor_id, is_representative) VALUES (?, ?, 1)', [second.id, inheritor.id]);
      }
    });
  }

  seedFilesAndAttachments();

  if (count('SELECT COUNT(*) AS n FROM audit_log') === 0) {
    insert('audit_log', {
      user_id: adminId,
      user_name: '系统管理员',
      action: 'seed',
      target_type: 'system',
      target_id: null,
      target_name: '示例数据',
      detail: '初始化字典与示例档案数据',
      ip: '127.0.0.1',
      created_at: nowIso(),
    });
  }
}
