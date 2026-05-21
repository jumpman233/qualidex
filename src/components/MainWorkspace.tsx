import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  FileText,
  Folder,
  HelpCircle,
  MapPin,
  PlusCircle,
  RefreshCw,
  Search,
  Sparkles,
  UserRound,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  exportItems,
  personResults,
  type WorkspaceMode,
} from '../mock/qualidexMock'

interface MainWorkspaceProps {
  mode: WorkspaceMode
  onModeChange(mode: WorkspaceMode): void
}

type ReviewFilter = 'all' | 'person_conflict' | 'education_unknown' | 'license_review' | 'region_unknown' | 'multi_person' | 'failed'

interface ReviewPersonCertificate {
  certificateName: string | null
  certificateSpecialty: string | null
  displayName: string | null
  confidence: number | null
  evidence: string[]
}

interface ReviewPersonFile {
  reviewItemId: string
  fileName: string
  relativePath: string
  originalPath: string | null
  relationType: 'owner' | 'mentioned' | 'multi_person' | 'uncertain'
  relationConfidence: number
  evidence: string[]
  ocrText: string | null
}

interface ReviewPersonCandidate {
  id: string
  reviewItemIds: string[]
  personName: string | null
  idCardNumber: string | null
  idCardMaskedDisplay: string | null
  education: string | null
  region: string | null
  certificates: ReviewPersonCertificate[]
  confidence: number
  needsReview: boolean
  reviewReasons: string[]
  tags: string[]
  files: ReviewPersonFile[]
}

export function MainWorkspace({ mode, onModeChange }: MainWorkspaceProps) {
  if (mode === 'search') {
    return <SearchWorkspace />
  }

  if (mode === 'import') {
    return <ImportWorkspace onModeChange={onModeChange} />
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
  const [categories, setCategories] = useState<string[]>(['工程'])
  const [region, setRegion] = useState('')
  const [educationMin, setEducationMin] = useState('')
  const [licenseQuery, setLicenseQuery] = useState('')
  const [includePendingReview, setIncludePendingReview] = useState(false)
  const [results, setResults] = useState<QueryPersonResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [exportFullIdCard, setExportFullIdCard] = useState(false)

  const conditions: QueryPeopleConditions = {
    categories,
    region,
    educationMin,
    licenseQuery,
    includePendingReview,
    limit: 100,
  }

  function toggleCategory(category: string) {
    setCategories((current) => current.includes(category)
      ? current.filter((item) => item !== category)
      : [...current, category])
  }

  async function handleSearch() {
    setIsSearching(true)
    setSearchError(null)
    setExportMessage(null)

    try {
      setResults(await window.qualidex.queryPeople(conditions))
    } catch (error) {
      setResults([])
      setSearchError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsSearching(false)
    }
  }

  async function handleExportExcel() {
    setExportMessage(null)
    const result = await window.qualidex.exportQueryResultsExcel(conditions, { exportFullIdCard })
    if (result) {
      setExportMessage('已导出 ' + result.rowCount + ' 条查询结果。')
    }
  }

  async function handleExportFiles() {
    setExportMessage(null)
    const result = await window.qualidex.exportQueryResultFiles(conditions)
    if (result) {
      setExportMessage('已复制 ' + result.copiedItems + ' 份资料，跳过 ' + result.skippedExistingItems + ' 份，失败 ' + result.failedItems + ' 份。')
    }
  }

  return (
    <section className="workspace-stack">
      <article className="workspace-panel">
        <div className="section-heading">
          <h2>查询条件</h2>
          <p>查询只基于数据库中的结构化数据；默认不包含待确认资料。</p>
        </div>
        <div className="query-form-grid">
          <label>
            <span>类别</span>
            <div className="tag-row">
              {['工程', '消防员', '其他'].map((category) => (
                <button
                  key={category}
                  type="button"
                  className={'tag-toggle ' + (categories.includes(category) ? 'selected' : '')}
                  onClick={() => toggleCategory(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          </label>
          <label>
            <span>地区</span>
            <input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="例如 成都" />
          </label>
          <label>
            <span>学历不低于</span>
            <select value={educationMin} onChange={(event) => setEducationMin(event.target.value)}>
              <option value="">不限</option>
              <option value="college">大专</option>
              <option value="bachelor">本科</option>
              <option value="master">硕士</option>
              <option value="doctor">博士</option>
            </select>
          </label>
          <label>
            <span>证书</span>
            <input value={licenseQuery} onChange={(event) => setLicenseQuery(event.target.value)} placeholder="例如 二级建造师" />
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={includePendingReview}
              onChange={(event) => setIncludePendingReview(event.target.checked)}
            />
            <span>包含待确认资料</span>
          </label>
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={exportFullIdCard}
              onChange={(event) => setExportFullIdCard(event.target.checked)}
            />
            <span>Excel 导出完整身份证号</span>
          </label>
        </div>
        <div className="workspace-actions">
          <button type="button" className="primary-button" onClick={() => void handleSearch()} disabled={isSearching}>
            {isSearching ? '查询中' : '确认查询'}
          </button>
        </div>
        {searchError ? <div className="risk-note">{searchError}</div> : null}
      </article>

      <article className="workspace-panel">
        <div className="section-heading inline-heading">
          <div>
            <h2>查询结果</h2>
            <p>已找到 {results.length} 人。导出会重新按当前条件查询并记录导出任务。</p>
          </div>
          <div className="result-actions">
            <button type="button" className="ghost-button" onClick={() => void handleExportFiles()}>
              <Folder size={18} />
              导出资料
            </button>
            <button type="button" className="primary-button" onClick={() => void handleExportExcel()}>
              <Download size={18} />
              导出 Excel
            </button>
          </div>
        </div>
        {exportMessage ? <div className="risk-note">{exportMessage}</div> : null}
        {results.length > 0 ? (
          <div className="person-list">
            {results.map((person) => (
              <article key={person.personId} className="person-row">
                <input type="checkbox" aria-label={'选择 ' + (person.name ?? '未知人员')} defaultChecked />
                <div className="avatar avatar-person-1" />
                <div className="person-main">
                  <div>
                    <h3>{person.name ?? '未知人员'}</h3>
                    <div className="tag-row">
                      <span className="tag green">{person.primaryCategory ?? '未识别类别'}</span>
                      <span className="tag blue">{person.region ?? '未划分区域'}</span>
                      {person.idCardNumber ? <span className="tag gray">身份证 {person.idCardNumber}</span> : null}
                      {person.educationLevel ? <span className="tag gray">{person.educationLevel}</span> : null}
                    </div>
                  </div>
                  <p>{person.licenseNames.length > 0 ? person.licenseNames.join('、') : '暂无证书记录'}</p>
                  <span>{person.matchReason}；资料 {person.documentCount} 份</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="pending-result">
            <h2>暂无查询结果</h2>
            <p>设置条件后点击确认查询，结果会在这里展示。</p>
          </div>
        )}
      </article>
    </section>
  )
}

function ImportWorkspace({ onModeChange }: { onModeChange(mode: WorkspaceMode): void }) {
  const [selectedDirectory, setSelectedDirectory] = useState('')
  const [importResult, setImportResult] = useState<DirectoryScanResult | null>(null)
  const [tasks, setTasks] = useState<ProcessingTaskSummary[]>([])
  const [batchResult, setBatchResult] = useState<ProcessingBatchResult | null>(null)
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isRunningBatch, setIsRunningBatch] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)
  const [postProcessingReviewCount, setPostProcessingReviewCount] = useState<number | null>(null)

  async function refreshTasks() {
    try {
      setTaskError(null)
      const nextTasks = await window.qualidex.listProcessingTasks(12)
      setTasks(nextTasks)
    } catch (error) {
      setTaskError(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleSelectDirectory() {
    setIsSelectingDirectory(true)
    setImportError(null)

    try {
      const directory = await window.qualidex.selectSourceDirectory()
      if (directory) {
        setSelectedDirectory(directory)
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsSelectingDirectory(false)
    }
  }

  async function handleImportDirectory() {
    const directory = selectedDirectory.trim()
    if (!directory) {
      setImportError('请先选择资料目录。')
      return
    }

    setIsImporting(true)
    setImportError(null)
    setBatchResult(null)
    setPostProcessingReviewCount(null)

    try {
      const result = await window.qualidex.scanDirectory(directory)
      setImportResult(result)
      await refreshTasks()
    } catch (error) {
      setImportResult(null)
      setImportError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsImporting(false)
    }
  }

  async function handleRunProcessingBatch() {
    setIsRunningBatch(true)
    setTaskError(null)

    try {
      const result = await window.qualidex.runProcessingBatch(10)
      setBatchResult(result)
      if (result.remainingPendingTasks === 0) {
        const pendingReviewItems = await window.qualidex.listReviewItems(200)
        setPostProcessingReviewCount(pendingReviewItems.length)
      } else {
        setPostProcessingReviewCount(null)
      }
      await refreshTasks()
    } catch (error) {
      setBatchResult(null)
      setTaskError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsRunningBatch(false)
    }
  }

  return (
    <section className="workspace-stack">
      <article className="workspace-panel">
        <div className="section-heading inline-heading">
          <div>
            <h2>新增资料</h2>
            <p>选择本地资料目录后先导入文件清单，再按队列处理文字识别和结构化整理。</p>
          </div>
          <button type="button" className="ghost-button" onClick={refreshTasks}>
            刷新任务
          </button>
        </div>
        <div className="import-control-row">
          <div className="directory-field">
            <span>资料目录</span>
            <strong>{selectedDirectory || '尚未选择目录'}</strong>
          </div>
          <button type="button" className="ghost-button" onClick={handleSelectDirectory} disabled={isSelectingDirectory}>
            <Folder size={18} />
            {isSelectingDirectory ? '选择中' : '选择目录'}
          </button>
          <button type="button" className="primary-button" onClick={handleImportDirectory} disabled={isImporting}>
            <Download size={18} />
            {isImporting ? '导入中' : '导入资料'}
          </button>
        </div>
        {importError ? (
          <div className="risk-note">
            <AlertTriangle size={18} />
            {importError}
          </div>
        ) : null}
        {importResult ? (
          <>
            <div className="summary-grid">
              <article>
                <span>扫描文件</span>
                <strong>{importResult.totalFiles}</strong>
                <p>支持 {importResult.supportedFiles} 个，跳过 {importResult.unsupportedFiles} 个</p>
              </article>
              <article>
                <span>新增文件</span>
                <strong>{importResult.newFiles ?? 0}</strong>
                <p>已写入数据库并创建 OCR 任务</p>
              </article>
              <article>
                <span>重复文件</span>
                <strong>{importResult.duplicateFiles ?? 0}</strong>
                <p>按 hash 识别，不重复入库</p>
              </article>
              <article>
                <span>失败文件</span>
                <strong>{importResult.failedFiles ?? importResult.errors.length}</strong>
                <p>保留错误信息，便于人工检查</p>
              </article>
            </div>
            <div className="status-list">
              {importResult.files.slice(0, 8).map((file) => (
                <article key={`${file.path}-${file.sha256 ?? file.name}`} className="status-row">
                  <div>
                    <strong>{file.name}</strong>
                    <span>{file.processError ?? file.relativePath}</span>
                  </div>
                  <span className={`status-pill ${statusTone(file.importStatus)}`}>{importStatusLabel(file.importStatus)}</span>
                  {file.importStatus === 'duplicate' ? (
                    <span className="status-pill gray">不创建任务</span>
                  ) : (
                    <>
                      <span className={`status-pill ${statusTone(file.ocrStatus)}`}>{file.ocrStatus ?? '待识别'}</span>
                      <span className={`status-pill ${statusTone(file.aiStatus)}`}>{file.aiStatus ?? '待整理'}</span>
                    </>
                  )}
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="pending-result import-empty">
            <h2>尚未导入资料</h2>
            <p>导入只会读取原始目录并登记文件，不会移动、删除或覆盖原始资料。</p>
          </div>
        )}
      </article>

      <article className="workspace-panel">
        <div className="section-heading inline-heading">
          <div>
            <h2>处理队列</h2>
            <p>按任务队列执行 OCR 和 AI 整理，低置信度结果会进入待确认。</p>
          </div>
          <button type="button" className="primary-button" onClick={handleRunProcessingBatch} disabled={isRunningBatch}>
            <CheckCircle2 size={18} />
            {isRunningBatch ? '处理中' : '处理 10 个任务'}
          </button>
        </div>
        {taskError ? (
          <div className="risk-note">
            <AlertTriangle size={18} />
            {taskError}
          </div>
        ) : null}
        {batchResult ? (
          <div className="summary-grid">
            <article>
              <span>本次处理</span>
              <strong>{batchResult.processedTasks}</strong>
              <p>最多处理 {batchResult.maxTasks} 个任务</p>
            </article>
            <article>
              <span>已完成</span>
              <strong>{batchResult.completedTasks}</strong>
              <p>处理成功并写回结果</p>
            </article>
            <article>
              <span>失败/跳过</span>
              <strong>{batchResult.failedTasks + batchResult.skippedTasks}</strong>
              <p>可在任务列表查看原因</p>
            </article>
            <article>
              <span>剩余待处理</span>
              <strong>{batchResult.remainingPendingTasks}</strong>
              <p>继续处理即可推进队列</p>
            </article>
          </div>
        ) : null}
        {batchResult && batchResult.remainingPendingTasks === 0 ? (
          <div className="import-next-action">
            <div>
              <strong>{postProcessingReviewCount && postProcessingReviewCount > 0 ? '需要人工确认' : '可以生成归档预览'}</strong>
              <span>
                {postProcessingReviewCount && postProcessingReviewCount > 0
                  ? `发现 ${postProcessingReviewCount} 条待确认资料，处理后再生成归档更稳。`
                  : '当前没有待处理任务，可进入归档预览继续检查输出路径。'}
              </span>
            </div>
            <button
              type="button"
              className="primary-button"
              onClick={() => onModeChange(postProcessingReviewCount && postProcessingReviewCount > 0 ? 'review' : 'export')}
            >
              {postProcessingReviewCount && postProcessingReviewCount > 0 ? '查看待确认资料' : '生成归档预览'}
            </button>
          </div>
        ) : null}
        <div className="task-list">
          {tasks.length > 0 ? (
            tasks.map((task) => (
              <article key={task.id} className="task-row">
                <div>
                  <strong>{taskTypeLabel(task.taskType)}</strong>
                  <span>{task.fileId ? `文件 ${task.fileId}` : '批次任务'}</span>
                </div>
                <span className={`status-pill ${statusTone(task.status)}`}>{taskStatusLabel(task.status)}</span>
                <span>尝试 {task.attempts}/{task.maxAttempts}</span>
                <small>{task.error ?? task.resultSummary ?? '等待处理结果'}</small>
              </article>
            ))
          ) : (
            <div className="pending-result import-empty">
              <h2>暂无任务列表</h2>
              <p>导入资料后会自动创建 OCR 任务，也可以点击刷新查看最新状态。</p>
            </div>
          )}
        </div>
      </article>
    </section>
  )
}

function importStatusLabel(status: ScannedFile['importStatus']): string {
  const labels: Record<NonNullable<ScannedFile['importStatus']>, string> = {
    new: '新增',
    duplicate: '重复',
    failed: '失败',
  }

  return status ? labels[status] : '已扫描'
}

function taskTypeLabel(taskType: ProcessingTaskType): string {
  const labels: Record<ProcessingTaskType, string> = {
    ocr: '文字识别',
    ai_extract: '结构化整理',
    archive: '归档生成',
  }

  return labels[taskType]
}

function taskStatusLabel(status: ProcessingTaskStatus): string {
  const labels: Record<ProcessingTaskStatus, string> = {
    pending: '待处理',
    running: '处理中',
    completed: '已完成',
    failed: '失败',
    skipped: '已跳过',
  }

  return labels[status]
}

function statusTone(status: string | null | undefined): string {
  if (status === 'completed' || status === 'new' || status === 'archived') {
    return 'green'
  }

  if (status === 'failed') {
    return 'red'
  }

  if (status === 'duplicate' || status === 'skipped') {
    return 'gray'
  }

  if (status === 'running') {
    return 'blue'
  }

  return 'orange'
}

function ReviewWorkspace() {
  const [items, setItems] = useState<ReviewItemSummary[]>([])
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [expandedPersonIds, setExpandedPersonIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [activeReviewItemId, setActiveReviewItemId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadReviewItems()
  }, [])

  const reviewPeople = createReviewPeople(items)
  const filteredPeople = reviewPeople.filter((person) => matchesReviewFilter(person, filter, query))
  const selectedPerson = selectedPersonId
    ? reviewPeople.find((person) => person.id === selectedPersonId) ?? null
    : null
  const filterOptions = createReviewFilterOptions(reviewPeople)
  const isReviewActionBusy = Boolean(activeReviewItemId)

  async function loadReviewItems() {
    setIsLoading(true)
    setError(null)

    try {
      const nextItems = await window.qualidex.listReviewItems(30)
      setItems(nextItems)
    } catch (nextError) {
      setItems([])
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setIsLoading(false)
    }
  }

  async function handleConfirmPerson(person: ReviewPersonCandidate) {
    setActiveReviewItemId(person.id)
    setError(null)

    try {
      const confirmedValue = JSON.stringify({
        personName: person.personName,
        idCardNumber: person.idCardNumber,
        education: person.education,
        certificates: person.certificates,
        files: person.files,
      })
      await Promise.all(person.reviewItemIds.map((reviewItemId) => (
        window.qualidex.confirmReviewItem(reviewItemId, confirmedValue)
      )))
      await loadReviewItems()
      setSelectedPersonId(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setActiveReviewItemId(null)
    }
  }

  async function handleIgnorePerson(person: ReviewPersonCandidate) {
    setActiveReviewItemId(person.id)
    setError(null)

    try {
      await Promise.all(person.reviewItemIds.map((reviewItemId) => (
        window.qualidex.ignoreReviewItem(reviewItemId, '人工跳过人员确认')
      )))
      await loadReviewItems()
      setSelectedPersonId(null)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setActiveReviewItemId(null)
    }
  }

  async function handleOpenSourceFile(file: ReviewPersonFile) {
    setActiveReviewItemId(file.reviewItemId)
    setError(null)

    try {
      const result = await window.qualidex.openReviewSourceFile(file.reviewItemId)
      if (!result.opened) {
        setError(result.error ?? '无法打开原始文件。')
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setActiveReviewItemId(null)
    }
  }

  async function handleOpenSourceFolder(file: ReviewPersonFile) {
    setActiveReviewItemId(file.reviewItemId)
    setError(null)

    try {
      const result = await window.qualidex.openReviewSourceFolder(file.reviewItemId)
      if (!result.opened) {
        setError(result.error ?? '无法打开原始文件夹。')
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setActiveReviewItemId(null)
    }
  }

  function togglePersonFiles(personId: string) {
    setExpandedPersonIds((current) => current.includes(personId)
      ? current.filter((item) => item !== personId)
      : [...current, personId])
  }

  return (
    <section className="review-workspace">
      {error ? (
        <div className="risk-note">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}

      {selectedPerson ? (
        <article className="review-detail-shell">
          <div className="review-detail-topbar">
            <button type="button" className="review-back-button" onClick={() => setSelectedPersonId(null)}>
              <ChevronRight size={18} />
              返回列表
            </button>
            <span>第 {reviewPeople.findIndex((person) => person.id === selectedPerson.id) + 1} / {reviewPeople.length} 条</span>
          </div>
          <div className="review-person-detail-card">
            <div className="review-person-detail-header">
              <h2>人员确认卡</h2>
              <span className="review-status-badge">待确认</span>
              <HelpCircle size={20} />
            </div>
            <div className="review-person-detail-body">
              <div className="review-avatar review-avatar-large" aria-hidden="true" />
              <div className="review-detail-fields">
                <label>
                  <span>姓名</span>
                  <input value={selectedPerson.personName ?? ''} readOnly placeholder="待确认" />
                </label>
                <label>
                  <span>身份证号</span>
                  <input value={selectedPerson.idCardNumber ?? selectedPerson.idCardMaskedDisplay ?? ''} readOnly placeholder="待确认" />
                </label>
                <label>
                  <span>学历</span>
                  <input value={selectedPerson.education ?? ''} readOnly placeholder="请输入学历" />
                </label>
              </div>
              <div className="review-detail-confidence">
                <span>置信度：</span>
                <strong className={confidenceToneClass(selectedPerson.confidence)}>{formatPercent(selectedPerson.confidence)}</strong>
              </div>
            </div>

            <section className="review-certificate-editor">
              <div className="review-subheading">
                <h3>证书信息</h3>
                <span>({selectedPerson.certificates.length})</span>
              </div>
              {selectedPerson.certificates.length > 0 ? (
                selectedPerson.certificates.map((certificate, index) => (
                  <div key={`${certificate.displayName ?? 'certificate'}-${index}`} className="review-certificate-row">
                    <label>
                      <span>证书名称</span>
                      <input value={certificate.certificateName ?? ''} readOnly placeholder="请选择或输入证书名称" />
                    </label>
                    <label>
                      <span>证书专业</span>
                      <input value={certificate.certificateSpecialty ?? ''} readOnly placeholder="请选择或输入证书专业" />
                    </label>
                  </div>
                ))
              ) : (
                <button type="button" className="review-add-certificate" disabled>
                  <PlusCircle size={18} />
                  添加证书（后续支持）
                </button>
              )}
            </section>

            <section className="review-related-files-detail">
              <div className="review-subheading">
                <h3>相关文件</h3>
                <span>({selectedPerson.files.length})</span>
              </div>
              {selectedPerson.files.map((file) => (
                <article key={`${selectedPerson.id}-${file.relativePath}`} className="review-file-detail-card">
                  <div className="review-file-icon">
                    <FileText size={26} />
                  </div>
                  <div>
                    <strong>{file.fileName}</strong>
                    <span>路径：{file.relativePath}</span>
                  </div>
                  <div>
                    <span>关系</span>
                    <strong>{relationTypeLabel(file.relationType)}</strong>
                  </div>
                  <div>
                    <span>置信度</span>
                    <strong className={confidenceToneClass(file.relationConfidence)}>{formatPercent(file.relationConfidence)}</strong>
                  </div>
                  <button type="button" className="ghost-button" onClick={() => void handleOpenSourceFile(file)}>
                    <Eye size={17} />
                    打开文件
                  </button>
                  <button type="button" className="ghost-button" onClick={() => void handleOpenSourceFolder(file)}>
                    <Folder size={17} />
                    打开所在文件夹
                  </button>
                  {file.evidence.length > 0 || file.ocrText ? (
                    <div className="review-file-evidence">
                      <strong>识别依据</strong>
                      <p>{file.evidence[0] ?? createPreviewText(file.ocrText ?? '', 180)}</p>
                    </div>
                  ) : null}
                </article>
              ))}
            </section>

            <div className="review-detail-actions">
              <button type="button" className="ghost-button" onClick={() => void handleIgnorePerson(selectedPerson)}>
                跳过
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleConfirmPerson(selectedPerson)}
                disabled={isReviewActionBusy}
              >
                确认并保存
              </button>
            </div>
          </div>
        </article>
      ) : items.length > 0 ? (
        <article className="review-list-panel">
          <div className="review-list-header">
            <div>
              <h2>待确认资料</h2>
              <span>{reviewPeople.length} 人 / {items.length} 条</span>
            </div>
            <div className="review-list-tools">
              <span>排序： 最新导入 <ChevronDown size={15} /></span>
              <button type="button" className="icon-button" onClick={loadReviewItems} disabled={isLoading} aria-label="刷新待确认资料">
                <RefreshCw size={17} />
              </button>
            </div>
          </div>
          <label className="review-search-box">
            <Search size={18} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索姓名、身份证号、证书、文件名"
            />
          </label>
          <div className="review-filter-tabs">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={filter === option.value ? 'active' : ''}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
                <span>{option.count}</span>
              </button>
            ))}
          </div>
          <div className="review-person-list">
            {filteredPeople.map((person, index) => {
              const isExpanded = expandedPersonIds.includes(person.id)
              return (
                <article key={person.id} className={`review-person-row ${index === 0 ? 'selected' : ''}`}>
                  <div className="review-person-row-main">
                    <input type="checkbox" aria-label={`选择 ${person.personName ?? '未知人员'}`} />
                    <div className={`review-avatar review-avatar-${(index % 3) + 1}`} aria-hidden="true" />
                    <div className="review-person-identity">
                      <div>
                        <h3>{personDisplayName(person)}</h3>
                        <HelpCircle size={16} />
                      </div>
                      <span>身份证号：{person.idCardNumber ?? person.idCardMaskedDisplay ?? '未识别'}</span>
                      <span>学历：{person.education ?? '未识别'}</span>
                      <span>证书：{person.certificates.length > 0 ? person.certificates.map((item) => item.displayName).join('、') : '未识别'}</span>
                    </div>
                    <div className="review-tag-column">
                      <span>待确认标签</span>
                      <div>
                        {person.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className={`review-reason-tag ${reviewTagTone(tag)}`}>{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div className="review-file-count">
                      <span>相关文件</span>
                      <strong>{person.files.length} 个</strong>
                    </div>
                    <div className="review-confidence-cell">
                      <span>置信度</span>
                      <strong className={confidenceToneClass(person.confidence)}>{formatPercent(person.confidence)}</strong>
                    </div>
                    <div className="review-row-actions">
                      <button type="button" className="primary-button" onClick={() => setSelectedPersonId(person.id)}>
                        查看详情
                        <ChevronRight size={17} />
                      </button>
                      <button type="button" className="ghost-button" onClick={() => togglePersonFiles(person.id)}>
                        <Folder size={17} />
                        {isExpanded ? '收起相关文件' : '显示相关文件'}
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void handleIgnorePerson(person)}
                        disabled={isReviewActionBusy}
                      >
                        跳过
                      </button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="review-inline-files">
                      {person.files.map((file) => (
                        <article key={`${person.id}-${file.relativePath}`}>
                          <FileText size={24} />
                          <div>
                            <strong>{file.fileName}</strong>
                            <span>路径：{file.relativePath}</span>
                          </div>
                          <span>关系：{relationTypeLabel(file.relationType)}</span>
                          <strong className={confidenceToneClass(file.relationConfidence)}>
                            {formatPercent(file.relationConfidence)}
                          </strong>
                          <button type="button" className="ghost-button" onClick={() => void handleOpenSourceFile(file)}>
                            打开文件
                          </button>
                          <button type="button" className="ghost-button" onClick={() => void handleOpenSourceFolder(file)}>
                            打开所在文件夹
                          </button>
                          <p>{file.evidence[0] ?? createPreviewText(file.ocrText ?? '', 140)}</p>
                        </article>
                      ))}
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        </article>
      ) : (
        <div className="pending-result import-empty">
          <h2>{isLoading ? '正在读取待确认资料' : '暂无待确认资料'}</h2>
          <p>处理 OCR / AI 任务后，低置信度、字段缺失或归并冲突会出现在这里。</p>
        </div>
      )}
    </section>
  )
}

function createPreviewText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized
}

function createReviewPeople(items: ReviewItemSummary[]): ReviewPersonCandidate[] {
  const people = new Map<string, ReviewPersonCandidate>()

  for (const item of items) {
    const parsed = parseReviewPayload(item.suggestedValue) ?? parseReviewPayload(item.aiResultJson)
    const personName = item.personName ?? getString(parsed, ['personName', 'person_name', 'name'])
    const idCardNumber = item.idCardNumber ?? getString(parsed, ['idCardNumber', 'id_card_number'])
    const idCardMaskedDisplay = getString(parsed, ['idCardMaskedDisplay', 'id_card_masked_display', 'masked_display'])
    const education = getEducation(parsed)
    const certificates = getCertificates(item, parsed)
    const confidence = getConfidence(parsed, item)
    const relationType = getRelationType(item)
    const relationConfidence = getRelationConfidence(parsed, item, confidence)
    const key = item.personId
      ?? idCardNumber
      ?? personName
      ?? item.refId
      ?? item.id
    const existing = people.get(key)
    const file: ReviewPersonFile = {
      reviewItemId: item.id,
      fileName: item.fileName ?? '未知文件',
      relativePath: item.relativePath ?? item.fileName ?? '未记录路径',
      originalPath: item.sourcePath,
      relationType,
      relationConfidence,
      evidence: [item.reason, item.aiSummary].filter((value): value is string => Boolean(value)),
      ocrText: item.ocrText,
    }

    if (!existing) {
      const reviewReasons = [item.reason ?? '需要人工确认']
      const nextPerson: ReviewPersonCandidate = {
        id: key,
        reviewItemIds: [item.id],
        personName,
        idCardNumber,
        idCardMaskedDisplay,
        education,
        region: item.region,
        certificates,
        confidence,
        needsReview: true,
        reviewReasons,
        tags: createReviewTags(item, education, certificates, reviewReasons),
        files: [file],
      }
      people.set(key, nextPerson)
      continue
    }

    existing.reviewItemIds = [...new Set([...existing.reviewItemIds, item.id])]
    existing.personName = existing.personName ?? personName
    existing.idCardNumber = existing.idCardNumber ?? idCardNumber
    existing.idCardMaskedDisplay = existing.idCardMaskedDisplay ?? idCardMaskedDisplay
    existing.education = existing.education ?? education
    existing.region = existing.region ?? item.region
    existing.certificates = dedupeReviewCertificates([...existing.certificates, ...certificates])
    existing.confidence = Math.min(existing.confidence, confidence)
    existing.reviewReasons = [...new Set([...existing.reviewReasons, item.reason ?? '需要人工确认'])]
    existing.tags = createReviewTags(item, existing.education, existing.certificates, existing.reviewReasons, existing.tags)
    existing.files = dedupeReviewFiles([...existing.files, file])
  }

  return [...people.values()].sort((left, right) => left.confidence - right.confidence)
}

function createReviewFilterOptions(people: ReviewPersonCandidate[]): Array<{ value: ReviewFilter; label: string; count: number }> {
  return [
    { value: 'all', label: '全部', count: people.length },
    { value: 'person_conflict', label: '人员冲突', count: people.filter((person) => person.tags.includes('人员冲突')).length },
    { value: 'education_unknown', label: '学历未知', count: people.filter((person) => person.tags.includes('学历未知')).length },
    { value: 'license_review', label: '证书待确认', count: people.filter((person) => person.tags.includes('证书待确认')).length },
    { value: 'region_unknown', label: '地区未知', count: people.filter((person) => person.tags.includes('地区未知')).length },
    { value: 'multi_person', label: '多人员资料', count: people.filter((person) => person.tags.includes('多人员资料')).length },
    { value: 'failed', label: '识别失败', count: people.filter((person) => person.tags.includes('识别失败')).length },
  ]
}

function matchesReviewFilter(person: ReviewPersonCandidate, filter: ReviewFilter, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  const matchesQuery = !normalizedQuery || [
    person.personName,
    person.idCardNumber,
    person.idCardMaskedDisplay,
    person.education,
    ...person.certificates.flatMap((certificate) => [certificate.certificateName, certificate.certificateSpecialty, certificate.displayName]),
    ...person.files.flatMap((file) => [file.fileName, file.relativePath]),
  ].some((value) => value?.toLowerCase().includes(normalizedQuery))

  if (!matchesQuery) {
    return false
  }

  const tagByFilter: Record<ReviewFilter, string | null> = {
    all: null,
    person_conflict: '人员冲突',
    education_unknown: '学历未知',
    license_review: '证书待确认',
    region_unknown: '地区未知',
    multi_person: '多人员资料',
    failed: '识别失败',
  }
  const tag = tagByFilter[filter]
  return tag ? person.tags.includes(tag) : true
}

function createReviewTags(
  item: ReviewItemSummary,
  education: string | null,
  certificates: ReviewPersonCertificate[],
  reviewReasons: string[],
  baseTags: string[] = [],
): string[] {
  const tags = new Set(baseTags)
  const text = [item.itemType, item.reason, ...reviewReasons].join(' ')

  if (text.includes('人员') || text.includes('归并')) {
    tags.add('人员冲突')
  }
  if (!education || text.includes('学历')) {
    tags.add('学历未知')
  }
  if (certificates.length === 0 || certificates.some((certificate) => !certificate.certificateName || !certificate.certificateSpecialty) || text.includes('证书')) {
    tags.add('证书待确认')
  }
  if (!item.region || text.includes('地区')) {
    tags.add('地区未知')
  }
  if (text.includes('多人') || item.itemType === 'multi_person_file') {
    tags.add('多人员资料')
  }
  if (text.includes('失败') || item.itemType === 'ai_extract_failed' || item.itemType === 'ocr_failed') {
    tags.add('识别失败')
  }

  return [...tags]
}

function parseReviewPayload(value: string | null): unknown {
  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function getString(value: unknown, keys: string[]): string | null {
  const record = asRecord(value)
  for (const key of keys) {
    const item = record[key]
    if (typeof item === 'string' && item.trim()) {
      return item.trim()
    }
  }
  return null
}

function getEducation(value: unknown): string | null {
  const record = asRecord(value)
  if (typeof record.education === 'string' && record.education.trim()) {
    return record.education.trim()
  }

  const education = asRecord(record.education)
  const parts = [education.level, education.school, education.major]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)

  return parts.length > 0 ? parts.join(' / ') : null
}

function getCertificates(item: ReviewItemSummary, value: unknown): ReviewPersonCertificate[] {
  const record = asRecord(value)
  const rawCertificates = Array.isArray(record.certificates)
    ? record.certificates
    : Array.isArray(record.licenses)
      ? record.licenses
      : record.license
        ? [record.license]
        : []
  const certificates = rawCertificates.map((entry) => {
    const certificate = asRecord(entry)
    const certificateName = getString(certificate, ['certificateName', 'certificate_name', 'normalized_license_name', 'raw_license_name'])
    const certificateSpecialty = getString(certificate, ['certificateSpecialty', 'certificate_specialty', 'license_category'])
    return {
      certificateName,
      certificateSpecialty,
      displayName: buildReviewCertificateDisplayName(certificateName, certificateSpecialty),
      confidence: getNumber(certificate.confidence),
      evidence: Array.isArray(certificate.evidence)
        ? certificate.evidence.filter((evidence): evidence is string => typeof evidence === 'string')
        : [],
    }
  }).filter((certificate) => certificate.certificateName || certificate.certificateSpecialty)

  if (item.licenseName && !certificates.some((certificate) => certificate.certificateName === item.licenseName)) {
    certificates.push({
      certificateName: item.licenseName,
      certificateSpecialty: null,
      displayName: item.licenseName,
      confidence: item.licenseNeedsReview ? 0.65 : 0.82,
      evidence: item.reason ? [item.reason] : [],
    })
  }

  return dedupeReviewCertificates(certificates)
}

function buildReviewCertificateDisplayName(name: string | null, specialty: string | null): string | null {
  if (name && specialty) {
    return `${name}/${specialty}`
  }

  return name ?? specialty
}

function getConfidence(value: unknown, item: ReviewItemSummary): number {
  const record = asRecord(value)
  const parsedConfidence = getNumber(record.confidence)
  if (parsedConfidence !== null) {
    return parsedConfidence
  }
  if (item.itemType === 'ai_extract_failed' || item.itemType === 'ocr_failed') {
    return 0.42
  }
  if (item.licenseNeedsReview) {
    return 0.68
  }
  return 0.78
}

function getRelationConfidence(value: unknown, item: ReviewItemSummary, fallback: number): number {
  const record = asRecord(value)
  const files = Array.isArray(record.files) ? record.files : []
  const matchingFile = files
    .map((entry) => asRecord(entry))
    .find((entry) => entry.relativePath === item.relativePath || entry.relative_path === item.relativePath)
  return getNumber(matchingFile?.relationConfidence)
    ?? getNumber(matchingFile?.relation_confidence)
    ?? fallback
}

function getRelationType(item: ReviewItemSummary): ReviewPersonFile['relationType'] {
  if (item.itemType === 'multi_person_file') {
    return 'multi_person'
  }
  if (item.itemType?.includes('conflict')) {
    return 'uncertain'
  }
  return item.personId ? 'owner' : 'mentioned'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function getNumber(value: unknown): number | null {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.min(Math.max(parsed, 0), 1)
}

function dedupeReviewCertificates(certificates: ReviewPersonCertificate[]): ReviewPersonCertificate[] {
  const seen = new Set<string>()
  return certificates.filter((certificate) => {
    const key = `${certificate.certificateName ?? ''}/${certificate.certificateSpecialty ?? ''}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function dedupeReviewFiles(files: ReviewPersonFile[]): ReviewPersonFile[] {
  const byPath = new Map<string, ReviewPersonFile>()

  for (const file of files) {
    const current = byPath.get(file.relativePath)
    if (!current || current.relationConfidence < file.relationConfidence) {
      byPath.set(file.relativePath, file)
    }
  }

  return [...byPath.values()]
}

function personDisplayName(person: ReviewPersonCandidate): string {
  const suffix = person.idCardNumber?.slice(-4) ?? person.idCardMaskedDisplay?.slice(-4)
  return `${person.personName ?? '未知人员'}${suffix ? `_${suffix}` : ''}`
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function confidenceToneClass(value: number): string {
  if (value >= 0.85) {
    return 'confidence-high'
  }
  if (value >= 0.7) {
    return 'confidence-medium'
  }
  return 'confidence-low'
}

function relationTypeLabel(value: ReviewPersonFile['relationType']): string {
  const labels: Record<ReviewPersonFile['relationType'], string> = {
    owner: 'owner',
    mentioned: 'mentioned',
    multi_person: 'multi_person',
    uncertain: 'uncertain',
  }

  return labels[value]
}

function reviewTagTone(tag: string): string {
  if (tag.includes('失败')) {
    return 'red'
  }
  if (tag.includes('多人')) {
    return 'pink'
  }
  if (tag.includes('地区')) {
    return 'blue'
  }
  return 'orange'
}

function ExportWorkspace() {
  const [outputRoot, setOutputRoot] = useState('')
  const [preview, setPreview] = useState<ArchivePreviewResult | null>(null)
  const [writeResult, setWriteResult] = useState<ArchiveWriteResult | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [isWritingArchive, setIsWritingArchive] = useState(false)

  async function handleGenerateArchivePreview() {
    const trimmedOutputRoot = outputRoot.trim()
    if (!trimmedOutputRoot) {
      setPreview(null)
      setPreviewError('请先填写归档输出目录。')
      return
    }

    setIsLoadingPreview(true)
    setPreviewError(null)
    setWriteResult(null)

    try {
      const result = await window.qualidex.generateArchivePreview(trimmedOutputRoot)
      setPreview(result)
    } catch (error) {
      setPreview(null)
      setPreviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsLoadingPreview(false)
    }
  }

  async function handleWriteArchive() {
    const trimmedOutputRoot = outputRoot.trim()
    if (!preview || !trimmedOutputRoot) {
      setPreviewError('请先生成归档预览。')
      return
    }

    setIsWritingArchive(true)
    setPreviewError(null)

    try {
      const result = await window.qualidex.writeArchive(trimmedOutputRoot)
      setWriteResult(result)
      const refreshedPreview = await window.qualidex.generateArchivePreview(trimmedOutputRoot)
      setPreview(refreshedPreview)
    } catch (error) {
      setWriteResult(null)
      setPreviewError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsWritingArchive(false)
    }
  }

  return (
    <section className="workspace-stack">
      <article className="workspace-panel">
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
      </article>

      <article className="workspace-panel archive-preview-panel">
        <div className="section-heading inline-heading">
          <h2>归档预览</h2>
          <p>仅生成目标路径预览，不会复制或修改文件。</p>
          <button
            type="button"
            className="primary-button"
            onClick={handleWriteArchive}
            disabled={!preview || isWritingArchive}
          >
            <Download size={18} />
            {isWritingArchive ? '生成中' : '确认生成归档'}
          </button>
        </div>
        <div className="risk-note">
          <AlertTriangle size={18} />
          生成归档只会复制安全项到输出目录；待确认、路径冲突和已存在文件会跳过，原始资料不会被移动、删除或覆盖。
        </div>
        <div className="archive-preview-controls">
          <label>
            <span>归档输出目录</span>
            <input
              type="text"
              value={outputRoot}
              onChange={(event) => setOutputRoot(event.target.value)}
              placeholder="例如 D:\\归档输出"
            />
          </label>
          <button type="button" className="primary-button" onClick={handleGenerateArchivePreview}>
            <Folder size={18} />
            {isLoadingPreview ? '生成中' : '生成预览'}
          </button>
        </div>
        {previewError ? (
          <div className="risk-note">
            <AlertTriangle size={18} />
            {previewError}
          </div>
        ) : null}
        {preview ? (
          <>
            <div className="summary-grid archive-preview-summary">
              <article>
                <span>预览文件</span>
                <strong>{preview.totalItems}</strong>
                <p>来自已确认或待确认的资料关联</p>
              </article>
              <article>
                <span>待确认</span>
                <strong>{preview.reviewItems}</strong>
                <p>会先放入 99_待确认 或标记原因</p>
              </article>
              <article>
                <span>路径冲突</span>
                <strong>{preview.conflictItems}</strong>
                <p>需要人工确认后再生成</p>
              </article>
            </div>
            <div className="archive-preview-list">
              {preview.items.slice(0, 6).map((item) => (
                <article key={`${item.fileId}-${item.targetRelativePath}`}>
                  <div>
                    <strong>{item.personName ?? '未知人员'}</strong>
                    <span>{item.primaryCategory} / {item.region} / {item.documentFolder}</span>
                  </div>
                  <p>{item.targetRelativePath}</p>
                  {item.needsReview ? <small>{item.reviewReasons.join('；')}</small> : null}
                </article>
              ))}
            </div>
          </>
        ) : (
          <div className="pending-result archive-preview-empty">
            <h2>尚未生成归档预览</h2>
            <p>填写输出目录后生成预览，系统只会读取数据库并计算目标路径。</p>
          </div>
        )}
        {writeResult ? (
          <div className="archive-write-result">
            <div className="summary-grid archive-preview-summary">
              <article>
                <span>复制成功</span>
                <strong>{writeResult.copiedItems}</strong>
                <p>已写入归档输出目录</p>
              </article>
              <article>
                <span>跳过待确认</span>
                <strong>{writeResult.skippedReviewItems}</strong>
                <p>确认后再生成正式归档</p>
              </article>
              <article>
                <span>跳过冲突</span>
                <strong>{writeResult.skippedConflictItems}</strong>
                <p>目标路径冲突未复制</p>
              </article>
              <article>
                <span>目标已存在</span>
                <strong>{writeResult.skippedExistingItems}</strong>
                <p>未覆盖已有文件</p>
              </article>
              <article>
                <span>失败</span>
                <strong>{writeResult.failedItems}</strong>
                <p>需要检查路径或权限</p>
              </article>
            </div>
            <div className="archive-preview-list">
              {writeResult.results
                .filter((item) => item.status !== 'copied')
                .slice(0, 6)
                .map((item) => (
                  <article key={`${item.fileId}-${item.status}-${item.targetRelativePath}`}>
                    <div>
                      <strong>{archiveStatusLabel(item.status)}</strong>
                      <span>{item.reason ?? '未复制'}</span>
                    </div>
                    <p>{item.targetRelativePath}</p>
                  </article>
                ))}
            </div>
          </div>
        ) : null}
      </article>
    </section>
  )
}

function archiveStatusLabel(status: ArchiveWriteStatus): string {
  const labels: Record<ArchiveWriteStatus, string> = {
    copied: '已复制',
    skipped_review: '跳过待确认',
    skipped_conflict: '跳过冲突',
    skipped_existing: '目标已存在',
    skipped_outside_output: '路径越界',
    failed: '生成失败',
  }

  return labels[status]
}
