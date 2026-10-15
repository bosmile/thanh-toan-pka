// Cloudflare Pages Function: /api/auth
import {
  reply,
  randomHex,
  hashPassword,
  verifyPassword,
  getJwtSecret,
  signJwt,
  ensureUsersTable,
  authenticateRequest
} from './_auth.js';

export async function onRequest(context) {
  const { request, env } = context;
  const db = env.DB;

  if (request.method === 'OPTIONS') {
    return reply({}, 204);
  }

  if (!db) {
    return reply({ ok: false, error: 'Chưa cấu hình D1 binding tên DB trong Cloudflare Pages Settings.' }, 503);
  }

  try {
    await ensureUsersTable(db);
    const url = new URL(request.url);
    const action = url.searchParams.get('action') || 'me';

    // 0. CHECK SETUP (Hệ thống có cần tạo tài khoản admin đầu tiên không)
    if (request.method === 'GET' && action === 'check-setup') {
      const countRow = await db.prepare('SELECT COUNT(*) as count FROM app_users').first();
      const setupNeeded = !countRow || countRow.count === 0;
      return reply({ ok: true, setupNeeded });
    }

    // 0.1 INITIAL SETUP (Người quản trị tự đặt tài khoản và mật khẩu lần đầu)
    if (request.method === 'POST' && action === 'initial-setup') {
      const countRow = await db.prepare('SELECT COUNT(*) as count FROM app_users').first();
      if (countRow && countRow.count > 0) {
        return reply({ ok: false, error: 'Hệ thống đã được thiết lập tài khoản quản trị. Vui lòng đăng nhập.' }, 403);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return reply({ ok: false, error: 'Dữ liệu JSON không hợp lệ' }, 400);
      }

      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '').trim();
      const full_name = String(body.full_name || '').trim();

      if (!username || !password || !full_name) {
        return reply({ ok: false, error: 'Vui lòng nhập đầy đủ thông tin tài khoản quản trị' }, 400);
      }
      if (password.length < 6) {
        return reply({ ok: false, error: 'Mật khẩu quản trị phải từ 6 ký tự trở lên' }, 400);
      }

      const salt = randomHex(16);
      const hash = await hashPassword(password, salt);
      const now = new Date().toISOString();

      await db.prepare(`
        INSERT INTO app_users (username, password_hash, salt, full_name, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'admin', 1, ?, ?)
      `).bind(username, hash, salt, full_name, now, now).run();

      const secret = await getJwtSecret(db);
      const token = await signJwt({
        sub: username,
        role: 'admin',
        name: full_name,
        iat: Math.floor(Date.now() / 1000)
      }, secret);

      const cookie = `pka_session=${encodeURIComponent(token)}; Path=/; Max-Age=315360000; HttpOnly; SameSite=Lax`;

      return reply({
        ok: true,
        token,
        user: {
          username,
          full_name,
          role: 'admin'
        },
        message: 'Khởi tạo tài khoản quản trị thành công!'
      }, 200, { 'Set-Cookie': cookie });
    }

    // 1. LOGIN
    if (request.method === 'POST' && action === 'login') {
      let body;
      try {
        body = await request.json();
      } catch {
        return reply({ ok: false, error: 'Dữ liệu JSON không hợp lệ' }, 400);
      }

      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '').trim();

      if (!username || !password) {
        return reply({ ok: false, error: 'Vui lòng nhập tài khoản và mật khẩu' }, 400);
      }

      const user = await db.prepare(
        'SELECT * FROM app_users WHERE LOWER(username) = ?'
      ).bind(username).first();

      if (!user) {
        return reply({ ok: false, error: 'Tài khoản hoặc mật khẩu không chính xác' }, 401);
      }

      if (user.is_active !== 1) {
        return reply({ ok: false, error: 'Tài khoản này đã bị khóa. Vui lòng liên hệ quản trị viên.' }, 403);
      }

      const match = await verifyPassword(password, user.password_hash, user.salt);
      if (!match) {
        return reply({ ok: false, error: 'Tài khoản hoặc mật khẩu không chính xác' }, 401);
      }

      const secret = await getJwtSecret(db);
      const token = await signJwt({
        sub: user.username,
        role: user.role,
        name: user.full_name,
        iat: Math.floor(Date.now() / 1000)
      }, secret);

      const cookie = `pka_session=${encodeURIComponent(token)}; Path=/; Max-Age=315360000; HttpOnly; SameSite=Lax`;

      return reply({
        ok: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          role: user.role
        }
      }, 200, { 'Set-Cookie': cookie });
    }

    // 2. LOGOUT
    if (request.method === 'POST' && action === 'logout') {
      const cookie = 'pka_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax';
      return reply({ ok: true, message: 'Đã đăng xuất' }, 200, { 'Set-Cookie': cookie });
    }

    // AUTH REQUIRED FOR REMAINING ACTIONS
    const currentUser = await authenticateRequest(request, db);
    if (!currentUser) {
      return reply({ ok: false, error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn', code: 'UNAUTHORIZED' }, 401);
    }

    // 3. GET CURRENT USER
    if (request.method === 'GET' && action === 'me') {
      return reply({
        ok: true,
        user: {
          id: currentUser.id,
          username: currentUser.username,
          full_name: currentUser.full_name,
          role: currentUser.role
        }
      });
    }

    // 4. CHANGE PASSWORD
    if (request.method === 'POST' && action === 'change-password') {
      let body;
      try {
        body = await request.json();
      } catch {
        return reply({ ok: false, error: 'Dữ liệu JSON không hợp lệ' }, 400);
      }

      const oldPassword = String(body.oldPassword || '');
      const newPassword = String(body.newPassword || '').trim();

      if (!newPassword || newPassword.length < 4) {
        return reply({ ok: false, error: 'Mật khẩu mới phải có ít nhất 4 ký tự' }, 400);
      }

      const user = await db.prepare('SELECT * FROM app_users WHERE id = ?').bind(currentUser.id).first();
      const match = await verifyPassword(oldPassword, user.password_hash, user.salt);
      if (!match) {
        return reply({ ok: false, error: 'Mật khẩu hiện tại không đúng' }, 400);
      }

      const newSalt = randomHex(16);
      const newHash = await hashPassword(newPassword, newSalt);
      const now = new Date().toISOString();

      await db.prepare(
        'UPDATE app_users SET password_hash = ?, salt = ?, updated_at = ? WHERE id = ?'
      ).bind(newHash, newSalt, now, currentUser.id).run();

      return reply({ ok: true, message: 'Đổi mật khẩu thành công.' });
    }

    // 5. ADMIN ONLY: LIST USERS
    if (request.method === 'GET' && action === 'users') {
      if (currentUser.role !== 'admin') {
        return reply({ ok: false, error: 'Chỉ Quản trị viên mới có quyền xem danh sách người dùng' }, 403);
      }

      const users = await db.prepare(
        'SELECT id, username, full_name, role, is_active, created_at, updated_at FROM app_users ORDER BY id ASC'
      ).all();

      return reply({ ok: true, users: users.results || [] });
    }

    // 6. ADMIN ONLY: CREATE USER
    if (request.method === 'POST' && action === 'create-user') {
      if (currentUser.role !== 'admin') {
        return reply({ ok: false, error: 'Chỉ Quản trị viên mới có quyền tạo người dùng' }, 403);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return reply({ ok: false, error: 'Dữ liệu JSON không hợp lệ' }, 400);
      }

      const username = String(body.username || '').trim().toLowerCase();
      const password = String(body.password || '').trim();
      const full_name = String(body.full_name || '').trim();
      const role = String(body.role || 'requester').trim();

      if (!username || !password || !full_name) {
        return reply({ ok: false, error: 'Vui lòng nhập đầy đủ tên đăng nhập, họ tên và mật khẩu' }, 400);
      }

      if (!['admin', 'approver', 'requester'].includes(role)) {
        return reply({ ok: false, error: 'Vai trò người dùng không hợp lệ' }, 400);
      }

      const exists = await db.prepare('SELECT id FROM app_users WHERE LOWER(username) = ?').bind(username).first();
      if (exists) {
        return reply({ ok: false, error: 'Tên đăng nhập đã tồn tại' }, 400);
      }

      const salt = randomHex(16);
      const hash = await hashPassword(password, salt);
      const now = new Date().toISOString();

      await db.prepare(`
        INSERT INTO app_users (username, password_hash, salt, full_name, role, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      `).bind(username, hash, salt, full_name, role, now, now).run();

      return reply({ ok: true, message: 'Tạo tài khoản thành công.' });
    }

    // 7. ADMIN ONLY: UPDATE USER
    if (request.method === 'POST' && action === 'update-user') {
      if (currentUser.role !== 'admin') {
        return reply({ ok: false, error: 'Chỉ Quản trị viên mới có quyền sửa người dùng' }, 403);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return reply({ ok: false, error: 'Dữ liệu JSON không hợp lệ' }, 400);
      }

      const id = Number(body.id);
      const full_name = String(body.full_name || '').trim();
      const role = String(body.role || '').trim();
      const is_active = body.is_active === 0 || body.is_active === false ? 0 : 1;
      const newPassword = String(body.newPassword || '').trim();

      if (!id || !full_name || !['admin', 'approver', 'requester'].includes(role)) {
        return reply({ ok: false, error: 'Dữ liệu cập nhật không hợp lệ' }, 400);
      }

      if (id === currentUser.id && is_active === 0) {
        return reply({ ok: false, error: 'Không thể tự vô hiệu hóa tài khoản quản trị của chính bạn' }, 400);
      }

      const now = new Date().toISOString();

      if (newPassword) {
        if (newPassword.length < 4) {
          return reply({ ok: false, error: 'Mật khẩu mới phải từ 4 ký tự trở lên' }, 400);
        }
        const salt = randomHex(16);
        const hash = await hashPassword(newPassword, salt);
        await db.prepare(`
          UPDATE app_users SET full_name = ?, role = ?, is_active = ?, password_hash = ?, salt = ?, updated_at = ?
          WHERE id = ?
        `).bind(full_name, role, is_active, hash, salt, now, id).run();
      } else {
        await db.prepare(`
          UPDATE app_users SET full_name = ?, role = ?, is_active = ?, updated_at = ?
          WHERE id = ?
        `).bind(full_name, role, is_active, now, id).run();
      }

      return reply({ ok: true, message: 'Cập nhật người dùng thành công.' });
    }

    // 8. ADMIN ONLY: DELETE USER
    if (request.method === 'POST' && action === 'delete-user') {
      if (currentUser.role !== 'admin') {
        return reply({ ok: false, error: 'Chỉ Quản trị viên mới có quyền xóa người dùng' }, 403);
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return reply({ ok: false, error: 'Dữ liệu JSON không hợp lệ' }, 400);
      }

      const id = Number(body.id);
      if (!id) return reply({ ok: false, error: 'Thiếu ID người dùng' }, 400);

      if (id === currentUser.id) {
        return reply({ ok: false, error: 'Không thể tự xóa tài khoản của chính bạn' }, 400);
      }

      await db.prepare('DELETE FROM app_users WHERE id = ?').bind(id).run();
      return reply({ ok: true, message: 'Đã xóa tài khoản người dùng.' });
    }

    return reply({ ok: false, error: 'Hành động không được hỗ trợ' }, 404);
  } catch (err) {
    return reply({ ok: false, error: 'Lỗi máy chủ Auth: ' + String(err.message || err) }, 500);
  }
}
