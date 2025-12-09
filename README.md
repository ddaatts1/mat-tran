# Mattran 


---

## Cài đặt

```bash
git clone https://github.com/ddaatts1/mat-tran.git
cd mat-tran
npm install
```

## Cấu hình Database

Sửa file `db.js`

```

## Chạy thủ công

```bash
node MattranScraper.js

# Chạy scheduler (mặc định mỗi h)
node scheduler.js
```

---

## Chạy với PM2

### Cài đặt PM2

```bash
npm install -g pm2
```

### Start process

```bash
mkdir -p ~/mattran-logs

  
pm2 start scheduler.js --name mattran-cron --output ~/mattran-logs/out.log --error ~/mattran-logs/err.log --merge-logs
```

### Auto start khi reboot

```bash
pm2 save
pm2 startup
```

### Quản lý

```bash
pm2 list                   # Xem trạng thái
pm2 logs mattran-cron      # Xem log
pm2 stop mattran-cron      # Dừng
pm2 restart mattran-cron   # Khởi động lại
pm2 delete mattran-cron    # Xóa
```


