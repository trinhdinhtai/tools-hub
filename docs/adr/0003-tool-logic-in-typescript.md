# Logic Tool viết bằng TypeScript, phần nặng dùng WASM, Rust chỉ lo phần chạm OS

Logic của mỗi Tool là một module TypeScript thuần. Xử lý nặng (mã hoá ảnh, file lớn) dùng WASM chạy trong Web Worker. Rust chỉ đảm nhận những việc cần tới OS: tray, global hotkey, single instance, updater, hộp thoại chọn file. Nhờ vậy mỗi Tool test được bằng Vitest mà không cần Tauri, và app tham chiếu me-shaon/devtools đã cho thấy TS + WASM đủ nhanh, kể cả cho chuyển đổi ảnh. Một Tool chỉ chuyển logic sang Rust khi có số đo chứng minh TS/WASM quá chậm.
