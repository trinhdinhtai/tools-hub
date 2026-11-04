# Input không bao giờ được ghi xuống đĩa

Người dùng hay dán dữ liệu nhạy cảm vào công cụ cho lập trình viên (JWT, API key, dữ liệu khách hàng), nên Input chỉ nằm trong bộ nhớ và mất đi khi thoát app. Chỉ Preference và các Recent đã khai báo mới được lưu, và mọi thao tác lưu đều đi qua một store chung của app; Tool không bao giờ tự ghi vào `localStorage` hay file. Chúng ta chấp nhận mất tính năng "mở lại app vẫn còn công việc cũ" để giữ cho cam kết này đơn giản và kiểm chứng được.
