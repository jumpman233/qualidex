import { Eye, Folder, Download, CheckCircle2, Search, Sparkles, MapPin, UserRound, AlertTriangle } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  exportItems,
  personResults,
  queryConditions,
  type WorkspaceMode,
} from '../mock/qualidexMock'

interface MainWorkspaceProps {
  mode: WorkspaceMode
  onModeChange(mode: WorkspaceMode): void
}

interface NewPersonDraft {
  name: string
  idCardLast4: string
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
  const [selectedDirectory, setSelectedDirectory] = useState('')
  const [importResult, setImportResult] = useState<DirectoryScanResult | null>(null)
  const [tasks, setTasks] = useState<ProcessingTaskSummary[]>([])
  const [batchResult, setBatchResult] = useState<ProcessingBatchResult | null>(null)
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isRunningBatch, setIsRunningBatch] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [taskError, setTaskError] = useState<string | null>(null)

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
                    <span>{file.relativePath}</span>
                  </div>
                  <span className={`status-pill ${statusTone(file.importStatus)}`}>{importStatusLabel(file.importStatus)}</span>
                  <span className={`status-pill ${statusTone(file.ocrStatus)}`}>{file.ocrStatus ?? '待识别'}</span>
                  <span className={`status-pill ${statusTone(file.aiStatus)}`}>{file.aiStatus ?? '待整理'}</span>
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
  const [fieldDrafts, setFieldDrafts] = useState<Record<string, ReviewFieldPatch>>({})
  const [personCandidates, setPersonCandidates] = useState<PersonCandidateSummary[]>([])
  const [personDrafts, setPersonDrafts] = useState<Record<string, string>>({})
  const [newPersonDrafts, setNewPersonDrafts] = useState<Record<string, NewPersonDraft>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [activeReviewItemId, setActiveReviewItemId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadReviewItems()
    void loadPersonCandidates()
  }, [])

  async function loadReviewItems() {
    setIsLoading(true)
    setError(null)

    try {
      const nextItems = await window.qualidex.listReviewItems(30)
      setItems(nextItems)
      setFieldDrafts(createReviewFieldDrafts(nextItems))
      setPersonDrafts(createPersonDrafts(nextItems))
      setNewPersonDrafts(createNewPersonDrafts(nextItems))
    } catch (nextError) {
      setItems([])
      setFieldDrafts({})
      setPersonDrafts({})
      setNewPersonDrafts({})
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setIsLoading(false)
    }
  }

  async function loadPersonCandidates() {
    try {
      const nextCandidates = await window.qualidex.listPersonCandidates('', 120)
      setPersonCandidates(nextCandidates)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    }
  }

  async function handleConfirmReviewItem(item: ReviewItemSummary) {
    setActiveReviewItemId(item.id)
    setError(null)

    try {
      const confirmedValue = JSON.stringify({
        personName: item.personName,
        primaryCategory: item.primaryCategory,
        region: item.region,
        documentType: item.documentType,
        licenseName: item.licenseName,
      })
      await window.qualidex.confirmReviewItem(item.id, confirmedValue)
      await loadReviewItems()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setActiveReviewItemId(null)
    }
  }

  async function handleIgnoreReviewItem(item: ReviewItemSummary) {
    setActiveReviewItemId(item.id)
    setError(null)

    try {
      await window.qualidex.ignoreReviewItem(item.id, item.reason ?? '人工忽略')
      await loadReviewItems()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setActiveReviewItemId(null)
    }
  }

  function updateFieldDraft(reviewItemId: string, patch: ReviewFieldPatch) {
    setFieldDrafts((current) => ({
      ...current,
      [reviewItemId]: {
        ...current[reviewItemId],
        ...patch,
      },
    }))
  }

  function updatePersonDraft(reviewItemId: string, personId: string) {
    setPersonDrafts((current) => ({
      ...current,
      [reviewItemId]: personId,
    }))
  }

  function updateNewPersonDraft(reviewItemId: string, patch: Partial<NewPersonDraft>) {
    setNewPersonDrafts((current) => ({
      ...current,
      [reviewItemId]: {
        ...current[reviewItemId],
        ...patch,
      },
    }))
  }

  async function handleSaveReviewFields(item: ReviewItemSummary) {
    const draft = fieldDrafts[item.id] ?? {}
    setActiveReviewItemId(item.id)
    setError(null)

    try {
      await window.qualidex.updateReviewFields(item.id, draft)
      await loadReviewItems()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setActiveReviewItemId(null)
    }
  }

  async function handleReassignPerson(item: ReviewItemSummary) {
    const personId = personDrafts[item.id]
    if (!personId) {
      setError('请先选择要关联的人员。')
      return
    }

    setActiveReviewItemId(item.id)
    setError(null)

    try {
      await window.qualidex.reassignReviewPerson(item.id, personId)
      await loadReviewItems()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setActiveReviewItemId(null)
    }
  }

  async function handleCreatePerson(item: ReviewItemSummary) {
    const draft = newPersonDrafts[item.id] ?? { name: '', idCardLast4: '' }
    if (!draft.name.trim()) {
      setError('请先填写新人员姓名。')
      return
    }

    setActiveReviewItemId(item.id)
    setError(null)

    try {
      await window.qualidex.createPersonFromReview(item.id, {
        name: draft.name,
        idCardLast4: draft.idCardLast4,
        primaryCategory: fieldDrafts[item.id]?.primaryCategory ?? item.primaryCategory,
        region: fieldDrafts[item.id]?.region ?? item.region,
      })
      await loadReviewItems()
      await loadPersonCandidates()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setActiveReviewItemId(null)
    }
  }

  return (
    <section className="workspace-panel">
      <div className="section-heading inline-heading">
        <div>
          <h2>待确认资料</h2>
          <p>集中处理低置信度、字段缺失和人员归并冲突；确认或忽略都会记录操作日志。</p>
        </div>
        <button type="button" className="primary-button" onClick={loadReviewItems} disabled={isLoading}>
          <CheckCircle2 size={18} />
          {isLoading ? '刷新中' : '刷新待确认'}
        </button>
      </div>
      {error ? (
        <div className="risk-note">
          <AlertTriangle size={18} />
          {error}
        </div>
      ) : null}
      {items.length > 0 ? (
        <>
          <div className="review-summary-row">
            <strong>{items.length}</strong>
            <span>条待确认项等待人工处理。当前页面只读展示，不会修改数据库。</span>
          </div>
          <div className="review-grid">
            {items.map((item) => (
              <article key={item.id} className="review-card">
                <span>{reviewTypeLabel(item.itemType)}</span>
                <h3>{item.fileName ?? '未知文件'}</h3>
                <p>{item.reason ?? '需要人工确认'}</p>
                <small>{item.sourcePath ?? '未关联原始文件路径'}</small>
                <div className="editable-grid">
                  <label>
                    <span>类别</span>
                    <select
                      value={fieldDrafts[item.id]?.primaryCategory ?? ''}
                      onChange={(event) => updateFieldDraft(item.id, { primaryCategory: event.target.value })}
                    >
                      <option value="">待确认</option>
                      <option value="工程">工程</option>
                      <option value="消防员">消防员</option>
                      <option value="其他">其他</option>
                    </select>
                  </label>
                  <label>
                    <span>地区</span>
                    <input
                      type="text"
                      value={fieldDrafts[item.id]?.region ?? ''}
                      onChange={(event) => updateFieldDraft(item.id, { region: event.target.value })}
                      placeholder="待确认"
                    />
                  </label>
                  <label>
                    <span>人员</span>
                    <select
                      value={personDrafts[item.id] ?? ''}
                      onChange={(event) => updatePersonDraft(item.id, event.target.value)}
                    >
                      <option value="">待选择</option>
                      {personCandidates.map((person) => (
                        <option key={person.id} value={person.id}>
                          {personCandidateLabel(person)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>新人员姓名</span>
                    <input
                      type="text"
                      value={newPersonDrafts[item.id]?.name ?? ''}
                      onChange={(event) => updateNewPersonDraft(item.id, { name: event.target.value })}
                      placeholder="仅在需要新建时填写"
                    />
                  </label>
                  <label>
                    <span>身份证后四位</span>
                    <input
                      type="text"
                      value={newPersonDrafts[item.id]?.idCardLast4 ?? ''}
                      onChange={(event) => updateNewPersonDraft(item.id, { idCardLast4: event.target.value })}
                      placeholder="可选"
                      maxLength={4}
                    />
                  </label>
                  <label>
                    <span>资料类型</span>
                    <select
                      value={fieldDrafts[item.id]?.documentType ?? ''}
                      onChange={(event) => updateFieldDraft(item.id, { documentType: event.target.value })}
                    >
                      <option value="">待确认</option>
                      <option value="id_card">身份证</option>
                      <option value="diploma">学历</option>
                      <option value="degree">学位</option>
                      <option value="license">证书</option>
                      <option value="other">其他资料</option>
                    </select>
                  </label>
                  <label>
                    <span>证书</span>
                    <input
                      type="text"
                      value={fieldDrafts[item.id]?.licenseName ?? ''}
                      onChange={(event) => updateFieldDraft(item.id, { licenseName: event.target.value })}
                      placeholder="待确认"
                    />
                  </label>
                  <label>
                    <span>认可状态</span>
                    <select
                      value={fieldDrafts[item.id]?.licenseRecognitionStatus ?? ''}
                      onChange={(event) => updateFieldDraft(item.id, { licenseRecognitionStatus: event.target.value })}
                    >
                      <option value="">待确认</option>
                      <option value="suggested">建议认可</option>
                      <option value="confirmed">已认可</option>
                      <option value="pending_review">待确认</option>
                      <option value="rejected">不认可</option>
                    </select>
                  </label>
                  <label>
                    <span>状态</span>
                    <strong>{valueOrPending(item.status)}</strong>
                  </label>
                </div>
                <div className="review-detail-list">
                  <p>{item.ocrTextPreview ? `OCR：${item.ocrTextPreview}` : 'OCR：暂无文本预览'}</p>
                  <p>{item.aiSummary ? `AI：${item.aiSummary}` : 'AI：暂无结构化摘要'}</p>
                </div>
                <div className="workspace-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleSaveReviewFields(item)}
                    disabled={Boolean(activeReviewItemId)}
                  >
                    {activeReviewItemId === item.id ? '保存中' : '保存字段'}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleReassignPerson(item)}
                    disabled={Boolean(activeReviewItemId)}
                  >
                    {activeReviewItemId === item.id ? '更换中' : '更换人员'}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleCreatePerson(item)}
                    disabled={Boolean(activeReviewItemId)}
                  >
                    {activeReviewItemId === item.id ? '新建中' : '新建人员'}
                  </button>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleConfirmReviewItem(item)}
                    disabled={Boolean(activeReviewItemId)}
                  >
                    {activeReviewItemId === item.id ? '确认中' : '确认'}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleIgnoreReviewItem(item)}
                    disabled={Boolean(activeReviewItemId)}
                  >
                    {activeReviewItemId === item.id ? '处理中' : '忽略'}
                  </button>
                  <button type="button" className="ghost-button" disabled>
                    <Eye size={18} />
                    查看文件
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="pending-result import-empty">
          <h2>{isLoading ? '正在读取待确认资料' : '暂无待确认资料'}</h2>
          <p>处理 OCR / AI 任务后，低置信度、字段缺失或归并冲突会出现在这里。</p>
        </div>
      )}
    </section>
  )
}

function reviewTypeLabel(itemType: string | null): string {
  const labels: Record<string, string> = {
    person_unknown: '人员待确认',
    person_merge_conflict: '同名归并冲突',
    primary_category_unknown: '类别待确认',
    primary_category_conflict: '类别冲突',
    region_unknown: '地区待确认',
    document_type_unknown: '资料类型待确认',
    license_uncertain: '证书待确认',
    license_recognition_uncertain: '证书识别待确认',
    education_uncertain: '学历待确认',
    multi_person_file: '多人员资料',
    ocr_failed: '文字识别失败',
    ai_extract_failed: '整理失败',
    path_ocr_conflict: '路径与识别冲突',
    path_category_conflict: '路径类别冲突',
    path_region_conflict: '路径地区冲突',
    path_person_conflict: '路径人员冲突',
    ai_uncertain: '识别待确认',
  }

  return itemType ? labels[itemType] ?? itemType : '待确认'
}

function valueOrPending(value: string | null): string {
  return value?.trim() || '待确认'
}

function createReviewFieldDrafts(items: ReviewItemSummary[]): Record<string, ReviewFieldPatch> {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      {
        primaryCategory: item.primaryCategory ?? '',
        region: item.region ?? '',
        documentType: item.documentType ?? '',
        licenseName: item.licenseName ?? '',
        licenseRecognitionStatus: item.licenseRecognitionStatus ?? '',
      },
    ]),
  )
}

function createPersonDrafts(items: ReviewItemSummary[]): Record<string, string> {
  return Object.fromEntries(items.map((item) => [item.id, item.personId ?? '']))
}

function createNewPersonDrafts(items: ReviewItemSummary[]): Record<string, NewPersonDraft> {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      {
        name: '',
        idCardLast4: '',
      },
    ]),
  )
}

function personCandidateLabel(person: PersonCandidateSummary): string {
  const identity = person.idCardLast4 ? `_${person.idCardLast4}` : ''
  const category = person.primaryCategory ?? '未识别类别'
  const region = person.region ?? '未划分区域'
  return `${person.name ?? '未知人员'}${identity} / ${category} / ${region} / ${person.documentCount} 份资料`
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
