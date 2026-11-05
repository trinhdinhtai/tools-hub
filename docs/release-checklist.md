# Release checklist

Những gì test tự động không với tới được (tray, hotkey của hệ điều hành, single instance, autostart, updater). Chạy trên
bản build, không phải `pnpm tauri dev`: tải installer từ draft release (hoặc file exe từ Artifacts của CI). Ghi kết quả
từng lần release vào bảng ở cuối.

## Phát hành một bản mới (#10)

Chuẩn bị một lần: khoá ký updater nằm ở `~/.tauri/tools-hub.key` trên máy người bảo trì (public key của nó nằm trong
`plugins.updater.pubkey` ở `src-tauri/tauri.conf.json`). Lưu private key thành secret của repo:
`gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/tools-hub.key`. Khoá hiện không có mật khẩu; nếu đặt mật khẩu thì lưu
thêm secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Mất khoá thì các bản đã cài không nhận được cập nhật nữa, nên giữ một
bản sao ở nơi an toàn. Build cục bộ có tạo bundle (`pnpm tauri build`) cũng cần biến môi trường `TAURI_SIGNING_PRIVATE_KEY`.

1. Tăng `version` ở `package.json`, `src-tauri/tauri.conf.json` và `src-tauri/Cargo.toml`, merge vào `main`.
2. `git tag v<phiên bản> && git push origin v<phiên bản>`. Workflow **Release** dừng ngay nếu tag không khớp `version`.
3. Workflow tạo một **draft** release, ghi changelog từ các PR đã merge, rồi đính kèm installer Windows (thường và
   offline nhúng WebView2), macOS (Apple silicon, Intel), Linux, các file `.sig` và `latest.json`.
4. Changelog trong app lấy từ `latest.json`, được ghi lúc build. Sửa ghi chú trên trang draft không đổi changelog trong
   app; muốn đổi thì sửa trường `notes` trong `latest.json` rồi upload lại (`gh release upload v<phiên bản> latest.json --clobber`).
5. Mở `latest.json` trong draft: `platforms` phải có đủ `windows-x86_64`, `darwin-aarch64`, `darwin-x86_64`,
   `linux-x86_64`. Các job build chạy song song cùng ghi vào file này, nên hiếm khi một nền tảng bị mất; khi đó chạy lại
   job của nền tảng đó (Re-run failed jobs / Re-run job).
6. Chạy các mục dưới đây trên bản trong draft, rồi bấm **Publish release**. Chỉ release đã publish mới được "Kiểm tra cập
   nhật" thấy (endpoint là `releases/latest/download/latest.json`).

## Tray, global hotkey, single instance, autostart (#9)

1. **Hotkey mặc định**: mở app, chuyển sang app khác, bấm `Ctrl+Alt+Space`. Tools Hub lên trước, command palette mở sẵn.
2. **Hotkey khi đang ẩn / thu nhỏ**: đóng cửa sổ (thu xuống tray), bấm hotkey. Lặp lại khi cửa sổ đang thu nhỏ xuống taskbar.
3. **Đổi hotkey**: Cài đặt → Hotkey toàn cục → bấm `Ctrl+Shift+J`. Tổ hợp mới hoạt động, tổ hợp cũ thì không. Khởi động lại app, tổ hợp mới vẫn còn.
4. **Hotkey bị chiếm**: cho app khác giữ một tổ hợp (ví dụ chạy bản thứ hai của một app dùng `Ctrl+Alt+K`, hoặc AutoHotkey), chọn tổ hợp đó trong Cài đặt. Cài đặt báo lỗi, app không crash, tổ hợp cũ vẫn hoạt động.
5. **Đóng cửa sổ**: bấm nút đóng. App thu xuống tray, không thoát. Bật "Thoát khi đóng cửa sổ" rồi bấm nút đóng: app thoát.
6. **Menu tray**: chuột phải icon tray → "Mở Tools Hub" đưa cửa sổ lên; "Thoát" thoát app. Nhãn đổi theo ngôn ngữ giao diện. Bấm chuột trái vào icon tray (Windows) đưa cửa sổ lên.
7. **Single instance**: khi app đang chạy (kể cả đang ẩn trong tray), chạy app lần nữa. Không có bản thứ hai; cửa sổ đang chạy được đưa lên.
8. **Autostart**: mặc định tắt (không có mục Tools Hub trong Startup apps). Bật "Khởi động cùng hệ điều hành", đăng xuất rồi đăng nhập lại: app chạy sẵn trong tray, cửa sổ không hiện; hotkey hoạt động. Tắt lại: mục khởi động biến mất.

macOS: app ẩn khi đóng cửa sổ; bấm icon trên Dock chưa đưa cửa sổ lên lại (dùng hotkey hoặc menu tray).

## Updater (#10)

Cần một bản cũ hơn đã cài (ví dụ bản trước) và bản mới đã publish.

9. **Không tự gọi mạng**: mở app, mở Cài đặt, để yên vài phút với một công cụ theo dõi mạng (Resource Monitor → Network,
   Little Snitch, `nethogs`). Tools Hub không có kết nối nào. Khởi động lại app (kể cả khởi động cùng hệ điều hành): vẫn
   không có kết nối nào.
10. **Đã là bản mới nhất**: trên bản mới nhất, Cài đặt → Cập nhật → **Kiểm tra cập nhật**. Footer báo "Tools Hub đã là bản
    mới nhất."
11. **Không có mạng**: tắt mạng, bấm **Kiểm tra cập nhật**. Hiện lỗi "Không kiểm tra được cập nhật: …", app không crash,
    bấm lại được.
12. **Có bản mới**: trên bản cũ, bấm **Kiểm tra cập nhật**. Hiện "Đã có bản <mới>" và changelog. Đóng Cài đặt mà không cài:
    không có gì thay đổi. Mở lại, kiểm tra lại, bấm **Cài và khởi động lại**: app cài bản mới và tự mở lại; dòng phiên
    bản trong Cài đặt là bản mới; Preference vẫn còn.
13. **Sai chữ ký bị từ chối**: build một bản có số phiên bản cao hơn, ký bằng một khoá khác
    (`pnpm tauri signer generate -w /tmp/other.key`), phục vụ nó qua một `latest.json` riêng (sửa tạm `endpoints` của một
    bản build thử trỏ tới `http://localhost:…`, thêm `"dangerousInsecureTransportProtocol": true`). Bấm **Cài và khởi động
    lại**: hiện "Chưa cài bản cập nhật: … signature …", phiên bản đang chạy không đổi.
14. **Bản offline**: trên máy Windows không có Internet và chưa có WebView2 (ví dụ Windows Sandbox đã tắt mạng), chạy
    `…_x64-offline-setup.exe`. Cài xong, app mở được.

## Kết quả

| Bản  | Ngày | Hệ điều hành | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | Ghi chú |
| ---- | ---- | ------------ | - | - | - | - | - | - | - | - | - | -- | -- | -- | -- | -- | ------- |
|      |      | Windows 11   |   |   |   |   |   |   |   |   |   |    |    |    |    |    |         |
|      |      | macOS        |   |   |   |   |   |   |   |   |   |    |    |    |    | –  |         |
|      |      | Linux        |   |   |   |   |   |   |   |   |   |    |    |    |    | –  |         |
