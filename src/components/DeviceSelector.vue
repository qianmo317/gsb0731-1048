<template>
  <div class="device-selector">
    <el-select
      :model-value="modelValue"
      placeholder="请选择设备"
      size="large"
      class="device-select"
      multiple
      collapse-tags
      collapse-tags-tooltip
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <el-option
        v-for="device in deviceList"
        :key="device.id"
        :label="device.name"
        :value="device.id"
      />
    </el-select>
  </div>
</template>

<script setup>
defineProps({
  modelValue: {
    type: Array,
    default: () => []
  },
  deviceList: {
    type: Array,
    default: () => []
  }
})

defineEmits(['update:modelValue'])
</script>

<style scoped>
.device-selector {
  width: 100%;
  max-width: 400px;
}

.device-select {
  width: 100%;
}

.device-select :deep(.el-select__wrapper) {
  background-color: rgba(45, 45, 45, 0.9);
  box-shadow: 0 0 0 1px #409EFF inset, 0 0 10px rgba(64, 158, 255, 0.3);
}

.device-select :deep(.el-select__placeholder) {
  color: #909399;
}

.device-select :deep(.el-select__input),
.device-select :deep(.el-input__inner) {
  color: #E4E7ED;
}

.device-select :deep(.el-select__caret) {
  color: #409EFF;
}

.device-select :deep(.el-tag) {
  background-color: rgba(64, 158, 255, 0.2);
  border-color: rgba(64, 158, 255, 0.5);
  color: #E4E7ED;
}

.device-select :deep(.el-tag .el-tag__close) {
  color: #E4E7ED;
}

.device-select :deep(.el-tag .el-tag__close:hover) {
  background-color: #409EFF;
  color: #fff;
}
</style>
