const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const REGION = process.env.AWS_REGION || "us-east-1";
const BUCKET = process.env.S3_BUCKET || "perception-public-data-us-east-1-prod";
const EXPIRES_IN_SECONDS = Number(process.env.IMAGE_TEMPLATE_URL_TTL_SECONDS || 600);

const s3 = new S3Client({
  region: REGION,
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN || undefined,
      }
    : undefined,
});

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
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "Invalid date or site" }));
      return;
    }

    const key = `${date}/${site}.jpg`;
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    const url = await getSignedUrl(s3, command, {
      expiresIn: EXPIRES_IN_SECONDS,
    });

    res.statusCode = 200;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      url,
      bucket: BUCKET,
      key,
      expiresIn: EXPIRES_IN_SECONDS,
    }));
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Failed to create image template URL" }));
  }
};
