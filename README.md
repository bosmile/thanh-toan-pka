# PHENIKAA · Quản lý đề nghị thanh toán (Online Cloudflare D1)

Hệ thống quản lý, lập và phê duyệt đề nghị thanh toán trực tuyến dành cho **Công ty Cổ phần Dược phẩm Phenikaa**.

Dự án được tối ưu hóa cho **Cloudflare Pages**, kết hợp cơ sở dữ liệu phân tán **Cloudflare D1** và xác thực phân quyền an toàn chuẩn **Web Crypto API (HMAC-SHA256 JWT)**.

---

## 🌟 Tính năng chính

### 1. Bảng DATA nhập liệu trực tiếp (Excel-like Grid)
- Nhập và chỉnh sửa trực tiếp từng ô: Đơn vị hưởng lợi, nội dung, hàng hóa/dịch vụ, hóa đơn, số tiền, loại tiền (VND, USD, EUR), hồ sơ đi kèm, trạng thái, tài khoản, ngân hàng.
- Điều hướng bằng phím **Tab**, **Shift+Tab**, **Enter** mượt mà như bảng tính Excel.
- Tìm kiếm tức thời (full-text search) theo tên nhà cung cấp, STT, nội dung, số hóa đơn.
- Lọc theo trạng thái thanh toán hoặc theo Nhóm hợp đồng / Đơn hàng.
- Tự động gợi ý ngân hàng và thông tin nhà cung cấp khi gõ.
- Hỗ trợ chi tiết nhiều dòng hàng hóa / hóa đơn trên một phiếu đề nghị thanh toán.

### 2. Hệ thống Bảo mật & Phân quyền (RBAC)
- **Quản trị viên (`admin`)**:
  - Toàn quyền hệ thống, phê duyệt đề nghị, cấu hình danh mục.
  - Quản lý tài khoản: Tạo người dùng mới, phân quyền, đặt lại mật khẩu, khóa/mở khóa tài khoản.
  - Sao lưu (Export) và Khôi phục (Restore) toàn bộ cơ sở dữ liệu JSON.
- **Người duyệt / Kế toán (`approver`)**:
  - Xem toàn bộ danh sách đề nghị thanh toán.
  - Phê duyệt và chuyển trạng thái thanh toán: `Done`, `Đã thanh toán (chờ chứng từ)`, `Đã thanh toán (chờ giao hàng)`, `Đã giao KT, chờ đi tiền`...
  - Quản lý & đối soát Nhóm hợp đồng / Đơn hàng (giá trị hợp đồng, đã trả, còn lại).
  - Quản lý danh mục nhà cung cấp (NCC).
  - In phiếu thanh toán đơn lẻ hoặc in hàng loạt phiếu đã chọn.
- **Người đề nghị / Nhân viên (`requester`)**:
  - Tạo mới đề nghị thanh toán, nhập chi tiết hàng hóa, hóa đơn, chứng từ đi kèm.
  - Chỉ được chỉnh sửa các phiếu do mình tạo hoặc các phiếu chưa hoàn tất.
  - **Không có quyền tự ý chuyển trạng thái sang `Done` / `Đã thanh toán`** (chỉ Người duyệt mới có quyền hoàn tất).
  - Bảo vệ dữ liệu: Không thể xóa các phiếu đã duyệt hoặc đã thanh toán; không thể tự ghi đè khôi phục cơ sở dữ liệu.

### 3. In ấn chuẩn Mẫu 01 - TT
- Tạo mẫu in chuẩn **Giấy đề nghị thanh toán bằng chuyển khoản** của Công ty Cổ phần Dược phẩm Phenikaa.
- Tự động chuyển đổi số tiền thành chữ tiếng Việt chuẩn xác (hỗ trợ cả VND, USD, EUR).
- Tự động điền ngày tháng, họ tên người lập phiếu dựa trên tài khoản đăng nhập.
- Tích hợp 4 chữ ký: Lãnh đạo phê duyệt, Kế toán trưởng, Trưởng bộ phận, Người đề nghị TT.
- Hỗ trợ in 1 phiếu hoặc in hàng loạt các dòng được tích chọn cùng lúc.

### 4. Quản lý Nhóm hợp đồng / Đơn hàng & NCC
- Nhóm hợp đồng: Theo dõi tổng giá trị hợp đồng, số tiền đã thanh toán, số tiền chờ giải ngân và số dư còn lại theo từng loại tiền tệ.
- Tạo nhóm trực tiếp ngay khi nhập liệu trên bảng DATA.
- Danh mục Nhà cung cấp: Lưu trữ tên đầy đủ, tên viết tắt, địa chỉ, số tài khoản và ngân hàng. Tự động thêm vào danh mục khi nhập mới.

---

## 🔑 Tài khoản mặc định hệ thống

Hệ thống được khởi tạo sẵn 3 tài khoản mẫu với 3 vai trò khác nhau (có thể đổi mật khẩu sau khi đăng nhập):

| Tên đăng nhập | Mật khẩu mặc định | Họ và tên | Vai trò (Role) | Quyền hạn |
| :--- | :--- | :--- | :--- | :--- |
| `admin` | `admin@phenikaa` | Quản trị hệ thống | `admin` | Toàn quyền, quản lý user, sao lưu/khôi phục |
| `approver` | `duyet@phenikaa` | Kế toán trưởng / Phê duyệt | `approver` | Duyệt trạng thái, nhóm hợp đồng, NCC, in ấn |
| `nhanvien` | `nhanvien@phenikaa` | Trần Hải Hà (Cung ứng) | `requester` | Tạo phiếu mới, nhập chi tiết chứng từ |

---

## 🚀 Hướng dẫn triển khai lên Cloudflare Pages

### 1. Yêu cầu chuẩn bị
- Tài khoản [Cloudflare](https://dash.cloudflare.com).
- Đã liên kết tài khoản GitHub với Cloudflare Pages.

### 2. Các bước triển khai
1. Đăng nhập Cloudflare Dashboard > **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
2. Chọn repository `thanh-toan-pka`.
3. Cấu hình bản dựng (Build Settings):
   - **Framework preset**: `None`
   - **Build command**: *(để trống)*
   - **Build output directory**: `public`
4. Bấm **Save and Deploy**.
5. Tạo cơ sở dữ liệu Cloudflare D1:
   - Vào mục **Workers & Pages** > **D1 SQL Database** > **Create database**.
   - Đặt tên database (ví dụ: `thanh-toan-db`).
6. Liên kết D1 với Pages:
   - Vào dự án Pages vừa tạo > **Settings** > **Bindings**.
   - Thêm D1 Database binding với:
     - **Variable name**: `DB` *(bắt buộc viết hoa chính xác là `DB`)*
     - **D1 database**: chọn database `thanh-toan-db` vừa tạo.
7. Triển khai lại (Redeploy) hoặc push commit mới lên nhánh `main` của GitHub để kích hoạt kết nối.

---

## 📁 Cấu trúc thư mục

```text
├── functions/
│   └── api/
│       ├── _auth.js      # Tiện ích bảo mật: WebCrypto JWT, SHA-256 hash, xác thực phiên
│       ├── auth.js       # API /api/auth: Login, logout, đổi mật khẩu, quản lý người dùng
│       └── state.js      # API /api/state: Lưu trữ trạng thái D1, phân quyền RBAC
├── public/
│   ├── _headers          # Cấu hình bảo mật HTTP headers (nosniff, no-store...)
│   ├── index.html        # Giao diện chính SPA (gồm bảng DATA, NCC, Nhóm, Modal đăng nhập/phân quyền)
│   └── robots.txt        # Chặn bot công cụ tìm kiếm
└── README.md             # Tài liệu dự án
```

---

© 2026 Phenikaa Pharma. Bản quyền thuộc về tác giả và Công ty Cổ phần Dược phẩm Phenikaa.
