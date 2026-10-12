import * as Minio from 'minio';

/**
 * MinIO object storage for uploaded photos and videos.
 * The bucket is private; files are served back through GET /api/media/f/<key>.
 */

let client = null;

export const bucket = () => process.env.MINIO_BUCKET || 'profile-blog-media';

export function storage() {
  if (client) return client;
  const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY } = process.env;
  if (!MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) return null;
  client = new Minio.Client({
    endPoint: MINIO_ENDPOINT,
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: MINIO_ACCESS_KEY,
    secretKey: MINIO_SECRET_KEY,
  });
  return client;
}

/** Log whether storage is reachable; never blocks startup (blog reading works without it). */
export async function checkStorage() {
  const c = storage();
  if (!c) {
    console.warn('MinIO is not configured: media uploads are disabled.');
    return;
  }
  try {
    const exists = await c.bucketExists(bucket());
    console.log(exists ? `MinIO bucket "${bucket()}" ready` : `MinIO bucket "${bucket()}" does not exist`);
  } catch (err) {
    console.warn('MinIO is unreachable:', err.message);
  }
}
