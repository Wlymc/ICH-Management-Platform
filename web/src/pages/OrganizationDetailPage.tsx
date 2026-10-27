import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { publicApi } from '../api/client';
import { ErrorState, LoadingState } from '../components/common';
import { ProjectCard } from '../components/Cards';
import { usePageMeta } from '../hooks/usePageMeta';

export default function OrganizationDetailPage() {
  const id = Number(useParams().id);
  const query = useQuery({
    queryKey: ['organization', id],
    queryFn: () => publicApi.organization(id),
    enabled: Number.isFinite(id) && id > 0,
  });
  usePageMeta({
    title: query.data ? `${query.data.organization.name} · 非遗传承基地` : '传承基地详情',
    description: query.data
      ? `${query.data.organization.name}：${
          query.data.organization.intro || '查看开放信息、体验项目与关联非遗项目。'
        }`
      : '查看非遗探访体验点的公开信息。',
    type: 'article',
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState error={query.error} />;
  const { organization, projects } = query.data;
  return (
    <>
      <section className="page-head">
        <div className="wrap">
          <nav className="breadcrumb">
            <Link to="/">首页</Link>
            <i>/</i>
            <Link to="/organizations">探访线索</Link>
            <i>/</i>
            <span>{organization.name}</span>
          </nav>
          <h1 className="page-title">{organization.name}</h1>
          <p className="page-sub">{organization.intro}</p>
        </div>
      </section>
      <section className="wrap detail-body">
        <div className="detail-main">
          <section className="block visit-card">
            <h2 className="section-title">探访信息</h2>
            <div className="visit-grid">
              <div>
                <dt>开放时间</dt>
                <dd>{organization.openHours || '请提前咨询'}</dd>
              </div>
              <div>
                <dt>详细地址</dt>
                <dd>{organization.address || '待核实'}</dd>
              </div>
              <div>
                <dt>预约电话</dt>
                <dd>{organization.phone || '待核实'}</dd>
              </div>
              <div>
                <dt>联系人</dt>
                <dd>{organization.manager || '待核实'}</dd>
              </div>
              <div className="is-wide">
                <dt>交通提示</dt>
                <dd>{organization.traffic || '待补充'}</dd>
              </div>
            </div>
          </section>
          {projects.length ? (
            <section className="block">
              <h2 className="section-title">在此保护传承的项目</h2>
              <div className="card-grid">
                {projects.map((project) => (
                  <ProjectCard project={project} key={project.id} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <aside className="detail-side">
          <div className="side-card">
            <h3>参观提示</h3>
            <p>具体地址、电话与预约方式仅在核实后展示，请以当地文旅部门公布信息为准。</p>
          </div>
        </aside>
      </section>
    </>
  );
}
