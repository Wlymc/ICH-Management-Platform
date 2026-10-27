import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { publicApi } from '../api/client';
import { ErrorState, LoadingState, SectionHeading } from '../components/common';
import { InheritorCard, ProjectCard } from '../components/Cards';
import { AssistantInline } from '../components/Assistant';
import { usePageMeta } from '../hooks/usePageMeta';

export default function HomePage() {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const query = useQuery({ queryKey: ['home'], queryFn: publicApi.home });
  usePageMeta({
    title: '非遗数字展馆',
    description: '非遗项目、传承人、文化关系探索、AI 小遗与三维器物展示。',
  });

  if (query.isPending) return <LoadingState label="正在点亮非遗门户…" />;
  if (query.isError) return <ErrorState error={query.error} />;
  const data = query.data;

  return (
    <>
      <section className="hero react-home-hero">
        <div className="wrap hero-inner">
          <div>
            <p className="hero-eyebrow">非物质文化遗产 · 数字资源平台</p>
            <h1 className="hero-title">非遗数字管理平台</h1>
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
              <div>
                <strong>{data.stats.organizations}</strong>
                <span>传承基地</span>
              </div>
              <div>
                <strong>{data.stats.attachments}</strong>
                <span>多媒体档案</span>
              </div>
            </div>
          </div>
        </div>
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
