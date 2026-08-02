<template>
  <el-card class="alarm-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <span class="card-title">告警记录中心</span>
        <div class="filters">
          <el-select v-model="filterDevice" placeholder="全部设备" size="default" clearable class="filter-item">
            <el-option v-for="d in deviceList" :key="d.id" :label="d.name" :value="d.id" />
          </el-select>
          <el-select v-model="filterLevel" placeholder="全部级别" size="default" clearable class="filter-item">
            <el-option label="警告" value="warning" />
            <el-option label="严重" value="critical" />
          </el-select>
          <el-select v-model="filterAck" placeholder="全部确认状态" size="default" clearable class="filter-item">
            <el-option label="未确认" value="unacknowledged" />
            <el-option label="已确认" value="acknowledged" />
          </el-select>
        </div>
      </div>
      <div class="export-bar">
        <el-date-picker
          v-model="exportRange"
          type="datetimerange"
          size="default"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          value-format="x"
          class="export-range"
        />
        <el-button type="primary" size="default" :icon="Download" @click="handleExport">
          导出表格
        </el-button>
      </div>
    </template>

    <!-- 顶部各设备未确认告警数汇总 -->
    <div class="summary-row">
      <div
        v-for="d in deviceList"
        :key="d.id"
        class="summary-item"
        :class="{ 'has-pending': unackCounts[d.id] > 0 }"
      >
        <span class="summary-name">{{ d.name }}</span>
        <span class="summary-count">{{ unackCounts[d.id] || 0 }}</span>
        <span class="summary-label">未确认</span>
      </div>
    </div>

    <el-table :data="filteredRecords" height="320" class="alarm-table" empty-text="暂无告警记录">
      <el-table-column label="时间" width="170">
        <template #default="{ row }">{{ formatTime(row.triggeredAt) }}</template>
      </el-table-column>
      <el-table-column prop="deviceName" label="设备" width="90" />
      <el-table-column prop="type" label="类型" width="110" />
      <el-table-column label="数值" width="90">
        <template #default="{ row }">{{ row.value }}{{ row.unit }}</template>
      </el-table-column>
      <el-table-column label="级别" width="90">
        <template #default="{ row }">
          <el-tag :type="row.level === 'critical' ? 'danger' : 'warning'" size="small" effect="dark">
            {{ row.level === 'critical' ? '严重' : '警告' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="140">
        <template #default="{ row }">
          <el-tag v-if="row.status === 'active'" type="danger" size="small" effect="plain">进行中</el-tag>
          <el-tag v-else type="success" size="small" effect="plain">
            已恢复 {{ row.recoveredValue }}{{ row.unit }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="恢复时间" width="170">
        <template #default="{ row }">
          {{ row.recoveredAt ? formatTime(row.recoveredAt) : '—' }}
        </template>
      </el-table-column>
      <el-table-column label="确认" min-width="120">
        <template #default="{ row }">
          <el-tag v-if="row.acknowledged" type="info" size="small">已确认</el-tag>
          <el-button v-else type="primary" size="small" plain @click="$emit('acknowledge', row.id)">
            确认
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'

const props = defineProps({
  records: {
    type: Array,
    default: () => []
  },
  deviceList: {
    type: Array,
    default: () => []
  }
})

defineEmits(['acknowledge'])

const filterDevice = ref('')
const filterLevel = ref('')
const filterAck = ref('')
const exportRange = ref(null) // [开始时间戳, 结束时间戳]

const formatTime = (ts) =>
  new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

// 各设备未确认告警数汇总
const unackCounts = computed(() => {
  const counts = {}
  props.records.forEach((row) => {
    if (row.acknowledged) return
    counts[row.deviceId] = (counts[row.deviceId] || 0) + 1
  })
  return counts
})

// 按设备 / 级别 / 确认状态组合筛选，供集中查询
const filteredRecords = computed(() =>
  props.records.filter((row) => {
    if (filterDevice.value && row.deviceId !== filterDevice.value) return false
    if (filterLevel.value && row.level !== filterLevel.value) return false
    if (filterAck.value === 'unacknowledged' && row.acknowledged) return false
    if (filterAck.value === 'acknowledged' && !row.acknowledged) return false
    return true
  })
)

// 单条记录 -> 与页面展示一致的字段行
const toRow = (r) => ({
  时间: formatTime(r.triggeredAt),
  设备: r.deviceName,
  类型: r.type,
  数值: `${r.value}${r.unit}`,
  级别: r.level === 'critical' ? '严重' : '警告',
  状态: r.status === 'active' ? '进行中' : `已恢复 ${r.recoveredValue}${r.unit}`,
  恢复时间: r.recoveredAt ? formatTime(r.recoveredAt) : '',
  确认: r.acknowledged ? '已确认' : '未确认'
})

// CSV 字段转义
const escapeCsv = (val) => {
  const s = String(val ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

// 按时间范围导出为 CSV 表格文件，字段与页面展示一致
const handleExport = () => {
  let rows = props.records
  if (exportRange.value && exportRange.value.length === 2) {
    const [start, end] = exportRange.value.map(Number)
    rows = rows.filter((r) => r.triggeredAt >= start && r.triggeredAt <= end)
  }
  if (rows.length === 0) {
    ElMessage.warning('所选时间范围内没有告警记录')
    return
  }
  const headers = ['时间', '设备', '类型', '数值', '级别', '状态', '恢复时间', '确认']
  const lines = [headers.join(',')]
  rows.forEach((r) => {
    const row = toRow(r)
    lines.push(headers.map((h) => escapeCsv(row[h])).join(','))
  })
  // 加 BOM 保证 Excel 正确识别中文
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `告警记录_${formatFileStamp()}.csv`
  link.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${rows.length} 条告警记录`)
}

// 文件名时间戳
const formatFileStamp = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
</script>

<style scoped>
.alarm-card {
  background: rgba(30, 30, 30, 0.6);
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 8px;
}

.alarm-card :deep(.el-card__header) {
  background: rgba(45, 45, 45, 0.8);
  border-bottom: 1px solid rgba(64, 158, 255, 0.3);
  padding: 15px 20px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.card-title {
  font-size: 18px;
  font-weight: 600;
  color: #E4E7ED;
  letter-spacing: 1px;
}

.filters {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-item {
  width: 130px;
}

.filters :deep(.el-select__wrapper),
.filters :deep(.el-input__wrapper) {
  background-color: rgba(45, 45, 45, 0.9);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.3) inset;
}

.filters :deep(.el-select__placeholder) {
  color: #909399;
}

.filters :deep(.el-select__selected-item),
.filters :deep(.el-input__inner) {
  color: #E4E7ED;
}

.filters :deep(.el-select__caret) {
  color: #409EFF;
}

.export-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.export-range {
  width: 380px;
}

.export-bar :deep(.el-input__wrapper),
.export-bar :deep(.el-range-editor.el-input__wrapper) {
  background-color: rgba(45, 45, 45, 0.9);
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.3) inset;
}

.export-bar :deep(.el-range-input),
.export-bar :deep(.el-range-separator) {
  color: #E4E7ED;
}

.summary-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  padding: 0 4px 16px;
}

.summary-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  background: rgba(45, 45, 45, 0.6);
  border: 1px solid rgba(96, 98, 102, 0.3);
}

.summary-item.has-pending {
  border-color: #F56C6C;
  box-shadow: 0 0 12px rgba(245, 108, 108, 0.4);
}

.summary-name {
  font-size: 14px;
  color: #E4E7ED;
  letter-spacing: 1px;
}

.summary-count {
  font-size: 22px;
  font-weight: bold;
  color: #67C23A;
}

.summary-item.has-pending .summary-count {
  color: #F56C6C;
}

.summary-label {
  font-size: 12px;
  color: #909399;
}

.alarm-table {
  background: transparent;
}.alarm-table :deep(.el-table__inner-wrapper) {
  background: transparent;
}

.alarm-table :deep(.el-table__header th) {
  background-color: rgba(45, 45, 45, 0.9);
  color: #E4E7ED;
  border-bottom: 1px solid rgba(64, 158, 255, 0.3);
}

.alarm-table :deep(.el-table__body td) {
  background-color: rgba(30, 30, 30, 0.4);
  color: #E4E7ED;
  border-bottom: 1px solid rgba(96, 98, 102, 0.2);
}

.alarm-table :deep(.el-table__row:hover td) {
  background-color: rgba(64, 158, 255, 0.1) !important;
}

.alarm-table :deep(.el-table),
.alarm-table :deep(.el-table__body-wrapper) {
  background: transparent;
}

.alarm-table :deep(.el-table--border::after),
.alarm-table :deep(.el-table::before) {
  background-color: transparent;
}

.alarm-table :deep(.el-table__empty-block) {
  background: transparent;
}

.alarm-table :deep(.el-table__empty-text) {
  color: #909399;
}
</style>
