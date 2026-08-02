<template>
  <el-dialog
    :model-value="modelValue"
    title="告警阈值设置"
    width="520px"
    class="threshold-dialog"
    @update:model-value="handleClose"
    @open="handleOpen"
  >
    <div class="threshold-device">
      <span class="field-label">目标设备</span>
      <el-select v-model="editingDevice" class="threshold-device-select" @change="loadForm">
        <el-option
          v-for="device in deviceList"
          :key="device.id"
          :label="device.name"
          :value="device.id"
        />
      </el-select>
    </div>

    <el-form label-width="90px" class="threshold-form">
      <el-form-item label="温度阈值">
        <el-input-number v-model="form.temperature.min" :min="-40" :max="120" :step="0.5" :controls="false" class="threshold-input" />
        <span class="range-separator">~</span>
        <el-input-number v-model="form.temperature.max" :min="-40" :max="120" :step="0.5" :controls="false" class="threshold-input" />
        <span class="unit-label">°C</span>
      </el-form-item>
      <el-form-item label="湿度阈值">
        <el-input-number v-model="form.humidity.min" :min="0" :max="100" :step="1" :controls="false" class="threshold-input" />
        <span class="range-separator">~</span>
        <el-input-number v-model="form.humidity.max" :min="0" :max="100" :step="1" :controls="false" class="threshold-input" />
        <span class="unit-label">%</span>
      </el-form-item>
    </el-form>

    <div class="threshold-tip">保存后立即生效并长期保存：趋势图参考线、越限判定、当前数值与告警记录将同步更新。</div>

    <template #footer>
      <el-button @click="handleClose">取消</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  deviceList,
  primaryDevice,
  thresholdMap,
  updateThresholds
} from '../store/monitorStore'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

// 正在编辑的设备（默认跟随主设备，可在弹窗内切换单独设置）
const editingDevice = ref(primaryDevice.value)

// 表单副本：编辑期间不动中枢数据，保存时才写回
const form = reactive({
  temperature: { min: 0, max: 0 },
  humidity: { min: 0, max: 0 }
})

// 从中枢载入当前设备生效阈值
const loadForm = () => {
  const current = thresholdMap[editingDevice.value]
  form.temperature.min = current.temperature.min
  form.temperature.max = current.temperature.max
  form.humidity.min = current.humidity.min
  form.humidity.max = current.humidity.max
}

// 弹窗打开时跟随主设备
const handleOpen = () => {
  editingDevice.value = primaryDevice.value
  loadForm()
}

// 保存阈值：写回中枢，各展示处随共享状态立即同步
const handleSave = () => {
  if (form.temperature.min >= form.temperature.max) {
    ElMessage.error('温度下限必须小于上限')
    return
  }
  if (form.humidity.min >= form.humidity.max) {
    ElMessage.error('湿度下限必须小于上限')
    return
  }
  updateThresholds(editingDevice.value, form)
  ElMessage.success('阈值已保存并立即生效')
  emit('update:modelValue', false)
}

const handleClose = () => {
  emit('update:modelValue', false)
}
</script>

<style scoped>
.threshold-device {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.field-label {
  font-size: 14px;
  color: #909399;
  letter-spacing: 1px;
}

.threshold-device-select {
  flex: 1;
}

.threshold-form {
  margin-top: 4px;
}

.threshold-input {
  width: 130px;
}

.range-separator {
  margin: 0 10px;
  color: #909399;
}

.unit-label {
  margin-left: 10px;
  color: #909399;
}

.threshold-tip {
  font-size: 12px;
  color: #606266;
  line-height: 1.6;
  padding: 10px 12px;
  background: rgba(64, 158, 255, 0.08);
  border: 1px solid rgba(64, 158, 255, 0.2);
  border-radius: 6px;
}
</style>
