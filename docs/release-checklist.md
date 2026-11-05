# Release checklist

Những gì test tự động không với tới được (tray, hotkey của hệ điều hành, single instance, autostart). Chạy trên bản
build (`pnpm tauri build`), không phải `pnpm tauri dev`. Ghi kết quả từng lần release vào bảng ở cuối.

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

## Kết quả

| Bản  | Ngày | Hệ điều hành | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | Ghi chú |
| ---- | ---- | ------------ | - | - | - | - | - | - | - | - | ------- |
|      |      | Windows 11   |   |   |   |   |   |   |   |   |         |
|      |      | macOS        |   |   |   |   |   |   |   |   |         |
|      |      | Linux        |   |   |   |   |   |   |   |   |         |
