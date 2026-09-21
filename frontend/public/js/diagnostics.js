let latestDiagnosticReport = null;
let activeDiagnosticFilter = 'ALL';

async function runStartupDiagnosticsOnce() {
  try {
    const startup = await window.api.runStartupDiagnostics();
    if (!startup?.enabled || !startup.report) return;
    latestDiagnosticReport = startup.report;
    renderDiagnostics();
    updateDiagnosticStatus('启动体检');
    const errors = Number(startup.report.errors || 0);
    const warnings = Number(startup.report.warnings || 0);
    if (errors || warnings) {
      const fixable = Number(startup.report.fixable || 0);
      const detail = fixable
        ? `发现 ${errors} 个异常、${warnings} 个关注项，其中 ${fixable} 个可一键修复`
        : `发现 ${errors} 个异常、${warnings} 个关注项，请打开工具体检查看`;
      showNotification('启动体检发现问题', detail, errors ? 'warning' : 'info', { log: false });
    }
  } catch (error) {
    console.error('启动体检失败:', error);
  }
}

function diagnosticStatusLabel(status) {
  if (status === 'ERROR') return '异常';
  if (status === 'WARNING') return '关注';
  return '正常';
}

function renderDiagnostics() {
  const report = latestDiagnosticReport || { total: 0, healthy: 0, warnings: 0, errors: 0, results: [] };
  document.getElementById('diagnostics-total').textContent = report.total || 0;
  document.getElementById('diagnostics-healthy').textContent = report.healthy || 0;
  document.getElementById('diagnostics-warning').textContent = report.warnings || 0;
  document.getElementById('diagnostics-error').textContent = report.errors || 0;
  const fixButton = document.getElementById('diagnostics-fix');
  const fixCount = document.getElementById('diagnostics-fix-count');
  const fixable = Number(report.fixable || 0);
  if (fixButton) {
    fixButton.disabled = fixable === 0;
    fixButton.title = fixable ? `可安全自动修复 ${fixable} 个项目` : '没有可安全自动修复的项目';
  }
  if (fixCount) fixCount.textContent = fixable ? `(${fixable})` : '';
  const issueCount = (report.results || []).filter(result => result.status !== 'HEALTHY' && result.itemId).length;
  const recheckButton = document.getElementById('diagnostics-recheck');
  const issueCountLabel = document.getElementById('diagnostics-issue-count');
  if (recheckButton) {
    recheckButton.disabled = issueCount === 0;
    recheckButton.title = issueCount ? `仅复查上次发现的 ${issueCount} 个问题项目` : '上一份报告没有异常项目';
  }
  if (issueCountLabel) issueCountLabel.textContent = issueCount ? `(${issueCount})` : '';

  const rows = (report.results || []).filter(result => activeDiagnosticFilter === 'ALL' || result.status !== 'HEALTHY');
  const list = document.getElementById('diagnostics-list');
  const empty = document.getElementById('diagnostics-empty');
  list.innerHTML = '';
  list.classList.toggle('hidden', rows.length === 0);
  empty.classList.toggle('hidden', rows.length > 0);

  rows.forEach(result => {
    const row = document.createElement('button');
    row.className = `diagnostic-row status-${String(result.status || 'HEALTHY').toLowerCase()}`;
    row.title = result.itemId ? '点击编辑该工具' : '';

    const status = document.createElement('span');
    status.className = 'diagnostic-status';
    status.innerHTML = `<i class="fas ${result.status === 'ERROR' ? 'fa-times-circle' : result.status === 'WARNING' ? 'fa-exclamation-triangle' : 'fa-check-circle'}"></i>${diagnosticStatusLabel(result.status)}`;
    const identity = document.createElement('span');
    identity.className = 'diagnostic-identity';
    const name = document.createElement('strong');
    name.textContent = result.name || '未命名工具';
    const type = document.createElement('small');
    type.textContent = ITEM_TYPE_NAMES[result.type] || result.type || '未知类型';
    identity.append(name, type);
    const message = document.createElement('span');
    message.className = 'diagnostic-message';
    const summary = document.createElement('strong');
    summary.textContent = result.summary || '-';
    if (result.autoFixable) {
      const badge = document.createElement('em');
      badge.className = 'diagnostic-autofix';
      badge.textContent = '可自动修复';
      summary.appendChild(badge);
    }
    const detail = document.createElement('small');
    detail.textContent = result.detail || result.path || '';
    detail.title = detail.textContent;
    message.append(summary, detail);
    const action = document.createElement('i');
    action.className = 'fas fa-chevron-right';
    row.append(status, identity, message, action);
    row.addEventListener('click', () => {
      if (!result.itemId || typeof openItemModal !== 'function') return;
      closeDiagnostics();
      openItemModal(result.itemId);
    });
    list.appendChild(row);
  });
}

function updateDiagnosticStatus(scope = '体检') {
  const status = document.getElementById('diagnostics-status');
  if (!status || !latestDiagnosticReport) return;
  const issues = Number(latestDiagnosticReport.errors || 0) + Number(latestDiagnosticReport.warnings || 0);
  status.textContent = issues
    ? `${scope}完成，检查 ${latestDiagnosticReport.total || 0} 个项目，仍有 ${issues} 个需要处理`
    : `${scope}完成，检查 ${latestDiagnosticReport.total || 0} 个项目，未发现异常`;
}

async function autoFixDiagnostics() {
  const button = document.getElementById('diagnostics-fix');
  const status = document.getElementById('diagnostics-status');
  if (!button || button.disabled) return;
  try {
    button.disabled = true;
    button.querySelector('i')?.classList.add('fa-spin');
    status.textContent = '正在安全修复可处理的配置…';
    const result = await window.api.autoFixTools();
    AppConfig = await window.api.getConfig();
    if (typeof renderCategories === 'function') renderCategories();
    if (typeof renderItems === 'function') renderItems();
    if (typeof refreshEnvironmentHealth === 'function') refreshEnvironmentHealth();
    latestDiagnosticReport = await window.api.diagnoseTools();
    renderDiagnostics();

    const remaining = Number(result.remainingErrors || 0) + Number(result.remainingWarnings || 0);
    if (Number(result.changes || 0) > 0) {
      status.textContent = `已修复 ${result.fixedItems} 个项目，共 ${result.changes} 项配置；剩余 ${remaining} 项需手动处理`;
      showNotification(
        '自动修复完成',
        remaining ? `已完成 ${result.changes} 项安全修复，仍有 ${remaining} 项需要手动处理` : `已完成 ${result.changes} 项安全修复，体检已全部通过`,
        remaining ? 'warning' : 'success',
        { log: false }
      );
    } else {
      status.textContent = remaining ? `未找到可安全自动修复项，剩余 ${remaining} 项请手动处理` : '当前无需修复';
      showNotification('自动修复', remaining ? '剩余问题需要手动选择正确路径或调整启动参数' : '当前配置无需修复', remaining ? 'warning' : 'success', { log: false });
    }
  } catch (error) {
    status.textContent = `自动修复失败：${error?.message || error}`;
    showNotification('自动修复失败', error?.message || String(error), 'error');
  } finally {
    button.querySelector('i')?.classList.remove('fa-spin');
    const fixable = Number(latestDiagnosticReport?.fixable || 0);
    button.disabled = fixable === 0;
  }
}

async function runDiagnostics(scope = 'all') {
  const isIssuesOnly = scope === 'issues';
  const button = document.getElementById(isIssuesOnly ? 'diagnostics-recheck' : 'diagnostics-run');
  const status = document.getElementById('diagnostics-status');
  const issueIDs = isIssuesOnly
    ? [...new Set((latestDiagnosticReport?.results || []).filter(result => result.status !== 'HEALTHY' && result.itemId).map(result => result.itemId))]
    : [];
  if (isIssuesOnly && issueIDs.length === 0) {
    status.textContent = '上一份报告中没有需要复查的异常项目';
    return;
  }
  try {
    button.disabled = true;
    button.querySelector('i')?.classList.add('fa-spin');
    status.textContent = isIssuesOnly ? `正在复查 ${issueIDs.length} 个异常项目…` : '正在执行全量体检…';
    latestDiagnosticReport = isIssuesOnly
      ? await window.api.diagnoseToolsByIDs(issueIDs)
      : await window.api.diagnoseTools();
    renderDiagnostics();
    const issues = Number(latestDiagnosticReport.errors || 0) + Number(latestDiagnosticReport.warnings || 0);
    updateDiagnosticStatus(isIssuesOnly ? '异常复查' : '全量体检');
    if (latestDiagnosticReport.errors > 0) {
      showNotification('资产体检', `发现 ${latestDiagnosticReport.errors} 个配置异常，点击列表可直接编辑`, 'warning', { log: false });
    }
  } catch (error) {
    status.textContent = `检查失败：${error?.message || error}`;
    showNotification('资产体检失败', error?.message || String(error), 'error');
  } finally {
    button.disabled = false;
    button.querySelector('i')?.classList.remove('fa-spin');
  }
}

function openDiagnostics() {
  document.getElementById('diagnostics-modal')?.classList.remove('hidden');
  renderDiagnostics();
  if (latestDiagnosticReport) {
    updateDiagnosticStatus('最近一次体检');
  } else {
    document.getElementById('diagnostics-status').textContent = '暂无体检结果，请选择全量体检';
  }
}

function closeDiagnostics() {
  document.getElementById('diagnostics-modal')?.classList.add('hidden');
}

async function copyDiagnosticReport() {
  if (!latestDiagnosticReport) return;
  const lines = [
    `HackLauncher 工具资产体检 ${new Date(latestDiagnosticReport.checkedAt).toLocaleString('zh-CN')}`,
    `总数 ${latestDiagnosticReport.total} / 正常 ${latestDiagnosticReport.healthy} / 警告 ${latestDiagnosticReport.warnings} / 异常 ${latestDiagnosticReport.errors}`,
    '',
    ...(latestDiagnosticReport.results || []).map(result =>
      `[${diagnosticStatusLabel(result.status)}] ${result.name} (${ITEM_TYPE_NAMES[result.type] || result.type}) - ${result.summary}${result.detail ? `：${result.detail}` : ''}`
    )
  ];
  try {
    await navigator.clipboard.writeText(lines.join('\n'));
    showNotification('已复制', '资产体检报告已复制到剪贴板', 'success');
  } catch (error) {
    showNotification('复制失败', String(error), 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('diagnostics-btn')?.addEventListener('click', openDiagnostics);
  document.getElementById('diagnostics-close')?.addEventListener('click', closeDiagnostics);
  document.getElementById('diagnostics-done')?.addEventListener('click', closeDiagnostics);
  document.getElementById('diagnostics-run')?.addEventListener('click', () => runDiagnostics('all'));
  document.getElementById('diagnostics-recheck')?.addEventListener('click', () => runDiagnostics('issues'));
  document.getElementById('diagnostics-fix')?.addEventListener('click', autoFixDiagnostics);
  document.getElementById('diagnostics-copy')?.addEventListener('click', copyDiagnosticReport);
  document.getElementById('diagnostics-modal')?.addEventListener('click', event => {
    if (event.target.id === 'diagnostics-modal') closeDiagnostics();
  });
  document.querySelectorAll('[data-diagnostic-filter]').forEach(button => {
    button.addEventListener('click', () => {
      activeDiagnosticFilter = button.dataset.diagnosticFilter;
      document.querySelectorAll('[data-diagnostic-filter]').forEach(item => item.classList.toggle('active', item === button));
      renderDiagnostics();
    });
  });
  window.api.receive('open-diagnostics', openDiagnostics);
});
