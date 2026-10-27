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
  const projectsQuery = useQuery({
    queryKey: ['projects', queryValues],
    queryFn: () => publicApi.projects(queryValues),
  });
  usePageMeta({
    title: '逛非遗',
    description: '按类别、级别、地区与年份浏览已发布非物质文化遗产项目。',
  });

  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <nav className="breadcrumb">
            <Link to="/">首页</Link>
            <i>/</i>
            <span>逛非遗</span>
          </nav>
          <h1 className="page-title">非遗项目</h1>
          <p className="page-sub">按类别、级别与地区筛选已发布非遗项目。</p>
        </div>
      </section>
      <section className="wrap section">
        {optionsQuery.data ? <FilterBar mode="projects" options={optionsQuery.data} /> : null}
        {projectsQuery.isPending ? <LoadingState /> : null}
        {projectsQuery.isError ? <ErrorState error={projectsQuery.error} /> : null}
        {projectsQuery.data ? (
          <>
            <div className="list-summary">
              共找到 <strong>{projectsQuery.data.total}</strong> 条结果
              {projectsQuery.data.keyword ? `，关键词「${projectsQuery.data.keyword}」` : ''}
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
