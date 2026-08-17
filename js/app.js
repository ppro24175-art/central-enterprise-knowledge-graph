(function () {
  'use strict';
  const graph = window.CEC_GRAPH_DATA;
  if (!graph || !window.CEC_UI) return;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const canvas = $('#graphCanvas');
  const ctx = canvas.getContext('2d');
  const ui = window.CEC_UI;
  const enterprisesById = new Map(graph.enterprises.map((item) => [item.id, item]));
  const nodesById = new Map(graph.nodes.map((item) => [item.id, item]));
  const relationMap = new Map();
  graph.edges.forEach((edge) => {
    if (!relationMap.has(edge.source)) relationMap.set(edge.source, new Set());
    if (!relationMap.has(edge.target)) relationMap.set(edge.target, new Set());
    relationMap.get(edge.source).add(edge.target); relationMap.get(edge.target).add(edge.source);
  });

  const state = {
    view: 'graph', expandedIds: new Set(), levels: new Set(), industries: new Set(), regions: new Set(), platformStatuses: new Set(),
    search: '', attribute: 'all', selectedId: '', hoveredType: '', page: 1, pageSize: 12, sortKey: 'name', sortDirection: 1,
  };
  const palette = { group: '#ff6676', secondary: '#4e9cff', tertiary: '#a687ff', other: '#86a6cf', industry: '#ffb531', region: '#30dada', listing: '#54de9a', platform: '#e78cff', sap: '#b483ff' };
  const radius = { group: 13, secondary: 10, tertiary: 8, other: 8, industry: 18, region: 15, listing: 13, platform: 14, sap: 13 };
  let visibleNodes = [], visibleEdges = [], simulation = new Map();
  let viewport = { x: 0, y: 0, zoom: 1 }, activePointer = null, dragNode = null, hovering = '', hoverEdge = null, frame = 0;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const available = (value) => value && !['待补充', '未提供', '', '-', '--'].includes(String(value).trim());
  const abbreviate = (text, length = 15) => String(text || '').length > length ? `${String(text).slice(0, length)}…` : String(text || '');
  const hash = (value) => [...String(value)].reduce((acc, char) => ((acc << 5) - acc) + char.charCodeAt(0), 0) >>> 0;

  function setStatistics() {
    const mapping = [['statGroups', graph.stats.groups], ['statSecondary', graph.stats.secondary], ['statTertiary', graph.stats.tertiary], ['statIndustries', graph.stats.industries], ['statRegions', graph.stats.regions], ['statListings', graph.stats.listings], ['statPlatforms', graph.stats.platformRecorded || 0]];
    mapping.forEach(([id, value]) => { $(`#${id}`).textContent = value; });
  }

  function createChips(container, values, targetSet, labelTransform = (value) => value) {
    const element = $(container); element.innerHTML = '';
    if (!values.length) { element.innerHTML = '<span class="empty-chip">源数据暂未提供</span>'; return; }
    values.forEach((value) => {
      const button = document.createElement('button'); button.className = `chip${targetSet.has(value) ? ' active' : ''}`; button.textContent = labelTransform(value); button.dataset.value = value;
      button.addEventListener('click', () => { targetSet.has(value) ? targetSet.delete(value) : targetSet.add(value); state.page = 1; renderControls(); renderGraph(); }); element.append(button);
    });
  }

  function renderControls() {
    createChips('#levelChips', ['央企集团', '二级单位', '三级单位', '上市公司'], state.levels);
    createChips('#industryChips', [...new Set(graph.enterprises.map((item) => item.industry).filter(available))].sort(), state.industries);
    createChips('#regionChips', [...new Set(graph.enterprises.map((item) => item.region).filter(available))].sort(), state.regions);
    createChips('#platformStatusChips', ['已披露', '建设中', '待核验', '未检索到'].filter((status) => graph.enterprises.some((item) => item.dataPlatformStatus === status)), state.platformStatuses);
    renderSearchResults(); renderTable();
  }

  function matchesEnterprise(item) {
    const levelMatch = state.levels.size === 0 || state.levels.has(item.level) || (state.levels.has('上市公司') && available(item.listingPlatform));
    const industryMatch = state.industries.size === 0 || state.industries.has(item.industry);
    const regionMatch = state.regions.size === 0 || state.regions.has(item.region);
    const platformStatusMatch = state.platformStatuses.size === 0 || state.platformStatuses.has(item.dataPlatformStatus);
    const search = state.search.trim().toLowerCase();
    if (!search) return levelMatch && industryMatch && regionMatch && platformStatusMatch;
    const source = state.attribute === 'all' ? Object.values(item).join(' ') : String(item[state.attribute] ?? '');
    return levelMatch && industryMatch && regionMatch && platformStatusMatch && source.toLowerCase().includes(search);
  }

  function renderSearchResults() {
    const matches = graph.enterprises.filter(matchesEnterprise);
    $('#resultCount').textContent = `共 ${matches.length} 家企业`;
    $('#resultList').innerHTML = matches.slice(0, 10).map((item) => `<button class="result-card" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.industry)} · ${escapeHtml(item.dataPlatformStatus)} · ${escapeHtml(item.dataPlatform)}</span></button>`).join('') || '<p class="empty-chip">未找到匹配企业</p>';
    $$('#resultList .result-card').forEach((button) => button.addEventListener('click', () => focusEnterprise(button.dataset.id)));
    const suggestionHost = $('#searchSuggestions');
    const searchMatches = state.search.trim() ? matches.slice(0, 6) : [];
    suggestionHost.innerHTML = searchMatches.map((item) => `<button class="suggestion" data-id="${escapeHtml(item.id)}">${escapeHtml(item.name)} <span class="muted">${escapeHtml(item.level)}</span></button>`).join('');
    $$('#searchSuggestions .suggestion').forEach((button) => button.addEventListener('click', () => focusEnterprise(button.dataset.id)));
  }

  function focusEnterprise(id) {
    const item = enterprisesById.get(id); if (!item) return;
    const path = ui.findAncestorPath(graph.enterprises, id); path.slice(0, -1).forEach((parentId) => state.expandedIds.add(parentId));
    state.selectedId = id; state.search = ''; $('#searchInput').value = ''; state.page = 1;
    renderControls(); renderGraph(); showDetail(id); requestAnimationFrame(() => focusNode(id));
  }

  function currentVisible() {
    const ids = new Set(ui.getVisibleNodeIds(graph, state));
    const nodes = graph.nodes.filter((node) => ids.has(node.id));
    const edges = graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target));
    return { ids, nodes, edges };
  }

  function ensureCanvasSize() {
    const rect = canvas.getBoundingClientRect(), ratio = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * ratio) || canvas.height !== Math.round(rect.height * ratio)) { canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio); }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); return rect;
  }

  function initializeSimulation(nodes) {
    const rect = ensureCanvasSize();
    nodes.forEach((node) => {
      if (!simulation.has(node.id)) {
        const seed = hash(node.id); simulation.set(node.id, { id: node.id, x: rect.width * (.18 + ((seed % 640) / 1000)), y: rect.height * (.13 + (((seed >>> 10) % 720) / 1000)), vx: 0, vy: 0 });
      }
    });
  }

  function simulate() {
    const entries = visibleNodes.map((node) => simulation.get(node.id)).filter(Boolean);
    for (let i = 0; i < entries.length; i += 1) for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i], b = entries[j], dx = a.x - b.x, dy = a.y - b.y, distance2 = Math.max(60, dx * dx + dy * dy), force = 2100 / distance2;
      a.vx += dx * force; a.vy += dy * force; b.vx -= dx * force; b.vy -= dy * force;
    }
    visibleEdges.forEach((edge) => {
      const a = simulation.get(edge.source), b = simulation.get(edge.target); if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y, distance = Math.max(1, Math.hypot(dx, dy)), desired = edge.relation === '管理/控股' ? 115 : 170, force = (distance - desired) * .003;
      a.vx += dx / distance * force; a.vy += dy / distance * force; b.vx -= dx / distance * force; b.vy -= dy / distance * force;
    });
    const rect = canvas.getBoundingClientRect(); entries.forEach((node) => { if (dragNode === node.id) return; node.vx += (rect.width / 2 - node.x) * .0007; node.vy += (rect.height / 2 - node.y) * .0007; node.vx *= .84; node.vy *= .84; node.x += node.vx; node.y += node.vy; });
  }

  function project(point) { return { x: point.x * viewport.zoom + viewport.x, y: point.y * viewport.zoom + viewport.y }; }
  function screenToWorld(x, y) { return { x: (x - viewport.x) / viewport.zoom, y: (y - viewport.y) / viewport.zoom }; }
  function selectionSet() {
    if (!state.selectedId) return null;
    const selected = new Set(ui.findAncestorPath(graph.enterprises, state.selectedId)); selected.add(state.selectedId); const connected = relationMap.get(state.selectedId) || new Set(); connected.forEach((id) => selected.add(id)); return selected;
  }

  function draw() {
    const rect = ensureCanvasSize(); ctx.clearRect(0, 0, rect.width, rect.height);
    const selectedSet = selectionSet(); const typeFilter = state.hoveredType;
    visibleEdges.forEach((edge) => {
      const a = simulation.get(edge.source), b = simulation.get(edge.target); if (!a || !b) return;
      const pa = project(a), pb = project(b); const highlighted = hoverEdge === edge || (selectedSet && selectedSet.has(edge.source) && selectedSet.has(edge.target));
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.strokeStyle = highlighted ? 'rgba(81,219,255,.92)' : 'rgba(97,142,216,.21)'; ctx.lineWidth = highlighted ? 1.8 : .8; ctx.stroke();
    });
    visibleNodes.forEach((node) => {
      const point = simulation.get(node.id); if (!point) return; const p = project(point), type = node.type || enterprisesById.get(node.id)?.type || 'other'; const r = (radius[type] || 9) * Math.min(1.8, Math.max(.55, viewport.zoom));
      const dim = (selectedSet && !selectedSet.has(node.id)) || (typeFilter && type !== typeFilter); const color = palette[type] || palette.other; const selected = state.selectedId === node.id || hovering === node.id;
      ctx.save(); ctx.globalAlpha = dim ? .14 : 1; ctx.shadowBlur = selected ? 25 : 12; ctx.shadowColor = color;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      if (['industry', 'region', 'listing', 'platform', 'sap'].includes(type)) { ctx.fillStyle = '#071034'; ctx.fill(); ctx.lineWidth = selected ? 3 : 2; ctx.strokeStyle = color; ctx.stroke(); }
      else { ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.72)'; ctx.stroke(); }
      ctx.shadowBlur = 0; const label = node.label || enterprisesById.get(node.id)?.name || node.id;
      if (visibleNodes.length < 150 || viewport.zoom > 1.1 || selected) { ctx.fillStyle = dim ? 'rgba(175,198,225,.25)' : '#dceeff'; ctx.font = `${selected ? 13 : 12}px Microsoft YaHei`; ctx.textAlign = 'center'; ctx.fillText(abbreviate(label, selected ? 24 : 15), p.x, p.y + r + 15); }
      ctx.restore();
    });
  }

  function animate() { simulate(); draw(); frame += 1; if (frame < 260 || dragNode) requestAnimationFrame(animate); }
  function renderGraph() { const current = currentVisible(); visibleNodes = current.nodes; visibleEdges = current.edges; initializeSimulation(visibleNodes); frame = 0; requestAnimationFrame(animate); }

  function fitGraph() {
    const rect = ensureCanvasSize(); const points = visibleNodes.map((node) => simulation.get(node.id)).filter(Boolean); if (!points.length) return;
    const minX = Math.min(...points.map((p) => p.x)), maxX = Math.max(...points.map((p) => p.x)), minY = Math.min(...points.map((p) => p.y)), maxY = Math.max(...points.map((p) => p.y));
    const width = Math.max(260, maxX - minX), height = Math.max(220, maxY - minY); viewport.zoom = Math.min(1.12, Math.max(.42, Math.min((rect.width - 90) / width, (rect.height - 130) / height))); viewport.x = rect.width / 2 - ((minX + maxX) / 2) * viewport.zoom; viewport.y = rect.height / 2 - ((minY + maxY) / 2) * viewport.zoom; draw();
  }

  function focusNode(id) {
    const point = simulation.get(id); if (!point) return; const rect = ensureCanvasSize(); viewport.x = rect.width / 2 - point.x * viewport.zoom; viewport.y = rect.height / 2 - point.y * viewport.zoom; draw();
  }

  function showDetail(id) {
    const item = enterprisesById.get(id);
    if (!item) { const node = nodesById.get(id); if (node) $('#detailContent').innerHTML = `<h2 class="detail-title">${escapeHtml(node.label)}</h2><div class="detail-badges"><span class="badge industry">${escapeHtml(node.type)}</span></div><p class="muted">图谱分类节点</p>`; return; }
    const childCount = graph.enterprises.filter((enterprise) => enterprise.parentId === item.id).length;
    const badgeClass = item.type === 'group' ? 'group' : item.type === 'secondary' ? 'secondary' : 'tertiary';
    const rows = [
      ['企业编号', item.id], ['企业层级', item.level], ['所属央企集团', item.group], ['上级单位', item.parentName || '—'], ['大行业', item.industry], ['细分行业', item.subIndustry], ['总部所在地', item.region], ['成立时间', item.established],
      ['资产规模', item.assets], ['资产数据年份', item.assetYear], ['营收规模', item.revenue], ['营收数据年份', item.revenueYear], ['员工人数', item.employees], ['主体信用评级', item.creditRating], ['上市平台', item.listingPlatform], ['股票代码', item.stockCode], ['主营业务', item.business],
      ['大数据平台结论', item.dataPlatform], ['平台证据状态', item.dataPlatformStatus], ['SAP使用状态', item.sapStatus], ['SAP产品', item.sapProducts], ['应用场景', item.sapScenario], ['项目时间', item.projectTime],
    ];
    const sourceLink = available(item.sourceUrl) ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.sourceUrl)}</a>` : '待补充';
    $('#detailContent').innerHTML = `<h2 class="detail-title">${escapeHtml(item.name)}</h2><div class="detail-badges"><span class="badge ${badgeClass}">${escapeHtml(item.level)}</span><span class="badge industry">${escapeHtml(item.industry)}</span></div>${['group', 'secondary'].includes(item.type) ? `<div class="detail-actions"><button data-action="toggle">${state.expandedIds.has(item.id) ? '收起下一级' : '展开下一级'}</button><button data-action="path">高亮组织路径</button></div>` : '<div class="detail-actions"><button data-action="path">高亮组织路径</button></div>'}<dl class="detail-grid">${rows.map(([label, value]) => `<div class="detail-row"><dt>${label}</dt><dd class="${available(value) && ['资产规模', '营收规模', '总部所在地'].includes(label) ? 'emphasis' : ''}">${escapeHtml(value)}</dd></div>`).join('')}</dl><section class="source-section"><h3>信息来源</h3><div class="source-note"><div>来源名称：${escapeHtml(item.sourceName)}</div><div>来源文件：${escapeHtml(item.sourceFile)} · ${escapeHtml(item.sourceSheet)} · 第 ${escapeHtml(item.sourceRow)} 行</div><div>数据年份：${escapeHtml(item.dataYear)}　可信度：${escapeHtml(item.confidence)}</div><div>来源网址：${sourceLink}</div><div>直接下级：${childCount ? `${childCount} 家` : '当前未提供下级单位数据'}</div></div></section>`;
    if (item.dataPlatformStatus !== '待补充') {
      const platformLink = available(item.dataPlatformSourceUrl) ? `<a href="${escapeHtml(item.dataPlatformSourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.dataPlatformSourceUrl)}</a>` : '未提供';
      $('#detailContent').querySelector('.source-section').insertAdjacentHTML('afterend', `<section class="source-section"><h3>大数据平台证据</h3><div class="source-note"><div>证据状态：${escapeHtml(item.dataPlatformStatus)}</div><div>来源标题：${escapeHtml(item.dataPlatformSourceTitle || '未提供')}</div><div>访问日期：${escapeHtml(item.dataPlatformAccessedOn || '未提供')}　可信度：${escapeHtml(item.dataPlatformConfidence)}</div><div>来源网址：${platformLink}</div><div>备注：${escapeHtml(item.dataPlatformNote || '—')}</div></div></section>`);
    }
    const publicLabels = { region: '总部所在地', established: '成立时间', assets: '资产规模', revenue: '营收规模', employees: '员工人数', creditRating: '主体信用评级', listingPlatform: '上市平台', stockCode: '股票代码', business: '主营业务' };
    const publicEntries = Object.entries(item.publicResearchSources || {});
    if (publicEntries.length) $('#detailContent').insertAdjacentHTML('beforeend', `<section class="source-section"><h3>公开资料来源</h3><div class="source-note">${publicEntries.map(([field, evidence]) => `<div><strong>${escapeHtml(publicLabels[field] || field)}：</strong>${escapeHtml(evidence.sourceTitle || '公开网页资料')}（${escapeHtml(evidence.dataYear || '未注明')}，${escapeHtml(evidence.confidence || '中')}）<br><a href="${escapeHtml(evidence.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(evidence.sourceUrl)}</a>${evidence.note ? `<br>备注：${escapeHtml(evidence.note)}` : ''}</div>`).join('')}</div></section>`);
    $$('#detailContent [data-action]').forEach((button) => button.addEventListener('click', () => { if (button.dataset.action === 'toggle') toggleExpansion(item.id); else { state.selectedId = item.id; renderGraph(); focusNode(item.id); } }));
  }

  function toggleExpansion(id) { state.expandedIds.has(id) ? state.expandedIds.delete(id) : state.expandedIds.add(id); renderGraph(); showDetail(id); }

  function renderTable() {
    if (state.view !== 'table') return;
    const headers = [['name', '企业名称'], ['level', '企业层级'], ['group', '所属集团'], ['parentName', '上级单位'], ['industry', '行业'], ['dataPlatform', '大数据平台'], ['dataPlatformStatus', '平台证据状态'], ['region', '地区'], ['assets', '资产规模'], ['revenue', '营收规模'], ['employees', '员工人数'], ['creditRating', '信用评级'], ['listingPlatform', '上市平台'], ['sapProducts', 'SAP/HANA'], ['sourceName', '信息来源']];
    const rows = graph.enterprises.filter(matchesEnterprise).sort((a, b) => String(a[state.sortKey] || '').localeCompare(String(b[state.sortKey] || ''), 'zh-CN') * state.sortDirection);
    const total = Math.max(1, Math.ceil(rows.length / state.pageSize)); state.page = Math.min(state.page, total);
    $('#enterpriseTable thead').innerHTML = `<tr>${headers.map(([key, label]) => `<th data-sort="${key}">${label}${state.sortKey === key ? (state.sortDirection === 1 ? ' ↑' : ' ↓') : ''}</th>`).join('')}</tr>`;
    $('#enterpriseTable tbody').innerHTML = rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize).map((item) => `<tr data-id="${escapeHtml(item.id)}">${headers.map(([key]) => `<td>${escapeHtml(item[key])}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${headers.length}" class="muted">未找到匹配企业</td></tr>`;
    $('#pagination').innerHTML = Array.from({ length: total }, (_, index) => `<button class="${state.page === index + 1 ? 'active' : ''}" data-page="${index + 1}">${index + 1}</button>`).join('');
    $$('#enterpriseTable th').forEach((header) => header.addEventListener('click', () => { const key = header.dataset.sort; state.sortDirection = state.sortKey === key ? -state.sortDirection : 1; state.sortKey = key; renderTable(); }));
    $$('#enterpriseTable tbody tr[data-id]').forEach((row) => row.addEventListener('click', () => focusEnterprise(row.dataset.id)));
    $$('#pagination button').forEach((button) => button.addEventListener('click', () => { state.page = Number(button.dataset.page); renderTable(); }));
  }

  function setView(view) { state.view = view; $$('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.view === view)); $('#graphView').classList.toggle('hidden', view !== 'graph'); $('#tableView').classList.toggle('hidden', view !== 'table'); if (view === 'graph') { renderGraph(); requestAnimationFrame(fitGraph); } else renderTable(); }

  function hitTest(clientX, clientY) {
    const rect = canvas.getBoundingClientRect(), world = screenToWorld(clientX - rect.left, clientY - rect.top); let closest = null, distance = Infinity;
    visibleNodes.forEach((node) => { const point = simulation.get(node.id); if (!point) return; const d = Math.hypot(point.x - world.x, point.y - world.y); if (d < (radius[node.type] || 9) / viewport.zoom + 8 / viewport.zoom && d < distance) { closest = node; distance = d; } }); return closest;
  }
  function findEdgeAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect(), p = { x: clientX - rect.left, y: clientY - rect.top }; let result = null, nearest = 7;
    visibleEdges.forEach((edge) => { const a = simulation.get(edge.source), b = simulation.get(edge.target); if (!a || !b) return; const pa = project(a), pb = project(b), l2 = (pb.x - pa.x) ** 2 + (pb.y - pa.y) ** 2; if (!l2) return; const t = Math.max(0, Math.min(1, ((p.x - pa.x) * (pb.x - pa.x) + (p.y - pa.y) * (pb.y - pa.y)) / l2)); const d = Math.hypot(p.x - (pa.x + t * (pb.x - pa.x)), p.y - (pa.y + t * (pb.y - pa.y))); if (d < nearest) { nearest = d; result = edge; } }); return result;
  }
  function showTooltip(text, x, y) { const tooltip = $('#graphTooltip'); tooltip.textContent = text; tooltip.style.display = 'block'; tooltip.style.left = `${x + 14}px`; tooltip.style.top = `${y + 13}px`; }
  function hideTooltip() { $('#graphTooltip').style.display = 'none'; }

  canvas.addEventListener('wheel', (event) => { event.preventDefault(); const rect = canvas.getBoundingClientRect(), sx = event.clientX - rect.left, sy = event.clientY - rect.top, before = screenToWorld(sx, sy); viewport.zoom = Math.max(.28, Math.min(2.7, viewport.zoom * (event.deltaY > 0 ? .88 : 1.14))); viewport.x = sx - before.x * viewport.zoom; viewport.y = sy - before.y * viewport.zoom; draw(); }, { passive: false });
  canvas.addEventListener('pointerdown', (event) => { const node = hitTest(event.clientX, event.clientY); activePointer = { x: event.clientX, y: event.clientY, nodeId: node?.id || '' }; canvas.setPointerCapture(event.pointerId); dragNode = node?.id || null; canvas.style.cursor = dragNode ? 'grabbing' : 'grabbing'; });
  canvas.addEventListener('pointermove', (event) => { const rect = canvas.getBoundingClientRect(); if (activePointer) { const dx = event.clientX - activePointer.x, dy = event.clientY - activePointer.y; if (dragNode) { const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top); const point = simulation.get(dragNode); point.x = world.x; point.y = world.y; point.vx = 0; point.vy = 0; } else { viewport.x += dx; viewport.y += dy; } activePointer.x = event.clientX; activePointer.y = event.clientY; draw(); return; }
    const node = hitTest(event.clientX, event.clientY); hovering = node?.id || ''; hoverEdge = node ? null : findEdgeAt(event.clientX, event.clientY); canvas.style.cursor = node ? 'pointer' : 'grab'; if (node) showTooltip(`${node.label || enterprisesById.get(node.id)?.name || node.id} · ${node.type}`, event.clientX, event.clientY); else if (hoverEdge) showTooltip(hoverEdge.relation, event.clientX, event.clientY); else hideTooltip(); draw(); });
  canvas.addEventListener('pointerup', (event) => { if (!activePointer) return; const moved = Math.hypot(event.clientX - activePointer.x, event.clientY - activePointer.y); const id = activePointer.nodeId; activePointer = null; dragNode = null; canvas.style.cursor = 'grab'; try { canvas.releasePointerCapture(event.pointerId); } catch (_) { /* no-op */ } if (id && moved < 5) { state.selectedId = id; showDetail(id); renderGraph(); } });
  canvas.addEventListener('dblclick', (event) => { const node = hitTest(event.clientX, event.clientY); const item = node && enterprisesById.get(node.id); if (item && ['group', 'secondary'].includes(item.type)) toggleExpansion(item.id); });
  canvas.addEventListener('pointerleave', () => { if (!activePointer) { hovering = ''; hoverEdge = null; hideTooltip(); draw(); } });

  $('#searchInput').addEventListener('input', (event) => { state.search = event.target.value; state.page = 1; renderControls(); renderGraph(); });
  $('#attributeSelect').addEventListener('change', (event) => { state.attribute = event.target.value; const label = event.target.options[event.target.selectedIndex].text.replace('-- ', '').replace(' --', ''); $('#searchInput').placeholder = state.attribute === 'all' ? '搜索集团、二级、三级或上市公司' : `按“${label}”查询`; state.page = 1; renderControls(); renderGraph(); });
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => setView(tab.dataset.view)));
  $('#expandAll').addEventListener('click', () => { graph.enterprises.forEach((item) => { if (graph.enterprises.some((child) => child.parentId === item.id)) state.expandedIds.add(item.id); }); renderGraph(); });
  $('#collapseAll').addEventListener('click', () => { state.expandedIds.clear(); renderGraph(); });
  $('#fitView').addEventListener('click', fitGraph);
  $('#resetView').addEventListener('click', () => { state.expandedIds.clear(); state.levels.clear(); state.industries.clear(); state.regions.clear(); state.platformStatuses.clear(); state.search = ''; state.selectedId = ''; $('#searchInput').value = ''; renderControls(); renderGraph(); setTimeout(fitGraph, 50); $('#detailContent').innerHTML = '<div class="detail-empty"><span>◎</span><h2>企业详情</h2><p>选择图谱节点或查询结果以查看企业信息。</p></div>'; });
  $$('.panel-collapse').forEach((button) => button.addEventListener('click', () => { $('#appShell').classList.toggle(`${button.dataset.collapse}-collapsed`); setTimeout(() => { ensureCanvasSize(); renderGraph(); fitGraph(); }, 260); }));
  $$('.legend button').forEach((button) => { button.addEventListener('mouseenter', () => { state.hoveredType = button.dataset.legend; draw(); }); button.addEventListener('mouseleave', () => { state.hoveredType = ''; draw(); }); });
  window.addEventListener('resize', () => { ensureCanvasSize(); draw(); });

  setStatistics(); renderControls(); renderGraph(); setTimeout(fitGraph, 120);
}());
