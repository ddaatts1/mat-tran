const cron = require('node-cron');
const { main } = require('./MattranScraper');

console.log('Scheduler started at:', new Date().toLocaleString('vi-VN'));

// Chạy ngay khi start
(async () => {
  try {
    console.log('Chạy lần đầu khi khởi động...');
    await main();
  } catch(err){
    console.error('Lỗi lần đầu:', err.stack||err);
  }
})();

// Cron chạy mỗi đầu giờ
let isRunning = false;

cron.schedule('0 * * * *', async () => {
  if (isRunning) return console.log('Cron đang chạy, bỏ qua');
  isRunning = true;
  try {
    await main();
  } catch(err){
    console.error(err);
  } finally {
    isRunning = false;
  }
});


