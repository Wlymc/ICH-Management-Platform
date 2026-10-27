import { all, get } from './db.js';
import { dicts } from './dict.js';

const MODES = {
  brief: { label: '简短版', hint: '约 1 分钟，适合快速导览' },
  detailed: { label: '详细版', hint: '约 3 分钟，适合项目页与展厅' },
  child: { label: '儿童版', hint: '语言浅显，适合亲子研学' },
};

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clip(value, length = 360) {
  const content = clean(value);
  if (content.length <= length) return content;
  const slice = content.slice(0, length);
  const stop = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('；'), slice.lastIndexOf('，'));
  return `${slice.slice(0, stop > length * 0.55 ? stop + 1 : length)}…`;
}

function sentence(value) {
  const content = clean(value);
  if (!content) return '';
  return /[。！？]$/.test(content) ? content : `${content}。`;
}

function modeOf(value) {
  return Object.hasOwn(MODES, value) ? value : 'brief';
}

function makeSections(row, inheritors, mode) {
  const region = (row.region_id ? dicts().regionLabel(row.region_id) : '相关地区').replace(/\s*\/\s*/g, '，');
  const category = row.category_name || '未分类';
  const level = row.level_name || '未定级';
  const people = inheritors.map((item) => item.name).filter(Boolean);
  const yearText = row.published_year ? `${row.published_year}年` : '';
  const batchText = row.batch ? `${row.batch}` : '';
  const listing = [yearText, batchText].filter(Boolean).join('');
  const summary = clip(row.summary, mode === 'child' ? 120 : 220);
  const history = clip(row.history, 380);
  const feature = clip(row.feature, 360);
  const lineage = clip(row.lineage, 300);
  const keywords = clean(row.keywords);
  const peopleText = people.length
    ? `站内档案关联的传承人包括${people.slice(0, 4).join('、')}${people.length > 4 ? '等' : ''}。`
    : '目前站内档案尚未记录关联传承人。';
  const intro = `${row.name}位于${region}，属于${category}类${level}非物质文化遗产代表性项目${listing ? `，${listing}公布` : ''}。`;

  if (mode === 'child') {
    return [
      { title: '认识这个项目', text: `${intro}${summary || '它的故事和技艺细节，站内档案还在继续补充。'}` },
      {
        title: '它特别在哪里',
        text: feature
          ? clip(feature, 180)
          : '它保存着当地人的生活方式、审美经验和代代相传的手上功夫，是活着的文化记忆。',
      },
      {
        title: '谁在守护它',
        text: `${peopleText}${lineage ? clip(lineage, 150) : '了解它，可以从认识一位传承人、观看一次技艺展示开始。'}`,
      },
    ];
  }

  if (mode === 'detailed') {
    return [
      { title: '项目概览', text: `${intro}${summary}` },
      { title: '历史渊源', text: history || '站内档案中的历史渊源内容正在持续补充。' },
      { title: '技艺与特征', text: feature || '站内档案中的技艺流程与代表性特征内容正在持续补充。' },
      { title: '传承脉络', text: `${peopleText}${lineage}` },
      {
        title: '档案线索',
        text: `${row.protection_unit ? `档案记录的保护单位为${row.protection_unit}。` : ''}${keywords ? `项目关键词包括${keywords}。` : ''}本讲解依据站内已发布档案整理，具体工序、谱系和活动信息以保护单位公布内容为准。`,
      },
    ];
  }

  return [{
    title: '一分钟认识',
    text: `${intro}${summary || feature || '项目的历史、技艺与传承信息可在完整档案中继续查看。'}${peopleText}`,
  }];
}

export function buildProjectNarration(projectId, modeValue = 'brief') {
  const id = Number(projectId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const project = get(
    `SELECT p.id, p.name, p.region_id, p.batch, p.published_year, p.summary, p.history,
            p.feature, p.lineage, p.keywords, p.protection_unit, p.cover_path,
            c.name AS category_name, l.name AS level_name
     FROM project p
     LEFT JOIN heritage_category c ON c.id = p.category_id
     LEFT JOIN heritage_level l ON l.id = p.level_id
     WHERE p.id = ? AND p.status = 'published'`,
    [id],
  );
  if (!project) return null;
  const inheritors = all(
    `SELECT i.id, i.name
     FROM project_inheritor pi
     JOIN inheritor i ON i.id = pi.inheritor_id
     WHERE pi.project_id = ? AND i.status = 'published'
     ORDER BY i.name`,
    [id],
  );
  const mode = modeOf(modeValue);
  const sections = makeSections(project, inheritors, mode)
    .map((item) => ({ title: item.title, text: sentence(item.text) }))
    .filter((item) => item.text);
  return {
    project: {
      id: Number(project.id),
      name: project.name,
      href: `/projects/${project.id}`,
      coverPath: project.cover_path || '',
      category: project.category_name || '未分类',
      level: project.level_name || '未定级',
      region: project.region_id ? dicts().regionLabel(project.region_id) : '地区待补',
      inheritors: inheritors.map((item) => item.name),
    },
    mode,
    label: MODES[mode].label,
    hint: MODES[mode].hint,
    title: `${project.name} · ${MODES[mode].label}`,
    sections,
    script: sections.map((item) => `${item.title}。${item.text}`).join('\n'),
    source: '站内已发布档案',
    generatedAt: new Date().toISOString(),
  };
}

export { MODES as NARRATION_MODES };
