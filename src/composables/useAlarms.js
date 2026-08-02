import { reactive, watch } from 'vue'
import { useDeviceData } from './useDeviceData'
import { useThresholds } from './useThresholds'

// 告警级别
const LEVEL = {
  WARNING: 'warning',
  CRITICAL: 'critical'
}

// 指标元信息，用于组装告警文案
const METRICS = {
  temperature: { label: '温度', unit: '°C' },
  humidity: { label: '湿度', unit: '%' }
}

// ==== 单一可信数据源（模块级单例） ====
const alarmRecords = reactive([]) // 全量告警记录，供记录中心集中展示
const activeAlarms = reactive({}) // key: deviceId-metric -> 当前进行中的告警，用于去重
const streaks = {} // key: deviceId-metric -> 连续越限计数，达到阈值才正式告警
const recoverStreaks = {} // key: deviceId-metric -> 连续回落计数，达到阈值才正式记恢复

// 连续越限达到此点数才正式告警，过滤瞬时抖动
const TRIGGER_STREAK = 3
// 连续回落达到此点数才正式记恢复，单点瞬时回落不打断进行中的告警
const RECOVER_STREAK = 3

let seq = 0
const nextId = () => `alarm-${Date.now()}-${++seq}`

// 越限判定：返回 null 表示正常，否则返回越限描述
const evaluate = (value, limit) => {
  if (value > limit.max) {
    // 超出上限较多判为严重
    const level = value > limit.max + (limit.max - limit.min) * 0.15 ? LEVEL.CRITICAL : LEVEL.WARNING
    return { direction: 'high', bound: limit.max, level }
  }
  if (value < limit.min) {
    const level = value < limit.min - (limit.max - limit.min) * 0.15 ? LEVEL.CRITICAL : LEVEL.WARNING
    return { direction: 'low', bound: limit.min, level }
  }
  return null
}

// 组装告警消息
const buildMessage = (deviceName, metric, value, result) => {
  const m = METRICS[metric]
  const word = result.direction === 'high' ? '高于上限' : '低于下限'
  return `${deviceName} ${m.label}${value}${m.unit} ${word} ${result.bound}${m.unit}`
}

// 对单台设备的单个指标做判定，处理触发 / 去重 / 恢复
// 需连续 TRIGGER_STREAK 个采集点越限才正式告警，过滤瞬时抖动
const checkMetric = (device, metric, value, limit) => {
  const key = `${device.id}-${metric}`
  const result = evaluate(value, limit)
  const existing = activeAlarms[key]

  if (result) {
    // 越限：累计连续越限点数，同时清零回落计数（打断尚未确认的恢复）
    streaks[key] = (streaks[key] || 0) + 1
    recoverStreaks[key] = 0
    if (existing) return // 同一场异常持续期间不重复刷屏
    if (streaks[key] < TRIGGER_STREAK) return // 未达持续时间条件，暂不告警
    const record = {
      id: nextId(),
      deviceId: device.id,
      deviceName: device.name,
      metric,
      metricLabel: METRICS[metric].label,
      type: `${METRICS[metric].label}${result.direction === 'high' ? '过高' : '过低'}`,
      value,
      unit: METRICS[metric].unit,
      level: result.level,
      message: buildMessage(device.name, metric, value, result),
      triggeredAt: Date.now(),
      recoveredAt: null,
      status: 'active', // active -> recovered，acknowledged 表示已人工确认
      acknowledged: false
    }
    activeAlarms[key] = record
    alarmRecords.unshift(record)
  } else {
    // 回落：清零越限计数
    streaks[key] = 0
    if (!existing) {
      recoverStreaks[key] = 0
      return
    }
    // 需连续 RECOVER_STREAK 个正常点才正式记恢复，单点瞬时回落不打断进行中的告警
    recoverStreaks[key] = (recoverStreaks[key] || 0) + 1
    if (recoverStreaks[key] < RECOVER_STREAK) return
    existing.status = 'recovered'
    existing.recoveredAt = Date.now()
    existing.recoveredValue = value
    delete activeAlarms[key]
    recoverStreaks[key] = 0
  }
}

// 每次读数变化后统一对照阈值做判定
const runCheck = () => {
  const { deviceList, latestReadings, deviceStatus } = useDeviceData()
  const { getThreshold } = useThresholds()
  deviceList.forEach((device) => {
    const reading = latestReadings[device.id]
    const limit = getThreshold(device.id)
    if (!reading || !limit) return
    // 离线或空读数不参与判定，且清零连续计数避免恢复后误触发
    const status = deviceStatus[device.id]
    if ((status && !status.online) || reading.offline || reading.temperature == null) {
      streaks[`${device.id}-temperature`] = 0
      streaks[`${device.id}-humidity`] = 0
      recoverStreaks[`${device.id}-temperature`] = 0
      recoverStreaks[`${device.id}-humidity`] = 0
      return
    }
    checkMetric(device, 'temperature', reading.temperature, limit.temperature)
    checkMetric(device, 'humidity', reading.humidity, limit.humidity)
  })
}

// 人工确认某条告警
const acknowledge = (id) => {
  const record = alarmRecords.find((r) => r.id === id)
  if (record) record.acknowledged = true
}

// 设备当前告警严重度权重：严重 > 警告 > 无
const severityWeight = (deviceId) => {
  let weight = 0
  Object.keys(activeAlarms).forEach((key) => {
    if (!key.startsWith(`${deviceId}-`)) return
    weight = Math.max(weight, activeAlarms[key].level === LEVEL.CRITICAL ? 2 : 1)
  })
  return weight
}

// 从候选设备中挑出当前告警最紧急的一台（无进行中告警则返回首个）
const mostUrgentDevice = (deviceIds) => {
  if (!deviceIds || deviceIds.length === 0) return null
  let best = deviceIds[0]
  let bestWeight = severityWeight(best)
  deviceIds.forEach((id) => {
    const w = severityWeight(id)
    if (w > bestWeight) {
      best = id
      bestWeight = w
    }
  })
  return best
}

// 统计某台设备未确认的告警数量（供顶部汇总）
const unacknowledgedCount = (deviceId) =>
  alarmRecords.filter((r) => r.deviceId === deviceId && !r.acknowledged).length

let started = false

// 启动监控（幂等）：监听读数与阈值，任一变化都重新判定
const start = () => {
  if (started) return
  const { latestReadings } = useDeviceData()
  const { thresholds } = useThresholds()
  started = true
  watch([() => ({ ...latestReadings }), thresholds], runCheck, { deep: true, immediate: true })
}

export function useAlarms() {
  return {
    alarmRecords,
    activeAlarms,
    acknowledge,
    mostUrgentDevice,
    unacknowledgedCount,
    start,
    LEVEL
  }
}
