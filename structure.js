const fs = require('fs');

function parseRate(rateStr) {
    if (!rateStr) return 0;
    return parseFloat(rateStr.replace(/[$\s]/g, ''));
}

const DAYS_ENUM = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

function expandDays(text) {
    const t = text.toLowerCase();
    if (t.includes('weekdays') || t.includes('monday to friday')) {
        return ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
    }
    if (t.includes('weekends') || t.includes('saturday & sunday')) {
        return ['SATURDAY', 'SUNDAY'];
    }
    if (t.includes('every night') || t.includes('all day') || t.includes('anytime')) {
        return DAYS_ENUM;
    }
    const result = [];
    if (t.includes('monday')) result.push('MONDAY');
    if (t.includes('tuesday')) result.push('TUESDAY');
    if (t.includes('wednesday')) result.push('WEDNESDAY');
    if (t.includes('thursday')) result.push('THURSDAY');
    if (t.includes('friday')) result.push('FRIDAY');
    if (t.includes('saturday')) result.push('SATURDAY');
    if (t.includes('sunday')) result.push('SUNDAY');
    
    return result.length > 0 ? result : DAYS_ENUM;
}

function to24h(hour, ampm, isEnd) {
    if (hour === 'midnight' || ampm === 'midnight') return isEnd ? '24:00' : '00:00';
    if (!hour) return null;
    let h = parseInt(hour, 10);
    if (ampm === 'pm' && h < 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    if (isEnd && h === 0) return '24:00';
    return h.toString().padStart(2, '0') + ':00';
}

function parseTimePeriods(label, description) {
    const periods = [];
    const normalized = label.toLowerCase();
    const desc = (description || '').toLowerCase();

    // 1. Check for Octopus-style detailed labels: "Peak (weekdays 7am-11am, 5pm-9pm)"
    const detailMatch = label.match(/\((.*?)\)/);
    if (detailMatch) {
        const content = detailMatch[1];
        const segments = content.split(/,\s*/);
        let currentDays = DAYS_ENUM;

        for (const segment of segments) {
            const daysMatch = segment.match(/(weekdays|weekends|monday|tuesday|wednesday|thursday|friday|saturday|sunday|monday to friday|saturday & sunday)/gi);
            if (daysMatch) {
                currentDays = expandDays(daysMatch[0]);
            }
            const timeMatches = segment.matchAll(/(?:(\d+)(am|pm)|(midnight))\s*-\s*(?:(\d+)(am|pm)|(midnight))/gi);
            let foundTime = false;
            for (const tm of timeMatches) {
                periods.push({
                    startTime: to24h(tm[1], tm[2]),
                    endTime: to24h(tm[4], tm[5], true),
                    days: currentDays
                });
                foundTime = true;
            }
        }
    }

    // 2. Check for common time ranges in label: "7am - 9pm" or "9pm - midnight"
    if (periods.length === 0) {
        const timeMatch = label.match(/(?:(\d+)(am|pm)|(midnight))\s*-\s*(?:(\d+)(am|pm)|(midnight))/i);
        if (timeMatch) {
            periods.push({
                startTime: to24h(timeMatch[1], timeMatch[2] || timeMatch[3]),
                endTime: to24h(timeMatch[4], timeMatch[5] || timeMatch[6], true),
                days: expandDays(label + ' ' + desc)
            });
        }
    }

    // 3. Fallback to description for specific types
    if (periods.length === 0) {
        if (normalized.includes('night') && (desc.includes('9pm–7am') || desc.includes('9pm-7am') || desc.includes('overnight'))) {
             periods.push({ startTime: '21:00', endTime: '07:00', days: DAYS_ENUM });
        } else if (normalized.includes('day') && !normalized.includes('daily') && (desc.includes('7am–9pm') || desc.includes('7am-9pm'))) {
             periods.push({ startTime: '07:00', endTime: '21:00', days: DAYS_ENUM });
        } else if (normalized.includes('flat') || normalized.includes('inclusive') || normalized.includes('economy 24') || normalized.includes('variable')) {
             periods.push({ startTime: '00:00', endTime: '24:00', days: DAYS_ENUM, note: 'All Day' });
        }
    }

    return periods;
}

function structurePlans(plans) {
    return plans.map(plan => {
        const result = {
            provider: plan.provider,
            planName: plan.title,
            description: plan.description,
            features: plan.features,
            dailyCharge: null,
            usageRates: [],
            solarRates: [],
            incentives: [],
            otherCharges: []
        };

        plan.pricingDetails.forEach(detail => {
            const label = detail.label;
            const rate = parseRate(detail.rate);
            const normalizedLabel = label.toLowerCase();

            // 1. Daily Charges
            if (normalizedLabel.includes('daily') || normalizedLabel === 'fixed') {
                result.dailyCharge = { amount: rate, label: label, unit: 'DAY' };
            }
            // 2. Solar Export
            else if (normalizedLabel.includes('solar') || normalizedLabel.includes('export') || normalizedLabel.includes('generation') || normalizedLabel.includes('homegen')) {
                result.solarRates.push({
                    label: label,
                    price: rate,
                    unit: 'KWH',
                    timePeriods: parseTimePeriods(label, plan.description)
                });
            }
            // 3. Incentives / Free stuff
            else if (normalizedLabel.includes('free') || normalizedLabel.includes('credit')) {
                result.incentives.push({
                    label: label,
                    price: rate,
                    unit: 'KWH',
                    timePeriods: parseTimePeriods(label, plan.description)
                });
            }
            // 4. Usage Rates
            else {
                // If it's a known levy, put in other charges
                if (normalizedLabel.includes('levy')) {
                    result.otherCharges.push({ label: label, amount: rate, unit: 'KWH' });
                } else {
                    result.usageRates.push({
                        label: label,
                        price: rate,
                        unit: 'KWH',
                        timePeriods: parseTimePeriods(label, plan.description)
                    });
                }
            }
        });

        return result;
    });
}

try {
    const rawData = fs.readFileSync('plans.json', 'utf8');
    const plans = JSON.parse(rawData);
    const structuredPlans = structurePlans(plans);
    
    fs.writeFileSync('structured_plans.json', JSON.stringify(structuredPlans, null, 2));
    console.log(`Successfully structured ${structuredPlans.length} plans into structured_plans.json`);
    
    // Summary of TOU definitions found
    const touPlans = structuredPlans.filter(p => p.usageRates.some(r => r.timePeriods.length > 0));
    console.log(`Identified TOU definitions for ${touPlans.length} plans.`);
    
    // Sample check
    const moveMaster = structuredPlans.find(p => p.planName === 'MoveMaster');
    if (moveMaster) {
        console.log('\nMoveMaster Sample (TOU):');
        console.log(JSON.stringify(moveMaster, null, 2));
    }
} catch (err) {
    console.error('Error processing plans:', err.message);
}
