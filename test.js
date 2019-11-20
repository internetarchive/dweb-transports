const DwebTransports = require('./index.js');

async function p_test({transport=["GUN"]}={}) {
    if (Array.isArray(transport)) {
        for (tname of transport) {
            await p_test({transport: tname});   // Note this is going to run in parallel
        }
    } else {
        let tclass = DwebTransports._transportclasses[transport];
        await tclass.p_test();
    }
}
async function test_transports() {
    console.log("Transports.test")
    try {
        /* Could convert this - copied fom YJS to do a test at the "Transports" level
        let testurl = "yjs:/yjs/THISATEST";  // Just a predictable number can work with
        let res = await transport.p_rawlist(testurl);
        let listlen = res.length;   // Holds length of list run intermediate
        console.log("rawlist returned ", ...utils.consolearr(res));
        transport.listmonitor(testurl, (obj) => console.log("Monitored", obj));
        let sig = new Dweb.Signature({urls: ["123"], date: new Date(Date.now()), signature: "Joe Smith", signedby: [testurl]});
        await transport.p_rawadd(testurl, sig);
        console.log("TransportIPFS.p_rawadd returned ");
        res = await transport.p_rawlist(testurl);
        console.log("rawlist returned ", ...utils.consolearr(res)); // Note not showing return
        await delay(500);
        res = await transport.p_rawlist(testurl);
        console.assert(res.length === listlen + 1, "Should have added one item");
        */
        //console.log("TransportYJS test complete");
        /* TODO-KEYVALUE reenable these tests,s but catch http examples
        let db = await this.p_newdatabase("TESTNOTREALLYAKEY");    // { privateurls, publicurls }
        console.assert(db.privateurls[0] === "yjs:/yjs/TESTNOTREALLYAKEY");
        let table = await this.p_newtable("TESTNOTREALLYAKEY","TESTTABLE");         // { privateurls, publicurls }
        let mapurls = table.publicurls;
        console.assert(mapurls[0] === "yjs:/yjs/TESTNOTREALLYAKEY/TESTTABLE");
        await this.p_set(mapurls, "testkey", "testvalue");
        let res = await this.p_get(mapurls, "testkey");
        console.assert(res === "testvalue");
        await this.p_set(mapurls, "testkey2", {foo: "bar"});
        res = await this.p_get(mapurls, "testkey2");
        console.assert(res.foo === "bar");
        await this.p_set(mapurls, "testkey3", [1,2,3]);
        res = await this.p_get(mapurls, "testkey3");
        console.assert(res[1] === 2);
        res = await this.p_keys(mapurls);
        console.assert(res.length === 3 && res.includes("testkey3"));
        res = await this.p_getall(mapurls);
        console.assert(res.testkey2.foo === "bar");
        */

    } catch(err) {
        console.log("Exception thrown in Transports.test:", err.message);
        throw err;
    }
}

function canonicalNameTests() {
    // Test the regexps
    [   // Each test shows the URL and the expected return of protocol and internal string, it doesnt test failing cases
        ["https://dweb.me/ipfs/internal", "ipfs", "internal"],
        ["https://dweb.ipfs.foo.bar/internal", "ipfs", "internal"],
        ["dweb://ipfs/internal", "ipfs", "internal"],
        ["ipfs://internal", "ipfs", "internal"],
        ["gun://ipfs/internal", "ipfs", "internal"],
        ["/ipfs/internal", "ipfs", "internal"],
        ["/dweb/ipfs/internal", "ipfs", "internal"],
        [   "magnet:?xt=urn:btih:465HQWPEN374LABVHUBUPBUX4WZU6HDS&tr=http%3A%2F%2Fbt1.archive.org%3A6969%2Fannounce&tr=http%3A%2F%2Fbt2.archive.org%3A6969%2Fannounce&tr=wss%3A%2F%2Fdweb.archive.org%3A6969&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.fastcast.nz&ws=https%3A%2F%2Fdweb.me%2Farc%2Farchive.org%2Fdownload%2F&xs=https%3A%2F%2Fdweb.me%2Farc%2Farchive.org%2Ftorrent%2Ffav-mitra/fav-mitra_members.json",
          "magnet","?xt=urn:btih:465HQWPEN374LABVHUBUPBUX4WZU6HDS&tr=http%3A%2F%2Fbt1.archive.org%3A6969%2Fannounce&tr=http%3A%2F%2Fbt2.archive.org%3A6969%2Fannounce&tr=wss%3A%2F%2Fdweb.archive.org%3A6969&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.fastcast.nz&ws=https%3A%2F%2Fdweb.me%2Farc%2Farchive.org%2Fdownload%2F&xs=https%3A%2F%2Fdweb.me%2Farc%2Farchive.org%2Ftorrent%2Ffav-mitra/fav-mitra_members.json"],
        ["http://dweb.dom.ain/internal", "arc", "dom.ain/internal"],
        ["http://localhost:123/archive.org/internal", "arc", "archive.org/internal"],
        ["https://dweb.arc.dom.ain/internal", "arc", "dom.ain/internal"],
        ["https://foo.bar/baz/splat", "https", "foo.bar/baz/splat"]
    ].forEach((t) => {
        console.log(t[0])
        let res = DwebTransports.canonicalName(t[0]);
        if (!(res && res["proto"] === t[1] && res["internal"] === t[2])) {
            console.log("ERROR", t, res);
        }
    })
}

/*
p_test({transport: ["GUN"])
.then(() => test_transports);
*/

/*
// Intentionally testing this with no connection
const sampleMagnetURL = "magnet:?xt=urn:btih:465HQWPEN374LABVHUBUPBUX4WZU6HDS&tr=http%3A%2F%2Fbt1.archive.org%3A6969%2Fannounce&tr=http%3A%2F%2Fbt2.archive.org%3A6969%2Fannounce&tr=wss%3A%2F%2Fdweb.archive.org%3A6969&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.fastcast.nz&ws=https%3A%2F%2Fdweb.me%2Farc%2Farchive.org%2Fdownload%2F&xs=https%3A%2F%2Fdweb.me%2Farc%2Farchive.org%2Ftorrent%2Ffav-mitra/fav-mitra_members.json";
const sampleMagnetURLMirrorresolve = "http://localhost:4244/magnet/?xt=urn:btih:465HQWPEN374LABVHUBUPBUX4WZU6HDS&tr=http%3A%2F%2Fbt1.archive.org%3A6969%2Fannounce&tr=http%3A%2F%2Fbt2.archive.org%3A6969%2Fannounce&tr=wss%3A%2F%2Fdweb.archive.org%3A6969&tr=wss%3A%2F%2Ftracker.btorrent.xyz&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&tr=wss%3A%2F%2Ftracker.fastcast.nz&ws=https%3A%2F%2Fdweb.me%2Farc%2Farchive.org%2Fdownload%2F&xs=https%3A%2F%2Fdweb.me%2Farc%2Farchive.org%2Ftorrent%2Ffav-mitra/fav-mitra_members.json"
const sampleGatewayURL = "http://dweb.archive.org/download/foo/bar";
const sampleHttpURL = "http://somewhere.com/zzz/xxx/download/foo/bar";  // XXX Looks like this is handled wrong
const sampleGatewayURLMirrorResolve = "http://localhost:4244/download/foo/bar";
let tests = [
    {u: sampleMagnetURL, cn_proto:"magnet", gw: sampleMagnetURLMirrorresolve, resolve:sampleMagnetURL, resolveM: sampleMagnetURLMirrorresolve},
    {u: sampleGatewayURL, cn_proto: "arc", gw: sampleGatewayURLMirrorResolve, resolve: sampleGatewayURL, resolveM: sampleGatewayURLMirrorResolve},
    //FAILS ! {u: sampleHttpURL, cn_proto: "http", gw: sampleHttpURL, resolve: sampleHttpURL, resolveM: sampleHttpURL}
    ]
tests.forEach(t => {
    let url = t.u;
    let res = DwebTransports.canonicalName(url).proto; console.assert( res=== t.cn_proto, "Canonical fail",url, t.cn_proto, "!==", res);
    DwebTransports.mirror = undefined;
    res = DwebTransports.p_resolveNames([url]).then(res => console.assert(res[0] === t.resolve, "Resolve", url, t.resolve, "!==", res ))
    DwebTransports.mirror = "http://localhost:4244";
    res = DwebTransports.gatewayUrl(url); console.assert( res === t.gw, "GatewayURL:", url,  t.gw,"!==", res);
    res = DwebTransports.p_resolveNames([url]).then(res => console.assert(res[0] === t.resolveM, "Resolve with Mirror", url, t.resolveM, "!==", res ))
})
*/