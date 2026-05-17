import fs from 'fs';
import path from 'path';

function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath, callback);
    } else if (fullPath.endsWith('.tsx')) {
      callback(fullPath);
    }
  }
}

function processFiles() {
  const dirs = ['src/pages', 'src/components'];
  dirs.forEach(dir => {
    walk(dir, (filePath) => {
      let content = fs.readFileSync(filePath, 'utf-8');
      
      let newContent = content;

      // Replace overflow-x-auto that wraps tables with table-scroll-container 
      // actually, just replace simple overflow-x-auto on standard divs before a table:
      // (This will make sure it applies to container divs)
      newContent = newContent.replace(/className="overflow-x-auto"/g, 'className="table-scroll-container"');

      // Note: we can also add a swipe-hint to the DOM but CSS mask is typically enough.
      
      if (newContent !== content) {
        fs.writeFileSync(filePath, newContent);
      }
    });
  });
}

processFiles();
console.log("Table scrolling UI refined");
