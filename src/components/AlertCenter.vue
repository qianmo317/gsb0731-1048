<template>
  <el-card class="alert-card" shadow="hover">
    <template #header>
      <div class="card-header">
        <span class="card-title">告警记录中心</span>
        <div class="header-stats">
          <el-tag type="danger" effect="dark" size="small">活动 {{ stats.active }}</el-tag>
          <el-tag type="warning" effect="dark" size="small">未确认 {{ stats.unacknowledged }}</el-tag>
          <el-tag type="success" effect="dark" size="small">已恢复 {{ stats.recovered }}</el-tag>
        </div>
      </div>
    </template>

    <div class="alert-toolbar">
      <el-select v-model="filters.deviceId" placeholder="设备" size="small" class="filter-item" clearable>
        <el-option label="全部设备" value="all" />
        <el-option v-for="d in store.devices" :key="d.id" :label="d.name" :value="d.id" />
      </el-select>
      <el-select v-model="filters.metric" placeholder="类型" size="small" class="filter-item" clearable>
        <el-option label="全部类型" value="all" />
        <el-option label="温度" value="temperature" />
        <el-option label="湿度" value="humidity" />
      </el-select>
      <el-select v-model="filters.level" placeholder="级别" size="small" class="filter-item" clearable>
        <el-option label="全部级别" value="all" />
        <el-option label="严重" value="critical" />
        <el-option label="告警" value="warning" />
      </el-select>
      <el-select v-model="filters.recoveryState" placeholder="恢复状态" size="small" class="filter-item filter-wide" clearable>
        <el-option label="全部恢复状态" value="all" />
        <el-option label="活动中" value="active" />
        <el-option label="已恢复" value="recovered" />
      </el-select>
      <el-select v-model="filters.ackState" placeholder="确认状态" size="small" class="filter-item filter-wide" clearable>
        <el-option label="全部确认状态" value="all" />
        <el-option label="未确认" value="unacknowledged" />
        <el-option label="已确认" value="acknowledged" />
      </el-select>
      <el-date-picker
        v-model="dateRange"
        type="datetimerange"
        range-separator="至"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        size="small"
        class="filter-date"
        value-format="x"
        :clearable="true"
      />
      <el-input v-model="filters.keyword" placeholder="搜索设备/数值" size="small" class="filter-item filter-search" clearable />
      <div class="toolbar-actions">
        <el-button size="small" type="success" plain @click="handleExport">导出CSV</el-button>
        <el-button size="small" type="primary" plain @click="handleAckAll">确认本页全部</el-button>
        <el-button size="small" @click="handleClearHistory">清理已确认历史</el-button>
      </div>
    </div>

    <el-table :data="pagedList" class="alert-table" size="small" stripe height="100%" empty-text="暂无告警记录">
      <el-table-column label="开始时间" prop="startTime" width="160" />
      <el-table-column label="设备" prop="deviceName" width="90" />
      <el-table-column label="类型" width="70">
        <template #default="{ row }">
          <span :style="{ color: row.metric === 'temperature' ? '#409EFF' : '#67C23A' }">
            {{ row.metric === 'temperature' ? '温度' : '湿度' }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="级别" width="70">
        <template #default="{ row }">
          <el-tag :type="row.level === 'critical' ? 'danger' : 'warning'" size="small" effect="dark">
            {{ row.level === 'critical' ? '严重' : '告警' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="方向" width="80">
        <template #default="{ row }">
          {{ row.direction === 'high' ? '超上限' : '低于下限' }}
        </template>
      </el-table-column>
      <el-table-column label="当前/触发值" width="100">
        <template #default="{ row }">
          <span :class="{ 'value-violate': !row.recovered }">{{ row.value }}{{ row.metric === 'temperature' ? '°C' : '%' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="阈值" width="80">
        <template #default="{ row }">{{ row.threshold }}{{ row.metric === 'temperature' ? '°C' : '%' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.recovered" type="success" size="small">已恢复</el-tag>
          <el-tag v-else type="danger" size="small" effect="dark">活动中</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="恢复时间" prop="endTime" width="160">
        <template #default="{ row }">{{ row.endTime || '—' }}</template>
      </el-table-column>
      <el-table-column label="确认" width="170">
        <template #default="{ row }">
          <template v-if="row.acknowledged">
            <span class="ack-info">已确认 · {{ row.acknowledgedBy }}</span>
          </template>
          <el-button v-else size="small" type="primary" text @click="handleAck(row)">确认</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="alert-pagination">
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="filteredList.length"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next"
        background
        small
      />
    </div>
  </el-card>
</template>

<script setup>
import { ref, reactive, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { store } from '../store/monitorStore'
import {
  queryAlerts,
  acknowledgeAlert,
  acknowledgeAllFiltered,
  clearHistory
} from '../modules/alertManager'
import { exportAlertsCsv } from '../modules/exportManager'

const filters = reactive({
  deviceId: 'all',
  metric: 'all',
  level: 'all',
  recoveryState: 'all',
  ackState: 'all',
  keyword: ''
})

// 时间范围（毫秒时间戳字符串数组，来自 el-date-picker value-format="x"）
const dateRange = ref(null)

const page = ref(1)
const pageSize = ref(10)

const effectiveFilters = computed(() => ({
  ...filters,
  startTime: dateRange.value && dateRange.value[0] ? Number(dateRange.value[0]) : null,
  endTime: dateRange.value && dateRange.value[1] ? Number(dateRange.value[1]) : null
}))

const filteredList = computed(() => queryAlerts(effectiveFilters.value))

const pagedList = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filteredList.value.slice(start, start + pageSize.value)
})

// 任意筛选条件变化时回到第一页
watch(
  [() => ({ ...filters }), dateRange],
  () => { page.value = 1 },
  { deep: true }
)

const stats = computed(() => {
  const active = store.alerts.filter(a => !a.recovered).length
  const unacknowledged = store.alerts.filter(a => !a.acknowledged).length
  const recovered = store.alerts.filter(a => a.recovered).length
  return { active, unacknowledged, recovered }
})

function handleAck(row) {
  acknowledgeAlert(row.id)
  ElMessage.success('告警已确认')
}

function handleAckAll() {
  const count = acknowledgeAllFiltered(effectiveFilters.value)
  if (count === 0) {
    ElMessage.info('当前筛选结果没有需要确认的告警')
  } else {
    ElMessage.success(`已确认 ${count} 条告警`)
  }
}

function handleExport() {
  const count = exportAlertsCsv(effectiveFilters.value)
  if (count === 0) {
    ElMessage.info('当前筛选结果没有可导出的告警')
  } else {
    ElMessage.success(`已导出 ${count} 条告警记录`)
  }
}

function handleClearHistory() {
  ElMessageBox.confirm('将清空所有「已恢复且已确认」的历史记录，活动告警不受影响。确定继续？', '清理历史', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    clearHistory()
    ElMessage.success('历史记录已清理')
  }).catch(() => {})
}
</script>

<style scoped>
.alert-card {
  height: 100%;
  background: rgba(30, 30, 30, 0.6);
  border: 1px solid rgba(64, 158, 255, 0.3);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
}
.alert-card :deep(.el-card__header) {
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
  color: #E4E7ED;
  letter-spacing: 1px;
}
.header-stats {
  display: flex;
  gap: 8px;
}
.alert-card :deep(.el-card__body) {
  padding: 12px 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.alert-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  align-items: center;
}
.filter-item { width: 110px; }
.filter-wide { width: 120px; }
.filter-date { width: 300px; }
.filter-search { width: 160px; }
.toolbar-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.alert-table {
  flex: 1;
  min-height: 0;
}
.alert-table :deep(.el-table__inner-wrapper) { background: transparent; }
.alert-table :deep(.el-table), .alert-table :deep(.el-table tr), .alert-table :deep(.el-table th.el-table__cell) {
  background: transparent;
  color: #E4E7ED;
}
.alert-table :deep(.el-table th.el-table__cell) {
  background: rgba(45, 45, 45, 0.8) !important;
  color: #C0C4CC;
}
.alert-table :deep(.el-table td.el-table__cell), .alert-table :deep(.el-table th.el-table__cell.is-leaf) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.alert-table :deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background: rgba(45, 45, 45, 0.35);
}
.alert-table :deep(.el-table__body tr:hover > td.el-table__cell) {
  background: rgba(64, 158, 255, 0.12) !important;
}
.alert-table :deep(.el-table__empty-block) { background: transparent; }
.value-violate { color: #F56C6C; font-weight: 600; }
.ack-info { font-size: 12px; color: #67C23A; }
.alert-pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}
.alert-pagination :deep(.el-pagination) { color: #909399; }
.alert-pagination :deep(.el-pagination button), .alert-pagination :deep(.el-pager li) {
  background: rgba(45, 45, 45, 0.8) !important;
  color: #C0C4CC !important;
}
</style>
