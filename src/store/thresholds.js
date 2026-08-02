import { state, DEVICES, STORAGE_KEYS } from './state'

// 默认阈值：温度 18~28°C，湿度 40~70%
export const DEFAULT_THRESHOLDS = {
  temperature: { min: 18, max: 28 },
  humidity: { min: 40, max: 70 }
}

const METRIC_BOUNDS = {
  temperature: { min: -50, max: 100 },
  humidity: { min: 0, max: 100 }
}

// 从 localStorage 读取阈值，缺省设备回落到默认值
export const loadThresholds = () => {
  let saved = {}
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.thresholds)
    if (raw) saved = JSON.parse(raw) || {}
  } catch (e) {
    saved = {}
  }

  DEVICES.forEach((device) => {
    const s = saved[device.id] || {}
    state.thresholds[device.id] = {
      temperature: {
        min: normalize(s.temperature?.min, DEFAULT_THRESHOLDS.temperature.min, 'temperature'),
        max: normalize(s.temperature?.max, DEFAULT_THRESHOLDS.temperature.max, 'temperature')
      },
      humidity: {
        min: normalize(s.humidity?.min, DEFAULT_THRESHOLDS.humidity.min, 'humidity'),
        max: normalize(s.humidity?.max, DEFAULT_THRESHOLDS.humidity.max, 'humidity')
      }
    }
  })
}

const normalize = (value, fallback, metric) => {
  const bounds = METRIC_BOUNDS[metric]
  const num = Number(value)
  if (Number.isNaN(num)) return fallback
  return Math.min(bounds.max, Math.max(bounds.min, num))
}

export const persistThresholds = () => {
  try {
    localStorage.setItem(STORAGE_KEYS.thresholds, JSON.stringify(state.thresholds))
  } catch (e) {
    // 持久化失败不影响运行
  }
}

// 校验阈值上下限合法性：min < max
export const validateThreshold = (metric, min, max) => {
  const minNum = Number(min)
  const maxNum = Number(max)
  const bounds = METRIC_BOUNDS[metric]
  if (Number.isNaN(minNum) || Number.isNaN(maxNum)) {
    return { valid: false, message: '请输入有效的数值' }
  }
  if (minNum < bounds.min || maxNum > bounds.max) {
    return {
      valid: false,
      message: `有效范围 ${bounds.min} ~ ${bounds.max}`
    }
  }
  if (minNum >= maxNum) {
    return { valid: false, message: '下限必须小于上限' }
  }
  return { valid: true }
}

// 更新某个设备某指标的阈值，返回校验结果
export const setThreshold = (deviceId, metric, field, value) => {
  const current = state.thresholds[deviceId][metric]
  const next = { ...current, [field]: Number(value) }
  const result = validateThreshold(metric, next.min, next.max)
  if (!result.valid) return result

  state.thresholds[deviceId][metric] = next
  persistThresholds()
  return { valid: true }
}

export const resetThreshold = (deviceId, metric) => {
  state.thresholds[deviceId][metric] = { ...DEFAULT_THRESHOLDS[metric] }
  persistThresholds()
}

export const resetAllThresholds = (deviceId) => {
  state.thresholds[deviceId] = JSON.parse(JSON.stringify(DEFAULT_THRESHOLDS))
  persistThresholds()
}

export const getThreshold = (deviceId, metric) => state.thresholds[deviceId]?.[metric]
