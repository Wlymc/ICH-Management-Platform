import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { publicApi } from '../api/client';
import { ErrorState, EmptyState, LoadingState } from '../components/common';
import { ProjectCard } from '../components/Cards';
import { FilterBar } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';
import { usePageMeta } from '../hooks/usePageMeta';

export default function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const queryValues = Object.fromEntries(params.entries());
  const optionsQuery = useQuery({ queryKey: ['filter-options'], queryFn: publicApi.options });
  const modelsQuery = useQuery({ queryKey: ['model-gallery'], queryFn: publicApi.models });
  const projectsQuery = useQuery({
    queryKey: ['projects', queryValues],
    queryFn: () => publicApi.projects(queryValues),
  });

  usePageMeta({
    title: '逛非遗',
    description: '按类别、级别、地区、年份与三维模型浏览已发布非物质文化遗产项目。',
  });

  const setQuickFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };

  const resetQuickFilter = () => {
    const next = new URLSearchParams(params);
    next.delete('category_id');
    next.delete('has_3d');
    next.delete('page');
    setParams(next);
  };

  const categoryId = params.get('category_id') || '';
  const has3d = params.get('has_3d') || '';
  const quickCategories = optionsQuery.data?.categories.slice(0, 6) || [];
  const featured3d = modelsQuery.data?.projects.slice(0, 6) || [];

  return (
    <>
      <section className="page-head projects-page-head">
        <div className="wrap">
          <nav className="breadcrumb">
            <Link to="/">首页</Link>
            <i>/</i>
            <span>逛非遗</span>
          </nav>
          <div className="projects-head-grid">
            <div>
              <p className="page-eyebrow">EXPLORE ICH · 非遗策展</p>
              <h1 className="page-title">从一项技艺，走进一方文化</h1>
              <p className="page-sub">
                按门类、地区、级别和三维模型浏览非遗项目，找到值得继续了解的文化线索。
              </p>
              <div className="projects-head-stats">
                <span>
                  <b>{projectsQuery.data?.total ?? '—'}</b> 个当前结果
                </span>
                <span>
                  <b>{modelsQuery.data?.stats.projects ?? '—'}</b> 个可看 3D
                </span>
                <span>
                  <b>{optionsQuery.data?.categories.length ?? '—'}</b> 个门类
                </span>
              </div>
            </div>
            <div className="projects-head-actions">
              <Link className="btn btn-primary" to="/models">
                进入三维器物馆 →
              </Link>
              <Link className="btn btn-ghost" to="/explore">
                打开非遗星图
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap section projects-browser">
        <div className="project-quick-filters" aria-label="快捷筛选">
          <button
            className={!categoryId && !has3d ? 'is-active' : ''}
            type="button"
            onClick={resetQuickFilter}
          >
            全部项目
          </button>
          <button
            className={has3d === '1' ? 'is-active is-3d' : 'is-3d'}
            type="button"
            onClick={() => setQuickFilter('has_3d', has3d === '1' ? '' : '1')}
          >
            可看 3D 模型
          </button>
          {quickCategories.map((category) => (
            <button
              className={categoryId === String(category.id) ? 'is-active' : ''}
              type="button"
              onClick={() =>
                setQuickFilter(
                  'category_id',
                  categoryId === String(category.id) ? '' : String(category.id),
                )
              }
              key={category.id}
            >
              {category.name}
            </button>
          ))}
        </div>

        <section className="project-3d-feature">
          <header>
            <div>
              <span>FEATURED 3D · 三维专题</span>
              <h2>可以旋转细看的非遗</h2>
            </div>
            <Link to="/models">查看全部 15 个模型 →</Link>
          </header>
          <div className="project-3d-rail">
            {featured3d.map((project, index) => (
              <Link
                className="project-3d-chip"
                to={`/models?project=${project.id}`}
                key={project.id}
              >
                <span>{String(index + 1).padStart(2, '0')}</span>
                <strong>{project.name}</strong>
                <small>
                  {project.categoryName} · {project.models.length} 个模型
                </small>
              </Link>
            ))}
          </div>
        </section>

        {optionsQuery.data ? <FilterBar mode="projects" options={optionsQuery.data} /> : null}

        {projectsQuery.isPending ? <LoadingState /> : null}
        {projectsQuery.isError ? <ErrorState error={projectsQuery.error} /> : null}
        {projectsQuery.data ? (
          <>
            <div className="list-summary project-list-summary">
              <span>
                共找到 <strong>{projectsQuery.data.total}</strong> 条结果
                {projectsQuery.data.keyword ? `，关键词「${projectsQuery.data.keyword}」` : ''}
              </span>
              {(categoryId || has3d) && (
                <button type="button" onClick={resetQuickFilter}>
                  清除快捷筛选
                </button>
              )}
            </div>
            <div className="card-grid">
              {projectsQuery.data.items.length ? (
                projectsQuery.data.items.map((project) => (
                  <ProjectCard project={project} key={project.id} />
                ))
              ) : (
                <EmptyState title="没有符合条件的项目" hint="试试减少筛选条件或更换关键词。" />
              )}
            </div>
            <Pagination
              page={projectsQuery.data.page}
              totalPages={projectsQuery.data.totalPages}
              onChange={(page) => {
                const next = new URLSearchParams(params);
                next.set('page', String(page));
                setParams(next);
              }}
            />
          </>
        ) : null}
      </section>
    </>
  );
}
