/**
 * 资源元数据：管理端的列表、表单、筛选、导入导出全部由这里的定义驱动。
 */

export const STATUS = {
  draft: { label: '草稿', tone: 'muted' },
  pending: { label: '待审核', tone: 'warn' },
  published: { label: '已发布', tone: 'ok' },
  rejected: { label: '已退回', tone: 'danger' },
  archived: { label: '已归档', tone: 'muted' },
};

export const GENDER_OPTIONS = ['男', '女'];

export const GROUPS = {
  basic: '基本信息',
  content: '内容描述',
  heritage: '传承信息',
  visit: '探访服务',
  media: '影像资料',
  admin: '状态设置',
};

const f = (spec) => ({ span: 'half', list: false, filter: false, search: false, import: false, ...spec });

export const RESOURCES = {
  project: {
    key: 'project',
    label: '非遗项目',
    one: '项目',
    table: 'project',
    publicPath: '/projects',
    defaultSort: 'updated_at',
    titleField: 'name',
    codeField: 'code',
    hasRelation: true,
    fields: [
      f({ name: 'code', label: '项目编号', type: 'text', group: 'basic', required: true, list: true, import: true, width: 130, placeholder: '例：JS-Ⅷ-0001', span: 'half' }),
      f({ name: 'name', label: '项目名称', type: 'text', group: 'basic', required: true, list: true, search: true, import: true, width: 220, span: 'half' }),
      f({ name: 'category_id', label: '所属类别', type: 'ref', ref: 'category', group: 'basic', required: true, list: true, filter: true, import: true, width: 160, aliases: ['类别'] }),
      f({ name: 'level_id', label: '名录级别', type: 'ref', ref: 'level', group: 'basic', required: true, list: true, filter: true, import: true, width: 110, aliases: ['级别'] }),
      f({ name: 'batch', label: '公布批次', type: 'dict', dict: 'batch', group: 'basic', list: true, filter: true, import: true, width: 110, aliases: ['批次'] }),
      f({ name: 'published_year', label: '公布年份', type: 'year', group: 'basic', list: true, import: true, width: 100, min: 1900, max: 2100 }),
      f({ name: 'region_id', label: '申报地区', type: 'ref', ref: 'region', group: 'basic', required: true, list: true, filter: true, import: true, width: 170, aliases: ['地区', '行政区划'] }),
      f({ name: 'organization_id', label: '关联保护单位', type: 'ref', ref: 'organization', group: 'basic', import: false, help: '从传承基地/保护单位库中选择，用于门户"如何探访"模块' }),
      f({ name: 'protection_unit', label: '保护单位名称', type: 'text', group: 'basic', import: true, aliases: ['保护单位'], help: '未建档的单位可直接填写文字；导入时若与基地库同名会自动关联' }),
      f({ name: 'featured', label: '首页精选推荐', type: 'bool', group: 'basic', list: true, import: true, width: 110, aliases: ['精选'], help: '勾选后出现在门户首页精选推荐区' }),
      f({ name: 'summary', label: '项目简介', type: 'textarea', group: 'content', required: true, import: true, rows: 4, span: 'full', aliases: ['简介'], help: '150-300 字，用于列表卡片与详情页导语' }),
      f({ name: 'history', label: '历史渊源', type: 'textarea', group: 'content', import: true, rows: 6, span: 'full' }),
      f({ name: 'feature', label: '技艺特征 / 表现形态', type: 'textarea', group: 'content', import: true, rows: 6, span: 'full', aliases: ['技艺特征'] }),
      f({ name: 'lineage', label: '传承谱系', type: 'textarea', group: 'heritage', import: true, rows: 5, span: 'full' }),
      f({ name: 'keywords', label: '关键词', type: 'text', group: 'heritage', import: true, span: 'full', help: '多个关键词用顿号分隔，用于门户检索' }),
      f({ name: 'video_url', label: '影像视频外链', type: 'url', group: 'media', import: true, span: 'full', aliases: ['视频链接'], help: '支持哔哩哔哩、腾讯视频等页面地址，详情页将内嵌播放' }),
      f({ name: 'cover_path', label: '封面图', type: 'image', group: 'media', span: 'full', list: true, width: 80 }),
    ],
    related: [
      { key: 'inheritors', label: '代表性传承人', resource: 'inheritor', kind: 'many' },
      { key: 'attachments', label: '多媒体档案', resource: 'attachment', kind: 'files' },
    ],
  },

  inheritor: {
    key: 'inheritor',
    label: '传承人',
    one: '传承人',
    table: 'inheritor',
    publicPath: '/inheritors',
    defaultSort: 'updated_at',
    titleField: 'name',
    codeField: 'code',
    hasRelation: true,
    fields: [
      f({ name: 'code', label: '传承人编号', type: 'text', group: 'basic', required: true, list: true, import: true, width: 130, placeholder: '例：JS-VIII-0001' }),
      f({ name: 'name', label: '姓名', type: 'text', group: 'basic', required: true, list: true, search: true, import: true, width: 110 }),
      f({ name: 'gender', label: '性别', type: 'select', options: GENDER_OPTIONS, group: 'basic', list: true, filter: true, import: true, width: 70 }),
      f({ name: 'ethnic', label: '民族', type: 'text', group: 'basic', list: true, import: true, width: 90 }),
      f({ name: 'birth_month', label: '出生年月', type: 'month', group: 'basic', import: true, width: 110, placeholder: '1958-06' }),
      f({ name: 'level_id', label: '认定级别', type: 'ref', ref: 'level', group: 'basic', required: true, list: true, filter: true, import: true, width: 110 }),
      f({ name: 'region_id', label: '所在地', type: 'ref', ref: 'region', group: 'basic', required: true, list: true, filter: true, import: true, width: 170 }),
      f({ name: 'batch', label: '认定批次', type: 'dict', dict: 'batch', group: 'basic', import: true, width: 110 }),
      f({ name: 'certified_year', label: '认定年份', type: 'year', group: 'basic', import: true, width: 100, min: 1900, max: 2100 }),
      f({ name: 'address', label: '居住地 / 传习场所', type: 'text', group: 'basic', import: true, span: 'full' }),
      f({ name: 'featured', label: '首页风采推荐', type: 'bool', group: 'basic', list: true, import: true, width: 110 }),
      f({ name: 'story_title', label: '故事标题', type: 'text', group: 'content', import: true, span: 'full', help: '门户"传承人故事"卡片标题，如：一把刻刀四十年' }),
      f({ name: 'experience', label: '从艺经历', type: 'textarea', group: 'content', import: true, rows: 6, span: 'full' }),
      f({ name: 'skill', label: '技艺特点', type: 'textarea', group: 'content', import: true, rows: 6, span: 'full' }),
      f({ name: 'honors', label: '代表作品与荣誉', type: 'textarea', group: 'content', import: true, rows: 5, span: 'full' }),
      f({ name: 'video_url', label: '影像视频外链', type: 'url', group: 'media', import: true, span: 'full' }),
      f({ name: 'photo_path', label: '肖像照', type: 'image', group: 'media', span: 'full', list: true, width: 80 }),
    ],
    related: [
      { key: 'projects', label: '代表性项目', resource: 'project', kind: 'many' },
      { key: 'attachments', label: '多媒体档案', resource: 'attachment', kind: 'files' },
    ],
  },

  organization: {
    key: 'organization',
    label: '传承基地 / 保护单位',
    one: '基地',
    table: 'organization',
    publicPath: '/organizations',
    defaultSort: 'updated_at',
    titleField: 'name',
    codeField: 'code',
    hasRelation: false,
    fields: [
      f({ name: 'code', label: '单位编号', type: 'text', group: 'basic', required: true, list: true, import: true, width: 130, placeholder: '例：JD-0001' }),
      f({ name: 'name', label: '单位名称', type: 'text', group: 'basic', required: true, list: true, search: true, import: true, width: 220 }),
      f({ name: 'org_type', label: '单位类型', type: 'dict', dict: 'org_type', group: 'basic', required: true, list: true, filter: true, import: true, width: 150, aliases: ['类型'] }),
      f({ name: 'region_id', label: '所在地区', type: 'ref', ref: 'region', group: 'basic', required: true, list: true, filter: true, import: true, width: 170 }),
      f({ name: 'founded_year', label: '成立年份', type: 'year', group: 'basic', import: true, width: 100, min: 1900, max: 2100 }),
      f({ name: 'is_open', label: '对游客开放', type: 'bool', group: 'visit', list: true, import: true, width: 110, aliases: ['对外开放'], help: '勾选后出现在门户"探访体验点"中' }),
      f({ name: 'featured', label: '首页推荐', type: 'bool', group: 'visit', list: true, import: true, width: 110, aliases: ['精选'] }),
      f({ name: 'open_hours', label: '开放时间', type: 'text', group: 'visit', list: true, import: true, span: 'full', placeholder: '周二至周日 9:00-17:00（周一闭馆）' }),
      f({ name: 'address', label: '详细地址', type: 'text', group: 'visit', import: true, span: 'full' }),
      f({ name: 'manager', label: '联系人', type: 'text', group: 'visit', import: true }),
      f({ name: 'phone', label: '预约 / 咨询电话', type: 'text', group: 'visit', import: true }),
      f({ name: 'email', label: '联系邮箱', type: 'text', group: 'visit', import: true }),
      f({ name: 'traffic', label: '交通提示', type: 'textarea', group: 'visit', import: true, rows: 3, span: 'full', help: '公交地铁线路、停车提示等，方便游客到访' }),
      f({ name: 'experience', label: '特色体验项目', type: 'textarea', group: 'visit', import: true, rows: 4, span: 'full', help: '可参与的体验、研学、手作活动说明' }),
      f({ name: 'intro', label: '单位简介', type: 'textarea', group: 'content', required: true, import: true, rows: 5, span: 'full', aliases: ['简介'] }),
      f({ name: 'cover_path', label: '封面图', type: 'image', group: 'media', span: 'full', list: true, width: 80 }),
    ],
    related: [{ key: 'attachments', label: '多媒体档案', resource: 'attachment', kind: 'files' }],
  },
};

export const RESOURCE_KEYS = Object.keys(RESOURCES);

export function getResource(key) {
  return RESOURCES[key] || null;
}

export function fieldsOf(resource, predicate) {
  return resource.fields.filter(predicate || (() => true));
}

export function fieldOf(resource, name) {
  return resource.fields.find((item) => item.name === name) || null;
}

export function listFields(resource) {
  return fieldsOf(resource, (item) => item.list);
}

export function importFields(resource) {
  return fieldsOf(resource, (item) => item.import && item.type !== 'image');
}

export function filterFields(resource) {
  return fieldsOf(resource, (item) => item.filter);
}

export function formFields(resource) {
  return fieldsOf(resource, (item) => !['code', 'status'].includes(item.name) || true);
}

const REF_TABLES = {
  category: { table: 'heritage_category', labelField: 'name', order: 'sort_order, name' },
  level: { table: 'heritage_level', labelField: 'name', order: 'sort_order, id' },
  region: { table: 'region', labelField: 'name', order: 'sort_order, name' },
  organization: { table: 'organization', labelField: 'name', order: 'name' },
};

export function refSpec(name) {
  return REF_TABLES[name] || null;
}
