import { state, DEVICES, getDeviceMeta, STORAGE_KEYS, SEVERE_MARGIN, ALARM_DEBOUNCE_POINTS, round1 } from './state'

const MAX_ALARM_RECORDS = 500
let idSeq = 0

const genAlarmId = () => {
  idSeq += 1
  return `alm-${Date.now()}-${idSeq}`
}

// 指标元信息：标签、单位、颜色
export const METRIC_META = {
  temperature: { label: '温度', unit: '°C', color: '#409EFF' },
  humidity: { label: '湿度', unit: '%', color: '#67C23A' }
}

export const ALARM_LEVEL = {
  warning: { label: '警告', type: 'warning', color: '#E6A23C' },
  critical: { label: '严重', type: 'danger', color: '#F56C6C' }
}

export const ALARM_STATUS = {
  active: { label: '告警中', type: 'danger' },
  recovered: { label: '已恢复', type: 'success' },
  acknowledged: { label: '已确认', type: 'info' }
}

const loadStoredAlarms = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.alarms)
    if (!raw) return []
    const list = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    // 恢复后仍然处于 active 的记录放回 activeAlarms，保证不重复刷屏
    list.forEach((a) => {
      if (a.status === 'active') {
        state.activeAlarms[`${a.deviceId}:${a.metric}`] = a
      }
    })
    return list
  } catch (e) {
    return []
  }
}

export const loadAlarms = () => {
  state.alarms = loadStoredAlarms()
}

const persistAlarms = () => {
  try {
    localStorage.setItem(STORAGE_KEYS.alarms, JSON.stringify(state.alarms))
  } catch (e) {
    // 忽略持久化失败
  }
}

// 判定单个指标读数相对阈值的状态：0 正常 / 'high' 超限 / 'low' 低限
export const classifyReading = (metric, value, threshold) => {
  if (!threshold) return { state: 0 }
  if (value > threshold.max) {
    const margin = value - threshold.max
    return {
      state: 'high',
      level: margin >= SEVERE_MARGIN ? 'critical' : 'warning'
    }
  }
  if (value < threshold.min) {
    const margin = threshold.min - value
    return {
      state: 'low',
      level: margin >= SEVERE_MARGIN ? 'critical' : 'warning'
    }
  }
  return { state: 0 }
}

const buildAlarm = (deviceId, metric, reading, classification, timestamp) => {
  const device = getDeviceMeta(deviceId)
  const direction = classification.state
  const threshold = state.thresholds[deviceId]?.[metric]
  const limitValue = direction === 'high' ? threshold.max : threshold.min
  return {
    id: genAlarmId(),
    deviceId,
    deviceName: device.name,
    location: device.location,
    metric,
    metricLabel: METRIC_META[metric].label,
    unit: METRIC_META[metric].unit,
    direction,
    typeLabel:
      direction === 'high'
        ? `${METRIC_META[metric].label}高于上限`
        : `${METRIC_META[metric].label}低于下限`,
    value: round1(reading),
    threshold: limitValue,
    level: classification.level,
    startTime: timestamp,
    endTime: null,
    status: 'active',
    acknowledgedAt: null,
    acknowledgedBy: null
  }
}

const getActiveKey = (deviceId, metric) => `${deviceId}:${metric}`

// 去抖计数器：{ [deviceId:metric]: { violate: number, recover: number } }
// violate：连续越限点数；recover：连续回落点数
const debounceStreaks = {}

const getStreak = (deviceId, metric) => {
  const key = getActiveKey(deviceId, metric)
  if (!debounceStreaks[key]) {
    debounceStreaks[key] = { violate: 0, recover: 0 }
  }
  return debounceStreaks[key]
}

// 某指标当前是否处于"已确认告警中"（含已确认但仍在越限的情况）
export const isMetricAlarming = (deviceId, metric) =>
  !!state.activeAlarms[getActiveKey(deviceId, metric)]

// 重置某设备所有指标的去抖计数（重启/离线恢复后调用，避免误判）
export const resetDeviceDebounce = (deviceId) => {
  ;['temperature', 'humidity'].forEach((m) => {
    delete debounceStreaks[getActiveKey(deviceId, m)]
  })
}

// 核心判定：对一条新读数做越限判定，带连续点去抖
// 规则：
//  - 连续 ALARM_DEBOUNCE_POINTS 个点越限才正式触发告警
//  - 已告警后连续 ALARM_DEBOUNCE_POINTS 个点回落才正式恢复
//  - 单个抖动点不打扰，阈值边上的来回抖动不会反复触发
// 返回 { events, alarming }：events 为触发/恢复事件，alarming 表示该点是否处于确认告警中
export const evaluateReading = (deviceId, metric, value, timestamp) => {
  const threshold = state.thresholds[deviceId]?.[metric]
  if (!threshold) return { events: [], alarming: false }

  const classification = classifyReading(metric, value, threshold)
  const key = getActiveKey(deviceId, metric)
  const active = state.activeAlarms[key]
  const streak = getStreak(deviceId, metric)
  const events = []

  if (classification.state !== 0) {
    // 当前点越限：恢复计数清零，越限计数累加
    streak.recover = 0
    streak.violate += 1

    if (active) {
      // 已在告警中：更新末值/峰值，级别可升级，不重复新增
      active.value = round1(value)
      active.lastValue = round1(value)
      active.lastTime = timestamp
      if (classification.level === 'critical' && active.level === 'warning') {
        active.level = 'critical'
      }
    } else if (streak.violate >= ALARM_DEBOUNCE_POINTS) {
      // 连续越限达到阈值：正式触发告警，以"首次越限时间"作为开始时间
      const firstTime = timestamp - (ALARM_DEBOUNCE_POINTS - 1) * 2000
      const alarm = buildAlarm(deviceId, metric, value, classification, firstTime)
      state.alarms.unshift(alarm)
      if (state.alarms.length > MAX_ALARM_RECORDS) {
        state.alarms.length = MAX_ALARM_RECORDS
      }
      state.activeAlarms[key] = alarm
      persistAlarms()
      events.push({ type: 'trigger', alarm })
    }
  } else {
    // 当前点正常：越限计数清零，恢复计数累加
    streak.violate = 0
    streak.recover += 1

    if (active && streak.recover >= ALARM_DEBOUNCE_POINTS) {
      // 已告警且连续回落达到阈值：正式恢复
      active.status = 'recovered'
      active.endTime = timestamp
      active.recoverValue = round1(value)
      delete state.activeAlarms[key]
      streak.recover = 0
      persistAlarms()
      events.push({ type: 'recover', alarm: active })
    }
  }

  return { events, alarming: !!state.activeAlarms[key] }
}

export const acknowledgeAlarm = (alarmId) => {
  const alarm = state.alarms.find((a) => a.id === alarmId)
  if (!alarm) return
  if (alarm.status === 'recovered') {
    alarm.status = 'acknowledged'
  } else {
    // 仍在告警中：标记已确认但保留 active 状态，避免再次弹窗；通过 acknowledged 标识
    alarm.acknowledgedAt = Date.now()
    alarm.acknowledged = true
  }
  alarm.acknowledgedAt = alarm.acknowledgedAt || Date.now()
  persistAlarms()
}

export const acknowledgeAll = (filterFn) => {
  const now = Date.now()
  state.alarms.forEach((a) => {
    if (filterFn && !filterFn(a)) return
    if (a.status === 'recovered') {
      a.status = 'acknowledged'
      a.acknowledgedAt = now
    } else if (a.status === 'active') {
      a.acknowledged = true
      a.acknowledgedAt = now
    }
  })
  persistAlarms()
}

export const clearAlarmHistory = () => {
  // 仅清除已恢复/已确认的历史，保留正在告警中的记录
  const remaining = state.alarms.filter((a) => a.status === 'active')
  state.alarms = remaining
  persistAlarms()
}

// 查询：按条件过滤（设备、指标、级别、状态、确认状态、关键字）
export const queryAlarms = (filters = {}) => {
  const { deviceId, metric, level, status, acknowledged, keyword } = filters
  return state.alarms.filter((a) => {
    if (deviceId && a.deviceId !== deviceId) return false
    if (metric && a.metric !== metric) return false
    if (level && a.level !== level) return false
    if (status === 'active') {
      if (a.status !== 'active') return false
    } else if (status && a.status !== status) {
      return false
    }
    if (acknowledged === true && isUnacknowledged(a)) return false
    if (acknowledged === false && !isUnacknowledged(a)) return false
    if (keyword) {
      const kw = String(keyword).toLowerCase()
      const hay = `${a.deviceName} ${a.location} ${a.metricLabel} ${a.typeLabel}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
}

// 统计当前活跃告警数量
export const getActiveAlarmCount = () =>
  state.alarms.filter((a) => a.status === 'active').length

// 获取某设备某指标的当前告警（用于 UI 高亮）
export const getActiveAlarm = (deviceId, metric) =>
  state.activeAlarms[getActiveKey(deviceId, metric)] || null

export const getDeviceActiveAlarms = (deviceId) => {
  const result = []
  DEVICES.forEach((d) => {
    if (d.id !== deviceId) return
    ;['temperature', 'humidity'].forEach((m) => {
      const a = state.activeAlarms[getActiveKey(deviceId, m)]
      if (a) result.push(a)
    })
  })
  return result
}

// 一条告警是否「尚未确认」：
// - active 且未点过确认
// - recovered 但尚未转为 acknowledged
export const isUnacknowledged = (alarm) => {
  if (!alarm) return false
  if (alarm.status === 'acknowledged') return false
  if (alarm.status === 'recovered') return true
  if (alarm.status === 'active') return !alarm.acknowledged
  return true
}

// 紧急度评分：严重 > 警告；同级别按越限幅度排序
const urgencyScore = (alarm) => {
  if (!alarm) return -1
  const levelScore = alarm.level === 'critical' ? 1000 : 500
  const margin = Math.abs(alarm.value - alarm.threshold)
  return levelScore + margin
}

// 从一组设备中选出当前告警最紧急的设备 ID
// 评分依据：该设备所有活跃告警中的最高紧急度；无告警返回 null
export const getMostUrgentDevice = (deviceIds) => {
  let bestId = null
  let bestScore = -1
  deviceIds.forEach((id) => {
    const alarms = getDeviceActiveAlarms(id)
    const score = alarms.reduce((max, a) => Math.max(max, urgencyScore(a)), -1)
    if (score > bestScore) {
      bestScore = score
      bestId = id
    }
  })
  return bestId
}

// 各设备未确认告警数统计：[{ deviceId, deviceName, location, count }]
export const getUnacknowledgedByDevice = () => {
  const counts = {}
  state.alarms.forEach((a) => {
    if (!isUnacknowledged(a)) return
    counts[a.deviceId] = (counts[a.deviceId] || 0) + 1
  })
  return DEVICES.map((d) => ({
    deviceId: d.id,
    deviceName: d.name,
    location: d.location,
    count: counts[d.id] || 0
  }))
}

// 未确认告警总数
export const getUnacknowledgedCount = () =>
  state.alarms.filter((a) => isUnacknowledged(a)).length
