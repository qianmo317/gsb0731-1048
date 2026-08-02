import { reactive } from 'vue'

// 三台设备的固定基线，保住原有水平差异：设备2偏高，设备3偏低，设备1居中
// color：多设备同图对比时每台设备的温（蓝系）/湿（绿系）曲线配色
export const DEVICES = [
  { id: 'device1', name: '设备1', tempBaseline: 25, humBaseline: 60, tempColor: '#409EFF', humColor: '#67C23A' },
  { id: 'device2', name: '设备2', tempBaseline: 27, humBaseline: 65, tempColor: '#79BBFF', humColor: '#95D475' },
  { id: 'device3', name: '设备3', tempBaseline: 23, humBaseline: 55, tempColor: '#1D6FCC', humColor: '#3E8C2A' }
]

// 采集周期（毫秒）与历史窗口容量
export const COLLECT_INTERVAL = 2000
export const MAX_HISTORY = 60
export const SEED_COUNT = 30
// 去抖：连续越限/正常采集点数达到该值才正式告警/恢复，避免阈值边缘抖动反复刷屏
export const DEBOUNCE_COUNT = 3
// 设备重启离线时长（毫秒）：约一分钟
export const RESTART_OFFLINE_MS = 60000

// 默认阈值：下限严重 < 下限告警 < 上限告警 < 上限严重
export const DEFAULT_THRESHOLDS = {
  temperature: { lowCritical: 20, lowWarning: 22, highWarning: 28, highCritical: 30 },
  humidity: { lowCritical: 45, lowWarning: 50, highWarning: 70, highCritical: 75 }
}

export const THRESHOLD_FIELDS = [
  { key: 'lowCritical', label: '下限严重' },
  { key: 'lowWarning', label: '下限告警' },
  { key: 'highWarning', label: '上限告警' },
  { key: 'highCritical', label: '上限严重' }
]

export const METRIC_META = {
  temperature: { name: '温度', unit: '°C', color: '#409EFF' },
  humidity: { name: '湿度', unit: '%', color: '#67C23A' }
}

// 单一可信数据源：采集、阈值、越限判定、告警记录全部收口于此
export const store = reactive({
  // 支持多选：选中一台时为单设备视图，选中多台时为同图对比
  selectedDeviceIds: [DEVICES[0].id],
  devices: DEVICES,
  // readings[deviceId] = [{ timestamp, time, temperature, humidity }]
  readings: {},
  // thresholds[deviceId] = { temperature: {...}, humidity: {...} }
  // 模块加载即初始化默认值，保证组件首帧渲染时阈值已存在（loadThresholds 再用持久化值覆盖）
  thresholds: DEVICES.reduce((acc, d) => {
    acc[d.id] = {
      temperature: { ...DEFAULT_THRESHOLDS.temperature },
      humidity: { ...DEFAULT_THRESHOLDS.humidity }
    }
    return acc
  }, {}),
  // 告警记录（含活动与已恢复）
  alerts: [],
  // 当前活动状态：activeStates[deviceId+metric] = { phase, violationStreak, recoveryStreak, level, direction, alertId }
  activeStates: {},
  // 设备在线状态：deviceStatus[deviceId] = { online, offlineUntil, restartAt }
  deviceStatus: DEVICES.reduce((acc, d) => {
    acc[d.id] = { online: true, offlineUntil: null, restartAt: null }
    return acc
  }, {}),
  collecting: false,
  // 最近一次采集时间戳
  lastCollectAt: null
})

export function getDevice(deviceId) {
  return DEVICES.find(d => d.id === deviceId)
}

export function getDeviceReadings(deviceId) {
  return store.readings[deviceId] || []
}

export function getDeviceThresholds(deviceId) {
  return store.thresholds[deviceId]
}

export function getLatestReading(deviceId) {
  const list = store.readings[deviceId]
  return list && list.length ? list[list.length - 1] : null
}

// 多设备对比时取某台设备某指标的曲线颜色（温度蓝系/湿度绿系，按设备深浅区分）
export function getDeviceColor(deviceId, metric) {
  const device = getDevice(deviceId)
  if (!device) return METRIC_META[metric].color
  return metric === 'temperature' ? device.tempColor : device.humColor
}

// 设备是否在线（重启离线期间返回 false）
export function isDeviceOnline(deviceId) {
  const status = store.deviceStatus[deviceId]
  if (!status) return true
  if (status.online) return true
  if (status.offlineUntil && Date.now() >= status.offlineUntil) return true
  return false
}

// 设备重启剩余离线秒数（供 UI 倒计时显示）
export function getOfflineRemainingSec(deviceId) {
  const status = store.deviceStatus[deviceId]
  if (!status || status.online || !status.offlineUntil) return 0
  return Math.max(0, Math.ceil((status.offlineUntil - Date.now()) / 1000))
}
