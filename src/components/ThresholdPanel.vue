<template>
  <el-card class="threshold-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <span class="card-title">告警阈值配置</span>
        <el-tag size="small" type="info" effect="dark">{{ deviceName }}</el-tag>
      </div>
    </template>

    <div class="threshold-body">
      <div v-for="metric in metrics" :key="metric.key" class="metric-block">
        <div class="metric-title" :style="{ color: metric.color }">
          <span class="dot" :style="{ background: metric.color }"></span>
          {{ metric.name }}阈值（{{ metric.unit }}）
        </div>
        <div class="threshold-grid">
          <div v-for="field in fields" :key="field.key" class="field-item">
            <label class="field-label" :class="field.levelClass">{{ field.label }}</label>
            <el-input-number
              :model-value="thresholds[metric.key][field.key]"
              :step="0.5"
              :precision="1"
              :controls="false"
              size="small"
              class="field-input"
              :class="field.levelClass"
              @change="(val) => handleChange(metric.key, field.key, val)"
            />
          </div>
        </div>
      </div>

      <div class="threshold-actions">
        <el-button size="small" @click="handleReset('temperature')">重置温度</el-button>
        <el-button size="small" @click="handleReset('humidity')">重置湿度</el-button>
        <el-button size="small" type="primary" plain @click="handleResetAll">全部恢复默认</el-button>
      </div>
      <div class="threshold-tip">修改后立即生效，自动保存，刷新页面不丢失。</div>
    </div>
  </el-card>
</template>

<script setup>
import { computed } from 'vue'
import { ElMessage } from 'element-plus'
import { store, getDeviceThresholds, getDevice, METRIC_META, THRESHOLD_FIELDS } from '../store/monitorStore'
import { updateThreshold, resetThreshold, resetAllThresholds } from '../modules/thresholdManager'

const props = defineProps({
  deviceId: { type: String, required: true }
})

const metrics = [
  { key: 'temperature', name: METRIC_META.temperature.name, unit: METRIC_META.temperature.unit, color: METRIC_META.temperature.color },
  { key: 'humidity', name: METRIC_META.humidity.name, unit: METRIC_META.humidity.unit, color: METRIC_META.humidity.color }
]

const fields = [
  { key: 'lowCritical', label: '严重下限', levelClass: 'critical' },
  { key: 'lowWarning', label: '告警下限', levelClass: 'warning' },
  { key: 'highWarning', label: '告警上限', levelClass: 'warning' },
  { key: 'highCritical', label: '严重上限', levelClass: 'critical' }
]

const thresholds = computed(() => getDeviceThresholds(props.deviceId))
const deviceName = computed(() => {
  const d = getDevice(props.deviceId)
  return d ? d.name : props.deviceId
})

function handleChange(metric, field, value) {
  const ok = updateThreshold(props.deviceId, metric, field, value)
  if (!ok) {
    ElMessage.warning('阈值需满足：严重下限 < 告警下限 < 告警上限 < 严重上限')
  } else {
    ElMessage.success('阈值已更新并立即生效')
  }
}

function handleReset(metric) {
  resetThreshold(props.deviceId, metric)
  ElMessage.success('已恢复默认阈值')
}

function handleResetAll() {
  resetAllThresholds(props.deviceId)
  ElMessage.success('已全部恢复默认阈值')
}
</script>

<style scoped>
.threshold-card {
  height: 100%;
  background: rgba(30, 30, 30, 0.6);
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 8px;
}
.threshold-card :deep(.el-card__header) {
  background: rgba(45, 45, 45, 0.8);
  border-bottom: 1px solid rgba(64, 158, 255, 0.3);
  padding: 12px 16px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: #E4E7ED;
  letter-spacing: 1px;
}
.threshold-card :deep(.el-card__body) {
  padding: 16px;
  height: calc(100% - 54px);
  overflow-y: auto;
}
.threshold-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.metric-block {
  background: rgba(45, 45, 45, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 12px;
}
.metric-title {
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  letter-spacing: 0.5px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.threshold-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.field-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-label {
  font-size: 12px;
  color: #909399;
}
.field-label.critical { color: #F56C6C; }
.field-label.warning { color: #E6A23C; }
.field-input :deep(.el-input__wrapper) {
  background: rgba(30, 30, 30, 0.9);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}
.field-input.critical :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px rgba(245, 108, 108, 0.5) inset;
}
.field-input.warning :deep(.el-input__wrapper) {
  box-shadow: 0 0 0 1px rgba(230, 162, 60, 0.5) inset;
}
.field-input :deep(.el-input__inner) {
  color: #E4E7ED;
  text-align: center;
}
.threshold-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.threshold-tip {
  font-size: 12px;
  color: #606266;
  line-height: 1.5;
}
</style>
