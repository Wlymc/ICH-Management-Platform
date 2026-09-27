import { all } from './db.js';
import { dicts } from './dict.js';

/** 为视图准备字典、下拉选项与用户映射 */
export function viewDicts() {
  const d = dicts();
  const users = new Map(all('SELECT id, display_name FROM app_user').map((u) => [Number(u.id), u.display_name]));

  const refOptions = (ref) => {
    if (ref === 'category') return d.categories.map((c) => ({ id: c.id, label: `${c.code ? `${c.code} ` : ''}${c.name}` }));
    if (ref === 'level') return d.levels.map((l) => ({ id: l.id, label: l.name }));
    if (ref === 'region') return d.regions.map((r) => ({ id: r.id, label: d.regionLabel(r.id) }));
    if (ref === 'organization') {
      return d.organizations.map((o) => ({
        id: o.id,
        label: `${o.name}${o.region_id ? `（${d.regionLabel(o.region_id)}）` : ''}`,
      }));
    }
    return [];
  };

  const dictOptions = (kind) => (kind === 'batch' ? d.batches : kind === 'org_type' ? d.orgTypes : []);

  const inheritorOptions = all(
    `SELECT i.id, i.name, i.status, l.name AS level_name
     FROM inheritor i LEFT JOIN heritage_level l ON l.id = i.level_id
     ORDER BY l.sort_order, i.name`,
  );
  const projectOptions = all(
    `SELECT p.id, p.name, p.status, c.name AS category_name
     FROM project p LEFT JOIN heritage_category c ON c.id = p.category_id
     ORDER BY c.sort_order, p.name`,
  );

  return {
    ...d,
    userName: (id) => users.get(Number(id)) || '—',
    refOptions,
    dictOptions,
    inheritorOptions,
    projectOptions,
  };
}
