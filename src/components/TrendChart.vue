<template>
  <div ref="chartContainer" class="trend-chart"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import {
  state,
  formatTime,
  METRIC_META,
  DEVICE_SERIES_STYLES,
  getDeviceMeta,
  getMostUrgentDevice
} from '@/store'
import { getDeviceActiveAlarms } from '@/store/alarms'

const props = defineProps({
  // 支持单台（字符串）或多台（数组）对比
  deviceIds: {
    type: [Array, String],
    required: true
  }
})

const chartContainer = ref(null)
let chartInstance = null
let resizeObserver = null

const TEMP_COLOR = METRIC_META.temperature.color
const HUM_COLOR = METRIC_META.humidity.color
const ALARM_HIGH = '#F56C6C'
const ALARM_LOW = '#E6A23C'

const normalizedIds = () =>
  Array.isArray(props.deviceIds) ? props.deviceIds : [props.deviceIds]

const formatAxisTime = (date) => {
  const d = new Date(date)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 依据该点"是否处于确认告警中"的标记给单点打标（与判定结果完全一致）
// offline 或 value 为 null 时返回 null，让 ECharts 断线留空
const buildPoint = (value, alarming) => {
  if (value === null || value === undefined) {
    return { value: null, symbolSize: 0 }
  }
  if (alarming) {
    return {
      value,
      itemStyle: { color: ALARM_HIGH, borderColor: '#fff', borderWidth: 1 },
      symbolSize: 7
    }
  }
  return { value, symbolSize: 0 }
}

// 单设备 series 构造
const buildSingleSeries = (deviceId) => {
  const ds = state.devices[deviceId]
  const threshold = state.thresholds[deviceId]
  const meta = getDeviceMeta(deviceId)
  if (!ds || !threshold) return { times: [], series: [] }

  const styles = DEVICE_SERIES_STYLES[deviceId]
  const times = ds.history.map((p) => formatAxisTime(p.t))
  const tempStyle = styles.temperature
  const humStyle = styles.humidity

  const tempPoints = ds.history.map((p) => buildPoint(p.temperature, p.tempAlarm))
  const humPoints = ds.history.map((p) => buildPoint(p.humidity, p.humAlarm))

  const series = [
    {
      name: `${meta.name} 温度`,
      type: 'line',
      yAxisIndex: 0,
      data: tempPoints,
      smooth: true,
      showSymbol: true,
      lineStyle: { color: tempStyle.color, width: tempStyle.width, type: tempStyle.lineStyle },
      itemStyle: { color: tempStyle.color },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(64, 158, 255, 0.3)' },
          { offset: 1, color: 'rgba(64, 158, 255, 0.05)' }
        ])
      }
    },
    {
      name: `${meta.name} 湿度`,
      type: 'line',
      yAxisIndex: 1,
      data: humPoints,
      smooth: true,
      showSymbol: true,
      lineStyle: { color: humStyle.color, width: humStyle.width, type: humStyle.lineStyle },
      itemStyle: { color: humStyle.color },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: 'rgba(103, 194, 58, 0.3)' },
          { offset: 1, color: 'rgba(103, 194, 58, 0.05)' }
        ])
      }
    }
  ]

  return { times, series }
}

// 多设备 series 构造：每台两条曲线，去掉面积填充避免互相遮挡
const buildMultiSeries = (ids, referenceDeviceId) => {
  const validIds = ids.filter((id) => state.devices[id])
  if (validIds.length === 0) return { times: [], series: [] }

  // 所有设备同周期采集、同长度历史，以第一台的时间轴作为基准
  const baseDs = state.devices[validIds[0]]
  const times = baseDs.history.map((p) => formatAxisTime(p.t))
  const series = []
  const legendData = []

  validIds.forEach((id) => {
    const ds = state.devices[id]
    const threshold = state.thresholds[id]
    const meta = getDeviceMeta(id)
    const styles = DEVICE_SERIES_STYLES[id]
    const isReference = id === referenceDeviceId

    ;[
      { metric: 'temperature', axis: 0, style: styles.temperature },
      { metric: 'humidity', axis: 1, style: styles.humidity }
    ].forEach(({ metric, axis, style }) => {
      const points = ds.history.map((p) => buildPoint(p[metric], metric === 'temperature' ? p.tempAlarm : p.humAlarm))
      const seriesName = `${meta.name} ${METRIC_META[metric].label}`
      legendData.push(seriesName)

      const item = {
        name: seriesName,
        type: 'line',
        yAxisIndex: axis,
        data: points,
        smooth: true,
        showSymbol: true,
        lineStyle: {
          color: style.color,
          width: isReference ? style.width + 1 : style.width,
          type: style.lineStyle
        },
        itemStyle: { color: style.color }
      }

      // 参考线仅画在最紧急设备的温度/湿度系列上
      if (isReference) {
        const t = threshold[metric]
        item.markLine = {
          symbol: 'none',
          silent: true,
          label: {
            color: '#C0C4CC',
            fontSize: 11,
            formatter: (p) => `${meta.name} ${p.name} ${p.value}${METRIC_META[metric].unit}`
          },
          lineStyle: { type: 'dashed', width: 1.5 },
          data: [
            { name: '上限', yAxis: t.max, lineStyle: { color: ALARM_HIGH } },
            { name: '下限', yAxis: t.min, lineStyle: { color: ALARM_LOW } }
          ]
        }
      }

      series.push(item)
    })
  })

  return { times, series, legendData }
}

// 单设备参考线构造
const buildMarkLines = (deviceId) => {
  const threshold = state.thresholds[deviceId]
  if (!threshold) return []
  const meta = getDeviceMeta(deviceId)
  return [
    {
      name: '温度上限',
      yAxis: threshold.temperature.max,
      lineStyle: { color: ALARM_HIGH },
      label: { formatter: (p) => `${p.name} ${p.value}°C` }
    },
    {
      name: '温度下限',
      yAxis: threshold.temperature.min,
      lineStyle: { color: ALARM_LOW },
      label: { formatter: (p) => `${p.name} ${p.value}°C` }
    }
  ]
}

const buildOption = () => {
  const ids = normalizedIds()
  const validIds = ids.filter((id) => state.devices[id])
  if (validIds.length === 0) return null

  const multi = validIds.length > 1
  let times = []
  let series = []
  let legendData = []
  let referenceDeviceId = null

  if (multi) {
    // 参考线只画当前告警最紧急那台设备的
    referenceDeviceId = getMostUrgentDevice(validIds)
    const built = buildMultiSeries(validIds, referenceDeviceId)
    times = built.times
    series = built.series
    legendData = built.legendData
  } else {
    const id = validIds[0]
    referenceDeviceId = id
    const built = buildSingleSeries(id)
    times = built.times
    series = built.series
    legendData = series.map((s) => s.name)
    // 单设备时给温度系列挂参考线
    const threshold = state.thresholds[id]
    if (threshold && series[0]) {
      series[0].markLine = {
        symbol: 'none',
        silent: true,
        label: {
          color: '#C0C4CC',
          fontSize: 11,
          formatter: (p) => `${p.name} ${p.value}°C`
        },
        lineStyle: { type: 'dashed', width: 1.5 },
        data: buildMarkLines(id)
      }
    }
  }

  return {
    backgroundColor: 'transparent',
    animationDurationUpdate: 300,
    animationEasingUpdate: 'linear',
    grid: { left: '3%', right: '4%', bottom: '10%', top: '14%', containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(50, 50, 50, 0.92)',
      borderColor: '#409EFF',
      borderWidth: 1,
      textStyle: { color: '#fff' },
      confine: true,
      formatter: (params) => {
        if (!params || !params.length) return ''
        const idx = params[0].dataIndex
        const lines = [formatTime(new Date(state.devices[validIds[0]].history[idx].t))]
        validIds.forEach((id) => {
          const ds = state.devices[id]
          const meta = getDeviceMeta(id)
          const point = ds.history[idx]
          const refTag = id === referenceDeviceId ? ' <span style="color:#E6A23C">[参考]</span>' : ''
          if (point.offline) {
            lines.push(
              `<div style="margin-top:4px"><b>${meta.name}</b>${refTag}</div>` +
                `<div style="color:#909399">设备离线 / 重启中，无数据</div>`
            )
            return
          }
          // 状态以该点记录的"确认告警中"标记为准，与图表高亮、判定结果一致
          const tempTag = point.tempAlarm
            ? `<span style="color:${ALARM_HIGH}">告警中</span>`
            : '正常'
          const humTag = point.humAlarm
            ? `<span style="color:${ALARM_HIGH}">告警中</span>`
            : '正常'
          lines.push(
            `<div style="margin-top:4px"><b>${meta.name}</b>${refTag}</div>` +
              `<div><span style="color:${TEMP_COLOR}">●</span> 温度：${point.temperature}°C (${tempTag})</div>` +
              `<div><span style="color:${HUM_COLOR}">●</span> 湿度：${point.humidity}% (${humTag})</div>`
          )
        })
        return `<div style="font-size:12px;line-height:1.6;max-width:320px">${lines.join('')}</div>`
      }
    },
    legend: {
      type: 'scroll',
      data: legendData,
      top: '2%',
      textStyle: { color: '#E4E7ED', fontSize: 12 }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: times,
      axisLine: { lineStyle: { color: '#606266' } },
      axisLabel: { color: '#909399' }
    },
    yAxis: [
      {
        type: 'value',
        name: '温度(°C)',
        position: 'left',
        axisLine: { lineStyle: { color: TEMP_COLOR } },
        axisLabel: { color: '#909399', formatter: '{value}°C' },
        splitLine: { lineStyle: { color: '#303133', type: 'dashed' } }
      },
      {
        type: 'value',
        name: '湿度(%)',
        position: 'right',
        axisLine: { lineStyle: { color: HUM_COLOR } },
        axisLabel: { color: '#909399', formatter: '{value}%' },
        splitLine: { show: false }
      }
    ],
    series
  }
}

const renderChart = () => {
  if (!chartInstance) return
  const option = buildOption()
  if (option) chartInstance.setOption(option, { notMerge: false })
}

const handleResize = () => chartInstance?.resize()

// 监听的变更源：所选设备集合、各设备历史长度、阈值、各设备活跃告警（影响参考线设备选择）
const watchSource = () => {
  const ids = normalizedIds()
  return [
    JSON.stringify(ids),
    ...ids.map((id) => state.devices[id]?.history.length ?? 0),
    JSON.stringify(ids.map((id) => state.thresholds[id])),
    // 活跃告警变化会改变"最紧急设备"，从而移动参考线
    ids.map((id) => getDeviceActiveAlarms(id).map((a) => `${a.metric}:${a.level}`).join(','))
      .join('|')
  ].join('||')
}

onMounted(async () => {
  await nextTick()
  if (chartContainer.value) {
    chartInstance = echarts.init(chartContainer.value)
    renderChart()
    window.addEventListener('resize', handleResize)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => handleResize())
      resizeObserver.observe(chartContainer.value)
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (resizeObserver) resizeObserver.disconnect()
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})

watch(watchSource, () => renderChart(), { flush: 'post' })
</script>

<style scoped>
.trend-chart {
  width: 100%;
  height: 100%;
  min-height: 360px;
}
</style>
