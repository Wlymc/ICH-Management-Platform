import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { publicApi } from '../api/client';
import { ErrorState, LoadingState } from '../components/common';
import { InheritorCard, ProjectCard } from '../components/Cards';
import { Model3D } from '../components/Model3D';
import { ProjectNarration } from '../components/ProjectNarration';
import { useAppStore } from '../stores/useAppStore';
import { formatYear, splitKeywords } from '../utils';
import { usePageMeta } from '../hooks/usePageMeta';

export default function ProjectDetailPage() {
  const id = Number(useParams().id);
  const setAssistantContext = useAppStore((state) => state.setAssistantContext);
  const query = useQuery({
    queryKey: ['project', id],
    queryFn: () => publicApi.project(id),
    enabled: Number.isFinite(id) && id > 0,
  });
  usePageMeta({
    title: query.data ? `${query.data.project.name} · 非遗档案` : '非遗项目详情',
    description: query.data
      ? `${query.data.project.name}：${
          query.data.project.summary || '查看项目渊源、技艺、传承人、关系与三维模型。'
        }`
      : '查看非物质文化遗产项目的渊源、技艺、传承人、关系与三维模型。',
    type: 'article',
  });

  useEffect(() => {
    if (!query.data) return;
    setAssistantContext({
      page: 'project',
      projectId: query.data.project.id,
      projectName: query.data.project.name,
    });
  }, [query.data, setAssistantContext]);

  if (query.isPending) return <LoadingState label="正在读取项目档案…" />;
  if (query.isError) return <ErrorState error={query.error} />;
  const { project, inheritors, relatedProjects, organization, attachments } = query.data;
  const images = attachments.filter((attachment) => attachment.kind === 'image' && attachment.url);
  const files = attachments.filter((attachment) => attachment.kind !== 'image');

  return (
    <>
      <section
        className="detail-hero"
        style={project.coverUrl ? { backgroundImage: `url("${project.coverUrl}")` } : undefined}
      >
        <div className="wrap detail-hero-inner">
          <nav className="breadcrumb">
            <Link to="/">首页</Link>
            <i>/</i>
            <Link to="/projects">逛非遗</Link>
            <i>/</i>
            <span>{project.name}</span>
          </nav>
          <div className="detail-tags">
            <span className="chip chip-solid">{project.categoryName}</span>
            <span className="chip chip-solid">{project.levelName}</span>
            {project.batch ? <span className="chip chip-solid">{project.batch}</span> : null}
          </div>
          <h1 className="detail-title">{project.name}</h1>
          <p className="detail-lead">{project.summary || '档案简介正在完善中。'}</p>
        </div>
      </section>

      <section className="wrap detail-body">
        <div className="detail-main">
          <dl className="meta-grid">
            {[
              ['项目编号', project.code],
              ['官方编号', project.sourceCode],
              ['所属类别', project.categoryName],
              ['名录级别', project.levelName],
              ['公布批次', project.batch],
              ['公布年份', formatYear(project.publishedYear)],
              ['申报地区', project.regionText || project.regionLabel],
              ['保护单位', project.organizationName || project.protectionUnit],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div className="meta-item" key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          {project.contentSource ? (
            <p className="content-source">内容来源：{project.contentSource}</p>
          ) : null}
          {project.history ? (
            <section className="block">
              <h2 className="section-title">历史渊源</h2>
              <p className="prose">{project.history}</p>
            </section>
          ) : null}
          {project.feature ? (
            <section className="block">
              <h2 className="section-title">技艺特征与表现形态</h2>
              <p className="prose">{project.feature}</p>
            </section>
          ) : null}
          {project.lineage ? (
            <section className="block">
              <h2 className="section-title">传承谱系</h2>
              <p className="prose">{project.lineage}</p>
            </section>
          ) : null}
          <ProjectNarration projectId={project.id} projectName={project.name} />
          <Model3D models={project.models} />

          {images.length ? (
            <section className="block">
              <h2 className="section-title">影像与档案</h2>
              <div className="gallery-grid is-2col">
                {images.map((image) => (
                  <figure className="gallery-item" key={image.id}>
                    <img src={image.url} alt={image.title || project.name} loading="lazy" />
                    <figcaption>{image.title || image.fileName}</figcaption>
                  </figure>
                ))}
              </div>
            </section>
          ) : null}
          {files.length ? (
            <section className="block">
              <ul className="file-list">
                {files.map((file) => (
                  <li className="file-row" key={file.id}>
                    <span className="file-kind">{file.kind}</span>
                    <a href={file.url || file.externalUrl} target="_blank" rel="noreferrer">
                      {file.title || file.fileName}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {inheritors.length ? (
            <section className="block">
              <h2 className="section-title">代表性传承人</h2>
              <div className="card-grid">
                {inheritors.map((inheritor) => (
                  <InheritorCard inheritor={inheritor} key={inheritor.id} />
                ))}
              </div>
            </section>
          ) : null}
          {relatedProjects.length ? (
            <section className="block">
              <h2 className="section-title">相关项目</h2>
              <div className="card-grid">
                {relatedProjects.map((item) => (
                  <ProjectCard project={item} key={item.id} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <aside className="detail-side">
          <div className="side-card">
            <h3>游客提示</h3>
            <p>本页信息以公开名录和平台已发布档案为准，参观和体验请提前确认开放安排。</p>
          </div>
          {splitKeywords(project.keywords).length ? (
            <div className="side-card">
              <h3>关键词</h3>
              <div className="chip-row">
                {splitKeywords(project.keywords).map((keyword) => (
                  <Link
                    className="chip chip-link"
                    to={`/projects?q=${encodeURIComponent(keyword)}`}
                    key={keyword}
                  >
                    {keyword}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          {organization ? (
            <div className="side-card">
              <h3>关联保护单位</h3>
              <Link to={`/organizations/${organization.id}`}>{organization.name}</Link>
            </div>
          ) : null}
          <div className="side-card star-locate-card">
            <h3>从关系里看</h3>
            <p>把项目放回门类、地区与传承人之间观察它的文化位置。</p>
            <Link className="btn btn-primary" to={`/explore?lens=project&project=${project.id}`}>
              打开星图
            </Link>
          </div>
        </aside>
      </section>
    </>
  );
}
