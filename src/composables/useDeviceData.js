import { reactive } from 'vue'

// 设备基础配置：内置各设备大致水平基线，保证设备间的差异长期保持
const deviceList = [
  { id: 'device1', name: '设备1', baseTemperature: 25, baseHumidity: 60 },
  { id: 'device2', name: '设备2', baseTemperature: 27, baseHumidity: 65 },
  { id: 'device3', name: '设备3', baseTemperature: 23, baseHumidity: 55 }
]

// 采集参数
const COLLECT_INTERVAL = 2000 // 固定采集周期（毫秒）
const MAX_HISTORY = 30 // 每台设备保留的历史点数
const OFFLINE_DURATION = 60000 // 设备重启后离线时长（约一分钟）

// 各指标的物理量程，防止随机游走越界
const TEMPERATURE_RANGE = { min: 5, max: 45 }
const HUMIDITY_RANGE = { min: 10, max: 100 }

// ==== 单一可信数据源（模块级单例） ====
const histories = reactive({}) // deviceId -> [{ time, temperature, humidity }]
const latestReadings = reactive({}) // deviceId -> { time, temperature, humidity }
const deviceStatus = reactive({}) // deviceId -> { online, offlineUntil }
const lastValidReadings = {} // deviceId -> 最近一条真实读数，供离线恢复后续接

// 带均值回归的随机游走：围绕基线波动，既连续又保住设备原有水平差异
const nextValue = (prev, base, step, range) => {
  const drift = (base - prev) * 0.08 // 向基线轻微回归
  let value = prev + drift + (Math.random() - 0.5) * step
  value = Math.min(range.max, Math.max(range.min, value))
  return parseFloat(value.toFixed(1))
}

// 生成一台设备的一条新读数
const nextReading = (device, prev) => ({
  time: Date.now(),
  temperature: nextValue(prev.temperature, device.baseTemperature, 1.6, TEMPERATURE_RANGE),
  humidity: nextValue(prev.humidity, device.baseHumidity, 3, HUMIDITY_RANGE)
})

// 为设备铺满一段连续的初始历史，避免首屏空白
const seedDevice = (device) => {
  const points = []
  let prev = { temperature: device.baseTemperature, humidity: device.baseHumidity }
  const now = Date.now()
  for (let i = MAX_HISTORY - 1; i >= 0; i--) {
    prev = {
      time: now - i * COLLECT_INTERVAL,
      temperature: nextValue(prev.temperature, device.baseTemperature, 1.6, TEMPERATURE_RANGE),
      humidity: nextValue(prev.humidity, device.baseHumidity, 3, HUMIDITY_RANGE)
    }
    points.push(prev)
  }
  histories[device.id] = points
  latestReadings[device.id] = points[points.length - 1]
  lastValidReadings[device.id] = points[points.length - 1]
  deviceStatus[device.id] = { online: true, offlineUntil: 0 }
}

// 每个采集周期为所有设备追加一条读数；离线设备推入空点（曲线留空）
const collectOnce = () => {
  const now = Date.now()
  deviceList.forEach((device) => {
    const history = histories[device.id]
    const status = deviceStatus[device.id]

    if (!status.online) {
      // 离线到期则自动恢复上线
      if (now >= status.offlineUntil) {
        status.online = true
        status.offlineUntil = 0
      }
    }

    if (status.online) {
      // 在线：基于最近一条真实读数续接，保证恢复后历史不断
      const reading = nextReading(device, lastValidReadings[device.id])
      history.push(reading)
      latestReadings[device.id] = reading
      lastValidReadings[device.id] = reading
    } else {
      // 离线：推入空点，曲线在该时段留空，不参与告警判定
      history.push({ time: now, temperature: null, humidity: null, offline: true })
      latestReadings[device.id] = { time: now, temperature: null, humidity: null, offline: true }
    }

    if (history.length > MAX_HISTORY) history.shift()
  })
}

// 设备重启：暂停采集并标记离线约一分钟，期间曲线留空、不参与判定
const restart = (deviceId) => {
  const status = deviceStatus[deviceId]
  if (!status) return
  status.online = false
  status.offlineUntil = Date.now() + OFFLINE_DURATION
}

let timer = null
let started = false

// 启动采集引擎（幂等，保证全局只有一份采集循环）
const start = () => {
  if (started) return
  deviceList.forEach(seedDevice)
  started = true
  timer = setInterval(collectOnce, COLLECT_INTERVAL)
}

// 停止采集
const stop = () => {
  if (timer) clearInterval(timer)
  timer = null
  started = false
}

export function useDeviceData() {
  return {
    deviceList,
    histories,
    latestReadings,
    deviceStatus,
    COLLECT_INTERVAL,
    OFFLINE_DURATION,
    start,
    stop,
    restart
  }
}
