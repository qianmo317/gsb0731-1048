<template>
  <div class="status-cards">
    <el-card
      v-for="metric in metrics"
      :key="metric.key"
      class="status-card"
      :class="{
        'is-alert': metric.active,
        'is-critical': metric.level === 'critical',
        'is-offline': offline
      }"
      shadow="hover"
    >
      <div class="status-content">
        <div class="status-icon" :style="{ color: offline ? '#909399' : metric.color }">
          <svg v-if="metric.key === 'temperature'" xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" :stroke="offline ? '#909399' : metric.color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"></path>
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" :stroke="offline ? '#909399' : metric.color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17.5 21H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
            <path d="M22 10l-3-3m0 3l3-3"></path>
          </svg>
        </div>
        <div class="status-info">
          <div class="status-label">
            当前{{ metric.name }}
            <el-tag v-if="offline" type="info" size="small" effect="dark" class="alert-tag">设备离线</el-tag>
            <el-tag v-else-if="metric.active" :type="metric.level === 'critical' ? 'danger' : 'warning'" size="small" effect="dark" class="alert-tag">
              {{ metric.directionText }}{{ metric.levelText }}
            </el-tag>
          </div>
          <div class="status-value" :style="{ color: offline ? '#909399' : (metric.active ? (metric.level === 'critical' ? '#F56C6C' : '#E6A23C') : metric.color) }">
            <template v-if="offline">--{{ metric.unit }}</template>
            <template v-else>{{ metric.value }}{{ metric.unit }}</template>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { store, getLatestReading, getDeviceThresholds, isDeviceOnline, METRIC_META } from '../store/monitorStore'
import { evaluateLevel, getActiveAlerts } from '../modules/alertEngine'

const props = defineProps({
  deviceId: { type: String, required: true }
})

const offline = computed(() => !isDeviceOnline(props.deviceId))

const metrics = computed(() => {
  const latest = getLatestReading(props.deviceId)
  const thresholds = getDeviceThresholds(props.deviceId)
  const activeAlerts = getActiveAlerts(props.deviceId)
  const validLatest = latest && latest.temperature != null

  return ['temperature', 'humidity'].map(key => {
    const meta = METRIC_META[key]
    const value = validLatest ? latest[key] : '--'
    let active = false
    let level = null
    let direction = null
    if (validLatest && thresholds) {
      const result = evaluateLevel(latest[key], thresholds[key])
      if (result.state !== 'normal') {
        active = true
        level = result.level
        direction = result.direction
      }
    }
    const alert = activeAlerts.find(a => a.metric === key)
    return {
      key,
      name: meta.name,
      unit: meta.unit,
      color: meta.color,
      value,
      active: !!alert,
      level: alert ? alert.level : level,
      direction: alert ? alert.direction : direction,
      directionText: alert ? (alert.direction === 'high' ? '超上限' : '低于下限') : '',
      levelText: alert ? (alert.level === 'critical' ? '严重' : '告警') : ''
    }
  })
})
</script>

<style scoped>
.status-cards {
  display: flex;
  gap: 20px;
  height: 100%;
}
.status-card {
  flex: 1;
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
.status-card.is-alert {
  border-color: #E6A23C;
  box-shadow: 0 0 15px rgba(230, 162, 60, 0.35);
  animation: pulse-warn 1.6s ease-in-out infinite;
}
.status-card.is-critical {
  border-color: #F56C6C;
  box-shadow: 0 0 18px rgba(245, 108, 108, 0.5);
  animation: pulse-crit 1s ease-in-out infinite;
}
.status-card.is-offline {
  border-color: #606266;
  opacity: 0.7;
  animation: none;
}
@keyframes pulse-warn {
  0%, 100% { box-shadow: 0 0 15px rgba(230, 162, 60, 0.35); }
  50% { box-shadow: 0 0 25px rgba(230, 162, 60, 0.7); }
}
@keyframes pulse-crit {
  0%, 100% { box-shadow: 0 0 18px rgba(245, 108, 108, 0.5); }
  50% { box-shadow: 0 0 30px rgba(245, 108, 108, 0.85); }
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
.status-icon { display: flex; align-items: center; justify-content: center; }
.status-info { display: flex; flex-direction: column; align-items: flex-start; }
.status-label {
  font-size: 14px;
  color: #909399;
  margin-bottom: 8px;
  letter-spacing: 1px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.alert-tag { transform: scale(0.85); transform-origin: left center; }
.status-value {
  font-size: 32px;
  font-weight: bold;
  letter-spacing: 2px;
}
</style>
