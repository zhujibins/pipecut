import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Calculator, Database, FileText, Layers, Plus, Ruler, TriangleAlert } from 'lucide-react';
import { useAppData } from '../context/AppDataContext';

const NAV_ITEMS = [
  { to: '/', label: '排料工作台', icon: Calculator, end: true },
  { to: '/materials', label: '原料规格', icon: Layers, end: false },
  { to: '/parts', label: '零件库', icon: Ruler, end: false },
  { to: '/plans', label: '方案记录', icon: FileText, end: false },
];

function currentSection(pathname: string): string {
  if (pathname.startsWith('/materials')) return '原料规格';
  if (pathname.startsWith('/parts')) return '零件库';
  if (pathname.startsWith('/plans')) return '方案记录';
  return '排料工作台';
}

export function Layout() {
  const location = useLocation();
  const { loading, error } = useAppData();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="管切算首页">
          <span className="brand-mark" aria-hidden="true">
            <span className="brand-ring" />
            <span className="brand-ring-inner" />
          </span>
          <span className="brand-text">
            <strong>管切算</strong>
            <small>PIPECUT / WORKSHOP</small>
          </span>
        </Link>

        <nav className="side-nav" aria-label="主导航">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
              >
                <Icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
                <span className="nav-arrow">›</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="side-rule-card">
          <div className="side-rule-title">
            <span className="rule-dot" />
            切割参数规则
          </div>
          <div className="rule-row">
            <span>激光切割</span>
            <strong>1–2 mm 切口</strong>
          </div>
          <div className="rule-row">
            <span>激光夹持</span>
            <strong>预留 200 mm</strong>
          </div>
          <div className="rule-row">
            <span>锯床切割</span>
            <strong>3–5 mm 切口</strong>
          </div>
          <div className="rule-row">
            <span>锯床夹持</span>
            <strong>无需预留</strong>
          </div>
        </div>

        <div className="side-foot">
          <div className={`sync-dot${error ? ' is-error' : ''}`} />
          <div>
            <strong>{error ? 'D1 连接异常' : loading ? '正在同步 D1' : 'Cloudflare D1 已连接'}</strong>
            <span>原料、零件与方案统一保存</span>
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-brand-mobile">管切算</div>
            <span className="topbar-crumb">车间排料</span>
            <span className="topbar-sep">/</span>
            <span className="topbar-current">{currentSection(location.pathname)}</span>
          </div>
          <div className="topbar-right">
            <span className={`status-pill${error ? ' is-error' : ''}`}>
              {error ? <TriangleAlert size={14} /> : <Database size={14} />}
              {error ? '数据同步失败' : 'D1 实时保存'}
            </span>
            <Link to="/" className="topbar-action">
              <Plus size={16} />
              新建排料
            </Link>
          </div>
        </header>

        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
