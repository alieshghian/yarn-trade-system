import { Component, createElement, lazy, type ComponentType, type ComponentProps, type ReactNode } from 'react'
import type { Language } from './i18n'

// React.lazy remembers rejected imports. A retry must also replace that cache.
export function retryablePage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  let page = lazy(load)
  const Page = (props: ComponentProps<T>) => createElement(page, props)
  Page.retry = () => { page = lazy(load) }
  return Page
}

const messages = {
  fa: { error: 'بارگیری این صفحه انجام نشد. می‌توانید دوباره تلاش کنید یا از این صفحه خارج شوید.', retry: 'تلاش دوباره', close: 'بستن صفحه', home: 'رفتن به داشبورد', reload: 'تازه‌سازی برنامه', confirm: 'تازه‌سازی ممکن است تغییرات ذخیره‌نشدهٔ زبانه‌های دیگر را از بین ببرد. ابتدا آن‌ها را ذخیره کنید. برنامه تازه‌سازی شود؟' },
  en: { error: 'This page could not be loaded. Retry or leave this page.', retry: 'Try again', close: 'Close page', home: 'Go to dashboard', reload: 'Reload application', confirm: 'Reloading may discard unsaved changes in other tabs. Save them first. Reload now?' },
  zh: { error: '无法加载此页面。请重试或离开此页面。', retry: '重试', close: '关闭页面', home: '返回首页', reload: '刷新应用', confirm: '刷新可能丢失其他选项卡中未保存的更改。请先保存。现在刷新？' }
}

export class WorkspacePageBoundary extends Component<{
  language: Language; children: ReactNode; onRetry: () => void; onClose: () => void; onHome: () => void
}, { failed: boolean; error?: string }> {
  state: { failed: boolean; error?: string } = { failed: false }
  static getDerivedStateFromError(error: unknown) { return { failed: true, error: error instanceof Error ? error.stack || error.message : String(error) } }
  componentWillUnmount() { if (this.state.failed) this.props.onRetry() }
  render() {
    if (!this.state.failed) return this.props.children
    const t = messages[this.props.language]
    return <section className="panel workspace-page-error" role="alert">
      <p>{t.error}</p>
      <details><summary>{this.props.language === 'fa' ? 'جزئیات خطا' : this.props.language === 'zh' ? '错误详情' : 'Error details'}</summary><pre dir="ltr" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{this.state.error}</pre></details>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={() => { this.props.onRetry(); this.setState({ failed: false }) }}>{t.retry}</button>
        <button type="button" onClick={this.props.onClose}>{t.close}</button>
        <button type="button" onClick={this.props.onHome}>{t.home}</button>
        <button type="button" onClick={() => { if (window.confirm(t.confirm)) window.location.reload() }}>{t.reload}</button>
      </div>
    </section>
  }
}
