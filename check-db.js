const { getDb } = require('./server/database');

async function check() {
  const db = getDb();
  try {
    const [rows] = await db.execute('SELECT * FROM primes WHERE email = ?', ['john.doe@primealpha.com']);
    console.log('Result:', rows);
  } catch (err) {
    console.error('Error:', err);
  }
  process.exit(0);
}

check();
