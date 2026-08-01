<template>
  <div class="iot-monitor">
    <el-container class="monitor-container">
      <!-- 顶部设备选择区域 -->
      <el-header class="header-section">
        <div class="device-selector">
          <el-select
            v-model="selectedDevice"
            placeholder="请选择设备"
            size="large"
            class="device-select"
            @change="handleDeviceChange"
          >
            <el-option
              v-for="device in deviceList"
              :key="device.id"
              :label="device.name"
              :value="device.id"
            />
          </el-select>
        </div>
      </el-header>

      <!-- 中间图表区域 -->
      <el-main class="chart-section">
        <el-card class="chart-card" shadow="hover">
          <template #header>
            <div class="card-header">
              <span class="card-title">温湿度趋势图</span>
            </div>
          </template>
          <div ref="chartContainer" class="chart-container"></div>
        </el-card>
      </el-main>

      <!-- 底部状态和控制区域 -->
      <el-footer class="footer-section">
        <el-row :gutter="20" class="status-row">
          <el-col :span="8">
            <el-card class="status-card temperature-card" shadow="hover">
              <div class="status-content">
                <div class="status-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#F56C6C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"></path>
                  </svg>
                </div>
                <div class="status-info">
                  <div class="status-label">当前温度</div>
                  <div class="status-value">{{ currentTemperature }}°C</div>
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card class="status-card humidity-card" shadow="hover">
              <div class="status-content">
                <div class="status-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#409EFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17.5 21H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
                    <path d="M22 10l-3-3m0 3l3-3"></path>
                  </svg>
                </div>
                <div class="status-info">
                  <div class="status-label">当前湿度</div>
                  <div class="status-value">{{ currentHumidity }}%</div>
                </div>
              </div>
            </el-card>
          </el-col>
          <el-col :span="8">
            <el-card class="status-card control-card" shadow="hover">
              <div class="status-content">
                <el-button
                  type="danger"
                  size="large"
                  :icon="Refresh"
                  @click="handleRestart"
                  class="restart-btn"
                >
                  设备重启
                </el-button>
              </div>
            </el-card>
          </el-col>
        </el-row>
      </el-footer>
    </el-container>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import * as echarts from 'echarts'

// 设备列表
const deviceList = ref([
  { id: 'device1', name: '设备1' },
  { id: 'device2', name: '设备2' },
  { id: 'device3', name: '设备3' }
])

// 选中的设备
const selectedDevice = ref('device1')

// 图表容器引用
const chartContainer = ref(null)
let chartInstance = null

// 当前温湿度值
const currentTemperature = ref(0)
const currentHumidity = ref(0)

// 模拟数据生成函数
const generateMockData = (deviceId) => {
  const data = []
  const now = new Date()
  
  for (let i = 9; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60000) // 每分钟一条数据
    const temperature = 20 + Math.random() * 10 + (deviceId === 'device2' ? 2 : 0) + (deviceId === 'device3' ? -2 : 0)
    const humidity = 50 + Math.random() * 20 + (deviceId === 'device2' ? 5 : 0) + (deviceId === 'device3' ? -5 : 0)
    
    data.push({
      time: time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      temperature: parseFloat(temperature.toFixed(1)),
      humidity: parseFloat(humidity.toFixed(1))
    })
  }
  
  return data
}

// 初始化图表
const initChart = () => {
  if (!chartContainer.value) return
  
  chartInstance = echarts.init(chartContainer.value)
  updateChart()
  
  // 响应式调整
  window.addEventListener('resize', () => {
    chartInstance?.resize()
  })
}

// 更新图表数据
const updateChart = () => {
  if (!chartInstance) return
  
  const data = generateMockData(selectedDevice.value)
  
  // 更新当前值（最新一条数据）
  if (data.length > 0) {
    currentTemperature.value = data[data.length - 1].temperature
    currentHumidity.value = data[data.length - 1].humidity
  }
  
  const option = {
    backgroundColor: 'transparent',
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      top: '10%',
      containLabel: true
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(50, 50, 50, 0.9)',
      borderColor: '#409EFF',
      borderWidth: 1,
      textStyle: {
        color: '#fff'
      }
    },
    legend: {
      data: ['温度', '湿度'],
      top: '5%',
      textStyle: {
        color: '#E4E7ED'
      }
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map(item => item.time),
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
    series: [
      {
        name: '温度',
        type: 'line',
        yAxisIndex: 0,
        data: data.map(item => item.temperature),
        smooth: true,
        lineStyle: {
          color: '#409EFF',
          width: 2
        },
        itemStyle: {
          color: '#409EFF'
        },
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
        }
      },
      {
        name: '湿度',
        type: 'line',
        yAxisIndex: 1,
        data: data.map(item => item.humidity),
        smooth: true,
        lineStyle: {
          color: '#67C23A',
          width: 2
        },
        itemStyle: {
          color: '#67C23A'
        },
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
        }
      }
    ]
  }
  
  chartInstance.setOption(option)
}

// 设备切换处理
const handleDeviceChange = () => {
  updateChart()
}

// 设备重启处理
const handleRestart = () => {
  ElMessageBox.confirm(
    '确定要重启该设备吗？重启后设备将短暂离线。',
    '设备重启确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      customClass: 'restart-dialog'
    }
  )
    .then(() => {
      ElMessage.success('设备重启指令已发送')
      // 这里可以添加实际的重启逻辑
    })
    .catch(() => {
      // 用户取消操作
    })
}

// 监听设备变化
watch(selectedDevice, () => {
  updateChart()
})

// 组件挂载
onMounted(() => {
  nextTick(() => {
    initChart()
  })
})

// 组件卸载
onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
  window.removeEventListener('resize', () => {})
})
</script>

<style scoped>
.iot-monitor {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
  overflow: hidden;
}

.monitor-container {
  height: 100vh;
  background: transparent;
}

/* 顶部区域 */
.header-section {
  height: 80px !important;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(30, 30, 30, 0.8);
  border-bottom: 2px solid #409EFF;
  padding: 0 40px;
}

.device-selector {
  width: 100%;
  max-width: 400px;
}

.device-select {
  width: 100%;
}

.device-select :deep(.el-input__wrapper) {
  background-color: rgba(45, 45, 45, 0.9);
  border: 1px solid #409EFF;
  box-shadow: 0 0 10px rgba(64, 158, 255, 0.3);
}

.device-select :deep(.el-input__inner) {
  color: #E4E7ED;
}

.device-select :deep(.el-select__caret) {
  color: #409EFF;
}

/* 图表区域 */
.chart-section {
  flex: 1;
  padding: 30px 40px;
  overflow: hidden;
}

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

.chart-card :deep(.el-card__body) {
  padding: 20px;
  height: calc(100% - 60px);
}

.chart-container {
  width: 100%;
  height: 100%;
  min-height: 500px;
}

/* 底部区域 */
.footer-section {
  height: 180px !important;
  padding: 20px 40px;
  background: rgba(30, 30, 30, 0.8);
  border-top: 2px solid #409EFF;
}

.status-row {
  height: 100%;
}

.status-card {
  height: 100%;
  background: rgba(45, 45, 45, 0.8);
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 8px;
  transition: all 0.3s ease;
}

.status-card:hover {
  border-color: #409EFF;
  box-shadow: 0 0 20px rgba(64, 158, 255, 0.4);
  transform: translateY(-2px);
}

.status-card :deep(.el-card__body) {
  padding: 20px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-content {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  gap: 20px;
}

.status-icon {
  color: #409EFF;
  display: flex;
  align-items: center;
  justify-content: center;
}

.temperature-card .status-icon {
  color: #F56C6C;
}

.temperature-card .status-icon svg {
  stroke: #F56C6C;
}

.humidity-card .status-icon {
  color: #409EFF;
}

.humidity-card .status-icon svg {
  stroke: #409EFF;
}

.status-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.status-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
  letter-spacing: 1px;
}

.status-value {
  font-size: 32px;
  font-weight: bold;
  color: #E4E7ED;
  letter-spacing: 2px;
}

.temperature-card .status-value {
  color: #F56C6C;
}

.humidity-card .status-value {
  color: #409EFF;
}

.restart-btn {
  width: 100%;
  height: 60px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 2px;
  background: linear-gradient(135deg, #F56C6C 0%, #E6A23C 100%);
  border: none;
  box-shadow: 0 4px 15px rgba(245, 108, 108, 0.4);
  transition: all 0.3s ease;
}

.restart-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 108, 108, 0.6);
}

.restart-btn:active {
  transform: translateY(0);
}

/* 响应式调整 */
@media (max-width: 1920px) {
  .chart-container {
    min-height: 400px;
  }
}

/* Element Plus 下拉选项样式覆盖 */
:deep(.el-select-dropdown) {
  background-color: rgba(45, 45, 45, 0.95);
  border: 1px solid #409EFF;
}

:deep(.el-select-dropdown__item) {
  color: #E4E7ED;
}

:deep(.el-select-dropdown__item:hover) {
  background-color: rgba(64, 158, 255, 0.2);
}

:deep(.el-select-dropdown__item.selected) {
  color: #409EFF;
  background-color: rgba(64, 158, 255, 0.3);
}

/* 确认对话框样式 */
:deep(.restart-dialog) {
  background-color: rgba(30, 30, 30, 0.95);
  border: 1px solid #409EFF;
}

:deep(.restart-dialog .el-message-box__title) {
  color: #E4E7ED;
}

:deep(.restart-dialog .el-message-box__content) {
  color: #909399;
}
</style>
