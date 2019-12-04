# Writing Shims to the dweb-transports library

Third version: Mitra 23 Nov 2019

Our intention with the dweb-transports and dweb-archive libraries is to be available for integrating with any decentralized platform (what we call a transport), 
and this guide is intended to help the process.

In our experience the process of adding a transport to a platform is pretty easy
**when** we collaborate with someone intimately familiar with the platform.
So feel free to ask questions in the 
[dweb-transports](https://github.com/internetarchive/dweb-transports/issues) repo,
and to reach out to [Mitra Ardron](mitra@archive.org) for assistance. 

If you are working on integration, please add a comment to
[dweb-transports issue#10](https://github.com/internetarchive/dweb-transports/issues/10)

If you just want to use dweb-transports as a transport independent layer between an app and your platform, then 
writing a shim should be all that is required. 

If you want to integrate Internet Archive content, then you'll also need a Hijacker, 
or you could write a proxy and skip writing this shim.

Integrating into the [dweb-transports](https://github.com/internetarchive/dweb-transports) repo, 
 mostly involves writing a file with a name like TransportXYZ.js 
and integrating in a couple of places. This can be done entirely by a third party,
though it will work smoother with collaboration with Mitra. 

## Building TransportXYZ.js

The main code sits in a file named something like TransportXYZ.js. 

In this file are implementations of:
* Chunks - storing and retrieving opaque data as a chunk or via a stream.
* KeyValues - setting and getting the value of a key in a table. 
* Lists - append only logs.

To make Archive content available, only the Chunk reading and writing is required,
though GUN uses KeyValues for storing/retrieving metadata json. 

See [API.md](./API.md) and the existing code examples for detailed function by function documentation. 

### Error handling
One common problem with decentralized platforms is reliability.  
We handle this by falling back from one platform to another,
e.g. if IPFS fails we can try WEBTORRENT or HTTP. 
But this only works if the Transports.js layer can detect when a failure has occurred. 
This means it is really important to return an error (via a throw, promise rejection, or callback) if the retrieval
is going to fail, IPFS doesn't currently do this which makes it an unreliable transport.

### Promises or callbacks
We've tried to suport both promises and callbacks, though this isn't complete yet.  
In general it will work best if each outward facing function supports a `cb(err, res)` parameter,
and where this is absent, a Promise is returned that will `resolve` to `res` or `reject` with `err`.

The `p_foo()` naming convention was previously used to indicate which functions returned a Promise 
and is gradually being phased out. 

## Integration other than TransportXYZ.js

Searching dweb-transports for `SEE-OTHER-ADDTRANSPORT` should find any places in the code where a tweak is
required to add a new transport. 

The current (but possibly out of date) list of places to integrate includes:

* [index.js](./index.js): needs to require the new TransportXYZ
* [package.json/dependencies](./package.json#L13): Should specify which version range of a transport to include
* [API.md](./API.md): Has overview documentation
* [Transports.js](./Transports.js#L78): Add a function like: http(), gun() etc: allow finding loaded transports (for example can be used by one transport to find another).
* [Transports.js/p_connect](./Transports.js#L625): Add to list so it connects by default at startup
* [dweb-archive/Util.config](https://github.com/internetarchive/dweb-archive/blob/master/Util.js#L135)

## Run time code loading

Because the repo was getting too large when all the transports were included, we've moved to a lazy system. 
In the bottom of each TransportXYZ file you'll see lines like 
```
TransportWOLK.scripts = ["https://raw.githubusercontent.com/wolkdb/wolkjs/dev/lib/wolk-browserify.js"];
TransportWOLK.requires = 'wolkjs';
```
or
```
TransportGUN.requires =  TransportGUN.scripts = ['gun/gun.js', 'gun/lib/path.js', 'gun/lib/radix.js',
    'gun/lib/radisk.js', 'gun/lib/store.js', 'gun/lib/rindexed.js'];
```
When used from the browser, the code will write <script> tags into the page that
retrieve a webpacked file. That file should set for example `window.WOLK` so that your shim 
can find your code.  

When used by node, it will do a dynamic "require" to fetch from one of the CDNs.

DO NOT require your libraries at the top of the shim, as this makes everyone dependent on your library.

### Partial implementation.

Its perfectly legitimate to only implement the parts of the API that the underlying platform implements, 
though it will work better if the others are implemented as well, 
for example:
* a list can be implemented on top of a KeyValue system by adding a new item with a key being a timestamp.
* key-value can be implemented on top of lists, by appending a {key: value} data structure, and filtering on retrieval.

**monitor** and **listmonitor** will only work if the underlying system supports them,
and its perfectly reasonable not to implement them. 
They aren't currently used by the dweb-archive / dweb.archive.org code.

Make sure that `TransportXYZ.js` `constructor()` correctly covers what functions are implemented in the
`.supportFunctions` field. 
This field is used by Transports to see which transports to try for which functionality.

For example if "store" is listed in TransportXYZ.supportFunctions,
then a call to Transports.p_rawstore() will attempt to store using XYZ, 
and add whatever URL `TransportXYZ.p_rawstore()` returns to the array of URLs where the content is stored. 

## Installation for testing

Once you've built and tested it, please ask Mitra to create a branch in dweb-transports, 
and submit a pull request for it. 


