import { Link } from 'react-router-dom';
import type { InheritorSummary, ProjectSummary } from '../types';
import { formatYear } from '../utils';

function truncate(value: string, max: number) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function Cover({
  url,
  title,
  className = 'card-cover',
}: {
  url: string;
  title: string;
  className?: string;
}) {
  if (!url) {
    return (
      <div className={`${className} cover-empty`}>
        <span>{title.slice(0, 8)}</span>
      </div>
    );
  }
  return (
    <div className={className}>
      <img src={url} alt={title} loading="lazy" />
    </div>
  );
}

export function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link className="card card-project" to={`/projects/${project.id}`}>
      <Cover url={project.coverUrl} title={project.name} />
      <div className="card-body">
        <div className="card-tags">
          <span className="chip chip-red">{project.categoryName}</span>
          <span className="chip chip-plain">{project.levelName}</span>
        </div>
        <h3 className="card-title">{project.name}</h3>
        <p className="card-summary">{project.summary || '档案内容正在完善中。'}</p>
        <div className="card-meta">
          <span>{project.regionLabel || '地区待补充'}</span>
          <span>{formatYear(project.publishedYear)}</span>
          {project.models.length ? <span>{project.models.length} 个 3D 模型</span> : null}
        </div>
      </div>
    </Link>
  );
}

export function InheritorCard({ inheritor }: { inheritor: InheritorSummary }) {
  const mark = Array.from(inheritor.name || '传')
    .slice(0, 2)
    .join('');
  const story = inheritor.storyTitle || '传承实践与人物档案';
  const skill = truncate(
    inheritor.skill || inheritor.experience || '记录其从艺经历、技艺特点与代表项目。',
    64,
  );
  return (
    <Link className="card card-person" to={`/inheritors/${inheritor.id}`}>
      <span className="person-seal" aria-hidden="true">
        {mark}
      </span>
      <div className="card-body person-card-body">
        <div className="person-card-head">
          <span className="person-card-kicker">传承人人物志</span>
          <div className="card-tags">
            <span className="chip chip-gold">{inheritor.levelName || '代表性传承人'}</span>
            {inheritor.ethnic ? <span className="chip chip-plain">{inheritor.ethnic}</span> : null}
          </div>
        </div>
        <h3 className="card-title person-card-name">{inheritor.name}</h3>
        <p className="person-card-story">{story}</p>
        <p className="person-card-skill">{skill}</p>
        <div className="card-foot person-card-foot">
          <span>
            {inheritor.regionLabel || '地区待补'}
            {inheritor.batch ? ` · ${inheritor.batch}` : ''}
          </span>
          <span className="card-go">阅读人物志 →</span>
        </div>
      </div>
    </Link>
  );
}
