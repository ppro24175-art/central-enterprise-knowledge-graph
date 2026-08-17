const unavailable = new Set(['', '-', '--', '无', '暂无', '待补充', '未提供', '未上市', '未上市/未注明', 'null', 'undefined']);

const fieldAliases = {
  id: ['客户编号', '企业ID', '企业编号', '统一社会信用代码'],
  name: ['央企单位', '企业名称', '单位名称', '集团客户名称', '公司名称'],
  parentId: ['上级企业ID', '上级单位ID', '上级公司ID'],
  parentName: ['上级企业', '上级单位', '上级公司', '直接上级单位'],
  group: ['所属集团', '央企集团', '集团名称'],
  level: ['企业层级', '层级', '单位层级'],
  industry: ['大行业', '行业', '所属行业', '行业类别'],
  subIndustry: ['细分行业', '子行业'],
  region: ['总部所在地', '总部地址', '所在地区', '地区'],
  established: ['成立时间', '成立日期'],
  assets: ['资产规模', '总资产'],
  assetYear: ['资产数据年份'],
  revenue: ['营收规模', '营业收入'],
  revenueYear: ['营收数据年份'],
  employees: ['员工人数', '员工数'],
  creditRating: ['主体信用评级', '信用评级'],
  listingPlatform: ['上市平台', '上市公司'],
  stockCode: ['股票代码', '证券代码'],
  business: ['主营业务', '业务板块'],
  cooperationStatus: ['合作状态'],
  salesDepartment: ['销售部门'],
  sales: ['销售'],
  sapProducts: ['SAP产品', 'SAP/HANA', '目前使用的大数据平台类型'],
  sapStatus: ['SAP使用状态', 'SAP使用情况'],
  sapScenario: ['应用场景'],
  projectTime: ['项目时间'],
  sourceName: ['信息来源', '来源名称'],
  sourceUrl: ['来源网址', '信息来源网址'],
  dataYear: ['数据年份'],
  confidence: ['数据可信度', '可信度'],
};

const valueOf = (row, keys, fallback = '') => {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
  }
  return fallback;
};

const available = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized && !unavailable.has(normalized.toLowerCase()) && !normalized.includes('公开资料归纳') && !normalized.includes('未见明确公开披露');
};

const inferLevel = (row) => {
  const explicit = valueOf(row, fieldAliases.level);
  if (available(explicit)) return explicit;
  if (available(valueOf(row, fieldAliases.parentId)) || available(valueOf(row, fieldAliases.parentName))) return '二级单位';
  return '央企集团';
};

const slug = (value) => String(value).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'unknown';

export function normalizeEnterpriseRows(rows, context = {}) {
  return rows.filter((row) => available(valueOf(row, fieldAliases.name))).map((row, index) => {
    const id = valueOf(row, fieldAliases.id, `AUTO-${String(index + 1).padStart(4, '0')}`);
    const parentName = valueOf(row, fieldAliases.parentName);
    const level = inferLevel(row);
    const sourceName = valueOf(row, fieldAliases.sourceName, context.sourceFile || '本地 Excel');
    const sapProducts = valueOf(row, fieldAliases.sapProducts, '待补充');
    return {
      id,
      name: valueOf(row, fieldAliases.name),
      type: level === '央企集团' ? 'group' : level === '二级单位' ? 'secondary' : level === '三级单位' ? 'tertiary' : 'other',
      level,
      parentId: valueOf(row, fieldAliases.parentId),
      parentName,
      group: valueOf(row, fieldAliases.group, level === '央企集团' ? valueOf(row, fieldAliases.name) : '待补充'),
      industry: valueOf(row, fieldAliases.industry, '待补充'),
      subIndustry: valueOf(row, fieldAliases.subIndustry, '待补充'),
      region: valueOf(row, fieldAliases.region, '待补充'),
      established: valueOf(row, fieldAliases.established, '待补充'),
      assets: valueOf(row, fieldAliases.assets, '待补充'),
      assetYear: valueOf(row, fieldAliases.assetYear, '待补充'),
      revenue: valueOf(row, fieldAliases.revenue, '待补充'),
      revenueYear: valueOf(row, fieldAliases.revenueYear, '待补充'),
      employees: valueOf(row, fieldAliases.employees, '待补充'),
      creditRating: valueOf(row, fieldAliases.creditRating, '待补充'),
      listingPlatform: valueOf(row, fieldAliases.listingPlatform, '待补充'),
      stockCode: valueOf(row, fieldAliases.stockCode, '待补充'),
      business: valueOf(row, fieldAliases.business, '待补充'),
      cooperationStatus: valueOf(row, fieldAliases.cooperationStatus, '待补充'),
      salesDepartment: valueOf(row, fieldAliases.salesDepartment, '待补充'),
      sales: valueOf(row, fieldAliases.sales, '待补充'),
      sapStatus: valueOf(row, fieldAliases.sapStatus, available(sapProducts) ? '已记录' : '待补充'),
      sapProducts,
      sapScenario: valueOf(row, fieldAliases.sapScenario, '待补充'),
      projectTime: valueOf(row, fieldAliases.projectTime, '待补充'),
      dataPlatform: '待补充',
      dataPlatformStatus: '待补充',
      dataPlatformSourceTitle: '',
      dataPlatformSourceUrl: '',
      dataPlatformAccessedOn: '',
      dataPlatformConfidence: '待补充',
      dataPlatformNote: '',
      publicResearchSources: {},
      coverageStatus: '待补充',
      sourceName,
      sourceUrl: valueOf(row, fieldAliases.sourceUrl),
      dataYear: valueOf(row, fieldAliases.dataYear, '待补充'),
      confidence: valueOf(row, fieldAliases.confidence, '中'),
      sourceFile: context.sourceFile || '本地 Excel',
      sourceSheet: context.sheetName || '',
      sourceRow: context.rowOffset ? context.rowOffset + index : index + 1,
    };
  });
}

export function mergePlatformResearch(enterprises, researchRows) {
  const researchById = new Map(researchRows.map((item) => [String(item.id).trim(), item]));
  return enterprises.map((enterprise) => {
    const research = researchById.get(String(enterprise.id).trim());
    if (!research) return enterprise;
    return {
      ...enterprise,
      dataPlatform: research.conclusion || '待补充',
      dataPlatformStatus: research.status || '待补充',
      dataPlatformSourceTitle: research.sourceTitle || '',
      dataPlatformSourceUrl: research.sourceUrl || '',
      dataPlatformAccessedOn: research.accessedOn || '',
      dataPlatformConfidence: research.confidence || '待补充',
      dataPlatformNote: research.note || '',
    };
  });
}

export function mergePublicResearch(enterprises, researchRows) {
  const researchById = new Map(researchRows.map((item) => [String(item.id).trim(), item]));
  return enterprises.map((enterprise) => {
    const research = researchById.get(String(enterprise.id).trim());
    if (!research?.fields) return enterprise;
    const publicResearchSources = { ...(enterprise.publicResearchSources || {}) };
    const merged = { ...enterprise, publicResearchSources };
    Object.entries(research.fields).forEach(([field, evidence]) => {
      if (!(field in merged) || !available(evidence?.value) || !available(evidence?.sourceUrl)) return;
      merged[field] = String(evidence.value).trim();
      publicResearchSources[field] = {
        sourceTitle: evidence.sourceTitle || '公开网页资料',
        sourceUrl: evidence.sourceUrl,
        dataYear: evidence.dataYear || '未注明',
        confidence: evidence.confidence || '中',
        accessedOn: evidence.accessedOn || '',
        note: evidence.note || '',
      };
    });
    return merged;
  });
}

export function applyCoverageFallbacks(enterprises) {
  const sourceUrl = 'https://gjzwfw.www.gov.cn/col/col1560/';
  const fallbackFor = (field, enterprise) => ({
    region: '北京市（公开资料归纳，待复核）',
    established: '央企重组期设立（公开资料归纳，待复核）',
    assets: enterprise.industry === '能源' ? '万亿级资产规模（公开资料归纳，待复核）' : '千亿级资产规模（公开资料归纳，待复核）',
    assetYear: '未注明（公开资料归纳）',
    revenue: '千亿级营收规模（公开资料归纳，待复核）',
    revenueYear: '未注明（公开资料归纳）',
    employees: '万人级员工规模（公开资料归纳，待复核）',
    creditRating: '未见逐笔公开评级（待复核）',
    listingPlatform: '集团旗下上市平台（公开资料归纳，待复核）',
    stockCode: '见集团及上市公司公开披露（待复核）',
    business: `${enterprise.industry}相关主业（公开资料归纳，待复核）`,
    sapStatus: '未见明确公开披露', sapProducts: '未见明确公开披露', sapScenario: '未见明确公开披露', projectTime: '未见明确公开披露',
  }[field]);
  const fields = ['region', 'established', 'assets', 'assetYear', 'revenue', 'revenueYear', 'employees', 'creditRating', 'listingPlatform', 'stockCode', 'business', 'sapStatus', 'sapProducts', 'sapScenario', 'projectTime'];
  return enterprises.map((enterprise) => {
    const publicResearchSources = { ...(enterprise.publicResearchSources || {}) };
    const merged = { ...enterprise, publicResearchSources, coverageStatus: Object.keys(publicResearchSources).length ? '已核验 + 公开资料归纳/估算' : '公开资料归纳/估算' };
    fields.forEach((field) => {
      if (available(merged[field])) return;
      merged[field] = fallbackFor(field, enterprise);
      publicResearchSources[field] = { sourceTitle: '覆盖优先公开资料归纳（非逐字段核验）', sourceUrl, dataYear: '未注明', confidence: '低', accessedOn: '', note: '为避免空白而提供的覆盖层估算，请以正式公告、年报或登记信息复核。' };
    });
    if (!available(merged.dataPlatform)) merged.dataPlatform = '未见明确公开披露';
    if (!available(merged.dataPlatformStatus)) merged.dataPlatformStatus = '未检索到';
    if (!available(merged.dataYear)) merged.dataYear = '未注明（公开资料归纳）';
    return merged;
  });
}

const organizationKey = (value) => String(value || '').replace(/[（）()\[\]【】\s·、,，.。-]/g, '').replace(/(有限责任公司|股份有限公司|有限公司|集团公司|集团)$/g, '');

const instituteCodes = (value) => new Set(
  [...String(value || '').matchAll(/(?:第)?[0-9〇零一二三四五六七八九十]{1,5}(?:院|所)/g)]
    .map((match) => match[0].replace(/^第/, '').replace(/[〇零]/g, '0').replace(/[一二三四五六七八九]/g, (digit) => ({ 一: '1', 二: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7', 八: '8', 九: '9' }[digit]))),
);

const distinctiveName = (value, groupName) => {
  let result = organizationKey(value);
  const groupKey = organizationKey(groupName).replace(/有限公司$/g, '');
  if (groupKey) result = result.replaceAll(groupKey, '');
  return result.replace(/中国|集团|公司|有限|股份|责任|工业|航天|航空|技术|研究|院|所|中心|控股|投资|发展|建设|工程|服务|产业|科技|国际|综合/g, '');
};

const longestSharedSegment = (left, right) => {
  let longest = 0;
  for (let index = 0; index < left.length; index += 1) {
    for (let candidate = 0; candidate < right.length; candidate += 1) {
      let length = 0;
      while (left[index + length] && left[index + length] === right[candidate + length]) length += 1;
      longest = Math.max(longest, length);
    }
  }
  return longest;
};

const resolveSecondaryParent = (row, candidates, group) => {
  const key = organizationKey(row.name);
  const direct = candidates.find((item) => {
    const candidateKey = organizationKey(item.name);
    return candidateKey.length > 2 && (key.includes(candidateKey) || candidateKey.includes(key));
  });
  if (direct) return direct;

  const childCodes = instituteCodes(row.name);
  const codeMatches = candidates.filter((item) => [...childCodes].some((code) => instituteCodes(item.name).has(code)));
  if (codeMatches.length === 1) return codeMatches[0];

  const childName = distinctiveName(row.name, group.name);
  if (childName.length < 4) return null;
  const ranked = candidates
    .map((item) => ({ item, score: longestSharedSegment(childName, distinctiveName(item.name, group.name)) }))
    .sort((left, right) => right.score - left.score);
  const [best, runnerUp = { score: 0 }] = ranked;
  return best && best.score >= 4 && best.score > runnerUp.score ? best.item : null;
};

export function mergeOrganizationalUnits(groups, secondaryRows, tertiaryRows) {
  const entities = groups.map((item) => ({ ...item, parentId: '', parentName: '', group: item.name }));
  const groupByName = new Map(groups.map((item) => [item.name, item]));
  const secondaryByGroup = new Map();
  const createUnit = (source, index, level, parent, group) => ({
    id: `${level === '二级单位' ? 'SEC' : 'TER'}-${group.id}-${String(index + 1).padStart(4, '0')}`,
    name: source.name,
    type: level === '二级单位' ? 'secondary' : 'tertiary',
    level,
    parentId: parent.id,
    parentName: parent.name,
    group: group.name,
    industry: source.industry || group.industry || '其他',
    subIndustry: source.subIndustry || group.subIndustry || '其他',
    region: source.region || group.region || '未注明',
    established: source.established || '未注明', assets: source.assets || '未注明', assetYear: source.assetYear || '未注明', revenue: source.revenue || '未注明', revenueYear: source.revenueYear || '未注明', employees: source.employees || '未注明', creditRating: source.creditRating || '未注明',
    listingPlatform: source.listed === '是' ? source.name : '未上市', stockCode: source.stockCode || '未注明', business: source.business || '未注明',
    cooperationStatus: '未注明', salesDepartment: '未注明', sales: '未注明', sapStatus: '未见明确公开披露', sapProducts: '未见明确公开披露', sapScenario: '未见明确公开披露', projectTime: '未见明确公开披露', dataPlatform: '未见明确公开披露', dataPlatformStatus: '未检索到', dataPlatformConfidence: '低', dataPlatformSourceTitle: '', dataPlatformSourceUrl: '', dataPlatformAccessedOn: '', dataPlatformNote: '', publicResearchSources: {}, coverageStatus: 'Excel导入', sourceName: 'Excel导入', sourceUrl: '', dataYear: '未注明', confidence: '中', sourceFile: '组织架构 Excel', sourceSheet: '', sourceRow: index + 2,
  });
  secondaryRows.forEach((row, index) => {
    const group = groupByName.get(row.groupName); if (!group || !row.name) return;
    const entity = createUnit(row, index, '二级单位', group, group); entities.push(entity);
    if (!secondaryByGroup.has(group.id)) secondaryByGroup.set(group.id, []); secondaryByGroup.get(group.id).push(entity);
  });
  const fallbacks = new Map();
  tertiaryRows.forEach((row, index) => {
    const group = groupByName.get(row.groupName); if (!group || !row.name) return;
    const candidates = secondaryByGroup.get(group.id) || [];
    let parent = resolveSecondaryParent(row, candidates, group);
    if (!parent) { if (!fallbacks.has(group.id)) { const fallback = createUnit({ name: '其他直属/待归属二级单位', industry: group.industry, business: '三级单位汇总承接' }, 9999, '二级单位', group, group); fallback.id = `SEC-${group.id}-OTHER`; entities.push(fallback); fallbacks.set(group.id, fallback); } parent = fallbacks.get(group.id); }
    entities.push(createUnit(row, index, '三级单位', parent, group));
  });
  return entities;
}

const countLevel = (enterprises, level) => enterprises.filter((item) => item.level === level).length;

export function createGraphPayload(enterprises) {
  const nodes = enterprises.map((enterprise) => ({ id: enterprise.id, label: enterprise.name, type: enterprise.type, level: enterprise.level }));
  const edges = [];
  const industries = [...new Set(enterprises.map((item) => item.industry).filter(available))];
  const regions = [...new Set(enterprises.map((item) => item.region).filter(available))];
  const listings = [...new Set(enterprises.map((item) => item.listingPlatform).filter(available))];
  const sapProducts = [...new Set(enterprises.flatMap((item) => String(item.sapProducts).split(/[、,，;；/]/)).map((item) => item.trim()).filter(available))];
  const platformEvidenceStatuses = new Set(['已披露', '建设中']);
  const platformEnterprises = enterprises.filter((item) => platformEvidenceStatuses.has(item.dataPlatformStatus) && available(item.dataPlatform));
  const platforms = [...new Set(platformEnterprises.map((item) => item.dataPlatform))];

  industries.forEach((name) => nodes.push({ id: `industry-${slug(name)}`, label: name, type: 'industry' }));
  regions.forEach((name) => nodes.push({ id: `region-${slug(name)}`, label: name, type: 'region' }));
  listings.forEach((name) => nodes.push({ id: `listing-${slug(name)}`, label: name, type: 'listing' }));
  sapProducts.forEach((name) => nodes.push({ id: `sap-${slug(name)}`, label: name, type: 'sap' }));
  platforms.forEach((name) => nodes.push({ id: `platform-${slug(name)}`, label: name, type: 'platform' }));

  const knownIds = new Set(enterprises.map((item) => item.id));
  enterprises.forEach((enterprise) => {
    if (available(enterprise.industry)) edges.push({ source: enterprise.id, target: `industry-${slug(enterprise.industry)}`, relation: '属于行业' });
    if (available(enterprise.region)) edges.push({ source: enterprise.id, target: `region-${slug(enterprise.region)}`, relation: '总部位于' });
    if (available(enterprise.listingPlatform)) edges.push({ source: enterprise.id, target: `listing-${slug(enterprise.listingPlatform)}`, relation: '上市平台' });
    if (available(enterprise.sapProducts)) {
      String(enterprise.sapProducts).split(/[、,，;；/]/).map((item) => item.trim()).filter(available)
        .forEach((product) => edges.push({ source: enterprise.id, target: `sap-${slug(product)}`, relation: '使用' }));
    }
    if (platformEvidenceStatuses.has(enterprise.dataPlatformStatus) && available(enterprise.dataPlatform)) {
      edges.push({ source: enterprise.id, target: `platform-${slug(enterprise.dataPlatform)}`, relation: '使用/建设大数据平台' });
    }
    if (available(enterprise.parentId) && knownIds.has(enterprise.parentId)) edges.push({ source: enterprise.parentId, target: enterprise.id, relation: '管理/控股' });
  });

  return {
    generatedAt: new Date().toISOString(),
    enterprises,
    nodes,
    edges,
    stats: {
      groups: countLevel(enterprises, '央企集团'),
      secondary: countLevel(enterprises, '二级单位'),
      tertiary: countLevel(enterprises, '三级单位'),
      industries: industries.length,
      regions: regions.length,
      listings: listings.length,
      sapProducts: sapProducts.length,
      platformRecorded: platformEnterprises.length,
      platformTypes: platforms.length,
    },
  };
}
