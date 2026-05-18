const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '../css/main.css');
const content = fs.readFileSync(cssPath, 'utf8');

let opens = 0;
let closes = 0;
for (let i = 0; i < content.length; i++) {
  if (content[i] === '{') opens++;
  if (content[i] === '}') closes++;
}

console.log('Total Braces:');
console.log('Open:', opens);
console.log('Close:', closes);
if (opens !== closes) {
  console.log('❌ UNBALANCED BRACES DETECTED!');
} else {
  console.log('✅ Braces are perfectly balanced!');
}
