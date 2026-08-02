import { queryAlerts } from './alertManager'

// CSV 字段转义：含逗号、引号、换行时用双引号包裹，内部双引号翻倍
function csvCell(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const COLUMNS = [
  { key: 'startTime', label: '开始时间' },
  { key: 'deviceName', label: '设备' },
  { key: 'metric', label: '类型', format: v => (v === 'temperature' ? '温度' : '湿度') },
  { key: 'level', label: '级别', format: v => (v === 'critical' ? '严重' : '告警') },
  { key: 'direction', label: '方向', format: v => (v === 'high' ? '超上限' : '低于下限') },
  { key: 'value', label: '当前/触发值' },
  { key: 'threshold', label: '阈值' },
  { key: 'recovered', label: '状态', format: v => (v ? '已恢复' : '活动中') },
  { key: 'endTime', label: '恢复时间', format: v => v || '—' },
  { key: 'acknowledged', label: '确认状态', format: v => (v ? '已确认' : '未确认') }
]

// 按当前筛选条件（含时间范围）导出告警为 CSV 文件
export function exportAlertsCsv(filters = {}) {
  const list = queryAlerts(filters)
  const header = COLUMNS.map(c => csvCell(c.label)).join(',')
  const rows = list.map(alert =>
    COLUMNS.map(c => {
      const raw = alert[c.key]
      const val = c.format ? c.format(raw) : raw
      return csvCell(val)
    }).join(',')
  )
  // BOM 头保证 Excel 打开中文不乱码
  const csv = '\uFEFF' + [header, ...rows].join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  a.href = url
  a.download = `告警记录_${ts}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return list.length
}
