# Tools Hub

Ứng dụng desktop gom nhiều tiện ích tự chứa dành cho lập trình viên vào một chỗ. Chạy hoàn toàn offline, không telemetry, không cần tài khoản.

Mỗi thuật ngữ ghi theo dạng **Tên trong code** (tên trên giao diện tiếng Việt).

## Công cụ

**Tool** (Công cụ):
Một tiện ích tự chứa trong app, ví dụ JSON Viewer, Hash Generator, JWT Decoder. Mọi Tool đều có sẵn trong app (built-in), và mỗi phiên chỉ có một bản của mỗi Tool.
_Tránh_: Utility, module, plugin, feature, instance, tiện ích

**Category** (Danh mục):
Nhóm các Tool liên quan, dùng để điều hướng. Mỗi Tool thuộc đúng một Category.
_Tránh_: Group, section, folder, nhóm

**Mode** (Chế độ):
Một cách làm việc bên trong một Tool, ví dụ Mode Gradient của Color Palette, Mode Transform của Line Tools. Các Mode của cùng một Tool dùng chung Preference.
_Tránh_: Tab, view, sub-tool, chế độ xem

**Open Tool** (Công cụ đang mở):
Một Tool người dùng đã mở trong workspace, hiển thị thành một tab. Input của nó tồn tại cho tới khi người dùng đóng tab; chuyển qua lại giữa các Open Tool vẫn giữ nguyên trạng thái.
_Tránh_: Tab, instance, session, phiên

**Favorite** (Yêu thích):
Một Tool người dùng ghim lên đầu sidebar. Danh sách Favorite là một Preference, giữ theo thứ tự ghim.
_Tránh_: Bookmark, pin, starred, đánh dấu

**Paste Detection** (Nhận diện khi dán):
Việc nhận ra nội dung người dùng vừa dán ở ngoài ô nhập liệu và gợi ý Tool phù hợp. App không bao giờ tự đọc clipboard.
_Tránh_: Clipboard detection, smart detection, đọc clipboard

## Dữ liệu người dùng

**Input** (Dữ liệu nhập):
Mọi thứ người dùng đưa cho một Tool xử lý: văn bản dán vào, giá trị gõ vào, file mở ra. Input chỉ nằm trong bộ nhớ trong phiên và không bao giờ được ghi xuống đĩa.
_Tránh_: Data, content, document, nội dung

**Preference** (Tuỳ chỉnh):
Lựa chọn của người dùng cho app hoặc cho một Tool: theme, ngôn ngữ, hotkey, favorites, danh sách Open Tool, layout hay price table của một Tool. Preference được lưu xuống đĩa.
_Tránh_: Option, config, cài đặt, thiết lập

**Recent** (Gần đây):
Lịch sử ngắn, không nhạy cảm, mà một Tool khai báo rõ ràng, ví dụ các Tool dùng gần đây, các màu vừa dùng. Recent được lưu xuống đĩa và người dùng xoá được.
_Tránh_: History, cache, lịch sử
