const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// 1. Extract CSS
const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/);
if (styleMatch) {
    fs.writeFileSync('css/home.css', styleMatch[1].trim());
    console.log('Created css/home.css');
}

// 2. Extract Main Content
const mainMatch = html.match(/<main id="main-content">([\s\S]*?)<\/main>/);
if (mainMatch) {
    fs.writeFileSync('views/index.ejs', mainMatch[1].trim());
    console.log('Updated views/index.ejs');
}

// 3. Extract Footer
const footerMatch = html.match(/<footer class="wfc-footer" role="contentinfo">([\s\S]*?)<\/footer>/);
if (footerMatch) {
    fs.writeFileSync('views/partials/footer.ejs', '<footer class="wfc-footer" role="contentinfo">\n' + footerMatch[1].trim() + '\n</footer>');
    console.log('Updated views/partials/footer.ejs');
}
