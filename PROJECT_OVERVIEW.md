# Tổng quan project

## 1. Mục đích

DoH Mini Browser là ứng dụng desktop Electron thử nghiệm cho môn Lập trình mạng.
Ứng dụng mô phỏng một trình duyệt mini với thanh điều hướng, trang khởi động và sidebar quan sát DNS/DoH.

## 2. Công nghệ

- Electron `38.8.6`.
- JavaScript, HTML5 và CSS thuần.
- Node.js `node:dns`.promises.
- Electron `BrowserWindow`, `WebContentsView`, `ipcMain`, `contextBridge` và Chrome DevTools Protocol.
- npm và lockfile version 3.
- Cloudflare DNS-over-HTTPS endpoint `https://cloudflare-dns.com/dns-query`.
- Không có framework frontend, backend, cơ sở dữ liệu hoặc test runner.

## 3. Cấu trúc

```text
electron/
  main.js
  preload.js
src/
  app.js
  index.html
  start.html
  start.css
  style.css
  assets/
screenshots/
package.json
package-lock.json
README.md
LICENSE
```

## 4. Kiến trúc

Electron sử dụng kiến trúc hai tiến trình:

- Main process trong `electron/main.js` tạo cửa sổ, điều hướng, cấu hình DNS/DoH và xử lý IPC/CDP.
- Preload trong `electron/preload.js` giới hạn API ra renderer bằng `contextBridge`.
- Renderer trong `src/index.html` và `src/app.js` hiển thị UI và điều khiển trình duyệt.
- `WebContentsView` nạp trang khởi động hoặc website HTTP/HTTPS.

## 5. Luồng chính

1. Electron khởi động và bật Secure DNS mặc định qua Cloudflare.
2. Cửa sổ nạp UI, còn `WebContentsView` nạp trang khởi động.
3. Người dùng nhập URL hoặc từ khóa.
4. Preload chuyển yêu cầu qua IPC tới main process.
5. Main process chuẩn hóa địa chỉ, nạp trang và bắt đầu tra cứu DNS.
6. Kết quả A/AAAA, IP đích, HTTP status và trace được gửi về sidebar.

## 6. Chức năng

- Quay lại, tiến tới, tải lại.
- Nhập URL hoặc tìm kiếm bằng DuckDuckGo.
- Bật/tắt Chromium Secure DNS.
- Tra cứu A/AAAA của hostname trang đang mở.
- So sánh Cloudflare DoH với DNS hệ điều hành.
- Xem remote IP, cổng, giao thức và HTTP status của tài liệu trang chính.
- Thu gọn/mở sidebar và các card kết quả.
- Ghi trace các mốc truy cập trong bộ nhớ.

## 7. Cài đặt và chạy

Yêu cầu Node.js LTS, npm và Internet.
README khuyến nghị Node.js 24 LTS trên Windows.

```sh
npm ci
npm start
```

`npm start` tương ứng `electron .`.

Lưu ý: README tham chiếu `HUONG_DAN_CAI_DAT.md` nhưng file này không tồn tại trong worktree.

## 8. Dữ liệu và quyền riêng tư

- Không lưu lịch sử ra file.
- Không lưu kết quả DNS/IP ra file.
- Electron dùng partition persist `persist:doh-mini-browser`.
- Không có UI xóa cache/cookie.
- Không capture packet hoặc giám sát thiết bị khác.
- Wireshark là công cụ quan sát bên ngoài, không được project triển khai.

## 9. Các giới hạn đã biết

- Không có test tự động.
- Không có script build/package hoặc installer.
- Không có CI/lint.
- Không xác nhận macOS/Linux.
- Không có cơ chế lưu lịch sử.
- Không có cơ chế xóa cache/cookie.
- IP đích chỉ đại diện cho tài liệu trang chính, không đại diện mọi tài nguyên phụ.
- Proxy/VPN có thể làm IP hiển thị là endpoint proxy.
- Trace là dữ kiện ứng dụng quan sát, không phải bản ghi toàn bộ gói mạng.

## 10. Giấy phép

Project sử dụng MIT License trong file `LICENSE`.
