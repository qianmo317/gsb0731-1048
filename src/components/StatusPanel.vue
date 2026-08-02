<template>
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
            <div class="status-label">
              当前温度
              <el-tag v-if="deviceOffline" type="info" size="small" effect="dark" class="violation-tag">离线</el-tag>
              <el-tag v-else-if="temperatureViolation" type="danger" size="small" effect="dark" class="violation-tag">越限</el-tag>
            </div>
            <div class="status-value" :class="{ 'value-violation': !deviceOffline && temperatureViolation, 'value-offline': deviceOffline }">
              {{ deviceOffline ? '离线' : `${displayTemperature}°C` }}
            </div>
            <div class="status-threshold">
              {{ deviceOffline ? '离线中 · 暂停采集与告警判定' : `${primaryDeviceName} · 阈值 ${currentThresholds.temperature.min} ~ ${currentThresholds.temperature.max}°C` }}
            </div>
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
            <div class="status-label">
              当前湿度
              <el-tag v-if="deviceOffline" type="info" size="small" effect="dark" class="violation-tag">离线</el-tag>
              <el-tag v-else-if="humidityViolation" type="danger" size="small" effect="dark" class="violation-tag">越限</el-tag>
            </div>
            <div class="status-value" :class="{ 'value-violation': !deviceOffline && humidityViolation, 'value-offline': deviceOffline }">
              {{ deviceOffline ? '离线' : `${displayHumidity}%` }}
            </div>
            <div class="status-threshold">
              {{ deviceOffline ? '离线中 · 暂停采集与告警判定' : `${primaryDeviceName} · 阈值 ${currentThresholds.humidity.min} ~ ${currentThresholds.humidity.max}%` }}
            </div>
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
            :disabled="deviceOffline"
            @click="handleRestart"
            class="restart-btn"
          >
            {{ deviceOffline ? '设备离线中' : '设备重启' }}
          </el-button>
        </div>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup>
import { computed } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import {
  primaryDevice,
  thresholdMap,
  offlineUntilMap,
  getLatestReading,
  judgeReading,
  getDeviceName,
  isDeviceOffline,
  restartDevice
} from '../store/monitorStore'

// 主设备最新读数与阈值（直接取中枢共享状态，多选时取第一台）
const latestReading = computed(() => getLatestReading(primaryDevice.value))
const currentThresholds = computed(() => thresholdMap[primaryDevice.value])
const primaryDeviceName = computed(() => getDeviceName(primaryDevice.value))

// 主设备是否离线（依赖响应式 offlineUntilMap，复机时自动恢复显示）
const deviceOffline = computed(() =>
  Boolean(offlineUntilMap[primaryDevice.value]) && isDeviceOffline(primaryDevice.value)
)

// 与告警引擎共用同一判定函数，卡片越限状态与图上、记录中心保持一致
const currentViolations = computed(() =>
  latestReading.value ? judgeReading(primaryDevice.value, latestReading.value) : []
)
const temperatureViolation = computed(() =>
  currentViolations.value.some(violation => violation.metric === 'temperature')
)
const humidityViolation = computed(() =>
  currentViolations.value.some(violation => violation.metric === 'humidity')
)

const displayTemperature = computed(() =>
  latestReading.value ? latestReading.value.temperature : '--'
)
const displayHumidity = computed(() =>
  latestReading.value ? latestReading.value.humidity : '--'
)

// 设备重启处理：确认后设备离线约 1 分钟，期间暂停采集与告警判定，恢复后数据自动续上
const handleRestart = () => {
  ElMessageBox.confirm(
    `确定要重启${primaryDeviceName.value}吗？确认后设备将离线约 1 分钟，期间暂停采集与告警判定。`,
    '设备重启确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
      customClass: 'restart-dialog'
    }
  )
    .then(() => {
      restartDevice(primaryDevice.value)
      ElMessage.success(`${primaryDeviceName.value}已离线重启，预计 1 分钟后恢复采集`)
    })
    .catch(() => {
      // 用户取消操作
    })
}
</script>

<style scoped>
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
  display: flex;
  align-items: center;
  gap: 8px;
}

.violation-tag {
  letter-spacing: 0;
}

.status-value {
  font-size: 32px;
  font-weight: bold;
  color: #E4E7ED;
  letter-spacing: 2px;
}

.temperature-card .status-value {
  color: #409EFF;
}

.humidity-card .status-value {
  color: #67C23A;
}

.status-value.value-violation {
  color: #F56C6C;
  text-shadow: 0 0 14px rgba(245, 108, 108, 0.7);
}

.status-value.value-offline {
  color: #909399;
  text-shadow: none;
}

.restart-btn.is-disabled {
  opacity: 0.6;
}

.status-threshold {
  font-size: 12px;
  color: #606266;
  margin-top: 6px;
  letter-spacing: 1px;
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
</style>
