<template>
  <el-row :gutter="20" class="status-row">
    <el-col :span="8">
      <el-card
        class="status-card temperature-card"
        :class="{ alarm: !!tempAlarm, offline: !online }"
        shadow="hover"
      >
        <div class="status-content">
          <div class="status-icon temp-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"></path>
            </svg>
          </div>
          <div class="status-info">
            <div class="status-label">当前温度</div>
            <div class="status-value temp-value">
              <template v-if="online">{{ currentTemperature }}°C</template>
              <template v-else>
                <span class="offline-value">-- °C</span>
              </template>
            </div>
            <div v-if="online && tempAlarm" class="status-alarm">
              <el-tag :type="tempAlarm.level === 'critical' ? 'danger' : 'warning'" size="small" effect="dark">
                {{ tempAlarm.typeLabel }}
              </el-tag>
            </div>
          </div>
        </div>
      </el-card>
    </el-col>

    <el-col :span="8">
      <el-card
        class="status-card humidity-card"
        :class="{ alarm: !!humAlarm, offline: !online }"
        shadow="hover"
      >
        <div class="status-content">
          <div class="status-icon hum-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.5 21H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
              <path d="M22 10l-3-3m0 3l3-3"></path>
            </svg>
          </div>
          <div class="status-info">
            <div class="status-label">当前湿度</div>
            <div class="status-value hum-value">
              <template v-if="online">{{ currentHumidity }}%</template>
              <template v-else>
                <span class="offline-value">-- %</span>
              </template>
            </div>
            <div v-if="online && humAlarm" class="status-alarm">
              <el-tag :type="humAlarm.level === 'critical' ? 'danger' : 'warning'" size="small" effect="dark">
                {{ humAlarm.typeLabel }}
              </el-tag>
            </div>
          </div>
        </div>
      </el-card>
    </el-col>

    <el-col :span="8">
      <el-card class="status-card control-card" :class="{ offline: !online }" shadow="hover">
        <div class="status-content control-content">
          <div class="control-meta">
            <div class="device-name">
              {{ deviceName }}
              <el-tag v-if="!online" type="info" size="small" effect="dark" class="offline-tag">离线</el-tag>
            </div>
            <div class="device-location">
              <template v-if="online">{{ deviceLocation }}</template>
              <template v-else>重启中，预计 {{ offlineRemaining }} 秒后恢复</template>
            </div>
          </div>
          <el-button
            type="danger"
            size="large"
            :icon="Refresh"
            :loading="!online"
            :disabled="!online"
            @click="$emit('restart')"
            class="restart-btn"
          >
            {{ online ? '设备重启' : `重启中 ${offlineRemaining}s` }}
          </el-button>
        </div>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup>
import { Refresh } from '@element-plus/icons-vue'

defineProps({
  currentTemperature: { type: Number, default: 0 },
  currentHumidity: { type: Number, default: 0 },
  deviceName: { type: String, default: '' },
  deviceLocation: { type: String, default: '' },
  tempAlarm: { type: Object, default: null },
  humAlarm: { type: Object, default: null },
  online: { type: Boolean, default: true },
  offlineRemaining: { type: Number, default: 0 }
})

defineEmits(['restart'])
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
  transform: translateY(-2px);
}

.status-card.alarm {
  border-color: #f56c6c;
  box-shadow: 0 0 18px rgba(245, 108, 108, 0.45);
  animation: alarm-pulse 1.6s ease-in-out infinite;
}

.status-card.offline {
  border-color: #909399;
  opacity: 0.75;
}

@keyframes alarm-pulse {
  0%, 100% { box-shadow: 0 0 18px rgba(245, 108, 108, 0.45); }
  50% { box-shadow: 0 0 26px rgba(245, 108, 108, 0.75); }
}

.status-card :deep(.el-card__body) {
  padding: 18px 20px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-content {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 18px;
}

.control-content {
  justify-content: space-between;
}

.status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 12px;
}

.temp-icon {
  color: #409eff;
  background: rgba(64, 158, 255, 0.12);
}

.hum-icon {
  color: #67c23a;
  background: rgba(103, 194, 58, 0.12);
}

.status-info {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.status-label {
  font-size: 13px;
  color: #909399;
  margin-bottom: 6px;
  letter-spacing: 1px;
}

.status-value {
  font-size: 30px;
  font-weight: bold;
  letter-spacing: 2px;
}

.temp-value {
  color: #409eff;
}

.hum-value {
  color: #67c23a;
}

.offline-value {
  color: #909399;
  font-weight: 600;
}

.status-alarm {
  margin-top: 6px;
}

.control-meta {
  display: flex;
  flex-direction: column;
}

.device-name {
  font-size: 16px;
  font-weight: 600;
  color: #e4e7ed;
  display: flex;
  align-items: center;
  gap: 8px;
}

.offline-tag {
  letter-spacing: 1px;
}

.device-location {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.restart-btn {
  height: 48px;
  padding: 0 22px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 2px;
  background: linear-gradient(135deg, #f56c6c 0%, #e6a23c 100%);
  border: none;
  box-shadow: 0 4px 15px rgba(245, 108, 108, 0.4);
  transition: all 0.3s ease;
}

.restart-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 108, 108, 0.6);
}

.restart-btn:disabled,
.restart-btn:disabled:hover {
  transform: none;
  background: linear-gradient(135deg, #909399 0%, #606266 100%);
  box-shadow: none;
  cursor: not-allowed;
}
</style>
