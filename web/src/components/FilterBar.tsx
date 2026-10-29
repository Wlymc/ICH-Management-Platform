import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { FilterOptions } from '../types';

interface Props {
  mode: 'projects' | 'inheritors' | 'organizations';
  options: FilterOptions;
}

export function FilterBar({ mode, options }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [keyword, setKeyword] = useState(searchParams.get('q') || '');

  useEffect(() => {
    setKeyword(searchParams.get('q') || '');
  }, [searchParams]);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setSearchParams(next);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    update('q', keyword.trim());
  };

  const searchPlaceholder =
    mode === 'projects'
      ? '搜索名称、地区、关键词'
      : mode === 'inheritors'
        ? '搜索姓名、技艺、地区'
        : '搜索探访体验点';

  return (
    <form
      className={`filter-bar react-filter-bar${mode === 'inheritors' ? ' filter-bar-person' : ''}`}
      onSubmit={submit}
    >
      <input
        className="filter-search"
        type="search"
        value={keyword}
        onChange={(event) => setKeyword(event.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder}
      />
      {mode === 'projects' ? (
        <select
          name="category_id"
          value={searchParams.get('category_id') || ''}
          onChange={(event) => update('category_id', event.target.value)}
          aria-label="非遗类别"
        >
          <option value="">全部类别</option>
          {options.categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      ) : null}
      {mode === 'projects' ? (
        <select
          name="has_3d"
          value={searchParams.get('has_3d') || ''}
          onChange={(event) => update('has_3d', event.target.value)}
          aria-label="3D模型"
        >
          <option value="">全部模型</option>
          <option value="1">含3D模型</option>
          <option value="0">不含3D模型</option>
        </select>
      ) : null}
      {mode !== 'organizations' ? (
        <select
          name="level_id"
          value={searchParams.get('level_id') || ''}
          onChange={(event) => update('level_id', event.target.value)}
          aria-label="名录级别"
        >
          <option value="">全部级别</option>
          {options.levels.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      ) : null}
      <select
        name="region_id"
        value={searchParams.get('region_id') || ''}
        onChange={(event) => update('region_id', event.target.value)}
        aria-label="申报地区"
      >
        <option value="">全部地区</option>
        {options.regions.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label || item.name}
          </option>
        ))}
      </select>
      {mode !== 'organizations' ? (
        <select
          name="sort"
          value={searchParams.get('sort') || 'updated_at'}
          onChange={(event) => update('sort', event.target.value)}
          aria-label="排序方式"
        >
          <option value="updated_at">最近更新</option>
          {mode === 'projects' ? <option value="published_year">公布年份</option> : null}
          {mode === 'inheritors' ? <option value="certified_year">认定年份</option> : null}
          <option value="name">{mode === 'inheritors' ? '姓名排序' : '名称排序'}</option>
        </select>
      ) : null}
      <button className="btn btn-primary" type="submit">
        筛选
      </button>
      <button className="btn btn-ghost" type="button" onClick={() => setSearchParams({})}>
        重置
      </button>
    </form>
  );
}
