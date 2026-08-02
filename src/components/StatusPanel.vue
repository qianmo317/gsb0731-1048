<template>
  <el-row :gutter="20" class="status-row">
    <el-col :span="12">
      <el-card class="status-card temperature-card" :class="{ 'is-alarm': temperatureAlarm, 'is-offline': offline }" shadow="hover">
        <div class="status-content">
          <div class="status-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#F56C6C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"></path>
            </svg>
          </div>
          <div class="status-info">
            <div class="status-label">当前温度</div>
            <div class="status-value">{{ offline ? '离线' : `${temperature}°C` }}</div>
          </div>
        </div>
      </el-card>
    </el-col>
    <el-col :span="12">
      <el-card class="status-card humidity-card" :class="{ 'is-alarm': humidityAlarm, 'is-offline': offline }" shadow="hover">
        <div class="status-content">
          <div class="status-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#409EFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.5 21H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
              <path d="M22 10l-3-3m0 3l3-3"></path>
            </svg>
          </div>
          <div class="status-info">
            <div class="status-label">当前湿度</div>
            <div class="status-value">{{ offline ? '离线' : `${humidity}%` }}</div>
          </div>
        </div>
      </el-card>
    </el-col>
  </el-row>
</template>

<script setup>
defineProps({
  temperature: {
    type: [Number, String],
    default: 0
  },
  humidity: {
    type: [Number, String],
    default: 0
  },
  temperatureAlarm: {
    type: Boolean,
    default: false
  },
  humidityAlarm: {
    type: Boolean,
    default: false
  },
  offline: {
    type: Boolean,
    default: false
  }
})
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

/* 越限时卡片醒目高亮 */
.status-card.is-alarm {
  border-color: #F56C6C;
  box-shadow: 0 0 20px rgba(245, 108, 108, 0.6);
}

/* 离线时卡片置灰 */
.status-card.is-offline {
  border-color: #606266;
  box-shadow: none;
  opacity: 0.6;
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
  display: flex;
  align-items: center;
  justify-content: center;
}

.temperature-card .status-icon svg {
  stroke: #F56C6C;
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
</style>
