# Tools Hub

App desktop gom các Tool cho lập trình viên vào một chỗ: format JSON, Base64, hash, JWT… Chạy hoàn toàn offline, không
telemetry, không cần tài khoản. Dữ liệu bạn dán vào không bao giờ rời khỏi máy và không được ghi xuống đĩa.

## Tải về

Vào trang [Releases](https://github.com/trinhdinhtai/tools-hub/releases/latest) và chọn file cho hệ điều hành của bạn:

| Hệ điều hành | File |
| ------------ | ---- |
| Windows 10 1809+ | `Tools Hub_<phiên bản>_x64-setup.exe` (hoặc `.msi`) |
| Windows, máy không có Internet | `Tools Hub_<phiên bản>_x64-offline-setup.exe`, đã nhúng sẵn WebView2 |
| macOS 11+ (Apple silicon) | `Tools Hub_<phiên bản>_aarch64.dmg` |
| macOS 11+ (Intel) | `Tools Hub_<phiên bản>_x64.dmg` |
| Linux (Ubuntu 22.04+) | `.AppImage`, `.deb` hoặc `.rpm` |

### Windows: cảnh báo SmartScreen

Bản Windows hiện chưa được ký số (đang chờ chứng chỉ từ SignPath Foundation), nên lần đầu chạy installer Windows có
thể hiện cảnh báo **"Windows protected your PC"** (Windows đã bảo vệ máy tính của bạn). Để cài tiếp:

1. Bấm **More info** (Thông tin thêm).
2. Kiểm tra dòng **App** là tên installer bạn vừa tải từ trang Releases của repo này.
3. Bấm **Run anyway** (Vẫn chạy).

Nếu trình duyệt chặn file khi tải về, chọn **Keep** (Giữ lại) trong danh sách tải xuống. Cũng có thể bỏ chặn trước khi
chạy: chuột phải file → **Properties** → tick **Unblock** → **OK**.

Chỉ làm vậy với file tải từ trang Releases chính thức. Mỗi bản cập nhật trong app đều được ký bằng khoá của Tools Hub và
bị từ chối nếu chữ ký không khớp.

### macOS: app chưa được ký

Nếu macOS báo app "cannot be opened because the developer cannot be verified", chuột phải app trong Applications →
**Open** → **Open**. Chỉ cần làm một lần.

## Cập nhật

Tools Hub không bao giờ tự kiểm tra cập nhật hay tự gọi mạng ([ADR-0001](docs/adr/0001-no-network-without-user-action.md)).
Khi muốn, mở **Cài đặt → Cập nhật → Kiểm tra cập nhật**. Nếu có bản mới, app hiện changelog; bạn tự quyết định có bấm
**Cài và khởi động lại** hay không.

## Phát triển

```sh
pnpm install
pnpm tauri dev      # chạy app
pnpm test           # test
pnpm lint && pnpm typecheck
```

Cách phát hành một bản mới: xem [docs/release-checklist.md](docs/release-checklist.md).

## Giấy phép

MIT
