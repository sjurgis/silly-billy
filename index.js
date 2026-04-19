const fs = require('fs');

/**
 * Extracts pricing plans from the HTML string.
 * This function uses Regex to avoid dependencies and be portable.
 * It mimics the structure of what a bookmarklet would do with DOM.
 */
function extractPlans(html) {
    const plans = [];
    
    // 1. Extract basic plan info from the DOM-like structure
    const cardChunks = html.split('data-slot="card"');
    for (let i = 1; i < cardChunks.length; i++) {
        const chunk = cardChunks[i];
        
        const titleMatch = chunk.match(/data-slot="card-title"[^>]*aria-label="Heading: ([^"]+)"/);
        const descMatch = chunk.match(/data-slot="card-description"[^>]*aria-label="Description: ([^"]+)"/);
        const priceMatch = chunk.match(/aria-label="Cost: ([^"]+)"/);
        const periodMatch = chunk.match(/aria-label="Cost period: ([^"]+)"/);
        const providerMatch = chunk.match(/<img[^>]*alt="([^"]+)"/);
        
        const features = [];
        const featureRegex = /aria-label="Features: ([^"]+)"/g;
        let featureMatch;
        while ((featureMatch = featureRegex.exec(chunk)) !== null) {
            features.push(featureMatch[1]);
        }
        
        const terms = [];
        const termRegex = /aria-label="Terms: ([^"]+)"/g;
        let termMatch;
        while ((termMatch = termRegex.exec(chunk)) !== null) {
            terms.push(termMatch[1]);
        }
        
        const extras = [];
        const extraRegex = /aria-label="EV onlys: ([^"]+)"/g;
        let extraMatch;
        while ((extraMatch = extraRegex.exec(chunk)) !== null) {
            extras.push(extraMatch[1]);
        }

        if (titleMatch || priceMatch || providerMatch) {
            plans.push({
                provider: providerMatch ? providerMatch[1] : null,
                title: titleMatch ? titleMatch[1] : null,
                description: descMatch ? descMatch[1] : null,
                price: priceMatch ? priceMatch[1] : null,
                period: periodMatch ? periodMatch[1] : null,
                features,
                terms,
                extra: extras.length > 0 ? extras : undefined,
                pricingDetails: []
            });
        }
    }

    // 2. Extract detailed pricing from scripts
    // We clean the HTML slightly to make regex easier (handles Next.js escaping)
    const cleanHtml = html.replace(/\\"/g, '"').replace(/\\n/g, '\n');
    
    const pricingBlocks = [];
    const blockRegex = /Tariffs and discounts.*?Estimated cost.*?(\$\$?[0-9.]+)/gs;
    let blockMatch;
    while ((blockMatch = blockRegex.exec(cleanHtml)) !== null) {
        const blockText = blockMatch[0];
        const estimatedTotal = blockMatch[1].replace('$$', '$');
        
        const rates = [];
        // Look for rate patterns: "children":["Label",""]} followed by a price $$X.XXXX
        const rateRegex = /"children":\["([^"]+)"[^\]]*\].*?"(-?\$?\$[0-9.]+)"/gs;
        let rateMatch;
        while ((rateMatch = rateRegex.exec(blockText)) !== null) {
            const label = rateMatch[1].replace(/\\u0026/g, '&');
            const rate = rateMatch[2].replace('$$', '$');
            
            if (label !== 'Estimated cost' && label !== 'Plan features' && label !== 'Plan term' && label !== 'Standard' && label !== 'Time-of-use') {
                rates.push({ label, rate });
            }
        }
        
        pricingBlocks.push({
            total: estimatedTotal,
            rates
        });
    }

    // 3. Match pricing blocks to plans by total price (rounded)
    plans.forEach(plan => {
        if (!plan.price) return;
        const planPriceNum = parseInt(plan.price.replace('$', ''));
        const matchedBlock = pricingBlocks.find(block => {
            const blockPriceNum = parseInt(block.total.replace('$', ''));
            return blockPriceNum === planPriceNum;
        });
        
        if (matchedBlock) {
            plan.pricingDetails = matchedBlock.rates;
            plan.exactTotal = matchedBlock.total;
        }
    });
    
    return plans;
}

if (require.main === module) {
    try {
        const html = fs.readFileSync('./example.html', 'utf8');
        const plans = extractPlans(html);
        console.log(`Found ${plans.length} plans.`);
        const jsonOutput = JSON.stringify(plans, null, 2);
        fs.writeFileSync('plans.json', jsonOutput);
        console.log('Results saved to plans.json');
    } catch (err) {
        console.error('Error reading example.html:', err.message);
    }
}

module.exports = extractPlans;
