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
* to allow Internet Archive content to be made available decentralized.

### Installation for developers in node / yarn

In your app's package.json file, add
```
"@internetarchive/dweb-transports": "latest",
```
then
`yarn install` 

### Installation for developers on browsers.
* Install node and npm or yarn
* Clone this repo and cd to it.
* `webpack --mode producton` will create dist/dweb_transports_bundle.js
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
### To develop on dweb-transports
Clone this repo from [github](https://github.com/@internetarchive/dweb-transports). 
`yarn install` 
Should pick up the dependencies. 

* See [WRITINGSHIMS.md](./WRITINGSHIMS.md) to add your transport to the library.
* Or [ARCHIVEINTEGRATION.md](./ARCHIVEINTEGRATION.md) 
  for allowing your transport to support Internet Archive content

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
(requirement to rebroadcast every 24 hours so not persistent; merkle tree so change at leaf changes top level; doesnt work in JS-IPFS;) 
We implemented naming outside of IPFS (in Naming.js) to get it to work. 

To install IPFS for Node (and this needs testing)
```
yarn add ipfs ipfs-http-client
```
This will get overridden by an update of dweb-mirror, so its probably you will want
this as a dependency of whatever is using dweb-transports instead.

To use IPFS pass "IPFS" in during the "connect" step

### Implementation on WebTorrent
WebTorrent implements the BitTorrent protocol in the browser. It will work for retrieval of objects and currently has the fastest/most-reliable stream interface.

We also have a modified Seeder/Tracker which are currently (Sept2018) in testing on our gateway.

To install WebTorrent for Node (and this needs testing)
```
yarn add webtorrent
```
This will get overridden by an update of dweb-mirror, so its probably you will want
this as a dependency of whatever is using dweb-transports instead.

To use WebTorrent pass "WEBTORRENT" in during the "connect" step

### Implementation on YJS (TransportYJS.js)

YJS implements a decentralized database over a number of transports including IPFS. It supports several modes of which we only use “Arrays” to implement append-only logs and "Map" to implement key-value tables. 

There is no authentication built into YJS but If using via the higher level CommonList (CL) object, 
the authentication isnt required since the CL will validate anything sent. 

To install YJS for Node (and this needs testing)
```
yarn add yjs
```
This will get overridden by an update of dweb-mirror, so its probably you will want
this as a dependency of whatever is using dweb-transports instead.

To use YJS pass "YJS" in during the "connect" step

### Implementation on GUN

GUN implements a decentralized database and we have mostly migrated to it (from YJS) because there is some support and an active team.

Our tables and Lists are mapped as JSON objects inside GUN nodes due to some limitations in GUN's architecture for multi-level objects. 

Still (as of Sept2018) working on Authentiction, and some reliability/bug issues.

To install GUN for Node (and this needs testing)
```
yarn add gun
```
This will get overridden by an update of dweb-mirror, so its probably you will want
this as a dependency of whatever is using dweb-transports instead.

To use GUN pass "GUN" in during the "connect" step

### Implementation on WOLK

WOLK has implemented and maintain there own shim which is part of dweb-transports

To install WOLK for Node (and this needs testing)
```
yarn add "git://github.com/wolkdb/wolkjs.git#master"
```
This will get overridden by an update of dweb-mirror, so its probably you will want
this as a dependency of whatever is using dweb-transports instead.

To use WOLK pass "WOLK" in during the "connect" step

### Implementation on FLUENCE

FLUENCE has implemented and maintain there own shim which is part of dweb-transports

To install FLUENCE for Node (and this needs testing)
```
yarn add fluence
```
This will get overridden by an update of dweb-mirror, so its probably you will want
this as a dependency of whatever is using dweb-transports instead.

To use FLUENCE pass "FLUENCE" in during the "connect" step

### Implementation of ContentHash 

We have a simple Contenthash store/fetch that supports lists and key-value databases, 
and knows about retrieving content by sha1 hash from the Archive

No installation is required - it builds on the HTTP transport

To use, pass "HASH" in during the "connect" step

### See also

See [example_block.html](./example_block.html) for an example of connecting, storing and retrieving.

See [API.md](./API.md) for the detailed API.

See [Dweb document index](./DOCUMENTINDEX.md) for a list of the repos that make up the Internet Archive's Dweb project, and an index of other documents. 

### Release Notes

* 0.2.11: Major naming refactor
* 0.2.10: Naming debugging for dweb.archive.org
* 0.2.9: Major naming refactor
* 0.2.8: Better HTTP error handling
* 0.2.7: Hack to handle URL rewrite issue see https://github.com/internetarchive/dweb-mirror/issues/272
* 0.2.6: Move require of wrtc into TransportWEBTORRENT
* 0.2.5: Remove dependencies on ipfs-http-client and wolkjs which need separate installation now, update README to clarify
* 0.2.4: Lighter Fluence transport and Wolk scripting issue
* 0.2.3: Add Fluence transport, split HASH (contenthash) out of HTTP
* 0.2.2: Add Wolk, YJS, and add function for node loading
* 0.2.1: Move script loading into Transports
* 0.2.0: Start moving transport dependencies to consumer, specifically IPFS, GUN, WebTorrent
------
* 0.1.63: Move naming internal
* 0.1.62: Upgrade dependencies
* 0.1.61: loopguard to return correct error from queuedFetch; add info to statuses 
* 0.1.60: Back on master release of webtorrent
* 0.1.59: Add DwebTransports.statuses synchronous API
* 0.1.58: Upgrade GUN and IPFS to v0.35.0 (0.36 breaks webpack as currently configured)
* 0.1.57: Fix heartbeat timer stopping
* 0.1.56: tweak http queue; changes to stop, status, info to support heartbeat on HTTP
* 0.1.55: tweaking queue concurrency
* 0.1.54: queue for http; disable fallback from IPFS to http://ipfs.io
* 0.1.53: Reenable Wolk as fixed
* 0.1.52: Gun fixes but off by default https://github.com/internetarchive/dweb-archive/issues/106
* 0.1.51: Temporary fix to GUN failures by adding wait:2000
* 0.1.50: Update to GUN's new bizarre version numbering. 
* 0.1.49: Disable WOLK - currently failing
* 0.1.48: Support for noCache
* 0.1.47: Update dependencies (see yarn.lock)
* 0.1.46: Correctly recognize /arc/archive.org urls
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
