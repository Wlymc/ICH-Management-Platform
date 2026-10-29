import { Link } from 'react-router-dom';
import type { ModelAsset, ModelGalleryProject } from '../types';
import { Model3D } from './Model3D';

function VesselGlyph() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M19 8.5h10M20.5 8.5c0 3-1.4 4.6-3.6 6.6-3.1 2.9-4.4 7.4-3.4 12.3 1 5 4.1 9.4 7 11.3.8.5 1.8.5 2.6 0 2.9-1.9 6-6.3 7-11.3 1-4.9-.3-9.4-3.4-12.3-2.2-2-3.6-3.6-3.6-6.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.5 22.5c2.4 1.3 5.6 1.8 8.6 1.3 1.6-.3 3.1-.8 4.4-1.5"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}

export function ModelProjectCatalog({
  projects,
  selectedModelId,
  onSelectModel,
}: {
  projects: ModelGalleryProject[];
  selectedModelId?: string;
  onSelectModel: (projectId: number, modelId: string) => void;
}) {
  const items = projects.flatMap((project) => project.models.map((model) => ({ project, model })));

  return (
    <div className="model-project-catalog" aria-label="全部三维器物目录">
      {items.map(({ project, model }, index) => (
        <button
          className={`model-catalog-card${selectedModelId === model.id ? ' is-active' : ''}`}
          type="button"
          aria-pressed={selectedModelId === model.id}
          onClick={() => onSelectModel(project.id, model.id)}
          key={model.id}
        >
          <span className="model-catalog-thumb" aria-hidden="true">
            <VesselGlyph />
            <em className="model-catalog-index">{String(index + 1).padStart(2, '0')}</em>
          </span>
          <span className="model-catalog-card-body">
            <strong>{model.title}</strong>
            <small>
              {project.name} · {project.categoryName || '非遗项目'}
            </small>
          </span>
          <span className="model-catalog-badge" aria-hidden="true">
            3D
          </span>
        </button>
      ))}
    </div>
  );
}

export function ModelProjectViewer({
  project,
  model,
  story,
  autoLoad = false,
}: {
  project: ModelGalleryProject;
  model?: ModelAsset;
  story?: { title: string; detail: string; keywords?: string[] };
  autoLoad?: boolean;
}) {
  const selectedModel = model || project.models[0];
  const inheritors = project.inheritors || [];

  return (
    <article className="model-museum">
      <div className="model-museum-case">
        <div className="model-museum-case-head">
          <span>DIGITAL OBJECT · 博物馆展柜模式</span>
          <small>拖拽旋转 · 滚轮缩放 · 点击底部按钮操作</small>
        </div>
        <Model3D
          key={selectedModel.id}
          models={[selectedModel]}
          autoLoad={autoLoad}
          showModelList={false}
          museum
        />
      </div>

      <aside className="model-museum-info">
        <span className="model-museum-eyebrow">OBJECT FILE · 器物档案</span>
        <h2>{selectedModel.title}</h2>
        <p className="model-museum-project">{project.name}</p>

        <dl className="model-museum-facts">
          <div>
            <dt>技艺门类</dt>
            <dd>{project.categoryName || '待补充'}</dd>
          </div>
          <div>
            <dt>名录批次</dt>
            <dd>{project.batch || '待补充'}</dd>
          </div>
          <div>
            <dt>公布年份</dt>
            <dd>{project.publishedYear ? `${project.publishedYear} 年` : '待补充'}</dd>
          </div>
          <div>
            <dt>申报地区</dt>
            <dd>{project.regionLabel || '待补充'}</dd>
          </div>
        </dl>

        <section className="model-museum-section">
          <h3>器物说明</h3>
          <p>{selectedModel.note || project.summary || '该模型用于观察器物造型与工艺细节。'}</p>
        </section>

        {story ? (
          <section className="model-museum-section model-museum-story">
            <h3>{story.title}</h3>
            <p>{story.detail}</p>
            {story.keywords?.length ? (
              <ul className="model-museum-keywords" aria-label="故事关键词">
                {story.keywords.map((keyword) => (
                  <li key={keyword}>{keyword}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <section className="model-museum-section">
          <h3>代表性传承人</h3>
          {inheritors.length ? (
            <div className="model-museum-people">
              {inheritors.map((inheritor) => (
                <Link to={`/inheritors/${inheritor.id}`} key={inheritor.id}>
                  {inheritor.name}
                  {inheritor.levelName ? <small>{inheritor.levelName}</small> : null}
                </Link>
              ))}
            </div>
          ) : (
            <p className="model-museum-empty">传承人信息请查看项目档案。</p>
          )}
        </section>

        <section className="model-museum-section model-museum-credit">
          <h3>模型与版权</h3>
          <p>
            模型作者：<strong>{selectedModel.author}</strong>
          </p>
          <div>
            <a href={selectedModel.sourceUrl} target="_blank" rel="noreferrer">
              查看来源页 ↗
            </a>
            <a href={selectedModel.licenseUrl} target="_blank" rel="noreferrer">
              {selectedModel.license}
            </a>
          </div>
        </section>

        <Link className="model-museum-project-link" to={`/projects/${project.id}`}>
          查看完整项目档案 →
        </Link>
        <p className="model-museum-disclaimer">
          部分模型为同类工艺参考器物，具体归属以来源页和官方名录为准。
        </p>
      </aside>
    </article>
  );
}
