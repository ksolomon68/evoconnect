const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'public', 'css', 'evo.css');

try {
  const buffer = fs.readFileSync(cssPath);
  
  // Check if it's UTF-16 LE (BOM is FF FE)
  if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
    console.log('Detected UTF-16 LE encoding. Converting to UTF-8...');
    const str = buffer.toString('utf16le');
    
    // Write as UTF-8
    fs.writeFileSync(cssPath, str, 'utf8');
    console.log('Successfully converted and saved as UTF-8!');
  } else {
    console.log('Not UTF-16 LE or no BOM detected. File starts with:', buffer.slice(0, 20).toString());
  }
} catch (err) {
  console.error('Error reading/writing file:', err);
}
