<template>
  <div class="alarm-summary-bar">
    <span class="summary-title">未确认告警</span>
    <div
      v-for="device in deviceList"
      :key="device.id"
      class="summary-item"
    >
      <span class="device-dot" :style="{ backgroundColor: device.color }"></span>
      <span class="device-name">{{ device.name }}</span>
      <span class="device-count" :class="{ 'has-alarm': unconfirmedByDevice[device.id] > 0 }">
        {{ unconfirmedByDevice[device.id] }}
      </span>
    </div>
    <span class="summary-total">合计 {{ unconfirmedCount }} 条</span>
  </div>
</template>

<script setup>
import {
  deviceList,
  unconfirmedByDevice,
  unconfirmedCount
} from '../store/monitorStore'
</script>

<style scoped>
.alarm-summary-bar {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 10px 40px;
  background: rgba(30, 30, 30, 0.6);
  border-bottom: 1px solid rgba(64, 158, 255, 0.2);
}

.summary-title {
  font-size: 13px;
  color: #909399;
  letter-spacing: 1px;
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.device-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.device-name {
  font-size: 13px;
  color: #E4E7ED;
  letter-spacing: 1px;
}

.device-count {
  min-width: 24px;
  height: 20px;
  line-height: 20px;
  text-align: center;
  font-size: 12px;
  color: #67C23A;
  background: rgba(103, 194, 58, 0.12);
  border: 1px solid rgba(103, 194, 58, 0.4);
  border-radius: 10px;
  padding: 0 6px;
}

.device-count.has-alarm {
  color: #F56C6C;
  background: rgba(245, 108, 108, 0.12);
  border-color: rgba(245, 108, 108, 0.5);
  box-shadow: 0 0 8px rgba(245, 108, 108, 0.3);
}

.summary-total {
  margin-left: auto;
  font-size: 13px;
  color: #909399;
  letter-spacing: 1px;
}
</style>
