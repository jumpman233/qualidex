import { Eye, Folder, Download, CheckCircle2, Search, Sparkles, MapPin, UserRound } from 'lucide-react'
import { useState } from 'react'
import {
  exportItems,
  importSummary,
  personResults,
  queryConditions,
  reviewItems,
  type WorkspaceMode,
} from '../mock/qualidexMock'

interface MainWorkspaceProps {
  mode: WorkspaceMode
  onModeChange(mode: WorkspaceMode): void
}

export function MainWorkspace({ mode, onModeChange }: MainWorkspaceProps) {
  if (mode === 'search') {
    return <SearchWorkspace />
  }

  if (mode === 'import') {
    return <ImportWorkspace />
  }

  if (mode === 'review') {
    return <ReviewWorkspace />
  }

  if (mode === 'export') {
    return <ExportWorkspace />
  }

  return <HomeWorkspace onModeChange={onModeChange} />
}

function HomeWorkspace({ onModeChange }: { onModeChange(mode: WorkspaceMode): void }) {
  return (
    <section className="workspace-panel empty-home">
      <div className="empty-home-icon">
        <Sparkles size={34} />
      </div>
      <p className="workspace-kicker">首页概览</p>
      <h2>从上方输入一句话，或选择一个常用操作开始。</h2>
      <p>查询人员、整理新增资料、处理待确认和导出预览会汇聚在这个工作区。</p>
      <div className="empty-home-actions">
        <button type="button" className="primary-button" onClick={() => onModeChange('search')}>
          <Search size={18} />
          试用示例查询
        </button>
        <button type="button" className="ghost-button" onClick={() => onModeChange('review')}>
          查看待确认
        </button>
      </div>
    </section>
  )
}

function SearchWorkspace() {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <section className="workspace-stack">
      <article className="workspace-panel">
        <div className="section-heading">
          <h2>A. 系统理解的查询条件</h2>
          <p>请先确认系统理解是否正确，确认后再查询人员。</p>
        </div>
        <div className="condition-grid">
          {queryConditions.map((condition) => (
            <div key={condition.label}>
              <span>{condition.label}</span>
              <strong>{condition.value}</strong>
            </div>
          ))}
        </div>
        <div className="workspace-actions">
          <button type="button" className="primary-button" onClick={() => setConfirmed(true)}>确认查询</button>
          <button type="button" className="ghost-button" onClick={() => setConfirmed(false)}>修改条件</button>
        </div>
      </article>
      {confirmed ? (
        <article className="workspace-panel">
          <div className="section-heading inline-heading">
            <h2>B. 查询结果</h2>
            <p>已找到 5 人，强匹配 2 人，可能相关 1 人。</p>
            <div className="result-actions">
              <button type="button" className="ghost-button">
                <Folder size={18} />
                复制文件夹
              </button>
              <button type="button" className="primary-button">
                <Download size={18} />
                导出选中
              </button>
            </div>
          </div>
          <div className="person-list">
            {personResults.map((person) => (
              <article key={person.id} className="person-row">
                <input type="checkbox" aria-label={`选择 ${person.name}`} />
                <div className={`avatar avatar-${person.id}`} />
                <div className="person-main">
                  <div>
                    <h3>{person.name}</h3>
                    <div className="tag-row">
                      {person.tags.map((tag) => (
                        <span key={tag.label} className={`tag ${tag.tone}`}>{tag.label}</span>
                      ))}
                    </div>
                  </div>
                  <p>{person.summary}</p>
                  <span>{person.reason}</span>
                </div>
                <button type="button" className="ghost-button">
                  <Eye size={18} />
                  查看
                </button>
                <button type="button" className="ghost-button">
                  <Folder size={18} />
                  文件夹
                </button>
              </article>
            ))}
          </div>
        </article>
      ) : (
        <article className="workspace-panel pending-result">
          <h2>B. 查询结果</h2>
          <p>请先确认上方查询条件。确认后再展示人员结果，避免系统误解查询意图。</p>
        </article>
      )}
    </section>
  )
}

function ImportWorkspace() {
  return (
    <section className="workspace-panel">
      <div className="section-heading">
        <h2>新增资料</h2>
        <p>选择一批资料，先按默认信息整理，再把不确定项放入待确认。</p>
      </div>
      <div className="form-grid">
        <label>
          <span>资料类别</span>
          <strong>自动识别</strong>
        </label>
        <label>
          <span>地区</span>
          <strong>成都</strong>
        </label>
        <label className="wide-field">
          <span>资料目录</span>
          <strong>D:\资料\成都工程新增资料</strong>
        </label>
      </div>
      <div className="progress-list">
        {['扫描文件', '识别文字', '整理人员', '生成待确认'].map((step) => (
          <div key={step}>
            <CheckCircle2 size={18} />
            <span>{step}</span>
          </div>
        ))}
      </div>
      <div className="summary-grid">
        {importSummary.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
      <div className="workspace-actions">
        <button type="button" className="primary-button">处理待确认</button>
        <button type="button" className="ghost-button">生成归档</button>
      </div>
    </section>
  )
}

function ReviewWorkspace() {
  return (
    <section className="workspace-panel">
      <div className="section-heading">
        <h2>待确认资料</h2>
        <p>第一版使用卡片式确认，先处理最影响归档和查询可信度的问题。</p>
      </div>
      <div className="review-grid">
        {reviewItems.map((item) => (
          <article key={item.id} className="review-card">
            <span>{item.type}</span>
            <h3>{item.fileName}</h3>
            <p>{item.guess}</p>
            <small>{item.reason}</small>
            <div className="editable-grid">
              <label>
                <span>类别</span>
                <strong>工程</strong>
              </label>
              <label>
                <span>地区</span>
                <strong>成都</strong>
              </label>
              <label>
                <span>人员</span>
                <strong>待选择</strong>
              </label>
              <label>
                <span>资料类型</span>
                <strong>证书</strong>
              </label>
            </div>
            <div className="workspace-actions">
              <button type="button" className="primary-button">确认</button>
              <button type="button" className="ghost-button">跳过</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ExportWorkspace() {
  return (
    <section className="workspace-panel">
      <div className="section-heading">
        <h2>导出预览</h2>
        <p>确认导出人员、导出内容和风险提示后，再生成结果。</p>
      </div>
      <div className="export-options">
        {exportItems.map((item) => (
          <label key={item.id}>
            <input type="checkbox" defaultChecked={item.checked} />
            <span>{item.label}</span>
          </label>
        ))}
      </div>
      <div className="export-location">
        <MapPin size={18} />
        <span>导出位置</span>
        <strong>D:\导出结果\成都二建人员</strong>
      </div>
      <div className="export-people">
        {personResults.slice(0, 2).map((person) => (
          <div key={person.id}>
            <UserRound size={18} />
            <span>{person.name}</span>
            <strong>{person.summary}</strong>
          </div>
        ))}
      </div>
      <div className="risk-note">
        多人员共用资料可能包含其他人员信息，导出前需要业务人员确认。
      </div>
      <button type="button" className="primary-button">开始导出</button>
    </section>
  )
}
