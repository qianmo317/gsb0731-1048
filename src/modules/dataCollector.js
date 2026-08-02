import {
  store,
  DEVICES,
  COLLECT_INTERVAL,
  MAX_HISTORY,
  SEED_COUNT,
  RESTART_OFFLINE_MS
} from '../store/monitorStore'
import { evaluateReading, resetDeviceStreaks } from './alertEngine'
import { saveAlerts } from './alertManager'

let timer = null
// 每台设备的离线恢复定时器
const restoreTimers = {}

// 平滑随机游走：均值回归 + 小幅噪声，保证曲线连续且长期围绕基线波动
function nextValue(prev, baseline, volatility) {
  const pull = (baseline - prev) * 0.08
  const noise = (Math.random() - 0.5) * volatility * 2
  // 小概率出现一次稍大的偏移，自然触发越限
  const excursion = Math.random() < 0.04 ? (Math.random() - 0.5) * volatility * 6 : 0
  const value = prev + pull + noise + excursion
  return parseFloat(value.toFixed(1))
}

function formatTime(date) {
  return date.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function buildReading(device, timestamp, prevReading) {
  const prevTemp = prevReading && prevReading.temperature != null ? prevReading.temperature : device.tempBaseline
  const prevHum = prevReading && prevReading.humidity != null ? prevReading.humidity : device.humBaseline
  return {
    timestamp,
    time: formatTime(new Date(timestamp)),
    temperature: nextValue(prevTemp, device.tempBaseline, 0.35),
    humidity: nextValue(prevHum, device.humBaseline, 0.45)
  }
}

// 构造一个离线占位读数（数值为 null），用于在曲线上留出空白段
function buildOfflinePlaceholder(timestamp) {
  return {
    timestamp,
    time: formatTime(new Date(timestamp)),
    temperature: null,
    humidity: null,
    offline: true
  }
}

// 为单台设备生成一段连续的历史回填数据（启动时即有曲线可见）
function seedDevice(device) {
  const list = []
  const now = Date.now()
  let prev = null
  for (let i = SEED_COUNT - 1; i >= 0; i--) {
    const timestamp = now - i * COLLECT_INTERVAL
    const reading = buildReading(device, timestamp, prev)
    list.push(reading)
    prev = reading
  }
  store.readings[device.id] = list

  // 回填数据同样要走判定流程，保证启动即有正确的告警状态
  list.forEach(reading => evaluateReading(device.id, reading))
}

function pushReading(deviceId, reading) {
  let list = store.readings[deviceId]
  if (!list) {
    list = []
    store.readings[deviceId] = list
  }
  list.push(reading)
  if (list.length > MAX_HISTORY) {
    list.shift()
  }
}

// 采集一次：在线设备产生新读数并判定；离线设备追加空占位以在曲线上留出空白段
function collectOnce() {
  const timestamp = Date.now()
  DEVICES.forEach(device => {
    const status = store.deviceStatus[device.id]
    const isOffline = status && !status.online && status.offlineUntil > timestamp

    if (isOffline) {
      // 离线期间：追加占位空点，不参与判定，曲线在此处断开留白
      pushReading(device.id, buildOfflinePlaceholder(timestamp))
      return
    }

    // 若离线状态刚到期（定时器未触发或被遗漏），在这里兜底恢复
    if (status && !status.online && status.offlineUntil <= timestamp) {
      restoreDevice(device.id)
    }

    const list = store.readings[device.id] || []
    // 找到上一个有效（非占位）读数作为随机游走起点
    let prev = null
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i] && list[i].temperature != null) { prev = list[i]; break }
    }
    const reading = buildReading(device, timestamp, prev)
    pushReading(device.id, reading)
    evaluateReading(device.id, reading)
  })
  store.lastCollectAt = timestamp
  saveAlerts()
}

// 恢复某台设备在线：清掉半程去抖计数，从基线平滑续上
function restoreDevice(deviceId) {
  if (restoreTimers[deviceId]) {
    clearTimeout(restoreTimers[deviceId])
    delete restoreTimers[deviceId]
  }
  const status = store.deviceStatus[deviceId]
  status.online = true
  status.offlineUntil = null
  status.restartAt = null
  // 设备刚恢复，清掉离线前残留的 pending/recovering 计数，避免误触发
  resetDeviceStreaks(deviceId)
}

// 重启设备：确认后暂停采集、标记离线约一分钟，到期自动恢复
export function restartDevice(deviceId) {
  const status = store.deviceStatus[deviceId]
  if (!status) return
  const now = Date.now()
  status.online = false
  status.restartAt = now
  status.offlineUntil = now + RESTART_OFFLINE_MS

  // 清理可能存在的旧恢复定时器
  if (restoreTimers[deviceId]) clearTimeout(restoreTimers[deviceId])
  restoreTimers[deviceId] = setTimeout(() => {
    restoreDevice(deviceId)
    saveAlerts()
  }, RESTART_OFFLINE_MS)
}

// 立即恢复某设备（供测试/取消用，当前界面未暴露，但保留能力）
export function bringDeviceOnline(deviceId) {
  restoreDevice(deviceId)
}

// 启动持续采集
export function startCollector() {
  if (timer) return
  // 首次启动时回填历史
  DEVICES.forEach(device => {
    if (!store.readings[device.id] || store.readings[device.id].length === 0) {
      seedDevice(device)
    }
  })
  store.collecting = true
  timer = setInterval(collectOnce, COLLECT_INTERVAL)
}

export function stopCollector() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  Object.keys(restoreTimers).forEach(id => {
    clearTimeout(restoreTimers[id])
    delete restoreTimers[id]
  })
  store.collecting = false
}

export function isCollecting() {
  return timer !== null
}
