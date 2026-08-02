import { store, DEVICES, DEFAULT_THRESHOLDS, getDeviceThresholds, getLatestReading } from '../store/monitorStore'
import { evaluateReading } from './alertEngine'

const STORAGE_KEY = 'iot-monitor-thresholds'

// 从 localStorage 加载阈值，缺失项用默认值补齐
export function loadThresholds() {
  let saved = {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) saved = JSON.parse(raw) || {}
  } catch (e) {
    saved = {}
  }

  DEVICES.forEach(device => {
    const savedDevice = saved[device.id] || {}
    store.thresholds[device.id] = {
      temperature: { ...DEFAULT_THRESHOLDS.temperature, ...(savedDevice.temperature || {}) },
      humidity: { ...DEFAULT_THRESHOLDS.humidity, ...(savedDevice.humidity || {}) }
    }
  })
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store.thresholds))
  } catch (e) {
    // 持久化失败不影响运行
  }
}

// 校验阈值合法性：下限严重 < 下限告警 < 上限告警 < 上限严重
export function validateThreshold(field, value, allValues) {
  const num = Number(value)
  if (Number.isNaN(num)) return false
  const { lowCritical, lowWarning, highWarning, highCritical } = { ...allValues, [field]: num }
  if (!(lowCritical < lowWarning && lowWarning < highWarning && highWarning < highCritical)) {
    return false
  }
  return true
}

// 更新某台设备某个指标的某个阈值，立即持久化并触发重判
export function updateThreshold(deviceId, metric, field, value) {
  const num = Number(value)
  if (Number.isNaN(num)) return false
  const current = getDeviceThresholds(deviceId)
  if (!current) return false

  const candidate = { ...current[metric], [field]: num }
  if (!validateThreshold(field, num, candidate)) return false

  current[metric][field] = num
  persist()

  // 阈值变更后，对该设备最新读数立即重新判定，保证图、状态、记录中心同步
  const latest = getLatestReading(deviceId)
  if (latest) evaluateReading(deviceId, latest)
  return true
}

// 重置某设备某指标为默认阈值
export function resetThreshold(deviceId, metric) {
  if (!store.thresholds[deviceId]) return
  store.thresholds[deviceId][metric] = { ...DEFAULT_THRESHOLDS[metric] }
  persist()
  const latest = getLatestReading(deviceId)
  if (latest) evaluateReading(deviceId, latest)
}

// 重置某设备全部阈值
export function resetAllThresholds(deviceId) {
  if (!store.thresholds[deviceId]) return
  store.thresholds[deviceId] = {
    temperature: { ...DEFAULT_THRESHOLDS.temperature },
    humidity: { ...DEFAULT_THRESHOLDS.humidity }
  }
  persist()
  const latest = getLatestReading(deviceId)
  if (latest) evaluateReading(deviceId, latest)
}
