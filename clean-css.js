const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'public', 'css', 'evo.css');

try {
  let content = fs.readFileSync(cssPath, 'utf8');
  
  // Clean null bytes or any other weird characters
  content = content.replace(/\0/g, '');
  
  // Save it cleanly as UTF-8
  fs.writeFileSync(cssPath, content, 'utf8');
  console.log('Successfully cleaned public/css/evo.css and saved as clean UTF-8!');
} catch (err) {
  console.error('Error cleaning CSS file:', err);
}
