import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { publicApi } from '../api/client';
import { ErrorState, LoadingState, SectionHeading } from '../components/common';
import { InheritorCard, ProjectCard } from '../components/Cards';
import { AssistantInline } from '../components/Assistant';
import { usePageMeta } from '../hooks/usePageMeta';

export default function HomePage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const [heroVideoReady, setHeroVideoReady] = useState(false);
  const [allowHeroPlayback, setAllowHeroPlayback] = useState(() => {
    if (typeof window === 'undefined') return false;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !connection?.saveData;
  });
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const query = useQuery({ queryKey: ['home'], queryFn: publicApi.home });
  const modelsQuery = useQuery({ queryKey: ['model-gallery'], queryFn: publicApi.models });
  usePageMeta({
    title: '非遗数字展馆',
    description: '非遗项目、传承人、文化关系探索、AI 小遗与三维器物展示。',
  });

  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    const applyPlayback = () => {
      const allowed = !reducedMotion.matches && !connection?.saveData;
      setAllowHeroPlayback(allowed);
      if (!allowed) {
        video.pause();
        return;
      }
      void video.play().catch(() => {
        setHeroVideoReady(false);
      });
    };
    applyPlayback();
    reducedMotion.addEventListener?.('change', applyPlayback);
    return () => reducedMotion.removeEventListener?.('change', applyPlayback);
  }, []);

  if (query.isPending) return <LoadingState label="正在点亮非遗门户…" />;
  if (query.isError) return <ErrorState error={query.error} />;
  const data = query.data;

  return (
    <>
      <section className="hero react-home-hero">
        <div className="hero-video-layer" aria-hidden="true">
          <video
            ref={heroVideoRef}
            className={heroVideoReady ? 'is-ready' : ''}
            autoPlay={allowHeroPlayback}
            muted
            loop
            playsInline
            preload="metadata"
            tabIndex={-1}
            disablePictureInPicture
            onCanPlay={() => setHeroVideoReady(true)}
            onError={() => setHeroVideoReady(false)}
          >
            <source
              src="/assets/videos/hero-ich-720.mp4"
              media="(max-width: 760px)"
              type="video/mp4"
            />
            <source src="/assets/videos/hero-ich-1080.mp4" type="video/mp4" />
          </video>
        </div>
        <div className="wrap hero-inner">
          <div>
            <p className="hero-eyebrow">非物质文化遗产 · 数字资源平台</p>
            <h1 className="hero-title">遗脉 · 非遗数字展馆</h1>
            <p className="hero-subtitle">非物质文化遗产资源普查、建档、审核与展示一体化平台</p>
            <form
              className="hero-search"
              onSubmit={(event) => {
                event.preventDefault();
                navigate(
                  `/projects${keyword.trim() ? `?q=${encodeURIComponent(keyword.trim())}` : ''}`,
                );
              }}
            >
              <input
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="输入项目名称、传承人、技艺关键词，例如：蓝印花布"
                aria-label="搜索非遗项目"
              />
              <button type="submit">开始探索</button>
            </form>
            <div className="hero-stats">
              <div>
                <strong>{data.stats.projects}</strong>
                <span>非遗项目</span>
              </div>
              <div>
                <strong>{data.stats.inheritors}</strong>
                <span>传承人</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap model-entry-strip">
        <div className="model-entry-mark" aria-hidden="true">
          3D
        </div>
        <div className="model-entry-copy">
          <span>DIGITAL OBJECTS</span>
          <strong>三维数字器物馆</strong>
          <p>
            {modelsQuery.data
              ? `${modelsQuery.data.stats.projects} 个非遗项目、${modelsQuery.data.stats.models} 个模型，支持旋转、缩放与全屏查看。`
              : '从器物细节进入非遗技艺，查看可旋转、缩放的三维模型。'}
          </p>
        </div>
        <Link className="btn btn-primary model-entry-link" to="/models">
          浏览全部三维器物 →
        </Link>
      </section>

      <section className="wrap section react-ai-home">
        <div className="ai-card">
          <div className="ai-head">
            <div>
              <h2 className="section-title">问一问传承学徒 · 小遗</h2>
              <p className="section-sub">
                站内知识检索、事实来源和多轮追问，回答后会推荐相关非遗入口。
              </p>
            </div>
            <span className="ai-badge">AI 导览</span>
          </div>
          <AssistantInline />
        </div>
      </section>

      <section className="wrap section">
        <SectionHeading
          title="十大门类，从这里开始逛"
          description="从民间文学到传统技艺，每个门类都是一条进入非遗世界的路径。"
          action={
            <Link className="section-more" to="/projects">
              浏览全部项目 →
            </Link>
          }
        />
        <div className="cat-grid">
          {data.categories.map((category) => (
            <Link
              className="cat-card"
              to={`/projects?category_id=${category.id}`}
              key={category.id}
            >
              <span className="cat-code">{category.code}</span>
              <strong className="cat-name">{category.name}</strong>
              <span className="cat-count">{category.total} 个项目</span>
              <p>{category.summary}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="wrap section">
        <SectionHeading
          title="精选非遗推荐"
          description="从真实档案出发，认识值得被看见的项目。"
          action={
            <Link className="section-more" to="/projects">
              更多推荐 →
            </Link>
          }
        />
        <div className="card-grid">
          {data.featuredProjects.map((project) => (
            <ProjectCard project={project} key={project.id} />
          ))}
        </div>
      </section>

      <section className="wrap section">
        <SectionHeading
          title="传承人故事"
          description="一门手艺背后，是一个人的大半辈子。"
          action={
            <Link className="section-more" to="/inheritors">
              全部传承人 →
            </Link>
          }
        />
        <div className="card-grid">
          {data.featuredInheritors.map((inheritor) => (
            <InheritorCard inheritor={inheritor} key={inheritor.id} />
          ))}
        </div>
      </section>
    </>
  );
}
