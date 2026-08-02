<template>
  <div class="device-selector">
    <el-select
      :model-value="modelValue"
      multiple
      collapse-tags
      collapse-tags-tooltip
      placeholder="请选择一台或多台设备"
      size="large"
      class="device-select"
      popper-class="device-select-popper"
      @update:model-value="onChange"
    >
      <el-option
        v-for="device in deviceList"
        :key="device.id"
        :label="device.name"
        :value="device.id"
      >
        <div class="device-option">
          <span class="device-option-name">{{ device.name }}</span>
          <span class="device-option-location">{{ device.location }}</span>
        </div>
      </el-option>
    </el-select>
  </div>
</template>

<script setup>
import { ElMessage } from 'element-plus'

const props = defineProps({
  modelValue: { type: Array, required: true },
  deviceList: { type: Array, required: true }
})
const emit = defineEmits(['update:modelValue', 'change'])

const onChange = (value) => {
  // 至少保留一台设备，避免空选导致无数据可展示
  if (!value || value.length === 0) {
    ElMessage.warning('至少需要选择一台设备')
    return
  }
  emit('update:modelValue', value)
  emit('change', value)
}
</script>

<style scoped>
.device-selector {
  width: 100%;
  max-width: 460px;
}

.device-select {
  width: 100%;
}

.device-select :deep(.el-select__wrapper) {
  background-color: rgba(45, 45, 45, 0.9) !important;
  box-shadow: 0 0 0 1px #409eff inset, 0 0 10px rgba(64, 158, 255, 0.3) !important;
  border-radius: 4px;
}

.device-select :deep(.el-select__wrapper.is-hovering),
.device-select :deep(.el-select__wrapper.is-focused) {
  box-shadow: 0 0 0 1px #79bbff inset, 0 0 14px rgba(64, 158, 255, 0.5) !important;
}

.device-select :deep(.el-select__placeholder),
.device-select :deep(.el-select__selected-item) {
  color: #e4e7ed;
}

.device-select :deep(.el-select__caret) {
  color: #409eff;
}

.device-select :deep(.el-tag) {
  background-color: rgba(64, 158, 255, 0.2);
  border-color: rgba(64, 158, 255, 0.5);
  color: #e4e7ed;
}

.device-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.device-option-name {
  color: #e4e7ed;
  font-weight: 500;
}

.device-option-location {
  color: #909399;
  font-size: 12px;
}
</style>
