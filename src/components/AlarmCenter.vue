<template>
  <el-drawer
    v-model="visible"
    title="告警记录中心"
    direction="rtl"
    size="820px"
    class="alarm-drawer"
    :append-to-body="true"
  >
    <div class="alarm-center">
      <!-- 顶部统计 -->
      <div class="alarm-toolbar">
        <div class="stat-row">
          <div class="stat-item stat-active">
            <span class="stat-num">{{ stats.active }}</span>
            <span class="stat-label">告警中</span>
          </div>
          <div class="stat-item stat-unack">
            <span class="stat-num">{{ stats.unacknowledged }}</span>
            <span class="stat-label">未确认</span>
          </div>
          <div class="stat-item stat-recovered">
            <span class="stat-num">{{ stats.recovered }}</span>
            <span class="stat-label">已恢复</span>
          </div>
          <div class="stat-item stat-ack">
            <span class="stat-num">{{ stats.acknowledged }}</span>
            <span class="stat-label">已确认</span>
          </div>
        </div>

        <!-- 各设备未确认告警汇总 -->
        <div class="device-summary">
          <div
            v-for="item in deviceSummary"
            :key="item.deviceId"
            class="device-summary-item"
            :class="{ active: item.count > 0, selected: filters.deviceId === item.deviceId }"
            @click="toggleDeviceFilter(item.deviceId)"
          >
            <div class="ds-name">{{ item.deviceName }}</div>
            <div class="ds-location">{{ item.location }}</div>
            <div class="ds-count" :class="{ pulse: item.count > 0 }">
              {{ item.count }}
              <span class="ds-unit">未确认</span>
            </div>
          </div>
        </div>

        <el-form :inline="true" class="filter-form" @submit.prevent>
          <el-form-item label="设备">
            <el-select v-model="filters.deviceId" placeholder="全部设备" clearable style="width: 130px">
              <el-option v-for="d in deviceList" :key="d.id" :label="d.name" :value="d.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="类型">
            <el-select v-model="filters.metric" placeholder="全部类型" clearable style="width: 120px">
              <el-option label="温度" value="temperature" />
              <el-option label="湿度" value="humidity" />
            </el-select>
          </el-form-item>
          <el-form-item label="级别">
            <el-select v-model="filters.level" placeholder="全部级别" clearable style="width: 120px">
              <el-option label="严重" value="critical" />
              <el-option label="警告" value="warning" />
            </el-select>
          </el-form-item>
          <el-form-item label="确认">
            <el-select v-model="filters.acknowledged" placeholder="全部" clearable style="width: 120px">
              <el-option label="未确认" :value="false" />
              <el-option label="已确认" :value="true" />
            </el-select>
          </el-form-item>
          <el-form-item label="时间">
            <el-date-picker
              v-model="filters.timeRange"
              type="datetimerange"
              range-separator="至"
              start-placeholder="开始时间"
              end-placeholder="结束时间"
              format="MM-DD HH:mm"
              value-format="x"
              style="width: 340px"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="success" :icon="Download" @click="onExportCsv">导出CSV</el-button>
            <el-button type="primary" :icon="Check" @click="onAckAllFiltered">确认当前筛选</el-button>
            <el-button :icon="Delete" @click="onClearHistory">清空已处理</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 告警表格 -->
      <el-table
        :data="pagedList"
        class="alarm-table"
        height="100%"
        stripe
        :row-class-name="rowClassName"
      >
        <el-table-column label="时间" width="170">
          <template #default="{ row }">
            <div class="time-cell">{{ formatTime(row.startTime) }}</div>
            <div v-if="row.endTime" class="time-sub">恢复 {{ formatTime(row.endTime) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="设备" width="120">
          <template #default="{ row }">
            <div class="device-cell">{{ row.deviceName }}</div>
            <div class="device-sub">{{ row.location }}</div>
          </template>
        </el-table-column>
        <el-table-column label="类型" prop="typeLabel" width="150" />
        <el-table-column label="数值" width="130">
          <template #default="{ row }">
            <span :style="{ color: levelColor(row.level), fontWeight: 600 }">
              {{ row.value }}{{ row.unit }}
            </span>
            <span class="threshold-tip"> / {{ row.threshold }}{{ row.unit }}</span>
          </template>
        </el-table-column>
        <el-table-column label="级别" width="90">
          <template #default="{ row }">
            <el-tag :type="row.level === 'critical' ? 'danger' : 'warning'" effect="dark" size="small">
              {{ row.level === 'critical' ? '严重' : '警告' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="确认" width="90">
          <template #default="{ row }">
            <el-tag v-if="!isUnacknowledged(row)" type="info" effect="plain" size="small">已确认</el-tag>
            <el-tag v-else type="warning" effect="plain" size="small">未确认</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row)" effect="plain" size="small">
              {{ statusLabel(row) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="canAck(row)"
              type="primary"
              link
              size="small"
              @click="onAckOne(row)"
            >
              确认
            </el-button>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无告警记录" :image-size="80" />
        </template>
      </el-table>

      <!-- 分页 -->
      <div class="pager">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50]"
          :total="filteredList.length"
          layout="total, sizes, prev, pager, next, jumper"
          background
          size="small"
        />
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Check, Delete, Download } from '@element-plus/icons-vue'
import {
  state,
  DEVICES as deviceList,
  formatTime,
  acknowledgeAlarm,
  acknowledgeAll,
  clearAlarmHistory,
  getUnacknowledgedByDevice,
  isUnacknowledged,
  ALARM_LEVEL
} from '@/store'

const props = defineProps({
  modelValue: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const filters = ref({
  deviceId: '',
  metric: '',
  level: '',
  acknowledged: '',
  timeRange: null
})

const page = ref(1)
const pageSize = ref(10)

const applyFilters = (list) => {
  return list.filter((a) => {
    if (filters.value.deviceId && a.deviceId !== filters.value.deviceId) return false
    if (filters.value.metric && a.metric !== filters.value.metric) return false
    if (filters.value.level && a.level !== filters.value.level) return false
    if (filters.value.acknowledged === true && isUnacknowledged(a)) return false
    if (filters.value.acknowledged === false && !isUnacknowledged(a)) return false
    if (Array.isArray(filters.value.timeRange) && filters.value.timeRange.length === 2) {
      const [start, end] = filters.value.timeRange
      if (start && a.startTime < Number(start)) return false
      if (end && a.startTime > Number(end)) return false
    }
    return true
  })
}

const filteredList = computed(() => applyFilters(state.alarms))

const pagedList = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

// 顶部汇总统计
const stats = computed(() => {
  const s = { active: 0, recovered: 0, acknowledged: 0, unacknowledged: 0 }
  state.alarms.forEach((a) => {
    if (a.status === 'active') s.active += 1
    else if (a.status === 'recovered') s.recovered += 1
    else if (a.status === 'acknowledged') s.acknowledged += 1
    if (isUnacknowledged(a)) s.unacknowledged += 1
  })
  return s
})

// 各设备未确认告警数
const deviceSummary = computed(() => getUnacknowledgedByDevice())

watch(filteredList, () => {
  const maxPage = Math.max(1, Math.ceil(filteredList.value.length / pageSize.value))
  if (page.value > maxPage) page.value = maxPage
})

const toggleDeviceFilter = (deviceId) => {
  filters.value.deviceId = filters.value.deviceId === deviceId ? '' : deviceId
}

const rowClassName = ({ row }) => {
  if (row.status === 'active') return 'row-active'
  if (row.status === 'acknowledged') return 'row-acked'
  return 'row-recovered'
}

const levelColor = (level) => ALARM_LEVEL[level]?.color || '#E6A23C'

const statusType = (row) => {
  if (row.status === 'active') return row.level === 'critical' ? 'danger' : 'warning'
  if (row.status === 'recovered') return 'success'
  return 'info'
}

const statusLabel = (row) => {
  if (row.status === 'active') return '告警中'
  if (row.status === 'recovered') return '已恢复'
  if (row.status === 'acknowledged') return '已确认'
  return row.status
}

const canAck = (row) => isUnacknowledged(row)

const onAckOne = (row) => {
  acknowledgeAlarm(row.id)
  ElMessage.success('告警已确认')
}

const onAckAllFiltered = () => {
  const ids = new Set(filteredList.value.map((a) => a.id))
  acknowledgeAll((a) => ids.has(a.id))
  ElMessage.success(`已确认筛选结果中的 ${ids.size} 条告警`)
}

const onClearHistory = () => {
  ElMessageBox.confirm('将清除所有已恢复/已确认的历史记录，正在告警中的记录会保留。是否继续？', '清空确认', {
    confirmButtonText: '确定清空',
    cancelButtonText: '取消',
    type: 'warning'
  })
    .then(() => {
      clearAlarmHistory()
      ElMessage.success('已清空历史记录')
    })
    .catch(() => {})
}

// 导出当前筛选结果为 CSV（字段与页面展示一致），带 UTF-8 BOM 供 Excel 正确识别中文
const onExportCsv = () => {
  const list = filteredList.value
  if (list.length === 0) {
    ElMessage.warning('当前筛选条件下没有可导出的告警')
    return
  }
  const headers = ['开始时间', '恢复时间', '设备', '位置', '类型', '数值', '阈值', '级别', '状态']
  const rows = list.map((a) => [
    formatTime(a.startTime),
    a.endTime ? formatTime(a.endTime) : '',
    a.deviceName,
    a.location,
    a.typeLabel,
    `${a.value}${a.unit}`,
    `${a.threshold}${a.unit}`,
    a.level === 'critical' ? '严重' : '警告',
    statusLabel(a)
  ])
  const escape = (cell) => {
    const s = String(cell ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows]
    .map((row) => row.map(escape).join(','))
    .join('\r\n')
  const bom = '\uFEFF'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const stamp = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fname = `告警记录_${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}.csv`
  link.href = url
  link.download = fname
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${list.length} 条告警记录`)
}
</script>

<style scoped>
.alarm-center {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0 4px;
}

.alarm-toolbar {
  flex-shrink: 0;
}

.stat-row {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0;
  border-radius: 8px;
  background: rgba(45, 45, 45, 0.6);
  border: 1px solid rgba(64, 158, 255, 0.2);
}

.stat-num {
  font-size: 24px;
  font-weight: 700;
}

.stat-label {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.stat-active .stat-num {
  color: #f56c6c;
}
.stat-unack .stat-num {
  color: #e6a23c;
}
.stat-recovered .stat-num {
  color: #67c23a;
}
.stat-ack .stat-num {
  color: #909399;
}

/* 各设备未确认汇总 */
.device-summary {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}

.device-summary-item {
  flex: 1;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(45, 45, 45, 0.6);
  border: 1px solid rgba(64, 158, 255, 0.2);
  cursor: pointer;
  transition: all 0.2s ease;
}

.device-summary-item:hover {
  border-color: rgba(64, 158, 255, 0.6);
}

.device-summary-item.selected {
  border-color: #409eff;
  box-shadow: 0 0 12px rgba(64, 158, 255, 0.4);
}

.device-summary-item.active {
  border-color: rgba(245, 108, 108, 0.5);
}

.device-summary-item.selected.active {
  border-color: #f56c6c;
  box-shadow: 0 0 12px rgba(245, 108, 108, 0.4);
}

.ds-name {
  font-size: 14px;
  font-weight: 600;
  color: #e4e7ed;
}

.ds-location {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

.ds-count {
  margin-top: 8px;
  font-size: 22px;
  font-weight: 700;
  color: #606266;
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.ds-count.pulse {
  color: #f56c6c;
}

.ds-unit {
  font-size: 11px;
  font-weight: 400;
  color: #909399;
}

.filter-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
}

.filter-form :deep(.el-form-item) {
  margin-bottom: 10px;
  margin-right: 12px;
}

.alarm-table {
  flex: 1;
  min-height: 0;
}

.time-cell {
  color: #e4e7ed;
  font-size: 13px;
}

.time-sub {
  color: #67c23a;
  font-size: 11px;
  margin-top: 2px;
}

.device-cell {
  color: #e4e7ed;
}

.device-sub {
  color: #909399;
  font-size: 11px;
}

.threshold-tip {
  color: #909399;
  font-size: 12px;
}

.muted {
  color: #606266;
}

.pager {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  padding: 12px 0 4px;
}

:deep(.row-active) {
  background-color: rgba(245, 108, 108, 0.08) !important;
}
:deep(.row-recovered) {
  background-color: rgba(103, 194, 58, 0.05) !important;
}
:deep(.row-acked) {
  background-color: rgba(144, 147, 153, 0.05) !important;
}
</style>

<style>
.alarm-drawer .el-drawer__header {
  color: #e4e7ed;
  background: rgba(30, 30, 30, 0.95);
  border-bottom: 1px solid rgba(64, 158, 255, 0.3);
  margin-bottom: 0;
  padding: 16px 20px;
}
.alarm-drawer .el-drawer__body {
  background: rgba(24, 24, 24, 0.98);
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.alarm-drawer .el-drawer__header .el-drawer__title {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
  color: #e4e7ed;
}
.alarm-drawer .el-drawer__close-btn {
  color: #909399;
}

/* 深色主题下的表格与分页 */
.alarm-drawer .el-table {
  background-color: transparent;
  color: #c0c4cc;
  --el-table-border-color: rgba(64, 158, 255, 0.15);
  --el-table-header-bg-color: rgba(45, 45, 45, 0.9);
  --el-table-header-text-color: #e4e7ed;
  --el-table-row-hover-bg-color: rgba(64, 158, 255, 0.1);
  --el-table-bg-color: transparent;
  --el-table-tr-bg-color: transparent;
  --el-table-text-color: #c0c4cc;
}
.alarm-drawer .el-table th.el-table__cell {
  background-color: rgba(45, 45, 45, 0.9) !important;
  border-bottom: 1px solid rgba(64, 158, 255, 0.2);
}
.alarm-drawer .el-table td.el-table__cell,
.alarm-drawer .el-table th.el-table__cell.is-leaf {
  border-bottom: 1px solid rgba(64, 158, 255, 0.1);
}
.alarm-drawer .el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell {
  background-color: rgba(255, 255, 255, 0.02);
}
.alarm-drawer .el-table__body tr:hover > td.el-table__cell {
  background-color: rgba(64, 158, 255, 0.08) !important;
}
.alarm-drawer .el-table__empty-block {
  background-color: transparent;
}
.alarm-drawer .el-table__empty-text {
  color: #909399;
}
.alarm-drawer .el-pagination {
  --el-pagination-bg-color: transparent;
  --el-pagination-text-color: #c0c4cc;
  --el-pagination-button-color: #c0c4cc;
  --el-pagination-hover-color: #409eff;
  color: #c0c4cc;
}
.alarm-drawer .el-pagination button:disabled {
  color: #606266;
  background-color: transparent;
}
.alarm-drawer .el-pagination .el-pager li {
  background-color: transparent;
  color: #c0c4cc;
}
.alarm-drawer .el-pagination .el-pager li.is-active {
  color: #fff;
}
.alarm-drawer .el-pagination .el-select .el-input__wrapper {
  background-color: rgba(45, 45, 45, 0.9);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.3) inset;
}
.alarm-drawer .el-pagination .el-select .el-input__inner {
  color: #e4e7ed;
}
.alarm-drawer .el-empty__description p {
  color: #909399;
}
</style>
