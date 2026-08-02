<template>
  <div class="iot-monitor">
    <el-container class="monitor-container">
      <!-- 顶部：标题 + 设备选择 + 告警入口 -->
      <el-header class="header-section">
        <div class="header-brand">
          <span class="brand-dot"></span>
          <span class="brand-title">IoT 温湿度监控看板</span>
          <span class="brand-sub">REAL-TIME MONITOR</span>
        </div>
        <DeviceSelector
          v-model="selectedDeviceIds"
          :device-list="deviceList"
          class="header-selector"
        />
        <div class="header-actions">
          <el-badge :value="activeAlarmCount" :hidden="activeAlarmCount === 0" :max="99" class="alarm-badge">
            <el-button
              type="primary"
              size="large"
              :icon="Bell"
              @click="alarmCenterVisible = true"
              class="alarm-btn"
            >
              告警中心
            </el-button>
          </el-badge>
        </div>
      </el-header>

      <!-- 中部：趋势图 + 阈值设置 -->
      <el-main class="main-section">
        <div class="main-grid">
          <el-card class="chart-card" shadow="hover">
            <template #header>
              <div class="card-header">
                <span class="card-title">
                  {{ chartTitle }}
                  <span class="card-sub">{{ chartSubtitle }}</span>
                </span>
                <div class="header-status">
                  <span class="live-dot"></span>
                  <span>实时采集中 · 每 2s</span>
                </div>
              </div>
            </template>
            <TrendChart :device-ids="selectedDeviceIds" />
          </el-card>

          <div class="side-panel">
            <ThresholdPanel :device-id="selectedDeviceId" />
          </div>
        </div>
      </el-main>

      <!-- 底部：当前数值与控制 -->
      <el-footer class="footer-section">
        <StatusCards
          :current-temperature="currentTemperature"
          :current-humidity="currentHumidity"
          :device-name="selectedDevice?.name"
          :device-location="selectedDevice?.location"
          :temp-alarm="activeTemperatureAlarm"
          :hum-alarm="activeHumidityAlarm"
          :online="primaryOnline"
          :offline-remaining="offlineRemaining"
          @restart="handleRestart"
        />
      </el-footer>
    </el-container>

    <AlarmCenter v-model="alarmCenterVisible" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Bell } from '@element-plus/icons-vue'
import DeviceSelector from '@/components/DeviceSelector.vue'
import TrendChart from '@/components/TrendChart.vue'
import ThresholdPanel from '@/components/ThresholdPanel.vue'
import StatusCards from '@/components/StatusCards.vue'
import AlarmCenter from '@/components/AlarmCenter.vue'
import { initMonitor, shutdownMonitor, useMonitor, getDeviceMeta } from '@/store'

// 系统初始化：单一可信数据源在挂载前完成装配
initMonitor()

const {
  deviceList,
  selectedDeviceIds,
  primaryDeviceId,
  primaryDevice,
  primaryOnline,
  offlineRemaining,
  currentTemperature,
  currentHumidity,
  activeAlarmCount,
  activeTemperatureAlarm,
  activeHumidityAlarm,
  restart
} = useMonitor()

// 阈值面板与状态卡面向主设备（告警最紧急者，无告警则为选中的第一台）
const selectedDeviceId = primaryDeviceId
const selectedDevice = primaryDevice

// 多设备对比时标题体现对比数量
const chartTitle = computed(() => {
  const count = selectedDeviceIds.value.length
  if (count <= 1) return `${primaryDevice.value?.name || ''} · 温湿度趋势`
  return `温湿度趋势对比（${count} 台设备）`
})
const chartSubtitle = computed(() => {
  if (selectedDeviceIds.value.length <= 1) return primaryDevice.value?.location || ''
  const names = selectedDeviceIds.value
    .map((id) => getDeviceMeta(id)?.name)
    .filter(Boolean)
    .join(' / ')
  return names
})

const alarmCenterVisible = ref(false)

const handleRestart = () => {
  if (!primaryOnline.value) return
  const name = selectedDevice.value?.name || '该设备'
  ElMessageBox.confirm(
    `确定要重启${name}吗？重启后设备将离线约 1 分钟，期间暂停采集、曲线留空。`,
    '设备重启确认',
    {
      confirmButtonText: '确定重启',
      cancelButtonText: '取消',
      type: 'warning',
      customClass: 'restart-dialog'
    }
  )
    .then(() => {
      const ok = restart()
      if (ok) ElMessage.success(`${name} 重启指令已发送，设备正在离线`)
    })
    .catch(() => {})
}

onMounted(() => {})

onUnmounted(() => {
  shutdownMonitor()
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

/* 顶部 */
.header-section {
  height: 72px !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 30, 30, 0.85);
  border-bottom: 2px solid #409eff;
  padding: 0 32px;
  gap: 24px;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 320px;
}

.brand-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #409eff;
  box-shadow: 0 0 12px rgba(64, 158, 255, 0.8);
}

.brand-title {
  font-size: 20px;
  font-weight: 700;
  color: #e4e7ed;
  letter-spacing: 2px;
}

.brand-sub {
  font-size: 11px;
  color: #606266;
  letter-spacing: 2px;
  margin-left: 6px;
}

.header-selector {
  flex: 1;
  display: flex;
  justify-content: center;
}

.header-actions {
  min-width: 320px;
  display: flex;
  justify-content: flex-end;
}

.alarm-btn {
  background: linear-gradient(135deg, #f56c6c 0%, #e6a23c 100%);
  border: none;
  box-shadow: 0 4px 14px rgba(245, 108, 108, 0.4);
}

/* 中部 */
.main-section {
  flex: 1;
  padding: 20px 32px;
  overflow: hidden;
}

.main-grid {
  display: flex;
  gap: 20px;
  height: 100%;
}

.chart-card {
  flex: 1;
  min-width: 0;
  background: rgba(30, 30, 30, 0.6);
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 8px;
}

.chart-card :deep(.el-card__header) {
  background: rgba(45, 45, 45, 0.8);
  border-bottom: 1px solid rgba(64, 158, 255, 0.3);
  padding: 12px 18px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #e4e7ed;
  letter-spacing: 1px;
}

.card-sub {
  font-size: 12px;
  color: #909399;
  margin-left: 10px;
  font-weight: 400;
}

.header-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #67c23a;
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #67c23a;
  box-shadow: 0 0 8px rgba(103, 194, 58, 0.8);
  animation: blink 1.4s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.chart-card :deep(.el-card__body) {
  padding: 14px;
  height: calc(100% - 56px);
}

.side-panel {
  width: 320px;
  flex-shrink: 0;
}

/* 底部 */
.footer-section {
  height: 160px !important;
  padding: 16px 32px;
  background: rgba(30, 30, 30, 0.85);
  border-top: 2px solid #409eff;
}

/* 确认对话框 */
:deep(.restart-dialog) {
  background-color: rgba(30, 30, 30, 0.95);
  border: 1px solid #409eff;
}

:deep(.restart-dialog .el-message-box__title) {
  color: #e4e7ed;
}

:deep(.restart-dialog .el-message-box__content) {
  color: #909399;
}
</style>
