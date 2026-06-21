/**
 * Convert Markdown to PDF using Puppeteer
 * Usage: node scripts/md-to-pdf.js <input.md> <output.pdf>
 */

const fs = require('fs');
const path = require('path');
const MarkdownIt = require('markdown-it');
const puppeteer = require('puppeteer');

const inputPath = process.argv[2];
const outputPath = process.argv[3] || inputPath.replace(/\.md$/, '.pdf');

if (!inputPath) {
  console.error('Usage: node scripts/md-to-pdf.js <input.md> [output.pdf]');
  process.exit(1);
}

// Read markdown file
const markdown = fs.readFileSync(inputPath, 'utf-8');

// Convert markdown to HTML with styling
const md = new MarkdownIt();
const htmlContent = md.render(markdown);

// Create complete HTML document with professional styling
const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>LAZY SEARCH - Benchmark Report</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.7;
      color: #1a1a1a;
      background: #ffffff;
      padding: 40px 60px;
      font-size: 11pt;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
    }

    h1 {
      font-size: 28pt;
      font-weight: 700;
      margin-bottom: 8px;
      color: #0a0a0a;
      line-height: 1.2;
    }

    h2 {
      font-size: 18pt;
      font-weight: 600;
      margin-top: 32px;
      margin-bottom: 12px;
      color: #1a1a1a;
      padding-bottom: 6px;
      border-bottom: 2px solid #e5e5e5;
    }

    h3 {
      font-size: 14pt;
      font-weight: 600;
      margin-top: 24px;
      margin-bottom: 10px;
      color: #2a2a2a;
    }

    h4 {
      font-size: 12pt;
      font-weight: 600;
      margin-top: 18px;
      margin-bottom: 8px;
      color: #3a3a3a;
    }

    p {
      margin-bottom: 12px;
      text-align: justify;
    }

    ul, ol {
      margin-bottom: 16px;
      padding-left: 28px;
    }

    li {
      margin-bottom: 6px;
    }

    code {
      font-family: 'JetBrains Mono', 'Consolas', 'Monaco', monospace;
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.9em;
      color: #d63384;
    }

    pre {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 6px;
      padding: 14px 16px;
      margin: 16px 0;
      overflow-x: auto;
      font-size: 9pt;
      line-height: 1.5;
    }

    pre code {
      background: none;
      padding: 0;
      color: #1a1a1a;
      white-space: pre;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 10pt;
    }

    th, td {
      padding: 10px 14px;
      text-align: left;
      border-bottom: 1px solid #e5e5e5;
    }

    th {
      font-weight: 600;
      background: #f8f9fa;
      color: #2a2a2a;
      border-bottom: 2px solid #d0d0d0;
    }

    tr:hover {
      background: #fafafa;
    }

    blockquote {
      margin: 16px 0;
      padding-left: 20px;
      border-left: 4px solid #d0d0d0;
      color: #555;
      font-style: italic;
    }

    a {
      color: #0066cc;
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    hr {
      border: none;
      border-top: 2px solid #e5e5e5;
      margin: 32px 0;
    }

    .info-box {
      background: #f0f7ff;
      border-left: 4px solid #0066cc;
      padding: 14px 18px;
      margin: 16px 0;
      border-radius: 0 6px 6px 0;
    }

    .warning-box {
      background: #fff8f0;
      border-left: 4px solid #ff9500;
      padding: 14px 18px;
      margin: 16px 0;
      border-radius: 0 6px 6px 0;
    }

    strong {
      font-weight: 600;
      color: #0a0a0a;
    }

    em {
      font-style: italic;
    }

    /* Page numbering */
    @page {
      margin: 1.2cm 1.5cm;
      size: A4;
    }

    /* Table of contents styling */
    .toc {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      padding: 20px 24px;
      margin: 24px 0;
    }

    .toc-title {
      font-size: 14pt;
      font-weight: 600;
      margin-bottom: 14px;
      color: #1a1a1a;
    }

    .toc ul {
      list-style-type: none;
      padding-left: 0;
      margin: 0;
    }

    .toc li {
      margin-bottom: 8px;
      padding-left: 20px;
      text-indent: -20px;
    }

    .toc a {
      color: #0066cc;
      text-decoration: none;
    }

    .toc-number {
      color: #666;
      margin-right: 6px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="container">
    ${htmlContent}
  </div>
</body>
</html>
`;

// Generate PDF
(async () => {
  console.log(`Converting ${inputPath} to ${outputPath}...`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle0' });

  await page.pdf({
    path: outputPath,
    format: 'A4',
    margin: {
      top: '1.2cm',
      right: '1.5cm',
      bottom: '1.2cm',
      left: '1.5cm'
    },
    printBackground: true
  });

  await browser.close();

  console.log(`✓ PDF generated: ${outputPath}`);
})();
