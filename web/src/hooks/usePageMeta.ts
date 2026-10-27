import { useEffect } from 'react';

interface PageMeta {
  title: string;
  description: string;
  type?: 'website' | 'article';
}

function ensureMeta(attribute: 'name' | 'property', key: string): HTMLMetaElement {
  let meta = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, key);
    document.head.appendChild(meta);
  }
  return meta;
}

export function usePageMeta({ title, description, type = 'website' }: PageMeta) {
  useEffect(() => {
    document.title = `${title} · 非遗数字管理平台`;
    ensureMeta('name', 'description').content = description;
    ensureMeta('property', 'og:title').content = title;
    ensureMeta('property', 'og:description').content = description;
    ensureMeta('property', 'og:type').content = type;
    ensureMeta('property', 'og:url').content = window.location.href;

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.href;
  }, [description, title, type]);
}
