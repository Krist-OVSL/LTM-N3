# Hướng Dẫn Cài Đặt và Khởi Chạy DoH Mini Browser

Tài liệu hướng dẫn chi tiết các bước cài đặt môi trường và khởi chạy ứng dụng **DoH Mini Browser** dành cho sinh viên và người kiểm thử.

---

## 1. Yêu cầu hệ thống

* **Hệ điều hành:** Windows 10 / Windows 11 (64-bit).
* **Môi trường:** [Node.js](https://nodejs.org/) (Khuyến nghị bản LTS, ví dụ Node.js 22 LTS hoặc 24 LTS).
* **Trình quản lý gói:** `npm` (đi kèm sẵn khi cài đặt Node.js).
* **Kết nối mạng:** Kết nối Internet ổn định để tải dependency và gửi truy vấn DoH tới Cloudflare.
* *(Tùy chọn)* **Wireshark:** Dùng để bắt gói tin kiểm chứng tính năng mã hóa DoH.

---

## 2. Các bước cài đặt

### Bước 1: Mở thư mục dự án
Mở terminal (PowerShell, Command Prompt, hoặc Terminal trong VS Code) tại thư mục chứa source code của dự án:
```powershell
cd /path/to/LTM-N3
```

### Bước 2: Cài đặt các gói phụ thuộc (Dependencies)
Chạy lệnh sau để cài đặt chính xác các phiên bản thư viện đã được kiểm thử:
```sh
npm ci
```
*(Nếu gặp lỗi giải nén hoặc npm ci không thành công, bạn có thể chạy `npm install`)*.

---

## 3. Khởi chạy ứng dụng

### Cách 1: Chạy qua npm (Khuyên dùng)
* Nếu sử dụng **Command Prompt (cmd)**:
  ```cmd
  npm start
  ```
* Nếu sử dụng **PowerShell**:
  ```powershell
  npm.cmd start
  ```

> ⚠️ **Xử lý lỗi Script trên PowerShell:**
> Nếu PowerShell báo lỗi màu đỏ: `File ... npm.ps1 cannot be loaded because running scripts is disabled on this system`, bạn có thể:
> 1. Sử dụng lệnh `npm.cmd start` thay cho `npm start`.
> 2. Hoặc mở PowerShell với quyền Administrator và cho phép chạy script:
>    ```powershell
>    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
>    ```

### Cách 2: Chạy trực tiếp qua Electron
```powershell
npx.cmd electron .
```

---

## 4. Hướng dẫn thử nghiệm nhanh trên ứng dụng

1. **Tìm kiếm & Điều hướng:**
   - Trên trang khởi động: Nhập từ khóa vào ô tìm kiếm Google ở giữa màn hình và nhấn **Search**.
   - Trên thanh địa chỉ trên cùng: Nhập từ khóa (vd: `thời tiết`) để tìm trên Google, hoặc nhập tên miền (vd: `vnexpress.net`, `example.com`) để truy cập trực tiếp website.
2. **Kiểm tra trạng thái DoH & IP đích:**
   - Quan sát sidebar bên phải: Mục **Destination IP** hiển thị IP máy chủ web kết nối thực tế.
   - Mục **Kết quả phân giải** hiển thị các bản ghi A (IPv4) và AAAA (IPv6).
3. **Thử nghiệm bật/tắt DoH:**
   - Gạt công tắc **DoH cho mini browser** sang **TẮT** để xem app tự động xóa cache và chuyển sang DNS hệ điều hành.
   - Bật **Wireshark** và áp dụng filter theo hướng dẫn trong khung **Kiểm chứng Wireshark** trên app để thấy sự khác biệt giữa gói tin plaintext (cổng 53) và TLS (cổng 443).
4. **So sánh DNS độc lập:**
   - Cuộn xuống thẻ **So sánh DNS**, nhập tên miền bất kỳ (vd: `google.com`) và bấm **So sánh** để đối chiếu độ trễ và IP giữa Cloudflare DoH và DNS hệ điều hành.
