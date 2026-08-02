<template>
  <div class="iot-monitor">
    <header class="app-header">
      <div class="header-brand">
        <span class="brand-dot"></span>
        <span class="brand-title">温湿度监控看板</span>
        <el-tag size="small" :type="store.collecting ? 'success' : 'info'" effect="dark" class="live-tag">
          <span class="live-dot"></span>{{ store.collecting ? '实时采集中' : '已停止' }}
        </el-tag>
      </div>
      <div class="device-selector">
        <el-select
          ref="deviceSelectRef"
          v-model="store.selectedDeviceIds"
          multiple
          collapse-tags
          collapse-tags-tooltip
          placeholder="请选择设备（可多选对比）"
          size="large"
          class="device-multi-select"
          @change="handleDeviceChange"
          @click.capture="handleSelectClick"
        >
          <el-option
            v-for="device in store.devices"
            :key="device.id"
            :label="device.name"
            :value="device.id"
          >
            <span class="device-option">
              <span class="option-dot" :style="{ background: device.tempColor }"></span>
              {{ device.name }}
              <el-tag
                v-if="unackedMap[device.id] > 0"
                size="small"
                type="danger"
                effect="dark"
                class="option-badge"
              >{{ unackedMap[device.id] }}</el-tag>
            </span>
          </el-option>
        </el-select>
      </div>
      <div class="header-time">
        <span class="time-label">最近采集</span>
        <span class="time-value">{{ lastCollectText }}</span>
      </div>
    </header>

    <!-- 各设备未确认告警数统计汇总 -->
    <div class="summary-bar">
      <div
        v-for="device in store.devices"
        :key="device.id"
        class="summary-chip"
        :class="{
          'is-active': store.selectedDeviceIds.includes(device.id),
          'is-critical': severityMap[device.id] === 'critical',
          'is-warning': severityMap[device.id] === 'warning',
          'is-offline': isOffline(device.id)
        }"
        @click="toggleDevice(device.id)"
      >
        <span class="summary-name">
          <span class="option-dot" :style="{ background: isOffline(device.id) ? '#909399' : device.tempColor }"></span>
          {{ device.name }}
        </span>
        <span v-if="isOffline(device.id)" class="summary-offline">离线 {{ remainingSec(device.id) }}s</span>
        <template v-else>
          <span class="summary-count">{{ unackedMap[device.id] }}</span>
          <span class="summary-label">未确认</span>
        </template>
      </div>
      <div class="summary-hint">
        <template v-if="store.selectedDeviceIds.length > 1">
          同图对比中 · 阈值参考线与配置面板聚焦：<b>{{ focusDeviceName }}</b>
        </template>
        <template v-else>单设备视图 · 点击上方设备或汇总卡片可加入对比</template>
      </div>
    </div>

    <main class="app-body">
      <section class="upper-row">
        <el-card class="panel chart-panel" shadow="hover">
          <template #header>
            <div class="panel-header">
              <span class="panel-title">温湿度趋势图</span>
              <span class="panel-sub">{{ chartSubtitle }}</span>
            </div>
          </template>
          <div class="chart-wrap">
            <TrendChart :device-ids="store.selectedDeviceIds" />
          </div>
        </el-card>

        <div class="side-col">
          <ThresholdPanel :device-id="focusDeviceId" />
        </div>
      </section>

      <section class="status-row">
        <StatusCards :device-id="focusDeviceId" />
        <el-card class="control-card" shadow="hover">
          <div class="control-content">
            <template v-if="focusOffline">
              <div class="offline-indicator">
                <span class="offline-spinner"></span>
                <span class="offline-text">重启中 · 离线</span>
              </div>
              <div class="offline-countdown">{{ focusRemainingSec }}<small>s</small></div>
              <div class="control-hint">{{ focusDeviceName }} 即将自动恢复</div>
            </template>
            <template v-else>
              <el-button
                type="danger"
                size="large"
                :icon="Refresh"
                class="restart-btn"
                @click="handleRestart"
              >
                设备重启
              </el-button>
              <div class="control-hint">{{ focusDeviceName }}</div>
            </template>
          </div>
        </el-card>
      </section>

      <section class="alert-row">
        <AlertCenter />
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { store, getDevice, getOfflineRemainingSec, isDeviceOnline } from './store/monitorStore'
import { startCollector, stopCollector, restartDevice } from './modules/dataCollector'
import { loadThresholds } from './modules/thresholdManager'
import { loadAlerts } from './modules/alertManager'
import { getMostUrgentDeviceId, getDeviceMaxSeverity, getUnacknowledgedCount } from './modules/alertEngine'
import TrendChart from './components/TrendChart.vue'
import ThresholdPanel from './components/ThresholdPanel.vue'
import StatusCards from './components/StatusCards.vue'
import AlertCenter from './components/AlertCenter.vue'

const lastCollectText = computed(() => {
  if (!store.lastCollectAt) return '—'
  return new Date(store.lastCollectAt).toLocaleTimeString('zh-CN', { hour12: false })
})

const deviceSelectRef = ref(null)

function handleSelectClick(e) {
  const closeBtn = e.target.closest('.el-tag__close')
  if (closeBtn) return
  const tag = e.target.closest('.el-select__selected-item, .el-tag')
  if (!tag) return
  const inst = deviceSelectRef.value
  if (!inst) return
  e.stopPropagation()
  if (typeof inst.toggleMenu === 'function') {
    inst.toggleMenu()
  } else if (typeof inst.handleOpen === 'function') {
    inst.handleOpen()
  }
}

// 焦点设备：多选时为告警最紧急的一台，单设备时即该台
const focusDeviceId = computed(() => getMostUrgentDeviceId(store.selectedDeviceIds))

const focusDeviceName = computed(() => {
  const d = getDevice(focusDeviceId.value)
  return d ? d.name : ''
})

const chartSubtitle = computed(() => {
  if (store.selectedDeviceIds.length > 1) {
    const names = store.selectedDeviceIds.map(id => {
      const d = getDevice(id)
      return d ? d.name : id
    }).join(' / ')
    return `${names} 对比 · 阈值参考线：${focusDeviceName.value}`
  }
  return `${focusDeviceName.value} · 阈值参考线与越限标记`
})

// 各设备未确认告警数
const unackedMap = computed(() => {
  const map = {}
  store.devices.forEach(d => {
    map[d.id] = getUnacknowledgedCount(d.id)
  })
  return map
})

// 各设备当前最高活动告警级别
const severityMap = computed(() => {
  const map = {}
  store.devices.forEach(d => {
    map[d.id] = getDeviceMaxSeverity(d.id)
  })
  return map
})

// 每秒刷新一次，用于离线倒计时等依赖当前时间的显示
const nowTick = ref(Date.now())
let tickTimer = null

// 焦点设备是否离线及剩余秒数（依赖 nowTick 以每秒刷新倒计时）
const focusOffline = computed(() => {
  nowTick.value
  return focusDeviceId.value ? !isDeviceOnline(focusDeviceId.value) : false
})
const focusRemainingSec = computed(() => {
  nowTick.value
  return focusDeviceId.value ? getOfflineRemainingSec(focusDeviceId.value) : 0
})

// 各设备是否离线（供汇总芯片显示）
function isOffline(id) {
  nowTick.value
  return !isDeviceOnline(id)
}
function remainingSec(id) {
  nowTick.value
  return getOfflineRemainingSec(id)
}

function toggleDevice(deviceId) {
  const idx = store.selectedDeviceIds.indexOf(deviceId)
  if (idx >= 0) {
    if (store.selectedDeviceIds.length === 1) {
      ElMessage.warning('至少保留一台设备')
      return
    }
    store.selectedDeviceIds.splice(idx, 1)
  } else {
    store.selectedDeviceIds.push(deviceId)
  }
}

function handleDeviceChange(val) {
  // 多选不允许清空，至少保留一台
  if (!val || val.length === 0) {
    ElMessage.warning('至少保留一台设备')
    store.selectedDeviceIds = [store.devices[0].id]
  }
}

const handleRestart = () => {
  if (focusOffline.value) {
    ElMessage.info(`${focusDeviceName.value} 正在重启中，剩余 ${focusRemainingSec.value} 秒后自动恢复`)
    return
  }
  ElMessageBox.confirm(
    `确定要重启${focusDeviceName.value}吗？确认后设备将离线约 1 分钟，期间曲线留空且不参与告警判定。`,
    '设备重启确认',
    {
      confirmButtonText: '确定重启',
      cancelButtonText: '取消',
      type: 'warning'
    }
  )
    .then(() => {
      restartDevice(focusDeviceId.value)
      ElMessage.success(`${focusDeviceName.value} 重启指令已下发，设备已离线，约 1 分钟后自动恢复`)
    })
    .catch(() => {})
}

onMounted(() => {
  // 先加载持久化的阈值与告警记录，再启动采集（采集会基于阈值做判定）
  loadThresholds()
  loadAlerts()
  startCollector()
  tickTimer = setInterval(() => { nowTick.value = Date.now() }, 1000)
})

onUnmounted(() => {
  stopCollector()
  if (tickTimer) clearInterval(tickTimer)
})
</script>

<style scoped>
.iot-monitor {
  width: 100vw;
  height: 100vh;
  background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* 顶部 */
.app-header {
  height: 72px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(30, 30, 30, 0.8);
  border-bottom: 2px solid #409EFF;
  padding: 0 32px;
  gap: 24px;
}
.header-brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 280px;
}
.brand-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #409EFF;
  box-shadow: 0 0 12px #409EFF;
}
.brand-title {
  font-size: 20px;
  font-weight: 700;
  color: #E4E7ED;
  letter-spacing: 2px;
}
.live-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #67C23A;
  box-shadow: 0 0 8px #67C23A;
}
.device-selector {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
}
.device-multi-select {
  width: 100%;
  max-width: 420px;
  cursor: pointer;
}
.device-multi-select :deep(.el-select__wrapper) {
  background: rgba(45, 45, 45, 0.9) !important;
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.4) inset !important;
  min-height: 40px;
  cursor: pointer;
}
.device-multi-select :deep(.el-select__wrapper:hover) {
  box-shadow: 0 0 0 1px #409EFF inset, 0 0 10px rgba(64, 158, 255, 0.3) !important;
}
.device-multi-select :deep(.el-select__selection) {
  flex-wrap: nowrap;
}
/* 保证输入区始终有可点击宽度，不会被已选标签完全遮挡导致下拉打不开 */
.device-multi-select :deep(.el-select__input) {
  min-width: 24px;
  flex: 1;
}
.device-multi-select :deep(.el-select__placeholder),
.device-multi-select :deep(.el-select__selected-item) {
  color: #E4E7ED;
  cursor: pointer;
}
.device-multi-select :deep(.el-select__suffix) {
  pointer-events: auto;
}
.device-multi-select :deep(.el-select__caret) {
  color: #409EFF;
}
.device-option {
  display: flex;
  align-items: center;
  gap: 8px;
}
.option-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}
.option-badge {
  margin-left: auto;
  transform: scale(0.85);
}
.header-time {
  min-width: 180px;
  text-align: right;
  display: flex;
  flex-direction: column;
}
.time-label {
  font-size: 12px;
  color: #909399;
  letter-spacing: 1px;
}
.time-value {
  font-size: 16px;
  color: #409EFF;
  font-weight: 600;
  font-family: 'Menlo', 'Consolas', monospace;
}

/* 未确认告警汇总行 */
.summary-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 32px;
  background: rgba(30, 30, 30, 0.6);
  border-bottom: 1px solid rgba(64, 158, 255, 0.2);
}
.summary-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 20px;
  background: rgba(45, 45, 45, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  transition: all 0.25s ease;
  user-select: none;
}
.summary-chip:hover {
  border-color: #409EFF;
  transform: translateY(-1px);
}
.summary-chip.is-active {
  border-color: #409EFF;
  box-shadow: 0 0 12px rgba(64, 158, 255, 0.35);
}
.summary-chip.is-warning {
  border-color: #E6A23C;
  box-shadow: 0 0 12px rgba(230, 162, 60, 0.4);
}
.summary-chip.is-critical {
  border-color: #F56C6C;
  box-shadow: 0 0 14px rgba(245, 108, 108, 0.55);
  animation: chip-pulse 1.2s ease-in-out infinite;
}
@keyframes chip-pulse {
  0%, 100% { box-shadow: 0 0 14px rgba(245, 108, 108, 0.45); }
  50% { box-shadow: 0 0 22px rgba(245, 108, 108, 0.8); }
}
.summary-chip.is-offline {
  border-color: #909399;
  background: rgba(144, 147, 153, 0.12);
  opacity: 0.85;
}
.summary-chip.is-offline .summary-name { color: #909399; }
.summary-offline {
  font-size: 13px;
  font-weight: 600;
  color: #C0C4CC;
  font-family: 'Menlo', 'Consolas', monospace;
}
.summary-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #E4E7ED;
}
.summary-count {
  font-size: 16px;
  font-weight: 700;
  color: #F56C6C;
  min-width: 18px;
  text-align: center;
}
.summary-chip.is-warning .summary-count { color: #E6A23C; }
.summary-label {
  font-size: 12px;
  color: #909399;
}
.summary-hint {
  margin-left: auto;
  font-size: 12px;
  color: #909399;
}
.summary-hint b { color: #409EFF; }

/* 主体 */
.app-body {
  flex: 1;
  min-height: 0;
  padding: 16px 32px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  overflow-x: hidden;
}
.upper-row {
  flex: 1.4;
  min-height: 380px;
  display: flex;
  gap: 16px;
}
.side-col {
  width: 360px;
  flex-shrink: 0;
  min-height: 0;
}
.chart-panel {
  flex: 1;
  min-width: 0;
}
.status-row {
  height: 120px;
  flex-shrink: 0;
  display: flex;
  gap: 16px;
}
.status-row > :deep(.status-cards) {
  flex: 1;
}
.control-card {
  width: 220px;
  flex-shrink: 0;
  background: rgba(45, 45, 45, 0.8);
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 8px;
}
.control-card :deep(.el-card__body) {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.control-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.control-hint {
  font-size: 13px;
  color: #909399;
}
.offline-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #909399;
  font-size: 14px;
  letter-spacing: 1px;
}
.offline-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(144, 147, 153, 0.3);
  border-top-color: #909399;
  border-radius: 50%;
  animation: offline-spin 1s linear infinite;
}
@keyframes offline-spin {
  to { transform: rotate(360deg); }
}
.offline-countdown {
  font-size: 30px;
  font-weight: 700;
  color: #909399;
  font-family: 'Menlo', 'Consolas', monospace;
}
.offline-countdown small {
  font-size: 14px;
  margin-left: 2px;
}
.restart-btn {
  width: 180px;
  height: 56px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 2px;
  background: linear-gradient(135deg, #F56C6C 0%, #E6A23C 100%);
  border: none;
  box-shadow: 0 4px 15px rgba(245, 108, 108, 0.4);
  transition: all 0.3s ease;
}
.restart-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(245, 108, 108, 0.6);
}
.alert-row {
  flex: 1;
  min-height: 220px;
  display: flex;
}
.alert-row > :deep(.alert-card) {
  flex: 1;
}

/* 面板通用样式 */
.panel {
  background: rgba(30, 30, 30, 0.6);
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}
.panel :deep(.el-card__header) {
  background: rgba(45, 45, 45, 0.8);
  border-bottom: 1px solid rgba(64, 158, 255, 0.3);
  padding: 12px 16px;
}
.panel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.panel-title {
  font-size: 16px;
  font-weight: 600;
  color: #E4E7ED;
  letter-spacing: 1px;
}
.panel-sub {
  font-size: 12px;
  color: #909399;
}
.chart-panel :deep(.el-card__body) {
  padding: 12px;
  flex: 1;
  min-height: 0;
}
.chart-wrap {
  width: 100%;
  height: 100%;
}

@media (max-width: 1440px) {
  .side-col { width: 320px; }
  .header-brand { min-width: 240px; }
}
@media (max-width: 900px) {
  .app-header { padding: 0 16px; gap: 12px; }
  .header-brand { min-width: 0; }
  .brand-title { font-size: 16px; letter-spacing: 1px; }
  .header-time { display: none; }
  .live-tag { display: none; }
  .app-body { padding: 12px 16px; }
  .summary-bar { padding: 10px 16px; flex-wrap: wrap; }
  .summary-hint { width: 100%; margin-left: 0; }
}
</style>
