import type { ProjectSummary, InheritorSummary } from './types';

export function formatYear(value: number | null | undefined): string {
  return value ? `${value} 年` : '待补充';
}

export function splitKeywords(value: string): string[] {
  return value
    .split(/[、,，;；/|]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function projectMeta(project: ProjectSummary | InheritorSummary): string {
  if ('levelName' in project && 'regionLabel' in project) {
    return [project.levelName, project.regionLabel].filter(Boolean).join(' · ');
  }
  return '';
}

export function clampPage(page: number, totalPages: number): number {
  return Math.max(1, Math.min(Number.isFinite(page) ? page : 1, Math.max(1, totalPages)));
}
