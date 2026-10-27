import { Link } from 'react-router-dom';
import { usePageMeta } from '../hooks/usePageMeta';

export default function NotFoundPage() {
  usePageMeta({ title: '页面不存在', description: '访问的页面不存在或已移动。' });
  return (
    <section className="wrap section">
      <div className="react-error-card">
        <strong>页面不存在</strong>
        <p>你访问的页面可能已经移动或被删除。</p>
        <Link className="btn btn-primary" to="/">
          返回首页
        </Link>
      </div>
    </section>
  );
}
