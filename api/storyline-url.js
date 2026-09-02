const DEFAULT_SITE_API_URL =
  "https://site-lookup-api-291857121097.asia-northeast3.run.app";

function json(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function isValidSite(site) {
  return /^[A-Za-z0-9_-]+$/.test(site || "");
}

function storylineUrl(companyId, classroomId) {
  return `https://storyline.playtag.ai/ko/link/${encodeURIComponent(companyId)}/${encodeURIComponent(classroomId)}?action=dependents`;
}

function pickArray(payload, keys) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function pickString(value) {
  return String(value || "").trim();
}

function normalizeMatch(row) {
  const companyId = pickString(
    row.company_id || row.companyId || row.teacher_org_id || row.teacherOrgId
  );
  const classroomId = pickString(
    row.classroom_id || row.classroomId || row.teacher_class_id || row.teacherClassId
  );
  const siteId = pickString(row.site_id || row.siteId || row.position_id || row.positionId);
  if (!companyId || !classroomId) return null;
  return {
    companyId,
    classroomId,
    siteId,
    institutionName: pickString(row.institution_name || row.institutionName || row.company_name || row.companyName),
    className: pickString(row.class_name || row.className || row.classroom_name || row.classroomName),
  };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`POST ${url} failed: ${response.status}`);
  return response.json();
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`);
  return response.json();
}

async function lookupViaDirectoryAction(site) {
  const url = pickString(process.env.DIRECTORY_API_URL);
  const apiKey = pickString(process.env.DIRECTORY_API_KEY);
  if (!url || !apiKey) return [];

  const actionNames = [
    "storylineBySite",
    "storylineLinksBySite",
    "siteDetailsBySite",
  ];
  for (const action of actionNames) {
    try {
      const payload = await postJson(url, { action, siteID: site, siteId: site, apiKey });
      if (payload?.ok === false) continue;
      const rows = [
        ...pickArray(payload, ["matches", "rows", "sites", "links"]),
        payload.match,
        payload.site,
      ].filter(Boolean);
      const matches = rows.map(normalizeMatch).filter(Boolean);
      if (matches.length) return matches;
    } catch (error) {
      console.warn(`directory action ${action} failed`, error.message);
    }
  }
  return [];
}

async function lookupViaTeacherPhones(site) {
  const directoryUrl = pickString(process.env.DIRECTORY_API_URL);
  const directoryKey = pickString(process.env.DIRECTORY_API_KEY);
  const siteApiUrl = pickString(process.env.SITE_API_URL || DEFAULT_SITE_API_URL);
  const siteApiKey = pickString(process.env.SITE_API_KEY);
  if (!directoryUrl || !directoryKey || !siteApiUrl || !siteApiKey) return [];

  const teachers = await postJson(directoryUrl, {
    action: "teachersBySite",
    siteID: site,
    apiKey: directoryKey,
  });
  const phones = [
    ...pickArray(teachers, ["phoneNumbers", "phones", "rows"]),
  ].map(row => pickString(typeof row === "string" ? row : row.phone_number || row.phoneNumber || row.phone))
    .filter(Boolean)
    .slice(0, 5);

  const matches = [];
  for (const phone of phones) {
    try {
      const payload = await getJson(
        `${siteApiUrl.replace(/\/$/, "")}/channel-user?phone=${encodeURIComponent(phone)}`,
        { Authorization: `Bearer ${siteApiKey}` }
      );
      for (const row of pickArray(payload, ["matches", "rows"])) {
        const match = normalizeMatch(row);
        if (match && (!match.siteId || match.siteId.toLowerCase() === site.toLowerCase())) {
          matches.push(match);
        }
      }
    } catch (error) {
      console.warn(`site api phone lookup failed`, error.message);
    }
  }
  return matches;
}

module.exports = async function handler(req, res) {
  try {
    const site = pickString(req.query?.site);
    if (!isValidSite(site)) {
      json(res, 400, { ok: false, error: "Invalid site" });
      return;
    }

    const matches = [
      ...(await lookupViaDirectoryAction(site)),
      ...(await lookupViaTeacherPhones(site)),
    ];
    const unique = [];
    const seen = new Set();
    for (const match of matches) {
      const key = `${match.companyId}:${match.classroomId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(match);
    }

    if (!unique.length) {
      json(res, 404, {
        ok: false,
        error: "STORYLINE_MAPPING_NOT_FOUND",
        message: "이 siteID에 연결된 스토리라인 기관/교실 ID를 찾지 못했습니다.",
      });
      return;
    }
    if (unique.length > 1) {
      json(res, 409, {
        ok: false,
        error: "MULTIPLE_STORYLINE_MAPPINGS",
        message: "이 siteID에 여러 스토리라인 교실 후보가 있습니다.",
        matches: unique,
      });
      return;
    }

    const match = unique[0];
    json(res, 200, {
      ok: true,
      url: storylineUrl(match.companyId, match.classroomId),
      ...match,
    });
  } catch (error) {
    console.error(error);
    json(res, 500, { ok: false, error: "Failed to create Storyline URL" });
  }
};
