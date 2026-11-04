# Mỗi Tool một thư mục, không import chéo giữa các Tool

Mỗi Tool nằm trong `src/tools/<tool-id>/`, chứa metadata, logic, test, UI và bản dịch của nó. Một Tool chỉ được import từ phần dùng chung (`lib/`, `components/`, `platform/`, `i18n/`), không bao giờ import từ thư mục của Tool khác, và quy tắc này được ép bằng ESLint. Registry và Paste Detection tự tìm các Tool qua file `meta.ts`, nên xoá thư mục của một Tool thì app vẫn build được. Logic chỉ được chuyển lên `lib/` khi có Tool thứ hai cần dùng.

App tham chiếu me-shaon/devtools lại tổ chức theo tầng: một file registry chung cho mọi Tool; UI, logic, test nằm ở các cây thư mục riêng; và một file Paste Detection import logic của nhiều Tool. Thêm một Tool phải sửa 4–5 chỗ, và PR nào cũng đụng vào file registry chung. Phương án mỗi Tool một package trong monorepo bị loại vì quá nặng nề cho Tool built-in.
