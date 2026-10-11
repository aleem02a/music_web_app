// Generate PNG icon from SVG for Electron
// Run: node generate-icon.js

const fs = require('fs');
const path = require('path');

// Create a simple 256x256 PNG icon with the Aurafy branding colors
// This is a minimal valid PNG with a gradient-like pattern
// For production, replace with a proper high-res PNG icon

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <rect width="256" height="256" rx="48" fill="#090E18"/>
  <path d="M128 40C116 40 108 48 100 60L40 168C28 188 40 208 64 208H192C216 208 228 188 216 168L156 60C148 48 140 40 128 40Z" fill="url(#g)"/>
  <path d="M112 104V152L152 128Z" fill="#090E18"/>
  <defs>
    <linearGradient id="g" x1="0" y1="256" x2="256" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#378ACB"/>
      <stop offset="0.5" stop-color="#8279E8"/>
      <stop offset="1" stop-color="#68B8EF"/>
    </linearGradient>
  </defs>
</svg>`;

fs.writeFileSync(path.join(__dirname, 'icon.svg'), svgContent);
console.log('SVG icon created at icon.svg');
console.log('');
console.log('To convert to PNG (required for Electron), you can:');
console.log('1. Open icon.svg in a browser and screenshot it');
console.log('2. Use an online SVG to PNG converter');
console.log('3. Or install sharp: npm install sharp');
console.log('   Then run: node -e "require(\'sharp\')(\'icon.svg\').resize(256,256).png().toFile(\'icon.png\')"');
