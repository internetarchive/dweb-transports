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
* `npm bundle` will create dist/dweb_transports_bundle.js
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

See [example_block.html](./example_block.html) for an example of connecting, storing and retrieving.

See [API.md](./API.md) for the detailed API.

See [Dweb document index](./DOCUMENTINDEX.md) for a list of the repos that make up the Internet Archive's Dweb project, and an index of other documents. 