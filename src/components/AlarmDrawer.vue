<template>
  <el-drawer
    :model-value="modelValue"
    title="告警记录中心"
    size="780px"
    class="alarm-drawer"
    @update:model-value="handleClose"
  >
    <div class="alarm-panel">
      <!-- 查询筛选区 -->
      <div class="alarm-filters">
        <el-select v-model="filterDevice" placeholder="全部设备" clearable class="filter-item">
          <el-option
            v-for="device in deviceList"
            :key="device.id"
            :label="device.name"
            :value="device.id"
          />
        </el-select>
        <el-select v-model="filterMetric" placeholder="全部类型" clearable class="filter-item">
          <el-option label="温度" value="temperature" />
          <el-option label="湿度" value="humidity" />
        </el-select>
        <el-select v-model="filterLevel" placeholder="全部级别" clearable class="filter-item">
          <el-option label="一般" value="一般" />
          <el-option label="警告" value="警告" />
          <el-option label="严重" value="严重" />
        </el-select>
        <el-select v-model="filterStatus" placeholder="全部状态" clearable class="filter-item">
          <el-option label="告警中" value="active" />
          <el-option label="已恢复" value="recovered" />
        </el-select>
        <el-select v-model="filterConfirmed" placeholder="确认状态" clearable class="filter-item">
          <el-option label="未确认" value="unconfirmed" />
          <el-option label="已确认" value="confirmed" />
        </el-select>
        <el-button
          type="primary"
          plain
          :disabled="unconfirmedCount === 0"
          @click="handleConfirmAll"
        >
          全部确认
        </el-button>
      </div>

      <!-- 导出区：按触发时间范围导出 CSV -->
      <div class="alarm-export">
        <el-date-picker
          v-model="exportTimeRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="触发时间起"
          end-placeholder="触发时间止"
          class="export-range"
        />
        <el-button type="primary" plain :icon="Download" @click="handleExport">导出记录</el-button>
      </div>

      <div class="alarm-summary">
        共 {{ filteredAlarms.length }} 条 · 告警中 {{ activeAlarmCount }} 条 · 未确认 {{ unconfirmedCount }} 条
      </div>

      <!-- 告警记录表 -->
      <div class="alarm-table-wrapper">
        <el-table
          v-if="filteredAlarms.length"
          :data="filteredAlarms"
          height="100%"
          class="alarm-table"
        >
          <el-table-column label="触发时间" width="170">
            <template #default="{ row }">
              {{ formatDateTime(row.triggerTime) }}
            </template>
          </el-table-column>
          <el-table-column prop="deviceName" label="设备" width="80" />
          <el-table-column label="类型" width="80">
            <template #default="{ row }">
              <span class="metric-tag" :class="row.metric === 'temperature' ? 'metric-temperature' : 'metric-humidity'">
                {{ row.metricLabel }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="越限" width="110">
            <template #default="{ row }">
              {{ row.limitLabel }} {{ row.threshold }}{{ row.unit }}
            </template>
          </el-table-column>
          <el-table-column label="触发值 / 峰值" width="130">
            <template #default="{ row }">
              {{ row.triggerValue }}{{ row.unit }}
              <span v-if="row.peakValue !== row.triggerValue" class="peak-value">/ {{ row.peakValue }}{{ row.unit }}</span>
            </template>
          </el-table-column>
          <el-table-column label="级别" width="80">
            <template #default="{ row }">
              <el-tag :type="levelTagType(row.level)" size="small" effect="dark">{{ row.level }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="110">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'danger' : 'success'" size="small" effect="dark">
                {{ row.status === 'active' ? '告警中' : '已恢复' }}
              </el-tag>
              <div v-if="row.status === 'recovered'" class="cell-sub">
                {{ formatTime(row.recoveredTime) }} 恢复
              </div>
            </template>
          </el-table-column>
          <el-table-column label="确认" width="90" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="!row.confirmed"
                size="small"
                type="primary"
                plain
                @click="handleConfirm(row.id)"
              >
                确认
              </el-button>
              <el-tooltip v-else :content="`确认时间：${formatDateTime(row.confirmTime)}`" placement="left">
                <span class="confirmed-text">已确认</span>
              </el-tooltip>
            </template>
          </el-table-column>
        </el-table>
        <el-empty v-else description="暂无告警记录" class="alarm-empty" />
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import {
  deviceList,
  alarmList,
  activeAlarmCount,
  unconfirmedCount,
  confirmAlarm,
  confirmAllAlarms,
  buildAlarmCsv,
  formatTime,
  formatDateTime
} from '../store/monitorStore'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:modelValue'])

// 查询条件
const filterDevice = ref('')
const filterMetric = ref('')
const filterLevel = ref('')
const filterStatus = ref('')
const filterConfirmed = ref('')

// 记录直接来自中枢告警列表，查询只做展示层过滤（设备/类型/级别/状态/确认状态组合筛选）
const filteredAlarms = computed(() =>
  alarmList.value.filter(alarm =>
    (!filterDevice.value || alarm.deviceId === filterDevice.value) &&
    (!filterMetric.value || alarm.metric === filterMetric.value) &&
    (!filterLevel.value || alarm.level === filterLevel.value) &&
    (!filterStatus.value || alarm.status === filterStatus.value) &&
    (!filterConfirmed.value ||
      (filterConfirmed.value === 'confirmed') === alarm.confirmed)
  )
)

// 级别标签配色
const levelTagType = (level) => ({
  '一般': 'info',
  '警告': 'warning',
  '严重': 'danger'
}[level] || 'info')

// 导出时间范围（触发时间）
const exportTimeRange = ref(null)

// 导出文件名时间戳
const formatFileTime = (timestamp) => {
  const date = new Date(timestamp)
  const pad = (num) => String(num).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

// 导出告警记录：按时间范围从中枢取数生成 CSV 并下载
const handleExport = () => {
  const [start, end] = exportTimeRange.value || [null, null]
  const { csv, count } = buildAlarmCsv(
    start ? start.getTime() : null,
    end ? end.getTime() : null
  )
  if (count === 0) {
    ElMessage.warning('所选时间范围内没有告警记录')
    return
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `告警记录_${formatFileTime(Date.now())}.csv`
  link.click()
  URL.revokeObjectURL(link.href)
  ElMessage.success(`已导出 ${count} 条告警记录`)
}

// 人工确认
const handleConfirm = (alarmId) => {
  confirmAlarm(alarmId)
}

const handleConfirmAll = () => {
  confirmAllAlarms()
}

const handleClose = () => {
  emit('update:modelValue', false)
}
</script>

<style scoped>
.alarm-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 14px;
}

.alarm-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-item {
  width: 130px;
}

.alarm-export {
  display: flex;
  align-items: center;
  gap: 10px;
}

.export-range {
  flex: 1;
  max-width: 380px;
}

.alarm-summary {
  font-size: 13px;
  color: #909399;
  letter-spacing: 1px;
}

.alarm-table-wrapper {
  flex: 1;
  min-height: 0;
}

.metric-tag {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 1px;
}

.metric-temperature {
  color: #409EFF;
  background: rgba(64, 158, 255, 0.15);
  border: 1px solid rgba(64, 158, 255, 0.4);
}

.metric-humidity {
  color: #67C23A;
  background: rgba(103, 194, 58, 0.15);
  border: 1px solid rgba(103, 194, 58, 0.4);
}

.peak-value {
  color: #F56C6C;
}

.cell-sub {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.confirmed-text {
  color: #67C23A;
  font-size: 13px;
  cursor: default;
}

.alarm-empty {
  height: 100%;
}
</style>
