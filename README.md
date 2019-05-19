# DwebTransports
General transport library for Decentralized Web handles multiple underlying transports.

## Background
This library is part of a general project at the Internet Archive (archive.org) 
to support the decentralized web.

### Goals
* to allow a single API that can be used for most basic interactions with 
decentralized transports. 
* to support multiple URLs, on different transports, so that the (current) underlying unreliability
 is hidden. 

### Node Installation
* Clone this repo. 
* Until this is in npm, add the line
`"@internetarchive/dweb-transports.git": "latest",`
to your package.json file in the dependencies section. 
* `npm install @internetarchive/dweb-transports`  will install the dependencies including IPFS & WebTorrent

`const DwebTransports = require("@internetarchive/dweb-transports")` will add all Transports to a Javascript file.
* TODO-API writeup how to require only some of the transports.
* Then see usage API below

### Installation and usage in the Browser
* Install npm & node
* Clone this repo and cd to it.
* `npm run build` will create dist/dweb_transports_bundle.js
* Add `<SCRIPT type="text/javascript" src="dweb_transports_bundle.js"></SCRIPT>` to your `<HEAD>`

Then code like this should work. 

```
async function main(url) {
    try {
        // and if not found will use the defaulttransports specified here.
        await DwebTransports.p_connect({
            statuselement: document.getElementById("statuselement"),    // Where to build status indicator
            defaulttransports: ["HTTP","IPFS"],                         // Default transports if not specified
            transports: searchparams.getAll("transport")    // Allow override default from URL parameters
        });
        // Any code you want to run after connected to transports goes here.
    } catch(err) {
        console.log("App Error:", err);
        alert(err.message);
    }
}
var searchparams = new URL(window.location.href).searchParams;
```
## Notes on implemntation

### Implementation on HTTP (TransportHTTP.js)
The HTTP interface is pretty simple, a standard extensible gateway (dweb-gateway) we wrote is used. 

fetch is a straightforward HTTP GET to a URL that includes the multihash
store is a POST to the same URL 

Lists are implemented via append-only files on the HTTP server using URLs that contain the same hashes. 
“Add” appends to this file, “list” retrieves the file. 

Listmonitor isn’t supported, and can’t really be as there is no open channel to the client. 

### Implementation on IPFS (TransportIPFS.js)

This section will only make sense if you understand something about IPFS.

See TransportIPFS.js in the repository for details for code. 

IPFS has two Javascript versions, both of which currently implement only a subset of IPFS (JS-IPFS is missing IPNS, and JS-IPFS-API is missing pubsub).
We are mostly using JS-IPFS because JS-IPFS-API creates a centralisation point of failure at a known HTTP host, 
and because JS-IPFS-API has issues connecting to a local IPFS peer because of some odd security choices by IPFS.

IPFS is initialized via creating a IPFS object with a configuration. We use the Websockets connctor since the alternative, but its got a single point of failure. WebRTC is an alternative but is seriously broken (crashes both chrome and firefox)

Blocks are stored and retrieved via ipfs.files.get and ipfs.files.add. 

For lists and tables - see YJS which uses IPFS.

#### Issues with IPFS

Error feedback is a little fuzzy.

There are issues with IPFS swarms that we haven’t been able to figure out about how to ensure that “put”ting to IPFS creates an object that can be read at all other browsers, and persists. See DT issue#2

Naming hasn’t been implemented in IPFS yet, partly because IPNS is not available in the JS-IPFS, and partly because IPNS has serious problems: 
(requirement to rebroadcast every 24 house so not persistent; merkle tree so change at leaf changes top level; doesnt work in JS-IPFS;) We implemented naming outside of IPFS (in Domain.js) to get it to work. 

#### Implementation on WebTorrent
WebTorrent implements the BitTorrent protocol in the browser. It will work for retrieval of objects and currently has the fastest/most-reliable stream interface.

We also have a modified Seeder/Tracker which are currently (Sept2018) in testing on our gateway.

#### Implementation on YJS (TransportYJS.js)

YJS implements a decentralized database over a number of transports including IPFS. It supports several modes of which we only use “Arrays” to implement append-only logs and "Map" to implement key-value tables. 

There is no authentication built into YJS but If using via the higher level CommonList (CL) object, 
the authentication isnt required since the CL will validate anything sent. 

#### Implementation on GUN

GUN implements a decentralized database and we have mostly migrated to it (from YJS) because there is some support and an active team.

Our tables and Lists are mapped as JSON objects inside GUN nodes due to some limitations in GUN's architecture for multi-level objects. 

Still (as of Sept2018) working on Authentiction, and some reliability/bug issues.

#### Implementation on OrbitDB
OrbitDB is similar to YJS, but adds an authentication layer, which is particularly useful if using the rawlist/rawadd interface rather than the higher level CommonList. 

This was in the process of being implemented, but was stopped because they weren't responsive to problems we hit. 

#### Implementation on DAT

DAT has some interesting different choices from IPFS (The IPFS team forked out of DAT). In particular it allow for large sparse arrays such as used for scientific data, and is more focused on making mutable data work well, while IPFS focuses on immutable. 

We didn't implement it initially because its not supported in browsers, but are planning (as of Sept 2018) to implement in dweb-transorts for use in dweb-mirror.

### See also

See [example_block.html](./example_block.html) for an example of connecting, storing and retrieving.

See [API.md](./API.md) for the detailed API.

See [Dweb document index](./DOCUMENTINDEX.md) for a list of the repos that make up the Internet Archive's Dweb project, and an index of other documents. 

### Release Notes

* 0.1.45: Fix mergeoptions and update ipfs cache id
* 0.1.44: hooks to allow react-based UI in dweb-archive (via IAUX)
* 0.1.43: Add WebTorrent seeding
* 0.1.42: Better behavior when cant see gateway
* 0.1.41: Remove createReadStream for browser (it was added for node in 0.1.40), add fetch(url,opts,cb)
* 0.1.40: Bug fix in httpfetch({count=0}),
* 0.1.40: Added support for "seed" and tested in IPFS
* 0.1.40: WOLK - moved to their production sys and master branch
* 0.1.39: WOLK - updated wolk.js module to fix bugs
* 0.1.38: httptools - adds retries
* 0.1.38: WOLK - added to the library
* 0.1.37: IPFS - dont stop it if we didnt start it (were stopping via API)
* 0.1.37: Start move to unpromisify pattern v5
* 0.1.37: IPFS - updated to (significant) v0.34.0 API changes
* 0.1.36: Made httptools accessable at Transports.httptools so it doesnt have to be separately 'require'd
* 0.1.35: package update (note wont work with latest versions of yjs or uglify)
* 0.1.33: Bug fixes; support for gatewayUrls (for dweb-mirror)
