import {
  state,
  DEVICES,
  COLLECT_INTERVAL,
  HISTORY_LIMIT,
  RESTART_OFFLINE_DURATION,
  round1
} from './state'
import { evaluateReading, resetDeviceDebounce } from './alarms'

// 每台设备独立的游走相位，保证三条曲线各有节奏且水平差异稳定
const phases = {}

// 小幅高斯噪声（Box-Muller）
const gaussian = () => {
  let u = 0
  let v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

// 连续随机游走：基线 + 正弦趋势 + 均值回归随机扰动
const nextValue = (deviceId, metric, prev, tick) => {
  const meta = getMeta(deviceId, metric)
  const ph = phases[deviceId][metric]
  // 缓慢正弦趋势
  const wave = Math.sin((tick + ph.phase) * 0.18) * meta.amp * 0.6
  // 均值回归随机扰动
  const drift = (meta.base - prev) * 0.08
  const noise = gaussian() * meta.amp * 0.25
  let next = prev + drift + wave * 0.05 + noise

  // 小概率越限脉冲，用于演示告警（约 4%）
  if (Math.random() < 0.04) {
    const threshold = state.thresholds[deviceId]?.[metric]
    if (threshold) {
      const up = Math.random() < 0.5
      if (up) next = threshold.max + 1 + Math.random() * 4
      else next = threshold.min - 1 - Math.random() * 4
    }
  }

  next = Math.min(meta.max, Math.max(meta.min, next))
  return round1(next)
}

const getMeta = (deviceId, metric) => {
  const device = DEVICES.find((d) => d.id === deviceId)
  return device[metric]
}

const pushHistory = (ds, point) => {
  ds.history.push(point)
  if (ds.history.length > HISTORY_LIMIT) {
    ds.history.splice(0, ds.history.length - HISTORY_LIMIT)
  }
}

const seedHistory = (deviceId) => {
  const now = Date.now()
  const history = []
  let temp = getMeta(deviceId, 'temperature').base
  let hum = getMeta(deviceId, 'humidity').base

  for (let i = HISTORY_LIMIT - 1; i >= 0; i--) {
    temp = nextValue(deviceId, 'temperature', temp, HISTORY_LIMIT - i)
    hum = nextValue(deviceId, 'humidity', hum, HISTORY_LIMIT - i)
    // 种子历史点默认不标记为告警中（演示数据不应一上来就满屏红点）
    history.push({
      t: new Date(now - i * COLLECT_INTERVAL),
      temperature: temp,
      humidity: hum,
      tempAlarm: false,
      humAlarm: false
    })
  }

  state.devices[deviceId] = {
    status: 'online',
    offlineUntil: 0,
    temperature: temp,
    humidity: hum,
    timestamp: now,
    history,
    tick: HISTORY_LIMIT
  }
}

const tick = () => {
  const now = Date.now()
  const events = []

  DEVICES.forEach((device) => {
    const ds = state.devices[device.id]
    if (!ds) return

    // 设备重启后的离线期：不采集、不参与告警判定，曲线留空
    if (ds.status === 'offline') {
      if (now < ds.offlineUntil) {
        ds.timestamp = now
        pushHistory(ds, {
          t: new Date(now),
          temperature: null,
          humidity: null,
          offline: true,
          tempAlarm: false,
          humAlarm: false
        })
        return
      }
      // 离线结束，自动恢复在线
      ds.status = 'online'
      ds.offlineUntil = 0
      resetDeviceDebounce(device.id)
      events.push({ type: 'online', deviceId: device.id, deviceName: device.name })
    }

    ds.tick += 1
    const temperature = nextValue(device.id, 'temperature', ds.temperature, ds.tick)
    const humidity = nextValue(device.id, 'humidity', ds.humidity, ds.tick)
    ds.temperature = temperature
    ds.humidity = humidity
    ds.timestamp = now

    // 越限判定：两个指标分别判定（带连续点去抖）
    const tempResult = evaluateReading(device.id, 'temperature', temperature, now)
    const humResult = evaluateReading(device.id, 'humidity', humidity, now)
    events.push(...tempResult.events, ...humResult.events)

    // 历史点带上"是否处于确认告警中"的标记，图表据此高亮，保证与判定一致
    pushHistory(ds, {
      t: new Date(now),
      temperature,
      humidity,
      tempAlarm: tempResult.alarming,
      humAlarm: humResult.alarming
    })
  })

  return events
}

let timer = null

const initDevices = () => {
  DEVICES.forEach((device) => {
    phases[device.id] = {
      temperature: { phase: Math.random() * 20 },
      humidity: { phase: Math.random() * 20 }
    }
    seedHistory(device.id)
  })
}

// 启动采集器；onEvents 回调用于上层通知（避免采集器依赖 UI）
export const startCollector = (onEvents) => {
  if (state.collecting) return
  initDevices()
  state.collecting = true
  state.startedAt = Date.now()

  timer = setInterval(() => {
    const events = tick()
    if (events.length > 0 && typeof onEvents === 'function') {
      onEvents(events)
    }
  }, COLLECT_INTERVAL)
}

export const stopCollector = () => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  state.collecting = false
}

// 设备重启：标记离线约一分钟，期间暂停采集、曲线留空、不参与告警判定；
// 到期后自动恢复，数据续上、历史不断。
export const restartDevice = (deviceId) => {
  const ds = state.devices[deviceId]
  if (!ds || ds.status === 'offline') return false
  ds.status = 'offline'
  ds.offlineUntil = Date.now() + RESTART_OFFLINE_DURATION
  // 重置去抖计数，避免恢复后用离线前的连续状态立即误判
  resetDeviceDebounce(deviceId)
  return true
}

export const isDeviceOnline = (deviceId) => {
  const ds = state.devices[deviceId]
  if (!ds) return false
  if (ds.status === 'offline') return Date.now() >= ds.offlineUntil
  return true
}

// 设备离线剩余秒数
export const getOfflineRemaining = (deviceId) => {
  const ds = state.devices[deviceId]
  if (!ds || ds.status !== 'offline') return 0
  return Math.max(0, Math.ceil((ds.offlineUntil - Date.now()) / 1000))
}

// 手动补采一帧（用于阈值变更后立即重判定，保持各处一致）
export const collectOnce = () => tick()
