import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AssistantFab } from './Assistant';
import { useAppStore } from '../stores/useAppStore';

const NAV = [
  { to: '/', label: '首页', end: true },
  { to: '/projects', label: '逛非遗' },
  { to: '/inheritors', label: '传承人' },
  { to: '/explore', label: '非遗探索' },
  { to: '/organizations', label: '探访线索' },
];

function parentPath(pathname: string): string {
  if (/^\/projects\/\d+/.test(pathname)) return '/projects';
  if (/^\/inheritors\/\d+/.test(pathname)) return '/inheritors';
  if (/^\/organizations\/\d+/.test(pathname)) return '/organizations';
  return '/';
}

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState('');
  const setAssistantContext = useAppStore((state) => state.setAssistantContext);
  const setAssistantOpen = useAppStore((state) => state.setAssistantOpen);
  const isHome = location.pathname === '/';

  useEffect(() => {
    window.scrollTo({ top: 0 });
    setAssistantOpen(false);
    if (!/^\/(projects|inheritors|organizations)\/\d+/.test(location.pathname)) {
      setAssistantContext({ page: location.pathname.replace(/^\//, '') || 'home' });
    }
  }, [location.pathname, setAssistantContext, setAssistantOpen]);

  const goBack = () => {
    const index = Number(window.history.state?.idx || 0);
    if (index > 0) navigate(-1);
    else navigate(parentPath(location.pathname));
  };

  return (
    <>
      <header className="site-header">
        <div className="wrap header-inner">
          <NavLink className="brand" to="/">
            <span className="brand-seal">非</span>
            <span className="brand-text">
              <strong>非遗数字管理平台</strong>
              <em>非物质文化遗产保护中心</em>
            </span>
          </NavLink>
          <nav className="site-nav" aria-label="主导航">
            {NAV.map((item) => (
              <NavLink
                className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                end={item.end}
                key={item.to}
                to={item.to}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="header-actions">
            {!isHome ? (
              <button className="portal-back-button" type="button" onClick={goBack}>
                ← 返回
              </button>
            ) : null}
            <form
              className="header-search"
              role="search"
              onSubmit={(event) => {
                event.preventDefault();
                navigate(
                  `/projects${keyword.trim() ? `?q=${encodeURIComponent(keyword.trim())}` : ''}`,
                );
              }}
            >
              <input
                type="search"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索项目、传承人、技艺"
                aria-label="站内搜索"
              />
              <button type="submit">搜索</button>
            </form>
            <a className="ghost-link" href="/admin">
              管理端
            </a>
          </div>
        </div>
      </header>
      <main className="site-main react-site-main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="wrap footer-inner">
          <div>
            <p className="footer-brand">非遗数字管理平台</p>
            <p className="footer-sub">非物质文化遗产资源普查、建档、审核与展示一体化平台</p>
          </div>
          <div className="footer-links">
            <NavLink to="/projects">非遗项目</NavLink>
            <NavLink to="/inheritors">传承人</NavLink>
            <NavLink to="/explore">非遗探索</NavLink>
            <a href="/admin">管理端登录</a>
          </div>
        </div>
        <div className="wrap footer-note">本平台为演示系统，部分内容用于教学展示。</div>
      </footer>
      <AssistantFab />
    </>
  );
}
