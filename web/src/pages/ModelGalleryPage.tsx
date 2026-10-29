import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { publicApi } from '../api/client';
import { ErrorState, EmptyState, LoadingState } from '../components/common';
import { ModelProjectCatalog, ModelProjectViewer } from '../components/ModelGallery';
import { ModelStoryChapters } from '../components/ModelStoryChapters';
import { MODEL_STORY_STEPS } from '../data/model-story';
import type { ModelStoryStep } from '../data/model-story';
import { usePageMeta } from '../hooks/usePageMeta';
import type { ModelGalleryProject } from '../types';

function matchesProject(project: ModelGalleryProject, keyword: string) {
  const normalized = keyword.trim().toLowerCase();
  if (!normalized) return true;
  return [
    project.name,
    project.categoryName,
    project.regionLabel,
    project.summary,
    ...project.models.flatMap((model) => [
      model.title,
      model.relationLabel,
      model.author,
      model.note,
    ]),
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalized);
}

export default function ModelGalleryPage() {
  const [params, setParams] = useSearchParams();
  const keywordParam = params.get('q') || '';
  const categoryId = params.get('category_id') || '';
  const projectId = Number(params.get('project')) || 0;
  const modelId = params.get('model') || '';
  const storyId = params.get('story') || 'city';
  const [keyword, setKeyword] = useState(keywordParam);
  const query = useQuery({ queryKey: ['model-gallery'], queryFn: publicApi.models });

  usePageMeta({
    title: '三维器物',
    description: '沿着景德镇制瓷故事线，观赏非遗器物三维模型，了解器物、工序与窑火。',
  });

  useEffect(() => {
    setKeyword(keywordParam);
  }, [keywordParam]);

  const allProjects = query.data?.projects || [];

  const galleryProjects = useMemo(() => {
    return allProjects.filter((project) => {
      const categoryMatches = !categoryId || String(project.categoryId) === categoryId;
      return categoryMatches && matchesProject(project, keywordParam);
    });
  }, [allProjects, categoryId, keywordParam]);

  const selectedProject =
    allProjects.find((project) => project.id === projectId) ||
    allProjects.find((project) => project.models.some((model) => model.id === modelId)) ||
    allProjects[0] ||
    null;
  const selectedModel =
    selectedProject?.models.find((model) => model.id === modelId) ||
    selectedProject?.models[0] ||
    null;
  const activeStory =
    MODEL_STORY_STEPS.find(
      (step) =>
        step.id === storyId &&
        step.projectId === selectedProject?.id &&
        step.modelId === selectedModel?.id,
    ) ||
    MODEL_STORY_STEPS.find(
      (step) => step.projectId === selectedProject?.id && step.modelId === selectedModel?.id,
    ) ||
    null;

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const selectModel = (nextProjectId: number, nextModelId: string) => {
    const next = new URLSearchParams(params);
    next.set('project', String(nextProjectId));
    next.set('model', nextModelId);
    next.delete('story');
    setParams(next);
    document
      .querySelector('.model-gallery-feature')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const selectStory = (step: ModelStoryStep) => {
    const next = new URLSearchParams(params);
    next.set('project', String(step.projectId));
    next.set('model', step.modelId);
    next.set('story', step.id);
    setParams(next);
    document
      .querySelector('.model-gallery-feature')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const reset = () => {
    setKeyword('');
    setParams({});
  };

  return (
    <>
      <section className="page-head model-gallery-page-head">
        <div className="wrap">
          <nav className="breadcrumb">
            <Link to="/">首页</Link>
            <i>/</i>
            <span>三维器物</span>
          </nav>
          <div className="model-gallery-head-grid">
            <div className="model-gallery-head-copy">
              <p className="model-gallery-eyebrow">DIGITAL OBJECTS</p>
              <h1 className="page-title">三维器物馆</h1>
              <p className="page-sub">沉浸式观赏非遗器物三维模型，旋转、缩放细看工艺细节。</p>
              <div className="model-gallery-inline-stats" aria-label="三维器物统计">
                <span>
                  <strong>{query.data?.stats.projects ?? '—'}</strong> 个项目
                </span>
                <span>
                  <strong>{query.data?.stats.models ?? '—'}</strong> 个模型
                </span>
                <span>
                  <strong>{query.data?.stats.categories ?? '—'}</strong> 个门类
                </span>
              </div>
            </div>

            <form
              className="model-gallery-head-filter"
              onSubmit={(event) => {
                event.preventDefault();
                updateFilter('q', keyword.trim());
              }}
            >
              <input
                type="search"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索底部器物图库"
                aria-label="搜索三维器物"
              />
              <select
                value={categoryId}
                onChange={(event) => updateFilter('category_id', event.target.value)}
                aria-label="按非遗门类筛选"
              >
                <option value="">全部门类</option>
                {query.data?.categories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}（{category.modelCount}）
                  </option>
                ))}
              </select>
              <button className="btn btn-primary" type="submit">
                筛选
              </button>
              <button className="model-gallery-reset" type="button" onClick={reset}>
                重置
              </button>
            </form>
          </div>
        </div>
      </section>

      <section className="wrap section model-gallery-page">
        {query.isPending ? <LoadingState label="正在整理三维器物…" /> : null}
        {query.isError ? <ErrorState error={query.error} /> : null}
        {query.data && selectedProject && selectedModel ? (
          <>
            <div className="model-gallery-lead">
              <span>FEATURED OBJECT · 主预览</span>
              <p>从一件青花天球瓶出发，沿着瓷都、工序、窑火与作品四个章节，读懂景德镇制瓷故事。</p>
            </div>

            <div className="model-gallery-feature">
              <ModelProjectViewer
                project={selectedProject}
                model={selectedModel}
                story={
                  activeStory
                    ? {
                        title: activeStory.title,
                        detail: activeStory.detail,
                        keywords: activeStory.keywords,
                      }
                    : undefined
                }
                autoLoad
              />
              <ModelStoryChapters activeId={activeStory?.id || null} onSelect={selectStory} />
            </div>

            <section className="model-gallery-library">
              <header className="model-gallery-library-head">
                <div>
                  <span>ALL OBJECTS · 全部器物</span>
                  <h2>切换其他模型</h2>
                </div>
                <p>
                  已列出 <strong>{galleryProjects.length}</strong> 个项目、
                  <strong>
                    {galleryProjects.reduce((sum, project) => sum + project.models.length, 0)}
                  </strong>{' '}
                  个模型，点击任一模型即可切换上方展柜。
                </p>
              </header>
              {galleryProjects.length ? (
                <ModelProjectCatalog
                  projects={galleryProjects}
                  selectedModelId={selectedModel.id}
                  onSelectModel={selectModel}
                />
              ) : (
                <EmptyState title="没有符合条件的模型" hint="试试更换门类或搜索关键词。" />
              )}
              <p className="model-gallery-note">
                模型用于教学与展示；部分为同类工艺参考器物，具体归属以来源页和官方名录为准。
              </p>
            </section>
          </>
        ) : null}
      </section>
    </>
  );
}
