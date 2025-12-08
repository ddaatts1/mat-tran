const puppeteer = require('puppeteer');
const fs = require('fs').promises;
  const db = require('./db');

class MattranScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }


parseToMysqlDatetime(timeString) {
  try {
    const now = new Date();

    const pad = n => String(n).padStart(2, '0');

    const formatLocal = (d) => {
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
             `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    if (!timeString) return formatLocal(now);

    timeString = timeString.trim().toLowerCase();

    if (timeString.includes('phút')) {
      const minutes = parseInt(timeString.replace(/[^\d]/g, '') || 0);
      now.setMinutes(now.getMinutes() - minutes);
      return formatLocal(now);
    }

    if (timeString.includes('giờ')) {
      const hours = parseInt(timeString.replace(/[^\d]/g, '') || 0);
      now.setHours(now.getHours() - hours);
      return formatLocal(now);
    }

    if (timeString.includes('hôm nay')) {
      return formatLocal(now);
    }
    if (timeString.includes('/')) {
      const [timePart, datePart] = timeString.split(' ');
      const [hours, minutes] = timePart.split(':').map(Number);
      const [day, month, year] = datePart.split('/').map(Number);

      const d = new Date(year, month - 1, day, hours, minutes, 0);
      if (isNaN(d.getTime())) throw new Error('Invalid date');

      return formatLocal(d);
    }

    return formatLocal(now);

  } catch {
    return formatLocal(new Date());
  }
}



  async init() {
this.browser = await puppeteer.launch({
  headless: 'new',
  executablePath: puppeteer.executablePath(),
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu'
  ]
});

    this.page = await this.browser.newPage();

    // Set viewport và user agent
    await this.page.setViewport({ width: 1920, height: 1080 });
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  }


async scrapeArticles(url, date, pageNum = 1) {
  console.log(`Đang lấy dữ liệu từ: ${url}`);

  try {
    await this.page.goto(url, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

await this.page.waitForTimeout(3000);

const hasArticle = await this.page.$('.list-news article.story');
if (!hasArticle) {
  console.log(` Không có bài viết ở trang ${pageNum}`);
  return { articles: [], pagination: { totalPages: 1, currentPage: pageNum } };
}

    // ===== 1. LẤY DANH SÁCH BÀI VIẾT =====
    const articles = await this.page.evaluate(() => {
      const items = [];
      const articleElements = document.querySelectorAll('.list-news article.story');

      articleElements.forEach(article => {
        const titleLink = article.querySelector('.story__heading a');
        const imgElement = article.querySelector('.story__thumb img');
        const timeElement = article.querySelector('.story__time');
        const summaryElement = article.querySelector('.story__summary');

        if (titleLink) {
          items.push({
            title: titleLink.textContent.trim(),
            link: titleLink.href,
            image: imgElement ? imgElement.src : null,
            imageAlt: imgElement ? imgElement.alt : '',
            time: timeElement ? timeElement.textContent.trim() : '',
            summary: summaryElement ? summaryElement.textContent.trim() : ''
          });
        }
      });

      return items;
    });

    // lọc < 1 h
    const filteredArticles = this.filterArticlesByTime(articles);

    // CHI TIẾT
    for (let i = 0; i < filteredArticles.length; i++) {
      const detail = await this.scrapeDetailPage(filteredArticles[i].link);
      if (detail) {
        filteredArticles[i].contentHTML = detail.contentHTML || filteredArticles[i].summary;
        filteredArticles[i].tags = detail.tags || [];
        filteredArticles[i].related = detail.related || [];
        filteredArticles[i].sapo = detail.sapo || '';
      }
      await this.delay(500);
    }

    const paginationInfo = await this.page.evaluate(() => {
      const paginationDiv = document.querySelector('.pagination__pages span');
      if (!paginationDiv) return { totalPages: 1, currentPage: 1 };

      const allLinks = paginationDiv.querySelectorAll('a');
      const pages = [];
      allLinks.forEach(link => {
        const text = link.textContent.trim();
        if (!['«', '»'].includes(text) && !link.classList.contains('back') && !link.classList.contains('next')) {
          const pageNum = parseInt(text);
          if (!isNaN(pageNum)) pages.push(pageNum);
        }
      });

      const activePage = paginationDiv.querySelector('a.active');
      const currentPage = activePage ? parseInt(activePage.textContent.trim()) : 1;

      return { totalPages: pages.length > 0 ? Math.max(...pages) : 1, currentPage };
    });

    console.log(`✓ Đã lấy ${filteredArticles.length}/${articles.length} bài hợp lệ ở trang ${pageNum}`);

    return { articles: filteredArticles, pagination: paginationInfo };

  } catch (error) {
    console.error(`✗ Lỗi khi lấy dữ liệu từ trang ${pageNum}:`, error.message);
    return { articles: [], pagination: { totalPages: 0, currentPage: pageNum } };
  }
}

  async scrapeAllPages(url,date, startPage = 1, endPage = null) {
    console.log(`\n=== BẮT ĐẦU SCRAPE DỮ LIỆU ===`);
    console.log(`link: ${url}`);

    let allArticles = [];
    let currentPage = startPage;

    //
    const firstResult = await this.scrapeArticles(url,date, currentPage);

    // DỪNG ngay nếu trang đầu không có bài viết
    if (firstResult.articles.length === 0) {
      console.log(` Không có bài viết nào ở trang ${currentPage}.`);
      return allArticles;
    }

    allArticles.push(...firstResult.articles);

    const maxPages = endPage || firstResult.pagination.totalPages;

    // Lấy các trang còn lại
    for (let page = startPage + 1; page <= maxPages; page++) {
      const result = await this.scrapeArticles(url,date, page);

      // DỪNG nếu trang không có bài viết nào
      if (result.articles.length === 0) {
        console.log(`Không có bài viết nào ở trang ${page}.`);
        break;
      }

      allArticles.push(...result.articles);

      //
      await this.delay(1000);
    }

    console.log(`\n✓ HOÀN THÀNH: Đã lấy tổng cộng ${allArticles.length} bài viết`);
    return allArticles;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }


isWithinOneHour(timeString) {
  try {
    if (!timeString) return false;

    timeString = timeString.trim().toLowerCase();
    const now = new Date();


    if (timeString.includes('phút')) {
      const minutes = parseInt(timeString.replace(/[^\d]/g, '') || 999);
      return minutes >= 0 && minutes <= 60;
    }


    if (timeString.includes('giờ')) {
      const hours = parseInt(timeString.replace(/[^\d]/g, '') || 999);
      return hours >= 0 && hours <= 1;
    }

    if (timeString.includes('hôm nay')) {
      return true;
    }

    if (timeString.includes('/')) {
      const parts = timeString.split(' ');
      if (parts.length !== 2) return false;

      const timePart = parts[0];
      const datePart = parts[1];

      const [hours, minutes] = timePart.split(':').map(Number);
      const [day, month, year] = datePart.split('/').map(Number);

      const articleDate = new Date(year, month - 1, day, hours, minutes);
      if (isNaN(articleDate.getTime())) return false;

      const diffMs = now - articleDate;
      const diffHours = diffMs / (1000 * 60 * 60);

      return diffHours >= 0 && diffHours <= 1;
    }

    return false;

  } catch (error) {
    console.error(` Lỗi parse thời gian: ${timeString}`, error.message);
    return false;
  }
}

  // Hàm lọc bài viết theo thời gian
  filterArticlesByTime(articles) {
    const filtered = articles.filter(article => {
      const isRecent = this.isWithinOneHour(article.time);
      if (!isRecent) {
        console.log(`   Bỏ qua bài viết cũ: ${article.time} - ${article.title.substring(0, 50)}...`);
      }
      return isRecent;
    });

    console.log(`  Lọc theo thời gian: ${filtered.length}/${articles.length} bài viết trong 1 giờ qua`);
    return filtered;
  }

  async saveToJSON(data, filename) {
    try {
      await fs.writeFile(filename, JSON.stringify(data, null, 2), 'utf8');
      console.log(`✓ Đã lưu dữ liệu vào file: ${filename}`);
    } catch (error) {
      console.error(`✗ Lỗi khi lưu file:`, error.message);
    }
  }

  async saveToCSV(articles, filename) {
    try {
      // Tạo header CSV
      const headers = ['STT', 'Tiêu đề', 'Link', 'Thời gian', 'Tóm tắt'];
      const rows = [headers.join(',')];

      // Thêm dữ liệu
      articles.forEach((article, index) => {
        const row = [
          index + 1,
          `"${article.title.replace(/"/g, '""')}"`,
          `"${article.link}"`,
          `"${article.time}"`,
          `"${article.summary.replace(/"/g, '""')}"`
        ];
        rows.push(row.join(','));
      });

      await fs.writeFile(filename, rows.join('\n'), 'utf8');
      console.log(`✓ Đã lưu dữ liệu vào file CSV: ${filename}`);
    } catch (error) {
      console.error(`✗ Lỗi khi lưu file CSV:`, error.message);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('✓ Đã đóng trình duyệt');
    }
  }




  async saveToDatabase(articles) {
    if (!articles || articles.length === 0) {
      console.log(' Không có dữ liệu để lưu DB');
      return;
    }

    let inserted = 0;
    let skipped = 0;

    for (const article of articles) {
      try {
        const createdAt = this.parseToMysqlDatetime(article.time);

        // 1. Check trùng permalink
        const [exists] = await db.execute(
          'SELECT id FROM posts WHERE permalink = ? LIMIT 1',
          [article.link]
        );

        if (exists.length > 0) {
          skipped++;
          continue;
        }


await db.execute(
  `
  INSERT INTO posts
  (permalink, title, description, content, category_id, status, is_featured, admin_id_created, image, view_count, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  [
    article.link,                 // permalink
    article.title,                // title
    article.sapo || article.summary,
    article.contentHTML || article.summary, // content: HTML
    1,                             // category_id
    1,                             // status = hiển thị
    0,                             // is_featured
    1,                             // admin_id_created
    article.image,                // image
    0,                             // view_count
    createdAt,                    // created_at
    createdAt                     // updated_at
  ]
);


        inserted++;
      } catch (err) {
        console.error('====> Lỗi insert DB:', err.message);
      }
    }

    console.log(`=====> DB: Inserted ${inserted} | Skipped (trùng) ${skipped}`);
  }


async scrapeDetailPage(url) {
  if (!this.page) {
    console.error(' Browser chưa khởi tạo!');
    return null;
  }

  try {
    console.log(` Lấy chi tiết bài viết: ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Chờ main-column load
    await this.page.waitForSelector('.main-column', { timeout: 10000 });

    const data = await this.page.evaluate(() => {
      const main = document.querySelector('.main-column');
      if (!main) return null;

      // Tiêu đề
      const titleEl = main.querySelector('h1');
      const title = titleEl ? titleEl.textContent.trim() : '';

      // Thời gian & tác giả
      const authorEl = main.querySelector('.article__author, .article__meta a');
      const author = authorEl ? authorEl.textContent.trim() : '';
      const timeEl = main.querySelector('.article__meta time, .article__meta p time');
      const time = timeEl ? timeEl.textContent.trim() : '';

      // summary
      const sapoEl = main.querySelector('.article__sapo');
      const sapo = sapoEl ? sapoEl.textContent.trim() : '';

      // Nội dung chính
const contentEl = main.querySelector('.article__body');
const contentHTML = contentEl ? contentEl.innerHTML.trim() : '';
const contentHTMLWithAbsoluteImages = contentHTML.replace(
  /src=["']\/\/([^"']+)["']/g,
  'src="https://$1"'
);

      // Tags
      const tags = Array.from(main.querySelectorAll('.article__tag a')).map(a => ({
        title: a.getAttribute('title') || a.textContent.trim(),
        href: a.href
      }));

      // Tin liên quan
      const related = Array.from(main.querySelectorAll('.article__inner-relate .story__heading a')).map(a => ({
        title: a.textContent.trim(),
        link: a.href
      }));

      return {
        title,
        author,
        time,
        sapo,
  contentHTML: contentHTMLWithAbsoluteImages,
        tags,
        related
      };
    });

    return data;

  } catch (error) {
    console.error(`====> Lỗi khi lấy chi tiết bài viết: ${url}`, error.message);
    return null;
  }
}




}

// ==================== HÀM MAIN: LẤY DANH SÁCH BÀI VIẾT ====================



async function main() {
  const scraper = new MattranScraper();

  try {
    await scraper.init();

    // Tạo ngày hôm nay theo format "dd-mm-yyyy"
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const todayStr = `${day}-${month}-${year}`;
//    const todayStr = '04-12-2025';

    // === Lấy bài viết "tin-hoat-dong" ===
    const url1 = `https://mattran.org.vn/tin-hoat-dong/?bydate=${todayStr}&page=1`;
    console.log(`\n Lấy danh sách bài viết "tin-hoat-dong" ngày ${todayStr}`);
    const articles1 = await scraper.scrapeAllPages(url1, todayStr);
    await scraper.saveToDatabase(articles1);

    // === Lấy bài viết "hoat-dong-mat-tran-dia-phuong" ===
    const url2 = `https://mattran.org.vn/hoat-dong-mat-tran-dia-phuong/?bydate=${todayStr}&page=1`;
    console.log(`\n Lấy danh sách bài viết "hoat-dong-mat-tran-dia-phuong" ngày ${todayStr}`);
    const articles2 = await scraper.scrapeAllPages(url2, todayStr);

    await scraper.saveToDatabase(articles2);

    console.log('\n=====> HOÀN TẤT! Đã lưu tất cả bài viết.');

  } catch (error) {
    console.error('====> Lỗi:', error);
  } finally {
    await scraper.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  MattranScraper,
  main
};
