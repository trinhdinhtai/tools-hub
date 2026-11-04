# Không gọi mạng nếu người dùng không trực tiếp yêu cầu

App không bao giờ tự truy cập mạng: không telemetry, không tự cập nhật, không tải tài nguyên từ xa, không fetch chạy nền. Chỉ khi người dùng chủ động thao tác thì app mới gọi mạng, và hiện tại thao tác duy nhất như vậy là "Kiểm tra cập nhật". Thao tác này chạy ở phía Rust, không bao giờ chạy trong webview. Đây là lời cam kết với người dùng, nên mọi Tool hay tính năng cần âm thầm gọi mạng để hoạt động đều bị loại.

## Hệ quả

- Một CSP chặt chặn mọi truy cập mạng trong webview chính và trong mọi sandbox (HTML Preview, Code Playground, Markdown, Mermaid), kể cả khi code của người dùng gọi `fetch`. Ảnh từ xa được hiển thị thành placeholder.
- Tool nào lẽ ra cần lấy dữ liệu từ ngoài thì chỉ nhận Input được dán vào: JWKS phải dán vào, kiểm tra chuỗi X.509 bỏ qua OCSP/CRL, Token Counter không gọi API của nhà cung cấp, cURL to Code chỉ chuyển đổi chứ không chạy lệnh.
