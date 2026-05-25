require('dotenv').config();
const path = require('path');
const { syncWereadData, writeJson } = require('./lib/weread-service');
const { buildCards } = require('./lib/card-engine');

const OUTPUT = path.join(__dirname, 'data', 'weread-data.json');
const CARDS_OUTPUT = path.join(__dirname, 'data', 'cards.json');

async function main() {
  const apiKey = process.env.WEREAD_API_KEY;
  if (!apiKey) {
    throw new Error('Please set WEREAD_API_KEY before syncing WeRead data.');
  }

  const maxBooksArg = process.argv.find(arg => arg.startsWith('--max-books='));
  const maxBooks = maxBooksArg ? Number(maxBooksArg.split('=')[1]) : undefined;

  console.log('Syncing WeRead notebooks and notes...');
  const raw = await syncWereadData(apiKey, { maxBooks });
  const cards = buildCards(raw);

  await writeJson(OUTPUT, raw);
  await writeJson(CARDS_OUTPUT, cards);

  console.log(`Saved raw data: ${OUTPUT}`);
  console.log(`Saved cards: ${CARDS_OUTPUT}`);
  console.log(`Books: ${raw.totalBooks}`);
  console.log(`Cards: ${cards.totalCards}`);
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
