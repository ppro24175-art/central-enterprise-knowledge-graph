(function () {
  const isAvailable = (value) => value && !['待补充', '未提供', '', '-', '--'].includes(String(value).trim());
  function findAncestorPath(enterprises, targetId) {
    const byId = new Map(enterprises.map((enterprise) => [enterprise.id, enterprise]));
    const path = [];
    let current = byId.get(targetId);
    const visited = new Set();
    while (current && !visited.has(current.id)) {
      path.unshift(current.id); visited.add(current.id); current = byId.get(current.parentId);
    }
    return path;
  }
  function getVisibleNodeIds(graph, state) {
    const expandedIds = state.expandedIds || new Set();
    const selectedLevels = state.levels || new Set();
    const selectedIndustries = state.industries || new Set();
    const selectedRegions = state.regions || new Set();
    const visible = new Set();
    const matches = (enterprise) => {
      const levelMatch = selectedLevels.size === 0 || selectedLevels.has(enterprise.level) || (selectedLevels.has('上市公司') && isAvailable(enterprise.listingPlatform));
      return levelMatch && (selectedIndustries.size === 0 || selectedIndustries.has(enterprise.industry)) && (selectedRegions.size === 0 || selectedRegions.has(enterprise.region));
    };
    const byId = new Map(graph.enterprises.map((enterprise) => [enterprise.id, enterprise]));
    const includePath = (enterprise) => { let current = enterprise; const visited = new Set(); while (current && !visited.has(current.id)) { visible.add(current.id); visited.add(current.id); current = byId.get(current.parentId); } };
    graph.enterprises.filter((enterprise) => enterprise.level === '央企集团' && matches(enterprise)).forEach((enterprise) => visible.add(enterprise.id));
    graph.enterprises.filter((enterprise) => enterprise.level !== '央企集团' && matches(enterprise)).forEach((enterprise) => {
      const path = findAncestorPath(graph.enterprises, enterprise.id);
      if (path.slice(0, -1).every((id) => expandedIds.has(id))) includePath(enterprise);
    });
    graph.nodes.filter((node) => ['industry', 'region', 'listing'].includes(node.type)).forEach((node) => visible.add(node.id));
    return [...visible];
  }
  window.CEC_UI = { findAncestorPath, getVisibleNodeIds };
}());
