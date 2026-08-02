<template>
  <el-card class="threshold-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <span class="card-title">告警阈值设置</span>
        <span class="card-subtitle">{{ deviceName }}</span>
      </div>
    </template>
    <div class="threshold-body">
      <div class="threshold-group temperature-group">
        <div class="group-title">温度 (°C)</div>
        <div class="range-row">
          <span class="range-label">下限</span>
          <el-input-number
            v-model="form.temperature.min"
            :step="0.5"
            :precision="1"
            controls-position="right"
            size="default"
            @change="emitChange"
          />
          <span class="range-label">上限</span>
          <el-input-number
            v-model="form.temperature.max"
            :step="0.5"
            :precision="1"
            controls-position="right"
            size="default"
            @change="emitChange"
          />
        </div>
      </div>
      <div class="threshold-group humidity-group">
        <div class="group-title">湿度 (%)</div>
        <div class="range-row">
          <span class="range-label">下限</span>
          <el-input-number
            v-model="form.humidity.min"
            :step="1"
            :precision="0"
            controls-position="right"
            size="default"
            @change="emitChange"
          />
          <span class="range-label">上限</span>
          <el-input-number
            v-model="form.humidity.max"
            :step="1"
            :precision="0"
            controls-position="right"
            size="default"
            @change="emitChange"
          />
        </div>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { reactive, watch } from 'vue'

const props = defineProps({
  deviceName: {
    type: String,
    default: ''
  },
  threshold: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['change'])

// 本地表单副本，跟随外部生效阈值同步（切换设备/外部改动时刷新）
const form = reactive({
  temperature: { min: 0, max: 0 },
  humidity: { min: 0, max: 0 }
})

const syncFromProps = () => {
  if (!props.threshold) return
  form.temperature.min = props.threshold.temperature.min
  form.temperature.max = props.threshold.temperature.max
  form.humidity.min = props.threshold.humidity.min
  form.humidity.max = props.threshold.humidity.max
}

watch(() => props.threshold, syncFromProps, { immediate: true, deep: true })

// 界面改动向上抛出，由单一数据源统一收口保存
const emitChange = () => {
  emit('change', {
    temperature: { min: form.temperature.min, max: form.temperature.max },
    humidity: { min: form.humidity.min, max: form.humidity.max }
  })
}
</script>

<style scoped>
.threshold-card {
  background: rgba(30, 30, 30, 0.6);
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 8px;
}

.threshold-card :deep(.el-card__header) {
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
  font-size: 14px;
  color: #409EFF;
  letter-spacing: 1px;
}

.threshold-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 8px 4px;
}

.group-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  letter-spacing: 1px;
}

.temperature-group .group-title {
  color: #409EFF;
}

.humidity-group .group-title {
  color: #67C23A;
}

.range-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.range-label {
  font-size: 13px;
  color: #909399;
}

.threshold-body :deep(.el-input-number) {
  width: 120px;
}

.threshold-body :deep(.el-input__wrapper) {
  background-color: rgba(45, 45, 45, 0.9);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.3) inset;
}

.threshold-body :deep(.el-input__inner) {
  color: #E4E7ED;
}
</style>
