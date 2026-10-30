import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { publicApi } from '../api/client';
import { EmptyState, ErrorState, LoadingState } from '../components/common';
import { usePageMeta } from '../hooks/usePageMeta';

export default function OrganizationsPage() {
  const query = useQuery({ queryKey: ['visit-guide'], queryFn: publicApi.visitGuide });
  usePageMeta({
    title: '探访线索',
    description: '按地区查看国家级非遗分布、传承人线索与已核实保护单位，规划实地探访路线。',
  });

  return (
    <>
      <section className="page-head visit-page-head">
        <div className="wrap">
          <nav className="breadcrumb">
            <Link to="/">首页</Link>
            <i>/</i>
            <span>探访线索</span>
          </nav>
          <p className="page-eyebrow">VISIT GUIDE · 地域探访</p>
          <h1 className="page-title">探访线索</h1>
          <p className="page-sub">按地区查看国家级非遗分布，规划你的实地探访路线。</p>
        </div>
      </section>

      <section className="wrap section">
        <div className="visit-note">
          <b>关于本栏目</b>
          <p>
            这里只展示官方名录可支撑的地区与项目信息。具体保护单位、开放时间与预约方式因机构而异，请以当地文化和旅游部门公布信息为准；我们不会展示未核实的联系方式。
          </p>
        </div>

        {query.isPending ? <LoadingState label="正在整理探访线索…" /> : null}
        {query.isError ? <ErrorState error={query.error} /> : null}
        {query.data ? (
          <div className="card-grid">
            {query.data.provinces.length ? (
              query.data.provinces.map((province) => (
                <article className="card card-visit" key={province.id}>
                  <div className="card-body">
                    <div className="card-tags">
                      <span className="chip chip-plain">{province.name}</span>
                      {province.projectCount ? (
                        <span className="chip chip-red">项目 {province.projectCount}</span>
                      ) : null}
                      {province.inheritorCount ? (
                        <span className="chip chip-green">传承人 {province.inheritorCount}</span>
                      ) : null}
                    </div>
                    <h3 className="card-title">{province.name}的非遗线索</h3>
                    {province.samples.length ? (
                      <div className="visit-samples">
                        {province.samples.map((sample) => (
                          <Link
                            className="visit-sample"
                            to={`/projects/${sample.id}`}
                            key={sample.id}
                          >
                            {sample.name}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="card-text">该地区暂无已发布代表项目。</p>
                    )}
                    <p className="visit-hint">
                      具体保护单位、开放时间与预约方式，请以当地文化和旅游部门公布信息为准。
                    </p>
                    <div className="card-foot">
                      <span className="card-loc">共 {province.projectCount} 个关联项目</span>
                      <Link className="card-go" to={`/projects?region_id=${province.id}`}>
                        查看全部 →
                      </Link>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <EmptyState
                title="暂无探访线索"
                hint="待官方名录地区数据补齐后，将在这里生成探访路线。"
              />
            )}
          </div>
        ) : null}
      </section>

      {query.data?.verifiedOrganizations.length ? (
        <section className="wrap section">
          <header className="section-head">
            <div>
              <h2 className="section-title">已核实的保护单位</h2>
              <p className="section-sub">以下信息已由保护单位或当地文旅部门核实。</p>
            </div>
          </header>
          <div className="card-grid">
            {query.data.verifiedOrganizations.map((organization) => (
              <Link
                className="card card-visit"
                to={`/organizations/${organization.id}`}
                key={organization.id}
              >
                <div className="card-body">
                  <div className="card-tags">
                    <span className="chip chip-green">已核实</span>
                    <span className="chip chip-plain">{organization.orgType || '保护单位'}</span>
                  </div>
                  <h3 className="card-title">{organization.name}</h3>
                  <ul className="card-meta-list">
                    <li>
                      <b>地址</b>
                      {organization.address || '—'}
                    </li>
                    <li>
                      <b>开放</b>
                      {organization.openHours || '请电话咨询'}
                    </li>
                    <li>
                      <b>电话</b>
                      {organization.phone || '—'}
                    </li>
                  </ul>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
