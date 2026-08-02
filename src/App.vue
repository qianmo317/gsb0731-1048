<template>
  <div class="iot-monitor">
    <el-container class="monitor-container">
      <!-- 顶部设备选择区域 -->
      <el-header class="header-section">
        <div class="header-title">温湿度监控看板</div>
        <div class="device-selector">
          <el-select
            v-model="selectedDevices"
            placeholder="请选择设备"
            size="large"
            class="device-select"
            multiple
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="2"
            @change="handleDeviceChange"
          >
            <el-option
              v-for="device in deviceList"
              :key="device.id"
              :label="device.name"
              :value="device.id"
            />
          </el-select>
        </div>
        <div class="header-actions">
          <el-button :icon="Setting" @click="thresholdDialogVisible = true">阈值设置</el-button>
          <el-badge :value="activeAlarmCount" :hidden="activeAlarmCount === 0" :max="99" class="alarm-badge">
            <el-button :icon="Bell" @click="alarmDrawerVisible = true">告警中心</el-button>
          </el-badge>
        </div>
      </el-header>

      <!-- 各设备未确认告警统计汇总行 -->
      <AlarmSummaryBar />

      <!-- 中间图表区域 -->
      <el-main class="chart-section">
        <TrendChart />
      </el-main>

      <!-- 底部状态和控制区域 -->
      <el-footer class="footer-section">
        <StatusPanel />
      </el-footer>
    </el-container>

    <!-- 阈值设置弹窗 -->
    <ThresholdDialog v-model="thresholdDialogVisible" />

    <!-- 告警记录中心 -->
    <AlarmDrawer v-model="alarmDrawerVisible" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Setting, Bell } from '@element-plus/icons-vue'
import TrendChart from './components/TrendChart.vue'
import StatusPanel from './components/StatusPanel.vue'
import ThresholdDialog from './components/ThresholdDialog.vue'
import AlarmDrawer from './components/AlarmDrawer.vue'
import AlarmSummaryBar from './components/AlarmSummaryBar.vue'
import {
  deviceList,
  selectedDevices,
  activeAlarmCount,
  startCollector,
  stopCollector
} from './store/monitorStore'

// 弹窗与抽屉可见性
const thresholdDialogVisible = ref(false)
const alarmDrawerVisible = ref(false)

// 设备多选处理：至少保留一台设备，保证趋势图有展示对象
const handleDeviceChange = (values) => {
  if (!values || values.length === 0) {
    selectedDevices.value = [deviceList[0].id]
  }
}

// 组件挂载：启动采集
onMounted(() => {
  startCollector()
})

// 组件卸载：停止采集
onUnmounted(() => {
  stopCollector()
})
</script>

<style scoped>
.iot-monitor {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
  overflow: hidden;
}

.monitor-container {
  height: 100vh;
  background: transparent;
}

/* 顶部区域 */
.header-section {
  height: 80px !important;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 30, 30, 0.8);
  border-bottom: 2px solid #409EFF;
  padding: 0 40px;
}

.header-title {
  font-size: 20px;
  font-weight: 600;
  color: #E4E7ED;
  letter-spacing: 2px;
  white-space: nowrap;
}

.device-selector {
  width: 100%;
  max-width: 400px;
  margin: 0 24px;
}

.device-select {
  width: 100%;
}

.device-select :deep(.el-select__wrapper) {
  background-color: rgba(45, 45, 45, 0.9);
  border: 1px solid #409EFF;
  box-shadow: 0 0 10px rgba(64, 158, 255, 0.3);
}

.device-select :deep(.el-select__placeholder),
.device-select :deep(.el-select__selected-item) {
  color: #E4E7ED;
}

.device-select :deep(.el-select__caret) {
  color: #409EFF;
}

.device-select :deep(.el-select__tags) {
  background: transparent;
}

.device-select :deep(.el-tag) {
  background-color: rgba(64, 158, 255, 0.15);
  border-color: rgba(64, 158, 255, 0.5);
  color: #E4E7ED;
}

.device-select :deep(.el-tag .el-tag__close) {
  color: #909399;
}

.device-select :deep(.el-tag .el-tag__close:hover) {
  background-color: #409EFF;
  color: #fff;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  white-space: nowrap;
}

.alarm-badge :deep(.el-badge__content) {
  border: none;
}

/* 图表区域 */
.chart-section {
  flex: 1;
  padding: 30px 40px;
  overflow: hidden;
}

/* 底部区域 */
.footer-section {
  height: 200px !important;
  padding: 20px 40px;
  background: rgba(30, 30, 30, 0.8);
  border-top: 2px solid #409EFF;
}
</style>

<!-- 全局覆盖：teleport 到 body 的弹层组件不受 scoped 约束，统一在这里保持深色科技风 -->
<style>
/* Element Plus 下拉选项样式覆盖 */
.el-select-dropdown {
  background-color: rgba(45, 45, 45, 0.95);
  border: 1px solid #409EFF;
}

.el-select-dropdown__item {
  color: #E4E7ED;
}

.el-select-dropdown__item:hover {
  background-color: rgba(64, 158, 255, 0.2);
}

.el-select-dropdown__item.is-selected {
  color: #409EFF;
  background-color: rgba(64, 158, 255, 0.3);
}

.el-popper.is-light,
.el-select__popper.el-popper {
  background: rgba(45, 45, 45, 0.95);
  border: 1px solid #409EFF;
}

.el-popper.is-light .el-popper__arrow::before {
  background: rgba(45, 45, 45, 0.95);
  border-color: #409EFF;
}

/* 确认对话框样式 */
.restart-dialog {
  background-color: rgba(30, 30, 30, 0.95);
  border: 1px solid #409EFF;
}

.restart-dialog .el-message-box__title {
  color: #E4E7ED;
}

.restart-dialog .el-message-box__content {
  color: #909399;
}

/* 阈值设置弹窗样式 */
.threshold-dialog {
  background-color: rgba(30, 30, 30, 0.97);
  border: 1px solid #409EFF;
  border-radius: 8px;
}

.threshold-dialog .el-dialog__title {
  color: #E4E7ED;
  letter-spacing: 1px;
}

.threshold-dialog .el-dialog__headerbtn .el-dialog__close {
  color: #909399;
}

.threshold-dialog .el-form-item__label {
  color: #E4E7ED;
}

.threshold-dialog .el-input-number .el-input__wrapper {
  background-color: rgba(45, 45, 45, 0.9);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.4) inset;
}

.threshold-dialog .el-input-number .el-input__inner {
  color: #E4E7ED;
}

.threshold-dialog .el-select__wrapper {
  background-color: rgba(45, 45, 45, 0.9);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.4) inset;
}

.threshold-dialog .el-select__placeholder,
.threshold-dialog .el-select__selected-item {
  color: #E4E7ED;
}

/* 告警记录中心抽屉样式 */
.alarm-drawer {
  background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
  border-left: 1px solid rgba(64, 158, 255, 0.4);
}

.alarm-drawer .el-drawer__header {
  margin-bottom: 0;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(64, 158, 255, 0.3);
  color: #E4E7ED;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 1px;
}

.alarm-drawer .el-drawer__close-btn {
  color: #909399;
}

.alarm-drawer .el-drawer__body {
  padding: 16px 20px;
  overflow: hidden;
}

.alarm-drawer .el-select__wrapper {
  background-color: rgba(45, 45, 45, 0.9);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.35) inset;
}

.alarm-drawer .el-select__placeholder,
.alarm-drawer .el-select__selected-item {
  color: #E4E7ED;
}

.alarm-table {
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-header-bg-color: rgba(45, 45, 45, 0.9);
  --el-table-text-color: #E4E7ED;
  --el-table-header-text-color: #909399;
  --el-table-border-color: rgba(64, 158, 255, 0.18);
  --el-table-row-hover-bg-color: rgba(64, 158, 255, 0.1);
  --el-table-fixed-box-shadow: none;
  background: transparent;
}

.alarm-table .el-table__inner-wrapper::before {
  background-color: rgba(64, 158, 255, 0.18);
}

.alarm-empty .el-empty__description p {
  color: #909399;
}

/* 时间范围选择器深色覆盖 */
.alarm-drawer .el-date-editor {
  background-color: rgba(45, 45, 45, 0.9);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.35) inset;
}

.alarm-drawer .el-date-editor .el-range-input {
  background: transparent;
  color: #E4E7ED;
}

.alarm-drawer .el-date-editor .el-range-separator,
.alarm-drawer .el-date-editor .el-range__icon {
  color: #909399;
}

.el-picker-panel,
.el-date-range-picker,
.el-time-panel {
  background: rgba(45, 45, 45, 0.98);
  border-color: #409EFF;
  color: #E4E7ED;
}

.el-date-range-picker .el-date-range-picker__header div,
.el-date-range-picker .el-date-table th,
.el-date-range-picker .el-date-table td,
.el-picker-panel__icon-btn {
  color: #E4E7ED;
}

.el-date-table td.disabled div {
  background: transparent;
  color: #606266;
}

.el-date-table td.in-range div {
  background: rgba(64, 158, 255, 0.15);
}

.el-date-table td.in-range div:hover {
  background: rgba(64, 158, 255, 0.25);
}

.el-picker-panel__footer {
  background: rgba(45, 45, 45, 0.98);
  border-top-color: rgba(64, 158, 255, 0.3);
}

.el-time-panel {
  border-color: #409EFF;
}

.el-time-panel__content::before,
.el-time-panel__content::after {
  border-top-color: rgba(64, 158, 255, 0.3);
  border-bottom-color: rgba(64, 158, 255, 0.3);
}

.el-time-spinner__item {
  color: #E4E7ED;
}

.el-time-spinner__item.is-active:not(.is-disabled) {
  color: #409EFF;
}

.el-time-panel__footer {
  border-top-color: rgba(64, 158, 255, 0.3);
}
</style>
