import { WebSearchTools } from './WebSearchTools';

async function test() {
    console.log("Testing WebSearchTools...");
    const result = await WebSearchTools.search("TypeError: chalk.red is not a function");
    console.log("\n--- SEARCH RESULT ---\n");
    console.log(result);
    console.log("\n--- END RESULT ---");
}

test();
