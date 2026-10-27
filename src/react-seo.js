import { BRAND } from './config.js';
import {
  getPublicInheritor,
  getPublicOrganization,
  getPublicProject,
} from './public-api.js';
import { h } from './util.js';

const DEFAULT_DESCRIPTION =
  '非遗数字管理平台面向公众展示非物质文化遗产项目、传承人、文化关系、三维器物与探访线索。';

function clean(value, max = 160) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function routeMeta(pathname, origin) {
  const normalized = pathname.replace(/\/+$/, '') || '/';
  let title = '非遗数字展馆';
  let description = DEFAULT_DESCRIPTION;
  let type = 'website';

  if (normalized === '/projects') {
    title = '逛非遗';
    description = '按非遗类别、名录级别、公布年份和申报地区筛选项目，查看真实档案与传承脉络。';
  } else if (normalized === '/inheritors') {
    title = '传承人人物志';
    description = '浏览各级非物质文化遗产代表性传承人，了解他们的技艺、经历与代表项目。';
  } else if (normalized === '/explore') {
    title = '非遗探索';
    description = '通过地域星图、项目关系和文化谱系，探索非遗项目之间以及项目与传承人之间的联系。';
  } else if (normalized === '/organizations') {
    title = '探访线索';
    description = '按地区查看国家级非遗分布、传承人线索与已核实保护单位，规划实地探访路线。';
  } else {
    const projectMatch = normalized.match(/^\/projects\/(\d+)$/);
    const inheritorMatch = normalized.match(/^\/inheritors\/(\d+)$/);
    const organizationMatch = normalized.match(/^\/organizations\/(\d+)$/);

    if (projectMatch) {
      const detail = getPublicProject(Number(projectMatch[1]));
      if (detail) {
        title = `${detail.project.name} · 非遗档案`;
        description = `${detail.project.name}：${
          clean(detail.project.summary || detail.project.history) ||
          '查看项目类别、地区、历史、技艺、传承人和三维模型。'
        }`;
        type = 'article';
      } else {
        title = '非遗项目详情';
        description = '查看非物质文化遗产项目的渊源、技艺、传承人、关系与三维模型。';
        type = 'article';
      }
    } else if (inheritorMatch) {
      const detail = getPublicInheritor(Number(inheritorMatch[1]));
      if (detail) {
        title = `${detail.inheritor.name} · 非遗传承人`;
        description = `${detail.inheritor.name}：${
          clean(
            detail.inheritor.storyTitle ||
              detail.inheritor.experience ||
              detail.inheritor.skill,
          ) || '了解从艺经历、代表项目与技艺。'
        }`;
        type = 'article';
      } else {
        title = '传承人档案';
        description = '了解非物质文化遗产代表性传承人的从艺经历、代表项目与技艺。';
        type = 'article';
      }
    } else if (organizationMatch) {
      const detail = getPublicOrganization(Number(organizationMatch[1]));
      if (detail) {
        title = `${detail.organization.name} · 非遗传承基地`;
        description = `${detail.organization.name}：${
          clean(detail.organization.intro || detail.organization.experience) ||
          '查看开放信息、体验项目与关联非遗项目。'
        }`;
        type = 'article';
      } else {
        title = '传承基地详情';
        description = '查看非遗传承基地的开放信息、体验项目与关联非遗项目。';
        type = 'article';
      }
    }
  }

  const fullTitle = `${title} · ${BRAND.name}`;
  return {
    title: fullTitle,
    description: clean(description, 180),
    type,
    canonical: new URL(pathname || '/', origin).href,
  };
}

function replaceTag(html, pattern, replacement) {
  return pattern.test(html) ? html.replace(pattern, replacement) : html.replace('</head>', `${replacement}\n</head>`);
}

export function renderReactSeo(template, { pathname, origin }) {
  const meta = routeMeta(pathname, origin);
  let html = replaceTag(
    template,
    /<title>[\s\S]*?<\/title>/i,
    `<title>${h(meta.title)}</title>`,
  );
  html = replaceTag(
    html,
    /<meta\s+name="description"[^>]*>/i,
    `<meta name="description" content="${h(meta.description)}" />`,
  );
  html = replaceTag(
    html,
    /<meta\s+property="og:title"[^>]*>/i,
    `<meta property="og:title" content="${h(meta.title)}" />`,
  );
  html = replaceTag(
    html,
    /<meta\s+property="og:description"[^>]*>/i,
    `<meta property="og:description" content="${h(meta.description)}" />`,
  );
  html = replaceTag(
    html,
    /<meta\s+property="og:type"[^>]*>/i,
    `<meta property="og:type" content="${h(meta.type)}" />`,
  );
  html = replaceTag(
    html,
    /<meta\s+property="og:url"[^>]*>/i,
    `<meta property="og:url" content="${h(meta.canonical)}" />`,
  );
  html = replaceTag(
    html,
    /<link\s+rel="canonical"[^>]*>/i,
    `<link rel="canonical" href="${h(meta.canonical)}" />`,
  );
  return html;
}
