(function() {
    const plans = [];
    const cards = document.querySelectorAll('[data-slot="card"]');

    cards.forEach(card => {
        const provider = card.querySelector('img')?.alt;
        const title = card.querySelector('[data-slot="card-title"]')?.getAttribute('aria-label')?.replace('Heading: ', '') || card.querySelector('[data-slot="card-title"]')?.innerText;
        const description = card.querySelector('[data-slot="card-description"]')?.getAttribute('aria-label')?.replace('Description: ', '') || card.querySelector('[data-slot="card-description"]')?.innerText;
        const price = card.querySelector('[aria-label^="Cost: "]')?.getAttribute('aria-label')?.replace('Cost: ', '');
        const period = card.querySelector('[aria-label^="Cost period: "]')?.getAttribute('aria-label')?.replace('Cost period: ', '');
        
        const features = Array.from(card.querySelectorAll('[aria-label^="Features: "]')).map(el => el.getAttribute('aria-label').replace('Features: ', ''));
        const terms = Array.from(card.querySelectorAll('[aria-label^="Terms: "]')).map(el => el.getAttribute('aria-label').replace('Terms: ', ''));
        const extra = Array.from(card.querySelectorAll('[aria-label^="EV onlys: "]')).map(el => el.getAttribute('aria-label').replace('EV onlys: ', ''));

        plans.push({
            provider,
            title,
            description,
            price,
            period,
            features,
            terms,
            extra: extra.length > 0 ? extra : undefined,
            pricingDetails: []
        });
    });

    // Detailed pricing from scripts
    const html = document.documentElement.innerHTML;
    const cleanHtml = html.replace(/\\"/g, '"').replace(/\\n/g, '\n');
    const pricingBlocks = [];
    const blockRegex = /Tariffs and discounts.*?Estimated cost.*?(\$\$?[0-9.]+)/gs;
    let blockMatch;
    while ((blockMatch = blockRegex.exec(cleanHtml)) !== null) {
        const blockText = blockMatch[0];
        const estimatedTotal = blockMatch[1].replace('$$', '$');
        const rates = [];
        const rateRegex = /"children":\["([^"]+)"[^\]]*\].*?"(-?\$?\$[0-9.]+)"/gs;
        let rateMatch;
        while ((rateMatch = rateRegex.exec(blockText)) !== null) {
            const label = rateMatch[1].replace(/\\u0026/g, '&');
            const rate = rateMatch[2].replace('$$', '$');
            if (!['Estimated cost', 'Plan features', 'Plan term', 'Standard', 'Time-of-use'].includes(label)) {
                rates.push({ label, rate });
            }
        }
        pricingBlocks.push({ total: estimatedTotal, rates });
    }

    plans.forEach(plan => {
        if (!plan.price) return;
        const planPriceNum = parseInt(plan.price.replace('$', ''));
        const matchedBlock = pricingBlocks.find(block => parseInt(block.total.replace('$', '')) === planPriceNum);
        if (matchedBlock) {
            plan.pricingDetails = matchedBlock.rates;
            plan.exactTotal = matchedBlock.total;
        }
    });

    console.log(`Found ${plans.length} plans.`);
    console.table(plans);
    console.log(JSON.stringify(plans, null, 2));
    
    if (plans.length > 0) {
        alert(`Extracted ${plans.length} plans with pricing details! Check the console.`);
    } else {
        alert("No plans found on this page.");
    }
})();
