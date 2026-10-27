export interface Paginated<T> {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: T[];
  keyword?: string;
}

export interface ModelAsset {
  id: string;
  title: string;
  relationLabel: string;
  author: string;
  license: string;
  licenseUrl: string;
  sourceUrl: string;
  note: string;
  url: string;
}

export interface ProjectSummary {
  id: number;
  code: string;
  name: string;
  categoryId: number | null;
  categoryName: string;
  categoryCode: string;
  levelId: number | null;
  levelName: string;
  batch: string;
  publishedYear: number | null;
  regionId: number | null;
  regionLabel: string;
  regionText: string;
  summary: string;
  history: string;
  feature: string;
  lineage: string;
  keywords: string;
  protectionUnit: string;
  organizationId: number | null;
  organizationName: string;
  contentSource: string;
  sourceCode: string;
  sourceUrl: string;
  featured: boolean;
  coverUrl: string;
  videoUrl: string;
  models: ModelAsset[];
}

export interface Attachment {
  id: number;
  kind: string;
  title: string;
  fileName: string;
  url: string;
  externalUrl: string;
  mimeType: string;
  note: string;
  sourceKind: string;
  sourceUrl: string;
  license: string;
  photographer: string;
}

export interface InheritorSummary {
  id: number;
  code: string;
  name: string;
  gender: string;
  ethnic: string;
  birthMonth: string;
  levelId: number | null;
  levelName: string;
  regionId: number | null;
  regionLabel: string;
  batch: string;
  certifiedYear: number | null;
  careerStartYear: number | null;
  address: string;
  experience: string;
  storyTitle: string;
  skill: string;
  honors: string;
  sourceCode: string;
  sourceUrl: string;
  dataNote: string;
  featured: boolean;
  photoUrl: string;
  videoUrl: string;
}

export interface Organization {
  id: number;
  code: string;
  name: string;
  orgType: string;
  regionId: number | null;
  regionLabel: string;
  address: string;
  manager: string;
  phone: string;
  email: string;
  foundedYear: number | null;
  isOpen: boolean;
  openHours: string;
  traffic: string;
  experience: string;
  intro: string;
  verified: boolean;
  sourceUrl: string;
  coverUrl: string;
}

export interface ProjectDetailData {
  project: ProjectSummary;
  inheritors: InheritorSummary[];
  relatedProjects: ProjectSummary[];
  organization: Organization | null;
  attachments: Attachment[];
}

export interface InheritorDetailData {
  inheritor: InheritorSummary;
  projects: ProjectSummary[];
  sameCategory: InheritorSummary[];
  attachments: Attachment[];
}

export interface OrganizationDetailData {
  organization: Organization;
  projects: ProjectSummary[];
  attachments: Attachment[];
}

export interface VisitProvince {
  id: number;
  name: string;
  projectCount: number;
  inheritorCount: number;
  samples: Array<{ id: number; name: string }>;
}

export interface VisitGuideData {
  provinces: VisitProvince[];
  verifiedOrganizations: Organization[];
  meta: {
    provinceTotal: number;
    projectTotal: number;
    inheritorTotal: number;
    verifiedOrganizationTotal: number;
  };
}

export interface HomeData {
  stats: {
    projects: number;
    inheritors: number;
    organizations: number;
    attachments: number;
  };
  categories: Array<{
    id: number;
    name: string;
    code: string;
    summary: string;
    total: number;
  }>;
  featuredProjects: ProjectSummary[];
  featuredInheritors: InheritorSummary[];
}

export interface FilterOption {
  id: number;
  name?: string;
  label?: string;
}

export interface FilterOptions {
  categories: FilterOption[];
  levels: FilterOption[];
  regions: FilterOption[];
}

export interface StarNode {
  id: number;
  name: string;
  categoryId: number;
  category: string;
  color: string;
  level: string;
  batch: string;
  province: string;
  regionLabel: string;
  x: number;
  y: number;
  radius: number;
  completeness: number;
  missingInheritor: boolean;
  inheritorCount: number;
  summary: string;
  year: number | null;
  imageCount: number;
  audioCount: number;
  inheritors: Array<{ id: number; name: string; code: string }>;
}

export interface StarProvince {
  id: number | null;
  name: string;
  x: number;
  y: number;
  count: number;
  radius: number;
  categories: string[];
}

export interface GraphNode {
  id: string;
  kind: 'project' | 'inheritor' | 'category' | 'region' | 'knowledge';
  label: string;
  color: string;
  x: number;
  y: number;
  detailHref?: string;
  categoryName?: string;
  levelName?: string;
  regionLabel?: string;
  inheritorCount?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
}

export interface ExploreData {
  star: {
    world: { width: number; height: number };
    categories: Array<{ id: number; name: string; code: string; color: string; total: number }>;
    nodes: StarNode[];
    provinces: StarProvince[];
    meta: {
      total: number;
      provinceTotal: number;
      missingInheritor: number;
      edgeTotal: number;
      imageTotal: number;
    };
  };
  graph: {
    world: { width: number; height: number };
    nodes: GraphNode[];
    edges: GraphEdge[];
    meta: {
      total: number;
      projectTotal: number;
      inheritorTotal: number;
      edgeTotal: number;
    };
  };
}

export interface ChatSource {
  type: 'project' | 'inheritor' | 'knowledge';
  id: number;
  title: string;
  href: string;
  snippet: string;
  verification: 'verified' | 'example' | 'unverified';
  sourceLabel: string;
}

export interface ChatLink {
  href: string;
  label: string;
  detail?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  links?: ChatLink[];
}

export interface ChatResponse {
  reply: string;
  kind: 'answer' | 'query';
  sources: ChatSource[];
  links: ChatLink[];
  degraded: boolean;
  reason?: string;
}

export interface NarrationData {
  mode: 'brief' | 'detailed' | 'child';
  title: string;
  label: string;
  sections: Array<{ title: string; text: string }>;
  script: string;
  source: string;
}
