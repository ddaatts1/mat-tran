const cron = require('node-cron');
const { main } = require('./MattranScraper');

console.log(' Scheduler started...');

// Chạy NGAY khi bật server
(async () => {
  console.log(' Chạy lần đầu khi khởi động...');
    console.log(' Chạy cron lúc:', new Date().toLocaleString());
  await main();
})();

// Sau đó chạy mỗi 1 giờ
cron.schedule('0 * * * *', async () => {
  console.log(' Chạy cron lúc:', new Date().toLocaleString());

  try {
    await main();
    console.log(' Cron chạy xong');
  } catch (err) {
    console.error(' Lỗi khi chạy cron:', err.message);
  }
});


//// Chạy mỗi phút
//cron.schedule('* * * * *', async () => {
//  console.log(' Chạy cron lúc:', new Date().toLocaleString());
//
//  try {
//    await main();
//    console.log(' Cron chạy xong');
//  } catch (err) {
//    console.error(' Lỗi khi chạy cron:', err.message);
//  }
//});

