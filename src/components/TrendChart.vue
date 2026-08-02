<template>
  <div ref="chartContainer" class="trend-chart"></div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import {
  store,
  getDeviceReadings,
  getDeviceThresholds,
  getDevice,
  getDeviceColor,
  METRIC_META
} from '../store/monitorStore'
import { isValueViolating, getMostUrgentDeviceId } from '../modules/alertEngine'

const props = defineProps({
  deviceIds: { type: Array, required: true }
})

const chartContainer = ref(null)
let chartInstance = null
let resizeHandler = null

const isMulti = computed(() => props.deviceIds.length > 1)

// 焦点设备：多设备时取当前告警最紧急的一台，阈值参考线只画它的
const focusDeviceId = computed(() => getMostUrgentDeviceId(props.deviceIds))

// 对齐多设备时间轴：按 timestamp 取并集排序，避免各设备采集起点不同导致错位
function buildTimeline() {
  const set = new Set()
  props.deviceIds.forEach(id => {
    getDeviceReadings(id).forEach(r => set.add(r.timestamp))
  })
  return [...set].sort((a, b) => a - b)
}

// 将某设备读数映射到统一时间轴上，越限点按该设备自己的阈值标红
// 离线占位（value=null）不画标记点，配合 connectNulls:false 形成曲线空白段
function mapPoints(deviceId, metric, timestamps) {
  const thresholds = getDeviceThresholds(deviceId)
  const t = thresholds ? thresholds[metric] : null
  const map = new Map()
  getDeviceReadings(deviceId).forEach(r => map.set(r.timestamp, r[metric]))
  return timestamps.map(ts => {
    const value = map.has(ts) ? map.get(ts) : null
    if (value === null || value === undefined) {
      return { value: null, symbol: 'none' }
    }
    const violating = t ? isValueViolating(value, t) : false
    return {
      value,
      itemStyle: violating
        ? { color: '#F56C6C', borderColor: '#fff', borderWidth: 1 }
        : undefined,
      symbolSize: violating ? 9 : (isMulti.value ? 4 : 5)
    }
  })
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// 构造阈值参考线（仅焦点设备）：告警级橙色虚线，严重级红色实线
function buildMarkLines(deviceId, metric, labelSide) {
  const thresholds = getDeviceThresholds(deviceId)
  if (!thresholds) return {}
  const t = thresholds[metric]
  const device = getDevice(deviceId)
  const unit = metric === 'temperature' ? '°C' : '%'
  const devTag = isMulti.value && device ? `${device.name}·` : ''
  const mk = (val, tag, level, vertPos) => ({
    yAxis: val,
    lineStyle: {
      color: level === 'critical' ? '#F56C6C' : '#E6A23C',
      type: level === 'critical' ? 'solid' : 'dashed',
      width: level === 'critical' ? 1.5 : 1,
      opacity: 0.75
    },
    label: {
      formatter: `${devTag}${tag} ${val}${unit}`,
      color: level === 'critical' ? '#F56C6C' : '#E6A23C',
      fontSize: 10,
      position: `inside${labelSide}${vertPos}`
    }
  })
  return {
    symbol: 'none',
    silent: true,
    animation: false,
    data: [
      mk(t.lowCritical, '严重低', 'critical', 'Bottom'),
      mk(t.lowWarning, '告警低', 'warning', 'Bottom'),
      mk(t.highWarning, '告警高', 'warning', 'Top'),
      mk(t.highCritical, '严重高', 'critical', 'Top')
    ]
  }
}

function buildSeries(timestamps) {
  const series = []
  const focusId = focusDeviceId.value

  props.deviceIds.forEach(deviceId => {
    const device = getDevice(deviceId)
    const devName = device ? device.name : deviceId
    ;['temperature', 'humidity'].forEach(metric => {
      const color = getDeviceColor(deviceId, metric)
      const isFocus = deviceId === focusId
      const name = isMulti.value
        ? `${devName}·${METRIC_META[metric].name}`
        : METRIC_META[metric].name
      const showArea = !isMulti.value
      series.push({
        name,
        type: 'line',
        yAxisIndex: metric === 'temperature' ? 0 : 1,
        smooth: true,
        showSymbol: true,
        // 离线占位为 null，不连线，形成可见的曲线空白段
        connectNulls: false,
        data: mapPoints(deviceId, metric, timestamps),
        lineStyle: { color, width: isMulti.value ? 1.6 : 2 },
        itemStyle: { color },
        areaStyle: showArea
          ? {
              color: {
                type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: metric === 'temperature' ? 'rgba(64, 158, 255, 0.3)' : 'rgba(103, 194, 58, 0.3)' },
                  { offset: 1, color: metric === 'temperature' ? 'rgba(64, 158, 255, 0.05)' : 'rgba(103, 194, 58, 0.05)' }
                ]
              }
            }
          : undefined,
        // 阈值参考线只画焦点设备：温度画在该设备温度序列上，湿度画在湿度序列上
        markLine: isFocus ? buildMarkLines(deviceId, metric, metric === 'temperature' ? 'Start' : 'End') : undefined
      })
    })
  })
  return series
}

function buildOption() {
  const timestamps = buildTimeline()
  const focusId = focusDeviceId.value
  const tempMeta = METRIC_META.temperature
  const humMeta = METRIC_META.humidity

  // Y 轴边界：容纳所有选中设备的数据 + 焦点设备阈值，保证参考线与越限点都可见
  const axisBounds = (metric, pad) => {
    let min = Infinity
    let max = -Infinity
    props.deviceIds.forEach(id => {
      getDeviceReadings(id).forEach(r => {
        if (r[metric] < min) min = r[metric]
        if (r[metric] > max) max = r[metric]
      })
    })
    if (!isFinite(min)) { min = 0; max = 100 }
    const t = focusId ? getDeviceThresholds(focusId) : null
    if (t) {
      min = Math.min(min, t[metric].lowCritical)
      max = Math.max(max, t[metric].highCritical)
    }
    return { min: parseFloat((min - pad).toFixed(1)), max: parseFloat((max + pad).toFixed(1)) }
  }
  const tempBounds = axisBounds('temperature', 1)
  const humBounds = axisBounds('humidity', 2)

  return {
    backgroundColor: 'transparent',
    animation: true,
    animationDurationUpdate: 300,
    grid: { left: '3%', right: '4%', bottom: '12%', top: isMulti.value ? '22%' : '14%', containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(50, 50, 50, 0.92)',
      borderColor: '#409EFF',
      borderWidth: 1,
      textStyle: { color: '#fff' },
      formatter: (params) => {
        if (!params || !params.length) return ''
        const time = params[0].axisValue
        const lines = params.map(p => {
          const violating = p.data && p.data.itemStyle && p.data.itemStyle.color === '#F56C6C'
          const mark = violating ? ' ⚠ 越限' : ''
          const unit = p.seriesName.includes('温度') ? '°C' : '%'
          return `${p.marker}${p.seriesName}: ${p.value === null || p.value === undefined ? '—' : p.value}${unit}${mark}`
        })
        return `<div style="font-weight:600;margin-bottom:4px">${time}</div>${lines.join('<br/>')}`
      }
    },
    legend: {
      type: 'scroll',
      top: 0,
      left: 'center',
      textStyle: { color: '#E4E7ED' }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: timestamps.map(formatTime),
      axisLine: { lineStyle: { color: '#606266' } },
      axisLabel: { color: '#909399', fontSize: 11 }
    },
    yAxis: [
      {
        type: 'value',
        min: tempBounds.min,
        max: tempBounds.max,
        name: '温度(°C)',
        position: 'left',
        axisLine: { lineStyle: { color: tempMeta.color } },
        axisLabel: { color: '#909399', formatter: '{value}°C' },
        splitLine: { lineStyle: { color: '#303133', type: 'dashed' } }
      },
      {
        type: 'value',
        min: humBounds.min,
        max: humBounds.max,
        name: '湿度(%)',
        position: 'right',
        axisLine: { lineStyle: { color: humMeta.color } },
        axisLabel: { color: '#909399', formatter: '{value}%' },
        splitLine: { show: false }
      }
    ],
    series: buildSeries(timestamps)
  }
}

function render() {
  if (!chartInstance) return
  chartInstance.setOption(buildOption(), { notMerge: true, lazyUpdate: true })
}

// 监听选中设备、各设备读数/阈值、活动告警状态（焦点设备随告警变化）
watch(
  () => [
    props.deviceIds.slice(),
    props.deviceIds.map(id => store.readings[id]),
    props.deviceIds.map(id => store.thresholds[id]),
    store.activeStates
  ],
  () => render(),
  { deep: true }
)

onMounted(() => {
  nextTick(() => {
    if (!chartContainer.value) return
    chartInstance = echarts.init(chartContainer.value)
    render()
    resizeHandler = () => chartInstance && chartInstance.resize()
    window.addEventListener('resize', resizeHandler)
  })
})

onUnmounted(() => {
  if (resizeHandler) window.removeEventListener('resize', resizeHandler)
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
</script>

<style scoped>
.trend-chart {
  width: 100%;
  height: 100%;
  min-height: 320px;
}
</style>
