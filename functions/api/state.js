// Cloudflare Pages Function: /api/state with D1 and Auth & Role Control
import { reply, ensureUsersTable, authenticateRequest } from './_auth.js';

const PAID_STATUSES = ['Done', 'Đã thanh toán (chờ chứng từ)', 'Đã thanh toán (chờ giao hàng)'];

async function ensure(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL, updated_at TEXT NOT NULL)').run();
  await db.prepare("INSERT OR IGNORE INTO app_state(id,revision,payload,updated_at) VALUES(1,0,'{\"beneficiaries\":[],\"requests\":[],\"payment_groups\":[],\"handovers\":[]}',CURRENT_TIMESTAMP)").run();
}

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (request.method === 'OPTIONS') {
    return reply({}, 204);
  }

  if (!db) {
    return reply({ ok: false, error: 'Chưa cấu hình D1 binding tên DB trong Pages Settings > Bindings.' }, 503);
  }

  try {
    await ensureUsersTable(db);
    await ensure(db);

    // Verify session authentication
    const currentUser = await authenticateRequest(request, db);
    if (!currentUser) {
      return reply({
        ok: false,
        error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
        code: 'UNAUTHORIZED'
      }, 401);
    }

    // 1. GET DATA
    if (request.method === 'GET') {
      const record = await db.prepare('SELECT revision, payload, updated_at FROM app_state WHERE id = 1').first();
      return reply({
        ok: true,
        revision: record.revision,
        updated_at: record.updated_at,
        data: JSON.parse(record.payload),
        currentUser: {
          id: currentUser.id,
          username: currentUser.username,
          full_name: currentUser.full_name,
          role: currentUser.role
        }
      });
    }

    // 2. PUT DATA
    if (request.method !== 'PUT') {
      return reply({ ok: false, error: 'Method not allowed' }, 405);
    }

    const raw = await request.text();
    if (raw.length > 2000000) {
      return reply({ ok: false, error: 'Dữ liệu vượt giới hạn 2 MB' }, 413);
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply({ ok: false, error: 'JSON không hợp lệ' }, 400);
    }

    const data = body?.data;
    if (
      !Number.isSafeInteger(body?.revision) ||
      body.revision < 0 ||
      !data ||
      !Array.isArray(data.requests) ||
      !Array.isArray(data.beneficiaries)
    ) {
      return reply({ ok: false, error: 'Sai cấu trúc dữ liệu' }, 400);
    }

    // Single user app: all authenticated users have full access to update data

    const current = await db.prepare(
      'UPDATE app_state SET payload = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = 1 AND revision = ?'
    ).bind(JSON.stringify(data), body.revision).run();

    if (current.meta.changes !== 1) {
      return reply({
        ok: false,
        error: 'Dữ liệu đã được thay đổi trên một phiên làm việc khác. Hãy tải lại trang trước khi sửa.'
      }, 409);
    }

    return reply({ ok: true, revision: body.revision + 1 });
  } catch (e) {
    return reply({ ok: false, error: 'D1: ' + String(e.message || e) }, 500);
  }
}
