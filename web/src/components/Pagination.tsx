export function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="pagination react-pagination" aria-label="分页">
      <button
        className="pager-link"
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        上一页
      </button>
      <span className="pager-info">
        第 {page} / {totalPages} 页
      </span>
      <button
        className="pager-link"
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </button>
    </nav>
  );
}
