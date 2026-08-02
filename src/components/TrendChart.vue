<template>
  <div ref="chartContainer" class="chart-container"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  // 待对比的设备列表，每项 { id, name, history }
  devices: {
    type: Array,
    default: () => []
  },
  // 当前告警最紧急设备的生效阈值，仅它画参考线
  threshold: {
    type: Object,
    default: null
  },
  // 阈值参考线所属设备名，用于标签标注
  thresholdDeviceName: {
    type: String,
    default: ''
  }
})

// 多设备对比时，每台设备一套配色（温度深、湿度浅），保证同图可区分
const DEVICE_PALETTE = [
  { temperature: '#409EFF', humidity: '#67C23A' },
  { temperature: '#E6A23C', humidity: '#F56C6C' },
  { temperature: '#B37FEB', humidity: '#36CFC9' }
]

const paletteFor = (index) => DEVICE_PALETTE[index % DEVICE_PALETTE.length]

const chartContainer = ref(null)
let chartInstance = null

// 时间戳格式化为 时:分:秒
const formatTime = (ts) =>
  new Date(ts).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

// 判断某个点是否越限，越限点在图上醒目标出
const isOutOfLimit = (value, limit) => value > limit.max || value < limit.min

// 组装某一指标的越限散点数据（[索引, 值]）
const buildOutliers = (history, metric, limit) =>
  history
    .map((item, index) => (isOutOfLimit(item[metric], limit) ? [index, item[metric]] : null))
    .filter(Boolean)

// 生成阈值参考线的 markLine 配置
const buildMarkLine = (limit, color, label) => ({
  symbol: 'none',
  silent: true,
  lineStyle: { color, type: 'dashed', width: 1.5, opacity: 0.7 },
  label: {
    color,
    formatter: (p) => `${label}${p.name} ${p.value}`,
    position: 'insideEndTop'
  },
  data: [
    { yAxis: limit.max, name: '上限' },
    { yAxis: limit.min, name: '下限' }
  ]
})

// 单设备模式：保留原有温度蓝 / 湿度绿 + 面积填充样式
const buildSingleSeries = (device, threshold) => {
  const series = [
    {
      name: '温度',
      type: 'line',
      yAxisIndex: 0,
      data: device.history.map((item) => item.temperature),
      smooth: true,
      showSymbol: false,
      lineStyle: { color: '#409EFF', width: 2 },
      itemStyle: { color: '#409EFF' },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(64, 158, 255, 0.3)' },
            { offset: 1, color: 'rgba(64, 158, 255, 0.05)' }
          ]
        }
      },
      markLine: threshold ? buildMarkLine(threshold.temperature, '#409EFF', '') : undefined
    },
    {
      name: '湿度',
      type: 'line',
      yAxisIndex: 1,
      data: device.history.map((item) => item.humidity),
      smooth: true,
      showSymbol: false,
      lineStyle: { color: '#67C23A', width: 2 },
      itemStyle: { color: '#67C23A' },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(103, 194, 58, 0.3)' },
            { offset: 1, color: 'rgba(103, 194, 58, 0.05)' }
          ]
        }
      },
      markLine: threshold ? buildMarkLine(threshold.humidity, '#67C23A', '') : undefined
    }
  ]

  if (threshold) {
    series.push(buildOutlierSeries('温度越限', 0, buildOutliers(device.history, 'temperature', threshold.temperature)))
    series.push(buildOutlierSeries('湿度越限', 1, buildOutliers(device.history, 'humidity', threshold.humidity)))
  }
  return series
}

// 越限散点系列（红色醒目点）
const buildOutlierSeries = (name, yAxisIndex, data) => ({
  name,
  type: 'scatter',
  yAxisIndex,
  data,
  symbolSize: 10,
  itemStyle: { color: '#F56C6C', borderColor: '#fff', borderWidth: 1.5 },
  tooltip: { show: false },
  z: 10
})

// 多设备对比模式：每台一对温湿度曲线（温度实线 / 湿度虚线），按设备配色区分
const buildComparisonSeries = (devices, urgentId, threshold) => {
  const series = []
  devices.forEach((device, index) => {
    const colors = paletteFor(index)
    series.push({
      name: `${device.name}-温度`,
      type: 'line',
      yAxisIndex: 0,
      data: device.history.map((item) => item.temperature),
      smooth: true,
      showSymbol: false,
      lineStyle: { color: colors.temperature, width: 2 },
      itemStyle: { color: colors.temperature }
    })
    series.push({
      name: `${device.name}-湿度`,
      type: 'line',
      yAxisIndex: 1,
      data: device.history.map((item) => item.humidity),
      smooth: true,
      showSymbol: false,
      lineStyle: { color: colors.humidity, width: 2, type: 'dashed' },
      itemStyle: { color: colors.humidity }
    })
  })

  // 阈值参考线只画最紧急设备；越限点也按各自设备阈值标注
  if (threshold) {
    const label = props.thresholdDeviceName ? `${props.thresholdDeviceName} ` : ''
    // 参考线挂到最紧急设备的温/湿度系列上
    const urgentSeries = series.find((s) => s.name === `${labelName(devices, urgentId)}-温度`)
    if (urgentSeries) urgentSeries.markLine = buildMarkLine(threshold.temperature, urgentSeries.lineStyle.color, label)
    const urgentHum = series.find((s) => s.name === `${labelName(devices, urgentId)}-湿度`)
    if (urgentHum) urgentHum.markLine = buildMarkLine(threshold.humidity, urgentHum.lineStyle.color, label)

    const urgentDevice = devices.find((d) => d.id === urgentId)
    if (urgentDevice) {
      series.push(buildOutlierSeries('越限', 0, buildOutliers(urgentDevice.history, 'temperature', threshold.temperature)))
      series.push(buildOutlierSeries('越限', 1, buildOutliers(urgentDevice.history, 'humidity', threshold.humidity)))
    }
  }
  return series
}

const labelName = (devices, id) => devices.find((d) => d.id === id)?.name || ''

// 以第一台设备的时间轴为准（各设备采集同步，时间轴一致）
const buildTimes = (devices) => {
  const base = devices[0]
  return base ? base.history.map((item) => formatTime(item.time)) : []
}

// 构建完整图表配置
const buildOption = () => {
  const devices = props.devices
  const threshold = props.threshold
  const isSingle = devices.length === 1

  const series = isSingle
    ? buildSingleSeries(devices[0], threshold)
    : buildComparisonSeries(devices, findUrgentId(), threshold)

  // 图例：单设备用温度/湿度，多设备用「设备-指标」
  const legendData = series
    .filter((s) => s.type === 'line')
    .map((s) => s.name)

  return {
    backgroundColor: 'transparent',
    grid: { left: '3%', right: '4%', bottom: '10%', top: '14%', containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(50, 50, 50, 0.9)',
      borderColor: '#409EFF',
      borderWidth: 1,
      textStyle: { color: '#fff' }
    },
    legend: {
      data: legendData,
      top: '5%',
      type: 'scroll',
      textStyle: { color: '#E4E7ED' }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: buildTimes(devices),
      axisLine: { lineStyle: { color: '#606266' } },
      axisLabel: { color: '#909399' }
    },
    yAxis: [
      {
        type: 'value',
        name: '温度(°C)',
        position: 'left',
        axisLine: { lineStyle: { color: '#409EFF' } },
        axisLabel: { color: '#909399', formatter: '{value}°C' },
        splitLine: { lineStyle: { color: '#303133', type: 'dashed' } }
      },
      {
        type: 'value',
        name: '湿度(%)',
        position: 'right',
        axisLine: { lineStyle: { color: '#67C23A' } },
        axisLabel: { color: '#909399', formatter: '{value}%' },
        splitLine: { show: false }
      }
    ],
    series
  }
}

// 依据 thresholdDeviceName 反查最紧急设备 id
const findUrgentId = () => props.devices.find((d) => d.name === props.thresholdDeviceName)?.id || null

// 刷新图表：仅 setOption 更新数据，不重建实例，历史平滑向前
const render = () => {
  if (!chartInstance || props.devices.length === 0) return
  chartInstance.setOption(buildOption(), { replaceMerge: ['series'] })
}

const handleResize = () => chartInstance?.resize()

onMounted(() => {
  nextTick(() => {
    chartInstance = echarts.init(chartContainer.value)
    render()
    window.addEventListener('resize', handleResize)
  })
})

// 读数或阈值变化即时重绘，保证图上情况与判定、记录中心一致
watch(
  () => [props.devices, props.threshold, props.thresholdDeviceName],
  render,
  { deep: true }
)

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 100%;
  min-height: 500px;
}

@media (max-width: 1920px) {
  .chart-container {
    min-height: 400px;
  }
}
</style>
