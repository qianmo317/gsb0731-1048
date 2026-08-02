<template>
  <el-card class="threshold-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <span class="card-title">告警阈值设置</span>
        <el-button text size="small" @click="onResetAll">全部重置</el-button>
      </div>
    </template>

    <div class="threshold-body">
      <div class="metric-block temp-block">
        <div class="metric-title">
          <span class="dot temp-dot"></span>
          <span>温度阈值 (°C)</span>
          <el-tag
            v-if="tempAlarm"
            :type="tempAlarm.level === 'critical' ? 'danger' : 'warning'"
            size="small"
            effect="dark"
          >
            {{ tempAlarm.level === 'critical' ? '严重' : '警告' }}
          </el-tag>
        </div>
        <div class="threshold-inputs">
          <el-input-number
            v-model="tempMin"
            :min="-50"
            :max="100"
            :precision="1"
            :step="0.5"
            controls-position="right"
            size="default"
            @change="onChange('temperature', 'min')"
          />
          <span class="range-sep">~</span>
          <el-input-number
            v-model="tempMax"
            :min="-50"
            :max="100"
            :precision="1"
            :step="0.5"
            controls-position="right"
            size="default"
            @change="onChange('temperature', 'max')"
          />
        </div>
        <div v-if="tempAlarm" class="alarm-tip">
          {{ tempAlarm.typeLabel }}，当前 {{ tempAlarm.value }}°C
        </div>
      </div>

      <el-divider class="block-divider" />

      <div class="metric-block hum-block">
        <div class="metric-title">
          <span class="dot hum-dot"></span>
          <span>湿度阈值 (%)</span>
          <el-tag
            v-if="humAlarm"
            :type="humAlarm.level === 'critical' ? 'danger' : 'warning'"
            size="small"
            effect="dark"
          >
            {{ humAlarm.level === 'critical' ? '严重' : '警告' }}
          </el-tag>
        </div>
        <div class="threshold-inputs">
          <el-input-number
            v-model="humMin"
            :min="0"
            :max="100"
            :precision="1"
            :step="1"
            controls-position="right"
            size="default"
            @change="onChange('humidity', 'min')"
          />
          <span class="range-sep">~</span>
          <el-input-number
            v-model="humMax"
            :min="0"
            :max="100"
            :precision="1"
            :step="1"
            controls-position="right"
            size="default"
            @change="onChange('humidity', 'max')"
          />
        </div>
        <div v-if="humAlarm" class="alarm-tip">
          {{ humAlarm.typeLabel }}，当前 {{ humAlarm.value }}%
        </div>
      </div>

      <div class="persist-tip">
        <el-icon><CircleCheckFilled /></el-icon>
        <span>阈值修改自动保存，刷新页面不丢失</span>
      </div>
    </div>
  </el-card>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheckFilled } from '@element-plus/icons-vue'
import { state, setThreshold, resetAllThresholds, validateThreshold } from '@/store'
import { getActiveAlarm } from '@/store/alarms'

const props = defineProps({
  deviceId: { type: String, required: true }
})

const tempMin = ref(0)
const tempMax = ref(0)
const humMin = ref(0)
const humMax = ref(0)

const tempAlarm = computed(() => getActiveAlarm(props.deviceId, 'temperature'))
const humAlarm = computed(() => getActiveAlarm(props.deviceId, 'humidity'))

const syncFromState = () => {
  const t = state.thresholds[props.deviceId]
  if (!t) return
  tempMin.value = t.temperature.min
  tempMax.value = t.temperature.max
  humMin.value = t.humidity.min
  humMax.value = t.humidity.max
}

watch(
  () => [props.deviceId, state.thresholds[props.deviceId]],
  () => syncFromState(),
  { immediate: true, deep: true }
)

const onChange = (metric, field) => {
  const min = metric === 'temperature' ? tempMin.value : humMin.value
  const max = metric === 'temperature' ? tempMax.value : humMax.value
  const check = validateThreshold(metric, min, max)
  if (!check.valid) {
    ElMessage.warning(check.message)
    syncFromState()
    return
  }
  const result = setThreshold(props.deviceId, metric, field, field === 'min' ? min : max)
  if (!result.valid) {
    ElMessage.warning(result.message)
    syncFromState()
  }
}

const onResetAll = () => {
  resetAllThresholds(props.deviceId)
  ElMessage.success('阈值已重置为默认值')
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
  color: #e4e7ed;
  letter-spacing: 1px;
}

.threshold-body {
  padding: 4px 0;
}

.metric-block {
  padding: 4px 0;
}

.metric-title {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #c0c4cc;
  font-size: 13px;
  margin-bottom: 10px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.temp-dot {
  background: #409eff;
  box-shadow: 0 0 8px rgba(64, 158, 255, 0.7);
}

.hum-dot {
  background: #67c23a;
  box-shadow: 0 0 8px rgba(103, 194, 58, 0.7);
}

.threshold-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.threshold-inputs :deep(.el-input-number) {
  flex: 1;
}

.threshold-inputs :deep(.el-input__wrapper) {
  background-color: rgba(45, 45, 45, 0.9);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.3) inset;
}

.threshold-inputs :deep(.el-input__inner) {
  color: #e4e7ed;
}

.range-sep {
  color: #606266;
}

.alarm-tip {
  margin-top: 8px;
  font-size: 12px;
  color: #f56c6c;
}

.block-divider {
  margin: 14px 0;
  border-color: rgba(64, 158, 255, 0.15);
}

.persist-tip {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #67c23a;
}
</style>
