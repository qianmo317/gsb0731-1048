import { reactive } from 'vue'

// 采集周期（毫秒）与历史缓冲上限
export const COLLECT_INTERVAL = 2000
export const HISTORY_LIMIT = 60

// 严重越限幅度，超出阈值该幅度以上判为严重
export const SEVERE_MARGIN = 3

// 去抖：连续越限达到该采集点数才正式告警；连续回落达到该点数才正式恢复
// 避免在阈值边上抖动时告警来回翻
export const ALARM_DEBOUNCE_POINTS = 3

// 设备重启后离线时长（毫秒），期间暂停采集、不参与告警判定
export const RESTART_OFFLINE_DURATION = 60000

// localStorage 存储键
export const STORAGE_KEYS = {
  thresholds: 'iot-monitor:thresholds',
  alarms: 'iot-monitor:alarms'
}

// 多设备同图对比时的系列样式：温度统一蓝色系、湿度统一绿色系，
// 通过亮度与线型（实线/虚线/点线）区分不同设备，保持温度蓝/湿度绿的配色约定
export const DEVICE_SERIES_STYLES = {
  device1: {
    temperature: { color: '#409EFF', lineStyle: 'solid', width: 2 },
    humidity: { color: '#67C23A', lineStyle: 'solid', width: 2 }
  },
  device2: {
    temperature: { color: '#79BBFF', lineStyle: 'dashed', width: 2 },
    humidity: { color: '#95D475', lineStyle: 'dashed', width: 2 }
  },
  device3: {
    temperature: { color: '#1D6FCC', lineStyle: 'dotted', width: 2.5 },
    humidity: { color: '#3E9B25', lineStyle: 'dotted', width: 2.5 }
  }
}

// 三台设备的基线与波动参数，保持各自大致水平差异
export const DEVICES = [
  {
    id: 'device1',
    name: '设备1',
    location: '机房A区',
    temperature: { base: 22.5, amp: 1.2, min: 8, max: 32 },
    humidity: { base: 52, amp: 4, min: 20, max: 80 }
  },
  {
    id: 'device2',
    name: '设备2',
    location: '机房B区',
    temperature: { base: 25.5, amp: 1.5, min: 8, max: 32 },
    humidity: { base: 58, amp: 5, min: 20, max: 80 }
  },
  {
    id: 'device3',
    name: '设备3',
    location: '仓库C区',
    temperature: { base: 20, amp: 1.6, min: 8, max: 32 },
    humidity: { base: 46, amp: 5, min: 20, max: 80 }
  }
]

// 单一可信数据源：采集、阈值、越限判定、告警记录全部收口于此
export const state = reactive({
  // 设备实时数据与历史：{ deviceId: { temperature, humidity, timestamp, history: [] } }
  devices: {},
  // 阈值：{ deviceId: { temperature: {min,max}, humidity: {min,max} } }
  thresholds: {},
  // 告警记录（按时间倒序）
  alarms: [],
  // 当前正在持续中的异常：Map<deviceId:metric, alarmRecord>
  activeAlarms: {},
  // 采集器运行状态
  collecting: false,
  startedAt: null
})

export const getDeviceMeta = (deviceId) =>
  DEVICES.find((d) => d.id === deviceId)

export const getDeviceState = (deviceId) => state.devices[deviceId]

export const round1 = (value) => Math.round(value * 10) / 10

export const formatTime = (date) => {
  const d = date instanceof Date ? date : new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
