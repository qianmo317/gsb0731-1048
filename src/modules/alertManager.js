import { store } from '../store/monitorStore'

const STORAGE_KEY = 'iot-monitor-alerts'
const MAX_ALERTS = 500

// 从 localStorage 加载历史告警记录
export function loadAlerts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        store.alerts.splice(0, store.alerts.length, ...parsed)
      }
    }
  } catch (e) {
    // 加载失败则以空记录启动
  }

  // 重建活动状态索引（恢复后未关闭的告警视为 active）
  store.alerts.forEach(alert => {
    if (!alert.recovered) {
      const key = `${alert.deviceId}::${alert.metric}`
      store.activeStates[key] = {
        phase: 'active',
        violationStreak: 0,
        recoveryStreak: 0,
        level: alert.level,
        direction: alert.direction,
        alertId: alert.id
      }
    }
  })
}

function persist() {
  try {
    // 仅持久化前 MAX_ALERTS 条，防止 localStorage 溢出
    const toSave = store.alerts.slice(0, MAX_ALERTS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
  } catch (e) {
    // 持久化失败不影响运行
  }
}

// 告警记录写入后调用（由采集流程在产生新告警/关闭告警时触发）
export function saveAlerts() {
  // 裁剪超长历史
  if (store.alerts.length > MAX_ALERTS) {
    store.alerts.splice(MAX_ALERTS)
  }
  persist()
}

// 条件查询告警记录
// 支持：deviceId / metric / level / recoveryState(active|recovered) /
//       ackState(unacknowledged|acknowledged) / keyword /
//       startTime,endTime（Date 或毫秒时间戳，按告警开始时间过滤）任意组合
export function queryAlerts(filters = {}) {
  const {
    deviceId,
    metric,
    level,
    recoveryState,
    ackState,
    keyword,
    startTime,
    endTime
  } = filters
  const startMs = startTime ? new Date(startTime).getTime() : null
  const endMs = endTime ? new Date(endTime).getTime() : null
  return store.alerts.filter(alert => {
    if (deviceId && deviceId !== 'all' && alert.deviceId !== deviceId) return false
    if (metric && metric !== 'all' && alert.metric !== metric) return false
    if (level && level !== 'all' && alert.level !== level) return false
    if (recoveryState && recoveryState !== 'all') {
      if (recoveryState === 'active' && alert.recovered) return false
      if (recoveryState === 'recovered' && !alert.recovered) return false
    }
    if (ackState && ackState !== 'all') {
      if (ackState === 'unacknowledged' && alert.acknowledged) return false
      if (ackState === 'acknowledged' && !alert.acknowledged) return false
    }
    if (startMs != null && alert.startTimestamp < startMs) return false
    if (endMs != null && alert.startTimestamp > endMs) return false
    if (keyword) {
      const kw = String(keyword).toLowerCase()
      const hay = `${alert.deviceName} ${alert.metric} ${alert.level} ${alert.value}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
}

// 单条确认
export function acknowledgeAlert(alertId, operator = '运维人员') {
  const alert = store.alerts.find(a => a.id === alertId)
  if (!alert || alert.acknowledged) return false
  alert.acknowledged = true
  alert.acknowledgedBy = operator
  alert.acknowledgedAt = new Date().toLocaleString('zh-CN', { hour12: false })
  persist()
  return true
}

// 批量确认
export function acknowledgeAlerts(alertIds, operator = '运维人员') {
  const now = new Date().toLocaleString('zh-CN', { hour12: false })
  let count = 0
  alertIds.forEach(id => {
    const alert = store.alerts.find(a => a.id === id)
    if (alert && !alert.acknowledged) {
      alert.acknowledged = true
      alert.acknowledgedBy = operator
      alert.acknowledgedAt = now
      count++
    }
  })
  if (count > 0) persist()
  return count
}

// 确认全部当前筛选结果
export function acknowledgeAllFiltered(filters, operator = '运维人员') {
  const list = queryAlerts(filters)
  const ids = list.filter(a => !a.acknowledged).map(a => a.id)
  return acknowledgeAlerts(ids, operator)
}

// 清空已恢复且已确认的历史记录
export function clearHistory() {
  const remaining = store.alerts.filter(a => !(a.recovered && a.acknowledged))
  store.alerts.splice(0, store.alerts.length, ...remaining)
  persist()
}
