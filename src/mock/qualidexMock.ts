import type { LucideIcon } from 'lucide-react'
import {
  ArrowUpRight,
  Download,
  FileQuestion,
  FolderPlus,
  Search,
  UserRound,
} from 'lucide-react'

export type WorkspaceMode = 'home' | 'search' | 'import' | 'review' | 'export'

export interface QuickAction {
  id: WorkspaceMode
  label: string
  icon: LucideIcon
}

export interface OverviewCard {
  label: string
  value: string
  detail: string
  tone: 'blue' | 'orange' | 'green' | 'purple'
  icon: LucideIcon
}

export interface NavItem {
  id: WorkspaceMode
  label: string
  icon: LucideIcon
}

export interface QueryCondition {
  label: string
  value: string
}

export interface PersonResult {
  id: string
  name: string
  summary: string
  reason: string
  tags: Array<{
    label: string
    tone: 'green' | 'orange'
  }>
}

export interface ReviewItem {
  id: string
  type: string
  fileName: string
  guess: string
  reason: string
}

export interface ExportItem {
  id: string
  label: string
  checked: boolean
}

export interface ImportSummaryItem {
  label: string
  value: string
  detail: string
}

export const quickActions: QuickAction[] = [
  { id: 'search', label: '查询人员', icon: Search },
  { id: 'import', label: '新增资料', icon: FolderPlus },
  { id: 'review', label: '查看待确认', icon: FileQuestion },
  { id: 'export', label: '导出记录', icon: Download },
]

export const overviewCards: OverviewCard[] = [
  {
    label: '已整理人员',
    value: '28',
    detail: '工程 18 / 环境 6 / 消防员 4',
    tone: 'blue',
    icon: UserRound,
  },
  {
    label: '待确认资料',
    value: '6',
    detail: '地区不明 3 / 证书待确认 2',
    tone: 'orange',
    icon: FileQuestion,
  },
  {
    label: '最近新增',
    value: '12',
    detail: '来自 成都工程新增资料',
    tone: 'green',
    icon: ArrowUpRight,
  },
  {
    label: '导出记录',
    value: '4',
    detail: '最近一次：成都二建人员',
    tone: 'purple',
    icon: Download,
  },
]

export const navItems: NavItem[] = [
  { id: 'home', label: '首页概览', icon: UserRound },
  { id: 'search', label: '查询结果', icon: Search },
  { id: 'import', label: '新增资料', icon: FolderPlus },
  { id: 'review', label: '待确认', icon: FileQuestion },
  { id: 'export', label: '导出预览', icon: Download },
]

export const queryConditions: QueryCondition[] = [
  { label: '类别', value: '工程' },
  { label: '地区', value: '成都' },
  { label: '人数', value: '3 人' },
  { label: '学历', value: '大专以上' },
  { label: '证书', value: '二建证' },
  { label: '资料完整度', value: '优先完整' },
  { label: '待确认', value: '不包含' },
  { label: '导出', value: 'Excel + 文件夹' },
]

export const personResults: PersonResult[] = [
  {
    id: 'person-1',
    name: '张三_1234',
    summary: '工程 / 成都 / 大专 / 二级建造师注册证书',
    reason: '证书名称与“二建证”强匹配，学历满足大专以上。',
    tags: [
      { label: '强匹配', tone: 'green' },
      { label: '资料完整', tone: 'green' },
    ],
  },
  {
    id: 'person-2',
    name: '李四_5678',
    summary: '工程 / 成都 / 本科 / 二级建造师执业资格证书',
    reason: '证书属于二级建造师相关正式证书，地区与学历均满足。',
    tags: [
      { label: '强匹配', tone: 'green' },
      { label: '资料完整', tone: 'green' },
    ],
  },
  {
    id: 'person-3',
    name: '王五_9012',
    summary: '工程 / 成都 / 大专 / 二级建造师继续教育证明',
    reason: '证书与二建相关，但不一定等同于正式二建证。',
    tags: [
      { label: '可能相关', tone: 'orange' },
      { label: '需要确认', tone: 'orange' },
    ],
  },
]

export const reviewItems: ReviewItem[] = [
  {
    id: 'review-1',
    type: '地区不确定',
    fileName: '王五_二建继续教育证明.pdf',
    guess: '系统猜测：成都 / 工程 / 王五_9012',
    reason: 'OCR 文本中出现成都培训机构，但未明确人员所在地区。',
  },
  {
    id: 'review-2',
    type: '证书待确认',
    fileName: '李四_资格证书扫描件.jpg',
    guess: '系统猜测：二级建造师执业资格证书',
    reason: '证书名称完整，但发证机构识别置信度较低。',
  },
]

export const importSummary: ImportSummaryItem[] = [
  { label: '新增人员', value: '8', detail: '可直接归入资料库' },
  { label: '更新已有人员', value: '4', detail: '补充学历或证书资料' },
  { label: '重复文件', value: '3', detail: '按 hash 自动跳过' },
  { label: '待确认资料', value: '6', detail: '地区、证书或人员不确定' },
]

export const exportItems: ExportItem[] = [
  { id: 'excel', label: '人员清单 Excel', checked: true },
  { id: 'folder', label: '人员资料文件夹', checked: true },
  { id: 'multi', label: '包含多人员共用资料', checked: false },
]

export const recentActivities = [
  '昨天整理了“成都工程新增资料”，产生 4 条待确认。',
  '最近导出“成都二建人员”清单，共 3 人。',
]
