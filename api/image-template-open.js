// 개인 AWS 키 폐기(2026-11-20) 대비: 직접 서명하지 않고 팀 공용 Lambda URL로 보낸다.
// Lambda가 role 임시 자격증명으로 presigned URL(302)을 만들어 주므로 이 서비스에는 AWS 키가 필요 없다.
const PROXY_BASE = (process.env.PUBLIC_PROXY_BASE ||
  "https://zvy2p6g4fa2tc2e7f46u2kwafe0ogiog.lambda-url.us-east-1.on.aws").replace(/\/+$/, "");
const BUCKET = process.env.S3_BUCKET || "perception-public-data-us-east-1-prod";

function proxyUrl(key) {
  return `${PROXY_BASE}/${BUCKET}/${key}`;
}

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || "");
}

function isValidSite(site) {
  return /^[A-Za-z0-9_-]+$/.test(site || "");
}

module.exports = async function handler(req, res) {
  try {
    const { date, site } = req.query || {};

    if (!isValidDate(date) || !isValidSite(site)) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Invalid date or site");
      return;
    }

    const key = `${date}/${site}.jpg`;
    const url = proxyUrl(key);

    res.statusCode = 302;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", url);
    res.end();
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Failed to open image template");
  }
};
