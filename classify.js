require('dotenv').config();
const path = require('path');
const { readJsonIfExists, writeJson } = require('./lib/weread-service');
const { classifyNotes } = require('./lib/classifier');

const DATA_DIR = path.join(__dirname, 'data');
const RAW_FILE = path.join(DATA_DIR, 'weread-data.json');
const CLASSIFIED_FILE = path.join(DATA_DIR, 'classified.json');

async function main() {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    console.error('请在 .env 中设置 LLM_API_KEY');
    process.exit(1);
  }

  const raw = await readJsonIfExists(RAW_FILE);
  if (!raw?.books?.length) {
    console.error('没有找到数据，请先运行 npm run sync');
    process.exit(1);
  }

  const notes = [];
  for (const book of raw.books) {
    const chapterMap = {};
    for (const ch of book.chapters || []) chapterMap[ch.chapterUid] = ch.title;
    for (const h of book.highlights || []) {
      notes.push({
        type: 'highlight',
        text: h.markText || '',
        bookId: book.bookId,
        bookTitle: book.book?.title || '',
        chapter: chapterMap[h.chapterUid] || '',
        createTime: h.createTime,
        chapterUid: h.chapterUid,
        range: h.range,
      });
    }
    for (const r of book.reviews || []) {
      notes.push({
        type: 'review',
        text: r.content || '',
        bookId: book.bookId,
        bookTitle: book.book?.title || '',
        chapter: r.chapterName || '',
        createTime: r.createTime,
      });
    }
  }

  const validNotes = notes.filter(n => n.text.trim().length > 0);
  console.log(`共 ${validNotes.length} 条有效笔记，开始分类...\n`);

  const { results, stats } = await classifyNotes(validNotes);
  await writeJson(CLASSIFIED_FILE, {
    classifiedAt: new Date().toISOString(),
    totalNotes: results.length,
    notes: results,
    stats,
  });

  console.log(`\n已保存到 ${CLASSIFIED_FILE}`);
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
