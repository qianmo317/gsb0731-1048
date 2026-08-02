import { computed, watch, ref } from 'vue'
import { ElNotification } from 'element-plus'
import { state, DEVICES, getDeviceMeta, formatTime, DEVICE_SERIES_STYLES, COLLECT_INTERVAL } from './state'
import { loadThresholds, setThreshold, resetThreshold, resetAllThresholds, validateThreshold } from './thresholds'
import {
  loadAlarms,
  evaluateReading,
  acknowledgeAlarm,
  acknowledgeAll,
  clearAlarmHistory,
  queryAlarms,
  getActiveAlarmCount,
  getActiveAlarm,
  getMostUrgentDevice,
  getUnacknowledgedByDevice,
  getUnacknowledgedCount,
  isUnacknowledged,
  isMetricAlarming,
  METRIC_META,
  ALARM_LEVEL,
  ALARM_STATUS
} from './alarms'
import {
  startCollector,
  stopCollector,
  collectOnce,
  restartDevice,
  getOfflineRemaining,
  isDeviceOnline
} from './collector'

export {
  state,
  DEVICES,
  DEVICE_SERIES_STYLES,
  METRIC_META,
  ALARM_LEVEL,
  ALARM_STATUS,
  acknowledgeAlarm,
  acknowledgeAll,
  clearAlarmHistory,
  queryAlarms,
  getActiveAlarmCount,
  getActiveAlarm,
  getMostUrgentDevice,
  getUnacknowledgedByDevice,
  getUnacknowledgedCount,
  isUnacknowledged,
  isMetricAlarming,
  evaluateReading,
  restartDevice,
  getOfflineRemaining,
  isDeviceOnline
}
export {
  setThreshold,
  resetThreshold,
  resetAllThresholds,
  validateThreshold,
  getDeviceMeta,
  formatTime,
  startCollector,
  stopCollector,
  collectOnce
}

let initialized = false
let thresholdWatcherBound = false

const notifyAlarm = (event) => {
  if (event.type === 'online') {
    ElNotification({
      title: `${event.deviceName} · 已恢复在线`,
      message: '设备重启完成，数据采集已自动恢复',
      type: 'success',
      duration: 5000,
      position: 'top-right'
    })
    return
  }
  const { alarm, type } = event
  const isRecover = type === 'recover'
  ElNotification({
    title: isRecover ? '告警已恢复' : `${alarm.deviceName} · ${alarm.typeLabel}`,
    message: isRecover
      ? `${alarm.metricLabel}已连续回落至 ${alarm.recoverValue}${alarm.unit}（阈值 ${alarm.threshold}${alarm.unit}）`
      : `当前值 ${alarm.value}${alarm.unit}，阈值 ${alarm.threshold}${alarm.unit} · ${formatTime(alarm.startTime)}`,
    type: isRecover ? 'success' : alarm.level === 'critical' ? 'error' : 'warning',
    duration: isRecover ? 4000 : 6000,
    position: 'top-right'
  })
}

const handleEvents = (events) => {
  events.forEach((event) => {
    // 去抖后仅在正式触发/恢复/上线时产生事件，持续中的抖动不弹窗
    notifyAlarm(event)
  })
}

// 阈值变更后，用各在线设备当前最新读数立即重新判定，保证图、判定、记录一致
const reevaluateAll = () => {
  const events = []
  DEVICES.forEach((device) => {
    const ds = state.devices[device.id]
    if (!ds || ds.status === 'offline') return
    const now = Date.now()
    const t = evaluateReading(device.id, 'temperature', ds.temperature, now)
    const h = evaluateReading(device.id, 'humidity', ds.humidity, now)
    events.push(...t.events, ...h.events)
  })
  handleEvents(events)
}

const bindThresholdWatcher = () => {
  if (thresholdWatcherBound) return
  thresholdWatcherBound = true
  watch(
    () => state.thresholds,
    () => {
      reevaluateAll()
    },
    { deep: true }
  )
}

// 系统初始化：阈值 -> 告警持久化 -> 采集器
export const initMonitor = () => {
  if (initialized) return
  initialized = true
  loadThresholds()
  loadAlarms()
  bindThresholdWatcher()
  startCollector(handleEvents)
}

export const shutdownMonitor = () => {
  stopCollector()
}

// 组合式 API：供组件直接消费单一数据源
export const useMonitor = () => {
  // 多选：默认选中第一台设备
  const selectedDeviceIds = ref([DEVICES[0].id])
  // 用于驱动离线倒计时等 UI 每秒刷新的时钟
  const nowTick = ref(Date.now())
  let tickTimer = null
  if (typeof window !== 'undefined' && !tickTimer) {
    tickTimer = setInterval(() => {
      nowTick.value = Date.now()
    }, 1000)
  }

  const deviceList = DEVICES

  // 主设备：从在线且选中的设备中挑告警最紧急者；若全部离线则取选中第一台
  const primaryDeviceId = computed(() => {
    if (selectedDeviceIds.value.length === 0) return null
    const onlineSelected = selectedDeviceIds.value.filter((id) => isDeviceOnline(id))
    if (onlineSelected.length > 0) {
      const urgent = getMostUrgentDevice(onlineSelected)
      if (urgent) return urgent
      return onlineSelected[0]
    }
    return selectedDeviceIds.value[0]
  })

  const primaryDevice = computed(() =>
    primaryDeviceId.value ? getDeviceMeta(primaryDeviceId.value) : null
  )
  const primaryDeviceState = computed(() =>
    primaryDeviceId.value ? state.devices[primaryDeviceId.value] : null
  )
  const primaryDeviceThreshold = computed(() =>
    primaryDeviceId.value ? state.thresholds[primaryDeviceId.value] : null
  )
  const primaryOnline = computed(() =>
    primaryDeviceId.value ? isDeviceOnline(primaryDeviceId.value) : false
  )
  const offlineRemaining = computed(() => {
    nowTick.value // 依赖时钟刷新
    return primaryDeviceId.value ? getOfflineRemaining(primaryDeviceId.value) : 0
  })

  const currentTemperature = computed(() =>
    primaryOnline.value ? primaryDeviceState.value?.temperature ?? 0 : null
  )
  const currentHumidity = computed(() =>
    primaryOnline.value ? primaryDeviceState.value?.humidity ?? 0 : null
  )
  const history = computed(() => primaryDeviceState.value?.history ?? [])

  const activeAlarmCount = computed(() => getActiveAlarmCount())
  const unacknowledgedCount = computed(() => getUnacknowledgedCount())
  const activeTemperatureAlarm = computed(() =>
    primaryDeviceId.value ? getActiveAlarm(primaryDeviceId.value, 'temperature') : null
  )
  const activeHumidityAlarm = computed(() =>
    primaryDeviceId.value ? getActiveAlarm(primaryDeviceId.value, 'humidity') : null
  )

  const restart = (deviceId) => {
    const ok = restartDevice(deviceId || primaryDeviceId.value)
    if (ok) {
      const meta = getDeviceMeta(deviceId || primaryDeviceId.value)
      ElNotification({
        title: `${meta?.name || '设备'} · 重启中`,
        message: '设备将暂停采集约 1 分钟，期间曲线留空、不参与告警判定',
        type: 'warning',
        duration: 6000,
        position: 'top-right'
      })
    }
    return ok
  }

  return {
    state,
    deviceList,
    selectedDeviceIds,
    primaryDeviceId,
    primaryDevice,
    primaryDeviceState,
    primaryDeviceThreshold,
    primaryOnline,
    offlineRemaining,
    currentTemperature,
    currentHumidity,
    history,
    activeAlarmCount,
    unacknowledgedCount,
    activeTemperatureAlarm,
    activeHumidityAlarm,
    acknowledgeAlarm,
    acknowledgeAll,
    clearAlarmHistory,
    queryAlarms,
    getUnacknowledgedByDevice,
    getMostUrgentDevice,
    isMetricAlarming,
    isDeviceOnline,
    getOfflineRemaining,
    restart,
    collectOnce,
    COLLECT_INTERVAL
  }
}
