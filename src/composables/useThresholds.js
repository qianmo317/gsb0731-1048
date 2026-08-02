import { reactive, watch } from 'vue'
import { useDeviceData } from './useDeviceData'

const STORAGE_KEY = 'iot-monitor-thresholds'

// 阈值默认值：温度蓝 / 湿度绿，各自上下限
const defaultThreshold = () => ({
  temperature: { min: 18, max: 30 },
  humidity: { min: 40, max: 75 }
})

// ==== 单一可信数据源（模块级单例） ====
const thresholds = reactive({})

// 从本地存储恢复，缺失项用默认值补齐，保证刷新页面不丢
const loadThresholds = () => {
  const { deviceList } = useDeviceData()
  let stored = {}
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}
  } catch (e) {
    stored = {}
  }
  deviceList.forEach((device) => {
    thresholds[device.id] = stored[device.id] || defaultThreshold()
  })
}

// 持久化到本地存储，沿用现有存储方式与命名习惯
const persist = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(thresholds))
}

let initialized = false

// 初始化（幂等）：加载并开启自动持久化
const init = () => {
  if (initialized) return
  loadThresholds()
  initialized = true
  watch(thresholds, persist, { deep: true })
}

// 读取某台设备当前生效的阈值
const getThreshold = (deviceId) => thresholds[deviceId]

// 更新某台设备的阈值（界面直接改写此处，全局各处随之同步）
const setThreshold = (deviceId, next) => {
  thresholds[deviceId] = {
    temperature: { min: next.temperature.min, max: next.temperature.max },
    humidity: { min: next.humidity.min, max: next.humidity.max }
  }
}

export function useThresholds() {
  init()
  return {
    thresholds,
    getThreshold,
    setThreshold
  }
}
