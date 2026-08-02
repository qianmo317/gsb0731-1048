import { store, getDevice, getDeviceThresholds, isDeviceOnline, DEBOUNCE_COUNT } from '../store/monitorStore'

// 纯函数：对照阈值判定单个数值的越限状态
// 返回 { state, level, direction }
export function evaluateLevel(value, thresholds) {
  if (value <= thresholds.lowCritical) {
    return { state: 'lowCritical', level: 'critical', direction: 'low' }
  }
  if (value <= thresholds.lowWarning) {
    return { state: 'lowWarning', level: 'warning', direction: 'low' }
  }
  if (value >= thresholds.highCritical) {
    return { state: 'highCritical', level: 'critical', direction: 'high' }
  }
  if (value >= thresholds.highWarning) {
    return { state: 'highWarning', level: 'warning', direction: 'high' }
  }
  return { state: 'normal', level: null, direction: null }
}

// 判定某条历史数据点是否越限（供趋势图复用，保证图与判定完全一致）
// 注意：这是单点判定（红点标记），正式告警需连续 DEBOUNCE_COUNT 点
export function isValueViolating(value, thresholds) {
  return evaluateLevel(value, thresholds).state !== 'normal'
}

function stateKey(deviceId, metric) {
  return `${deviceId}::${metric}`
}

function nowTime() {
  return new Date().toLocaleString('zh-CN', { hour12: false })
}

function buildAlert(deviceId, metric, reading, result) {
  const device = getDevice(deviceId)
  const thresholds = getDeviceThresholds(deviceId)[metric]
  const thresholdValue =
    result.direction === 'high'
      ? result.level === 'critical' ? thresholds.highCritical : thresholds.highWarning
      : result.level === 'critical' ? thresholds.lowCritical : thresholds.lowWarning

  return {
    id: `${deviceId}-${metric}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    deviceId,
    deviceName: device ? device.name : deviceId,
    metric,
    level: result.level,
    direction: result.direction,
    value: reading[metric],
    threshold: thresholdValue,
    startTime: nowTime(),
    startTimestamp: reading.timestamp,
    endTime: null,
    endTimestamp: null,
    recovered: false,
    acknowledged: false,
    acknowledgedBy: null,
    acknowledgedAt: null
  }
}

// 关闭一条活动告警（连续正常点达到去抖阈值后调用）
function closeAlert(alert, reading) {
  alert.endTime = nowTime()
  alert.endTimestamp = reading.timestamp
  alert.recovered = true
  alert.value = reading[alert.metric]
}

// 设备重启恢复后调用：清掉待确认/待恢复的半程计数，避免一分钟前的旧计数误触发
export function resetDeviceStreaks(deviceId) {
  Object.keys(store.activeStates).forEach(key => {
    if (!key.startsWith(`${deviceId}::`)) return
    const st = store.activeStates[key]
    if (st.phase === 'pending') {
      st.phase = 'idle'
      st.violationStreak = 0
      st.level = null
      st.direction = null
    } else if (st.phase === 'recovering') {
      // 仍在活动告警中，恢复计数清零，等新数据重新累计
      st.recoveryStreak = 0
    }
  })
}

// 对单台设备的一条新读数执行温/湿度双指标判定
// 去抖状态机：
//   idle --越限--> pending（连续越限计数）--达 DEBOUNCE_COUNT--> active（正式告警）
//   active --正常--> recovering（连续正常计数）--达 DEBOUNCE_COUNT--> idle（正式恢复）
//   pending 期间出现正常点直接回 idle（瞬时抖动不告警）
//   recovering 期间出现越限点回 active（阈值边缘抖动不反复翻恢复）
export function evaluateReading(deviceId, reading) {
  const thresholdsAll = getDeviceThresholds(deviceId)
  if (!thresholdsAll) return

  ;['temperature', 'humidity'].forEach(metric => {
    const value = reading[metric]
    const result = evaluateLevel(value, thresholdsAll[metric])
    const key = stateKey(deviceId, metric)
    const prev = store.activeStates[key] || {
      phase: 'idle', violationStreak: 0, recoveryStreak: 0,
      level: null, direction: null, alertId: null
    }

    if (result.state === 'normal') {
      if (prev.phase === 'active') {
        // 活动告警下出现第一个正常点：进入恢复观察期
        store.activeStates[key] = {
          ...prev, phase: 'recovering', recoveryStreak: 1
        }
      } else if (prev.phase === 'recovering') {
        const next = prev.recoveryStreak + 1
        if (next >= DEBOUNCE_COUNT) {
          // 连续 DEBOUNCE_COUNT 个正常点：正式恢复
          const alert = store.alerts.find(a => a.id === prev.alertId)
          if (alert && !alert.recovered) closeAlert(alert, reading)
          store.activeStates[key] = {
            phase: 'idle', violationStreak: 0, recoveryStreak: 0,
            level: null, direction: null, alertId: null
          }
        } else {
          store.activeStates[key] = { ...prev, recoveryStreak: next }
        }
      } else {
        // idle / pending：pending 中混入正常点视为抖动，直接回到 idle
        store.activeStates[key] = {
          phase: 'idle', violationStreak: 0, recoveryStreak: 0,
          level: null, direction: null, alertId: null
        }
      }
      return
    }

    // 越限点
    if (prev.phase === 'recovering') {
      // 恢复观察期内再次越限：取消恢复，回到活动状态，保留原告警（不重复刷记录）
      const alert = store.alerts.find(a => a.id === prev.alertId)
      if (alert) alert.value = value
      store.activeStates[key] = {
        ...prev, phase: 'active', recoveryStreak: 0,
        level: result.level, direction: result.direction
      }
      return
    }

    if (prev.phase === 'active') {
      // 持续越限：更新数值；若级别升级则同步到告警记录（同一场异常不新建）
      const alert = store.alerts.find(a => a.id === prev.alertId)
      if (alert) {
        alert.value = value
        if (result.level === 'critical' && alert.level === 'warning') {
          alert.level = 'critical'
          alert.threshold = result.direction === 'high'
            ? thresholdsAll[metric].highCritical
            : thresholdsAll[metric].lowCritical
        }
      }
      store.activeStates[key] = {
        ...prev, level: result.level, direction: result.direction
      }
      return
    }

    // idle 或 pending：累计连续越限点
    const nextStreak = (prev.phase === 'pending' ? prev.violationStreak : 0) + 1
    if (nextStreak >= DEBOUNCE_COUNT) {
      // 连续越限达到阈值：正式产生告警
      const alert = buildAlert(deviceId, metric, reading, result)
      store.alerts.unshift(alert)
      store.activeStates[key] = {
        phase: 'active', violationStreak: 0, recoveryStreak: 0,
        level: result.level, direction: result.direction, alertId: alert.id
      }
    } else {
      store.activeStates[key] = {
        phase: 'pending', violationStreak: nextStreak, recoveryStreak: 0,
        level: result.level, direction: result.direction, alertId: null
      }
    }
  })
}

// 获取某设备当前正式活动告警（phase=active，不含 pending/recovering）
export function getActiveAlerts(deviceId) {
  return Object.entries(store.activeStates)
    .filter(([key, val]) => key.startsWith(`${deviceId}::`) && val.phase === 'active' && val.alertId)
    .map(([, val]) => {
      const alert = store.alerts.find(a => a.id === val.alertId)
      return alert || null
    })
    .filter(Boolean)
}

// 取某设备当前活动告警的最高严重级别：critical > warning > null
export function getDeviceMaxSeverity(deviceId) {
  const active = getActiveAlerts(deviceId)
  if (active.some(a => a.level === 'critical')) return 'critical'
  if (active.some(a => a.level === 'warning')) return 'warning'
  return null
}

// 在一批设备中选出当前告警最紧急的一台：critical > warning > 无；
// 同级别按传入顺序取第一台；优先在线设备，全部离线时回退第一台（保证总有焦点设备）
export function getMostUrgentDeviceId(deviceIds) {
  if (!deviceIds || !deviceIds.length) return null
  const onlineIds = deviceIds.filter(id => isDeviceOnline(id))
  const pool = onlineIds.length ? onlineIds : deviceIds
  let firstWarning = null
  for (const id of pool) {
    const severity = getDeviceMaxSeverity(id)
    if (severity === 'critical') return id
    if (severity === 'warning' && !firstWarning) firstWarning = id
  }
  return firstWarning || pool[0]
}

// 统计某设备的未确认告警数（供顶部汇总行使用）
export function getUnacknowledgedCount(deviceId) {
  return store.alerts.filter(a => a.deviceId === deviceId && !a.acknowledged).length
}
