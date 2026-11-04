# Chỉ có Tool built-in, không có plugin bên thứ ba ở v1

Mọi Tool đều đóng gói sẵn trong app. Plugin bên thứ ba nằm ngoài phạm vi v1, vì nạp code từ bên ngoài khi chưa có giải pháp sandbox sẽ phá vỡ cam kết không gọi mạng và không telemetry (xem ADR-0001). Dù vậy, mọi Tool vẫn tuân theo một hợp đồng chung (metadata, UI, logic), để sau này có thể thêm hệ thống plugin mà không phải viết lại các Tool đã có.
