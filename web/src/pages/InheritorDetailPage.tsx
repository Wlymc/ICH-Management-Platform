import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { publicApi } from '../api/client';
import { ErrorState, LoadingState } from '../components/common';
import { InheritorCard, ProjectCard } from '../components/Cards';
import { usePageMeta } from '../hooks/usePageMeta';
import { useAppStore } from '../stores/useAppStore';
import { formatYear } from '../utils';

function PersonNarrative({
  index,
  title,
  content,
}: {
  index: string;
  title: string;
  content: string;
}) {
  if (!content) return null;
  return (
    <section className="block person-narrative">
      <div className="person-narrative-index" aria-hidden="true">
        {index}
      </div>
      <div className="person-narrative-body">
        <h2 className="section-title">{title}</h2>
        <p className="prose">{content}</p>
      </div>
    </section>
  );
}

export default function InheritorDetailPage() {
  const id = Number(useParams().id);
  const setAssistantContext = useAppStore((state) => state.setAssistantContext);
  const query = useQuery({
    queryKey: ['inheritor', id],
    queryFn: () => publicApi.inheritor(id),
    enabled: Number.isFinite(id) && id > 0,
  });
  usePageMeta({
    title: query.data ? `${query.data.inheritor.name} · 非遗传承人` : '传承人档案',
    description: query.data
      ? `${query.data.inheritor.name}：${
          query.data.inheritor.storyTitle ||
          query.data.inheritor.skill ||
          '查看从艺经历、代表项目与技艺。'
        }`
      : '查看非遗传承人的从艺经历、技艺与代表项目。',
    type: 'article',
  });

  useEffect(() => {
    setAssistantContext({ page: 'inheritor' });
  }, [setAssistantContext]);

  if (query.isPending) return <LoadingState label="正在读取传承人档案…" />;
  if (query.isError) return <ErrorState error={query.error} />;

  const { inheritor, projects, sameCategory, attachments } = query.data;
  const mark = Array.from(inheritor.name || '传')
    .slice(0, 2)
    .join('');
  const watermark = Array.from(inheritor.name || '传')[0] || '传';
  const story =
    inheritor.storyTitle || inheritor.skill || inheritor.experience || '人物档案与传承实践记录';
  const facts = [
    ['认定级别', inheritor.levelName],
    ['所在地', inheritor.regionLabel],
    ['民族', inheritor.ethnic],
    ['从艺起始', formatYear(inheritor.careerStartYear)],
  ].filter(([, value]) => value);
  const images = attachments.filter((item) => item.kind === 'image' && item.url);

  return (
    <>
      <section className="detail-hero inheritor-hero">
        <span className="inheritor-hero-watermark" aria-hidden="true">
          {watermark}
        </span>
        <div className="wrap detail-hero-inner">
          <nav className="breadcrumb">
            <Link to="/">首页</Link>
            <i>/</i>
            <Link to="/inheritors">传承人</Link>
            <i>/</i>
            <span>{inheritor.name}</span>
          </nav>
          <div className="inheritor-hero-grid">
            <div className="inheritor-seal" aria-hidden="true">
              <span>{mark}</span>
            </div>
            <div className="inheritor-hero-copy">
              <div className="detail-tags">
                <span className="chip chip-solid">{inheritor.levelName}</span>
                {inheritor.ethnic ? (
                  <span className="chip chip-solid">{inheritor.ethnic}</span>
                ) : null}
                {inheritor.batch ? (
                  <span className="chip chip-solid">{inheritor.batch}</span>
                ) : null}
              </div>
              <p className="inheritor-hero-kicker">代表性传承人 · 人物志</p>
              <h1 className="detail-title">{inheritor.name}</h1>
              <p className="detail-lead">{story}</p>
              {facts.length ? (
                <div className="inheritor-hero-facts">
                  {facts.map(([label, value]) => (
                    <span key={label}>
                      <b>{value}</b>
                      <em>{label}</em>
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="wrap detail-body">
        <div className="detail-main">
          <dl className="meta-grid meta-grid-person">
            {[
              ['档案编号', inheritor.code],
              ['官方编号', inheritor.sourceCode],
              ['性别', inheritor.gender],
              ['民族', inheritor.ethnic],
              ['出生年月', inheritor.birthMonth],
              ['从艺起始', formatYear(inheritor.careerStartYear)],
              ['认定级别', inheritor.levelName],
              ['认定批次', inheritor.batch],
              ['所在地', inheritor.regionLabel],
              ['传习场所', inheritor.address],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div className="meta-item" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>

          <PersonNarrative index="01" title="从艺经历" content={inheritor.experience} />
          <PersonNarrative index="02" title="技艺特点" content={inheritor.skill} />
          <PersonNarrative index="03" title="代表作品与荣誉" content={inheritor.honors} />

          {images.length ? (
            <section className="block person-media-block">
              <div className="person-narrative-index" aria-hidden="true">
                影
              </div>
              <div className="person-narrative-body">
                <h2 className="section-title">人物影像</h2>
                <div className="gallery-grid is-2col">
                  {images.map((image) => (
                    <figure className="gallery-item" key={image.id}>
                      <img src={image.url} alt={inheritor.name} loading="lazy" />
                      <figcaption>{image.title || image.fileName}</figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {projects.length ? (
            <section className="block person-related-block">
              <h2 className="section-title">代表性项目</h2>
              <div className="card-grid">
                {projects.map((project) => (
                  <ProjectCard project={project} key={project.id} />
                ))}
              </div>
            </section>
          ) : null}

          {sameCategory.length ? (
            <section className="block person-related-block">
              <h2 className="section-title">同类传承人</h2>
              <div className="card-grid person-card-grid">
                {sameCategory.map((person) => (
                  <InheritorCard inheritor={person} key={person.id} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="detail-side">
          <div className="side-card person-profile-card">
            <span className="side-card-eyebrow">PERSONAL ARCHIVE</span>
            <h3>{inheritor.name}</h3>
            <dl className="side-facts">
              {facts.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {inheritor.code ? <p className="side-code">档案编号 · {inheritor.code}</p> : null}
          </div>
          {projects.length ? (
            <div className="side-card">
              <h3>传承项目</h3>
              <ul className="side-list">
                {projects.map((project) => (
                  <li key={project.id}>
                    <Link to={`/projects/${project.id}`}>{project.name}</Link>
                    <em>{project.categoryName}</em>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="side-card side-note-card">
            <h3>资料说明</h3>
            <p>
              {inheritor.dataNote ||
                '本页以文字、口述与项目档案呈现传承人信息；权威信息以官方公布为准。'}
            </p>
          </div>
          <div className="side-card star-locate-card">
            <h3>关系谱系</h3>
            <p>从传承人出发，查看其关联项目、门类与地区在关系谱系中的位置。</p>
            <Link
              className="btn btn-ghost btn-block"
              to={`/explore?lens=person&inheritor=${inheritor.id}`}
            >
              查看关系谱系 →
            </Link>
          </div>
        </aside>
      </section>
    </>
  );
}
