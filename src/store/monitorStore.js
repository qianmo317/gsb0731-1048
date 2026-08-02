import { reactive, ref, computed } from 'vue'
import { ElNotification } from 'element-plus'

/**
 * 监控数据中枢：采集、阈值配置、越限判定、告警记录的唯一可信数据源
 * 界面组件只读写这里暴露的状态与方法，不各自维护副本
 */

// ==================== 常量配置 ====================
export const COLLECT_INTERVAL = 3000 // 采集周期(ms)
const MAX_HISTORY_POINTS = 120 // 单设备历史曲线最大点数
const PREFILL_POINTS = 60 // 启动时预填的历史点数，保证页面打开即有连续曲线
const MAX_ALARM_RECORDS = 200 // 告警记录最大条数
const REQUIRED_STREAK = 3 // 连续越限/回落点数：达到才正式告警/恢复，瞬时抖动不打扰值班
const OFFLINE_DURATION = 60000 // 设备重启后的离线时长(ms)
const THRESHOLD_STORAGE_KEY = 'iot-monitor:thresholds'
const ALARM_STORAGE_KEY = 'iot-monitor:alarms'

// 设备清单：各自保留不同的基准水平，保证三台设备读数始终有层次差异；color 用于多选对比模式下的曲线配色
export const deviceList = [
  { id: 'device1', name: '设备1', baseTemperature: 23, baseHumidity: 55, color: '#409EFF' },
  { id: 'device2', name: '设备2', baseTemperature: 26, baseHumidity: 62, color: '#E6A23C' },
  { id: 'device3', name: '设备3', baseTemperature: 20, baseHumidity: 48, color: '#B37FEB' }
]

// 指标元信息：bands 为越限偏离量的级别分界 [一般→警告, 警告→严重]
const metricMeta = {
  temperature: { label: '温度', unit: '°C', bands: [1, 3] },
  humidity: { label: '湿度', unit: '%', bands: [3, 8] }
}
export const metricTypes = Object.keys(metricMeta)

// 默认阈值
const createDefaultThresholds = () => ({
  temperature: { min: 16, max: 28 },
  humidity: { min: 35, max: 75 }
})

// ==================== 共享状态 ====================
// 当前选中设备（支持多选，多选时趋势图进入同图对比模式）
export const selectedDevices = ref([deviceList[0].id])
// 主设备：多选时取第一台，用于状态卡片等单设备展示位
export const primaryDevice = computed(() => selectedDevices.value[0])
export const dataVersion = ref(0) // 每轮采集自增，驱动图表等展示层刷新
export const thresholdVersion = ref(0) // 阈值变更自增，驱动阈值相关展示同步
export const historyMap = reactive({}) // deviceId -> 读数数组（历史连续累积，任何操作都不重建）
export const thresholdMap = reactive({}) // deviceId -> { temperature: {min,max}, humidity: {min,max} }
export const alarmList = ref([]) // 告警记录（新记录在前）
const activeAlarmMap = reactive({}) // 越限去重索引： `${deviceId}:${metric}:${limitType}` -> alarmId
const violationStreakMap = reactive({}) // 未正式告警的连续越限计数：key -> { count, firstViolation, firstTimestamp, bestDeviation, bestViolation }
const recoverStreakMap = reactive({}) // 活动告警的连续回落计数：key -> count
export const offlineUntilMap = reactive({}) // 设备离线截止时刻：deviceId -> timestamp

// 设备采集运行时（内部随机游走状态，不参与响应式）
const deviceRuntime = {}

let collectTimer = null
let alarmSeq = 0

// ==================== 展示辅助 ====================
export const formatTime = (timestamp) =>
  new Date(timestamp).toLocaleTimeString('zh-CN', { hour12: false })

export const formatDateTime = (timestamp) => {
  const date = new Date(timestamp)
  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour12: false })}`
}

export const getDeviceName = (deviceId) =>
  deviceList.find(device => device.id === deviceId)?.name ?? deviceId

export const getLatestReading = (deviceId) => {
  const history = historyMap[deviceId]
  return history && history.length ? history[history.length - 1] : null
}

export const activeAlarmCount = computed(() =>
  alarmList.value.filter(alarm => alarm.status === 'active').length
)

export const unconfirmedCount = computed(() =>
  alarmList.value.filter(alarm => !alarm.confirmed).length
)

// 各设备未确认告警数统计（顶部汇总行使用）
export const unconfirmedByDevice = computed(() => {
  const counts = {}
  deviceList.forEach(device => { counts[device.id] = 0 })
  alarmList.value.forEach(alarm => {
    if (!alarm.confirmed) counts[alarm.deviceId] = (counts[alarm.deviceId] || 0) + 1
  })
  return counts
})

// 告警级别权重
const levelRank = { '严重': 3, '警告': 2, '一般': 1 }

// 参考线设备：选中设备中当前告警最紧急的一台（级别高者优先，同级取最新活动）；无告警时回退主设备
export const referenceDevice = computed(() => {
  let urgent = null
  alarmList.value.forEach(alarm => {
    if (alarm.status !== 'active' || !selectedDevices.value.includes(alarm.deviceId)) return
    if (!urgent ||
        levelRank[alarm.level] > levelRank[urgent.level] ||
        (levelRank[alarm.level] === levelRank[urgent.level] && alarm.lastTime > urgent.lastTime)) {
      urgent = alarm
    }
  })
  return urgent ? urgent.deviceId : primaryDevice.value
})

// ==================== 阈值配置（持久化，刷新不丢） ====================
const isValidThresholds = (thresholds) =>
  thresholds &&
  typeof thresholds.temperature?.min === 'number' &&
  typeof thresholds.temperature?.max === 'number' &&
  typeof thresholds.humidity?.min === 'number' &&
  typeof thresholds.humidity?.max === 'number'

const loadThresholds = () => {
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem(THRESHOLD_STORAGE_KEY))
  } catch {
    saved = null
  }
  deviceList.forEach(device => {
    thresholdMap[device.id] = isValidThresholds(saved?.[device.id])
      ? saved[device.id]
      : createDefaultThresholds()
  })
}

const saveThresholds = () => {
  localStorage.setItem(THRESHOLD_STORAGE_KEY, JSON.stringify(thresholdMap))
}

// 修改指定设备阈值：立即生效，判定、参考线、记录中心随共享状态自动同步
export const updateThresholds = (deviceId, thresholds) => {
  thresholdMap[deviceId] = {
    temperature: { ...thresholds.temperature },
    humidity: { ...thresholds.humidity }
  }
  thresholdVersion.value++
  saveThresholds()
}

// ==================== 越限判定（唯一判定入口，告警引擎与趋势图共用） ====================
export const judgeReading = (deviceId, reading) => {
  const thresholds = thresholdMap[deviceId]
  if (!thresholds) return []

  const violations = []
  metricTypes.forEach(metric => {
    const meta = metricMeta[metric]
    const { min, max } = thresholds[metric]
    const value = reading[metric]
    // 离线占位读数（null）不参与判定
    if (value === null || value === undefined) return

    let limitType = null
    let threshold = null
    if (value > max) {
      limitType = 'high'
      threshold = max
    } else if (value < min) {
      limitType = 'low'
      threshold = min
    }
    if (!limitType) return

    const deviation = parseFloat(Math.abs(value - threshold).toFixed(1))
    violations.push({
      metric,
      metricLabel: meta.label,
      unit: meta.unit,
      limitType,
      limitLabel: limitType === 'high' ? '上限' : '下限',
      threshold,
      value,
      deviation,
      level: deviation >= meta.bands[1] ? '严重' : deviation >= meta.bands[0] ? '警告' : '一般'
    })
  })
  return violations
}

// ==================== 告警记录（持久化） ====================
const saveAlarms = () => {
  localStorage.setItem(ALARM_STORAGE_KEY, JSON.stringify(alarmList.value))
}

const loadAlarms = () => {
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem(ALARM_STORAGE_KEY))
  } catch {
    saved = null
  }
  if (!Array.isArray(saved)) return

  alarmList.value = saved.slice(0, MAX_ALARM_RECORDS)
  alarmSeq = alarmList.value.length
  // 恢复进行中的告警去重索引，刷新页面后同一场异常仍不重复刷屏
  alarmList.value.forEach(alarm => {
    if (alarm.status === 'active') {
      activeAlarmMap[alarm.alarmKey] = alarm.id
    }
  })
}

const notifyAlarm = (alarm) => {
  ElNotification({
    title: `${alarm.deviceName} ${alarm.metricLabel}越限告警`,
    message: `【${alarm.level}】当前 ${alarm.triggerValue}${alarm.unit}，已越${alarm.limitLabel} ${alarm.threshold}${alarm.unit}`,
    type: alarm.level === '严重' ? 'error' : 'warning',
    duration: 5000
  })
}

const notifyRecover = (alarm, recoveredValue) => {
  ElNotification({
    title: `${alarm.deviceName} ${alarm.metricLabel}恢复正常`,
    message: `当前 ${recoveredValue}${alarm.unit}，已回落至${alarm.limitLabel} ${alarm.threshold}${alarm.unit} 以内`,
    type: 'success',
    duration: 4000
  })
}

// 正式告警：触发时间/触发值取连续越限的第一个点，峰值取整段越限中的最大偏离
const createAlarm = (device, streak, lastTimestamp) => ({
  id: `alarm-${lastTimestamp}-${alarmSeq++}`,
  alarmKey: `${device.id}:${streak.firstViolation.metric}:${streak.firstViolation.limitType}`,
  deviceId: device.id,
  deviceName: device.name,
  metric: streak.firstViolation.metric,
  metricLabel: streak.firstViolation.metricLabel,
  limitType: streak.firstViolation.limitType,
  limitLabel: streak.firstViolation.limitLabel,
  threshold: streak.firstViolation.threshold,
  unit: streak.firstViolation.unit,
  level: streak.bestViolation.level,
  triggerTime: streak.firstTimestamp,
  triggerValue: streak.firstViolation.value,
  peakValue: streak.bestViolation.value,
  deviation: streak.bestViolation.deviation,
  lastTime: lastTimestamp,
  status: 'active', // active 告警中 / recovered 已恢复
  recoveredTime: null,
  recoveredValue: null,
  confirmed: false,
  confirmTime: null
})

// 每轮读数对照该设备当前阈值做越限判定
// 连续 3 个采集点越限才正式告警，连续 3 个点回落才正式记恢复：瞬时抖动不产生告警，告警不在阈值边来回翻
const checkAlarms = (device, reading, silent = false) => {
  const violations = judgeReading(device.id, reading)
  const violatedKeys = new Set(violations.map(v => `${device.id}:${v.metric}:${v.limitType}`))

  // 越限方向：活动告警直接更新峰值；未告警的累计连续越限，达到 3 点才正式告警
  violations.forEach(violation => {
    const key = `${device.id}:${violation.metric}:${violation.limitType}`
    recoverStreakMap[key] = 0 // 仍在越限，恢复计数清零

    const activeAlarm = activeAlarmMap[key]
      ? alarmList.value.find(alarm => alarm.id === activeAlarmMap[key])
      : null

    if (activeAlarm) {
      // 同一场异常持续期间只更新峰值，不重复新建告警
      activeAlarm.lastTime = reading.timestamp
      if (violation.deviation > activeAlarm.deviation) {
        activeAlarm.deviation = violation.deviation
        activeAlarm.peakValue = violation.value
        activeAlarm.level = violation.level
      }
      return
    }

    const streak = violationStreakMap[key] || {
      count: 0,
      firstViolation: violation,
      firstTimestamp: reading.timestamp,
      bestDeviation: 0,
      bestViolation: violation
    }
    streak.count++
    if (violation.deviation > streak.bestDeviation) {
      streak.bestDeviation = violation.deviation
      streak.bestViolation = violation
    }
    violationStreakMap[key] = streak

    if (streak.count >= REQUIRED_STREAK) {
      const alarm = createAlarm(device, streak, reading.timestamp)
      alarmList.value.unshift(alarm)
      while (alarmList.value.length > MAX_ALARM_RECORDS) {
        const removed = alarmList.value.pop()
        if (removed.status === 'active') delete activeAlarmMap[removed.alarmKey]
      }
      activeAlarmMap[key] = alarm.id
      delete violationStreakMap[key]
      if (!silent) notifyAlarm(alarm)
    }
  })

  // 连续越限被打断（本轮未越限）的计数清零，不累计成正式告警
  Object.keys(violationStreakMap).forEach(key => {
    if (key.startsWith(`${device.id}:`) && !violatedKeys.has(key)) {
      delete violationStreakMap[key]
    }
  })

  // 恢复方向：活动告警本轮未越限则累计回落，达到 3 点才正式标记恢复
  Object.keys(activeAlarmMap).forEach(key => {
    if (!key.startsWith(`${device.id}:`) || violatedKeys.has(key)) return

    const streak = (recoverStreakMap[key] || 0) + 1
    recoverStreakMap[key] = streak
    if (streak < REQUIRED_STREAK) return

    const alarm = alarmList.value.find(item => item.id === activeAlarmMap[key])
    delete activeAlarmMap[key]
    delete recoverStreakMap[key]
    if (alarm && alarm.status === 'active') {
      const metric = key.split(':')[1]
      alarm.status = 'recovered'
      alarm.recoveredTime = reading.timestamp
      alarm.recoveredValue = reading[metric]
      if (!silent) notifyRecover(alarm, reading[metric])
    }
  })

  if (!silent) saveAlarms()
}

export const confirmAlarm = (alarmId) => {
  const alarm = alarmList.value.find(item => item.id === alarmId)
  if (alarm && !alarm.confirmed) {
    alarm.confirmed = true
    alarm.confirmTime = Date.now()
    saveAlarms()
  }
}

export const confirmAllAlarms = () => {
  const now = Date.now()
  alarmList.value.forEach(alarm => {
    if (!alarm.confirmed) {
      alarm.confirmed = true
      alarm.confirmTime = now
    }
  })
  saveAlarms()
}

// 按时间范围导出告警记录为 CSV（字段与记录中心页面展示一致），startTime/endTime 为时间戳，null 表示不限
export const buildAlarmCsv = (startTime = null, endTime = null) => {
  const rows = alarmList.value.filter(alarm =>
    (startTime === null || alarm.triggerTime >= startTime) &&
    (endTime === null || alarm.triggerTime <= endTime)
  )

  const escape = (cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`
  const header = ['触发时间', '设备', '类型', '越限', '触发值', '峰值', '级别', '状态', '恢复时间', '确认状态', '确认时间']
  const lines = [header.map(escape).join(',')]
  rows.forEach(alarm => {
    lines.push([
      formatDateTime(alarm.triggerTime),
      alarm.deviceName,
      alarm.metricLabel,
      `${alarm.limitLabel} ${alarm.threshold}${alarm.unit}`,
      `${alarm.triggerValue}${alarm.unit}`,
      `${alarm.peakValue}${alarm.unit}`,
      alarm.level,
      alarm.status === 'active' ? '告警中' : '已恢复',
      alarm.recoveredTime ? formatDateTime(alarm.recoveredTime) : '',
      alarm.confirmed ? '已确认' : '未确认',
      alarm.confirmTime ? formatDateTime(alarm.confirmTime) : ''
    ].map(escape).join(','))
  })

  // 带 BOM 头，保证 Excel 打开中文不乱码
  return { csv: '﻿' + lines.join('\r\n'), count: rows.length }
}

// ==================== 数据采集 ====================
const createRuntime = (device) => ({
  temperature: device.baseTemperature,
  humidity: device.baseHumidity,
  temperatureDrift: 0,
  temperatureDriftTicks: 0,
  humidityDrift: 0,
  humidityDriftTicks: 0
})

// 随机游走 + 基准回归，读数围绕设备自身基准平滑变化
const nextValue = (current, base, drift, driftEffect) => {
  const pull = (base - current) * 0.08
  const noise = (Math.random() - 0.5) * 0.6
  return current + pull + noise + drift * driftEffect
}

// 小概率触发持续漂移，读数会自然越限、随后漂移结束又自然回落
const updateDrift = (runtime, metric) => {
  const driftKey = `${metric}Drift`
  const ticksKey = `${metric}DriftTicks`
  if (runtime[ticksKey] > 0) {
    runtime[ticksKey]--
    if (runtime[ticksKey] === 0) runtime[driftKey] = 0
    return
  }
  if (Math.random() < 0.02) {
    const magnitude = metric === 'temperature'
      ? 2 + Math.random() * 2
      : 6 + Math.random() * 4
    runtime[driftKey] = (Math.random() < 0.5 ? -1 : 1) * magnitude
    runtime[ticksKey] = 10 + Math.floor(Math.random() * 15)
  }
}

// ==================== 设备离线（重启） ====================
export const isDeviceOffline = (deviceId) =>
  Boolean(offlineUntilMap[deviceId] && offlineUntilMap[deviceId] > Date.now())

// 设备重启：标记离线约 1 分钟，期间暂停采集、曲线留空、不参与告警判定；恢复后数据自动续上
export const restartDevice = (deviceId) => {
  offlineUntilMap[deviceId] = Date.now() + OFFLINE_DURATION
  // 清空该设备的判定计数，复机后重新累计连续点
  Object.keys(violationStreakMap).forEach(key => {
    if (key.startsWith(`${deviceId}:`)) delete violationStreakMap[key]
  })
  Object.keys(recoverStreakMap).forEach(key => {
    if (key.startsWith(`${deviceId}:`)) delete recoverStreakMap[key]
  })
}

const collectReading = (device, timestamp, silent = false) => {
  const history = historyMap[device.id]

  // 离线期间：暂停采集，推入占位空点让曲线留空、时间轴继续走，不参与告警判定
  if (isDeviceOffline(device.id)) {
    history.push({ timestamp, time: formatTime(timestamp), temperature: null, humidity: null })
    if (history.length > MAX_HISTORY_POINTS) history.shift()
    return
  }

  const runtime = deviceRuntime[device.id]
  updateDrift(runtime, 'temperature')
  updateDrift(runtime, 'humidity')
  runtime.temperature = nextValue(runtime.temperature, device.baseTemperature, runtime.temperatureDrift, 0.15)
  runtime.humidity = nextValue(runtime.humidity, device.baseHumidity, runtime.humidityDrift, 0.2)

  const reading = {
    timestamp,
    time: formatTime(timestamp),
    temperature: parseFloat(runtime.temperature.toFixed(1)),
    humidity: parseFloat(runtime.humidity.toFixed(1))
  }

  history.push(reading)
  if (history.length > MAX_HISTORY_POINTS) history.shift()

  checkAlarms(device, reading, silent)
}

const collectOnce = () => {
  const now = Date.now()
  deviceList.forEach(device => {
    // 离线到期：清除离线标记（响应式触发界面恢复），本轮起正常采集
    if (offlineUntilMap[device.id] && offlineUntilMap[device.id] <= now) {
      delete offlineUntilMap[device.id]
    }
    collectReading(device, now)
  })
  dataVersion.value++
}

export const startCollector = () => {
  if (collectTimer) return
  collectTimer = setInterval(collectOnce, COLLECT_INTERVAL)
}

export const stopCollector = () => {
  if (!collectTimer) return
  clearInterval(collectTimer)
  collectTimer = null
}

// ==================== 初始化 ====================
const initStore = () => {
  loadThresholds()
  loadAlarms()

  const now = Date.now()
  deviceList.forEach(device => {
    deviceRuntime[device.id] = createRuntime(device)
    historyMap[device.id] = []
    // 预填历史数据（静默，不触发告警通知），保证打开页面即有连续曲线
    for (let i = PREFILL_POINTS - 1; i >= 0; i--) {
      collectReading(device, now - i * COLLECT_INTERVAL, true)
    }
  })
  saveAlarms()
}

initStore()
