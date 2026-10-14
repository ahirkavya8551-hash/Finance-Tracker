const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    page.on('console', msg => {
        console.log(`[BROWSER ${msg.type().toUpperCase()}] ${msg.text()}`);
    });
    
    page.on('pageerror', error => {
        console.log(`[BROWSER PAGE_ERROR] ${error.message}`);
    });

    try {
        // Updated to use the project-specific URL and wait for the correct element
        await page.goto('http://localhost:8080/', { waitUntil: 'networkidle0', timeout: 30000 });
        console.log('Page loaded successfully at localhost. Checking elements...');
        
        // Updated ID to match index.html (authError instead of loginError)
        const errText = await page.evaluate(() => {
            const el = document.getElementById('authError');
            return el ? el.innerText : null;
        });
        
        console.log(`Auth Error Text on startup: "${errText}"`);
        
    } catch (err) {
        console.error('Script error:', err);
    } finally {
        await browser.close();
    }
})();
