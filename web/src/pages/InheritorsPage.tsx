import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { publicApi } from '../api/client';
import { ErrorState, EmptyState, LoadingState } from '../components/common';
import { InheritorCard } from '../components/Cards';
import { FilterBar } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';
import { usePageMeta } from '../hooks/usePageMeta';

export default function InheritorsPage() {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(params.entries());
  const options = useQuery({ queryKey: ['filter-options'], queryFn: publicApi.options });
  const query = useQuery({
    queryKey: ['inheritors', values],
    queryFn: () => publicApi.inheritors(values),
  });
  usePageMeta({
    title: '传承人人物志',
    description: '浏览非遗代表性传承人的从艺经历、技艺特点与代表项目。',
  });

  return (
    <>
      <section className="page-head page-head-inheritors">
        <div className="wrap">
          <nav className="breadcrumb">
            <Link to="/">首页</Link>
            <i>/</i>
            <span>传承人</span>
          </nav>
          <div className="inheritor-title-row">
            <div>
              <p className="page-eyebrow">人物志 · 口述与技艺</p>
              <h1 className="page-title">传承人人物志</h1>
              <p className="page-sub">以人为轴，读一门手艺的来处、坚守与新生。</p>
            </div>
            {query.data ? (
              <div className="inheritor-tally">
                <strong>{query.data.total}</strong>
                <span>位代表性传承人</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>
      <section className="wrap section">
        {options.data ? <FilterBar mode="inheritors" options={options.data} /> : null}
        {query.isPending ? <LoadingState /> : null}
        {query.isError ? <ErrorState error={query.error} /> : null}
        {query.data ? (
          <>
            <div className="list-summary">
              共找到 <strong>{query.data.total}</strong> 位传承人
            </div>
            <div className="card-grid person-card-grid">
              {query.data.items.length ? (
                query.data.items.map((person) => (
                  <InheritorCard inheritor={person} key={person.id} />
                ))
              ) : (
                <EmptyState title="没有符合条件的人物" />
              )}
            </div>
            <Pagination
              page={query.data.page}
              totalPages={query.data.totalPages}
              onChange={(page) => {
                const next = new URLSearchParams(params);
                next.set('page', String(page));
                setParams(next);
              }}
            />
          </>
        ) : null}
      </section>
    </>
  );
}
