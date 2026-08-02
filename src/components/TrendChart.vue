<template>
  <el-card class="chart-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <span class="card-title">温湿度趋势图</span>
        <span class="card-subtitle">{{ chartSubtitle }}</span>
      </div>
    </template>
    <div ref="chartContainer" class="chart-container"></div>
  </el-card>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import {
  deviceList,
  selectedDevices,
  primaryDevice,
  referenceDevice,
  dataVersion,
  thresholdVersion,
  historyMap,
  thresholdMap,
  judgeReading,
  getDeviceName
} from '../store/monitorStore'

// 图表容器引用
const chartContainer = ref(null)
let chartInstance = null

// 多选时进入同图对比模式
const isCompareMode = computed(() => selectedDevices.value.length > 1)

// 卡片副标题：单选展示该设备生效阈值，对比模式展示参考线归属
const chartSubtitle = computed(() => {
  if (!isCompareMode.value) {
    const thresholds = thresholdMap[primaryDevice.value]
    return `${getDeviceName(primaryDevice.value)} · 温度阈值 ${thresholds.temperature.min}~${thresholds.temperature.max}°C · 湿度阈值 ${thresholds.humidity.min}~${thresholds.humidity.max}%`
  }
  return `对比模式 · 阈值参考线：${getDeviceName(referenceDevice.value)}`
})

// 系列元信息：tooltip 按 seriesIndex 反查设备与指标
let seriesMeta = []

// 构造系列数据：越限点用与告警引擎完全相同的判定函数标红，保证图上一致
const buildSeriesData = (deviceId, metric, history) =>
  history.map(reading => {
    const violated = judgeReading(deviceId, reading)
      .some(violation => violation.metric === metric)
    if (!violated) return reading[metric]

    return {
      value: reading[metric],
      symbol: 'circle',
      symbolSize: 9,
      itemStyle: {
        color: '#F56C6C',
        borderColor: '#FFE4E4',
        borderWidth: 1,
        shadowColor: 'rgba(245, 108, 108, 0.9)',
        shadowBlur: 10
      }
    }
  })

// 生效阈值的参考线
const buildThresholdMarkLine = (metricLabel, thresholds, unit, color) => ({
  silent: true,
  symbol: 'none',
  lineStyle: {
    color,
    type: 'dashed',
    width: 1.5
  },
  label: {
    color,
    fontSize: 11,
    position: 'insideEndTop',
    formatter: (params) => `${metricLabel}${params.name === 'max' ? '上限' : '下限'} ${params.value}${unit}`
  },
  data: [
    { name: 'max', yAxis: thresholds.max },
    { name: 'min', yAxis: thresholds.min }
  ]
})

const buildAreaStyle = (color) => ({
  opacity: 1, // 显式给出：覆盖对比模式下合并残留的 opacity: 0
  color: {
    type: 'linear',
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: color.replace('ALPHA', '0.3') },
      { offset: 1, color: color.replace('ALPHA', '0.05') }
    ]
  }
})

// 构造系列：单选保持温度蓝/湿度绿；对比模式每台设备一对温湿度曲线，按设备配色、温度实线湿度虚线
// 始终按 deviceList 固定顺序渲染全部系列位，未选中设备挂空数据：
// setOption 按索引合并时系列结构稳定，切换选择不会残留旧曲线
const buildSeries = () => {
  const series = []
  seriesMeta = []

  deviceList.forEach(device => {
    const deviceId = device.id
    const selected = selectedDevices.value.includes(deviceId)
    const history = selected ? (historyMap[deviceId] || []) : []

    const single = !isCompareMode.value
    const temperatureColor = single ? '#409EFF' : device.color
    const humidityColor = single ? '#67C23A' : device.color
    const deviceName = device.name
    const temperatureName = single ? '温度' : `${deviceName}·温度`
    const humidityName = single ? '湿度' : `${deviceName}·湿度`
    // 阈值参考线只画参考线设备（选中设备中告警最紧急的一台）
    // 其余设备显式挂空 markLine：setOption 按索引合并时省略该键会残留上一轮的参考线
    const isReference = selected && deviceId === referenceDevice.value
    const thresholds = thresholdMap[deviceId]
    const emptyMarkLine = { silent: true, symbol: 'none', data: [] }

    series.push({
      name: temperatureName,
      type: 'line',
      yAxisIndex: 0,
      data: buildSeriesData(deviceId, 'temperature', history),
      smooth: true,
      symbolSize: single ? 4 : 3,
      lineStyle: {
        color: temperatureColor,
        width: 2,
        type: 'solid'
      },
      itemStyle: {
        color: temperatureColor
      },
      // 显式给出 areaStyle / lineStyle.type：setOption 按索引合并时省略这些键会残留上一模式的样式
      areaStyle: single ? buildAreaStyle('rgba(64, 158, 255, ALPHA)') : { opacity: 0 },
      markLine: isReference
        ? buildThresholdMarkLine('温度', thresholds.temperature, '°C', '#F56C6C')
        : emptyMarkLine
    })
    seriesMeta.push({ deviceId, metric: 'temperature', selected })

    series.push({
      name: humidityName,
      type: 'line',
      yAxisIndex: 1,
      data: buildSeriesData(deviceId, 'humidity', history),
      smooth: true,
      symbolSize: single ? 4 : 3,
      lineStyle: {
        color: humidityColor,
        width: 2,
        type: single ? 'solid' : 'dashed'
      },
      itemStyle: {
        color: humidityColor
      },
      areaStyle: single ? buildAreaStyle('rgba(103, 194, 58, ALPHA)') : { opacity: 0 },
      markLine: isReference
        ? buildThresholdMarkLine('湿度', thresholds.humidity, '%', '#E6A23C')
        : emptyMarkLine
    })
    seriesMeta.push({ deviceId, metric: 'humidity', selected })
  })

  return series
}

// 更新图表数据
const updateChart = () => {
  if (!chartInstance) return

  const primaryHistory = historyMap[selectedDevices.value[0]] || []
  if (!primaryHistory.length) return

  const series = buildSeries()

  const option = {
    backgroundColor: 'transparent',
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      top: '12%',
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(50, 50, 50, 0.9)',
      borderColor: '#409EFF',
      borderWidth: 1,
      textStyle: {
        color: '#fff'
      },
      formatter: (params) => {
        if (!params.length) return ''
        const lines = [`<div style="margin-bottom:4px">${params[0].axisValue}</div>`]
        params.forEach(param => {
          const meta = seriesMeta[param.seriesIndex]
          if (!meta) return
          const reading = (historyMap[meta.deviceId] || [])[param.dataIndex]
          if (!reading) return
          const unit = meta.metric === 'temperature' ? '°C' : '%'
          const violation = judgeReading(meta.deviceId, reading)
            .find(item => item.metric === meta.metric)
          const valueText = violation
            ? `<span style="color:#F56C6C;font-weight:bold">${reading[meta.metric]}${unit}（越${violation.limitLabel}）</span>`
            : `${reading[meta.metric]}${unit}`
          lines.push(`${param.marker}${param.seriesName}：${valueText}`)
        })
        return lines.join('<br/>')
      }
    },
    legend: {
      data: series.filter((item, index) => seriesMeta[index].selected).map(item => item.name),
      top: '5%',
      textStyle: {
        color: '#E4E7ED'
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: primaryHistory.map(item => item.time),
      axisLine: {
        lineStyle: {
          color: '#606266'
        }
      },
      axisLabel: {
        color: '#909399'
      }
    },
    yAxis: [
      {
        type: 'value',
        name: '温度(°C)',
        position: 'left',
        axisLine: {
          lineStyle: {
            color: '#409EFF'
          }
        },
        axisLabel: {
          color: '#909399',
          formatter: '{value}°C'
        },
        splitLine: {
          lineStyle: {
            color: '#303133',
            type: 'dashed'
          }
        }
      },
      {
        type: 'value',
        name: '湿度(%)',
        position: 'right',
        axisLine: {
          lineStyle: {
            color: '#67C23A'
          }
        },
        axisLabel: {
          color: '#909399',
          formatter: '{value}%'
        },
        splitLine: {
          show: false
        }
      }
    ],
    series
  }

  chartInstance.setOption(option)
}

// 初始化图表
const initChart = () => {
  if (!chartContainer.value) return

  chartInstance = echarts.init(chartContainer.value)
  updateChart()
}

// 响应式调整
const handleResize = () => {
  chartInstance?.resize()
}

// 设备选择、每轮采集、阈值变更、最紧急告警设备变化都会驱动图表刷新（数据始终来自中枢，历史连续不重建）
watch([selectedDevices, dataVersion, thresholdVersion, referenceDevice], () => {
  updateChart()
})

// 组件挂载
onMounted(() => {
  nextTick(() => {
    initChart()
  })
  window.addEventListener('resize', handleResize)
})

// 组件卸载
onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
</script>

<style scoped>
.chart-card {
  height: 100%;
  background: rgba(30, 30, 30, 0.6);
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 8px;
}

.chart-card :deep(.el-card__header) {
  background: rgba(45, 45, 45, 0.8);
  border-bottom: 1px solid rgba(64, 158, 255, 0.3);
  padding: 15px 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: #E4E7ED;
  letter-spacing: 1px;
}

.card-subtitle {
  font-size: 13px;
  color: #909399;
  letter-spacing: 1px;
}

.chart-card :deep(.el-card__body) {
  padding: 20px;
  height: calc(100% - 60px);
}

.chart-container {
  width: 100%;
  height: 100%;
  min-height: 500px;
}

/* 响应式调整 */
@media (max-width: 1920px) {
  .chart-container {
    min-height: 400px;
  }
}
</style>
