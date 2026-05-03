import ePub from 'epubjs';
import fs from 'fs';
import path from 'path';

const epubPath = "C:\\Users\\david\\Downloads\\meditations.epub";

async function debug() {
    console.log("Reading file...");
    const data = fs.readFileSync(epubPath);
    
    console.log("Loading book...");
    const book = ePub(data.buffer);
    
    try {
        await book.ready;
        console.log("Book ready.");
        
        const spine = book.spine;
        console.log(`Spine has ${spine.items.length} items.`);
        
        for (let i = 0; i < spine.items.length; i++) {
            const item = spine.items[i];
            console.log(`Loading item ${i}: ${item.href}`);
            try {
                const chapter = await item.load(book.load.bind(book));
                console.log(`  Loaded ${item.href} (${typeof chapter})`);
            } catch (err) {
                console.error(`  Error loading ${item.href}:`, err.message);
                console.error(err.stack);
            }
        }
    } catch (err) {
        console.error("Error during book.ready:", err.message);
        console.error(err.stack);
    }
}

debug();
