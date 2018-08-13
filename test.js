const DwebTransports = require('./index.js');

async function p_test({transport=["GUN"]}={}) {
    if (Array.isArray(transport)) {
        for (tname of transport) {
            await p_test({ transport: tname});   // Note this is going to run in parallel
        }
    } else {
        let tclass = DwebTransports._transportclasses[transport];
        await tclass.p_test();
    }
}
p_test();