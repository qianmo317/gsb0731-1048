<template>
  <div class="iot-monitor">
    <el-container class="monitor-container">
      <!-- 顶部设备选择区域 -->
      <el-header class="header-section">
        <DeviceSelector v-model="selectedDevices" :device-list="deviceList" />
      </el-header>

      <!-- 中间主体区域 -->
      <el-main class="main-section">
        <el-row :gutter="20" class="main-row">
          <!-- 左侧：趋势图 -->
          <el-col :span="16">
            <el-card class="chart-card" shadow="hover">
              <template #header>
                <div class="card-header">
                  <span class="card-title">温湿度趋势图</span>
                  <span v-if="isComparison" class="card-tip">
                    多设备对比 · 阈值参考线：{{ focusDeviceName }}
                  </span>
                </div>
              </template>
              <TrendChart
                :devices="chartDevices"
                :threshold="focusThreshold"
                :threshold-device-name="focusDeviceName"
              />
            </el-card>
          </el-col>
          <!-- 右侧：实时状态 + 阈值设置 -->
          <el-col :span="8">
            <div class="side-panel">
              <StatusPanel
                :temperature="focusReading.temperature"
                :humidity="focusReading.humidity"
                :temperature-alarm="temperatureAlarm"
                :humidity-alarm="humidityAlarm"
                :offline="focusOffline"
              />
              <ThresholdPanel
                :device-name="focusDeviceName"
                :threshold="focusThreshold"
                @change="handleThresholdChange"
              />
              <!-- 设备重启：确认后接真实离线逻辑 -->
              <el-button
                type="danger"
                size="large"
                :icon="Refresh"
                :disabled="focusOffline"
                class="restart-btn"
                @click="handleRestart"
              >
                {{ focusOffline ? `${focusDeviceName} 离线中…` : `重启 ${focusDeviceName}` }}
              </el-button>
            </div>
          </el-col>
        </el-row>

        <!-- 底部：告警记录中心 -->
        <div class="alarm-section">
          <AlarmCenter
            :records="alarmRecords"
            :device-list="deviceList"
            @acknowledge="acknowledge"
          />
        </div>
      </el-main>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import DeviceSelector from './components/DeviceSelector.vue'
import TrendChart from './components/TrendChart.vue'
import StatusPanel from './components/StatusPanel.vue'
import ThresholdPanel from './components/ThresholdPanel.vue'
import AlarmCenter from './components/AlarmCenter.vue'
import { useDeviceData } from './composables/useDeviceData'
import { useThresholds } from './composables/useThresholds'
import { useAlarms } from './composables/useAlarms'

// 从单一数据源取用采集、阈值、告警能力
const {
  deviceList,
  histories,
  latestReadings,
  deviceStatus,
  start: startCollect,
  stop: stopCollect,
  restart
} = useDeviceData()
const { getThreshold, setThreshold } = useThresholds()
const { alarmRecords, activeAlarms, acknowledge, mostUrgentDevice, start: startAlarms } = useAlarms()

// 当前选中的设备（支持多选）
const selectedDevices = ref([deviceList[0].id])

// 是否处于多设备对比模式
const isComparison = computed(() => selectedDevices.value.length > 1)

// 供趋势图对比的设备数据（每台带各自历史）
const chartDevices = computed(() =>
  selectedDevices.value.map((id) => ({
    id,
    name: deviceList.find((d) => d.id === id)?.name || '',
    history: histories[id] || []
  }))
)

// 焦点设备：选中设备里当前告警最紧急的一台，用于阈值线 / 状态卡 / 阈值面板
const focusDeviceId = computed(() => mostUrgentDevice(selectedDevices.value) || deviceList[0].id)
const focusDeviceName = computed(
  () => deviceList.find((d) => d.id === focusDeviceId.value)?.name || ''
)

// 焦点设备的实时读数与生效阈值，均直接来自单一数据源
const focusReading = computed(
  () => latestReadings[focusDeviceId.value] || { temperature: 0, humidity: 0 }
)
const focusThreshold = computed(() => getThreshold(focusDeviceId.value))

// 焦点设备各指标是否处于告警中，用于实时状态卡片高亮
const temperatureAlarm = computed(() => !!activeAlarms[`${focusDeviceId.value}-temperature`])
const humidityAlarm = computed(() => !!activeAlarms[`${focusDeviceId.value}-humidity`])

// 焦点设备是否离线
const focusOffline = computed(() => deviceStatus[focusDeviceId.value]?.online === false)

// 阈值改动：写回焦点设备，各处（图表参考线、判定、记录中心）随之同步
const handleThresholdChange = (next) => {
  setThreshold(focusDeviceId.value, next)
}

// 设备重启：确认后暂停采集并标记离线约一分钟
const handleRestart = () => {
  const id = focusDeviceId.value
  const name = focusDeviceName.value
  ElMessageBox.confirm(
    `确定要重启${name}吗？重启后设备将离线约一分钟，期间停止采集。`,
    '设备重启确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      customClass: 'restart-dialog'
    }
  )
    .then(() => {
      restart(id)
      ElMessage.success(`${name} 重启指令已发送，设备离线中`)
    })
    .catch(() => {
      // 用户取消操作
    })
}

onMounted(() => {
  startCollect()
  startAlarms()
})

onUnmounted(() => {
  stopCollect()
})
</script>

<style scoped>
.iot-monitor {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
  overflow: auto;
}

.monitor-container {
  min-height: 100vh;
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

/* 主体区域 */
.main-section {
  flex: 1;
  padding: 24px 40px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.main-row {
  align-items: stretch;
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

.card-tip {
  font-size: 13px;
  color: #409EFF;
  letter-spacing: 1px;
}

.chart-card :deep(.el-card__body) {
  padding: 20px;
  height: calc(100% - 60px);
}

.side-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
}

.side-panel :deep(.status-row) {
  height: 140px;
}

.alarm-section {
  width: 100%;
}

/* 设备重启按钮，沿用原深色科技风红色渐变 */
.restart-btn {
  width: 100%;
  height: 56px;
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

.restart-btn.is-disabled,
.restart-btn.is-disabled:hover {
  background: rgba(96, 98, 102, 0.6);
  box-shadow: none;
  transform: none;
}
</style>

<style>
/* 确认对话框样式（非 scoped，作用于 body 下挂载的弹窗） */
.restart-dialog {
  background-color: rgba(30, 30, 30, 0.95);
  border: 1px solid #409EFF;
}

.restart-dialog .el-message-box__title {
  color: #E4E7ED;
}

.restart-dialog .el-message-box__content {
  color: #909399;
}

/* el-select 下拉弹出层（teleport 到 body，需全局样式）——深色科技风 */
.el-select-dropdown {
  background-color: rgba(30, 30, 30, 0.98) !important;
  border: 1px solid rgba(64, 158, 255, 0.5) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6) !important;
}

/* 弹出层小箭头与背景同色 */
.el-popper.is-light.el-select__popper {
  background-color: rgba(30, 30, 30, 0.98);
  border: 1px solid rgba(64, 158, 255, 0.5);
}

.el-popper.is-light.el-select__popper .el-popper__arrow::before {
  background-color: rgba(30, 30, 30, 0.98) !important;
  border: 1px solid rgba(64, 158, 255, 0.5) !important;
}

/* 选项文字 */
.el-select-dropdown__item {
  color: #E4E7ED !important;
}

/* 悬停高亮 */
.el-select-dropdown__item.hover,
.el-select-dropdown__item:hover {
  background-color: rgba(64, 158, 255, 0.2) !important;
}

/* 选中高亮 */
.el-select-dropdown__item.selected {
  color: #409EFF !important;
  font-weight: 600;
  background-color: rgba(64, 158, 255, 0.28) !important;
}

/* 无匹配项提示文字 */
.el-select-dropdown__empty {
  color: #909399 !important;
}
</style>
