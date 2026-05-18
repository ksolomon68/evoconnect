const fs = require('fs');
const files = ['views/labor/index.ejs', 'views/business/index.ejs', 'views/prime/index.ejs'];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let html = fs.readFileSync(file, 'utf8');

  // Hero
  html = html.replace(/<section class="hero[^"]*">/g, '<section class="wfc-hero">');
  html = html.replace(/<div class="container hero-content">/g, '<div class="wfc-hero-inner">');
  html = html.replace(/<div class="hero-badge">([^<]+)<\/div>/g, '<span class="wfc-eyebrow">$1</span>');
  html = html.replace(/<h1 class="hero-heading">/g, '<h1>');
  html = html.replace(/<p class="hero-sub">/g, '<p>');
  html = html.replace(/<div class="hero-actions">/g, '<div class="wfc-hero-cta">');
  html = html.replace(/class="btn-secondary"/g, 'class="btn-secondary-outline"');

  // Sections general
  html = html.replace(/<section class="[^"]*section-light[^"]*">/g, '<section class="wfc-section">');
  html = html.replace(/<section class="[^"]*section-dark[^"]*">/g, '<section class="wfc-section" style="background:#0B1220;">');
  html = html.replace(/<div class="container">/g, '<div class="wfc-section-inner">');
  html = html.replace(/<h2>/g, '<h2 class="section-title">');
  html = html.replace(/<p class="section-sub">/g, '<p class="section-subtitle">');

  // Steps
  html = html.replace(/<div class="steps-grid[^"]*">/g, '<div class="hiw-grid">');
  html = html.replace(/<div class="step">/g, '<div class="hiw-card">');
  html = html.replace(/<div class="step-number">([^<]+)<\/div>\s*<h4>([^<]+)<\/h4>/g, '<div class="hiw-step">$1</div>\n        <h3>$2</h3>');

  // Trades
  html = html.replace(/<div class="trade-chip">([^<]+)<\/div>/g, '<div class="trade-card"><div class="trade-card-body"><h4>$1</h4></div></div>');

  // Benefits
  html = html.replace(/<h4>([^<]+)<\/h4>/g, '<h3>$1</h3>');

  // CTA
  html = html.replace(/<section class="cta-banner">/g, '<section class="wfc-cta-banner">');
  html = html.replace(/<div class="container text-center">/g, '<div class="wfc-cta-banner-inner">');
  html = html.replace(/btn-primary btn-lg/g, 'btn-white');

  fs.writeFileSync(file, html);
  console.log('Fixed styles in ' + file);
});
